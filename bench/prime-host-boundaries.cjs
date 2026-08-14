#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const environment = {
  ...process.env,
  SAGEJS_RUN_FIXED_HOST_MICROBENCHMARKS: "1",
};

const commands = [
  [process.execPath, ["test/dense-prime-host-boundary.cjs"]],
  [process.execPath, ["--test", "test/prime-matrix-serialization.cjs"]],
];

console.log(
  `prime host-boundary fixed microbenchmarks: ${process.platform}-${process.arch}`,
);
for (const [command, arguments_] of commands) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    env: environment,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
