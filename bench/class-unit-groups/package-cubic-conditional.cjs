"use strict";
// Prepare a self-contained diagnostic bundle; no remote actions or timing.
const fs = require("node:fs"), path = require("node:path");
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const [baselineDirectory, candidateManifest, destination, order, ...extra] = process.argv.slice(2);
assert.ok(baselineDirectory && candidateManifest && destination && !extra.length);
assert.ok(order === undefined || order === "reverse");
const baseline = JSON.parse(fs.readFileSync(path.join(baselineDirectory,"manifest.json")));
const candidate = JSON.parse(fs.readFileSync(candidateManifest));
assert.ok(["sagejs.diagnostic/cubic-conditional-ablation-v1", "sagejs.diagnostic/cubic-volume-batch-ablation-v1"].includes(candidate.schema));
assert.notEqual(candidate.checkpoint_trace,true,"instrumented checkpoints are not timing artifacts");
assert.equal(candidate.production_source_sha256,baseline.sourceHash);
const sourceRecords = [{name:"baseline",sourcePath:baseline.sourcePath,
  sourceSha256:baseline.sourceHash,cacheKey:baseline.cacheKey,modulePath:path.resolve(baselineDirectory,"index.cjs")}, ...candidate.records];
if (order === "reverse") sourceRecords.reverse();
fs.mkdirSync(destination); // Explicitly refuse an existing destination.
const records = sourceRecords.map(r=>{
  assert.match(r.name,/^[a-z0-9_-]+$/);
  const directory = path.dirname(r.modulePath);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,"manifest.json")));
  assert.equal(manifest.cacheKey,r.cacheKey);
  assert.equal(manifest.sourceHash,r.sourceSha256);
  assert.equal(hash(fs.readFileSync(r.sourcePath)),r.sourceSha256);
  const target = path.join(destination,r.name);
  fs.mkdirSync(path.join(target,"build/Release"),{recursive:true});
  fs.copyFileSync(r.sourcePath,path.join(target,"source.py"));
  fs.copyFileSync(r.modulePath,path.join(target,"index.cjs"));
  const addon = path.join(directory,"build/Release/sagejs_native_kernel.node");
  fs.copyFileSync(addon,path.join(target,"build/Release/sagejs_native_kernel.node"));
  return {name:r.name,cacheKey:r.cacheKey,sourceSha256:r.sourceSha256,
    moduleSha256:hash(fs.readFileSync(r.modulePath)),addonSha256:hash(fs.readFileSync(addon)),
    sourceBytes:fs.statSync(r.sourcePath).size,
    generatedCoreBytes:fs.statSync(path.join(directory,"kernel_core.c")).size,
    generatedCoreSha256:hash(fs.readFileSync(path.join(directory,"kernel_core.c"))),
    addonBytes:fs.statSync(addon).size};
});
const manifest = {schema:"sagejs.diagnostic/portable-cubic-ablation-v1",promotion:false,
  packagerSha256:hash(fs.readFileSync(__filename)),candidateBuild:candidate,records};
fs.writeFileSync(path.join(destination,"builds.json"),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(destination,"source-builds.json"),JSON.stringify({
  schema:"sagejs.diagnostic/cubic-conditional-ablation-v1",records:sourceRecords},null,2));
for (const filename of ["diagnose-cubic-ablation-timing.cjs","cubic-ablation-fields.cjs"])
  fs.copyFileSync(path.join(__dirname,filename),path.join(destination,filename));
console.log(JSON.stringify(manifest));
