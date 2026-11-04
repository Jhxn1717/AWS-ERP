"""Internal invoices and operational tracking, stored with their source order."""
from datetime import date, datetime
from zoneinfo import ZoneInfo
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from fastapi import HTTPException
from pydantic import Field, model_validator
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from .validation import FormModel
from .security import actor


def contact_identity(values):
    document_type=values.get('documentType')
    if document_type not in ('RUC','DNI'):
        document_type='DNI' if len(values.get('taxId',''))==8 else 'RUC'
    return {**{key:values.get(key,'') for key in ['name','taxId','email','phone','address','contactPerson']},'documentType':document_type}


def build_receipt(s, Record, order, kind, now, due_date=None, tax_rate=18, supplier_reference=''):
    data=order.data
    if data.get('invoice'):
        raise HTTPException(409,'La operación ya tiene un comprobante.')
    if data['status']=='Anulado':
        raise HTTPException(409,'La operación está anulada.')
    if not data.get('lines'):
        raise HTTPException(409,'La operación no tiene detalle de productos para emitir un comprobante.')
    issued=now()
    today=datetime.fromisoformat(issued).astimezone(ZoneInfo('America/Lima')).date()
    due_date=due_date or today
    if due_date<today:
        raise HTTPException(422,'El vencimiento no puede ser anterior a la emisión.')
    if kind=='purchases' and not supplier_reference.strip():
        raise HTTPException(422,'Ingresa el número del comprobante del proveedor.')
    contact=s.scalar(select(Record).where(Record.id==data.get('contactId')).with_for_update())
    identity=contact_identity(data.get('contactSnapshot') or (contact.data if contact else {'name':data['name']}))
    if kind=='purchases':
        for previous in s.scalars(select(Record).where(Record.kind=='purchases')):
            values=previous.data
            if values.get('contactId')==data.get('contactId') and values.get('invoice',{}).get('number')==supplier_reference.strip():
                raise HTTPException(409,'Este comprobante del proveedor ya está registrado en otra compra.')
    company=s.scalar(select(Record).where(Record.kind=='company'))
    total=Decimal(str(data['amount']))
    base=(total/(1+Decimal(tax_rate)/100)).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
    receipt_type='Boleta' if kind=='sales' and identity['documentType']=='DNI' else 'Factura'
    return {
        'type':receipt_type,
        'number':f"INT-{'B' if receipt_type=='Boleta' else 'F'}-{order.id:08d}" if kind=='sales' else supplier_reference.strip(),
        'issuedAt':issued,'issuedBy':actor.get(),'dueDate':due_date.isoformat(),
        'taxRate':tax_rate,'subtotal':float(base),'tax':float(total-base),'total':float(total),
        'currency':'PEN','internal':True,'company':company.data if company else {'name':'Empresa sin configurar'},
        'contact':identity,'lines':data['lines'],
    }


class InvoiceIn(FormModel):
    dueDate: date
    taxRate: Literal[0, 18] = 18
    supplierReference: str = Field(default='', max_length=40)


class TrackingIn(FormModel):
    stage: Literal['Preparando', 'Despachado', 'Entregado']
    note: str = Field(min_length=3, max_length=500)


class LogisticsIn(FormModel):
    carrier: str = Field(min_length=2, max_length=100)
    driver: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=6, max_length=30)
    plate: str = Field(min_length=3, max_length=20)
    origin: str = Field(min_length=3, max_length=250)
    destination: str = Field(min_length=3, max_length=250)
    scheduledDate: date
    dispatchReference: str = Field(default='', max_length=60)
    note: str = Field(min_length=3, max_length=500)
    destinationLatitude: float | None = Field(default=None,ge=-90,le=90,allow_inf_nan=False)
    destinationLongitude: float | None = Field(default=None,ge=-180,le=180,allow_inf_nan=False)

    @model_validator(mode='after')
    def destination_coordinates(self):
        if (self.destinationLatitude is None)!=(self.destinationLongitude is None):
            raise ValueError('Ingresa latitud y longitud del destino juntas.')
        return self


class LogisticsEventIn(FormModel):
    type: Literal['position', 'incident', 'resolution']
    note: str = Field(min_length=3, max_length=500)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    incidentId: str | None = Field(default=None, max_length=36)

    @model_validator(mode='after')
    def validate_event(self):
        if self.type=='position' and (self.latitude is None or self.longitude is None):
            raise ValueError('Ingresa latitud y longitud para registrar una ubicación.')
        if self.type!='position' and (self.latitude is not None or self.longitude is not None):
            raise ValueError('Las coordenadas corresponden únicamente a una ubicación.')
        if (self.type=='resolution') != bool(self.incidentId):
            raise ValueError('Selecciona la incidencia que deseas resolver.')
        return self


def register_invoicing(app, engine, Record, audit, now, serialize):
    def get_order(s, kind, rid):
        order = s.scalar(select(Record).where(Record.id == rid).with_for_update())
        if not order or order.kind != kind:
            raise HTTPException(404, 'Operación no encontrada.')
        if order.data['status'] == 'Anulado':
            raise HTTPException(409, 'La operación está anulada.')
        return order

    def append_logistics(data, event):
        events=data.get('logisticsEvents', [])
        if len(events)>=2000:
            raise HTTPException(409, 'Se alcanzó el límite de eventos de esta entrega.')
        return [*events, {'id':str(uuid4()), 'date':now(), 'user':actor.get(), **event}]

    @app.post('/api/v1/orders/sales/{rid}/logistics')
    def assign_logistics(rid:int, body:LogisticsIn):
        with Session(engine) as s, s.begin():
            order=get_order(s, 'sales', rid)
            data=order.data
            if data.get('deliveryStage')=='Entregado':
                raise HTTPException(409, 'La entrega está cerrada; su asignación se conserva como historial.')
            created=datetime.fromisoformat(data['date']).astimezone(ZoneInfo('America/Lima')).date()
            if body.scheduledDate<created:
                raise HTTPException(422, 'La entrega programada no puede ser anterior a la venta.')
            assignment=body.model_dump(mode='json', exclude={'note'})
            event={'type':'assignment', 'note':body.note, 'assignment':assignment}
            order.data={**data, 'logistics':{**assignment, 'updatedAt':now()}, 'logisticsEvents':append_logistics(data,event)}
            audit(s, 'Transporte asignado: '+body.carrier+'. '+body.note, 'sales', rid)
            return serialize(order)

    @app.post('/api/v1/orders/sales/{rid}/logistics/events', status_code=201)
    def logistics_event(rid:int, body:LogisticsEventIn):
        with Session(engine) as s, s.begin():
            order=get_order(s, 'sales', rid)
            data=order.data
            if not data.get('logistics'):
                raise HTTPException(409, 'Asigna el transporte antes de registrar eventos logísticos.')
            if data.get('deliveryStage')=='Entregado' and body.type!='resolution':
                raise HTTPException(409, 'La entrega está cerrada. Solo puedes resolver incidencias pendientes.')
            if body.type=='resolution':
                events=data.get('logisticsEvents', [])
                if not any(e['id']==body.incidentId and e['type']=='incident' for e in events):
                    raise HTTPException(404, 'Incidencia no encontrada en esta entrega.')
                if any(e.get('incidentId')==body.incidentId for e in events):
                    raise HTTPException(409, 'La incidencia ya está resuelta.')
            events=append_logistics(data,body.model_dump(exclude_none=True))
            order.data={**data, 'logisticsEvents':events}
            audit(s, 'Evento logístico: '+body.type+'. '+body.note, 'sales', rid)
            return serialize(order)

    @app.post('/api/v1/orders/{kind}/{rid}/invoice', status_code=201)
    def issue(kind: Literal['sales', 'purchases'], rid: int, body: InvoiceIn):
        with Session(engine) as s, s.begin():
            order = get_order(s, kind, rid)
            receipt=build_receipt(s,Record,order,kind,now,body.dueDate,body.taxRate,body.supplierReference)
            order.data={**order.data,'invoice':receipt,'receiptType':receipt['type']}
            audit(s,receipt['type']+' interna registrada: '+receipt['number'],kind,rid)
            return serialize(order)

    @app.post('/api/v1/orders/{kind}/{rid}/tracking')
    def track(kind: Literal['sales', 'purchases'], rid: int, body: TrackingIn):
        if kind == 'purchases':
            raise HTTPException(409, 'Las compras de este módulo se registran ya recibidas.')
        with Session(engine) as s, s.begin():
            order = get_order(s, kind, rid)
            data = order.data
            stages = ['Pendiente', 'Preparando', 'Despachado', 'Entregado']
            current = data.get('deliveryStage') or 'Pendiente'
            if current not in stages:
                raise HTTPException(409, 'El estado de entrega actual requiere revisión antes de continuar.')
            if stages.index(body.stage) != stages.index(current) + 1:
                raise HTTPException(409, 'Avanza al siguiente estado de entrega, sin saltos ni retrocesos.')
            events = [*data.get('tracking', []), {'stage': body.stage, 'note': body.note, 'date': now(), 'user': actor.get()}]
            order.data = {**data, 'deliveryStage': body.stage, 'tracking': events}
            audit(s, 'Entrega: ' + body.stage + '. ' + body.note, kind, rid)
            return serialize(order)
