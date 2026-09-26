// Explicit compiler-root argument permits testing the isolated prerequisite
// branch before it is integrated. No PARI or full-path timing claim is made.
"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const compilerRoot = path.resolve(process.argv[2] || path.join(__dirname, "../.."));
const {compileKernel} = require(path.join(compilerRoot, "tools/native-kernel/compiler.cjs"));
(async () => {
  const program = `import sys,runpy,pkgutil,collections,json,pathlib,itertools,math\nsys.path.insert(0,${JSON.stringify(path.join(compilerRoot,"src/lib"))})\nimport sagejs.native\nsys.path.pop(0)\nsys.argv=['check','--json']\nrunpy.run_path(${JSON.stringify(path.join(__dirname,"check_enumeration.py"))},run_name='__main__')`;
  const python = spawnSync("python3", ["-c", program], {encoding:"utf8",timeout:30000});
  assert.equal(python.status, 0, python.stderr);
  const cases = JSON.parse(python.stdout);
  const built = await compileKernel({sourcePath:path.join(__dirname,"enumeration.py")});
  const module = require(built.modulePath);
  for (const execute of [module.pari_fp_next, module.pari_fp_next.javascript]) {
    for (const c of cases) {
      const stride=c.degree+1, q=Array(stride*stride).fill(0),v=[0,...Array(c.degree).fill(1)];
      for(let i=1;i<c.degree;i++) q[i*stride+i+1]=c.shear;
      const x=Array(stride).fill(0), y=Array(stride).fill(0),z=Array(stride).fill(0),inc=Array(stride).fill(0),state=[0,0,0,0],rows=[];
      const args=[q,v,x,y,z,inc,state,c.degree,c.bound,c.skip];
      while(execute(...args)) {rows.push(x.slice(1).map(Number));assert.ok(rows.length<10000);}
      assert.deepEqual(rows,c.rows);
      assert.equal(execute(...args),0n);
    }
  }
  console.log(`CPython / generated JS / native enumeration agree on ${cases.length} cases (including candidate order). Not a PARI trace comparison.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
