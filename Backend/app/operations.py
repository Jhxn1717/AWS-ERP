import os
import uuid
from pathlib import Path
from typing import Literal
from fastapi import HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response
from urllib.parse import quote
from .storage import document_storage
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .validation import FormModel
from .transfers import assembled_file, discard_parts, register_transfer_routes, PART_SIZE

class Adjustment(FormModel):
    productId: int
    quantity: int = Field(ge=-100000,le=100000,strict=True)
    reason: str = Field(min_length=5,max_length=250)

class CompanyIn(FormModel):
    name: str = Field(min_length=2,max_length=160)
    taxId: str = Field(pattern=r'^[0-9]{11}$')
    email: str = Field(min_length=5,max_length=160,pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    phone: str = Field(default='',max_length=40)
    address: str = Field(max_length=250)

def register_operations(app,engine,Record,Product,ContactIn,ProductIn,add_record,audit,now,serialize):
    storage=document_storage()
    register_transfer_routes(app, engine)

    @app.get('/api/v1/company')
    def company():
        with Session(engine) as s:
            r=s.scalar(select(Record).where(Record.kind=='company'))
            return r.data if r else {'name':'Enterprise SAC','taxId':'20100000001','email':'contacto@enterprise.local','phone':'','address':'Lima, Perú'}

    @app.put('/api/v1/company')
    def update_company(body:CompanyIn):
        with Session(engine) as s,s.begin():
            r=s.scalar(select(Record).where(Record.kind=='company'))
            if r: r.data=body.model_dump()
            else: r=add_record(s,'company',body.model_dump())
            audit(s,'Configuración de empresa actualizada','Configuración',r.id); return r.data

    @app.put('/api/v1/contacts/{kind}/{rid}')
    def edit_contact(kind:Literal['customers','suppliers'],rid:int,body:ContactIn):
        with Session(engine) as s,s.begin():
            r=s.get(Record,rid)
            if not r or r.kind!=kind: raise HTTPException(404,'Contacto no encontrado.')
            if any(x.id!=rid and x.data['taxId']==body.taxId for x in s.scalars(select(Record).where(Record.kind==kind))): raise HTTPException(409,'El RUC ya está registrado.')
            r.data={**r.data,**body.model_dump()}; audit(s,'Contacto actualizado',kind,rid); return serialize(r)

    @app.put('/api/v1/products/{pid}')
    def edit_product(pid:int,body:ProductIn):
        with Session(engine) as s,s.begin():
            p=s.scalar(select(Product).where(Product.id==pid).with_for_update())
            if not p: raise HTTPException(404,'Producto no encontrado.')
            if s.scalar(select(Product).where(Product.sku==body.sku,Product.id!=pid)): raise HTTPException(409,'El SKU ya existe.')
            if p.stock!=body.stock: raise HTTPException(409,'Usa un ajuste de inventario para modificar existencias.')
            for k,v in body.model_dump().items(): setattr(p,k,v)
            audit(s,'Producto actualizado','Inventario',pid); return serialize(p)

    @app.post('/api/v1/inventory/adjustments',status_code=201)
    def adjust(body:Adjustment):
        if not body.quantity: raise HTTPException(422,'La cantidad debe ser distinta de cero.')
        with Session(engine) as s,s.begin():
            p=s.scalar(select(Product).where(Product.id==body.productId).with_for_update())
            if not p: raise HTTPException(404,'Producto no encontrado.')
            if p.stock+body.quantity<0: raise HTTPException(409,'El ajuste dejaría el stock negativo.')
            if p.stock+body.quantity>1000000: raise HTTPException(409,'Las existencias no pueden superar 1000000 de unidades.')
            p.stock+=body.quantity
            add_record(s,'movements',{'productId':p.id,'name':p.name,'quantity':body.quantity,'date':now(),'status':'Ajuste','reason':body.reason,'stock':p.stock})
            audit(s,'Ajuste: '+body.reason,'Inventario',p.id); return serialize(p)

    @app.post('/api/v1/orders/{kind}/{rid}/cancel')
    def cancel(kind:Literal['sales','purchases'],rid:int):
        with Session(engine) as s,s.begin():
            r=s.scalar(select(Record).where(Record.id==rid).with_for_update())
            if not r or r.kind!=kind: raise HTTPException(404,'Operación no encontrada.')
            if r.data['status']=='Anulado': raise HTTPException(409,'La operación ya está anulada.')
            if r.data.get('paid',0)>0: raise HTTPException(409,'No se puede anular una operación con pagos registrados.')
            if not r.data.get('lines'): raise HTTPException(409,'El registro histórico no contiene líneas para revertir.')
            for l in sorted(r.data['lines'],key=lambda line:line['productId']):
                p=s.scalar(select(Product).where(Product.id==l['productId']).with_for_update())
                if not p: raise HTTPException(409,'Producto asociado no encontrado.')
                delta=l['quantity'] if kind=='sales' else -l['quantity']
                if p.stock+delta<0: raise HTTPException(409,'No hay existencias para revertir la compra.')
                if p.stock+delta>1000000: raise HTTPException(409,'La reversión superaría el límite de existencias.')
                p.stock+=delta
                add_record(s,'movements',{'productId':p.id,'name':p.name,'quantity':delta,'date':now(),'status':'Reversión','stock':p.stock,'reason':r.data['reference']})
            r.data={**r.data,'status':'Anulado','cancelledAt':now()}
            audit(s,'Operación anulada',kind,rid); return serialize(r)

    @app.post('/api/v1/documents',status_code=201)
    async def upload(request:Request,file:UploadFile|None=File(None),category:str=Form('General'),reference:str=Form(''),transfer:str=Form(''),parts:int=Form(0),filename:str=Form('')):
        if transfer:
            file=assembled_file(request,transfer,parts,filename,10*1024*1024)
            discard_parts(request,transfer,parts)
        if file is None: raise HTTPException(422,'Selecciona un archivo.')
        category=category.strip()
        reference=reference.strip()
        if not category: raise HTTPException(422,'Selecciona una categoría para el documento.')
        filename=Path((file.filename or 'archivo').replace('\\','/')).name
        if len(filename)>180 or len(category)>60 or len(reference)>100: raise HTTPException(422,'Nombre o metadatos demasiado largos.')
        if Path(filename).suffix.lower() not in ['.pdf','.png','.jpg','.jpeg','.xlsx','.docx','.csv','.txt']:
            raise HTTPException(422,'Formato no permitido. Usa PDF, imágenes, Office, CSV o TXT.')
        content=await file.read(10*1024*1024+1)
        if len(content)>10*1024*1024: raise HTTPException(413,'El archivo supera el límite de 10 MB.')
        if not content: raise HTTPException(422,'El archivo está vacío.')
        key=uuid.uuid4().hex
        try:
            storage.put(key,content)
            with Session(engine) as s,s.begin():
                r=add_record(s,'documents',{'name':filename,'storageKey':key,'storageProvider':storage.provider,'size':len(content),'category':category,'reference':reference,'date':now(),'status':'Disponible','uploadedBy':request.state.user['id']})
                audit(s,'Documento cargado','Documentos',r.id); return {k:v for k,v in serialize(r).items() if k!='storageKey'}
        except Exception:
            try:
                storage.delete(key)
            except Exception:
                import logging
                logging.getLogger(__name__).exception("Document cleanup failed")
            raise

    @app.delete('/api/v1/documents/{rid}')
    def delete_document(rid:int,request:Request):
        with Session(engine) as s,s.begin():
            r=s.scalar(select(Record).where(Record.id==rid).with_for_update())
            if not r or r.kind!='documents': raise HTTPException(404,'Documento no encontrado.')
            if request.state.user['role']!='Administrador' and r.data.get('uploadedBy')!=request.state.user['id']:
                raise HTTPException(403,'Solo puedes eliminar los documentos que subiste.')
            key=r.data.get('storageKey','')
            if len(key)!=32 or not all(c in '0123456789abcdef' for c in key): raise HTTPException(409,'El documento no tiene un archivo válido para eliminar.')
            name=r.data['name']
            provider=document_storage(r.data.get('storageProvider','local'))
            # Flush database changes before touching the file, so constraint failures leave it intact.
            s.delete(r)
            audit(s,'Documento eliminado: '+name,'Documentos',rid)
            s.flush()
            try: provider.delete(key)
            except Exception:
                raise HTTPException(503,'No se pudo eliminar el archivo. Inténtalo de nuevo.')
        return {'status':'ok'}

    @app.get('/api/v1/documents/{rid}/download')
    def download(rid:int,part:int|None=None):
        with Session(engine) as s:
            r=s.get(Record,rid)
            if not r or r.kind!='documents': raise HTTPException(404,'Documento no encontrado.')
            key=r.data.get('storageKey','')
            if len(key)!=32 or not all(c in '0123456789abcdef' for c in key): raise HTTPException(404,'Archivo no disponible.')
            try:
                content=document_storage(r.data.get('storageProvider','local')).get(key)
            except FileNotFoundError:
                raise HTTPException(404,'Archivo no disponible.')
            if part is not None:
                if part<0 or part*PART_SIZE>=len(content): raise HTTPException(404,'Parte no encontrada.')
                content=content[part*PART_SIZE:(part+1)*PART_SIZE]
            return Response(content,media_type='application/octet-stream',headers={
                'X-Content-Type-Options':'nosniff',
                'Content-Disposition':"attachment; filename*=UTF-8''"+quote(r.data['name'],safe='')})
