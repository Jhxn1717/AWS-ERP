"""Commercial proposals are converted once, transactionally, into stock-backed sales."""
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo
from typing import Literal
from fastapi import HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .validation import FormModel
from .security import actor


class QuoteLine(FormModel):
    productId: int
    quantity: int = Field(gt=0, le=100000, strict=True)


class QuoteIn(FormModel):
    contactId: int
    lines: list[QuoteLine] = Field(min_length=1, max_length=100)
    validUntil: date
    deliveryDate: date
    paymentDays: int = Field(ge=0, le=365, strict=True, default=30)
    notes: str = Field(default='', max_length=1000)
    taxRate: Literal[0,18] = 18


def register_quotes(app, engine, Record, Product, OrderIn, add_record, audit, now, serialize, create_order):
    def today():
        return datetime.fromisoformat(now()).astimezone(ZoneInfo('America/Lima')).date()

    @app.post('/api/v1/quotes', status_code=201)
    def create(body: QuoteIn):
        if body.validUntil < today() or body.deliveryDate < today():
            raise HTTPException(422, 'La vigencia y la entrega deben ser actuales o futuras.')
        with Session(engine) as s, s.begin():
            contact = s.get(Record, body.contactId)
            if not contact or contact.kind != 'customers':
                raise HTTPException(422, 'Selecciona un cliente válido.')
            quantities = {}
            for line in body.lines:
                quantities[line.productId] = quantities.get(line.productId, 0) + line.quantity
            lines = []
            total = Decimal('0')
            for pid, quantity in sorted(quantities.items()):
                if quantity > 100000:
                    raise HTTPException(422, 'La cantidad total por producto supera el límite.')
                product = s.get(Product, pid)
                if not product:
                    raise HTTPException(404, 'Producto no encontrado.')
                total += product.price * quantity
                lines.append({'productId': pid, 'name': product.name, 'quantity': quantity, 'price': float(product.price)})
            if total > Decimal('999999999999.99'):
                raise HTTPException(422, 'El total supera el importe permitido.')
            quote = add_record(s, 'quotes', {
                'contactId': contact.id, 'name': contact.data['name'], 'date': now(),
                'status': 'Cotización', 'amount': float(total), 'lines': lines,
                'validUntil': body.validUntil.isoformat(), 'deliveryDate': body.deliveryDate.isoformat(),
                'paymentDays': body.paymentDays, 'notes': body.notes, 'createdBy': actor.get(), 'taxRate':body.taxRate,
            })
            quote.data = {**quote.data, 'reference': f'COT-{quote.id:06d}'}
            audit(s, 'Cotización registrada', 'Ventas', quote.id)
            return serialize(quote)

    def locked_quote(s, rid):
        quote = s.scalar(select(Record).where(Record.id == rid).with_for_update())
        if not quote or quote.kind != 'quotes':
            raise HTTPException(404, 'Cotización no encontrada.')
        return quote

    @app.post('/api/v1/quotes/{rid}/confirm')
    def confirm(rid: int):
        with Session(engine) as s, s.begin():
            quote = locked_quote(s, rid)
            data = quote.data
            if data.get('orderId') or data['status'] != 'Cotización':
                raise HTTPException(409, 'La cotización ya fue confirmada o rechazada.')
            if data['validUntil'] < today().isoformat() or data['deliveryDate'] < today().isoformat():
                raise HTTPException(409, 'La cotización venció. Registra una propuesta con fechas actualizadas.')
            sale = create_order(s, 'sales', OrderIn(contactId=data['contactId'], lines=[
                {'productId': line['productId'], 'quantity': line['quantity']} for line in data['lines']
            ],taxRate=data.get('taxRate',18)), quoted_prices={line['productId']: line['price'] for line in data['lines']}, metadata={
                'quoteId': quote.id, 'quoteReference': data['reference'], 'deliveryDate': data['deliveryDate'],
                'paymentDays': data['paymentDays'], 'notes': data['notes'], 'confirmedAt': now(),
                'deliveryStage': 'Pendiente',
            })
            quote.data = {**data, 'status': 'Confirmada', 'orderId': sale['id'],
                          'orderReference': sale['reference'], 'confirmedAt': now()}
            audit(s, 'Cotización convertida en pedido ' + sale['reference'], 'Ventas', quote.id)
            return {'quote': serialize(quote), 'order': sale}

    @app.post('/api/v1/quotes/{rid}/reject')
    def reject(rid: int):
        with Session(engine) as s, s.begin():
            quote = locked_quote(s, rid)
            if quote.data['status'] != 'Cotización':
                raise HTTPException(409, 'Solo se puede rechazar una cotización abierta.')
            quote.data = {**quote.data, 'status': 'Rechazada', 'rejectedAt': now()}
            audit(s, 'Cotización rechazada', 'Ventas', quote.id)
            return serialize(quote)
