"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "../../../../../../../");
const manifest = json("release/production-manifest.json");
const report = json("build/build-report.json");

function bytes(relative) {
  return readFileSync(resolve(packageRoot, relative));
}

function json(relative) {
  return JSON.parse(bytes(relative));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function verifyHash(actualPath, expected, root = packageRoot) {
  assert.equal(
    sha256(readFileSync(resolve(root, actualPath))),
    expected,
    `${actualPath} no longer matches the reviewed production manifest`,
  );
}

function reviewedBundleHash(files) {
  const records = Object.entries(files).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0);
  for (const [path, expected] of records) {
    assert.equal(typeof path, "string");
    assert.match(expected, /^[0-9a-f]{64}$/);
    verifyHash(path, expected, repositoryRoot);
  }
  return sha256(Buffer.from(
    records.map(([path, digest]) => `${path}\0${digest}\0`).join(""),
  ));
}

assert.equal(manifest.selection, "explicit-only");
assert.deepEqual(manifest.methods, {
  "nlopt-nelder-mead": "NLOPT_LN_NELDERMEAD",
});
assert.equal(manifest.source.luksan_enabled, false);
verifyHash("source-lock.json", manifest.source.source_lock_sha256);
verifyHash("licenses/COPYING", manifest.source.license_sha256);
assert.equal(
  manifest.public_semantics_bundle.encoding,
  "sorted-repository-path-nul-sha256-nul/v1",
);
assert.equal(
  reviewedBundleHash(manifest.reviewed_sagejs_files),
  manifest.public_semantics_bundle.sha256,
  "the public NLopt semantic/loader/test source bundle changed",
);
assert.equal(
  manifest.qualification.public_semantics_bundle_sha256,
  manifest.public_semantics_bundle.sha256,
  "qualification metadata is not bound to the reviewed public semantic bundle",
);
assert.equal(
  manifest.qualification.status,
  "qualified",
  "the narrowed NLopt artifact is pending source-current qualification",
);
const qualification = json("release/qualification-v1.json");
verifyHash(
  "release/qualification-v1.json",
  manifest.qualification.summary_sha256,
);
assert.equal(
  qualification.public_semantics_bundle_sha256,
  manifest.public_semantics_bundle.sha256,
  "qualification summary is not bound to the reviewed public semantic bundle",
);
verifyHash(
  "bench/numerical-p3-nlopt/corpus.json",
  manifest.qualification.corpus_sha256,
  repositoryRoot,
);

const receiptPaths = {
  "linux-x64": "bench/numerical-p3-nlopt/portable-receipts/linux-x64.json",
  "linux-arm64": "bench/numerical-p3-nlopt/portable-receipts/linux-arm64.json",
  "macos-arm64": "bench/numerical-p3-nlopt/portable-receipts/macos-arm64.json",
  "windows-x64": "bench/numerical-p3-nlopt/portable-receipts/windows-x64.json",
};
for (const [platform, path] of Object.entries(receiptPaths)) {
  verifyHash(
    path,
    manifest.qualification.portable_receipts_sha256[platform],
    repositoryRoot,
  );
  const receipt = JSON.parse(readFileSync(resolve(repositoryRoot, path)));
  assert.equal(receipt.artifact_sha256, manifest.artifact.sha256);
  assert.equal(
    receipt.public_semantics_bundle_sha256,
    manifest.public_semantics_bundle.sha256,
  );
  assert.equal(receipt.lifecycle_after.liveAllocations, 0);
  assert.equal(receipt.lifecycle_after.liveBytes, 0);
}

assert.equal(report.source.revision, manifest.source.revision);
assert.equal(report.source.archive_sha256, manifest.source.archive_sha256);
assert.equal(report.source.license_sha256, manifest.source.license_sha256);
assert.equal(
  report.source_closure.sha256,
  manifest.source.source_closure_sha256,
);
assert.deepEqual(
  report.source_closure.compiled_sources,
  manifest.source.compiled_sources,
);
assert.equal(report.toolchain.identity, manifest.toolchain.identity);
assert.equal(report.toolchain.target, manifest.toolchain.target);
assert.equal(
  report.toolchain.floating_point_contract,
  manifest.toolchain.floating_point_contract,
);
assert.deepEqual(report.artifact.imports, manifest.artifact.imports);
for (const field of [
  "sha256",
  "bytes",
  "gzip_bytes",
  "brotli_bytes",
  "initial_memory_bytes",
  "maximum_memory_bytes",
]) {
  assert.equal(report.artifact[field], manifest.artifact[field], field);
}
const artifact = bytes("build/nlopt-methods.wasm");
assert.equal(artifact.length, manifest.artifact.bytes);
assert.equal(sha256(artifact), manifest.artifact.sha256);
assert.deepEqual(
  WebAssembly.Module.imports(new WebAssembly.Module(artifact)),
  manifest.artifact.imports,
);

process.stdout.write(`${JSON.stringify({
  schema: "sagejs.numerical-nlopt-release-verification/v1",
  source_revision: manifest.source.revision,
  source_closure_sha256: manifest.source.source_closure_sha256,
  artifact_sha256: manifest.artifact.sha256,
  public_semantics_bundle_sha256: manifest.public_semantics_bundle.sha256,
  qualification_sha256: manifest.qualification.summary_sha256,
  methods: Object.keys(manifest.methods),
  selection: manifest.selection,
  portable_receipts: Object.keys(receiptPaths),
}, null, 2)}\n`);
