#!/usr/bin/env node

"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const {
  foreignCompilationInputs,
} = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(root, "bench", "native-ffi-flint.py");

async function measure(cacheRoot) {
  const { readFileSync } = require("node:fs");
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath, {
    functions: ["flint_word_is_prime"],
  });
  const start = performance.now();
  const inputs = foreignCompilationInputs(ir, { cacheRoot });
  return {
    milliseconds: performance.now() - start,
    fingerprint: inputs[0].fingerprint,
    headers: inputs[0].headers.length,
    libraries: inputs[0].libraries.length,
  };
}

async function main() {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-foreign-input-bench-"));
  try {
    const cold = await measure(cacheRoot);
    const sameProcess = await measure(cacheRoot);
    const childProgram = `
const benchmark = require(${JSON.stringify(__filename)});
benchmark.measure(${JSON.stringify(cacheRoot)}).then((result) => {
  process.stdout.write(JSON.stringify(result));
}).catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;
    const child = spawnSync(process.execPath, ["-e", childProgram], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    if (child.status !== 0) {
      throw new Error(child.stderr || `child exited ${child.status}`);
    }
    const newProcess = JSON.parse(child.stdout);
    if (cold.fingerprint !== sameProcess.fingerprint ||
        cold.fingerprint !== newProcess.fingerprint) {
      throw new Error("foreign input fingerprints were not deterministic");
    }
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.native-foreign-input-benchmark/v1",
      coldMilliseconds: Number(cold.milliseconds.toFixed(3)),
      sameProcessMilliseconds: Number(sameProcess.milliseconds.toFixed(3)),
      newProcessPersistentMilliseconds: Number(
        newProcess.milliseconds.toFixed(3),
      ),
      headers: cold.headers,
      linkedArchives: cold.libraries,
      fingerprint: cold.fingerprint,
    }, null, 2)}\n`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
}

module.exports = { measure };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
