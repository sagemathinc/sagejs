"use strict";
// Frozen-oracle replay; --native also builds and exercises the focused graph.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
const { createNativeImportResolver } = require("../../tools/native-kernel/native-imports.cjs");
const { generateJavaScript } = require("../../tools/native-kernel/js-backend.cjs");
(async () => {
  const root = path.resolve(__dirname, "../.."), sourcePath = path.join(__dirname, "post_hnf_acceptance.py");
  const resolveNativeImport = createNativeImportResolver({ root, lowerSource, initialSourcePath: sourcePath });
  const ir = await lowerSource(fs.readFileSync(sourcePath, "utf8"), sourcePath, { resolveNativeImport });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-post-hnf-schedule-"));
  const modulePath = path.join(dir, "kernel.cjs");
  fs.writeFileSync(modulePath, generateJavaScript(ir, { sourcePath }));
  let f = require(modulePath).pari_post_hnf_acceptance;
  const backends = ["javascript"];
  if (process.argv.includes("--native")) {
    const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
    const built = await compileKernel({ sourcePath });
    f = require(built.modulePath).pari_post_hnf_acceptance;
    assert(f.nativeAvailable);
    backends.push("gmp", "tagged");
  }
  const [cases, expected] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  assert.equal(cases.length, expected.length);
  let early = 0;
  for (const backend of backends) for (let ix = 0; ix < cases.length; ix++) {
    const r = cases[ix], e = expected[ix], n = r.rows, c = r.columns;
    for (const poison of e && e.acceptance[0] !== 2 ? [false, true] : [false]) {
      const z = n*(c+1), q = n*n, s = (n-1)*c, make = k => Array(k).fill(77n);
      const lengths = [3*z,c+1,3,3*z,n,c+1,3,z,z,n,c+1,c+1,10,3*q,3*q,3*q,3,n,5,3*q,3*q,3*q,n,3,3*q,3*q,3,3*s];
      const a = [make(3*n*c),BigInt(n),BigInt(c),BigInt(r.degree),...lengths.map(make),[77n,0n,73n,77n],make(3),...[3*s,s,s,n-1,s,15,3,s,1,4,n-1,c].map(make),r.changed,make(3)];
      const h = make(1), state = make(3);
      const result = f[backend](...[r.kc,r.hRows,r.bColumns,r.cColumns,n,r.degree].map(BigInt),poison?[]:r.H.map(BigInt),r.C.map(BigInt),poison?[]:r.inv.map(BigInt),a[0],h,a[33],state,...a.slice(4,33),...a.slice(34));
      if (!e) { assert.equal(result,-100n); assert.deepEqual(h,[77n]); assert.deepEqual(a[33],make(3)); continue; }
      assert.equal(result,BigInt(e.acceptance[1]));
      assert.deepEqual(a[47],e.acceptance.map(BigInt));
      assert.deepEqual(a[32],e.multiple_state.map(BigInt));
      assert.deepEqual(a[43],e.reconstruction_state.map(BigInt));
      assert.deepEqual(h,e.acceptance[0]===2?[BigInt(r.h)]:[77n]);
      if(e.acceptance[0]!==2) assert.deepEqual(a[33],make(3));
      else if(r.zeta) assert.deepEqual(a[33],r.zeta.map(BigInt));
      for(const [at,key,len] of [[30,"multiple",3],[31,"coordinates",3*s],[40,"regulator",3],[41,"relations",s]]) assert.deepEqual(a[at],e[key].length?e[key].map(BigInt):make(len));
      if(poison) early++;
    }
  }
  console.log(JSON.stringify({cases:cases.length,poisonedEarlyReplays:early,backends,artifactDirectory:dir}));
})().catch(e => { console.error(e); process.exitCode=1; });
