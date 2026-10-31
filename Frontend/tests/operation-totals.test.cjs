const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/operationTotals.ts');
const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {operationTotals}=compiled.exports;
test('included tax is split within the agreed total, never added twice',()=>{
 const value=operationTotals([{quantity:2,unitPrice:118}],18);
 assert.deepEqual(value,{total:236,subtotal:200,tax:36,units:2,exceedsLimit:false});
 const zero=operationTotals([{quantity:2,unitPrice:118}],0);
 assert.equal(zero.subtotal,236);assert.equal(zero.tax,0);assert.equal(zero.total,236);
});
test('cent rounding remains consistent for small prices and zero-cost purchases',()=>{
 assert.deepEqual(operationTotals([{quantity:3,unitPrice:.1}],18),{total:.3,subtotal:.25,tax:.05,units:3,exceedsLimit:false});
 assert.equal(operationTotals([{quantity:1,unitPrice:.03}],18).subtotal,.03);
 assert.equal(operationTotals([{quantity:4,unitPrice:0}],18).total,0);
});
test('server total limit is checked without losing cents for large quantities',()=>{
 assert.equal(operationTotals([{quantity:100,unitPrice:9999999999.99}],18).exceedsLimit,false);
 assert.equal(operationTotals([{quantity:101,unitPrice:9999999999.99}],18).exceedsLimit,true);
});
