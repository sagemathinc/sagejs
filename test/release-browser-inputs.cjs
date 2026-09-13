// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), test = require("node:test");
const { authenticateBrowserInputs, distribution } = require("../scripts/release/browser-inputs.cjs");
const { createBrowserInputs, budget } = require("./helpers/release-browser-inputs.cjs");
const candidate = "a".repeat(40);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "sagejs-browser-inputs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, ...createBrowserInputs(root, candidate) };
}
test("selected browser bytes match numerical qualification and the authenticated canonical reports without recompression", (t) => {
  const f = fixture(t), zlib = require("node:zlib");
  t.mock.method(zlib, "gzipSync", () => { throw Error("unexpected recompression"); });
  t.mock.method(zlib, "brotliCompressSync", () => { throw Error("unexpected recompression"); });
  const result = authenticateBrowserInputs(f.root, candidate, f.gate);
  assert.equal(result.directory, distribution);
  assert.equal(result.contentSha256, f.gate.artifact_coherence.browser_distribution_content_sha256);
  assert.deepEqual(result.totals, f.report.totals);
});
test("wrong source, different numerical distribution and changed comparison reports fail closed", (t) => {
  const f = fixture(t);
  assert.throws(() => authenticateBrowserInputs(f.root, "b".repeat(40), f.gate), /selected source/);
  const other = structuredClone(f.gate); other.artifact_coherence.browser_distribution_content_sha256 = "0".repeat(64);
  assert.throws(() => authenticateBrowserInputs(f.root, candidate, other), /numerically qualified/);
  for (const name of ["reproducible-linux-arm64.json", "reproducible-darwin-arm64.json"]) {
    const filename = path.join(f.root, "build/release-publication/browser-reproducible", name);
    const before = fs.readFileSync(filename);
    fs.writeFileSync(filename, JSON.stringify({ ...f.report, source_revision: "other" }));
    assert.throws(() => authenticateBrowserInputs(f.root, candidate, f.gate), /reports disagree/);
    fs.writeFileSync(filename, before);
  }
});
test("candidate total and eager budgets are still enforced against the bound measurements", (t) => {
  const f = fixture(t), filename = path.join(f.root, "bench/browser-wasm-budget.json");
  for (const changed of [
    { ...budget, artifact_baseline: { totals: { gzip_bytes: 1, brotli_bytes: 1 } } },
    { ...budget, artifact_topology_limits: { "eager-core": { gzip_bytes: 1, brotli_bytes: 1 } } },
  ]) {
    fs.writeFileSync(filename, JSON.stringify(changed));
    assert.throws(() => authenticateBrowserInputs(f.root, candidate, f.gate), /violates candidate budget/);
  }
});
test("changed assets and unreported distribution extras cannot be accepted", (t) => {
  const f = fixture(t), filename = path.join(f.root, distribution, "kernel.mjs");
  const before = fs.readFileSync(filename);
  fs.appendFileSync(filename, "// changed");
  assert.throws(() => authenticateBrowserInputs(f.root, candidate, f.gate), /digest/);
  fs.writeFileSync(filename, before);
  fs.writeFileSync(path.join(f.root, distribution, "extra.js"), "not qualified");
  assert.throws(() => authenticateBrowserInputs(f.root, candidate, f.gate), /numerically qualified/);
});
