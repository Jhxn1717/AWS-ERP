"""Nix local ERP API with authenticated workspace operations."""
import os
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .security import actor, register_security
from .operations import register_operations

from .database import DB_URL, engine, initialize_database
from .models import Base, Record, Product, RECORD_TYPES, Contact
from .validation import FormModel
from .invoicing import build_receipt, contact_identity

initialize_database()
app = FastAPI(title='Nix', version='0.2.0', description='ERP local con sesiones, roles, documentos y operaciones transaccionales.')

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
    values=r.data
    if isinstance(r,Contact): values={**values,'documentType':values.get('documentType') or ('DNI' if len(values.get('taxId',''))==8 else 'RUC')}
    return {'id':r.id, **values}

class ContactIn(FormModel):
    name: str = Field(min_length=2,max_length=160)
    documentType: Literal['RUC','DNI'] = 'RUC'
    taxId: str = Field(pattern=r'^(?:[0-9]{8}|[0-9]{11})$')
    email: str = Field(max_length=160,pattern=r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
    phone: str = Field(default='',max_length=40)
    address: str = Field(default='',max_length=250)
    contactPerson: str = Field(default='',max_length=100)

    @model_validator(mode='after')
    def document_length(self):
        expected=8 if self.documentType=='DNI' else 11
        if len(self.taxId)!=expected: raise ValueError(f'El {self.documentType} debe tener {expected} dígitos.')
        return self

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
class PaymentDetails(FormModel):
    method: Literal['Efectivo','Tarjeta','Yape','Plin','Transferencia']
    paymentReference: str = Field(default='',max_length=100)
class OrderIn(FormModel):
    contactId: int
    lines: list[LineIn] = Field(min_length=1,max_length=100)
    emitReceipt: bool = False
    receiptDueDate: date | None = None
    initialPayment: PaymentDetails | None = None
    notes: str = Field(default='',max_length=1000)
    paymentDays: int = Field(default=0,ge=0,le=365,strict=True)
    deliveryDate: date | None = None
    taxRate: Literal[0,18] = 18
class PaymentIn(PaymentDetails):
    orderId: int
    amount: Decimal = Field(gt=0,max_digits=12,decimal_places=2)

@app.get('/api/v1/health')
def health(): return {'status':'ok','mode':os.getenv('ERP_ENV','development'),'database':engine.dialect.name}

@app.get('/api/v1/workspace')
def workspace(request: Request):
    with Session(engine) as s:
        result = {k:[serialize(r) for r in s.scalars(select(Record).where(Record.kind==k).order_by(Record.id.desc()))] for k in ['customers','suppliers','sales','purchases','payments','documents','audit','movements','quotes']}
        result['products']=[serialize(p) for p in s.scalars(select(Product).order_by(Product.id))]
        for kind in ['sales','purchases','payments','audit','movements']:
            result[kind].sort(key=lambda r: (r.get('date',''),r['id']), reverse=True)
        if request.state.user['role']!='Administrador':
            result['audit']=[]
        return result

@app.post('/api/v1/contacts/{kind}',status_code=201)
def contact(kind: Literal['customers','suppliers'], body: ContactIn):
    if kind=='suppliers' and body.documentType!='RUC': raise HTTPException(422,'Los proveedores deben registrarse con RUC.')
    with Session(engine) as s, s.begin():
        if any(r.data.get('taxId')==body.taxId for r in s.scalars(select(Record).where(Record.kind==kind))): raise HTTPException(409,'Ya existe un registro con este documento.')
        r=add_record(s,kind,{**body.model_dump(),'status':'Activo'}); audit(s,'Contacto creado',kind,r.id); return serialize(r)

@app.post('/api/v1/products',status_code=201)
def product(body: ProductIn):
    with Session(engine) as s,s.begin():
        if s.scalar(select(Product).where(Product.sku==body.sku)): raise HTTPException(409,'El SKU ya está registrado.')
        p=Product(**body.model_dump()); s.add(p); s.flush()
        if p.stock:add_record(s,'movements',{'productId':p.id,'name':p.name,'quantity':p.stock,'date':now(),'status':'Stock inicial','stock':p.stock,'reason':'Creación de producto'})
        audit(s,'Producto creado','Inventario',p.id); return serialize(p)

def create_order_record(s, kind, body, quoted_prices=None, metadata=None):
    if kind=='purchases' and body.emitReceipt: raise HTTPException(422,'En compras debes registrar el comprobante del proveedor.')
    if kind=='purchases' and body.initialPayment: raise HTTPException(422,'Registra el pago al proveedor desde Pagos.')
    if kind=='purchases' and body.deliveryDate: raise HTTPException(422,'Las compras se registran ya recibidas; no tienen una entrega futura.')
    if body.deliveryDate and body.deliveryDate<datetime.now(ZoneInfo('America/Lima')).date(): raise HTTPException(422,'La entrega prevista no puede ser anterior a hoy.')
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
        price=Decimal(str(quoted_prices[pid])) if quoted_prices is not None else (p.price if kind=='sales' else p.cost)
        total+=price*qty; p.stock+=qty if kind=='purchases' else -qty
        lines.append({'productId':pid,'name':p.name,'quantity':qty,'price':float(price)})
        add_record(s,'movements',{'productId':p.id,'name':p.name,'quantity':qty if kind=='purchases' else -qty,'date':now(),'status':'Entrada' if kind=='purchases' else 'Salida','stock':p.stock})
    if total>Decimal('999999999999.99'): raise HTTPException(422,'El total supera el importe permitido por operación.')
    identity=contact_identity(c.data)
    r=add_record(s,kind,{'name':c.data['name'],'contactId':c.id,'amount':float(total),'paid':0,'date':now(),'status':'Pagado' if total==0 else 'Pendiente','lines':lines,'contactSnapshot':identity,'receiptType':'Boleta' if kind=='sales' and identity['documentType']=='DNI' else 'Factura','notes':body.notes,'paymentDays':body.paymentDays,'deliveryDate':body.deliveryDate.isoformat() if body.deliveryDate else None,'taxRate':body.taxRate,'createdBy':actor.get(),'warehouse':'Almacén principal',**(metadata or {})})
    r.data={**r.data,'reference':f'{"VEN" if kind=="sales" else "OC"}-{datetime.now(timezone.utc).year}-{r.id:04}'}
    if body.emitReceipt:
        due=body.receiptDueDate or (datetime.now(ZoneInfo('America/Lima')).date()+timedelta(days=body.paymentDays))
        receipt=build_receipt(s,Record,r,kind,now,due,body.taxRate)
        r.data={**r.data,'invoice':receipt}
        audit(s,receipt['type']+' interna generada: '+receipt['number'],kind,r.id)
    if body.initialPayment and total>0:
        r.data={**r.data,'paid':float(total),'status':'Pagado'}
        add_record(s,'payments',{'name':r.data['name'],'reference':r.data['reference'],'orderId':r.id,'amount':float(total),'type':'Ingreso','date':now(),'status':'Registrado',**body.initialPayment.model_dump()})
        audit(s,'Cobro de venta registrado','Finanzas',r.id)
    audit(s,'Venta confirmada' if kind=='sales' else 'Compra recibida',kind,r.id); return serialize(r)


@app.post('/api/v1/orders/{kind}',status_code=201)
def order(kind: Literal['sales','purchases'], body: OrderIn):
    with Session(engine) as s,s.begin():
        return create_order_record(s, kind, body)

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
        p=add_record(s,'payments',{'name':r.data['name'],'reference':r.data['reference'],'orderId':r.id,'amount':float(body.amount),'type':'Ingreso' if r.kind=='sales' else 'Egreso','date':now(),'status':'Registrado','method':body.method,'paymentReference':body.paymentReference})
        audit(s,'Pago registrado','Finanzas',r.id); return serialize(p)

register_security(app,engine,Record,add_record,audit,now)
register_operations(app,engine,Record,Product,ContactIn,ProductIn,add_record,audit,now,serialize)
from .quotes import register_quotes
register_quotes(app,engine,Record,Product,OrderIn,add_record,audit,now,serialize,create_order_record)
from .invoicing import register_invoicing
register_invoicing(app,engine,Record,audit,now,serialize)

from .observability import register_observability
register_observability(app, engine)

from .csv_import import register_csv_import
register_csv_import(app,engine,Record,Product,ProductIn,ContactIn,add_record,audit,now,serialize)

from .workspace_reset import register_workspace_reset
register_workspace_reset(app,engine,Record,Product,audit,now,serialize)
