const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/commercial.ts');
const compiled=new Module(filename,module);
compiled.filename=filename;compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {documentType,receiptType,paymentMethods}=compiled.exports;
test('RUC and DNI determine the sales document, including legacy identities',()=>{
 assert.equal(documentType({taxId:'01234567'}),'DNI');
 assert.equal(documentType({taxId:'20123456789'}),'RUC');
 assert.equal(receiptType({contactSnapshot:{documentType:'DNI',taxId:'01234567'}}),'Boleta');
 assert.equal(receiptType({contactSnapshot:{documentType:'RUC',taxId:'20123456789'}}),'Factura');
 assert.equal(receiptType({kind:'purchases',contactSnapshot:{documentType:'DNI'}}),'Factura');
});
test('saved document identities override later contact changes',()=>{
 assert.equal(receiptType({receiptType:'Boleta',contactId:1},[{id:1,documentType:'RUC'}]),'Boleta');
 assert.equal(receiptType({invoice:{type:'Boleta'},contactId:1},[{id:1,documentType:'RUC'}]),'Boleta');
 assert.equal(receiptType({invoice:{},contactId:1},[{id:1,documentType:'DNI'}]),'Factura');
 assert.ok(paymentMethods.includes('Yape'));
 assert.ok(paymentMethods.includes('Tarjeta'));
});
