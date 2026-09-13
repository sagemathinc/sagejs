"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "../../../../../..");
const source = "c092f9fe7a923da053638569d51f41619b693bcf";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const read = filename => JSON.parse(fs.readFileSync(filename, "utf8"));
const median = values => [...values].sort((a,b)=>a-b)[3];
const rows = [];
for (const platform of ["linux-x64", "linux-arm64", "darwin-arm64", "win32-x64"]) {
  const dir = path.join(__dirname, platform), report = read(path.join(dir,"report.json"));
  assert.equal(report.schema,"sagejs.numerical-binary64-host/v1");
  assert.equal(report.source,source); assert.equal(report.finalSource,source);
  assert.equal(report.finalClean,true); assert.equal(report.success,true);
  assert.equal(`${report.platform}-${report.arch}`,platform);
  for (const stage of report.stages) {
    assert.match(stage.name,/^[a-z0-9-]+$/);
    assert.equal(sha(fs.readFileSync(path.join(dir,stage.name+".log"))),stage.logSha256);
    assert.equal(stage.signal,null); assert.equal(stage.error,null);
  }
  const [build,...remaining] = report.stages;
  assert.equal(build.name,"build");
  if (build.status !== 0) {
    assert.equal(build.status,1); assert.equal(report.buildResume.priorFailureRetained,true);
    assert.equal(remaining[0].name,"resume-stage-8");
    assert.match(fs.readFileSync(path.join(dir,"build.log"),"utf8"),/PASS 7\/8:/);
  }
  for (const stage of remaining) assert.equal(stage.status,0,stage.name);
  assert.equal(remaining.at(-2).name,"focused");
  assert.equal(remaining.at(-1).name,"opportunity");
  const tests = fs.readFileSync(path.join(dir,"focused.log"),"utf8");
  const count = label => Number(tests.match(new RegExp("\\b"+label+" (\\d+)(?:\\r?\\n|$)"))?.[1]);
  assert.equal(count("tests"),9); assert.equal(count("fail"),0); assert.equal(count("cancelled"),0);
  assert.ok([6,8].includes(count("pass"))); assert.equal(count("skipped"),9-count("pass"));
  const measurement = read(path.join(dir,"opportunity.json"));
  assert.equal(measurement.source.commit,source); assert.equal(measurement.source.clean,true);
  assert.equal(measurement.source_sha256,sha(fs.readFileSync(path.join(root,"src/lib/sagejs/numerics/statistics/_packed.py"))));
  assert.equal(measurement.collector_sha256,sha(fs.readFileSync(path.join(root,"bench/numerics/performance/packed-sum.cjs"))));
  assert.equal(measurement.policy.warmups,3); assert.equal(measurement.policy.samples,7);
  assert.deepEqual(measurement.rows.map(row=>row.count),[1000,20000,100000]);
  for (const row of measurement.rows) {
    const reference=measurement.cpython_math_fsum.records.find(item=>item.count===row.count);
    assert.equal(row.expected,reference.expected);
    for (const key of ["loop_clock_control","native_reused","javascript_ir_reused","native_pack_allocate"]) {
      const timing=row[key]; assert.equal(timing.samples_ms.length,7); assert.equal(timing.batch_samples_ms.length,7);
      assert.ok(timing.batch_size>0);
      assert.deepEqual(timing.samples_ms,timing.batch_samples_ms.map(t=>t/timing.batch_size));
      assert.ok(timing.samples_ms.every(t=>Number.isFinite(t)&&t>=0));
      assert.equal(timing.median_ms,median(timing.samples_ms));
    }
    assert.equal(reference.samples_ms.length,7);
    assert.deepEqual(reference.samples_ms,reference.batch_samples_ms.map(t=>t/reference.batch_size));
    rows.push({platform,count:row.count,passes:count("pass"),skips:count("skipped"),
      native_ms:row.native_reused.median_ms,pack_ms:row.native_pack_allocate.median_ms,
      cpython_fsum_ms:median(reference.samples_ms)});
  }
}
console.log(JSON.stringify({source,scope:"isolated-kernel-not-public-query-qualification",rows},null,2));
