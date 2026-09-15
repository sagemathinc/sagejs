// sagejs-test-tier: specialized
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),test=require("node:test");
const {compileKernel,}=require("../compiler.cjs"),{lowerSource}=require("../ir.cjs");
test("JavaScript escapes reserved Python bindings without mutating source IR",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-reserved-bindings-")),source=path.join(dir,"bindings.py");
  fs.writeFileSync(source,`from sagejs.native import native, IntegerBuffer, Float64Buffer
@native
def pair(new:int)->tuple[int,int]:
    return new,new+1
@native
def reserved(new:int,arguments:IntegerBuffer)->int:
    __sagejs_js_binding_0=100
    let=new+1
    for var in range(2):
        let+=var
    if new<0:
        raise ValueError("new")
    package,delete=pair(let)
    arguments[0]=package+delete
    return arguments[0]+__sagejs_js_binding_0
@native
def floating(new:float)->float:
    let=new+1.0
    return let*2.0
@native
def float_buffer(arguments:Float64Buffer)->float:
    arguments[0]+=1.0
    return arguments[0]
`);
  const oracle=require("node:child_process").spawnSync("python3",["-c",`
import sys
sys.path[:0]=[${JSON.stringify(dir)},${JSON.stringify(path.resolve(__dirname,"../../../src/lib"))}]
import bindings
a=[0]
assert bindings.reserved(3,a)==111 and a==[11]
assert bindings.pair(4)==(4,5) and bindings.floating(3.5)==9
b=[2.5]
assert bindings.float_buffer(b)==3.5 and b==[3.5]
`],{encoding:"utf8"});assert.equal(oracle.status,0,oracle.stderr);
  const ir=await lowerSource(fs.readFileSync(source,"utf8"),source),before=JSON.stringify(ir);
  const js=require("../js-backend.cjs").generateJavaScript(ir);
  assert.equal(JSON.stringify(ir),before,"backend escaping must not rewrite authoritative IR");
  assert(ir.functions.find(f=>f.name==="reserved").params.some(p=>p.name==="new"));
  assert.match(js,/nativeRaise\("ValueError", "new"\)/);
  assert.match(js,/__sagejs_js_binding_1/);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  assert(mod.reserved.effects.externalWrites.includes("arguments"));
  for(const backend of ["javascript","gmp","tagged"]){
    const a=[0n];assert.equal(mod.reserved[backend](3n,a),111n);assert.deepEqual(a,[11n]);
    assert.throws(()=>mod.reserved[backend](-1n,[0n]),/new/);
    assert.deepEqual(mod.pair[backend](4n),[4n,5n]);
  }
  assert.equal(mod.floating.javascript(3.5),9);
  assert.equal(mod.floating(3.5),9);
  for(const execute of [mod.float_buffer,mod.float_buffer.javascript]){
    const a=[2.5];assert.equal(execute(a),3.5);assert.deepEqual(a,[3.5]);
  }
});
test("exact kernels publish Float64 results without integer reinterpretation",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-exact-float-result-")),source=path.join(dir,"result.py");
  fs.writeFileSync(source,`from sagejs.native import native, checked_float64
@native
def scalar(x:int)->float:
    if x == 0:
        return -0.0
    return checked_float64(x)/2.0
@native
def caller(x:int)->float:
    return scalar(x)
`);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  for(const name of ['scalar','caller'])for(const fn of [mod[name],mod[name].gmp,mod[name].tagged,mod[name].javascript]){
    assert.equal(fn(3n),1.5);assert.equal(fn(-3n),-1.5);assert(Object.is(fn(0n),-0));
  }
});
test("integer-only wrappers inherit transitive Float64 backend requirements",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-transitive-float-")),source=path.join(dir,"calls.py");
  fs.writeFileSync(source,`from sagejs.native import native, checked_float64
from math import log2
@native
def inner(x:int)->int:
    return int(log2(checked_float64(x)))
@native
def middle(x:int)->int:
    return inner(x)+1
@native
def outer(x:int)->int:
    return middle(x)+1
`);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  for(const [name,offset] of [['inner',0n],['middle',1n],['outer',2n]]){
    for(const backend of ['javascript','gmp','tagged'])assert.equal(mod[name][backend](8n),3n+offset);
    assert.equal(mod[name](8n),3n+offset);
  }
  const ir=await lowerSource(fs.readFileSync(source,'utf8'),source);
  for(const fn of ir.functions){assert.equal(fn.analysis.backend.kind,'gmp');assert.equal(fn.analysis.mixedFloat64,true);}
});
test("discarded scalar native calls preserve mutation and errors",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-call-statement-")),source=path.join(dir,"calls.py");
  fs.writeFileSync(source,`from sagejs.native import native, IntegerBuffer, Float64Buffer
@native
def mutate(a:IntegerBuffer, fail:int)->int:
    a[0]+=1
    if fail != 0:
        raise ValueError("callee failed")
    return 99
@native
def run(a:IntegerBuffer,fail:int)->int:
    mutate(a,0)
    mutate(a,fail)
    return a[0]
@native
def float_init(a:Float64Buffer)->int:
    a[0]=7.5
    return 1
@native
def mixed(a:Float64Buffer)->int:
    float_init(a)
    return 42
`);
  const b=await compileKernel({sourcePath:source}),mod=require(b.modulePath);
  const oracle=require("node:child_process").spawnSync("python3",["-c",`
import sys
sys.path[:0]=[${JSON.stringify(dir)},${JSON.stringify(path.resolve(__dirname,"../../../src/lib"))}]
from calls import run,mixed
a=[0]
assert run(a,0)==2 and a==[2]
try:run(a,1)
except ValueError as error:assert str(error)=="callee failed"
else:raise AssertionError("expected callee failure")
assert a==[4]
b=[0.0]
assert mixed(b)==42 and b==[7.5]
`],{encoding:"utf8",timeout:30000});assert.equal(oracle.status,0,oracle.stderr);
  for(const backend of ["javascript","gmp","tagged"]){
    const a=[0n];assert.equal(mod.run[backend](a,0n),2n);assert.equal(a[0],2n);
    assert.throws(()=>mod.run[backend](a,1n),/callee failed/);assert.equal(a[0],4n);
  }
  for(const backend of ["javascript","gmp"]){const a=[0];assert.equal(mod.mixed[backend](a),42n);assert.equal(a[0],7.5);}
  await assert.rejects(()=>lowerSource("def f(a:int)->int:\n    missing(a)\n    return a\n","unknown.py"),/unsupported|unknown/);
  await assert.rejects(()=>lowerSource("def pair(a:int)->tuple[int,int]:\n    return a,a\ndef f(a:int)->int:\n    pair(a)\n    return a\n","tuple.py"),/scalar native call/);
});
