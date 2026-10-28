const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/orderView.ts');
const compiled=new Module(filename,module);
compiled.filename=filename;
compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {orderBalance,orderTimeline}=compiled.exports;
test('cancelled operations never show a collectible balance',()=>{
 assert.equal(orderBalance({id:1,amount:100,paid:0,status:'Anulado'}),0);
 assert.equal(orderBalance({id:2,amount:0.3,paid:0.1,status:'Parcial'}),0.2);
 assert.equal(orderBalance({id:3,amount:100,paid:100,status:'Pagado'}),0);
});
test('invoice, payment and delivery history follows the actual event dates',()=>{
 const order={id:1,kind:'sales',date:'2026-10-01T10:00:00Z',invoice:{number:'INT-1',issuedAt:'2026-10-02T10:00:00Z',dueDate:'2026-11-01',issuedBy:'Ventas'},tracking:[{date:'2026-10-03T10:00:00Z',stage:'Preparando',note:'Almacén',user:'Operador'},{date:'2026-10-05T10:00:00Z',stage:'Despachado',note:'Ruta 1'}],cancelledAt:'2026-10-07T10:00:00Z'};
 const payments=[{id:8,orderId:1,date:'2026-10-06T10:00:00Z',amount:50},{id:9,orderId:99,date:'2026-10-04T10:00:00Z',amount:999},{id:10,orderId:1,date:'2026-10-04T10:00:00Z',amount:25}];
 const events=orderTimeline(order,payments);
 assert.deepEqual(events.map(e=>e.key),['created','invoice','tracking-0','payment-10','tracking-1','payment-8','cancelled']);
 assert.ok(events[2].detail.includes('Operador'));
 assert.ok(!events.some(e=>e.key==='payment-9'));
});
test('boletas and payment references remain visible in the history',()=>{
 const events=orderTimeline({id:1,kind:'sales',date:'2026-10-01T10:00:00Z',invoice:{type:'Boleta',number:'INT-B-1',issuedAt:'2026-10-01T11:00:00Z',dueDate:'2026-10-02'}},[{id:2,orderId:1,date:'2026-10-01T12:00:00Z',type:'Ingreso',amount:50,method:'Yape',paymentReference:'00001234'}]);
 assert.equal(events[1].title,'Boleta INT-B-1');
 assert.equal(events[2].title,'Cobro registrado');
 assert.ok(events[2].detail.includes('Yape'));
 assert.ok(events[2].detail.includes('00001234'));
});
