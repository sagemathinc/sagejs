// sagejs-test-tier: specialized
"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),test=require('node:test');
const {spawnSync}=require('node:child_process');
const {compileKernel}=require('../tools/native-kernel/compiler.cjs');
test('conditional and builtin magnitude agree in the exact arena on all native backends',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cubic-absolute-value-'));
  try{
    const sourcePath=path.join(directory,'witness.py');
    fs.copyFileSync(path.join(__dirname,'fixtures/cubic-absolute-value-native.py'),sourcePath);
    const compiled=await compileKernel({sourcePath,cacheRoot:path.join(directory,'cache')});
    const result=spawnSync(process.execPath,['-e','('+exercise.toString()+')('+JSON.stringify(compiled.modulePath)+')'],{encoding:'utf8',timeout:60000});
    assert.equal(result.status,0,String(result.error||'')+'\n'+result.stdout+result.stderr);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
function exercise(modulePath){
  const assert=require('node:assert/strict'),m=require(modulePath);
  const values=[0n,1n,-1n,(1n<<63n)-1n,-(1n<<63n),1n<<64n,-(1n<<64n),1n<<4096n,-(1n<<4096n)];
  for(let bit=1;bit<=2048;bit+=7){const n=(1n<<BigInt(bit))+37n;values.push(n,-n);}
  for(const name of ['conditional_magnitude','builtin_magnitude'])for(const backend of ['javascript','gmp','fmpz']){
    assert.equal(typeof m[name][backend],'function');
    for(const value of values)assert.equal(m[name][backend](value),value<0n?-value:value,`${name}.${backend}`);
  }
}
