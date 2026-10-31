const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/logistics.ts');
const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {openIncidents,lastPosition,deliveryOverdue,positionMap}=compiled.exports;
test('only unresolved incidents remain open, without losing their history',()=>{
 const order={id:1,logisticsEvents:[{id:'a',type:'incident'},{id:'b',type:'incident'},{id:'c',type:'resolution',incidentId:'a'}]};
 assert.deepEqual(openIncidents(order).map(e=>e.id),['b']);
 assert.equal(order.logisticsEvents.length,3);
});
test('tracking uses the latest valid recorded coordinates including zero',()=>{
 assert.equal(lastPosition({id:1}),undefined);
 const position={type:'position',latitude:0,longitude:0};
 assert.deepEqual(lastPosition({id:1,logisticsEvents:[position,{type:'position',latitude:100,longitude:10}]}),position);
 assert.equal(new URL(positionMap(position)).searchParams.get('marker'),'0,0');
});
test('logistical lateness uses delivery dates independently of paid status',()=>{
 const order={id:1,status:'Pagado',deliveryDate:'2026-10-01'};
 assert.equal(deliveryOverdue(order,'2026-10-02'),true);
 assert.equal(deliveryOverdue({...order,deliveryStage:'Entregado'},'2026-10-02'),false);
 assert.equal(deliveryOverdue({...order,status:'Anulado'},'2026-10-02'),false);
 assert.equal(deliveryOverdue({...order,logistics:{scheduledDate:'2026-10-03'}},'2026-10-02'),false);
});
