import json
import tempfile
import unittest
from urllib.parse import quote,unquote
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,select,event
from sqlalchemy.orm import Session
from app.models import Base,Record,Product,Customer,Sale,Payment,Movement,User,LoginSession,Company,Audit,StoredFile
from app.workspace_reset import register_workspace_reset,RESET_KINDS
from app.security import password_hash

class WorkspaceResetTests(unittest.TestCase):
    def setUp(self):
        self.test_password="Reset-only-test-2026!"
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.engine=create_engine('sqlite:///'+str(Path(self.temp.name)/'reset.db'),connect_args={'check_same_thread':False})
        self.addCleanup(self.engine.dispose)
        @event.listens_for(self.engine,'connect')
        def keys(connection,_):connection.execute('PRAGMA foreign_keys=ON')
        Base.metadata.create_all(self.engine)
        def serialize(row):
            if isinstance(row,Product):return {'id':row.id,'name':row.name,'sku':row.sku,'price':float(row.price),'cost':float(row.cost),'stock':row.stock,'minimum':row.minimum,'category':row.category}
            return {'id':row.id,**row.data}
        def audit(session,name,module,target):session.add(Audit(data={'name':name,'module':module,'reference':target}))
        app=FastAPI()
        @app.middleware('http')
        async def role(request,call_next):
            request.state.user={'id':self.admin_id,'role':unquote(request.headers.get('x-test-role','Consulta'))}
            return await call_next(request)
        register_workspace_reset(app,self.engine,Record,Product,audit,lambda:'2026-10-30T15:00:00+00:00',serialize)
        self.client=TestClient(app,headers={'x-test-role':'Administrador'})
        self.addCleanup(self.client.close)
        with Session(self.engine) as session,session.begin():
            product=Product(name='Producto',sku='RESET-1',category='Pruebas',price=100,cost=50,stock=5,minimum=1)
            contact=Customer(contactType='customers',data={'name':'Cliente','taxId':'01234567','email':'a@example.test','phone':'','status':'Activo','documentType':'DNI'})
            user=User(data={'name':'Administrador','email':'admin@example.test','password':password_hash(self.test_password),'role':'Administrador','status':'Activo'})
            session.add_all([product,contact,user]);session.flush()
            self.admin_id=user.id;self.stored_hash=user.password
            sale=Sale(data={'contactId':contact.id,'name':contact.name,'reference':'VEN-RESET','amount':100,'paid':25,'status':'Parcial','date':'2026-10-30','lines':[{'productId':product.id,'name':product.name,'quantity':1,'price':100}]})
            session.add(sale);session.flush()
            session.add_all([Payment(data={'orderId':sale.id,'amount':25,'date':'2026-10-30','method':'Yape'}),Movement(data={'productId':product.id,'quantity':-1,'stock':5,'date':'2026-10-30'}),Company(data={'name':'Empresa original'}),LoginSession(data={'userId':user.id,'token':'PRIVATE-TOKEN','expires':'2099-01-01'}),Audit(data={'name':'Historial original'}),StoredFile(key='avatar-original',content=b'avatar')])
        with self.engine.begin() as connection:
            connection.exec_driver_sql("CREATE TRIGGER protect_audit BEFORE DELETE ON records WHEN OLD.kind='audit' BEGIN SELECT RAISE(ABORT,'Audit rows are append-only'); END")

    def preview(self):
        result=self.client.get('/api/v1/admin/data/reset-preview')
        self.assertEqual(result.status_code,200,result.text)
        return result.json()

    def test_preview_and_reset_preserve_security_and_audit(self):
        preview=self.preview()
        self.assertEqual(preview['counts']['products'],1)
        self.assertNotIn(self.stored_hash,json.dumps(preview))
        self.assertNotIn(self.test_password,json.dumps(preview))
        self.assertNotIn('PRIVATE-TOKEN',json.dumps(preview))
        self.assertEqual(preview['backup']['data']['customers'][0]['taxId'],'01234567')
        result=self.client.post('/api/v1/admin/data/reset',json={'snapshot':preview['snapshot'],'confirmation':'BORRAR DATOS','backupDownloaded':True,'password':self.test_password})
        self.assertEqual(result.status_code,200,result.text)
        with Session(self.engine) as session:
            self.assertFalse(list(session.scalars(select(Record).where(Record.kind.in_(RESET_KINDS)))))
            self.assertFalse(list(session.scalars(select(Product))))
            self.assertEqual(len(list(session.scalars(select(User)))),1)
            self.assertEqual(len(list(session.scalars(select(LoginSession)))),1)
            self.assertEqual(session.scalar(select(Company)).data['name'],'Empresa original')
            self.assertEqual(len(list(session.scalars(select(Audit)))),2)
            self.assertEqual(session.get(StoredFile,'avatar-original').content,b'avatar')
            self.assertFalse(session.connection().exec_driver_sql('PRAGMA foreign_key_check').all())

    def test_confirmation_backup_and_current_snapshot_are_required(self):
        preview=self.preview()
        body={'snapshot':preview['snapshot'],'confirmation':'BORRAR DATOS','backupDownloaded':True,'password':self.test_password}
        for changed in [{**body,'confirmation':'borrar'},{**body,'backupDownloaded':False}]:
            self.assertEqual(self.client.post('/api/v1/admin/data/reset',json=changed).status_code,422)
        with Session(self.engine) as session,session.begin():session.scalar(select(Product)).stock=7
        result=self.client.post('/api/v1/admin/data/reset',json=body)
        self.assertEqual(result.status_code,409,result.text)
        with Session(self.engine) as session:self.assertEqual(session.scalar(select(Product)).stock,7)

    def test_non_admin_cannot_prepare_or_reset(self):
        preview=self.preview()
        for role in ['Consulta','Comercial','Compras','Almacén','Finanzas']:
            self.assertEqual(self.client.get('/api/v1/admin/data/reset-preview',headers={'x-test-role':quote(role)}).status_code,403)
            self.assertEqual(self.client.post('/api/v1/admin/data/reset',headers={'x-test-role':quote(role)},json={'snapshot':preview['snapshot'],'confirmation':'BORRAR DATOS','backupDownloaded':True,'password':self.test_password}).status_code,403)

    def test_password_is_required_and_must_match_current_admin(self):
        preview=self.preview()
        body={'snapshot':preview['snapshot'],'confirmation':'BORRAR DATOS','backupDownloaded':True,'password':self.test_password}
        for values in [{key:value for key,value in body.items() if key!='password'},{**body,'password':''}]:
            self.assertEqual(self.client.post('/api/v1/admin/data/reset',json=values).status_code,422)
        for password in ['wrong-password',' '+self.test_password,self.test_password+' ']:
            result=self.client.post('/api/v1/admin/data/reset',json={**body,'password':password})
            self.assertEqual(result.status_code,403,result.text)
            self.assertNotIn(password,result.text)
            with Session(self.engine) as session:
                self.assertEqual(session.scalar(select(Product)).stock,5)
                self.assertEqual(len(list(session.scalars(select(Sale)))),1)
                self.assertEqual(len(list(session.scalars(select(Audit)))),1)
        with Session(self.engine) as session,session.begin():
            user=session.get(User,self.admin_id)
            user.password=password_hash('Updated-only-test-2026!')
        self.assertEqual(self.client.post('/api/v1/admin/data/reset',json=body).status_code,403)
        result=self.client.post('/api/v1/admin/data/reset',json={**body,'password':'Updated-only-test-2026!'})
        self.assertEqual(result.status_code,200,result.text)

    def test_disabled_admin_cannot_reset(self):
        preview=self.preview()
        with Session(self.engine) as session,session.begin():
            session.get(User,self.admin_id).status='Inactivo'
        result=self.client.post('/api/v1/admin/data/reset',json={'snapshot':preview['snapshot'],'confirmation':'BORRAR DATOS','backupDownloaded':True,'password':self.test_password})
        self.assertEqual(result.status_code,403,result.text)
        with Session(self.engine) as session:self.assertEqual(session.scalar(select(Product)).stock,5)
