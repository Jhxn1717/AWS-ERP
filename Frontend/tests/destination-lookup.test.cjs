const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const filename=path.resolve(__dirname,'../src/destinationLookup.ts'),compiled=new Module(filename,module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {parseDestinations,lookupDestination}=compiled.exports;
const feature={geometry:{type:'Point',coordinates:[-77.01,-12.15]},properties:{countrycode:'PE',street:'Calle Las Flores',housenumber:'80',district:'Santiago de Surco',city:'Lima'}};
test('geocoding accepts streets in Peru, preserves coordinate order and distinguishes street-only approximations',()=>{
 const [exact]=parseDestinations({features:[feature]});assert.equal(exact.latitude,-12.15);assert.equal(exact.longitude,-77.01);assert.equal(exact.approximate,false);assert.match(exact.label,/Surco/);
 const [approximate]=parseDestinations({features:[{...feature,properties:{...feature.properties,housenumber:undefined}}]});assert.equal(approximate.approximate,true);
});
test('geocoding rejects city centroids, other countries, invalid coordinates and duplicate points',()=>{
 assert.equal(parseDestinations({features:[feature,feature]}).length,1);
 for(const invalid of [{...feature,properties:{countrycode:'PE',name:'Lima'}},{...feature,properties:{...feature.properties,countrycode:'ES'}},{...feature,geometry:{type:'Point',coordinates:[NaN,-12]}},{...feature,geometry:{type:'Point',coordinates:[-75,NaN]}},{...feature,geometry:{type:'Point',coordinates:[-75,40]}}])assert.equal(parseDestinations({features:[invalid]}).length,0);
 assert.throws(()=>parseDestinations({}));
});
test('unrelated streets are discarded and a different house number is marked approximate',()=>{
 const wrong={...feature,properties:{...feature.properties,street:'Calle Ferreñafe'}};
 assert.equal(parseDestinations({features:[wrong,feature]},'Calle Las Flores 80, Surco, Lima').length,1);
 assert.equal(parseDestinations({features:[feature]},'Calle Las Flores 220, Surco, Lima')[0].approximate,true);
});
test('lookup sends only the address, restricts Peru, caches success and propagates errors',async()=>{
 const previous=global.fetch;let calls=0;
 try{
  global.fetch=async(url,options)=>{calls++;const params=new URL(url).searchParams;assert.equal(params.get('q'),'Calle de prueba 80, Surco, Lima');assert.equal(params.get('countrycode'),'PE');assert.equal(options.credentials,'omit');assert.ok(options.signal);return {ok:true,json:async()=>({features:[{...feature,properties:{...feature.properties,street:'Calle de prueba'}}]})}};
  await lookupDestination('Calle de prueba 80, Surco, Lima',new AbortController().signal);
  await lookupDestination('  Calle de prueba 80, Surco, Lima  ',new AbortController().signal);assert.equal(calls,1);
  global.fetch=async()=>({ok:false});await assert.rejects(()=>lookupDestination('Otra calle 1, Lima',new AbortController().signal));
 }finally{global.fetch=previous}
});
