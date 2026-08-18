#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const temporary = mkdtempSync(join(tmpdir(), "sagejs-round2-native-state-"));

function compile(name, defines = []) {
  const executable = join(temporary, name);
  const libraries = ["flint", "openblas", "mpc", "mpfr", "gmp"].map(
    (library) => join(prefix, "lib", `lib${library}.a`),
  );
  const result = spawnSync(process.env.CC || "cc", [
    "-std=c11",
    "-O3",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...defines.map((define) => `-D${define}`),
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    join(root, "bench", "number-field-order-resource-witness.c"),
    ...libraries,
    "-lm",
    "-lpthread",
    "-o",
    executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return executable;
}

function run(executable, args, timeout = 120_000) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    timeout,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

try {
  const optimized = compile("optimized");
  const exact = compile("exact", [
    "SAGEJS_NF_ORDER_FORCE_EXACT_MULTIPLIER=1",
    "SAGEJS_NF_ORDER_FORCE_EXACT_CHANGE_BASIS=1",
  ]);
  const vector010Profile = JSON.parse(run(optimized, ["--profile", "7", "7"]));
  const vector429Profile = JSON.parse(run(optimized, ["--profile", "6", "1"]));
  const vector010Payload = run(optimized, ["--payload", "7"]);
  const vector010ExactPayload = run(exact, ["--payload", "7"]);
  assert.equal(vector010Payload, vector010ExactPayload);
  const randomized = run(optimized, ["--randomized", "23063", "32"]);
  const randomizedExact = run(exact, ["--randomized", "23063", "32"]);
  assert.equal(randomized, randomizedExact);
  const vector429Hash = hash(run(optimized, ["--payload", "6"]));
  assert.equal(
    vector429Hash,
    "b28344d042188afbe0098851928665faaae0268ad8b5cf0e03d790468cb6a644",
  );
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.number-fields/round2-native-state-benchmark/v1",
    source: {
      commit: process.env.SAGEJS_BENCH_COMMIT || null,
    },
    environment: {
      platform: `${process.platform}-${process.arch}`,
      compiler: process.env.CC || "cc",
      flintPrefix: prefix,
    },
    policy: {
      vector010Rounds: 7,
      vector429Rounds: 1,
      pariVector010ReferenceUs: 37000,
      exactness: "byte-identical forced exact vector010, frozen forced-exact vector429 SHA-256, and 32 deterministic randomized differentials",
    },
    vector010: {
      profile: vector010Profile,
      payloadSha256: hash(vector010Payload),
      forcedExactPayloadSha256: hash(vector010ExactPayload),
      ratioToPari: vector010Profile.stageMeanUs.round2 / 37000,
    },
    vector429: {
      profile: vector429Profile,
      payloadSha256: vector429Hash,
    },
    randomized: {
      seed: 23063,
      count: 32,
      payloadSha256: hash(randomized),
      forcedExactPayloadSha256: hash(randomizedExact),
    },
  }, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
