// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const {mkdtempSync, writeFileSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const test = require("node:test");
const {compileKernel} = require("../compiler.cjs");
const {lowerSource} = require("../ir.cjs");
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
