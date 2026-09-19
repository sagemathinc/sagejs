// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const {mkdtempSync,writeFileSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const {compileKernel} = require("../compiler.cjs");
const {lowerSource} = require("../ir.cjs");
test("int.bit_length preserves zero, sign, and large exact operands", async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sagejs-bit-length-"));
  const source=join(dir,"bits.py");
  writeFileSync(source,`from sagejs.native import native
@native
def bits(x: int) -> int:
    return x.bit_length()
@native
def bits_expression(x: int) -> int:
    return abs(x + 1).bit_length()
`);
  const built=await compileKernel({sourcePath:source});
  const mod=require(built.modulePath), addon=require(built.addonPath);
  const values=[0n,1n,-1n,2n,-2n, -(1n<<63n),(1n<<64n)-1n];
  for(const k of [31n,63n,64n,127n,511n,512n,4096n])
    for(const d of [-1n,0n,1n]) {values.push((1n<<k)+d);values.push(-((1n<<k)+d));}
  const oracle=spawnSync("python3",["-c","import json,sys; print(json.dumps([[int(x).bit_length(),abs(int(x)+1).bit_length()] for x in json.load(sys.stdin)]))"],
    {input:JSON.stringify(values.map(String)),encoding:"utf8",timeout:30000});
  assert.equal(oracle.status,0,oracle.stderr);
  const expected=JSON.parse(oracle.stdout);
  for(let i=0;i<values.length;i++)for(const [j,name] of ["bits","bits_expression"].entries())
    for(const fn of [mod[name],mod[name].javascript,addon[name]])
      assert.equal(fn(values[i]),BigInt(expected[i][j]),`${name} input ${values[i]}`);
  await assert.rejects(()=>lowerSource("def f(x: int) -> int:\n    return x.bit_length(1)\n","bad.py"),/takes no arguments/);
  await assert.rejects(()=>lowerSource("def f(x: float) -> int:\n    return x.bit_length()\n","bad.py"),/requires an integer/);
});
