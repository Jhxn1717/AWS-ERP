const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function load(name){
 const filename=path.resolve(__dirname,`../src/${name}.ts`);
 const compiled=new Module(filename,module);
 compiled.filename=filename;compiled.paths=module.paths;
 const original=compiled.require.bind(compiled);
 compiled.require=id=>id==='./commercial'?load('commercial'):original(id);
 compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
 return compiled.exports;
}
const {paymentDetails,paymentReceiptNumber}=load('paymentDetails');
test('each payment has its own stable receipt number, including partial payments',()=>{
 assert.equal(paymentReceiptNumber(10),'CP-00000010');
 assert.equal(paymentReceiptNumber(11),'CP-00000011');
});
test('partial payments resolve the same boleta by order id, preserving each payment reference',()=>{
 const order={id:7,amount:100,paid:75,invoice:{type:'Boleta',number:'INT-B-00000007'}};
 const data={sales:[order],purchases:[]};
 for(const [id,reference] of [[10,'0000123'],[11,'0000124']]){
  const result=paymentDetails({id,orderId:7,type:'Ingreso',amount:25,paymentReference:reference},data);
  assert.equal(result.receiptType,'Boleta');assert.equal(result.receiptNumber,'INT-B-00000007');
  assert.equal(result._order,order);assert.equal(result._orderKind,'sales');
  assert.equal(result.amount,25);assert.equal(result.paymentReference,reference);
 }
});
test('supplier payments resolve purchases and do not attach an unrelated sales receipt',()=>{
 const data={sales:[{id:7,invoice:{type:'Boleta',number:'B-1'}}],purchases:[{id:8,invoice:{number:'F001-00001'}}]};
 const result=paymentDetails({id:1,type:'Egreso',orderId:8},data);
 assert.equal(result.receiptType,'Factura');assert.equal(result._orderKind,'purchases');
 assert.equal(result.receiptNumber,'F001-00001');
 assert.equal(paymentDetails({id:2,type:'Egreso',orderId:7},data)._order,undefined);
});
test('missing documents stay empty and duplicate operation references do not create false links',()=>{
 const data={sales:[{id:7,reference:'VEN-1'}],purchases:[]};
 const pending=paymentDetails({id:1,type:'Ingreso',orderId:7},data);
 assert.equal(pending.receiptNumber,'');assert.equal(pending.receiptType,'');assert.equal(pending._order.id,7);
 const missing=paymentDetails({id:2,type:'Ingreso',orderId:999,reference:'VEN-1'},data);
 assert.equal(missing._order,undefined);assert.equal(missing.receiptNumber,'');
});
