"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const directory = process.argv[2];
const gp = process.argv[3];
const builds = JSON.parse(fs.readFileSync(path.join(directory, "builds.json"))).records;
const {sourceAtCutoff} = require("./diagnose-cubic-cutoff-build.cjs");
assert.equal(builds.length, 2, "expected baseline and one experimental cutoff");
assert.equal(builds[0].cutoff, 997);
const sources = builds.map(b => {
  const source = fs.readFileSync(path.join(directory, `cutoff-${b.cutoff}.py`), "utf8");
  assert.equal(crypto.createHash("sha256").update(source).digest("hex"), b.sourceSha256,
    "experimental source changed since compilation");
  return source;
});
assert.equal(sourceAtCutoff(sources[0], builds[1].cutoff), sources[1],
  "experiment must change only the initial analytic cutoff");
const implementations = builds.map(b => {
  const m = require(path.join(directory, `cache-${b.cutoff}`, b.cacheKey, "index.cjs"));
  assert.equal(m.nativeAvailable, true);
  const k = m.certified_complex_cubic_class_group_v1;
  return { cutoff: b.cutoff, k, out: k.createIntegerBuffer(64,256),
    coefficients: k.packIntegerBuffer([-63n,-11n,-1n,1n]),
    scratch: [k.createUInt64Buffer(4161), ...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))] };
});
function execute(c) { return c.k(c.out,c.coefficients,...c.scratch,0,5,1048576,3145728); }
for (const c of implementations) for(let i=0;i<100;i++) assert.equal(execute(c),true);
const samples=[];
for(let round=0;round<11;round++) {
  for (const kind of (round%2 ? [2,1,0]:[0,1,2])) {
    if(kind===2) {
      const script='setrand(1);f=x^3-x^2-11*x-63;for(i=1,100,b=bnfinit(f,0));t=getwalltime();for(i=1,1000,b=bnfinit(f,0));print(getwalltime()-t);print(b.no);print(b.cyc);quit;\n';
      const r=spawnSync(gp,['-fq'],{input:script,encoding:'utf8',timeout:60000});
      assert.equal(r.status,0,r.stderr);
      const lines=r.stdout.trim().split('\n'); assert.equal(lines[1],'3');assert.equal(lines[2],'[3]');
      samples.push({round,implementation:'pari',ms:Number(lines[0])/1000});
    } else {
      const c=implementations[kind];const start=performance.now();let accepted;
      for(let i=0;i<256;i++) accepted=execute(c);
      const ms=(performance.now()-start)/256;assert.equal(accepted,true);
      const output=c.out.toArray().map(String);assert.equal(output[1],'3');assert.equal(output[2],'1');assert.equal(output[3],'3');
      samples.push({round,implementation:`cutoff-${c.cutoff}`,ms,accepted,output});
    }
  }
  console.error('round',round+1);
}
console.log(JSON.stringify({schema:'sagejs.diagnostic/cubic-cutoff-opt-v1',
  public_call:false,independent_exact_replay:false,promotion:false,
  boundary:'native polynomial-to-result with preallocated external scratch versus PARI bnfinit(polynomial,0); not a public API parity claim',
  proof:'unchanged exact conditional-GRH acceptance; initial cutoff only changed; refinement 1494 retained',
  experimental_initial_cutoff:builds[1].cutoff,acceptance_rule_changed:false,
  host:{hostname:os.hostname(),cpus:os.cpus().map(c=>c.model),node:process.version},builds,samples},null,2));
