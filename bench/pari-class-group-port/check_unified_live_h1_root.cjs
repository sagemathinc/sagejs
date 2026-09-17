#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "unified_live_h1_root.py");
const residentSourcePath = path.join(__dirname, "resident_generated_class_attempt.py");
const residentCheckerPath = path.join(__dirname, "check_resident_generated_class_attempt.cjs");
const bridgeCheckerPath = path.join(__dirname, "check_live_h1_owner_bridge.cjs");

function signature(source, entry) {
  const match = source.match(new RegExp(`def ${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${entry} signature`);
  return match[1].trim().split("\n")
    .map((line) => line.trim().replace(/,$/, "").split(": "));
}

function values(value) {
  return Array.isArray(value) ? value : value.toArray ? value.toArray() : Array.from(value);
}

async function main() {
  const fixturePaths = process.argv.slice(2, 5);
  assert.equal(fixturePaths.length, 3, "prepared, analytic and Kummer fixtures required");

  // Reuse the resident checker's audited sanitizer/allocation policy. The
  // resulting inputs file contains prepared inputs and fresh zeroed owners,
  // never a candidate or bridge answer consumed by the unified computation.
  const prepared = spawnSync(process.execPath, [residentCheckerPath, ...fixturePaths], {
    cwd: root,
    encoding: "utf8",
    timeout: 900000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(prepared.status, 0, prepared.stderr || String(prepared.error));
  const preparationReceipt = JSON.parse(prepared.stdout.trim().split("\n").at(-1));
  const sanitized = JSON.parse(fs.readFileSync(path.join(preparationReceipt.directory, "inputs.json"), "utf8"));

  const source = fs.readFileSync(sourcePath, "utf8");
  const rootNames = signature(source, "pari_unified_live_h1_root");
  const residentNames = signature(
    fs.readFileSync(residentSourcePath, "utf8"),
    "pari_resident_generated_class_attempt",
  );
  assert.equal(residentNames.length, 351);
  assert.equal(rootNames.length, 434);
  assert.deepEqual(rootNames.slice(0, 351), residentNames);

  const bridgeChecker = fs.readFileSync(bridgeCheckerPath, "utf8");
  const sizesLiteral = bridgeChecker.match(/const sizes = (\{[\s\S]*?\n\});/);
  assert(sizesLiteral, "missing bridge workspace size contract");
  const bridgeSizes = vm.runInNewContext(`(${sizesLiteral[1]})`, Object.create(null));
  const candidate = sanitized.input;
  const input = {};
  for (const [name, kind] of rootNames) {
    if (Object.hasOwn(candidate, name)) {
      input[name] = structuredClone(candidate[name]);
    } else {
      const size = name === "bridge_prep_state" ? 8
        : name === "unified_state" ? 12 : bridgeSizes[name];
      assert(Number.isInteger(size), `missing workspace size for ${name}`);
      input[name] = Array(size).fill(kind === "Float64Buffer" ? 0 : 0n);
    }
    if (Array.isArray(input[name])) {
      input[name] = kind === "Float64Buffer"
        ? input[name].map(Number)
        : input[name].map(BigInt);
    } else if (kind === "float") {
      input[name] = Number(input[name]);
    } else if (kind === "bool") {
      input[name] = Boolean(input[name]);
    } else {
      input[name] = BigInt(input[name]);
    }
  }

  const built = await compileKernel({ sourcePath });
  const fn = require(built.modulePath).pari_unified_live_h1_root;
  assert(fn.nativeAvailable);
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.match(core, /pari_resident_generated_class_attempt/);
  assert.match(core, /pari_live_h1_owner_bridge/);
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);

  const invoke = () => fn.gmp(...rootNames.map(([name]) => input[name]));
  assert.equal(invoke(), 0n);
  assert.deepEqual(values(input.unified_state).map(BigInt), [
    0n, 0n, 0n, 1n, 0n, 7n, 73n, 8n, 48n, 48n, 2n, 7n,
  ]);
  assert.deepEqual(values(input.attempt_state).map(BigInt), [4n, 0n, 0n, 1n]);
  assert.equal(BigInt(values(input.class_number)[0]), 1n);
  assert.deepEqual(values(input.bridge_prep_state).map(BigInt), values(input.prep_state).map(BigInt));
  assert.deepEqual(values(input.bridge_state).map(BigInt), [
    0n, 0n, 0n, 0n, 0n, 7n, 1n, 0n, 73n, 8n, 48n, 48n, 2n, 7n, 7n, 0n,
  ]);
  assert.deepEqual(values(input.getfu_factor).map(BigInt), [1n, 0n, 0n, 1n]);
  assert.deepEqual(values(input.compact_provenance).map(BigInt), [
    0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 0n, 0n, 1n, -1n,
  ]);
  const snapshot = JSON.stringify({
    unified: values(input.unified_state).map(String),
    bridge: values(input.bridge_state).map(String),
    provenance: values(input.compact_provenance).map(String),
  });
  assert.equal(invoke(), 0n, "terminal replay did not return success");
  assert.equal(JSON.stringify({
    unified: values(input.unified_state).map(String),
    bridge: values(input.bridge_state).map(String),
    provenance: values(input.compact_provenance).map(String),
  }), snapshot, "terminal replay mutated published owners");

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/unified-live-h1-root-v1",
    field: "x^3-20018*x+20034",
    publicParameters: rootNames.length,
    residentParameters: residentNames.length,
    nativeCalls: 1,
    candidateStatus: "0",
    bridgeStatus: "0",
    classNumber: "1",
    publication: "exact-h1-prefix-only",
    publicComplete: false,
    representationAdapter: "prep_state IntegerBuffer to eight-word Int64Buffer",
    fixtureInputsInsideComputation: [],
    pariCallsInsideComputation: [],
    cacheKey: built.cacheKey,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
