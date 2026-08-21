"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "..", "..");
const prefix = path.resolve(
  process.env.SAGEJS_FLINT_PREFIX ??
    path.join(repositoryRoot, "packages", "flint", ".native", "prefix"),
);

if (process.platform === "win32") {
  console.log("analytic packed-core C test uses the ordinary Windows addon fallback");
  process.exit(0);
}
if (!fs.existsSync(path.join(prefix, "include", "flint", "acb.h"))) {
  throw new Error(
    `FLINT prefix unavailable at ${prefix}; build packages/flint or set SAGEJS_FLINT_PREFIX`,
  );
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-analytic-core-"));
const executable = path.join(temporary, "analytic-core-test");
try {
  const compiler = process.env.CC || "cc";
  const result = spawnSync(compiler, [
    "-std=c11",
    "-D_GNU_SOURCE",
    "-Wall",
    "-Wextra",
    "-Werror",
    `-I${path.join(repositoryRoot, "packages", "flint", "src")}`,
    `-I${path.join(prefix, "include")}`,
    path.join(repositoryRoot, "packages", "flint", "src", "analytic_batch_core.c"),
    path.join(packageRoot, "src", "analytic.c"),
    path.join(packageRoot, "test", "analytic-core-native.c"),
    `-L${path.join(prefix, "lib")}`,
    `-Wl,-rpath,${path.join(prefix, "lib")}`,
    "-lflint",
    "-lmpfr",
    "-lgmp",
    "-lopenblas",
    "-lpthread",
    "-lm",
    "-o",
    executable,
  ], { cwd: repositoryRoot, encoding: "utf8", stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  const run = spawnSync(executable, [], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
