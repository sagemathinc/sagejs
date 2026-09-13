"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const {createHash} = require("node:crypto");
const root = path.resolve(__dirname,"../../../../..");
const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const name of ["local.json","linux-x64.json"]) {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname,name),"utf8"));
  assert.equal(r.candidate_source_sha256,sha(path.join(root,"src/lib/sagejs/numerics/_json.py")));
  assert.equal(r.collector_sha256,sha(path.join(root,"bench/numerics/performance/json-leaves.cjs")));
  assert.equal(r.baseline_source_sha256,"c83567983bb5f48a95fa8aacfa9e2db9640f177f820747d9fa5191a846a9cde1");
  assert.equal(r.warmups,3); assert.equal(r.samples,7);
  for (const rows of [r.sagejs,r.cpython]) {
    assert.equal(rows.length,12);
    for (const row of rows) {
      assert.equal(row.samples_ms.length,7);
      assert.ok(row.samples_ms.every(x=>Number.isFinite(x)&&x>=0));
      assert.equal(row.median_ms,[...row.samples_ms].sort((a,b)=>a-b)[3]);
      assert.equal(row.equivalent_and_detached,true);
    }
    for (let i=0;i<12;i+=4) assert.deepEqual(rows.slice(i,i+4).map(x=>x.round),["A1","B1","B2","A2"]);
  }
}
console.log("JSON leaf experiment source hashes and retained observations verified");
