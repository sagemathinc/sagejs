// sagejs-test-tier: specialized
"use strict";
const assert=require("node:assert/strict"),{mkdtempSync,writeFileSync,readFileSync}=require("node:fs");
const {tmpdir}=require("node:os"),{join}=require("node:path"),{spawnSync}=require("node:child_process"),test=require("node:test");
const {compileKernel}=require("../compiler.cjs"),{lowerSource}=require("../ir.cjs");
test("imported math.log preserves binding and binary64 domains",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-log-")),source=join(dir,"logarithm.py");
  writeFileSync(source,`from sagejs.native import native, Float64Buffer
from math import log as logarithm
@native
def scalar(x: float) -> float:
    return logarithm(x)
@native
def mixed(x: Float64Buffer, out: Float64Buffer) -> int:
    out[0] = logarithm(x[0])
    return 7
`);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  assert.equal(mod.scalar.nativeAvailable,true);
  const scalarBackends=[mod.scalar.javascript,mod.scalar];
  assert.match(readFileSync(built.coreSourcePath,"utf8"),/ = log\(/);
  assert.doesNotMatch(readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call/);
  const values=[Number.MIN_VALUE,2**-1022,0.125,0.5,1-Number.EPSILON/2,1,1+Number.EPSILON,2,3,101,Number.MAX_VALUE];
  for(let exponent=-1000;exponent<=1000;exponent+=25)values.push(1.125*2**exponent);
  const oracle=spawnSync("python3",["-c","import json,sys,math;print(json.dumps([math.log(x) for x in json.load(sys.stdin)]))"],{input:JSON.stringify(values),encoding:"utf8",timeout:30000});assert.equal(oracle.status,0,oracle.stderr);
  const expected=JSON.parse(oracle.stdout);
  for(let i=0;i<values.length;i++){
    for(const backend of scalarBackends){
      const actual=backend(values[i]);
      assert(Math.abs(actual-expected[i])<=4*Number.EPSILON*Math.max(1,Math.abs(expected[i])),`${backend}: ${values[i]}`);
    }
    for(const backend of ["javascript","gmp"]){const out=[0];assert.equal(mod.mixed[backend]([values[i]],out),7n);assert(Math.abs(out[0]-expected[i])<=4*Number.EPSILON*Math.max(1,Math.abs(expected[i])));}
  }
  for(const x of [-Infinity,-1,-Number.MIN_VALUE,-0,0]){
    for(const backend of scalarBackends)assert.throws(()=>backend(x),/math domain error/);
    for(const backend of ["javascript","gmp"])assert.throws(()=>mod.mixed[backend]([x],[0]),/math domain error/);
  }
  for(const backend of scalarBackends){assert.equal(backend(Infinity),Infinity);assert(Number.isNaN(backend(NaN)));}
  for(const alias of ["float","RealNumber","abs","sqrt","len"]){
    const ir=await lowerSource(`from math import log as ${alias}\ndef f(x:float)->float:\n    return ${alias}(x)\n`,"alias.py");
    assert.match(JSON.stringify(ir),/float64.log/);
  }
  for(const body of [
    "from math import log\ndef f(log:float)->float:\n    return log(1.0)\n",
    "from math import log\ndef f(x:float)->float:\n    y=log(x)\n    log=1.0\n    return y\n",
    "from math import log\ndef log(x:float)->float:\n    return x\ndef f(x:float)->float:\n    return log(x)\n",
    "from math import log\ndef f(x:float)->float:\n    return log(x,2.0)\n",
    "from math import log\ndef f(x:float)->float:\n    return log(x=x)\n",
    "from math import log\nfrom math import sqrt as log\ndef f(x:float)->float:\n    return log(x)\n",
    "def f(x:float)->float:\n    return log(x)\n",
    "from .math import log\ndef f(x:float)->float:\n    return log(x)\n",
  ])await assert.rejects(()=>lowerSource(
    "from sagejs.native import native\n" + body.replace("def f(","@native\ndef f("),
    "log-binding.py"),/shadowed|argument|positional|ambiguous|unsupported/);
});
