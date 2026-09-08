"use strict";
// Local correctness diagnostic, not an opt timing or promotion receipt.
const fs = require("node:fs"), path = require("node:path");
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { gunzipSync } = require("node:zlib");
const { sageCensusSource, RESPONSE_MARKER, candidateRuntimeClosure,
  assertRuntimeClosureUnchanged } = require("./run-complex-cubic-frontier.cjs");
const root = path.resolve(__dirname, "../..");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function main() {
  const [corpusPath, outputPath, ...extra] = process.argv.slice(2);
  assert.ok(corpusPath && outputPath && !extra.length);
  const raw = gunzipSync(fs.readFileSync(corpusPath));
  const corpusHash = hash(raw);
  assert.equal(corpusHash, "81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd");
  const fields = raw.toString().trim().split("\n").map(JSON.parse)
    .filter(r => r.selection.role === "tune");
  assert.equal(fields.length, 1000);
  assert.equal(new Set(fields.map(r => r.label)).size, 1000);
  const output = path.resolve(outputPath);
  fs.mkdirSync(output); // Do not overwrite a previous run.
  const source = path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py");
  const index = path.join(root, "dist/native-kernels/index.json");
  const identity = {
    schema: "sagejs.diagnostic/local-cubic-public-replay-v2",
    promotion: false, opt_census: false, retained_timing: false,
    environment_policy: "inherited local environment with production native required; runtime file fingerprint is not a hermetic-launch attestation",
    corpus_sha256: corpusHash, source_sha256: hash(fs.readFileSync(source)),
    production_index_sha256: hash(fs.readFileSync(index)),
    driver_sha256: hash(fs.readFileSync(__filename)),
    canonical_runner_sha256: hash(fs.readFileSync(path.join(__dirname, "run-complex-cubic-frontier.cjs"))),
    node: process.version, platform: process.platform, arch: process.arch,
    source_commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    tracked_diff_sha256: hash(spawnSync("git", ["diff", "HEAD"], { cwd: root }).stdout),
    runtime_closure: candidateRuntimeClosure(root),
    concurrency: 1,
  };
  fs.writeFileSync(path.join(output, "identity.json"), JSON.stringify(identity, null, 2));
  const observations = [];
  for (let start = 0; start < fields.length; start += 250) {
    assertRuntimeClosureUnchanged(identity.runtime_closure, candidateRuntimeClosure(root));
    const batch = fields.slice(start, start + 250), number = start / 250;
    const program = sageCensusSource(batch);
    fs.writeFileSync(path.join(output, `batch-${number}.py`), program);
    const result = spawnSync(process.execPath, [path.join(root, "bin/sagejs"), "--python"], {
      cwd: root, input: program, encoding: "utf8", timeout: 900_000,
      maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, SAGEJS_NATIVE_REQUIRED: "1",
        SAGEJS_NATIVE_CACHE_DIR: path.join(root, "dist/native-kernels") },
    });
    fs.writeFileSync(path.join(output, `batch-${number}.stdout`), result.stdout || "");
    fs.writeFileSync(path.join(output, `batch-${number}.stderr`), result.stderr || "");
    assertRuntimeClosureUnchanged(identity.runtime_closure, candidateRuntimeClosure(root));
    assert.equal(result.status, 0, `${result.error || ""}\n${result.stderr}`);
    const responses = result.stdout.split("\n").filter(line => line.startsWith(RESPONSE_MARKER));
    assert.equal(responses.length, 1);
    const response = JSON.parse(responses[0].slice(RESPONSE_MARKER.length));
    fs.writeFileSync(path.join(output, `batch-${number}.json`), JSON.stringify(response));
    assert.equal(response.payload.records.length, batch.length);
    for (let i = 0; i < batch.length; i++) {
      const actual = response.payload.records[i], expected = batch[i];
      assert.equal(actual.label, expected.label);
      assert.equal(actual.status, "native-pass", JSON.stringify({ label: actual.label, status: actual.status, reason: actual.reason }));
      assert.equal(actual.class_number, expected.class_number);
      assert.deepEqual([...actual.class_group_invariants].sort(), [...expected.class_group].sort());
      assert.equal(actual.discriminant, "-" + expected.discriminant_absolute);
      assert.equal(actual.native_receipt_authenticated, true);
      assert.equal(actual.independent_exact_replay, true);
      assert.equal(actual.independent_exact_replay_contract, "ordinary-object-exact-replay-bypassing-closed-cubic-authority");
      observations.push(actual);
    }
    console.log(`${observations.length}/1000 authenticated public receipts and exact replays`);
  }
  assert.equal(hash(fs.readFileSync(source)), identity.source_sha256);
  assert.equal(hash(fs.readFileSync(index)), identity.production_index_sha256);
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ ...identity, records: observations }));
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}
