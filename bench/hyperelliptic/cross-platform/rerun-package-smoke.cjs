#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

function options(argv) {
  const answer = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") answer.input = resolve(argv[++index]);
    else if (argument === "--output") answer.output = resolve(argv[++index]);
    else if (argument === "--expected-commit") {
      answer.expectedCommit = argv[++index];
    } else if (argument === "--test-patch-commit") {
      answer.testPatchCommit = argv[++index];
    } else throw new Error(`unknown argument ${argument}`);
  }
  for (const name of ["input", "output", "expectedCommit", "testPatchCommit"]) {
    if (!answer[name]) throw new Error(`--${name} is required`);
  }
  return answer;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function command(name, args, { cwd, timeout = 300_000 } = {}) {
  const started = performance.now();
  const result = spawnSync(name, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  return {
    command: [name, ...args],
    elapsed_ms: performance.now() - started,
    exit_code: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null,
  };
}

function required(name, args, options) {
  const result = command(name, args, options);
  assert.equal(
    result.exit_code,
    0,
    `${result.command.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

const config = options(process.argv.slice(2));
const receipt = JSON.parse(readFileSync(config.input, "utf8"));
assert.equal(
  receipt.schema,
  "sagejs.hyperelliptic-phase10-portable-extras.v1",
);
const root = resolve(process.env.SAGEJS_ROOT ?? receipt.repository.root ?? ".");
const commit = required("git", ["-C", root, "rev-parse", "HEAD"]);
assert.equal(commit, config.expectedCommit);
assert.equal(receipt.repository.commit, config.expectedCommit);
assert.equal(required("git", ["-C", root, "status", "--short"]), "");

const relativeTest =
  "packages/flint-wasm/test/hyperelliptic-production-kernels.test.mjs";
const frozenTest = readFileSync(join(root, relativeTest));
const patchedTest = required("git", [
  "-C",
  root,
  "show",
  `${config.testPatchCommit}:${relativeTest}`,
]);
const temporaryTest = join(
  root,
  dirname(relativeTest),
  `.phase10-package-smoke-${process.pid}.test.mjs`,
);
let result;
try {
  writeFileSync(temporaryTest, `${patchedTest}\n`);
  result = command(process.execPath, ["--test", temporaryTest], {
    cwd: root,
    timeout: 300_000,
  });
} finally {
  rmSync(temporaryTest, { force: true });
}
assert.equal(required("git", ["-C", root, "status", "--short"]), "");
assert.equal(
  result.exit_code,
  0,
  `patched package smoke failed\n${result.stdout}\n${result.stderr}`,
);

receipt.repository.package_smoke_overlay = {
  source_commit: config.expectedCommit,
  test_patch_commit: config.testPatchCommit,
  base_test_sha256: sha256(frozenTest),
  patched_test_sha256: sha256(`${patchedTest}\n`),
  updater_sha256: sha256(readFileSync(__filename)),
};
receipt.wasm.package_load_test = {
  status: "passed",
  exit_code: result.exit_code,
  signal: result.signal,
  error: result.error,
  elapsed_ms: result.elapsed_ms,
  stdout_sha256: sha256(result.stdout),
  stdout: result.stdout.trim(),
  stderr: result.stderr.trim(),
  test_patch_commit: config.testPatchCommit,
  test_source_sha256: sha256(`${patchedTest}\n`),
};
receipt.package_smoke_supplemented_at_utc = new Date().toISOString();
writeFileSync(config.output, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${config.output}\n`);
