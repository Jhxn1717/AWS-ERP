const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const cache=new Map();
function load(name){
 const filename=path.resolve(__dirname,'../src',name+'.ts');if(cache.has(filename))return cache.get(filename).exports;
 const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(filename,compiled);
 compiled.require=id=>id.startsWith('.')?load(path.relative(path.resolve(__dirname,'../src'),path.resolve(path.dirname(filename),id))):Module.prototype.require.call(compiled,id);
 compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);return compiled.exports;
}
const {invoiceDocument,invoiceDate}=load('invoicePresentation');
const source={id:42,kind:'sales',reference:'VEN-42',amount:118,paid:20,status:'Pendiente',paymentDays:15,lines:[{name:'Changed live product',quantity:99,price:999}],invoice:{type:'Boleta',number:'INT-B-42',issuedAt:'2026-11-05T01:00:00Z',dueDate:'2026-11-20',company:{name:'Empresa original',taxId:'20123456789'},contact:{name:'Cliente original',documentType:'DNI',taxId:'00123456'},lines:[{name:'Producto emitido',quantity:2,price:59}],subtotal:100,tax:18,total:118,taxRate:18}};
test('receipt presentation preserves saved identities, lines and tax instead of live catalog data',()=>{
 const original=JSON.stringify(source),bill=invoiceDocument(source);
 assert.equal(bill.type,'Boleta');assert.equal(bill.customerDocument,'DNI');assert.equal(bill.customer.taxId,'00123456');
 assert.equal(bill.lines[0].name,'Producto emitido');assert.equal(bill.lines[0].total,118);
 assert.equal(bill.total,118);assert.equal(bill.subtotal,100);assert.equal(bill.tax,18);
 assert.equal(bill.status,'Pago parcial');assert.equal(bill.outstanding,98);assert.equal(bill.terms,'Crédito a 15 días');
 assert.equal(JSON.stringify(source),original);
});
test('supplier invoices identify the supplier as issuer and the purchasing company as customer',()=>{
 const bill=invoiceDocument({...source,kind:'purchases',invoice:{...source.invoice,type:'Factura',number:'F001-42',contact:{name:'Proveedor',documentType:'RUC',taxId:'20987654321'}}});
 assert.equal(bill.issuer.name,'Proveedor');assert.equal(bill.customer.name,'Empresa original');assert.equal(bill.customerDocument,'RUC');assert.match(bill.notice,/proveedor/);
});
test('cancelled invoices keep original totals and have no collectible balance; payments stay scoped and ordered',()=>{
 const payments=[{id:1,orderId:42,date:'2026-11-05',amount:10},{id:2,orderId:43,date:'2026-11-01',amount:99},{id:3,orderId:42,date:'2026-11-04',amount:10}];
 const bill=invoiceDocument({...source,status:'Anulado'},payments);
 assert.equal(bill.cancelled,true);assert.equal(bill.status,'Anulado');assert.equal(bill.total,118);assert.equal(bill.outstanding,0);
 assert.deepEqual(bill.payments.map(p=>p.id),[3,1]);assert.deepEqual(payments.map(p=>p.id),[1,2,3]);
 assert.equal(invoiceDocument({...source,paid:118}).status,'Pagado');
});
test('calendar due dates keep their day while timestamps display the Lima date',()=>{
 assert.equal(invoiceDate('2026-11-20'),'20/11/2026');assert.equal(invoiceDate('2026-11-05T01:00:00Z'),'04/11/2026');
 assert.equal(invoiceDate('invalid'),'Sin registrar');assert.throws(()=>invoiceDocument({id:1}));
});
