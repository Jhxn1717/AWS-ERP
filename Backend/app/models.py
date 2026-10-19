"""Database metadata; importing this module never connects to a database."""
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, JSON, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase): pass

class Record(Base):
    __tablename__ = 'records'
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    extra: Mapped[dict] = mapped_column('data', JSON, default=dict)
    __mapper_args__ = {'polymorphic_on':kind, 'polymorphic_identity':'record'}
    fields = ()

    @property
    def data(self):
        values = dict(self.extra or {})
        for key in self.fields:
            value = getattr(self, key)
            if value is not None:
                values[key] = float(value) if isinstance(value, Decimal) else value
        if isinstance(self, Order):
            values['lines'] = [line.as_dict() for line in self.lines]
        return values

    @data.setter
    def data(self, values):
        values = dict(values)
        for key in self.fields:
            setattr(self, key, values.pop(key, None))
        if isinstance(self, Order):
            lines = values.pop('lines', [])
            # Keep existing line rows when only payment/status metadata changes.
            if [line.as_dict() for line in self.lines] != lines:
                self.lines = [OrderLine(**line) for line in lines]
        self.extra = values

class Product(Base):
    __tablename__ = 'products'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    sku: Mapped[str] = mapped_column(String(40), unique=True)
    category: Mapped[str] = mapped_column(String(60))
    price: Mapped[Decimal] = mapped_column(Numeric(12,2))
    cost: Mapped[Decimal] = mapped_column(Numeric(12,2))
    stock: Mapped[int] = mapped_column(Integer)
    minimum: Mapped[int] = mapped_column(Integer, default=10)



from sqlalchemy.orm import relationship

class Contact(Record):
    __tablename__ = 'contacts'
    __mapper_args__ = {'polymorphic_abstract':True}
    id: Mapped[int] = mapped_column(ForeignKey('records.id'), primary_key=True)
    contactType: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(160))
    taxId: Mapped[str] = mapped_column(String(11))
    email: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20))
    fields = ('name','taxId','email','phone','status')
    __table_args__ = (UniqueConstraint('contactType','taxId'),)

class Customer(Contact):
    __mapper_args__ = {'polymorphic_identity':'customers'}

class Supplier(Contact):
    __mapper_args__ = {'polymorphic_identity':'suppliers'}

class Order(Record):
    __tablename__ = 'orders'
    __mapper_args__ = {'polymorphic_abstract':True}
    id: Mapped[int] = mapped_column(ForeignKey('records.id'), primary_key=True)
    contactId: Mapped[int | None] = mapped_column(ForeignKey('contacts.id'), index=True)
    name: Mapped[str] = mapped_column(String(160))
    reference: Mapped[str | None] = mapped_column(String(60), unique=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14,2))
    paid: Mapped[Decimal] = mapped_column(Numeric(14,2))
    date: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(20))
    lines: Mapped[list['OrderLine']] = relationship(cascade='all, delete-orphan', order_by='OrderLine.id')
    fields = ('contactId','name','reference','amount','paid','date','status')
    __table_args__ = (CheckConstraint('amount >= 0'), CheckConstraint('paid >= 0 AND paid <= amount'))

class Sale(Order):
    __mapper_args__ = {'polymorphic_identity':'sales'}

class Purchase(Order):
    __mapper_args__ = {'polymorphic_identity':'purchases'}

class OrderLine(Base):
    __tablename__ = 'order_lines'
    id: Mapped[int] = mapped_column(primary_key=True)
    orderId: Mapped[int] = mapped_column(ForeignKey('orders.id'), index=True)
    productId: Mapped[int] = mapped_column(ForeignKey('products.id'), index=True)
    name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[int] = mapped_column(Integer)
    price: Mapped[Decimal] = mapped_column(Numeric(14,2))
    __table_args__ = (CheckConstraint('quantity > 0'), CheckConstraint('price >= 0'))
    def as_dict(self):
        return dict(productId=self.productId,name=self.name,quantity=self.quantity,price=float(self.price))

class Payment(Record):
    __tablename__ = 'payments'
    __mapper_args__ = {'polymorphic_identity':'payments'}
    id: Mapped[int] = mapped_column(ForeignKey('records.id'), primary_key=True)
    orderId: Mapped[int] = mapped_column(ForeignKey('orders.id'), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14,2))
    date: Mapped[str] = mapped_column(String(40))
    fields = ('orderId','amount','date')
    __table_args__ = (CheckConstraint('amount > 0'),)

class User(Record):
    __tablename__ = 'users'
    __mapper_args__ = {'polymorphic_identity':'users'}
    id: Mapped[int] = mapped_column(ForeignKey('records.id'), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(160), unique=True)
    password: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20))
    fields = ('name','email','password','role','status')

class LoginSession(Record):
    __tablename__ = 'sessions'
    __mapper_args__ = {'polymorphic_identity':'sessions'}
    id: Mapped[int] = mapped_column(ForeignKey('records.id'), primary_key=True)
    userId: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    expires: Mapped[str] = mapped_column(String(40), index=True)
    createdAt: Mapped[str | None] = mapped_column(String(40))
    fields = ('userId','token','expires','createdAt')

class Movement(Record):
    __tablename__ = 'inventory_movements'
    __mapper_args__ = {'polymorphic_identity':'movements'}
    id: Mapped[int] = mapped_column(ForeignKey('records.id'), primary_key=True)
    productId: Mapped[int | None] = mapped_column(ForeignKey('products.id'), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int] = mapped_column(Integer)
    date: Mapped[str] = mapped_column(String(40))
    fields = ('productId','quantity','stock','date')
    __table_args__ = (CheckConstraint('stock >= 0'), CheckConstraint('quantity != 0'))

# Supplemental metadata remains JSON; financial relationships and identity use tables.
class Document(Record):
    __mapper_args__ = {'polymorphic_identity':'documents'}
class Audit(Record):
    __mapper_args__ = {'polymorphic_identity':'audit'}
class Company(Record):
    __mapper_args__ = {'polymorphic_identity':'company'}

RECORD_TYPES = {m.polymorphic_identity:m.class_ for m in Record.__mapper__.self_and_descendants if m.polymorphic_identity}


class GoogleIdentity(Base):
    __tablename__ = 'google_identities'
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    userId: Mapped[int] = mapped_column(ForeignKey('users.id'), unique=True)

class GoogleChallenge(Base):
    __tablename__ = 'google_challenges'
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires: Mapped[int] = mapped_column(Integer, index=True)
