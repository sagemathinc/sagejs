"use strict";
const assert=require("node:assert/strict");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
(async()=>{
  const compilerRoot=path.resolve(process.argv[3]||path.join(__dirname,"../.."));
  const {compileKernel}=require(path.join(compilerRoot,"tools/native-kernel/compiler.cjs"));
  const b=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")});
  const mod=require(b.modulePath),raw=require(b.addonPath);
  const oracle=spawnSync("python3",[path.join(__dirname,"check_rounding.py"),process.argv[2],"--json"],{encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
  assert.equal(oracle.status,0,oracle.stderr);
  const rows=JSON.parse(oracle.stdout);
  assert.equal(rows.length,75);
  for(const row of rows){
    const data=row.map(BigInt),args=data.slice(0,3),expected=data.slice(3);
    for(const f of [mod.pari_round_real,mod.pari_round_real.javascript,raw.pari_round_real])
      assert.deepEqual(f(...args),expected);
  }
  console.log("75 PARI rounding pairs agree: CPython, generated JS, public dispatch, forced native");
})().catch(e=>{console.error(e);process.exitCode=1;});
