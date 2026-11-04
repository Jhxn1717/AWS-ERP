const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/shipmentMotion.ts');
const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {simulationPoint,advanceSimulation,simulationDistance,simulationDuration,validCoordinate,simulationViewport,projectPoint,readSimulation,saveSimulation}=compiled.exports;
const {routeLengths,routePosition,parseStreetRoute,fetchStreetRoute}=compiled.exports;
const start={latitude:-12.046667,longitude:-77.032222},end={latitude:-12.150556,longitude:-77.007778};
test('simulation begins and ends at the actual configured points and clamps progress',()=>{
 assert.deepEqual(simulationPoint(start,end,-1),start);
 assert.deepEqual(simulationPoint(start,end,2),end);
 const midpoint=simulationPoint(start,end,.5);
 assert.equal(midpoint.latitude,(start.latitude+end.latitude)/2);
 assert.equal(midpoint.longitude,(start.longitude+end.longitude)/2);
 assert.equal(simulationDistance(start,start),0);
 assert.ok(simulationDistance(start,end)>10&&simulationDistance(start,end)<15);
});
test('pause, speed, clock reversal and arrival cannot overshoot or change source data',()=>{
 const original={orderId:1,start,destination:end,elapsed:0,running:true,speed:2,updatedAt:1000};
 const step=advanceSimulation(original,6000);assert.equal(step.elapsed,10000);assert.equal(original.elapsed,0);
 assert.equal(advanceSimulation({...step,running:false},16000).elapsed,10000);
 assert.equal(advanceSimulation(original,500).elapsed,0);
 const arrived=advanceSimulation(original,simulationDuration+1000);assert.equal(arrived.elapsed,simulationDuration);assert.equal(arrived.running,false);
});
test('the initial map frame includes both endpoints, including identical points',()=>{
 for(const destination of [end,start]){
  const view=simulationViewport(start,destination,320,330);
  for(const p of [start,destination]){const px=projectPoint(p,view.zoom);assert.ok(px.x-view.left>=0&&px.x-view.left<=320);assert.ok(px.y-view.top>=0&&px.y-view.top<=330)}
 }
 assert.equal(validCoordinate({latitude:0,longitude:0}),true);
 for(const point of [{latitude:NaN,longitude:0},{latitude:86,longitude:0},{latitude:0,longitude:181},{latitude:'-12',longitude:-77},null])assert.equal(validCoordinate(point),false);
});
test('local browser state is scoped by order and restores paused; corrupt states are ignored',()=>{
 const values=new Map();global.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const value={orderId:1,start,destination:end,elapsed:12000,running:true,speed:1,updatedAt:1000};
 saveSimulation({...value,route:[start,end]});assert.equal(readSimulation(1).elapsed,12000);assert.equal(readSimulation(1).running,false);assert.equal(readSimulation(2),null);
 saveSimulation(value);assert.equal(readSimulation(1).elapsed,0);assert.equal(readSimulation(1).route,undefined);
 values.set('nix-local-shipment-1','{invalid');assert.equal(readSimulation(1),null);
 values.set('nix-local-shipment-1',JSON.stringify({...value,speed:Infinity}));assert.equal(readSimulation(1),null);
 delete global.sessionStorage;
});
test('street animation follows corners and distance instead of cutting diagonally',()=>{
 const a={latitude:0,longitude:0},corner={latitude:0,longitude:.01},b={latitude:.02,longitude:.01};
 const route=[a,corner,b],lengths=routeLengths(route);
 const first=routePosition(route,lengths,.2);assert.equal(first.point.latitude,0);assert.ok(first.point.longitude>0);
 const second=routePosition(route,lengths,.7);assert.equal(second.point.longitude,.01);assert.ok(second.point.latitude>0);
 assert.deepEqual(routePosition(route,lengths,0).point,a);assert.deepEqual(routePosition(route,lengths,1).point,b);
 const bounds=simulationViewport(a,b,320,330,0,[a,{latitude:0,longitude:.1},b]);
 const detour=projectPoint({latitude:0,longitude:.1},bounds.zoom);assert.ok(detour.x-bounds.left<=320);
});
test('road response checks geometry, coordinates and proximity of snapped endpoints',()=>{
 const response={code:'Ok',routes:[{geometry:{coordinates:[[start.longitude,start.latitude],[-77.02,-12.08],[end.longitude,end.latitude]]}}]};
 assert.equal(parseStreetRoute(response,start,end).length,3);
 for(const invalid of [{code:'NoRoute'}, {...response,routes:[{geometry:{coordinates:[[0,0],[1,1]]}}]}, {...response,routes:[{geometry:{coordinates:[[NaN,0],[end.longitude,end.latitude]]}}]}])assert.throws(()=>parseStreetRoute(invalid,start,end));
});
test('route requests use longitude first, full geometry and a bounded street snapping radius',async()=>{
 const previous=global.fetch;
 try{
  global.fetch=async(url,options)=>{
   assert.match(url,/driving\/-77\.032222,-12\.046667;-77\.007778,-12\.150556/);
   assert.match(url,/overview=full&geometries=geojson/);assert.match(url,/radiuses=250;250/);assert.ok(options.signal);
   return {ok:true,json:async()=>({code:'Ok',routes:[{geometry:{coordinates:[[start.longitude,start.latitude],[end.longitude,end.latitude]]}}]})};
  };
  assert.equal((await fetchStreetRoute(start,end,new AbortController().signal)).length,2);
  global.fetch=async()=>({ok:false});await assert.rejects(()=>fetchStreetRoute(start,end,new AbortController().signal));
 }finally{global.fetch=previous}
});

const {continuousHeading}=compiled.exports;
const {panSimulationViewport}=compiled.exports;
test('panning keeps route and tiles aligned and preserves the geographic center when zooming',()=>{
 const width=640,height=330,pan={x:.02,y:-.01};
 const base=simulationViewport(start,end,width,height);
 const moved=panSimulationViewport(base,pan,width,height);
 const pixel=projectPoint(start,base.zoom);
 assert.ok(Math.abs((pixel.x-moved.left)-(pixel.x-base.left)+pan.x*2**base.zoom)<1e-7);
 assert.ok(Math.abs((pixel.y-moved.top)-(pixel.y-base.top)+pan.y*2**base.zoom)<1e-7);
 const closer=panSimulationViewport(simulationViewport(start,end,width,height,1),pan,width,height);
 assert.ok(Math.abs((moved.left+width/2)/2**moved.zoom-(closer.left+width/2)/2**closer.zoom)<1e-7);
 assert.ok(Math.abs((moved.top+height/2)/2**moved.zoom-(closer.top+height/2)/2**closer.zoom)<1e-7);
 assert.deepEqual(panSimulationViewport(base,{x:0,y:0},width,height),base);
 const edge=panSimulationViewport(base,{x:1e6,y:-1e6},width,height);
 assert.equal(edge.left,256*2**base.zoom-width);assert.equal(edge.top,0);
});
test('vehicle turns through the shortest angle without spinning at north',()=>{
 assert.equal(continuousHeading(179,-179),181);
 assert.equal(continuousHeading(-179,179),-181);
 assert.equal(continuousHeading(0,90),90);
 assert.equal(continuousHeading(720,10),730);
});
test('older fast demos retain their progress and reopen at normal speed',()=>{
 const values=new Map();global.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 values.set('nix-local-shipment-1',JSON.stringify({orderId:1,start,destination:end,route:[start,end],elapsed:30000,running:true,speed:4,updatedAt:1}));
 const recovered=readSimulation(1);assert.equal(recovered.elapsed,simulationDuration/2);assert.equal(recovered.speed,1);assert.equal(recovered.running,false);
 delete global.sessionStorage;
});
