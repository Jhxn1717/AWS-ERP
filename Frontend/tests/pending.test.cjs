const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/pending.ts');
const compiled=new Module(filename,module);
compiled.filename=filename;
compiled.paths=module.paths;
compiled.require=function(name){
 if(name!=='./logistics')return Module.prototype.require.call(this,name);
 const dependency=path.resolve(__dirname,'../src/logistics.ts');
 const loaded=new Module(dependency,module);loaded.filename=dependency;loaded.paths=module.paths;
 loaded._compile(ts.transpileModule(fs.readFileSync(dependency,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,dependency);
 return loaded.exports;
};
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,filename);
const {buildPending,limaDate}=compiled.exports;
const base={id:1,reference:'VEN-1',name:'Cliente',amount:100,paid:25,status:'Parcial',lines:[{quantity:1}]};

test('logistics rescheduling and unresolved incidents feed the pending agenda',()=>{
 const sale={...base,deliveryStage:'Despachado',deliveryDate:'2026-10-01',logistics:{scheduledDate:'2026-11-05'},logisticsEvents:[{id:'issue-1',type:'incident'}]};
 const task=buildPending({sales:[sale]},'2026-10-30').find(t=>t.category==='delivery');
 assert.equal(task.dueDate,'2026-11-05');assert.equal(task.priority,'urgent');
 assert.match(task.action,/incidencia/);
 const delivered=buildPending({sales:[{...sale,deliveryStage:'Entregado'}]},'2026-10-30');
 assert.equal(delivered.filter(t=>t.category==='delivery').length,1);
 const resolved=buildPending({sales:[{...sale,deliveryStage:'Entregado',logisticsEvents:[...sale.logisticsEvents,{id:'resolve-1',type:'resolution',incidentId:'issue-1'}]}]},'2026-10-30');
 assert.equal(resolved.filter(t=>t.category==='delivery').length,0);
});
test('pending agenda connects sales, billing, cash, quotes and replenishment',()=>{
 const data={
  quotes:[{id:10,reference:'COT-10',name:'Cliente',status:'Cotización',amount:20,validUntil:'2026-10-27'},{id:11,reference:'COT-11',name:'Cliente',status:'Cotización',amount:20,validUntil:'2026-11-01'}],
  sales:[{...base,invoice:{dueDate:'2026-10-27'},deliveryStage:'Preparando',deliveryDate:'2026-10-28'},{...base,id:2,reference:'VEN-2',amount:50,paid:50,status:'Pagado',deliveryStage:'Despachado',deliveryDate:'2026-10-27'},{...base,id:3,status:'Anulado'},{...base,id:7,reference:'VEN-7',amount:0,paid:0,invoice:{dueDate:'2026-11-01'},deliveryStage:'Pendiente'}],
  purchases:[{...base,id:5,reference:'OC-5',amount:80,paid:30,invoice:{dueDate:'2026-11-01'}},{...base,id:6,reference:'OC-6',amount:100,paid:100}],
  products:[{id:20,sku:'P-20',name:'Sin stock',stock:0,minimum:0},{id:21,sku:'P-21',name:'Stock bajo',stock:2,minimum:5},{id:22,sku:'P-22',name:'Stock suficiente',stock:5,minimum:5}],
 };
 const tasks=buildPending(data,'2026-10-28');
 assert.equal(tasks.length,11);
 assert.equal(new Set(tasks.map(t=>t.key)).size,11);
 assert.equal(tasks.find(t=>t.category==='receivables').amount,75);
 assert.equal(tasks.find(t=>t.category==='payables').amount,50);
 assert.equal(tasks.find(t=>t.category==='dispatch').priority,'today');
 assert.equal(tasks.find(t=>t.category==='delivery').priority,'urgent');
 assert.equal(tasks.find(t=>t.record.id===20).priority,'urgent');
 assert.equal(tasks.filter(t=>t.target==='quote').length,2);
 assert.ok(!tasks.some(t=>t.record.id===3||t.record.id===22));
 assert.equal(tasks[0].priority,'urgent');
});
test('resolved records leave the agenda independently of creation month',()=>{
 const tasks=buildPending({sales:[{...base,date:'2020-01-01',paid:100,status:'Pagado',deliveryStage:'Entregado',invoice:{dueDate:'2020-01-02'}}],purchases:[{...base,paid:100,invoice:{dueDate:'2020-01-02'}}],quotes:[{id:2,status:'Confirmada'},{id:3,status:'Rechazada'}],products:[{id:4,stock:10,minimum:2}]},'2026-10-28');
 assert.equal(tasks.length,0);
 const old=buildPending({sales:[{...base,date:'2020-01-01',deliveryStage:'Entregado',invoice:{dueDate:'2020-01-02'}}]},'2026-10-28');
 assert.equal(old.length,1);
 assert.equal(old[0].priority,'urgent');
});
test('balances use remaining cents and unbilled operations have no invented deadline',()=>{
 const tasks=buildPending({sales:[{...base,amount:0.3,paid:0.1,deliveryStage:'Entregado'}]},'2026-10-28');
 const cash=tasks.find(t=>t.category==='receivables');
 assert.equal(cash.amount,0.2);
 assert.equal(cash.dueDate,undefined);
 assert.equal(cash.priority,'normal');
 assert.equal(tasks.filter(t=>t.category==='invoices').length,1);
});
test('deadline classification follows the date in Lima',()=>{
 assert.equal(limaDate(new Date('2026-10-28T03:00:00Z')),'2026-10-27');
 assert.equal(limaDate(new Date('2026-10-28T05:00:00Z')),'2026-10-28');
 const rows=buildPending({sales:[{...base,invoice:{dueDate:'2026-10-28'},deliveryStage:'Entregado'}]},'2026-10-28');
 assert.equal(rows[0].priority,'today');
});
test('legacy operations without references can still be reviewed',()=>{
 const tasks=buildPending({sales:[{...base,reference:null,deliveryStage:'Entregado'}],quotes:[{id:2,name:'Cliente',status:'Cotización'}]},'2026-10-28');
 assert.ok(tasks.length>0);
 assert.ok(tasks.every(task=>typeof task.title==='string'&&task.title.length>0));
});
