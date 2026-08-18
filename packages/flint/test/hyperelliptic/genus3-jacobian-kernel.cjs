"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..", "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || join(packageRoot, ".native", "prefix"),
);
const compiler = process.env.CC || "cc";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
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

const temporary = mkdtempSync(join(tmpdir(), "sagejs-g3j-test-"));
try {
  const executable = join(temporary, "genus3-jacobian-kernel");
  const libraries = process.platform === "win32"
    ? ["flint.lib", "mpfr.lib", "gmp.lib", "openblas.lib"]
    : [
        "-Wl,--start-group", "-lflint", "-lmpfr", "-lgmp", "-lopenblas",
        "-Wl,--end-group", "-lm", "-lpthread",
      ];
  const compile = [
    "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
    `-I${join(packageRoot, "include")}`,
    `-I${join(prefix, "include")}`,
    join(packageRoot, "src", "hyperelliptic", "genus3_jacobian.c"),
    join(__dirname, "genus3-jacobian-kernel.c"),
    `-L${join(prefix, "lib")}`,
    ...libraries,
    "-o", executable,
  ];
  const output = run(compiler, compile);
  if (output) process.stdout.write(output);
  process.stdout.write(run(executable, []));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
