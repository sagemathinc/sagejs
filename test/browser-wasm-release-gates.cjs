"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  compareArtifacts,
  enforceBudget,
  inspectProductionArtifact,
  sha256,
} = require("../packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs");
const {
  parseHeadersFile,
  validateHeadersRules,
} = require("../packages/flint-wasm/scripts/browser-wasm-deployment.cjs");

function fixtureDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-wasm-release-"));
  const wasm = Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    5, 4, 1, 1, 1, 2,
  ]);
  const javascript = Buffer.from("export const answer = 42;\n");
  fs.writeFileSync(path.join(directory, "kernel.wasm"), wasm);
  fs.writeFileSync(path.join(directory, "kernel.mjs"), javascript);
  const assets = [
    { path: "kernel.mjs", servePath: "kernel.mjs", bytes: javascript.length, sha256: sha256(javascript) },
    { path: "kernel.wasm", servePath: "kernel.wasm", bytes: wasm.length, sha256: sha256(wasm) },
  ];
  fs.writeFileSync(path.join(directory, "production-manifest.json"), JSON.stringify({
    schema: "sagejs.wasm-production-artifact/v1",
    identity: `sha256:${"0".repeat(64)}`,
    assets,
    layout: {
      modules: [{
        artifact: "kernel.wasm",
        memory: { pageBytes: 65536, initialPages: 1, maximumPages: 2 },
      }],
    },
  }));
  fs.writeFileSync(path.join(directory, "build-receipt.json"), JSON.stringify({
    schema: "sagejs.wasm-build-receipt/v1",
    source_revision: "fixture",
    artifact: { identity: "fixture" },
  }));
  return directory;
}

test("release artifact receipts validate hashes, Wasm magic, compression, and reproducibility", () => {
  const left = fixtureDirectory();
  const right = fixtureDirectory();
  try {
    const report = inspectProductionArtifact(left);
    assert.equal(report.files.length, 2);
    assert.equal(report.source_revision, "fixture");
    assert.deepEqual(compareArtifacts(report, inspectProductionArtifact(right)), []);
    fs.appendFileSync(path.join(right, "kernel.mjs"), "// drift\n");
    assert.throws(() => inspectProductionArtifact(right), /digest/);
  } finally {
    fs.rmSync(left, { recursive: true });
    fs.rmSync(right, { recursive: true });
  }
});

test("grammar modules inherit the authenticated bounded Tree-sitter memory", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-wasm-imported-memory-"));
  const provider = Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    2, 16, 1, 3, 101, 110, 118, 6, 109, 101, 109, 111, 114, 121, 2, 1, 2, 8,
  ]);
  const grammar = Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    2, 15, 1, 3, 101, 110, 118, 6, 109, 101, 109, 111, 114, 121, 2, 0, 1,
  ]);
  try {
    fs.writeFileSync(path.join(directory, "runtime.wasm"), provider);
    fs.writeFileSync(path.join(directory, "grammar.wasm"), grammar);
    const assets = [
      { path: "grammar.wasm", servePath: "grammar.wasm", bytes: grammar.length, sha256: sha256(grammar) },
      { path: "runtime.wasm", servePath: "runtime.wasm", bytes: provider.length, sha256: sha256(provider) },
    ];
    fs.writeFileSync(path.join(directory, "production-manifest.json"), JSON.stringify({
      schema: "sagejs.wasm-production-artifact/v1",
      identity: `sha256:${"1".repeat(64)}`,
      assets,
      layout: {
        modules: [],
        importedMemoryDomains: [{
          id: "tree-sitter",
          provider: "runtime.wasm",
          consumers: ["grammar.wasm"],
          memory: { pageBytes: 65536, initialPages: 2, maximumPages: 8 },
        }],
      },
    }));
    fs.writeFileSync(path.join(directory, "build-receipt.json"), JSON.stringify({
      schema: "sagejs.wasm-build-receipt/v1",
      source_revision: "fixture",
      artifact: { identity: "fixture" },
    }));
    assert.equal(inspectProductionArtifact(directory).files.length, 2);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test("relative payload gates reject unexplained compressed growth", () => {
  const report = { totals: { gzip_bytes: 106, brotli_bytes: 100 } };
  const baseline = {
    schema: "sagejs.browser-wasm-budget/v1",
    thresholds: { compressed_growth_fraction: 0.05 },
    artifact_baseline: { totals: { gzip_bytes: 100, brotli_bytes: 100 } },
  };
  assert.deepEqual(enforceBudget(report, baseline), ["gzip_bytes 106 exceeds 105"]);
  assert.deepEqual(enforceBudget({ totals: { gzip_bytes: 105, brotli_bytes: 104 } }, baseline), []);
  assert.deepEqual(
    enforceBudget(report, { ...baseline, artifact_baseline: null }, { requireBaseline: true }),
    ["reviewed artifact_baseline is absent"],
  );
});

test("Cloudflare-compatible header policy is parsed and security checked", () => {
  const rules = parseHeadersFile(`/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'
`);
  assert.deepEqual(validateHeadersRules(rules), []);
  rules[0].headers.delete("cross-origin-opener-policy");
  assert.match(validateHeadersRules(rules).join("\n"), /cross-origin-opener-policy/);
});
