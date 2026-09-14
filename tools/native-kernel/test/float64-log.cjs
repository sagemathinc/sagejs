// sagejs-test-tier: specialized
"use strict";
const assert=require("node:assert/strict"),{mkdtempSync,writeFileSync,readFileSync}=require("node:fs");
const {tmpdir}=require("node:os"),{join}=require("node:path"),{spawnSync}=require("node:child_process"),test=require("node:test");
const {compileKernel}=require("../compiler.cjs"),{lowerSource}=require("../ir.cjs");
test("binary64 decomposition and scaling match CPython at exponent boundaries", async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-scaling-")),source=join(dir,"scaling.py");
  writeFileSync(source,`from sagejs.native import native, Float64Buffer
from math import frexp as split, ldexp as scale
@native
def decomposition(x: float) -> tuple[float, int]:
    return split(x)
@native
def scaling(x: float, exponent: int) -> float:
    return scale(x, exponent)
@native
def roundtrip(x: float) -> float:
    mantissa, exponent = decomposition(x)
    return scaling(mantissa, exponent)
@native
def tiny(x: float) -> float:
    return scale(x, -1074)
@native
def local(x: float) -> float:
    mantissa, exponent = split(x)
    return scale(mantissa, exponent)
@native
def mutable(values: Float64Buffer, exponent: int) -> int:
    values[0] = scale(values[0], exponent)
    return 1
@native
def mixed_tuple(x: float, exponent: int) -> tuple[float, int, float]:
    return x, exponent, -x
@native
def nativeFrexp(x: float) -> float:
    float_exponent = x
    mantissa, exponent = split(float_exponent)
    return scale(mantissa, exponent)
@native
def nativeLdexp(x: float) -> float:
    float_exponent = x
    return scale(float_exponent, -1)
`);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  assert.equal(mod.scaling.nativeAvailable,true);
  const core=readFileSync(built.coreSourcePath,"utf8");
  assert.match(core,/ = ldexp\(/); assert.match(core,/\? frexp\(/);
  assert.doesNotMatch(core,/napi_call_function|PyObject_Call/);
  const values=[-Infinity,-Number.MAX_VALUE,-2,-1,-0,0,Number.MIN_VALUE,2**-1022,
    0.5,1-Number.EPSILON/2,1,2-Number.EPSILON,Number.MAX_VALUE,Infinity,NaN];
  for(let exponent=-1074;exponent<=1023;exponent++)values.push(2**exponent);
  const bits=new DataView(new ArrayBuffer(8)); let seed=0x4d595df4d0f33173n;
  for(let i=0;i<512;i++){
    seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);
    bits.setBigUint64(0,seed,false); values.push(bits.getFloat64(0,false));
  }
  const token=x=>Object.is(x,-0)?"-0.0":String(x);
  const shifts=[-(1n<<100n),-2098n,-1075n,-1074n,-1023n,-1n,0n,1n,1023n,1074n,2098n,1n<<100n];
  const pairs=values.slice(0,15).flatMap(x=>shifts.map(e=>[x,e]));
  for(let i=15;i<values.length;i++)pairs.push([values[i],BigInt((i*37)%4197-2098)]);
  for(let multiplier=1;multiplier<=255;multiplier+=2)for(const sign of [-1,1])
    for(const exponent of [-2n,-1n,1n,1074n])pairs.push([sign*multiplier*Number.MIN_VALUE,exponent]);
  assert.equal(values.length,2625); assert.equal(pairs.length,3814);
  const oracle=spawnSync("python3",["-c",`import json,sys,math
data=json.load(sys.stdin)
parts=[]; scales=[]
for text in data['values']:
    m,e=math.frexp(float(text));parts.append([repr(m),str(e)])
for text,exponent in data['pairs']:
    try:scales.append(['ok',repr(math.ldexp(float(text),int(exponent)))])
    except OverflowError:scales.append(['overflow'])
print(json.dumps([parts,scales]))`],{encoding:"utf8",timeout:30000,input:JSON.stringify({values:values.map(token),pairs:pairs.map(([x,e])=>[token(x),String(e)])})});
  assert.equal(oracle.status,0,oracle.stderr);
  const [parts,scales]=JSON.parse(oracle.stdout);
  const number=text=>text==="inf"?Infinity:text==="-inf"?-Infinity:Number(text);
  function equal(got,want,context){assert(Number.isNaN(want)?Number.isNaN(got):Object.is(got,want),`${context}: ${got} != ${want}`);}
  const previous=globalThis.OverflowError;
  globalThis.OverflowError=class OverflowError extends Error {};
  try{
    for(let i=0;i<values.length;i++)for(const backend of ["javascript","gmp"]){
      const got=mod.decomposition[backend](values[i]);
      equal(got[0],number(parts[i][0]),`frexp ${i} ${backend}`);
      assert.equal(got[1],BigInt(parts[i][1]));
      equal(mod.roundtrip[backend](values[i]),values[i],`roundtrip ${i} ${backend}`);
      equal(mod.local[backend](values[i]),values[i],`local ${i} ${backend}`);
      equal(mod.nativeFrexp[backend](values[i]),values[i],"compiler helper name hygiene");
      const tuple=mod.mixed_tuple[backend](values[i],1n<<100n);
      equal(tuple[0],values[i],"mixed tuple first float");
      assert.equal(tuple[1],1n<<100n);
      equal(tuple[2],-values[i],"mixed tuple last float");
    }
    for(let i=0;i<pairs.length;i++)for(const backend of ["javascript","gmp"]){
      const [x,e]=pairs[i],out=[x];
      if(scales[i][0]==="overflow"){
        assert.throws(()=>mod.scaling[backend](x,e),globalThis.OverflowError);
        assert.throws(()=>mod.mutable[backend](out,e),globalThis.OverflowError);
        equal(out[0],x,"overflow must precede buffer store");
      }else{
        equal(mod.scaling[backend](x,e),number(scales[i][1]),`ldexp ${i} ${backend}`);
        assert.equal(mod.mutable[backend](out,e),1n);
        equal(out[0],number(scales[i][1]),`mutable ${i} ${backend}`);
      }
    }
    for(const backend of ["javascript","gmp"])equal(mod.tiny[backend](1.0),Number.MIN_VALUE,"negative literal exponent");
    for(const backend of ["javascript","gmp"])equal(mod.nativeLdexp[backend](1.0),0.5,"scaling temporary hygiene");
  }finally{if(previous===undefined)delete globalThis.OverflowError;else globalThis.OverflowError=previous;}
  for(const name of ["frexp","ldexp"]){
    for(const alias of ["float","abs","sqrt","len"]){
      const expression=name==="frexp"?`${alias}(x)`:`${alias}(x, -1)`;
      const returnType=name==="frexp"?"tuple[float,int]":"float";
      const ir=await lowerSource(`from sagejs.native import native\nfrom math import ${name} as ${alias}\n@native\ndef f(x:float)->${returnType}:\n    return ${expression}\n`,"alias.py");
      assert.match(JSON.stringify(ir),new RegExp(`float64.${name}`));
    }
    const call=name==="frexp"?"f(x)":"f(x, 1)";
    await assert.rejects(()=>lowerSource(`from sagejs.native import native\nfrom math import ${name} as f\n@native\ndef g(f:float,x:float)->float:\n    return ${call}\n`,"shadow.py"),/shadowed/);
  }
  for(const expression of ["scale(x,1.0)","scale(x)","scale(x,1,2)","scale(x,exponent=1)"])
    await assert.rejects(()=>lowerSource(`from sagejs.native import native\nfrom math import ldexp as scale\n@native\ndef f(x:float)->float:\n    return ${expression}\n`,"bad.py"),/integer|Integer|positional/);
  const ir=await lowerSource(readFileSync(source,"utf8"),source);
  const scaling=ir.functions.find(fn=>fn.name==="scaling");
  assert(scaling.analysis.effects.mayRaise.includes("OverflowError"));
  const {classifyWasmFunction,generateWasmBridge}=require("../wasm-bridge.cjs");
  assert.equal(classifyWasmFunction(ir.functions.find(fn=>fn.name==="decomposition"),ir).supported,true);
  const bridge=generateWasmBridge({ir,moduleIdentity:"0123456789abcdef",functionNames:["decomposition","scaling","roundtrip"]});
  assert(bridge); // Layout generation only; a separate toolchain test executes Wasm.
});
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
for(const operation of ["log", "log2"])test(`imported math.${operation} preserves binding and binary64 domains`,async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-log-")),source=join(dir,"logarithm.py");
  writeFileSync(source,`from sagejs.native import native, Float64Buffer
from math import ${operation} as logarithm
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
  assert.match(readFileSync(built.coreSourcePath,"utf8"),new RegExp(` = ${operation}\\(`));
  assert.doesNotMatch(readFileSync(built.coreSourcePath,"utf8"),/napi_call_function|PyObject_Call/);
  const values=[Number.MIN_VALUE,2**-1022,0.125,0.5,1-Number.EPSILON/2,1,1+Number.EPSILON,2,3,101,Number.MAX_VALUE];
  for(let exponent=-1000;exponent<=1000;exponent+=25)values.push(1.125*2**exponent);
  const oracle=spawnSync("python3",["-c",`import json,sys,math;print(json.dumps([math.${operation}(x) for x in json.load(sys.stdin)]))`],{input:JSON.stringify(values),encoding:"utf8",timeout:30000});assert.equal(oracle.status,0,oracle.stderr);
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
  for(const backend of ["javascript","gmp"]){
    const out=[0];mod.mixed[backend]([Infinity],out);assert.equal(out[0],Infinity);
    mod.mixed[backend]([NaN],out);assert(Number.isNaN(out[0]));
  }
  if(operation === "log2")for(let exponent=-1074;exponent<=1023;exponent++){
    const value=2**exponent;
    for(const backend of scalarBackends)assert.equal(backend(value),exponent);
    for(const backend of ["javascript","gmp"]){const out=[0];mod.mixed[backend]([value],out);assert.equal(out[0],exponent);}
  }
  for(const alias of ["float","RealNumber","abs","sqrt","len"]){
    const ir=await lowerSource(`from math import ${operation} as ${alias}\ndef f(x:float)->float:\n    return ${alias}(x)\n`,"alias.py");
    assert(JSON.stringify(ir).includes(`float64.${operation}`));
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
    "from sagejs.native import native\n" + body.replace(/\blog\b/g,operation).replace("def f(","@native\ndef f("),
    "log-binding.py"),/shadowed|argument|positional|ambiguous|unsupported/);
});
