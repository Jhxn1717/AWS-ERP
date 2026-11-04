"""Administrator-only, snapshot-checked reset for hosted and local workspaces."""
import hashlib
import json
from typing import Literal
from fastapi import HTTPException,Request
from pydantic import BaseModel,Field,SecretStr
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from .models import User
from .security import password_matches

RESET_KINDS=('payments','movements','sales','purchases','quotes','customers','suppliers','documents')
TABLES='records, products, contacts, orders, order_lines, payments, inventory_movements'

class ResetIn(BaseModel):
    confirmation:Literal['BORRAR DATOS']
    snapshot:str=Field(pattern=r'^[0-9a-f]{64}$')
    backupDownloaded:Literal[True]
    password:SecretStr=Field(min_length=1,max_length=200)

def register_workspace_reset(app,engine,Record,Product,audit,now,serialize):
    def admin(request):
        if request.state.user['role']!='Administrador': raise HTTPException(403,'Solo el administrador puede reiniciar los datos.')

    def lock(session):
        if engine.dialect.name=='postgresql':
            session.connection().exec_driver_sql("SET LOCAL lock_timeout = '5s'")
            session.connection().exec_driver_sql('LOCK TABLE '+TABLES+' IN EXCLUSIVE MODE')
        elif engine.dialect.name=='sqlite':
            session.connection().exec_driver_sql('BEGIN IMMEDIATE')
        else: raise HTTPException(409,'El reinicio no está disponible para esta base de datos.')

    def snapshot(session):
        data={kind:[serialize(row) for row in session.scalars(select(Record).where(Record.kind==kind).order_by(Record.id))] for kind in RESET_KINDS}
        data['products']=[serialize(row) for row in session.scalars(select(Product).order_by(Product.id))]
        content=json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':'))
        if len(content.encode('utf-8'))>3*1024*1024: raise HTTPException(409,'El volumen de datos requiere un respaldo completo de la base antes del reinicio. Contacta al administrador del despliegue.')
        return data,hashlib.sha256(content.encode('utf-8')).hexdigest()

    @app.get('/api/v1/admin/data/reset-preview')
    def preview(request:Request):
        admin(request)
        try:
            with Session(engine) as session,session.begin():
                lock(session);data,digest=snapshot(session)
                return {'snapshot':digest,'counts':{key:len(rows) for key,rows in data.items()},'backup':{'format':'erp-business-backup-v1','exportedAt':now(),'data':data,'snapshot':digest}}
        except OperationalError: raise HTTPException(409,'Hay operaciones en curso. Intenta preparar el respaldo nuevamente.')

    @app.post('/api/v1/admin/data/reset')
    def reset(body:ResetIn,request:Request):
        admin(request)
        try:
            with Session(engine) as session,session.begin():
                lock(session)
                user=session.get(User,request.state.user['id'])
                if not user or user.status!='Activo' or user.role!='Administrador':
                    raise HTTPException(403,'Solo un administrador activo puede vaciar los datos.')
                if not password_matches(body.password.get_secret_value(),user.password):
                    raise HTTPException(403,'La contraseña de tu cuenta de Nix es incorrecta. No se borraron datos.')
                data,digest=snapshot(session)
                if digest!=body.snapshot: raise HTTPException(409,'Los datos cambiaron desde el respaldo. Vuelve a preparar y descargar una copia actualizada.')
                count=sum(map(len,data.values()))
                if not count: raise HTTPException(409,'Los datos comerciales ya están vacíos.')
                for kind in RESET_KINDS:
                    for row in session.scalars(select(Record).where(Record.kind==kind)):session.delete(row)
                    session.flush()
                for row in session.scalars(select(Product)):session.delete(row)
                session.flush()
                audit(session,f'Datos comerciales reiniciados: {count} registros; respaldo {digest[:12]}','Administración','REINICIO')
                return {'status':'ok','removed':count}
        except OperationalError: raise HTTPException(409,'Hay operaciones en curso. No se reiniciaron los datos; inténtalo nuevamente.')
