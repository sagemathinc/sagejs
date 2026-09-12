"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "../../../../..");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
function verifyRecord(r) {
assert.equal(r.schema, "sagejs.prepared-statistics-development/v1");
assert.equal(r.source.commit, "dca0b087308e665f56adb706944e93314708f97e");
assert.equal(r.source.clean, true);
assert.equal(r.build.current, true);
assert.equal(r.policy.warmups, 3); assert.equal(r.policy.samples, 7);
assert.equal(r.policy.observations, 20000);
assert.equal(r.collector_sha256, hash("bench/numerics/performance/prepared-statistics.cjs"));
assert.equal(r.workload_sha256, hash("bench/numerics/performance/prepared-statistics.py"));
for (const source of r.sources) assert.equal(source.sha256, hash(source.path));
assert.deepEqual(r.records.map(b => b.runtime), ["cpython", "sagejs"]);
for (const b of r.records) {
  assert.equal(b.records.length, 6);
  for (const [i, row] of b.records.entries()) {
    assert.equal(row.trace, i < 3 ? "none" : "summary");
    assert.equal(row.route, ["generic", "prepared-dynamic", "prepared-native"][i % 3]);
    const q = row.query;
    assert.equal(q.samples_ms.length, 7);
    assert.ok(q.samples_ms.every(t => Number.isFinite(t) && t >= 0));
    assert.equal(q.median_ms, [...q.samples_ms].sort((a,b) => a-b)[3]);
    assert.ok(Number.isFinite(q.first_call_ms) && q.first_call_ms >= 0);
    assert.equal(q.validation.passed, true);
    assert.deepEqual(q.value, r.records[0].records[i].query.value);
    assert.deepEqual(q.validation, r.records[0].records[i].query.validation);
    if (i % 3) {
      assert.ok(row.setup_wall_ms > 0);
      assert.equal(row.preparation.summary_precomputed, false);
      assert.equal(row.preparation.evaluations, 20000);
      assert.equal(row.preparation.selected_backend,
        b.runtime === "sagejs" && row.route === "prepared-native" ? "source-native" : "ordinary-python");
    }
  }
}
}
for (const filename of ["local-development.json", "linux-x64/opportunity.json"]) {
  verifyRecord(JSON.parse(fs.readFileSync(path.join(__dirname, filename), "utf8")));
}
const host = JSON.parse(fs.readFileSync(path.join(__dirname, "linux-x64/report.json"), "utf8"));
assert.equal(host.source, "dca0b087308e665f56adb706944e93314708f97e");
assert.equal(host.finalSource, host.source);
assert.equal(host.finalClean, true); assert.equal(host.success, true);
assert.deepEqual(host.stages.map(s => s.name), ["build", "focused", "opportunity"]);
for (const stage of host.stages) {
  assert.equal(stage.status, 0); assert.equal(stage.signal, null); assert.equal(stage.error, null);
  const bytes = fs.readFileSync(path.join(__dirname, "linux-x64", stage.name + ".log"));
  assert.equal(stage.logSha256, crypto.createHash("sha256").update(bytes).digest("hex"));
}
console.log("Retained public statistics development evidence is internally consistent; target remains unqualified.");
