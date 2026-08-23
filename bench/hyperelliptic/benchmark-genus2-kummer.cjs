#!/usr/bin/env node

"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..", "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kummer_native.py",
);
const program = join(__dirname, "benchmark-genus2-kummer.py");
const temporary = mkdtempSync(join(tmpdir(), "sagejs-g2-kummer-bench-"));

function run(args, options = {}) {
  const result = spawnSync(process.execPath, [sagejs, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout;
}

try {
  const cache = join(temporary, "cache");
  run(["native", "compile", source, "--cache-root", cache]);
  process.stdout.write(
    run(["--python", program], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
