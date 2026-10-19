"""Schema lifecycle tests run in isolated processes, never against the local ERP database."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

BACKEND = Path(__file__).resolve().parents[1]

class DatabaseTests(unittest.TestCase):
    def run_script(self, script, **overrides):
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'ERP_ENV':'test',
                   'DATABASE_URL':'sqlite:///' + directory.replace('\\','/') + '/test.db', **overrides}
            result = subprocess.run([sys.executable, '-c', script], cwd=BACKEND,
                                    env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_legacy_data_migration_and_constraints(self):
        self.run_script('''
from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, Table, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import engine
config=Config('alembic.ini')
command.upgrade(config,'0001')
metadata=MetaData()
records=Table('records',metadata,autoload_with=engine)
products=Table('products',metadata,autoload_with=engine)
with engine.begin() as c:
    c.execute(products.insert(),dict(id=1,name='Test',sku='TEST',category='Test',price=10,cost=5,stock=4,minimum=1))
    for rid,kind,data in [
        (1,'customers',dict(name='Cliente',taxId='20100000001',email='c@example.test',phone='',status='Activo')),
        (2,'sales',dict(name='Cliente',contactId=1,reference='VEN-1',amount=10,paid=5,date='2026-10-17',status='Parcial',lines=[dict(productId=1,name='Test',quantity=1,price=10)])),
        (3,'payments',dict(orderId=2,amount=5,date='2026-10-17',name='Cliente',type='Ingreso')),
        (4,'users',dict(name='Admin',email='a@example.test',password='hash',role='Administrador',status='Activo')),
        (5,'sessions',dict(userId=4,token='a'*64,expires='2027-01-01',createdAt='2026-10-17')),
        (6,'audit',dict(name='Created',date='2026-10-17',user='Admin')),
    ]:
        c.execute(records.insert(),dict(id=rid,kind=kind,data=data))
command.upgrade(config,'head')
command.upgrade(config,'head')
command.check(config)
from app.models import Record, Order, Contact, Payment, User, LoginSession, OrderLine
with Session(engine) as s:
    sale=s.get(Record,2)
    assert isinstance(sale,Order) and sale.contactId==1
    assert sale.data['lines'][0]['quantity']==1
    assert sale.data['amount']==10 and sale.data['paid']==5
    assert isinstance(s.get(Record,1),Contact)
    assert isinstance(s.get(Record,3),Payment)
    assert isinstance(s.get(Record,4),User)
    assert isinstance(s.get(Record,5),LoginSession)
    assert 'amount' not in sale.extra and 'lines' not in sale.extra
    audit=s.get(Record,6)
    audit.extra={'name':'Tampered'}
    try:
        s.commit()
        raise AssertionError('Audit must reject updates')
    except IntegrityError:
        s.rollback()
    s.add(OrderLine(orderId=2,productId=999,name='Invalid',quantity=1,price=1))
    try:
        s.commit()
        raise AssertionError('Foreign key must reject a nonexistent product')
    except IntegrityError:
        s.rollback()
    sale=s.get(Record,2)
    sale.paid=11
    try:
        s.commit()
        raise AssertionError('Payment cannot exceed amount')
    except IntegrityError:
        s.rollback()
engine.dispose()
''')

    def test_import_does_not_create_schema(self):
        self.run_script('''
from app.database import engine, initialize_database
from sqlalchemy import inspect
try:
    initialize_database()
    raise AssertionError('Unmigrated database must fail startup')
except RuntimeError as e:
    assert 'migrations required' in str(e)
assert not inspect(engine).get_table_names()
engine.dispose()
''')

    def test_production_rejects_sqlite(self):
        self.run_script('''
try:
    import app.database
    raise AssertionError('Production must reject SQLite')
except RuntimeError as e:
    assert 'PostgreSQL' in str(e)
''', ERP_ENV='production')
