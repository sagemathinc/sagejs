#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", process.platform === "win32"
      ? join("vcpkg-installed", "x64-windows-static-md-release")
      : "prefix"),
);
const temporary = mkdtempSync(join(tmpdir(), "sagejs-round2-degree90-"));
const source = join(temporary, "witness.c");
const executable = process.platform === "win32"
  ? join(temporary, "build", "Release", "witness.exe")
  : join(temporary, "witness");
const sanitize = process.env.SAGEJS_FFI_SANITIZE === "1";

function compileUnix(output = executable, defines = []) {
  const libraries = ["flint", "openblas", "mpc", "mpfr", "gmp"]
    .map((name) => join(prefix, "lib", `lib${name}.a`));
  return spawnSync(process.env.CC || "cc", [
    "-std=c11", sanitize ? "-O1" : "-O2", "-Wall", "-Wextra", "-Werror",
    ...(sanitize ? ["-fno-omit-frame-pointer", "-fsanitize=address,undefined"] : []),
    ...defines.map((define) => `-D${define}`),
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`, source, ...libraries,
    "-lm", "-lpthread", "-o", output,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
}

function compileWindows() {
  const builtins = spawnSync(process.execPath, [
    join(root, "packages", "flint", "scripts", "windows-clang-builtins.cjs"),
  ], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(builtins.status, 0, `${builtins.stdout}\n${builtins.stderr}`);
  const libraries = [
    "flint.lib", "openblas.lib", "mpc.lib", "mpfr.lib", "gmp.lib",
    "pthreadVC3.lib",
  ].map((name) => join(prefix, "lib", name));
  libraries.push(builtins.stdout.trim());
  writeFileSync(join(temporary, "binding.gyp"), `${JSON.stringify({
    targets: [{
      target_name: "witness",
      type: "executable",
      sources: ["witness.c"],
      include_dirs: [
        join(root, "packages", "flint", "include"),
        join(prefix, "include"),
      ],
      defines: ["_CRT_SECURE_NO_WARNINGS"],
      libraries,
      configurations: {
        Release: {
          msbuild_toolset: "ClangCL",
          msvs_settings: { VCCLCompilerTool: { RuntimeLibrary: 2 } },
        },
      },
      msvs_settings: { VCCLCompilerTool: { Optimization: 2, WarningLevel: 3 } },
    }],
  }, null, 2)}\n`);
  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
    paths: [join(root, "packages", "flint")],
  });
  return spawnSync(process.execPath, [nodeGyp, "rebuild", "--release"], {
    cwd: temporary, encoding: "utf8", timeout: 120_000,
  });
}

try {
  if (sanitize && ["darwin", "win32"].includes(process.platform)) {
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.number-field-round2/v1",
      capability: "sanitizers",
      supported: false,
      reason: process.platform === "darwin"
        ? "Apple ASan does not provide the required leak checker"
        : "native Windows uses the lifecycle witness without ASan/UBSan",
    })}\n`);
    process.exit(0);
  }
  writeFileSync(source, readFileSync(join(
    root, "packages", "flint", "test", "number_field_order_ffi.c",
  )));
  const compiled = process.platform === "win32" ? compileWindows() : compileUnix();
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
  const executionEnvironment = sanitize
    ? sanitizerEnvironment({ strictStringChecks: true })
    : process.env;
  const executed = spawnSync(executable, [], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    env: executionEnvironment,
  });
  assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
  const report = JSON.parse(executed.stdout);
  assert.equal(report.schema, "sagejs.number-field-round2/v1");
  assert.equal(report.merge, "exact");
  assert.equal(report.worker_failure, "clean");
  assert.equal(report.delayed_order, "identity");
  assert.equal(report.platform_capability, "pthread-parallel");
  assert.equal(report.schedule, "dynamic");
  if (process.platform !== "win32") {
    const staticExecutable = join(temporary, "static-witness");
    const staticCompiled = compileUnix(staticExecutable, [
      "SAGEJS_NF_ORDER_FORCE_STATIC_INDEPENDENT_SCHEDULE=1",
    ]);
    assert.equal(
      staticCompiled.status,
      0,
      `${staticCompiled.stdout}\n${staticCompiled.stderr}`,
    );
    const staticExecuted = spawnSync(staticExecutable, [], {
      cwd: root, encoding: "utf8", timeout: 120_000,
      env: executionEnvironment,
    });
    assert.equal(
      staticExecuted.status,
      0,
      `${staticExecuted.stdout}\n${staticExecuted.stderr}`,
    );
    const staticReport = JSON.parse(staticExecuted.stdout);
    assert.deepEqual(
      { ...staticReport, schedule: "dynamic" },
      report,
    );
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
