"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const packageRoot = resolve(__dirname, "..");
const source = join(
  packageRoot,
  "scripts",
  "portable-smalljac",
  "word_arithmetic_test.c",
);
const gmpSource = join(
  packageRoot,
  "scripts",
  "portable-smalljac",
  "gmp_word_test.c",
);
const include = join(packageRoot, "scripts", "portable-smalljac");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`,
  );
}

test("portable ffpoly word arithmetic matches an independent exact oracle", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-ffpoly-word-"));
  if (process.platform === "win32") {
    const compiler = process.env.CC || "clang-cl.exe";
    const executable = join(directory, "word-arithmetic.exe");
    run(compiler, ["/nologo", "/O2", `/I${include}`, source, `/Fe:${executable}`]);
    run(executable, []);
    return;
  }
  const compiler = process.env.CC || "cc";
  const executable = join(directory, "word-arithmetic");
  run(compiler, ["-std=c99", "-O2", `-I${include}`, source, "-o", executable]);
  run(executable, []);
});

test(
  "Windows GMP adapters preserve values beyond the LLP64 word boundary",
  { skip: process.platform !== "win32" },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "sagejs-gmp-word-"));
    const prefix = resolve(
      process.env.SAGEJS_FLINT_PREFIX ||
        join(
          packageRoot,
          ".native",
          "vcpkg-installed",
          "x64-windows-static-md-release",
        ),
    );
    const executable = join(directory, "gmp-word.exe");
    run(process.env.CC || "clang-cl.exe", [
      "/nologo",
      "/O2",
      "/MD",
      `/I${include}`,
      `/I${join(prefix, "include")}`,
      gmpSource,
      join(prefix, "lib", "gmp.lib"),
      `/Fe:${executable}`,
    ]);
    run(executable, []);
  },
);
