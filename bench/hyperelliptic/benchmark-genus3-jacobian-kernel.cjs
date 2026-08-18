"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..", "..");
const packageRoot = join(repositoryRoot, "packages", "flint");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || join(packageRoot, ".native", "prefix"),
);
const temporary = mkdtempSync(join(tmpdir(), "sagejs-g3j-bench-"));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

if (!existsSync(join(prefix, "include", "flint", "flint.h"))) {
  throw new Error(`FLINT dependency prefix is missing: ${prefix}`);
}

try {
  const executable = join(temporary, "genus3-jacobian-benchmark");
  run(process.env.CC || "cc", [
    "-std=c11", "-O3", "-DNDEBUG",
    `-I${join(packageRoot, "include")}`,
    `-I${join(prefix, "include")}`,
    join(packageRoot, "src", "hyperelliptic", "genus3_jacobian.c"),
    join(__dirname, "genus3-jacobian-kernel.c"),
    `-L${join(prefix, "lib")}`,
    "-Wl,--start-group", "-lflint", "-lmpfr", "-lgmp", "-lopenblas",
    "-Wl,--end-group", "-lm", "-lpthread",
    "-o", executable,
  ]);
  process.stdout.write(run(executable, []));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
