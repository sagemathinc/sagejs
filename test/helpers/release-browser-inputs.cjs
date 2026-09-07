"use strict";

// Tiny artifact/receipt fixtures, never source-current mathematical evidence.
const fs = require("node:fs"), path = require("node:path");
const { canonicalJson, contentDigestPath, sha256 } = require("../../scripts/numerical-computing/common.cjs");
const { inspectProductionArtifact } = require("../../packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs");
const { distribution } = require("../../scripts/release/browser-inputs.cjs");
const budget = { schema: "sagejs.browser-wasm-budget/v1", thresholds: { compressed_growth_fraction: 0 },
  artifact_baseline: { totals: { gzip_bytes: 100000, brotli_bytes: 100000 } } };

function createBrowserInputs(root, candidate) {
  const bytes = Buffer.from("export const answer = 42;\n");
  const assets = [{ path: "kernel.mjs", servePath: "kernel.mjs", bytes: bytes.length, sha256: sha256(bytes) }];
  const group = { id: "eager-core", kind: "eager", dependencies: [], dependencyClosure: [], assets,
    maximumCompressedDelta: { gzipBytes: 10000, brotliBytes: 10000 } };
  group.identity = `sha256:${sha256(canonicalJson(group))}`;
  const topology = { schema: "sagejs.wasm-artifact-topology/v1", groups: [group] };
  topology.identity = `sha256:${sha256(canonicalJson(topology))}`;
  const manifest = { schema: "sagejs.wasm-production-artifact/v1", layout: { modules: [] }, assets, topology };
  manifest.identity = `sha256:${sha256(canonicalJson(manifest))}`;
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const files = new Map([
    ["kernel.mjs", bytes], ["production-manifest.json", manifestBytes],
    ["build-receipt.json", Buffer.from(JSON.stringify({ schema: "sagejs.wasm-build-receipt/v1",
      source_revision: candidate, artifact: manifest, productionManifestSha256: sha256(manifestBytes) }))],
  ]);
  const dist = path.join(root, distribution);
  fs.mkdirSync(dist, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(dist, name), content);
  const report = inspectProductionArtifact(dist), reportBytes = Buffer.from(JSON.stringify(report));
  const clean = new Map([...files].map(([name, value]) => [`packages/flint-wasm/dist/${name}`, value]));
  clean.set("build/wasm-artifact-a.json", reportBytes);
  const reproduced = new Map(["reproducible-artifact.json", "reproducible-linux-arm64.json", "reproducible-darwin-arm64.json"].map((name) => [name, reportBytes]));
  for (const [prefix, entries] of [["browser-clean", clean], ["browser-reproducible", reproduced]]) {
    for (const [name, content] of entries) {
      const filename = path.join(root, "build/release-publication", prefix, name);
      fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, content);
    }
  }
  fs.mkdirSync(path.join(root, "bench"), { recursive: true });
  fs.writeFileSync(path.join(root, "bench/browser-wasm-budget.json"), JSON.stringify(budget));
  return { files, clean, reproduced, report, gate: { artifact_coherence: {
    browser_distribution_content_sha256: contentDigestPath(root, distribution) } } };
}
module.exports = { createBrowserInputs, budget };
