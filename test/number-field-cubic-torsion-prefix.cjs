// sagejs-test-tier: specialized
"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),test=require('node:test');
const {spawnSync}=require('node:child_process');
const {compileKernel}=require('../tools/native-kernel/compiler.cjs');
test('torsion interval predicate agrees across JavaScript, GMP, and fmpz with poisoned tails', {timeout:180000},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cubic-torsion-prefix-'));
  try {
    const sourcePath=path.join(directory,'witness.py');
    const helper=fs.readFileSync(path.join(__dirname,'../bench/class-unit-groups/cubic-torsion-prefix.py'),'utf8');
    const wrapper=fs.readFileSync(path.join(__dirname,'fixtures/cubic-torsion-prefix.py'),'utf8');
    fs.writeFileSync(sourcePath,helper+'\n'+wrapper);
    const compiled=await compileKernel({sourcePath,functions:['torsion_prefix_witness'],cacheRoot:path.join(directory,'cache')});
    // A child releases the loaded addon before cleanup, including on Windows.
    const result=spawnSync(process.execPath,['-e','('+exercise.toString()+')('+JSON.stringify(compiled.modulePath)+')'],{encoding:'utf8',timeout:60000});
    assert.equal(result.status,0,String(result.error||'')+'\n'+result.stdout+result.stderr);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

function exercise(modulePath) {
    const assert=require('node:assert/strict');
    const fn=require(modulePath).torsion_prefix_witness;
    assert.equal(typeof fn.fmpz,'function');assert.equal(typeof fn.gmp,'function');
    let seed=9138n;const random=n=>{seed=(seed*1664525n+1013904223n)&0xffffffffn;return Number(seed%BigInt(n));};
    const cases=[{rows:1,columns:1,data:[1n,-1n,1n,5n]},
      {rows:1,columns:1,data:[1n,-2n,1n,5n]},
      {rows:1,columns:1,data:[0n,1n,0n,5n]},
      {rows:1,columns:1,data:[1n,0n,0n,0n]},
      {rows:0,columns:1,data:[0n,0n,5n]}];
    for(let i=0;i<180;i++) {
      const rows=1+random(5),columns=1+random(7),data=[];
      for(let j=0;j<rows*columns;j++)data.push(BigInt(random(41)-20)*(1n<<BigInt(random(131))));
      for(let j=0;j<columns;j++){const lo=BigInt(random(201)-100);data.push(lo,lo+BigInt(random(4)));}
      data.push(1n<<BigInt(random(257)));cases.push({rows,columns,data});
    }
    for(const {rows,columns,data} of cases) {
      const scale=data.at(-1);let expected=scale>0n&&rows>0&&columns>0;
      for(let j=0;j<columns;j++)if(data[rows*columns+2*j]>data[rows*columns+2*j+1])expected=false;
      for(let i=0;i<rows;i++){let lo=0n,hi=0n;for(let j=0;j<columns;j++){const e=data[i*columns+j],a=e*data[rows*columns+2*j],b=e*data[rows*columns+2*j+1];lo+=a<b?a:b;hi+=a>b?a:b;}if(5n*lo < -scale||5n*hi > scale)expected=false;}
      for(const implementation of [fn.javascript,fn.gmp,fn.fmpz]){
        const out=fn.createIntegerBuffer(1,8);
        assert.equal(implementation(fn.packIntegerBuffer(data,16),out,rows,columns),true);
        assert.deepEqual(out.toArray(),[expected?1n:0n]);
      }
    }
}
