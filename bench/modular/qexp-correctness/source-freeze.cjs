#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const MANIFEST_PATH = path.join(__dirname, "source-freeze.json");

const FILES = [
  "architecture/package-graph.json",
  "bench/modular/qexp-correctness/README.md",
  "bench/modular/qexp-correctness/magma-oracle.m",
  "bench/modular/qexp-correctness/pari-oracle.py",
  "bench/modular/qexp-correctness/pinned-corpus.json",
  "bench/modular/qexp-correctness/run-oracles.cjs",
  "bench/modular/qexp-correctness/sage-oracle.py",
  "bench/modular/qexp-correctness/sagejs-corpus.cjs",
  "bench/modular/qexp-correctness/source-freeze.cjs",
  "docs/index.md",
  "docs/classical-modular-form-elements.md",
  "docs/gamma1-modular-forms.md",
  "docs/modular-form-q-expansions.md",
  "docs/modular-forms-tour.md",
  "src/baselib/modular.py",
  "src/lib/sagejs/modular_forms/__init__.py",
  "src/lib/sagejs/modular_forms/character_hecke.py",
  "src/lib/sagejs/modular_forms/eta_products.py",
  "src/lib/sagejs/modular_forms/gamma1.py",
  "src/lib/sagejs/modular_forms/half_integral.py",
  "src/lib/sagejs/modular_forms/newforms.py",
  "src/lib/sagejs/modular_forms/object_layer.py",
  "src/lib/sagejs/modular_forms/qexp.py",
  "src/lib/sagejs/modular_forms/qexp_algebra.py",
  "test/classical-modular-form-elements.cjs",
  "test/classical-eisenstein-portable.cjs",
  "test/eta-products.cjs",
  "test/formula-hecke.cjs",
  "test/gamma1-modular-forms.cjs",
  "test/half-integral-modular-forms.cjs",
  "test/modular-qexp-source-freeze.cjs",
  "test/modular.cjs",
  "test/portable-character-hecke.cjs",
  "test/qexp-algebra.cjs",
  "test/qexp-p0-correctness.cjs",
  "test/serialization.cjs",
  "tools/serialization-codecs/modular-forms.ts",
];

const REQUIRED_CHECKS = [
  "Routine gate (Linux x64)",
  "Platform smoke (linux-arm64)",
  "Platform smoke (macos-arm64)",
  "Platform smoke (windows-x64)",
  "Sage.js WebAssembly routine parity / chromium-parity",
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function entries() {
  return FILES.map((relativePath) => ({
    path: relativePath,
    sha256: sha256(fs.readFileSync(path.join(ROOT, relativePath))),
  }));
}

function bundleSha256(files) {
  return sha256(
    files.map((item) => `${item.path}\0${item.sha256}\n`).join(""),
  );
}

function writeSourceFreeze() {
  const files = entries();
  const manifest = {
    schema: "sagejs.modular-qexp-source-freeze.v1",
    scope:
      "Exact integral- and half-integral-weight q-expansions, certified formulas, eta products, old/new and eigenpacket reconstruction, certified formula Hecke action, and the parented Gamma0/Gamma1 modular-form object layer over QQ",
    required_checks: REQUIRED_CHECKS,
    files,
    bundle_sha256: bundleSha256(files),
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function verifySourceFreeze() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert.equal(manifest.schema, "sagejs.modular-qexp-source-freeze.v1");
  assert.deepEqual(manifest.required_checks, REQUIRED_CHECKS);
  assert.deepEqual(
    manifest.files.map((item) => item.path),
    FILES,
  );
  const actual = entries();
  assert.deepEqual(manifest.files, actual);
  assert.equal(manifest.bundle_sha256, bundleSha256(actual));
  return manifest;
}

if (require.main === module) {
  const manifest = process.argv.includes("--write")
    ? writeSourceFreeze()
    : verifySourceFreeze();
  process.stdout.write(
    `${JSON.stringify({
      schema: manifest.schema,
      files: manifest.files.length,
      bundle_sha256: manifest.bundle_sha256,
      status: "pass",
    })}\n`,
  );
}

module.exports = {
  FILES,
  MANIFEST_PATH,
  REQUIRED_CHECKS,
  verifySourceFreeze,
  writeSourceFreeze,
};
