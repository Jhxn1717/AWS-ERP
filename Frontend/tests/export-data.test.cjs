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
const {hasExportData}=compiled.exports;
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
