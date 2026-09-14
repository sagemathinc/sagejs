// sagejs-test-tier: specialized
"use strict";
const assert=require("node:assert/strict");
const {mkdtempSync,writeFileSync}=require("node:fs");
const {tmpdir}=require("node:os");
const {join}=require("node:path");
const {spawnSync}=require("node:child_process");
const test=require("node:test");
const {compileKernel}=require("../compiler.cjs");
test("exact integer shifts preserve Python signs and checked count semantics",async(t)=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-shifts-")),source=join(dir,"shifts.py");
  writeFileSync(source,`from sagejs.native import native
@native
def left(x: int, n: int) -> int:
    return x << n
@native
def right(x: int, n: int) -> int:
    return x >> n
@native
def word_base() -> int:
    return 1 << 64
@native
def inplace(x: int, n: int) -> int:
    shift = n
    x <<= shift
    x >>= shift
    return x
@native
def count_target(x: int, n: int) -> int:
    n = x << n
    return n
@native
def self_shift(x: int) -> int:
    x <<= x
    return x
`);
  const b=await compileKernel({sourcePath:source}),mod=require(b.modulePath),raw=require(b.addonPath);
  for(const f of [mod.word_base,mod.word_base.javascript,raw.word_base])assert.equal(f(),1n<<64n);
  for(const f of [mod.inplace,mod.inplace.javascript,raw.inplace])assert.equal(f(-7n,70n),-7n);
  const cases=[];
  for(const x of [0n,1n,-1n,7n,-7n,(1n<<63n)-1n,-(1n<<63n),(1n<<63n)+1n,-(1n<<100n)-1n,(1n<<511n)+3n])
    for(const n of [0n,1n,62n,63n,64n,65n,512n])cases.push([x,n]);
  const oracle=spawnSync("python3",["-c","import json,sys; print(json.dumps([[str(int(x)<<int(n)),str(int(x)>>int(n))] for x,n in json.load(sys.stdin)]))"],{input:JSON.stringify(cases.map(c=>c.map(String))),encoding:"utf8",timeout:30000});
  assert.equal(oracle.status,0,oracle.stderr);const expected=JSON.parse(oracle.stdout);
  for(let i=0;i<cases.length;i++)for(const [j,name] of ["left","right"].entries())
    for(const f of [mod[name],mod[name].javascript,mod[name].gmp,mod[name].tagged,raw[name]])assert.equal(f(...cases[i]),BigInt(expected[i][j]));
  for(const f of [mod.count_target.javascript,mod.count_target.gmp,mod.count_target.tagged])
    for(const [x,n] of cases)assert.equal(f(x,n),x<<n);
  for(const f of [mod.self_shift.javascript,mod.self_shift.gmp,mod.self_shift.tagged])
    for(const x of [0n,1n,7n,63n,64n])assert.equal(f(x),x<<x);
  for(const name of ["left","right"])for(const f of [mod[name],mod[name].javascript,raw[name]])
    assert.throws(()=>f(0n,-1n),/negative shift count/);
  for(const f of [mod.left,mod.left.javascript,raw.left]) {
    assert.equal(f(0n,1n<<100n),0n);
    assert.throws(()=>f(1n,1n<<100n),/allocation limit/);
    assert.equal(f(-1n,1048575n),-(1n<<1048575n));
    assert.throws(()=>f(1n,1048576n),/allocation limit/);
    assert.throws(()=>f(3n,1048575n),/allocation limit/);
  }
  for(const f of [mod.right,mod.right.javascript,raw.right]) {
    assert.equal(f(-123n,1n<<100n),-1n);assert.equal(f(123n,1n<<100n),0n);
  }
  // The differential tests above remain portable, including native Windows.
  // This additional direct ABI/UBSan diagnostic uses the Linux toolchain.
  if(process.platform!=="linux"){t.diagnostic("direct tagged representation UBSan control is Linux-only");return;}
  // Test the representation contract directly, outside host marshalling.
  const control=join(dir,"representation.c"),exe=join(dir,"representation");
  writeFileSync(control,`#include <stdio.h>
#include "${b.coreSourcePath}"
#include <assert.h>
int main(void) {
 sagejs_tagged_int x,n,y; sagejs_tagged_init(&x);sagejs_tagged_init(&n);sagejs_tagged_init(&y);
 sagejs_native_status status={0};
 sagejs_tagged_set_small(&x,7);sagejs_tagged_set_small(&n,4);
 assert(sagejs_tagged_shift(&status,&y,&x,&n,1));
 assert(!x.is_big && !n.is_big && !y.is_big && y.small==112);
 sagejs_tagged_set_small(&x,INT64_MIN);sagejs_tagged_set_small(&n,63);
 assert(sagejs_tagged_shift(&status,&y,&x,&n,0));assert(!y.is_big && y.small==-1 && !n.is_big);
 sagejs_tagged_set_small(&x,1);sagejs_tagged_make_big(&x);mpz_mul_2exp(x.big,x.big,100);
 sagejs_tagged_set_small(&n,7);
 assert(sagejs_tagged_shift(&status,&y,&x,&n,1));assert(!n.is_big && n.small==7);
 assert(y.is_big && mpz_popcount(y.big)==1 && mpz_tstbit(y.big,107));
 assert(sagejs_tagged_shift(&status,&n,&x,&n,1));assert(n.is_big && mpz_cmp(n.big,y.big)==0);
 sagejs_tagged_clear(&x);sagejs_tagged_clear(&n);sagejs_tagged_clear(&y);return 0;
}`);
  const prefix=process.env.SAGEJS_FLINT_PREFIX;assert(prefix);
  const cc=spawnSync("cc",["-O1","-fsanitize=undefined","-fno-sanitize-recover=all",
    "-I"+join(prefix,"include"),control,"-L"+join(prefix,"lib"),"-Wl,-rpath,"+join(prefix,"lib"),"-lgmp","-lm","-o",exe],{encoding:"utf8",timeout:120000});
  assert.equal(cc.status,0,cc.stderr);
  const checked=spawnSync(exe,[],{encoding:"utf8",timeout:30000});assert.equal(checked.status,0,checked.stderr);
});
