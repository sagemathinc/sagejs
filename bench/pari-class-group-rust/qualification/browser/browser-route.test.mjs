import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { qualificationEmptyEnvironmentImports } from "./browser-loader.mjs";

import {
  collectReceipt,
  parseArguments,
  repositoryRoot,
  validateReceipt,
  validateVector,
} from "./run-browser.mjs";

const receiptSchema = JSON.parse(fs.readFileSync(
  path.join(
    repositoryRoot,
    "bench/pari-class-group-rust/qualification/browser/receipt.schema.json",
  ),
  "utf8",
));
const schemaValidator = new Ajv2020({ strict: true, validateFormats: false })
  .compile(receiptSchema);

test("the checked-in nontrivial class-group vector has the frozen contract", () => {
  const vector = validateVector(JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, "bench/pari-class-group-rust/qualification/browser/class-number-6.vector.json"),
    "utf8",
  )));
  assert.deepEqual(vector.request.polynomial, ["-34", "-30", "-8", "1"]);
  assert.equal(vector.expected.classNumber, "6");
  assert.deepEqual(vector.expected.invariantFactors, ["6"]);
});

test("the runner rejects ambiguous or incomplete CLI input", () => {
  assert.throws(() => parseArguments([]));
  assert.throws(() => parseArguments([
    "--engines", "chromium", "--artifact", "x", "--vector", "y",
  ]));
  assert.throws(() => parseArguments([
    "--engines", "unknown", "--artifact", "x", "--vector", "y", "--output", "z",
  ]));
});

test("the qualification-only Rust environment shim is empty and bounds checked", () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const imports = qualificationEmptyEnvironmentImports([
    { module: "wasi_snapshot_preview1", name: "environ_get" },
    { module: "wasi_snapshot_preview1", name: "environ_sizes_get" },
  ], () => memory);
  const view = new DataView(memory.buffer);
  view.setUint32(16, 123, true);
  view.setUint32(24, 456, true);
  assert.equal(imports.environ_get(), 0);
  assert.equal(imports.environ_sizes_get(16, 24), 0);
  assert.equal(view.getUint32(16, true), 0);
  assert.equal(view.getUint32(24, true), 0);
  assert.equal(imports.environ_sizes_get(memory.buffer.byteLength - 2, 24), 21);
  assert.deepEqual(
    qualificationEmptyEnvironmentImports([], () => memory),
    {},
  );
});

test("a missing candidate fails closed and records why without launching a browser", async () => {
  const absent = path.relative(
    repositoryRoot,
    path.join(os.tmpdir(), `sagejs-definitely-missing-${process.pid}.wasm`),
  );
  // Use a repository-local missing path because the hardened server only serves
  // repository content.
  const repositoryAbsent = `bench/pari-class-group-rust/qualification/browser/${path.basename(absent)}`;
  const receipt = await collectReceipt({
    "--artifact": repositoryAbsent,
    "--vector": "bench/pari-class-group-rust/qualification/browser/class-number-6.vector.json",
    engines: ["chromium", "firefox", "webkit"],
  });
  validateReceipt(receipt);
  assert.equal(schemaValidator(receipt), true, JSON.stringify(schemaValidator.errors));
  assert.equal(receipt.status, "fail");
  assert.equal(receipt.artifact.sha256, null);
  assert.deepEqual(receipt.engines, []);
  assert.match(receipt.failures[0].message, /candidate artifact is missing/);
});

test("a passing receipt must prove every requested actual route", () => {
  const base = {
    schema: "sagejs.rust-class-group-browser-route/v1",
    status: "pass",
    artifact: { sha256: "a".repeat(64) },
    vector: { sha256: "b".repeat(64) },
    requested_engines: ["chromium"],
    engines: [{
      engine: "chromium",
      status: "pass",
      route: "rust-class-group-wasm-artifact",
      artifact_request_count: 1,
      cross_origin_isolated: false,
      shared_array_buffer: false,
    }],
    failures: [],
  };
  assert.equal(validateReceipt(base), base);
  assert.throws(() => validateReceipt({
    ...base,
    engines: [{ ...base.engines[0], artifact_request_count: 0 }],
  }));
  assert.throws(() => validateReceipt({
    ...base,
    engines: [{ ...base.engines[0], route: "javascript-fallback" }],
  }));
  assert.throws(() => validateReceipt({
    ...base,
    engines: [{ ...base.engines[0], cross_origin_isolated: true }],
  }));
});
