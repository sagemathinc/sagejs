// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const {mkdtempSync, writeFileSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const test = require("node:test");
const {compileKernel} = require("../compiler.cjs");
const {lowerSource} = require("../ir.cjs");
test("one-argument round preserves binary64 ties to even and exact integer results", async () => {
  const {spawnSync}=require("node:child_process");
  const dir=mkdtempSync(join(tmpdir(),"sagejs-round-")),source=join(dir,"rounding.py");
  writeFileSync(source,`from sagejs.native import native, Float64Buffer
@native
def rounding(x:float)->int:
    return round(x)
@native
def exact(x:int)->int:
    return round(x)
@native
def to_float(x:int)->float:
    return float(x)
@native
def buffer_value(x:Float64Buffer)->float:
    return x[0]
@native
def round_buffer(x:Float64Buffer)->int:
    return round(buffer_value(x))
`);
  const values=[NaN,Infinity,-Infinity,-0,0,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE];
  for(let i=-100;i<=100;i++)for(const delta of [-Number.EPSILON*128,0,Number.EPSILON*128])values.push(i+0.5+delta);
  for(let e=-1074;e<=1023;e++)values.push(2**e);
  const oracle=spawnSync("python3",["-c",`import sys,json
out=[]
for x in json.load(sys.stdin):
 try:out.append(['ok',str(round(float(x)))])
 except Exception as e:out.append([type(e).__name__,''])
print(json.dumps(out))`],{encoding:"utf8",input:JSON.stringify(values.map(String))});
  assert.equal(oracle.status,0,oracle.stderr);const expected=JSON.parse(oracle.stdout);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  const previousValue=globalThis.ValueError,previousOverflow=globalThis.OverflowError;
  globalThis.ValueError=class ValueError extends Error{};globalThis.OverflowError=class OverflowError extends Error{};
  try {
    for(let i=0;i<values.length;i++)for(const backend of ["javascript","gmp"]){
      if(expected[i][0]==="ok"){
        assert.equal(mod.rounding[backend](values[i]),BigInt(expected[i][1]),`${i} ${backend}`);
        assert.equal(mod.round_buffer[backend]([values[i]]),BigInt(expected[i][1]),`${i} buffer ${backend}`);
      }
      else assert.throws(()=>mod.rounding[backend](values[i]),globalThis[expected[i][0]]);
    }
    for(const backend of ["javascript","gmp","tagged"])assert.equal(mod.exact[backend](1n<<100n),1n<<100n);
    const integers=new Set([0n]);
    for(const e of [0,1,52,53,54,64,100,511,1023,1024,1025]){
      const base=1n<<BigInt(e),half=e>53?1n<<BigInt(e-54):1n;
      for(const delta of [-1n,0n,1n,half-1n,half,half+1n,3n*half-1n,3n*half,3n*half+1n]){
        integers.add(base+delta);integers.add(-base-delta);
      }
    }
    const threshold=(1n<<1024n)-(1n<<970n);
    for(const delta of [-1n,0n,1n]){integers.add(threshold+delta);integers.add(-threshold-delta);}
    const inputs=[...integers];
    const converted=spawnSync("python3",["-c",`import sys,json
out=[]
for x in json.load(sys.stdin):
 try:out.append(['ok',repr(float(int(x)))])
 except OverflowError:out.append(['overflow',''])
print(json.dumps(out))`],{encoding:"utf8",input:JSON.stringify(inputs.map(String))});
    assert.equal(converted.status,0,converted.stderr);
    const wanted=JSON.parse(converted.stdout);
    for(let i=0;i<inputs.length;i++)for(const backend of ["javascript","gmp"]){
      if(wanted[i][0]==="overflow")assert.throws(()=>mod.to_float[backend](inputs[i]),globalThis.OverflowError);
      else assert.equal(mod.to_float[backend](inputs[i]),Number(wanted[i][1]),`${inputs[i]} ${backend}`);
    }
  }finally{if(previousValue===undefined)delete globalThis.ValueError;else globalThis.ValueError=previousValue;if(previousOverflow===undefined)delete globalThis.OverflowError;else globalThis.OverflowError=previousOverflow;}
});
test("range control transfers advance exactly once and preserve nested targets", async () => {
  const dir=mkdtempSync(join(tmpdir(),"sagejs-range-transfer-")),source=join(dir,"loops.py");
  writeFileSync(source,`from sagejs.native import native, uint64
@native
def exact(start:int, stop:int, step:int)->int:
    result=0
    for i in range(start,stop,step):
        if i % 3 == 0:
            continue
        if i % 7 == 0:
            break
        result=result*17+i
    return result
@native
def word(start:uint64,stop:uint64,step:uint64)->int:
    result=0
    for i in range(start,stop,step):
        if i % 3 == 0:
            continue
        if i % 7 == 0:
            break
        result=result*17+int(i)
    return result
@native
def nested(n:int)->int:
    result=0
    for i in range(n):
        for j in range(5,-1,-1):
            if j==4:
                continue
            if j==1:
                break
            result+=i+j
        k=0
        while k<3:
            k+=1
            if k==2:
                continue
            result+=k
        if i==2:
            continue
        result+=100
    return result
`);
  const built=await compileKernel({sourcePath:source}),mod=require(built.modulePath);
  const cases=[[0n,20n,1n],[20n,-5n,-1n],[2n,40n,3n],[3n,3n,1n],[(1n<<100n)+1n,(1n<<100n)+10n,2n],[(1n<<63n)-2n,1n<<63n,3n]];
  function oracle(a,b,s){let result=0n;for(let i=a;s>0n?i<b:i>b;i+=s){if(i%3n===0n)continue;if(i%7n===0n)break;result=result*17n+i;}return result;}
  for(const args of cases)for(const backend of ["javascript","gmp","tagged"])
    assert.equal(mod.exact[backend](...args),oracle(...args),backend);
  for(const args of [[0n,20n,1n],[3n,8n,5n],[(1n<<64n)-4n,(1n<<64n)-1n,9n]])
    for(const backend of ["javascript","gmp","tagged"])assert.equal(mod.word[backend](...args),oracle(...args),backend);
  for(let n=0;n<7;n++)for(const backend of ["javascript","gmp","tagged"]){
    let want=0;for(let i=0;i<n;i++){want+=3*i+14;if(i!==2)want+=100;}
    assert.equal(mod.nested[backend](BigInt(n)),BigInt(want),backend);
  }
  for(const transfer of ["break","continue"])
    await assert.rejects(()=>lowerSource(`from sagejs.native import native, NativeIntegerVector
@native
def bad(n:int)->int:
    for i in range(n):
        with NativeIntegerVector(1,4096) as values:
            ${transfer}
    return 0
`,"range-owner.py"),/cannot exit a live exact resource scope/);
});
test("explicit integer-kernel errors survive nested native calls", async () => {
  globalThis.ValueError = class ValueError extends Error {};
  globalThis.ZeroDivisionError = class ZeroDivisionError extends Error {};
  globalThis.OverflowError = class OverflowError extends Error {};
  const dir = mkdtempSync(join(tmpdir(), "sagejs-errors-")), source = join(dir, "errors.py");
  writeFileSync(source, `from sagejs.native import native
@native
def checked(x: int) -> int:
    if x > 100:
        raise OverflowError("conversion overflow")
    if x < 0:
        raise ValueError("division is not the cause")
    if x == 0:
        raise ZeroDivisionError("custom zero")
    return x
@native
def caller(x: int) -> int:
    return checked(x)
@native
def collision(x: int) -> int:
    if x < 0:
        raise ValueError("division by zero")
    if x == 99:
        raise ValueError("division by zero")
    return 7 // x
`);
  const built = await compileKernel({sourcePath: source}), mod = require(built.modulePath);
  for (const name of ["checked", "caller"]) {
    for (const f of [mod[name], mod[name].javascript, mod[name].gmp, mod[name].tagged]) {
      assert.equal(f(7n), 7n);
      assert.throws(() => f(101n), error => error instanceof globalThis.OverflowError && error.message === "conversion overflow");
      assert.throws(() => f(-1n), error => error instanceof globalThis.ValueError && error.message === "division is not the cause");
      assert.throws(() => f(0n), error => error instanceof globalThis.ZeroDivisionError && error.message === "custom zero");
    }
  }
  for (const f of [mod.collision.javascript, mod.collision.gmp, mod.collision.tagged]) {
    assert.throws(() => f(-1n), error => error instanceof globalThis.ValueError && error.message === "division by zero");
    assert.throws(() => f(0n), error => error instanceof globalThis.ZeroDivisionError);
  }
  for (const source of [
    'def f(OverflowError: int) -> int:\n    if OverflowError:\n        raise OverflowError("bad")\n    return 0\n',
    'def f(x: int) -> int:\n    if x:\n        raise OverflowError(x)\n    return 0\n',
    'def f(ValueError: int) -> int:\n    if ValueError:\n        raise ValueError("bad")\n    return 0\n',
    'ValueError = 7\ndef f(x: int) -> int:\n    if x:\n        raise ValueError("bad")\n    return 0\n',
    'def f(x: int) -> int:\n    if x:\n        raise ValueError(x)\n    return 0\n',
    'def f(x: int) -> int:\n    if x:\n        raise ValueError(message="bad")\n    return 0\n',
  ]) await assert.rejects(() => lowerSource('from sagejs.native import native\n' + source.replace('def f(', '@native\ndef f('), "invalid-error.py"), /native raise supports/);
});
