"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync } = require("node:fs");
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

test("Unix smalljac builds expose dependency headers to implicit Make rules", () => {
  const buildScript = readFileSync(
    join(packageRoot, "scripts", "build-deps.cjs"),
    "utf8",
  );
  const start = buildScript.indexOf("function buildSmalljac(source)");
  const end = buildScript.indexOf("\n}\n", start) + 2;
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const implementation = buildScript.slice(start, end);
  assert.equal(
    buildScript.match(/`CPPFLAGS=-I\$\{join\(prefix, "include"\)\}`/g)?.length,
    1,
  );
  assert.match(
    implementation,
    /const includes = `-I\$\{join\(prefix, "include"\)\}`/,
  );
  assert.match(implementation, /`CPPFLAGS=\$\{includes\}`/);
  assert.match(implementation, /`INCLUDES=\$\{includes\}`/);
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.error || ""}${result.stdout || ""}${result.stderr || ""}`,
  );
}

function windowsCompilerRun(args) {
  const candidates = [];
  if (process.env.VSINSTALLDIR) {
    candidates.push(
      join(process.env.VSINSTALLDIR, "VC", "Auxiliary", "Build", "vcvars64.bat"),
    );
  }
  candidates.push("C:\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat");
  const vcvars = candidates.find((candidate) => existsSync(candidate));
  assert.ok(vcvars, "Visual Studio vcvars64.bat is required on Windows");
  const compiler = process.env.CC || "clang-cl.exe";
  const quote = (value) => `"${value.replaceAll('"', '""')}"`;
  const command =
    `call "${vcvars}" >nul && ${quote(compiler)} ` + args.map(quote).join(" ");
  run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    windowsVerbatimArguments: true,
  });
}

test("portable ffpoly word arithmetic matches an independent exact oracle", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-ffpoly-word-"));
  if (process.platform === "win32") {
    const executable = join(directory, "word-arithmetic.exe");
    windowsCompilerRun([
      "/nologo",
      "/O2",
      `/I${include}`,
      source,
      `/Fe:${executable}`,
    ]);
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
    windowsCompilerRun([
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
