const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');

const filename=path.resolve(__dirname,'../src/navigation.ts');
const compiled=new Module(filename,module);
compiled.filename=filename;
compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,filename);
const {pageHash,pageFromHash}=compiled.exports;
const pages=['Dashboard','Reportes','Ventas','Clientes','Compras','Proveedores','Inventario','Documentos','Finanzas','Administración'];

test('administration opens using its canonical URL',()=>{
 assert.equal(pageHash('Administración'),'#administracion');
 assert.equal(pageFromHash('#administracion',pages),'Administración');
});
test('every module survives a route round trip',()=>{
 for(const page of [...pages,'Mi perfil'])assert.equal(pageFromHash(pageHash(page),pages),page);
});
test('accented and encoded administration links also work',()=>{
 assert.equal(pageFromHash('#administración',pages),'Administración');
 assert.equal(pageFromHash('#administraci%C3%B3n',pages),'Administración');
});
test('unknown or malformed routes fall back to the dashboard',()=>{
 for(const hash of ['','#missing','#%ZZ'])assert.equal(pageFromHash(hash,pages),'Dashboard');
});
