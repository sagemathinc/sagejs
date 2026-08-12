#!/usr/bin/env node
"use strict";

const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = String.raw`
import time

for base in [ZZ, QQ, GF(2), GF(97)]:
    value = matrix(base, 1000, 1000, range(1000000))
    value.swap_rows(0, 999)
    value.swap_rows(0, 999)
    value.swap_columns(0, 999)
    value.swap_columns(0, 999)
    started = time.perf_counter()
    for index in range(100):
        value.swap_rows(index, 999 - index)
    row_ms = 1000 * (time.perf_counter() - started)
    started = time.perf_counter()
    for index in range(100):
        value.swap_columns(index, 999 - index)
    column_ms = 1000 * (time.perf_counter() - started)
    print(base, row_ms, column_ms)
`;

const started = performance.now();
const result = spawnSync(process.execPath, [resolve(root, "bin/sagejs")], {
  cwd: root,
  input: source,
  encoding: "utf8",
  env: { ...process.env, SAGEJS_FORBID_MATRIX_NAPI: "1" },
  maxBuffer: 16 * 1024 * 1024,
});
if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
process.stdout.write(result.stdout);
console.log(`process wall: ${(performance.now() - started).toFixed(2)} ms`);
