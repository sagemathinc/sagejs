#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");
const benchmarkFlag = "SAGEJS_RUN_FIXED_HOST_MICROBENCHMARKS";

function environmentWithoutBenchmarkFlag(overrides = {}) {
  const environment = { ...process.env, ...overrides };
  delete environment[benchmarkFlag];
  // A nested `node --test` invocation is a new harness, not a child test of
  // this file. Node otherwise treats it as recursive and silently skips it.
  delete environment.NODE_TEST_CONTEXT;
  return environment;
}

test("dense-prime correctness cannot be hidden by the benchmark gate", () => {
  const result = spawnSync(
    process.execPath,
    ["test/dense-prime-host-boundary.cjs"],
    {
      cwd: root,
      encoding: "utf8",
      env: environmentWithoutBenchmarkFlag({ SAGEJS_NATIVE_DISABLE: "1" }),
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  assert.notEqual(
    result.status,
    0,
    "disabling the native compiler must fail the unconditional compiled-path oracle",
  );
  assert.match(output, /flint_word_prime_matrix_pivots.*nativeAvailable/s);
});

test("serialization correctness runs while its fixed-host timing is skipped", () => {
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", "test/prime-matrix-serialization.cjs"],
    {
      cwd: root,
      encoding: "utf8",
      env: environmentWithoutBenchmarkFlag(),
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  assert.equal(result.status, 0, output);
  assert.match(
    output,
    /ok \d+ - dense prime SagePack bytes are canonical, safe, and independently owned(?:\r?\n|$)/,
  );
  assert.match(
    output,
    /ok \d+ - dense prime SagePack warm paths retain bulk performance # SKIP run node bench\/prime-host-boundaries\.cjs for fixed-host microbenchmarks/,
  );
});
