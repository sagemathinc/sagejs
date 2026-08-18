#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX || join(
  root,
  "packages",
  "flint",
  ".native",
  process.platform === "win32"
    ? join("vcpkg-installed", "x64-windows-static-md-release")
    : "prefix",
));
const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-analysis-resource-"));
const source = join(temporary, "witness.c");
const executable = process.platform === "win32"
  ? join(temporary, "build", "Release", "witness.exe")
  : join(temporary, "witness");
const sanitize = process.env.SAGEJS_FFI_SANITIZE === "1";

function compileWindows() {
  const builtins = spawnSync(process.execPath, [
    join(root, "packages", "flint", "scripts", "windows-clang-builtins.cjs"),
  ], { cwd: root, encoding: "utf8", timeout: 30_000 });
  assert.equal(
    builtins.status,
    0,
    `unable to resolve Windows Clang builtins:\n${builtins.stdout}\n${builtins.stderr}`,
  );
  const libraries = [
    "flint.lib",
    "openblas.lib",
    "mpc.lib",
    "mpfr.lib",
    "gmp.lib",
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
      msvs_settings: {
        VCCLCompilerTool: { Optimization: 2, WarningLevel: 3 },
      },
    }],
  }, null, 2)}\n`);
  const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
    paths: [join(root, "packages", "flint")],
  });
  return spawnSync(process.execPath, [nodeGyp, "rebuild", "--release"], {
    cwd: temporary,
    encoding: "utf8",
    timeout: 120_000,
  });
}

function compileUnix() {
  const libraries = [
    "libflint.a",
    "libopenblas.a",
    "libmpc.a",
    "libmpfr.a",
    "libgmp.a",
  ].map((name) => join(prefix, "lib", name));
  return spawnSync(process.env.CC || "cc", [
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...(sanitize ? ["-fno-omit-frame-pointer", "-fsanitize=address,undefined"] : []),
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    source,
    ...libraries,
    "-lm",
    "-lpthread",
    "-o",
    executable,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
}

function u64(buffer, offset) {
  return Number(buffer.readBigUInt64LE(offset));
}

function integer(buffer, cursor) {
  assert(cursor.offset + 4 <= buffer.length, "truncated integer header");
  const header = buffer.readUInt32LE(cursor.offset);
  cursor.offset += 4;
  const length = header & 0x7fffffff;
  assert(length <= buffer.length - cursor.offset, "truncated integer body");
  let value = 0n;
  for (let index = 0; index < length; index++) {
    value |= BigInt(buffer[cursor.offset + index]) << BigInt(8 * index);
  }
  cursor.offset += length;
  return (header & 0x80000000) === 0 ? value : -value;
}

function decode(hex) {
  const buffer = Buffer.from(hex, "hex");
  assert.equal(buffer.subarray(0, 8).toString("hex"), "534a4e4641010000");
  const degree = u64(buffer, 8);
  const componentCount = u64(buffer, 32);
  const count = u64(buffer, 56);
  assert.equal(count, 5 + degree + 1 + 3 * componentCount + degree * degree);
  assert.equal(u64(buffer, 64), 1);
  assert.equal(u64(buffer, 72), 0);
  const cursor = { offset: 80 };
  const values = Array.from({ length: count }, () => integer(buffer, cursor));
  assert.equal(cursor.offset, buffer.length);
  const polynomialStart = 5;
  const polynomialEnd = polynomialStart + degree + 1;
  const componentStart = polynomialEnd;
  const basisStart = componentStart + 3 * componentCount;
  return {
    degree,
    status: u64(buffer, 16),
    trialBound: u64(buffer, 24),
    resolved: u64(buffer, 40),
    native: u64(buffer, 48),
    scale: values[0],
    denominator: values[1],
    index: values[2],
    equationDiscriminant: values[3],
    orderDiscriminant: values[4],
    polynomial: values.slice(polynomialStart, polynomialEnd),
    components: Array.from({ length: componentCount }, (_, index) =>
      values.slice(componentStart + 3 * index, componentStart + 3 * index + 3)),
    numerator: Array.from({ length: degree }, (_, row) =>
      values.slice(basisStart + row * degree, basisStart + (row + 1) * degree)),
  };
}

try {
  if (sanitize && ["darwin", "win32"].includes(process.platform)) {
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.number-field-analysis-resource/v1",
      capability: "sanitizers",
      supported: false,
      reason: process.platform === "darwin"
        ? "Apple ASan does not provide the required leak checker"
        : "the Windows lifecycle witness uses node-gyp rather than ASan/UBSan",
    })}\n`);
    process.exit(0);
  }
  writeFileSync(
    source,
    readFileSync(join(root, "bench", "number-field-analysis-resource-witness.c")),
  );
  const compiled = process.platform === "win32" ? compileWindows() : compileUnix();
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
  const executed = spawnSync(executable, [], {
    cwd: root,
    encoding: "utf8",
    env: sanitize ? sanitizerEnvironment({ strictStringChecks: true }) : process.env,
    timeout: 120_000,
  });
  assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
  const report = JSON.parse(executed.stdout);
  assert.equal(report.schema, "sagejs.number-field-analysis-resource/v1");

  const sqrt5 = decode(report.sqrt5);
  assert.deepEqual(sqrt5, {
    degree: 2,
    status: 0,
    trialBound: 1000,
    resolved: 2,
    native: 1,
    scale: 3n,
    denominator: 2n,
    index: 2n,
    equationDiscriminant: 20n,
    orderDiscriminant: 5n,
    polynomial: [-5n, 0n, 1n],
    components: [[2n, 2n, 0n], [5n, 1n, 0n]],
    numerator: [[1n, 1n], [0n, 2n]],
  });
  const cubic = decode(report.cubic);
  assert.equal(cubic.status, 0);
  assert.equal(cubic.index, 2n);
  assert.equal(cubic.equationDiscriminant, -2012n);
  assert.equal(cubic.orderDiscriminant, -503n);

  const unresolved = decode(report.unresolved);
  assert.equal(unresolved.status, 1);
  assert.equal(unresolved.resolved, 1);
  assert.equal(unresolved.native, 1);
  assert.deepEqual(unresolved.components, [[2n, 2n, 0n], [1022117n, 1n, 1n]]);
  assert.equal(unresolved.index, 2n, "partial word-prime HNF was discarded");

  const arbitrary = decode(report.arbitrary);
  assert.equal(arbitrary.status, 2);
  assert.equal(arbitrary.resolved, 1);
  assert.equal(arbitrary.native, 1);
  assert.equal(arbitrary.components[1][0], 18446744073709551629n);
  assert.equal(arbitrary.components[1][2], 2n);
  assert.equal(arbitrary.index, 2n, "arbitrary-prime fallback erased partial HNF");

  const header = readFileSync(
    join(root, "packages", "flint", "include", "sagejs", "number_field_analysis_resource_ffi.h"),
    "utf8",
  );
  assert.doesNotMatch(header, /napi_|node_api|PyObject|emscripten/);
  assert.match(header, /FALLBACK_UNRESOLVED/);
  assert.match(header, /FALLBACK_ARBITRARY_PRIME/);
  assert.match(header, /SAGEJS_NF_ANALYSIS_MAX_TRIAL_BOUND/);
  assert.doesNotMatch(header, /static\s+[^;=]+cached|global_cache/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
