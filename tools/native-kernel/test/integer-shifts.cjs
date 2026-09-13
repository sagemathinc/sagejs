// sagejs-test-tier: specialized
"use strict";
const assert=require("node:assert/strict");
const {mkdtempSync,writeFileSync}=require("node:fs");
const {tmpdir}=require("node:os");
const {join}=require("node:path");
const {spawnSync}=require("node:child_process");
const test=require("node:test");
const {compileKernel}=require("../compiler.cjs");
test("exact integer shifts preserve Python signs and checked count semantics",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-shifts-")),source=join(dir,"shifts.py");
  writeFileSync(source,`from sagejs.native import native
@native
def left(x: int, n: int) -> int:
    return x << n
@native
def right(x: int, n: int) -> int:
    return x >> n
`);
  const b=await compileKernel({sourcePath:source}),mod=require(b.modulePath),raw=require(b.addonPath);
  const cases=[];
  for(const x of [0n,1n,-1n,7n,-7n,-(1n<<63n),(1n<<511n)+3n])
    for(const n of [0n,1n,63n,64n,512n])cases.push([x,n]);
  const oracle=spawnSync("python3",["-c","import json,sys; print(json.dumps([[str(int(x)<<int(n)),str(int(x)>>int(n))] for x,n in json.load(sys.stdin)]))"],{input:JSON.stringify(cases.map(c=>c.map(String))),encoding:"utf8",timeout:30000});
  assert.equal(oracle.status,0,oracle.stderr);const expected=JSON.parse(oracle.stdout);
  for(let i=0;i<cases.length;i++)for(const [j,name] of ["left","right"].entries())
    for(const f of [mod[name],mod[name].javascript,raw[name]])assert.equal(f(...cases[i]),BigInt(expected[i][j]));
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
});
