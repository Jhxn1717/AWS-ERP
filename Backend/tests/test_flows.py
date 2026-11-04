import os
import tempfile
import unittest
import io
from PIL import Image, PngImagePlugin

tmp = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = os.getenv('TEST_DATABASE_URL') or 'sqlite:///' + tmp.name.replace('\\', '/') + '/test.db'
os.environ['DOCUMENTS_DIR'] = tmp.name + '/uploads'
from fastapi.testclient import TestClient
from alembic import command
from alembic.config import Config
command.upgrade(Config('alembic.ini'), 'head')
from app.main import app, engine

from app.seed import seed_demo
seed_demo()

client = TestClient(app)
client.post('/api/v1/auth/setup',json={'name':'Admin de pruebas','email':'admin@example.test','password':'Testing-local-2026!'})

def tearDownModule():
    client.close()
    engine.dispose()
    tmp.cleanup()

class BusinessFlowTests(unittest.TestCase):
    def test_logistics_destination_coordinates_are_optional_paired_and_bounded(self):
        from app.invoicing import LogisticsIn
        from pydantic import ValidationError
        body={'carrier':'Transportes de prueba','driver':'Conductor de prueba','phone':'999000000','plate':'ABC-123','origin':'Lima centro','destination':'Surco Lima','scheduledDate':'2026-11-04','note':'Prueba de coordenadas'}
        self.assertIsNone(LogisticsIn(**body).destinationLatitude)
        for invalid in [{'destinationLatitude':-12},{'destinationLongitude':-77},{'destinationLatitude':91,'destinationLongitude':-77},{'destinationLatitude':-12,'destinationLongitude':181},{'destinationLatitude':float('nan'),'destinationLongitude':-77}]:
            with self.assertRaises(ValidationError):LogisticsIn(**body,**invalid)
        parsed=LogisticsIn(**body,destinationLatitude=0,destinationLongitude=0)
        self.assertEqual((parsed.destinationLatitude,parsed.destinationLongitude),(0,0))

    def test_logistics_assignment_positions_incidents_and_closed_delivery(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        customer=client.post('/api/v1/contacts/customers',json={'name':'Logistics customer','taxId':'20988771122','email':'logistics@example.test','phone':'999123456'}).json()
        product=client.post('/api/v1/products',json={'name':'Logistics item','sku':'LOGISTICS-01','category':'Pruebas','price':118,'cost':50,'stock':5,'minimum':1}).json()
        order=client.post('/api/v1/orders/sales',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}],'emitReceipt':True}).json()
        url=f"/api/v1/orders/sales/{order['id']}"
        event={'type':'position','note':'Reportado por el conductor','latitude':-12.0464,'longitude':-77.0428}
        self.assertEqual(client.post(url+'/logistics/events',json=event).status_code,409)
        assignment={'carrier':'Transporte de prueba','driver':'Conductor de prueba','phone':'999123456','plate':'ABC-123','origin':'Almacen principal','destination':'Av. Prueba 100, Lima','scheduledDate':datetime.now(ZoneInfo('America/Lima')).date().isoformat(),'dispatchReference':'DESP-01','note':'Programacion inicial','destinationLatitude':-12.150556,'destinationLongitude':-77.007778}
        for changes in [{'carrier':'  '},{'scheduledDate':'2000-01-01'}]:
            self.assertEqual(client.post(url+'/logistics',json={**assignment,**changes}).status_code,422)
        result=client.post(url+'/logistics',json=assignment)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['logistics']['destination'],assignment['destination'])
        self.assertEqual((result.json()['logistics']['destinationLatitude'],result.json()['logistics']['destinationLongitude']),(-12.150556,-77.007778))
        for role,email in [('Almacén','logistics-warehouse@example.test'),('Consulta','logistics-viewer@example.test')]:
            created_user=client.post('/api/v1/users',json={'name':'Logistics '+role,'email':email,'password':'Testing-local-2026!','role':role})
            self.assertEqual(created_user.status_code,201,created_user.text)
            with TestClient(app) as worker:
                self.assertEqual(worker.post('/api/v1/auth/login',json={'email':email,'password':'Testing-local-2026!'}).status_code,200)
                self.assertEqual(worker.post(url+'/logistics/events',json=event).status_code,201 if role=='Almacén' else 403)
                self.assertEqual(worker.post('/api/v1/orders/sales',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}]}).status_code,403)
                self.assertEqual(worker.post(url+'/invoice',json={'dueDate':assignment['scheduledDate']}).status_code,403)
        for changes in [{'latitude':91},{'longitude':181},{'latitude':None},{'type':'incident'},{'incidentId':'unexpected'}]:
            self.assertEqual(client.post(url+'/logistics/events',json={**event,**changes}).status_code,422)
        result=client.post(url+'/logistics/events',json=event)
        self.assertEqual(result.status_code,201,result.text)
        position=result.json()['logisticsEvents'][-1]
        self.assertEqual((position['latitude'],position['longitude']),(-12.0464,-77.0428))
        self.assertTrue(position['user'] and position['date'])
        result=client.post(url+'/logistics/events',json={'type':'incident','note':'Demora por trafico'})
        incident=result.json()['logisticsEvents'][-1]['id']
        resolution={'type':'resolution','incidentId':incident,'note':'Se retomo la ruta'}
        self.assertEqual(client.post(url+'/logistics/events',json={**resolution,'incidentId':'unknown'}).status_code,404)
        self.assertEqual(client.post(url+'/logistics/events',json=resolution).status_code,201)
        self.assertEqual(client.post(url+'/logistics/events',json=resolution).status_code,409)
        second=client.post(url+'/logistics/events',json={'type':'incident','note':'Pendiente de confirmar receptor'}).json()['logisticsEvents'][-1]['id']
        for stage in ['Preparando','Despachado','Entregado']:
            self.assertEqual(client.post(url+'/tracking',json={'stage':stage,'note':'Avance confirmado por operador'}).status_code,200)
        self.assertEqual(client.post(url+'/logistics',json=assignment).status_code,409)
        self.assertEqual(client.post(url+'/logistics/events',json=event).status_code,409)
        self.assertEqual(client.post(url+'/logistics/events',json={**resolution,'incidentId':second}).status_code,201)
        saved=next(s for s in client.get('/api/v1/workspace').json()['sales'] if s['id']==order['id'])
        self.assertEqual(saved['invoice'],order['invoice'])
        self.assertEqual((saved['amount'],saved['paid'],saved['status']),(118,0,'Pendiente'))
        self.assertEqual(len(saved['logisticsEvents']),7)
        purchase=client.post('/api/v1/orders/purchases',json={'contactId':client.get('/api/v1/workspace').json()['suppliers'][0]['id'],'lines':[{'productId':product['id'],'quantity':1}]}).json()
        self.assertEqual(client.post(f"/api/v1/orders/sales/{purchase['id']}/logistics",json=assignment).status_code,404)

    def test_full_csv_import_preserves_extended_contact_fields(self):
        from pathlib import Path
        folder=Path(__file__).resolve().parents[2]/'Frontend'/'public'/'samples'/'prueba-completa'
        for name,kind in [('productos','products'),('clientes','customers'),('proveedores','suppliers')]:
            content=(folder/(name+'-completo-5.csv')).read_bytes()
            preview=client.post('/api/v1/imports/csv/preview',files={'file':('archivo.csv',content,'text/csv')})
            self.assertEqual(preview.status_code,200,preview.text)
            self.assertEqual((preview.json()['kind'],preview.json()['count']),(kind,5))
            saved=client.post('/api/v1/imports/csv',files={'file':('archivo.csv',content,'text/csv')})
            self.assertEqual(saved.status_code,201,saved.text)
            self.assertEqual(saved.json()['count'],5)
            if kind!='products':
                self.assertTrue(all(row['address'] and row['contactPerson'] for row in saved.json()['rows']))
            if kind=='customers':self.assertEqual(saved.json()['rows'][2]['taxId'],'01234671')
            if kind=='products':self.assertEqual(saved.json()['rows'][-1]['stock'],0)

    def test_commercial_form_terms_and_contact_details_are_preserved(self):
        from datetime import datetime,timedelta
        from zoneinfo import ZoneInfo
        today=datetime.now(ZoneInfo('America/Lima')).date()
        customer_body={'name':'Cliente formulario completo','taxId':'20988776655','email':'forms@example.test','phone':'999123456','address':'Av. Comercial 123, Lima','contactPerson':'Ana Torres'}
        customer=client.post('/api/v1/contacts/customers',json=customer_body).json()
        product=client.post('/api/v1/products',json={'name':'Producto formulario','sku':'FORM-COMPLETE-01','category':'Pruebas','price':118,'cost':50,'stock':8,'minimum':1}).json()
        body={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}],'emitReceipt':True,'taxRate':18,'paymentDays':15,'receiptDueDate':(today+timedelta(days=15)).isoformat(),'deliveryDate':(today+timedelta(days=2)).isoformat(),'notes':'  Coordinar recepción con almacén.  '}
        result=client.post('/api/v1/orders/sales',json=body)
        self.assertEqual(result.status_code,201,result.text)
        sale=result.json()
        self.assertEqual((sale['paymentDays'],sale['notes'],sale['warehouse']),(15,'Coordinar recepción con almacén.','Almacén principal'))
        self.assertTrue(sale['createdBy'])
        self.assertEqual(sale['deliveryDate'],body['deliveryDate'])
        self.assertEqual(sale['invoice']['dueDate'],body['receiptDueDate'])
        self.assertEqual(sale['invoice']['contact']['address'],customer_body['address'])
        self.assertEqual(sale['invoice']['contact']['contactPerson'],'Ana Torres')
        self.assertEqual((sale['invoice']['subtotal'],sale['invoice']['tax'],sale['invoice']['total']),(100,18,118))
        edited=client.put(f"/api/v1/contacts/customers/{customer['id']}",json={**customer_body,'address':'Dirección nueva'})
        self.assertEqual(edited.status_code,200,edited.text)
        saved=next(row for row in client.get('/api/v1/workspace').json()['sales'] if row['id']==sale['id'])
        self.assertEqual(saved['invoice']['contact']['address'],customer_body['address'])
        for changes in [{'paymentDays':-1},{'taxRate':12},{'notes':'x'*1001},{'deliveryDate':(today-timedelta(days=1)).isoformat()}]:
            invalid=client.post('/api/v1/orders/sales',json={**body,**changes})
            self.assertEqual(invalid.status_code,422,invalid.text)
        workspace=client.get('/api/v1/workspace').json()
        self.assertEqual(next(row for row in workspace['products'] if row['id']==product['id'])['stock'],7)
        initial=[row for row in workspace['movements'] if row['productId']==product['id'] and row['status']=='Stock inicial']
        self.assertEqual(len(initial),1)
        self.assertEqual(initial[0]['quantity'],8)
        implicit=client.post('/api/v1/orders/sales',json={key:value for key,value in body.items() if key!='receiptDueDate'})
        self.assertEqual(implicit.status_code,201,implicit.text)
        self.assertEqual(implicit.json()['invoice']['dueDate'],body['receiptDueDate'])

    def test_quote_conversion_preserves_selected_zero_tax(self):
        from datetime import datetime,timedelta
        from zoneinfo import ZoneInfo
        future=(datetime.now(ZoneInfo('America/Lima')).date()+timedelta(days=3)).isoformat()
        customer=client.get('/api/v1/workspace').json()['customers'][0]
        product=client.post('/api/v1/products',json={'name':'Producto sin IGV','sku':'QUOTE-TAX-ZERO-01','category':'Pruebas','price':100,'cost':30,'stock':5,'minimum':1}).json()
        quote=client.post('/api/v1/quotes',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}],'validUntil':future,'deliveryDate':future,'taxRate':0,'notes':'Operación sin impuesto.'})
        self.assertEqual(quote.status_code,201,quote.text)
        self.assertEqual(quote.json()['taxRate'],0)
        confirmed=client.post(f"/api/v1/quotes/{quote.json()['id']}/confirm")
        self.assertEqual(confirmed.status_code,200,confirmed.text)
        sale=confirmed.json()['order']
        self.assertEqual(sale['taxRate'],0)
        issued=client.post(f"/api/v1/orders/sales/{sale['id']}/invoice",json={'dueDate':future,'taxRate':0})
        self.assertEqual(issued.status_code,201,issued.text)
        self.assertEqual((issued.json()['invoice']['tax'],issued.json()['invoice']['total']),(0,100))

    def test_csv_imports_are_exclusive_to_admin_including_legacy_routes(self):
        password='Testing-csv-2026!'
        content=b'tipo_registro,nombre,tipo_documento,documento,correo,telefono\nclientes,Cliente CSV,DNI,09876543,csv@example.test,999\n'
        paths=['imports/csv','imports/csv/preview','products/import','products/import/preview','contacts/customers/import','contacts/customers/import/preview','contacts/suppliers/import','contacts/suppliers/import/preview']
        for index,role in enumerate(['Comercial','Compras','Almacén','Finanzas','Consulta']):
            email=f'csv-role-{index}@example.test'
            created=client.post('/api/v1/users',json={'name':'Importador '+role,'email':email,'password':password,'role':role})
            self.assertEqual(created.status_code,201,created.text)
            with TestClient(app) as worker:
                self.assertEqual(worker.post('/api/v1/auth/login',json={'email':email,'password':password}).status_code,200)
                before=client.get('/api/v1/workspace').json()
                for path in paths:
                    with self.subTest(role=role,path=path):
                        denied=worker.post('/api/v1/'+path,files={'file':('archivo.csv',content,'text/csv')})
                        self.assertEqual(denied.status_code,403,denied.text)
                after=client.get('/api/v1/workspace').json()
                for kind in ['products','customers','suppliers','movements']:self.assertEqual(after[kind],before[kind])
                self.assertEqual(worker.get('/api/v1/workspace').status_code,200)
        allowed=client.post('/api/v1/imports/csv/preview',files={'file':('archivo.csv',content,'text/csv')},data={'expectedKind':'customers'})
        self.assertEqual(allowed.status_code,200,allowed.text)
        with TestClient(app) as anonymous:
            for path in paths:self.assertEqual(anonymous.post('/api/v1/'+path,files={'file':('archivo.csv',content,'text/csv')}).status_code,401)

    def test_csv_module_mismatch_is_rejected_before_preview_and_commit(self):
        content=b'tipo_registro,nombre,tipo_documento,documento,correo,telefono\nclientes,Cliente CSV,DNI,09876543,csv@example.test,999\n'
        before=client.get('/api/v1/workspace').json()
        for path in ['imports/csv/preview','imports/csv']:
            for expected in ['products','suppliers']:
                rejected=client.post('/api/v1/'+path,files={'file':('archivo.csv',content,'text/csv')},data={'expectedKind':expected})
                self.assertEqual(rejected.status_code,422,rejected.text)
                self.assertIn('contiene clientes',rejected.json()['detail'])
        after=client.get('/api/v1/workspace').json()
        for kind in ['products','customers','suppliers','movements']:self.assertEqual(after[kind],before[kind])

    def test_csv_import_preview_commit_duplicates_and_validation(self):
        from pathlib import Path
        samples=Path(__file__).resolve().parents[2]/'Frontend'/'public'/'samples'
        for kind,filename,path in [('products','productos-5.csv','products'),('customers','clientes-5.csv','contacts/customers'),('suppliers','proveedores-5.csv','contacts/suppliers')]:
            content=(samples/filename).read_bytes()
            before=client.get('/api/v1/workspace').json()
            preview=client.post(f'/api/v1/{path}/import/preview',files={'file':(filename,content,'text/csv')})
            self.assertEqual(preview.status_code,200,preview.text)
            self.assertEqual(preview.json()['count'],5)
            automatic=client.post('/api/v1/imports/csv/preview',files={'file':('archivo.csv',content,'text/csv')})
            self.assertEqual(automatic.status_code,200,automatic.text)
            self.assertEqual(automatic.json()['kind'],kind)
            self.assertEqual(len(client.get('/api/v1/workspace').json()[kind]),len(before[kind]))
            imported=client.post('/api/v1/imports/csv',files={'file':('archivo.csv',content,'text/csv')})
            self.assertEqual(imported.status_code,201,imported.text)
            self.assertEqual(imported.json()['count'],5)
            if kind=='customers':self.assertEqual(imported.json()['rows'][2]['taxId'],'01234561')
            self.assertEqual(client.post(f'/api/v1/{path}/import',files={'file':(filename,content,'text/csv')}).status_code,409)
            self.assertEqual(len(client.get('/api/v1/workspace').json()[kind]),len(before[kind])+5)
        before=client.get('/api/v1/workspace').json()
        bad=b'nombre,sku,categoria,precio,costo,stock,stock_minimo\nValido,ATOMIC-CSV-01,Pruebas,10,5,2,1\nInvalido,ATOMIC-CSV-02,Pruebas,10,5,-1,1\n'
        rejected=client.post('/api/v1/products/import',files={'file':('bad.csv',bad,'text/csv')})
        self.assertEqual(rejected.status_code,422,rejected.text)
        self.assertIn('Fila 3',rejected.json()['detail'])
        after=client.get('/api/v1/workspace').json()
        self.assertEqual(len(after['products']),len(before['products']))
        self.assertEqual(len(after['movements']),len(before['movements']))
        semicolon=b'\xef\xbb\xbfnombre;sku;categoria;precio;costo;stock;stock_minimo\nSemicolon;SEMI-CSV-01;Pruebas;10,50;5;2;1\n'
        valid=client.post('/api/v1/products/import/preview',files={'file':('excel.csv',semicolon,'text/csv')})
        self.assertEqual(valid.status_code,200,valid.text)
        self.assertEqual(valid.json()['rows'][0]['price'],'10.50')
        for invalid in [b'nombre,sku\nProducto,SKU\n',bad.replace(b'ATOMIC-CSV-02',b'ATOMIC-CSV-01').replace(b'-1',b'1'),b'\xff\xfeINVALID']:
            self.assertIn(client.post('/api/v1/products/import',files={'file':('bad.csv',invalid,'text/csv')}).status_code,[409,422])
        with TestClient(app) as anonymous:
            self.assertEqual(anonymous.post('/api/v1/products/import',files={'file':('bad.csv',bad,'text/csv')}).status_code,401)

    def test_payment_method_is_required_for_collections_and_checkout(self):
        before=client.get('/api/v1/workspace').json()
        customer=before['customers'][0]
        product=client.post('/api/v1/products',json={'name':'Required method','sku':'REQUIRED-METHOD-01','category':'Pruebas','price':100,'cost':50,'stock':5,'minimum':1}).json()
        payload={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}]}
        sale=client.post('/api/v1/orders/sales',json=payload).json()
        before=client.get('/api/v1/workspace').json()
        for method in [{},{'method':''},{'method':None}]:
            payment=client.post('/api/v1/payments',json={'orderId':sale['id'],'amount':10,**method})
            self.assertEqual(payment.status_code,422,payment.text)
            checkout=client.post('/api/v1/orders/sales',json={**payload,'emitReceipt':True,'initialPayment':method})
            self.assertEqual(checkout.status_code,422,checkout.text)
        after=client.get('/api/v1/workspace').json()
        self.assertEqual(len(after['payments']),len(before['payments']))
        self.assertEqual(len(after['sales']),len(before['sales']))
        self.assertEqual(next(r for r in after['sales'] if r['id']==sale['id'])['paid'],0)
        self.assertEqual(next(r for r in after['products'] if r['id']==product['id'])['stock'],4)

    def test_dni_customer_validation_edit_and_supplier_rules(self):
        body={'name':'Cliente con DNI','documentType':'DNI','taxId':'01234567','email':'dni@example.test','phone':'999000001'}
        created=client.post('/api/v1/contacts/customers',json=body)
        self.assertEqual(created.status_code,201,created.text)
        customer=created.json()
        self.assertEqual(customer['taxId'],'01234567')
        self.assertEqual(customer['documentType'],'DNI')
        self.assertEqual(client.post('/api/v1/contacts/customers',json=body).status_code,409)
        self.assertEqual(client.post('/api/v1/contacts/suppliers',json=body).status_code,422)
        for invalid in [{**body,'taxId':'1234567'},{**body,'taxId':'12345678901'},{**body,'documentType':'RUC'},{**body,'documentType':'Otro'}]:
            self.assertEqual(client.post('/api/v1/contacts/customers',json=invalid).status_code,422)
        updated=client.put(f"/api/v1/contacts/customers/{customer['id']}",json={**body,'documentType':'RUC','taxId':'20999888776'})
        self.assertEqual(updated.status_code,200,updated.text)
        self.assertEqual(updated.json()['documentType'],'RUC')

    def test_sales_issue_document_from_identity_and_keep_snapshot(self):
        from datetime import datetime,timedelta,timezone
        product=client.post('/api/v1/products',json={'name':'Receipt product','sku':'RECEIPT-AUTO-01','category':'Pruebas','price':118,'cost':50,'stock':10,'minimum':1}).json()
        contacts=[]
        for doc,number in [('DNI','01234568'),('RUC','20999888775')]:
            body={'name':'Cliente '+doc,'documentType':doc,'taxId':number,'email':'receipt@example.test'}
            customer=client.post('/api/v1/contacts/customers',json=body).json();contacts.append((body,customer))
            sale=client.post('/api/v1/orders/sales',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}],'emitReceipt':True})
            self.assertEqual(sale.status_code,201,sale.text)
            invoice=sale.json()['invoice'];expected='Boleta' if doc=='DNI' else 'Factura'
            self.assertEqual(invoice['type'],expected)
            self.assertEqual(invoice['contact']['documentType'],doc)
            self.assertEqual(invoice['contact']['taxId'],number)
            self.assertEqual((invoice['subtotal'],invoice['tax'],invoice['total']),(100,18,118))
            self.assertEqual(client.post(f"/api/v1/orders/sales/{sale.json()['id']}/invoice",json={'dueDate':(datetime.now(timezone.utc)+timedelta(days=2)).date().isoformat()}).status_code,409)
        body,customer=contacts[0]
        unissued=client.post('/api/v1/orders/sales',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}]}).json()
        changed=client.put(f"/api/v1/contacts/customers/{customer['id']}",json={**body,'documentType':'RUC','taxId':'20999888774'})
        self.assertEqual(changed.status_code,200,changed.text)
        issued=client.post(f"/api/v1/orders/sales/{unissued['id']}/invoice",json={'dueDate':(datetime.now(timezone.utc)+timedelta(days=2)).date().isoformat()})
        self.assertEqual(issued.status_code,201,issued.text)
        self.assertEqual(issued.json()['invoice']['type'],'Boleta')
        self.assertEqual(issued.json()['invoice']['contact']['taxId'],'01234568')

    def test_sale_receipt_and_card_collection_are_one_transaction(self):
        product=client.post('/api/v1/products',json={'name':'Card checkout','sku':'CARD-CHECKOUT-01','category':'Pruebas','price':118,'cost':50,'stock':5,'minimum':1}).json()
        customer=client.post('/api/v1/contacts/customers',json={'name':'Checkout DNI','documentType':'DNI','taxId':'01234569','email':'checkout@example.test'}).json()
        payload={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':2}],'emitReceipt':True,'initialPayment':{'method':'Tarjeta','paymentReference':'  000-VOUCHER-12  '}}
        before=client.get('/api/v1/workspace').json()
        rejected=client.post('/api/v1/orders/sales',json={**payload,'receiptDueDate':'2000-01-01'})
        self.assertEqual(rejected.status_code,422,rejected.text)
        after=client.get('/api/v1/workspace').json()
        self.assertEqual(len(after['sales']),len(before['sales']))
        self.assertEqual(len(after['payments']),len(before['payments']))
        self.assertEqual(next(p for p in after['products'] if p['id']==product['id'])['stock'],5)
        result=client.post('/api/v1/orders/sales',json=payload)
        self.assertEqual(result.status_code,201,result.text)
        sale=result.json()
        self.assertEqual((sale['status'],sale['paid'],sale['invoice']['type']),('Pagado',236,'Boleta'))
        workspace=client.get('/api/v1/workspace').json()
        payments=[p for p in workspace['payments'] if p['orderId']==sale['id']]
        self.assertEqual(len(payments),1)
        self.assertEqual((payments[0]['method'],payments[0]['paymentReference'],payments[0]['amount']),('Tarjeta','000-VOUCHER-12',236))
        self.assertEqual(next(p for p in workspace['products'] if p['id']==product['id'])['stock'],3)

    def test_partial_collections_keep_independent_payment_methods(self):
        workspace=client.get('/api/v1/workspace').json()
        product=client.post('/api/v1/products',json={'name':'Payment method item','sku':'METHOD-FLOW-01','category':'Pruebas','price':100,'cost':50,'stock':5,'minimum':1}).json()
        customer=workspace['customers'][0]
        sale=client.post('/api/v1/orders/sales',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}]}).json()
        self.assertEqual(client.post('/api/v1/payments',json={'orderId':sale['id'],'amount':25,'method':'Unknown'}).status_code,422)
        for amount,method,reference in [(25,'Yape','00001234'),(75,'Tarjeta','VOUCHER-02')]:
            payment=client.post('/api/v1/payments',json={'orderId':sale['id'],'amount':amount,'method':method,'paymentReference':reference})
            self.assertEqual(payment.status_code,201,payment.text)
            self.assertEqual((payment.json()['method'],payment.json()['paymentReference']),(method,reference))
        workspace=client.get('/api/v1/workspace').json()
        saved=next(r for r in workspace['sales'] if r['id']==sale['id'])
        self.assertEqual((saved['status'],saved['paid']),('Pagado',100))
        self.assertEqual(len([p for p in workspace['payments'] if p['orderId']==sale['id']]),2)

    def test_dispatched_sale_cannot_be_cancelled_and_invalid_stage_is_a_conflict(self):
        product=client.post('/api/v1/products',json={'name':'Dispatch guard','sku':'DISPATCH-GUARD-01','category':'Pruebas','price':100,'cost':50,'stock':10,'minimum':1}).json()
        customer=client.get('/api/v1/workspace').json()['customers'][0]
        created=client.post('/api/v1/orders/sales',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':1}]})
        self.assertEqual(created.status_code,201,created.text)
        order=created.json();url=f"/api/v1/orders/sales/{order['id']}"
        for stage in ['Preparando','Despachado']:
            response=client.post(url+'/tracking',json={'stage':stage,'note':'Despacho de prueba'})
            self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(client.post(url+'/cancel').status_code,409)
        workspace=client.get('/api/v1/workspace').json()
        self.assertEqual(next(p for p in workspace['products'] if p['id']==product['id'])['stock'],9)
        from sqlalchemy.orm import Session
        from app.models import Record
        with Session(engine) as session,session.begin():
            stored=session.get(Record,order['id']);stored.data={**stored.data,'deliveryStage':'Unknown legacy stage'}
        self.assertEqual(client.post(url+'/tracking',json={'stage':'Entregado','note':'No continuar estado incorrecto'}).status_code,409)

    def test_quote_conversion_preserves_prices_and_is_atomic(self):
        from datetime import datetime, timedelta, timezone
        product=client.post('/api/v1/products',json={'name':'Quote item','sku':'QUOTE-FLOW-01','category':'Pruebas','price':118,'cost':50,'stock':2,'minimum':1}).json()
        customer=client.post('/api/v1/contacts/customers',json={'name':'Quote customer','taxId':'20987654320','email':'quote@example.test','phone':''}).json()
        future=(datetime.now(timezone.utc)+timedelta(days=10)).date().isoformat()
        body={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':3}],'validUntil':future,'deliveryDate':future,'paymentDays':30,'notes':'Commercial terms'}
        before=client.get('/api/v1/workspace').json()
        quote=client.post('/api/v1/quotes',json=body)
        self.assertEqual(quote.status_code,201,quote.text)
        q=quote.json();url=f"/api/v1/quotes/{q['id']}"
        workspace=client.get('/api/v1/workspace').json()
        self.assertEqual(len(workspace['sales']),len(before['sales']))
        self.assertEqual(next(p for p in workspace['products'] if p['id']==product['id'])['stock'],2)
        self.assertEqual(client.post(url+'/confirm').status_code,409)
        workspace=client.get('/api/v1/workspace').json()
        self.assertEqual(next(r for r in workspace['quotes'] if r['id']==q['id'])['status'],'Cotizaci\u00f3n')
        client.post('/api/v1/inventory/adjustments',json={'productId':product['id'],'quantity':2,'reason':'Restock quote item'})
        changed=client.put(f"/api/v1/products/{product['id']}",json={**{k:product[k] for k in ['name','sku','category','cost','minimum']},'price':200,'stock':4})
        self.assertEqual(changed.status_code,200,changed.text)
        confirmed=client.post(url+'/confirm')
        self.assertEqual(confirmed.status_code,200,confirmed.text)
        sale=confirmed.json()['order']
        self.assertEqual(sale['amount'],354)
        self.assertEqual(sale['quoteId'],q['id'])
        self.assertEqual(client.post(url+'/confirm').status_code,409)
        self.assertEqual(client.post(url+'/reject').status_code,409)
        workspace=client.get('/api/v1/workspace').json()
        self.assertEqual(next(p for p in workspace['products'] if p['id']==product['id'])['stock'],1)
        self.assertEqual(len([r for r in workspace['sales'] if r.get('quoteId')==q['id']]),1)
        invoice=client.post(f"/api/v1/orders/sales/{sale['id']}/invoice",json={'dueDate':future,'taxRate':18})
        self.assertEqual(invoice.status_code,201,invoice.text)
        self.assertEqual(invoice.json()['invoice']['total'],354)

    def test_quotes_rejection_expiry_and_permissions(self):
        from datetime import datetime, timedelta, timezone
        workspace=client.get('/api/v1/workspace').json()
        future=(datetime.now(timezone.utc)+timedelta(days=10)).date().isoformat()
        body={'contactId':workspace['customers'][0]['id'],'lines':[{'productId':workspace['products'][0]['id'],'quantity':1}],'validUntil':future,'deliveryDate':future}
        self.assertEqual(client.post('/api/v1/quotes',json={**body,'validUntil':'2000-01-01'}).status_code,422)
        quote=client.post('/api/v1/quotes',json=body).json()
        url=f"/api/v1/quotes/{quote['id']}"
        self.assertEqual(client.post(url+'/reject').status_code,200)
        self.assertEqual(client.post(url+'/confirm').status_code,409)
        account=client.post('/api/v1/users',json={'name':'Quote viewer','email':'quote-viewer@example.test','password':'Testing-local-2026!','role':'Consulta'})
        self.assertEqual(account.status_code,201,account.text)
        with TestClient(app) as viewer:
            viewer.post('/api/v1/auth/login',json={'email':'quote-viewer@example.test','password':'Testing-local-2026!'})
            self.assertEqual(viewer.post('/api/v1/quotes',json=body).status_code,403)
            self.assertEqual(viewer.post(url+'/confirm').status_code,403)

    def test_invoice_snapshot_tracking_and_payments(self):
        from datetime import datetime, timedelta, timezone
        product=client.post('/api/v1/products',json={'name':'Invoice test item','sku':'INVOICE-FLOW-01','category':'Pruebas','price':118,'cost':50,'stock':10,'minimum':1}).json()
        customer=client.post('/api/v1/contacts/customers',json={'name':'Invoice customer','taxId':'20987654321','email':'invoice@example.test','phone':''}).json()
        created=client.post('/api/v1/orders/sales',json={'contactId':customer['id'],'lines':[{'productId':product['id'],'quantity':2}]})
        self.assertEqual(created.status_code,201,created.text)
        order=created.json(); url=f"/api/v1/orders/sales/{order['id']}"
        body={'dueDate':(datetime.now(timezone.utc)+timedelta(days=7)).date().isoformat(),'taxRate':18}
        invoice=client.post(url+'/invoice',json=body)
        self.assertEqual(invoice.status_code,201,invoice.text)
        snapshot=invoice.json()['invoice']
        self.assertEqual((snapshot['subtotal'],snapshot['tax'],snapshot['total']),(200,36,236))
        self.assertEqual(snapshot['contact']['taxId'],'20987654321')
        self.assertEqual(client.post(url+'/invoice',json=body).status_code,409)
        self.assertEqual(client.post(url+'/tracking',json={'stage':'Entregado','note':'No saltar pasos'}).status_code,409)
        for stage in ['Preparando','Despachado','Entregado']:
            result=client.post(url+'/tracking',json={'stage':stage,'note':'Constancia de prueba'})
            self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(len(result.json()['tracking']),3)
        self.assertEqual(result.json()['invoice'],snapshot)
        self.assertEqual(client.post('/api/v1/payments',json={'orderId':order['id'],'amount':100,'method':'Efectivo'}).status_code,201)
        saved=next(r for r in client.get('/api/v1/workspace').json()['sales'] if r['id']==order['id'])
        self.assertEqual(saved['paid'],100)
        self.assertEqual(saved['invoice'],snapshot)
        self.assertEqual(client.post(url+'/cancel').status_code,409)

    def test_invoice_purchase_validation_and_access(self):
        from datetime import datetime, timedelta, timezone
        workspace=client.get('/api/v1/workspace').json()
        supplier=workspace['suppliers'][0];product=workspace['products'][0]
        due=(datetime.now(timezone.utc)+timedelta(days=5)).date().isoformat()
        orders=[]
        for _ in range(2):
            result=client.post('/api/v1/orders/purchases',json={'contactId':supplier['id'],'lines':[{'productId':product['id'],'quantity':1}]})
            self.assertEqual(result.status_code,201,result.text)
            orders.append(result.json())
        url=f"/api/v1/orders/purchases/{orders[0]['id']}/invoice"
        self.assertEqual(client.post(url,json={'dueDate':due}).status_code,422)
        self.assertEqual(client.post(url,json={'dueDate':'2000-01-01','supplierReference':'PROV-TEST-01'}).status_code,422)
        body={'dueDate':due,'supplierReference':'PROV-TEST-01','taxRate':0}
        result=client.post(url,json=body)
        self.assertEqual(result.status_code,201,result.text)
        self.assertEqual(result.json()['invoice']['tax'],0)
        second=f"/api/v1/orders/purchases/{orders[1]['id']}"
        self.assertEqual(client.post(second+'/invoice',json=body).status_code,409)
        self.assertEqual(client.post(second+'/tracking',json={'stage':'Preparando','note':'Not allowed'}).status_code,409)
        account=client.post('/api/v1/users',json={'name':'Invoice viewer','email':'invoice-viewer@example.test','password':'Testing-local-2026!','role':'Consulta'})
        self.assertEqual(account.status_code,201,account.text)
        with TestClient(app) as viewer:
            viewer.post('/api/v1/auth/login',json={'email':'invoice-viewer@example.test','password':'Testing-local-2026!'})
            self.assertEqual(viewer.post(second+'/invoice',json={**body,'supplierReference':'OTHER'}).status_code,403)

    def test_read_only_user_can_transfer_large_profile_photo(self):
        import time
        import uuid
        from app.transfers import PART_SIZE
        account=client.post('/api/v1/users',json={'name':'Large photo','email':'large-photo@example.test','password':'Transfer-photo-2026!','role':'Consulta'})
        self.assertEqual(account.status_code,201,account.text)
        image=io.BytesIO()
        Image.new('RGB',(32,32),'green').save(image,format='PNG')
        content=image.getvalue()+b'\0'*(4*1024*1024+1)
        token=f'{int(time.time())}-{uuid.uuid4().hex}'
        parts=(len(content)+PART_SIZE-1)//PART_SIZE
        with TestClient(app) as owner:
            owner.post('/api/v1/auth/login',json={'email':'large-photo@example.test','password':'Transfer-photo-2026!'})
            for index in range(parts):
                result=owner.post(f'/api/v1/me/transfers/{token}/{index}',files={'file':('part',content[index*PART_SIZE:(index+1)*PART_SIZE])})
                self.assertEqual(result.status_code,200,result.text)
            result=owner.post('/api/v1/me/avatar',data={'transfer':token,'parts':parts,'filename':'large.png'})
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(owner.get(result.json()['user']['avatarUrl']).status_code,200)
            self.assertEqual(owner.delete('/api/v1/me/avatar').status_code,200)

    def test_large_document_transfer_is_private_and_round_trips(self):
        import time
        import uuid
        from app.transfers import PART_SIZE
        token=f'{int(time.time())}-{uuid.uuid4().hex}'
        content=b'Large private document\n' * 250000
        parts=(len(content)+PART_SIZE-1)//PART_SIZE
        for index in range(parts):
            response=client.post(f'/api/v1/me/transfers/{token}/{index}',
                files={'file':('part',content[index*PART_SIZE:(index+1)*PART_SIZE])})
            self.assertEqual(response.status_code,200,response.text)
        account=client.post('/api/v1/users',json={'name':'Transfer stranger','email':'transfer-stranger@example.test','password':'Transfer-test-2026!','role':'Comercial'})
        self.assertEqual(account.status_code,201,account.text)
        with TestClient(app) as stranger:
            stranger.post('/api/v1/auth/login',json={'email':'transfer-stranger@example.test','password':'Transfer-test-2026!'})
            stolen=stranger.post('/api/v1/documents',data={'transfer':token,'parts':parts,'filename':'private.txt'})
            self.assertEqual(stolen.status_code,422)
        result=client.post('/api/v1/documents',data={'transfer':token,'parts':parts,'filename':'large.txt','category':'General'})
        self.assertEqual(result.status_code,201,result.text)
        document=result.json()
        restored=b''.join(client.get(f'/api/v1/documents/{document["id"]}/download?part={i}').content for i in range(parts))
        self.assertEqual(restored,content)
        self.assertEqual(client.get(f'/api/v1/documents/{document["id"]}/download?part=-1').status_code,404)
        self.assertEqual(client.post('/api/v1/documents',data={'transfer':token,'parts':parts,'filename':'reuse.txt'}).status_code,422)
        self.assertEqual(client.post(f'/api/v1/me/transfers/{token}/5',files={'file':('part',b'test')}).status_code,422)
        self.assertEqual(client.delete(f'/api/v1/documents/{document["id"]}').status_code,200)

    def test_document_deletion_permissions_and_storage_failure(self):
        from unittest.mock import patch
        from pathlib import Path
        owner=client.post('/api/v1/users',json={'name':'Autor documentos','email':'document-owner@example.test','password':'Testing-local-2026!','role':'Comercial'})
        self.assertEqual(owner.status_code,201,owner.text)
        with TestClient(app) as browser, TestClient(app) as anonymous:
            self.assertEqual(browser.post('/api/v1/auth/login',json={'email':'document-owner@example.test','password':'Testing-local-2026!'}).status_code,200)
            own=browser.post('/api/v1/documents',files={'file':('eliminar.txt',b'Documento temporal')}).json()
            self.assertEqual(own['uploadedBy'],owner.json()['id'])
            self.assertEqual(anonymous.delete(f"/api/v1/documents/{own['id']}").status_code,401)
            admin_doc=client.post('/api/v1/documents',files={'file':('admin.txt',b'Solo administrador')}).json()
            self.assertEqual(browser.delete(f"/api/v1/documents/{admin_doc['id']}").status_code,403)
            workspace=browser.get('/api/v1/workspace').json()
            stored=next(d for d in workspace['documents'] if d['id']==own['id'])
            file_path=Path(os.environ['DOCUMENTS_DIR'])/stored['storageKey']
            self.assertTrue(file_path.is_file())
            with patch('app.operations.document_storage') as factory:
                factory.return_value.delete.side_effect=OSError('storage unavailable')
                self.assertEqual(browser.delete(f"/api/v1/documents/{own['id']}").status_code,503)
            self.assertEqual(browser.get(f"/api/v1/documents/{own['id']}/download").status_code,200)
            self.assertEqual(browser.delete(f"/api/v1/documents/{own['id']}").status_code,200)
            self.assertFalse(file_path.exists())
            self.assertEqual(browser.get(f"/api/v1/documents/{own['id']}/download").status_code,404)
            self.assertEqual(browser.delete(f"/api/v1/documents/{own['id']}").status_code,404)
            self.assertFalse(any(d['id']==own['id'] for d in self.workspace()['documents']))
            self.assertTrue(any(a['name']=='Documento eliminado: eliminar.txt' for a in self.workspace()['audit']))
            # Administrator can also remove an upload belonging to another user.
            other=browser.post('/api/v1/documents',files={'file':('otro.txt',b'Temporal')}).json()
            self.assertEqual(client.delete(f"/api/v1/documents/{other['id']}").status_code,200)
            self.assertEqual(client.delete(f"/api/v1/documents/{admin_doc['id']}").status_code,200)

    def test_required_fields_reject_whitespace_and_normalize(self):
        before=self.workspace()
        product={k:before['products'][0][k] for k in ['name','sku','category','price','cost','stock','minimum']}
        for field in ['name','sku','category']:
            self.assertEqual(client.post('/api/v1/products',json={**product,field:'   '}).status_code,422)
        contact={'name':'  Cliente normalizado  ','taxId':'20777777771','email':'  test@example.test  '}
        self.assertEqual(client.post('/api/v1/contacts/customers',json={**contact,'name':'   '}).status_code,422)
        response=client.post('/api/v1/contacts/customers',json=contact)
        self.assertEqual(response.status_code,201,response.text)
        self.assertEqual(response.json()['name'],'Cliente normalizado')
        self.assertEqual(response.json()['email'],'test@example.test')
        self.assertEqual(client.post('/api/v1/users',json={'name':'   ','email':'empty@example.test','password':'Testing-local-2026!','role':'Consulta'}).status_code,422)
        self.assertEqual(client.post('/api/v1/users',json={'name':'Usuario prueba','email':'blank-password@example.test','password':' '*12,'role':'Consulta'}).status_code,422)
        self.assertEqual(client.post('/api/v1/contacts/customers',json={**contact,'taxId':'２０１０００００００１'}).status_code,422)
        self.assertEqual(client.put('/api/v1/company',json={'name':'   ','taxId':'20100000001','email':'a@example.test','address':''}).status_code,422)
        self.assertEqual(client.post('/api/v1/inventory/adjustments',json={'productId':product.get('id',before['products'][0]['id']),'quantity':1,'reason':'     '}).status_code,422)
        self.assertEqual(client.post('/api/v1/documents',files={'file':('test.txt',b'Test')},data={'category':'   '}).status_code,422)

    def test_numeric_limits_and_zero_cost_purchase(self):
        before=self.workspace()
        product=before['products'][0]
        for invalid in [True,1.5]:
            self.assertEqual(client.post('/api/v1/products',json={**product,'stock':invalid}).status_code,422)
        self.assertEqual(client.post('/api/v1/products',json={**product,'minimum':1000001}).status_code,422)
        response=client.post('/api/v1/orders/purchases',json={'contactId':before['suppliers'][0]['id'],'lines':[{'productId':product['id'],'quantity':100000},{'productId':product['id'],'quantity':1}]})
        self.assertEqual(response.status_code,422,response.text)
        self.assertEqual(self.workspace()['products'],before['products'])
        created=client.post('/api/v1/products',json={'name':'Sin costo','sku':'ZERO-COST-TEST','category':'Prueba','price':10,'cost':0,'stock':1000000,'minimum':0})
        self.assertEqual(created.status_code,201,created.text)
        pid=created.json()['id']
        purchase={'contactId':before['suppliers'][0]['id'],'lines':[{'productId':pid,'quantity':1}]}
        self.assertEqual(client.post('/api/v1/orders/purchases',json=purchase).status_code,409)
        self.assertEqual(client.post('/api/v1/inventory/adjustments',json={'productId':pid,'quantity':1,'reason':'Prueba de limite'}).status_code,409)
        self.assertEqual(client.post('/api/v1/inventory/adjustments',json={'productId':pid,'quantity':-1,'reason':'Liberar espacio'}).status_code,201)
        response=client.post('/api/v1/orders/purchases',json=purchase)
        self.assertEqual(response.status_code,201,response.text)
        self.assertEqual(response.json()['amount'],0)
        self.assertEqual(response.json()['status'],'Pagado')
        sale=client.post('/api/v1/orders/sales',json={'contactId':before['customers'][0]['id'],'lines':[{'productId':pid,'quantity':1}]})
        self.assertEqual(sale.status_code,201,sale.text)
        self.assertEqual(client.post('/api/v1/orders/purchases',json=purchase).status_code,201)
        self.assertEqual(client.post(f"/api/v1/orders/sales/{sale.json()['id']}/cancel").status_code,409)

    def test_deactivation_permanently_revokes_old_session(self):
        response=client.post('/api/v1/users',json={'name':'Sesion revocada','email':'revoked@example.test','password':'Testing-local-2026!','role':'Consulta'})
        self.assertEqual(response.status_code,201,response.text)
        uid=response.json()['id']
        with TestClient(app) as other:
            self.assertEqual(other.post('/api/v1/auth/login',json={'email':'revoked@example.test','password':'Testing-local-2026!'}).status_code,200)
            self.assertEqual(client.post(f'/api/v1/users/{uid}/toggle').status_code,200)
            self.assertEqual(client.post(f'/api/v1/users/{uid}/toggle').status_code,200)
            self.assertEqual(other.get('/api/v1/workspace').status_code,401)

    def test_readiness_and_request_id(self):
        from unittest.mock import patch
        response=client.get('/api/v1/ready')
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(response.headers['X-Request-ID']),32)
        with patch.object(engine,'connect',side_effect=RuntimeError('database unavailable')):
            self.assertEqual(client.get('/api/v1/ready').status_code,503)

    def workspace(self): return client.get('/api/v1/workspace').json()

    def test_sale_stock_payment_and_audit(self):
        before = self.workspace()
        p = before['products'][0]
        body = {'contactId':before['customers'][0]['id'],'lines':[{'productId':p['id'],'quantity':1}]}
        sale = client.post('/api/v1/orders/sales',json=body)
        self.assertEqual(sale.status_code,201,sale.text)
        sale = sale.json()
        self.assertEqual(sale['amount'],p['price'])
        after = self.workspace()
        self.assertEqual(next(x for x in after['products'] if x['id']==p['id'])['stock'],p['stock']-1)
        self.assertEqual(len(after['movements']),len(before['movements'])+1)
        self.assertEqual(len(after['audit']),len(before['audit'])+1)
        partial = client.post('/api/v1/payments',json={'orderId':sale['id'],'amount':100,'method':'Efectivo'})
        self.assertEqual(partial.status_code,201)
        excessive = client.post('/api/v1/payments',json={'orderId':sale['id'],'amount':sale['amount'],'method':'Efectivo'})
        self.assertEqual(excessive.status_code,409)
        final = client.post('/api/v1/payments',json={'orderId':sale['id'],'amount':sale['amount']-100,'method':'Efectivo'})
        self.assertEqual(final.status_code,201)
        self.assertEqual(next(x for x in self.workspace()['sales'] if x['id']==sale['id'])['status'],'Pagado')

    def test_failed_sale_rolls_back_all_lines(self):
        before=self.workspace(); a,b=before['products'][:2]
        response=client.post('/api/v1/orders/sales',json={'contactId':before['customers'][0]['id'],'lines':[{'productId':a['id'],'quantity':1},{'productId':b['id'],'quantity':b['stock']+1}]})
        self.assertEqual(response.status_code,409)
        after=self.workspace()
        self.assertEqual(after['products'],before['products'])
        self.assertEqual(after['sales'],before['sales'])
        self.assertEqual(after['movements'],before['movements'])

    def test_purchase_receives_stock(self):
        before=self.workspace(); p=before['products'][0]
        response=client.post('/api/v1/orders/purchases',json={'contactId':before['suppliers'][0]['id'],'lines':[{'productId':p['id'],'quantity':2}]})
        self.assertEqual(response.status_code,201,response.text)
        self.assertEqual(response.json()['amount'],p['cost']*2)
        self.assertEqual(self.workspace()['products'][0]['stock'],p['stock']+2)

    def test_validation_and_duplicate_sku(self):
        p=self.workspace()['products'][0]
        self.assertEqual(client.post('/api/v1/products',json={**p,'stock':-1}).status_code,422)
        self.assertEqual(client.post('/api/v1/products',json=p).status_code,409)
        self.assertEqual(client.post('/api/v1/contacts/customers',json={'name':'Prueba','taxId':'123','email':'a@b.com'}).status_code,422)

    def test_duplicate_lines_cannot_overdraw_stock(self):
        before=self.workspace(); p=before['products'][0]
        response=client.post('/api/v1/orders/sales',json={'contactId':before['customers'][0]['id'],'lines':[{'productId':p['id'],'quantity':p['stock']},{'productId':p['id'],'quantity':1}]})
        self.assertEqual(response.status_code,409)
        self.assertEqual(self.workspace()['products'],before['products'])

    def test_documents_round_trip_and_restrictions(self):
        response=client.post('/api/v1/documents',files={'file':('contrato.txt',b'Contrato de prueba','text/plain')},data={'category':'Contratos','reference':'TEST-1'})
        self.assertEqual(response.status_code,201,response.text)
        downloaded=client.get(f"/api/v1/documents/{response.json()['id']}/download")
        self.assertEqual(downloaded.content,b'Contrato de prueba')
        self.assertIn('attachment',downloaded.headers['content-disposition'])
        self.assertEqual(client.post('/api/v1/documents',files={'file':('unsafe.html',b'<script/>')}).status_code,422)
        self.assertEqual(client.get('/api/v1/documents/999999/download').status_code,404)

    def test_edit_contact_product_and_adjustment(self):
        before=self.workspace(); c=before['customers'][0]; p=before['products'][0]
        r=client.put(f"/api/v1/contacts/customers/{c['id']}",json={**c,'name':'Cliente actualizado'})
        self.assertEqual(r.status_code,200,r.text)
        r=client.put(f"/api/v1/products/{p['id']}",json={**p,'name':'Producto actualizado'})
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(client.put(f"/api/v1/products/{p['id']}",json={**p,'stock':99999}).status_code,409)
        r=client.post('/api/v1/inventory/adjustments',json={'productId':p['id'],'quantity':3,'reason':'Conteo físico verificado'})
        self.assertEqual(r.status_code,201,r.text)
        self.assertEqual(r.json()['stock'],p['stock']+3)
        self.assertEqual(client.post('/api/v1/inventory/adjustments',json={'productId':p['id'],'quantity':-100000,'reason':'Salida inválida'}).status_code,409)

    def test_cancellation_reverts_stock_and_rejects_payment(self):
        before=self.workspace(); p=before['products'][0]
        sale=client.post('/api/v1/orders/sales',json={'contactId':before['customers'][0]['id'],'lines':[{'productId':p['id'],'quantity':2}]}).json()
        cancelled=client.post(f"/api/v1/orders/sales/{sale['id']}/cancel")
        self.assertEqual(cancelled.status_code,200,cancelled.text)
        self.assertEqual(self.workspace()['products'][0]['stock'],p['stock'])
        self.assertEqual(client.post('/api/v1/payments',json={'orderId':sale['id'],'amount':1,'method':'Efectivo'}).status_code,409)
        self.assertEqual(client.post(f"/api/v1/orders/sales/{sale['id']}/cancel").status_code,409)

    def test_sessions_roles_and_company(self):
        with TestClient(app) as anonymous:
            self.assertEqual(anonymous.get('/api/v1/workspace').status_code,401)
            self.assertEqual(anonymous.get('/api/v1/auth/session').json()['needsSetup'],False)
            self.assertEqual(anonymous.post('/api/v1/auth/login',json={'email':'admin@example.test','password':'incorrect'}).status_code,401)
            self.assertEqual(anonymous.post('/api/v1/auth/setup',json={'name':'Otro','email':'otro@example.test','password':'Another-test-123!'}).status_code,409)
        created=client.post('/api/v1/users',json={'name':'Lector','email':'reader@example.test','password':'Reader-test-2026!','role':'Consulta'})
        self.assertEqual(created.status_code,201,created.text)
        self.assertNotIn('password',created.json())
        with TestClient(app) as reader:
            login=reader.post('/api/v1/auth/login',json={'email':'reader@example.test','password':'Reader-test-2026!'})
            self.assertEqual(login.status_code,200)
            self.assertTrue(login.cookies.get('enterprisecloud_session'))
            self.assertIn('HttpOnly',login.headers['set-cookie'])
            self.assertEqual(reader.get('/api/v1/workspace').status_code,200)
            self.assertEqual(reader.get('/api/v1/users').status_code,403)
            self.assertEqual(reader.get('/api/v1/admin/overview').status_code,403)
            self.assertEqual(reader.get('/api/v1/admin/sessions').status_code,403)
            p=self.workspace()['products'][0]
            self.assertEqual(reader.post('/api/v1/products',json=p).status_code,403)
            self.assertEqual(reader.post('/api/v1/documents',files={'file':('test.txt',b'read only')}).status_code,403)
            self.assertEqual(client.post(f"/api/v1/users/{created.json()['id']}/toggle").status_code,200)
            self.assertEqual(reader.get('/api/v1/workspace').status_code,401)
        company={'name':'Empresa de prueba SAC','taxId':'20111111111','email':'test@example.test','phone':'123','address':'Lima'}
        self.assertEqual(client.put('/api/v1/company',json=company).status_code,200)
        self.assertEqual(client.get('/api/v1/company').json(),company)

    def test_admin_panel_permissions_and_session_management(self):
        overview=client.get('/api/v1/admin/overview')
        self.assertEqual(overview.status_code,200,overview.text)
        self.assertGreaterEqual(overview.json()['admins'],1)
        me=client.get('/api/v1/auth/session').json()['user']
        self.assertEqual(client.patch(f"/api/v1/users/{me['id']}",json={**me,'role':'Consulta'}).status_code,409)
        created=client.post('/api/v1/users',json={'name':'Operador de prueba','email':'operator@example.test','password':'Operator-test-2026!','role':'Comercial'}).json()
        with TestClient(app) as operator:
            self.assertEqual(operator.post('/api/v1/auth/login',json={'email':created['email'],'password':'Operator-test-2026!'}).status_code,200)
            updated=client.patch(f"/api/v1/users/{created['id']}",json={'name':'Operador actualizado','email':created['email'],'role':'Consulta'})
            self.assertEqual(updated.status_code,200,updated.text)
            self.assertNotIn('password',updated.json())
            self.assertEqual(operator.get('/api/v1/workspace').status_code,401)
            operator.post('/api/v1/auth/login',json={'email':created['email'],'password':'Operator-test-2026!'})
            sessions=client.get('/api/v1/admin/sessions').json()
            self.assertTrue(all('token' not in s for s in sessions))
            target=next(s for s in sessions if s['userId']==created['id'])
            self.assertEqual(client.delete(f"/api/v1/admin/sessions/{target['id']}").status_code,200)
            self.assertEqual(operator.get('/api/v1/workspace').status_code,401)
            current=next(s for s in sessions if s['current'])
            self.assertEqual(client.delete(f"/api/v1/admin/sessions/{current['id']}").status_code,409)
        with TestClient(app) as anon:
            self.assertEqual(anon.get('/api/v1/admin/overview').status_code,401)

    def test_administration_hidden_from_every_non_admin_role(self):
        for index,role in enumerate(['Comercial','Compras','Almacén','Finanzas','Consulta']):
            email=f'restricted{index}@example.test'
            created=client.post('/api/v1/users',json={'name':'Acceso restringido','email':email,'password':'Restricted-test-2026!','role':role})
            self.assertEqual(created.status_code,201,created.text)
            with TestClient(app) as restricted:
                restricted.post('/api/v1/auth/login',json={'email':email,'password':'Restricted-test-2026!'})
                for path in ['admin/overview','admin/sessions','users']:
                    self.assertEqual(restricted.get('/api/v1/'+path).status_code,403,role+' '+path)
                self.assertEqual(restricted.get('/api/v1/workspace').json()['audit'],[],role)
        self.assertTrue(self.workspace()['audit'])

    def test_personal_profile_is_owned_and_cannot_elevate_permissions(self):
        created=client.post('/api/v1/users',json={'name':'Perfil de prueba','email':'profile@example.test','password':'Profile-test-2026!','role':'Consulta'}).json()
        with TestClient(app) as owner:
            owner.post('/api/v1/auth/login',json={'email':created['email'],'password':'Profile-test-2026!'})
            profile=owner.get('/api/v1/me/profile').json()['profile']
            updated={**profile,'name':'Nombre actualizado','alias':'Mi alias','bio':'Biografía de prueba','organization':'Mi organización','avatarColor':'blue','weeklySummary':True}
            response=owner.patch('/api/v1/me/profile',json=updated)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(owner.get('/api/v1/me/profile').json()['profile'],updated)
            self.assertEqual(owner.get('/api/v1/auth/session').json()['user']['name'],updated['name'])
            self.assertEqual(owner.patch('/api/v1/me/profile',json={**updated,'role':'Administrador'}).status_code,422)
            self.assertEqual(owner.patch('/api/v1/me/profile',json={**updated,'id':1}).status_code,422)
            self.assertEqual(owner.patch('/api/v1/me/profile',json={**updated,'name':'   '}).status_code,422)
            self.assertEqual(owner.get('/api/v1/admin/overview').status_code,403)
            exported=owner.get('/api/v1/me/export').json()
            self.assertEqual(exported['account']['id'],created['id'])
            self.assertEqual(exported['account']['role'],'Consulta')
            self.assertNotIn('password',exported['account'])
            self.assertNotIn('token',str(exported))
        self.assertNotEqual(client.get('/api/v1/me/profile').json()['profile']['name'],updated['name'])
        with TestClient(app) as anonymous:
            self.assertEqual(anonymous.get('/api/v1/me/profile').status_code,401)
            self.assertEqual(anonymous.get('/api/v1/me/export').status_code,401)

    def test_profile_photo_upload_validation_and_access(self):
        image=io.BytesIO();metadata=PngImagePlugin.PngInfo();metadata.add_text('private-note','should be stripped')
        Image.new('RGBA',(1024,512),(30,140,110,200)).save(image,format='PNG',pnginfo=metadata)
        created=client.post('/api/v1/users',json={'name':'Foto de prueba','email':'photo@example.test','password':'Photo-test-2026!','role':'Consulta'}).json()
        other=client.post('/api/v1/users',json={'name':'Otro perfil','email':'other-photo@example.test','password':'Other-photo-2026!','role':'Consulta'}).json()
        with TestClient(app) as owner,TestClient(app) as stranger:
            owner.post('/api/v1/auth/login',json={'email':created['email'],'password':'Photo-test-2026!'})
            stranger.post('/api/v1/auth/login',json={'email':other['email'],'password':'Other-photo-2026!'})
            response=owner.post('/api/v1/me/avatar',files={'file':('profile.png',image.getvalue(),'image/png')})
            self.assertEqual(response.status_code,200,response.text)
            self.assertNotIn('avatarKey',response.json()['user'])
            url=response.json()['user']['avatarUrl']
            photo=owner.get(url)
            self.assertEqual(photo.status_code,200)
            self.assertEqual(photo.headers['content-type'],'image/png')
            with Image.open(io.BytesIO(photo.content)) as saved_image:
                self.assertEqual(saved_image.size,(512,256))
                self.assertNotIn('private-note',saved_image.info)
            self.assertEqual(stranger.get(url).status_code,403)
            self.assertEqual(client.get(url).status_code,200)
            listed=next(u for u in client.get('/api/v1/users').json()['users'] if u['id']==created['id'])
            self.assertEqual(listed['avatarUrl'],url)
            self.assertNotIn('avatarKey',listed)
            self.assertEqual(owner.post('/api/v1/me/avatar',files={'file':('bad.jpg',b'<script>not an image</script>','image/jpeg')}).status_code,422)
            self.assertEqual(owner.post('/api/v1/me/avatar',files={'file':('large.png',b'x'*(5*1024*1024+1),'image/png')}).status_code,413)
            self.assertEqual(owner.get('/api/v1/auth/session').json()['user']['avatarUrl'],url)
            replacement=owner.post('/api/v1/me/avatar',files={'file':('new.png',image.getvalue(),'image/png')}).json()['user']['avatarUrl']
            self.assertNotEqual(replacement,url)
            self.assertEqual(owner.get(url).status_code,404)
            with TestClient(app) as anonymous:
                self.assertEqual(anonymous.get(replacement).status_code,401)
            self.assertEqual(owner.delete('/api/v1/me/avatar').status_code,200)
            self.assertNotIn('avatarUrl',owner.get('/api/v1/auth/session').json()['user'])
            self.assertEqual(owner.get(replacement).status_code,404)

if __name__=='__main__': unittest.main()


class GoogleAuthTests(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        self.env=patch.dict(os.environ, GOOGLE_CLIENT_ID='test-client.apps.googleusercontent.com',
            GOOGLE_ADMIN_EMAIL='google-admin@gmail.com', GOOGLE_ALLOW_SIGNUP='false', GOOGLE_ALLOWED_EMAILS='allowed@gmail.com,disabled@gmail.com')
        self.env.start()
        self.browser=TestClient(app)

    def tearDown(self):
        self.browser.close()
        self.env.stop()

    def sign_in(self,email='google-admin@gmail.com',subject='google-admin-subject',intent='register',**extra):
        from unittest.mock import patch
        nonce=self.browser.get('/api/v1/auth/google/challenge').json()['nonce']
        claims={'sub':subject,'email':email,'email_verified':True,'nonce':nonce,'name':'Google User',**extra}
        with patch('app.google_login.verify_credential',return_value=claims):
            return self.browser.post('/api/v1/auth/google',json={'credential':'signed-token','intent':intent},headers={'Origin':'http://localhost:5173'})

    def test_configuration_and_disabled_login(self):
        from unittest.mock import patch
        with patch.dict(os.environ,GOOGLE_CLIENT_ID=''):
            self.assertFalse(self.browser.get('/api/v1/auth/google/config').json()['enabled'])
            self.assertEqual(self.browser.get('/api/v1/auth/google/challenge').status_code,503)

    def test_designated_admin_and_session(self):
        response=self.sign_in()
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['role'],'Administrador')
        self.assertNotIn('password',response.json())
        self.assertIn('HttpOnly',response.headers['set-cookie'])
        self.assertEqual(self.browser.get('/api/v1/auth/session').json()['user']['email'],'google-admin@gmail.com')
        self.assertEqual(self.browser.get('/api/v1/users').status_code,200)
        self.assertEqual(self.sign_in(intent='login').json()['id'],response.json()['id'])

    def test_allowed_new_user_has_only_read_access(self):
        response=self.sign_in('allowed@gmail.com','allowed-subject')
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['role'],'Consulta')
        self.assertEqual(self.browser.get('/api/v1/users').status_code,403)
        self.assertEqual(self.browser.post('/api/v1/products',json={}).status_code,403)

    def test_unknown_unverified_and_mismatched_nonce_rejected(self):
        self.assertEqual(self.sign_in('unknown@gmail.com','unknown').status_code,403)
        self.assertEqual(self.sign_in('allowed@gmail.com','other',email_verified=False).status_code,401)
        self.assertEqual(self.sign_in('allowed@gmail.com','other',nonce='wrong-nonce').status_code,401)

    def test_login_requires_origin_cookie_and_single_use_challenge(self):
        from unittest.mock import patch
        nonce=self.browser.get('/api/v1/auth/google/challenge').json()['nonce']
        claims={'sub':'allowed-subject','email':'allowed@gmail.com','email_verified':True,'nonce':nonce,'name':'Allowed'}
        with patch('app.google_login.verify_credential',return_value=claims):
            self.assertEqual(self.browser.post('/api/v1/auth/google',json={'credential':'token'},headers={'Origin':'https://evil.example'}).status_code,403)
            first=self.browser.post('/api/v1/auth/google',json={'credential':'token'},headers={'Origin':'http://localhost:5173'})
            self.assertEqual(first.status_code,200,first.text)
            self.browser.cookies.set('enterprisecloud_google_nonce',nonce,path='/api/v1/auth/google')
            self.assertEqual(self.browser.post('/api/v1/auth/google',json={'credential':'token'},headers={'Origin':'http://localhost:5173'}).status_code,401)

    def test_google_port_5174_and_authenticated_writes_share_origin_policy(self):
        from unittest.mock import patch
        account=client.post('/api/v1/users',json={'name':'Port 5174','email':'port5174@gmail.com','password':'Testing-local-2026!','role':'Consulta'})
        self.assertEqual(account.status_code,201,account.text)
        nonce=self.browser.get('/api/v1/auth/google/challenge').json()['nonce']
        claims={'sub':'port5174-subject','email':'port5174@gmail.com','email_verified':True,'nonce':nonce,'name':'Port 5174'}
        with patch.dict(os.environ):
            os.environ.pop('ERP_ALLOWED_ORIGINS',None)
            with patch('app.google_login.verify_credential',return_value=claims):
                response=self.browser.post('/api/v1/auth/google',json={'credential':'token'},headers={'Origin':'http://127.0.0.1:5174'})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(self.browser.post('/api/v1/auth/logout',headers={'Origin':'https://evil.example'}).status_code,403)
            self.assertEqual(self.browser.post('/api/v1/auth/logout',headers={'Origin':'http://127.0.0.1:5174'}).status_code,200)
            with patch.dict(os.environ,ERP_ALLOWED_ORIGINS=' https://erp.example '):
                self.assertEqual(self.browser.post('/api/v1/auth/google',json={'credential':'token'},headers={'Origin':'http://127.0.0.1:5174'}).status_code,403)

    def test_disabled_account_and_invalid_signature_cannot_enter(self):
        from unittest.mock import patch
        from sqlalchemy.orm import Session
        from sqlalchemy import select
        from app.models import User
        with Session(engine) as s,s.begin():
            u=s.scalar(select(User).where(User.email=='disabled@gmail.com'))
            if not u:
                from app.main import add_record
                u=add_record(s,'users',dict(name='Disabled',email='disabled@gmail.com',password='unusable',role='Consulta',status='Inactivo'))
        self.assertEqual(self.sign_in('disabled@gmail.com','disabled-subject').status_code,403)
        self.browser.get('/api/v1/auth/google/challenge')
        with patch('app.google_login.verify_credential',side_effect=ValueError('bad signature')):
            self.assertEqual(self.browser.post('/api/v1/auth/google',json={'credential':'forged'},headers={'Origin':'http://localhost:5173'}).status_code,401)


    def test_public_gmail_registration_role_assignment_and_repeat_login(self):
        from unittest.mock import patch
        with patch.dict(os.environ, GOOGLE_ALLOW_SIGNUP='true'):
            self.assertTrue(self.browser.get('/api/v1/auth/google/config').json()['signupEnabled'])
            response=self.sign_in('new-student@gmail.com','new-student-subject',role='Administrador')
            self.assertEqual(response.status_code,200,response.text)
            user=response.json()
            self.assertEqual(user['role'],'Consulta')
            self.assertEqual(self.browser.get('/api/v1/users').status_code,403)
            self.assertEqual(self.browser.patch('/api/v1/users/'+str(user['id']),json={'name':user['name'],'email':user['email'],'role':'Administrador'}).status_code,403)
            self.assertEqual(self.browser.post('/api/v1/products',json={}).status_code,403)
            update=client.patch('/api/v1/users/'+str(user['id']),json={'name':user['name'],'email':user['email'],'role':'Comercial'})
            self.assertEqual(update.status_code,200,update.text)
            self.assertIsNone(self.browser.get('/api/v1/auth/session').json()['user'])
            again=self.sign_in('new-student@gmail.com','new-student-subject',intent='login')
            self.assertEqual(again.status_code,200,again.text)
            self.assertEqual(again.json()['id'],user['id'])
            self.assertEqual(again.json()['role'],'Comercial')

    def test_public_signup_rejects_non_gmail_and_unverified_accounts(self):
        from unittest.mock import patch
        with patch.dict(os.environ, GOOGLE_ALLOW_SIGNUP='true'):
            self.assertEqual(self.sign_in('student@company.test','workspace-student',hd='company.test').status_code,403)
            self.assertEqual(self.sign_in('unverified@gmail.com','unverified-student',email_verified=False).status_code,401)


    def test_login_and_registration_are_distinct_and_do_not_create_duplicates(self):
        from unittest.mock import patch
        from sqlalchemy import select
        from sqlalchemy.orm import Session
        from app.models import User, GoogleIdentity
        with patch.dict(os.environ,GOOGLE_ALLOW_SIGNUP='true'):
            email='separate-flows@gmail.com'
            rejected=self.sign_in(email,'separate-flows',intent='login')
            self.assertEqual(rejected.status_code,404,rejected.text)
            self.assertIsNone(self.browser.get('/api/v1/auth/session').json()['user'])
            with Session(engine) as s:
                self.assertIsNone(s.scalar(select(User).where(User.email==email)))
                self.assertIsNone(s.get(GoogleIdentity,'separate-flows'))
            registered=self.sign_in(email,'separate-flows',intent='register')
            self.assertEqual(registered.status_code,200,registered.text)
            self.browser.post('/api/v1/auth/logout')
            duplicate=self.sign_in(email,'separate-flows',intent='register')
            self.assertEqual(duplicate.status_code,409,duplicate.text)
            self.assertIsNone(self.browser.get('/api/v1/auth/session').json()['user'])
            logged_in=self.sign_in(email,'separate-flows',intent='login')
            self.assertEqual(logged_in.status_code,200,logged_in.text)
            self.assertEqual(logged_in.json()['id'],registered.json()['id'])
            with Session(engine) as s:
                self.assertEqual(len(list(s.scalars(select(User).where(User.email==email)))),1)
