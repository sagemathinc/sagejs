// sagejs-test-tier: specialized
"use strict";
const assert=require("node:assert/strict"),{mkdtempSync,writeFileSync,readFileSync}=require("node:fs");
const {tmpdir}=require("node:os"),{join}=require("node:path"),{spawnSync}=require("node:child_process"),test=require("node:test");
const {compileKernel}=require("../compiler.cjs"),{lowerSource}=require("../ir.cjs");
test("imported math.pow matches CPython binary64 special values and domains",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-pow-")),source=join(dir,"powers.py");
  writeFileSync(source,`from sagejs.native import native, Float64Buffer
from math import pow as power
@native
def scalar(x:float,y:float)->float:
    return power(x,y)
@native
def mixed(x:Float64Buffer,out:Float64Buffer)->int:
    out[0]=power(x[0],x[1])
    return 1
`);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  assert.equal(mod.scalar.nativeAvailable,true);
  assert.match(readFileSync(built.coreSourcePath,"utf8"),/ = pow\(/);
  const values=[-Infinity,-Number.MAX_VALUE,-2,-1,-0,0,Number.MIN_VALUE,0.5,1,2,Number.MAX_VALUE,Infinity,NaN];
  const exponents=[-Infinity,-1075,-3,-0.5,-0,0,0.5,1,2,3,1024,Infinity,NaN];
  const pairs=values.flatMap(x=>exponents.map(y=>[x,y]));
  for(let p=2;p<=31;p++)for(let m=2;m<=20;m++)pairs.push([1/Math.sqrt(p),m]);
  const token=x=>Object.is(x,-0)?"-0.0":String(x);
  const oracle=spawnSync("python3",["-c",`import json,sys,math
out=[]
for a,b in json.load(sys.stdin):
    try:
        z=math.pow(float(a),float(b))
        out.append(["ok",repr(z)])
    except ValueError: out.append(["error","math domain error"])
    except OverflowError: out.append(["error","math range error"])
print(json.dumps(out))`],{input:JSON.stringify(pairs.map(pair=>pair.map(token))),encoding:"utf8",timeout:30000});
  assert.equal(oracle.status,0,oracle.stderr);
  const expected=JSON.parse(oracle.stdout);
  const backends=[mod.scalar.javascript,mod.scalar,...["javascript","gmp"].map(key=>(x,y)=>{const out=[0];assert.equal(mod.mixed[key]([x,y],out),1n);return out[0];})];
  for(let i=0;i<pairs.length;i++)for(const run of backends){
    const [kind,value]=expected[i];
    if(kind==="error"){assert.throws(()=>run(...pairs[i]),new RegExp(value));continue;}
    const want=value==="inf"?Infinity:value==="-inf"?-Infinity:Number(value),got=run(...pairs[i]);
    if(Number.isNaN(want))assert(Number.isNaN(got));
    else if(want===0 || !Number.isFinite(want))assert(Object.is(got,want),`${pairs[i]}: ${got} != ${want}`);
    else assert(Math.abs(got-want)<=8*Number.EPSILON*Math.abs(want)+Number.MIN_VALUE,`${pairs[i]}: ${got} != ${want}`);
  }
  for(const alias of ["float","abs","sqrt","pow"]){
    const ir=await lowerSource(`from math import pow as ${alias}\ndef f(x:float,y:float)->float:\n    return ${alias}(x,y)\n`,"alias.py");
    assert.match(JSON.stringify(ir),/float64.pow/);
  }
  for(const call of ["power(x)","power(x,x,x)","power(x,y=x)"])
    await assert.rejects(()=>lowerSource(`from math import pow as power\ndef f(x:float)->float:\n    return ${call}\n`,"bad.py"),/positional/);
  await assert.rejects(()=>lowerSource("from math import pow as power\ndef f(power:float)->float:\n    return power(2.0,3.0)\n","shadow.py"),/shadowed/);
});
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
