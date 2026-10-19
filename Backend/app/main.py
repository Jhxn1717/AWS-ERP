"""EnterpriseCloud local ERP API with authenticated workspace operations."""
import os
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .security import actor, register_security
from .operations import register_operations

from .database import DB_URL, engine, initialize_database
from .models import Base, Record, Product, RECORD_TYPES, Contact
from .validation import FormModel

initialize_database()
app = FastAPI(title='EnterpriseCloud API', version='0.2.0', description='ERP local con sesiones, roles, documentos y operaciones transaccionales.')

@app.exception_handler(IntegrityError)
async def integrity_conflict(request, exc):
    return JSONResponse({'detail':'La operaci?n entra en conflicto con datos o restricciones existentes.'}, status_code=409)

def now(): return datetime.now(timezone.utc).isoformat()
def add_record(s, kind, data):
    r = RECORD_TYPES[kind](data=data);
    if isinstance(r, Contact): r.contactType = kind
    s.add(r); s.flush(); return r
def audit(s, action, module, target):
    add_record(s, 'audit', {'name':action,'module':module,'reference':str(target),'date':now(),'user':actor.get(),'status':'Completado'})
def serialize(r):
    if isinstance(r, Product): return {'id':r.id, **{k:getattr(r,k) for k in ['name','sku','category','stock','minimum']}, 'price':float(r.price),'cost':float(r.cost)}
    return {'id':r.id, **r.data}

class ContactIn(FormModel):
    name: str = Field(min_length=2,max_length=160)
    taxId: str = Field(pattern=r'^[0-9]{11}$')
    email: str = Field(max_length=160,pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    phone: str = Field(default='',max_length=40)

class ProductIn(FormModel):
    name: str = Field(min_length=2,max_length=160)
    sku: str = Field(min_length=2,max_length=40)
    category: str = Field(min_length=2,max_length=60)
    price: Decimal = Field(gt=0,max_digits=12,decimal_places=2)
    cost: Decimal = Field(ge=0,max_digits=12,decimal_places=2)
    stock: int = Field(ge=0,le=1000000,strict=True)
    minimum: int = Field(ge=0,le=1000000,default=10,strict=True)

class LineIn(BaseModel):
    productId: int
    quantity: int = Field(gt=0,le=100000,strict=True)
class OrderIn(BaseModel):
    contactId: int
    lines: list[LineIn] = Field(min_length=1,max_length=100)
class PaymentIn(BaseModel):
    orderId: int
    amount: Decimal = Field(gt=0,max_digits=12,decimal_places=2)

@app.get('/api/v1/health')
def health(): return {'status':'ok','mode':os.getenv('ERP_ENV','development'),'database':engine.dialect.name}

@app.get('/api/v1/workspace')
def workspace(request: Request):
    with Session(engine) as s:
        result = {k:[serialize(r) for r in s.scalars(select(Record).where(Record.kind==k).order_by(Record.id.desc()))] for k in ['customers','suppliers','sales','purchases','payments','documents','audit','movements']}
        result['products']=[serialize(p) for p in s.scalars(select(Product).order_by(Product.id))]
        for kind in ['sales','purchases','payments','audit','movements']:
            result[kind].sort(key=lambda r: (r.get('date',''),r['id']), reverse=True)
        if request.state.user['role']!='Administrador':
            result['audit']=[]
        return result

@app.post('/api/v1/contacts/{kind}',status_code=201)
def contact(kind: Literal['customers','suppliers'], body: ContactIn):
    with Session(engine) as s, s.begin():
        if any(r.data.get('taxId')==body.taxId for r in s.scalars(select(Record).where(Record.kind==kind))): raise HTTPException(409,'Ya existe un registro con este RUC.')
        r=add_record(s,kind,{**body.model_dump(),'status':'Activo'}); audit(s,'Contacto creado',kind,r.id); return serialize(r)

@app.post('/api/v1/products',status_code=201)
def product(body: ProductIn):
    with Session(engine) as s,s.begin():
        if s.scalar(select(Product).where(Product.sku==body.sku)): raise HTTPException(409,'El SKU ya está registrado.')
        p=Product(**body.model_dump()); s.add(p); s.flush(); audit(s,'Producto creado','Inventario',p.id); return serialize(p)

@app.post('/api/v1/orders/{kind}',status_code=201)
def order(kind: Literal['sales','purchases'], body: OrderIn):
    with Session(engine) as s,s.begin():
        c=s.get(Record,body.contactId)
        if not c or c.kind!=('customers' if kind=='sales' else 'suppliers'): raise HTTPException(422,'Seleccione un contacto válido.')
        quantities={}
        for line in body.lines: quantities[line.productId]=quantities.get(line.productId,0)+line.quantity
        lines=[]; total=Decimal('0')
        for pid,qty in sorted(quantities.items()):
            if qty>100000: raise HTTPException(422,'La cantidad total por producto no puede superar 100000 unidades.')
            p=s.scalar(select(Product).where(Product.id==pid).with_for_update())
            if not p: raise HTTPException(404,'Producto no encontrado.')
            if kind=='sales' and p.stock<qty: raise HTTPException(409,f'Stock insuficiente para {p.name}. Disponible: {p.stock}.')
            if kind=='purchases' and p.stock+qty>1000000: raise HTTPException(409,'Las existencias no pueden superar 1000000 de unidades.')
            price=p.price if kind=='sales' else p.cost
            total+=price*qty; p.stock+=qty if kind=='purchases' else -qty
            lines.append({'productId':pid,'name':p.name,'quantity':qty,'price':float(price)})
            add_record(s,'movements',{'productId':p.id,'name':p.name,'quantity':qty if kind=='purchases' else -qty,'date':now(),'status':'Entrada' if kind=='purchases' else 'Salida','stock':p.stock})
        if total>Decimal('999999999999.99'): raise HTTPException(422,'El total supera el importe permitido por operación.')
        r=add_record(s,kind,{'name':c.data['name'],'contactId':c.id,'amount':float(total),'paid':0,'date':now(),'status':'Pagado' if total==0 else 'Pendiente','lines':lines})
        r.data={**r.data,'reference':f'{"VEN" if kind=="sales" else "OC"}-{datetime.now(timezone.utc).year}-{r.id:04}'}
        audit(s,'Venta confirmada' if kind=='sales' else 'Compra recibida',kind,r.id); return serialize(r)

@app.post('/api/v1/payments',status_code=201)
def payment(body: PaymentIn):
    with Session(engine) as s,s.begin():
        r=s.scalar(select(Record).where(Record.id==body.orderId).with_for_update())
        if not r or r.kind not in ['sales','purchases']: raise HTTPException(404,'Operación no encontrada.')
        if r.data['status']=='Anulado': raise HTTPException(409,'La operación está anulada.')
        remaining=Decimal(str(r.data['amount']))-Decimal(str(r.data.get('paid',0)))
        if body.amount>remaining: raise HTTPException(409,'El importe excede el saldo pendiente.')
        paid=Decimal(str(r.data.get('paid',0)))+body.amount
        r.data={**r.data,'paid':float(paid),'status':'Pagado' if paid==Decimal(str(r.data['amount'])) else 'Parcial'}
        p=add_record(s,'payments',{'name':r.data['name'],'reference':r.data['reference'],'orderId':r.id,'amount':float(body.amount),'type':'Ingreso' if r.kind=='sales' else 'Egreso','date':now(),'status':'Registrado'})
        audit(s,'Pago registrado','Finanzas',r.id); return serialize(p)

register_security(app,engine,Record,add_record,audit,now)
register_operations(app,engine,Record,Product,ContactIn,ProductIn,add_record,audit,now,serialize)

from .observability import register_observability
register_observability(app, engine)
