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
const {pageHash,pageFromHash,adminPages,navigationPage}=compiled.exports;
const pages=['Dashboard','Reportes','Ventas','Clientes','Compras','Proveedores','Inventario','Documentos','Finanzas','Administración','Cuentas por cobrar','Cuentas por pagar','Pagos','Usuarios','Roles y permisos','Empresa','Auditoría','Vaciar datos','Importaciones'];

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

test('finance and administration sections have stable readable routes',()=>{
 assert.equal(pageHash('Cuentas por cobrar'),'#cuentas-por-cobrar');
 assert.equal(pageHash('Cuentas por pagar'),'#cuentas-por-pagar');
 assert.equal(pageFromHash('#roles-y-permisos',pages),'Roles y permisos');
 assert.equal(pageFromHash('#auditoria',pages),'Auditor\u00eda');
});

test('administration sections share one menu entry and retain their own routes',()=>{
 for(const page of Object.keys(adminPages)){
  assert.equal(navigationPage(page),'Administraci\u00f3n');
  assert.equal(pageFromHash(pageHash(page),Object.keys(adminPages)),page);
 }
 assert.equal(adminPages.Sesiones,'Sesiones');
 assert.equal(pageFromHash('#sesiones',Object.keys(adminPages)),'Sesiones');
 assert.equal(adminPages.Importaciones,'Importaciones');
 assert.equal(pageFromHash('#importaciones',Object.keys(adminPages)),'Importaciones');
});

test('other modules keep their own navigation entries',()=>{
 for(const page of ['Ventas','Compras','Inventario','Documentos','Pagos','Dashboard']){
  assert.equal(navigationPage(page),page);
 }
});
