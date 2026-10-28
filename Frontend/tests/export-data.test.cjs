const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/exportReport.ts');
const compiled=new Module(filename,module);
compiled.filename=filename;
compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,filename);
const {hasExportData,reportSection}=compiled.exports;
test('customer documents and payment references preserve leading zeros in reports',()=>{
 const clients=reportSection('Clientes',[{id:1,name:'Persona','documentType':'DNI',taxId:'01234567'}]);
 assert.equal(clients.rows[0].taxId,'01234567');
 assert.equal(clients.rows[0].documentType,'DNI');
 assert.ok(clients.columns.some(column=>column.key==='documentType'));
 const payments=reportSection('Pagos',[{amount:25,type:'Ingreso',method:'Yape',paymentReference:'00001234'}]);
 assert.equal(payments.rows[0].paymentReference,'00001234');
 assert.equal(payments.rows[0].method,'Yape');
 assert.ok(payments.columns.some(column=>column.key==='paymentReference'));
 const linked=reportSection('Pagos',[{amount:25,invoice:{type:'Boleta',number:'INT-B-00000007'}}]);
 assert.equal(linked.rows[0].receiptType,'Boleta');
 assert.equal(linked.rows[0].receiptNumber,'INT-B-00000007');
 assert.ok(linked.columns.some(column=>column.key==='receiptNumber'));
});
const section=rows=>({title:'Prueba',columns:[],rows});
test('empty or filtered reports do not export',()=>{
 assert.equal(hasExportData([]),false);
 assert.equal(hasExportData([section([]),section([])]),false);
});
test('reports with records, including pending finance accounts, export',()=>{
 assert.equal(hasExportData([section([]),section([{amount:10}])]),true);
});
test('generated dashboard indicators alone do not count as records',()=>{
 const generated=[section([{value:0}]),section([{ventas:0}])];
 assert.equal(hasExportData([...generated,section([])],true),false);
 assert.equal(hasExportData([...generated,section([{id:1}])],true),true);
});

test('finance exports distinguish payments from outstanding accounts',()=>{
 const payment=reportSection('Pagos',[{amount:25,type:'Ingreso'}]);
 assert.ok(payment.columns.some(column=>column.key==='type'));
 assert.ok(!payment.columns.some(column=>column.key==='paid'));
 for(const title of ['Cuentas por cobrar','Cuentas por pagar']){
  const account=reportSection(title,[{amount:100,paid:40,status:'Parcial'}]);
  assert.ok(account.columns.some(column=>column.key==='balance'));
  assert.equal(account.rows[0].balance,60);
 }
});
