#!/usr/bin/env node
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
    join(
      root,
      "packages",
      "flint",
      ".native",
      process.platform === "win32"
        ? join("vcpkg-installed", "x64-windows-static-md-release")
        : "prefix",
    ),
);
const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-order-resource-"));
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

function compileHardWitness(name, defines = []) {
  const output = join(temporary, name);
  const libraries = [
    "libflint.a",
    "libopenblas.a",
    "libmpc.a",
    "libmpfr.a",
    "libgmp.a",
  ].map((library) => join(prefix, "lib", library));
  const compiled = spawnSync(process.env.CC || "cc", [
    "-std=c11",
    "-O3",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...defines.map((define) => `-D${define}`),
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    join(root, "bench", "number-field-order-resource-witness.c"),
    ...libraries,
    "-lm",
    "-lpthread",
    "-o",
    output,
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(compiled.status, 0, `${compiled.stdout}\n${compiled.stderr}`);
  return output;
}

function hardPayload(executablePath, caseIndex) {
  const executed = spawnSync(executablePath, [String(caseIndex), "0", "1"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
  return JSON.parse(executed.stdout).payloadHex;
}

function randomizedPayloads(executablePath, seed, count) {
  const executed = spawnSync(executablePath, [
    "--randomized",
    String(seed),
    String(count),
  ], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
  return executed.stdout;
}

function readU64(buffer, offset) {
  return Number(buffer.readBigUInt64LE(offset));
}

function readInteger(buffer, state) {
  const header = buffer.readUInt32LE(state.offset);
  state.offset += 4;
  const negative = (header & 0x80000000) !== 0;
  const length = header & 0x7fffffff;
  let value = 0n;
  for (let index = 0; index < length; index++) {
    value |= BigInt(buffer[state.offset + index]) << BigInt(8 * index);
  }
  state.offset += length;
  return negative ? -value : value;
}

function decodeOrder(hex) {
  const buffer = Buffer.from(hex, "hex");
  assert.equal(buffer.subarray(0, 8).toString("hex"), "534a4e464f010000");
  const degree = readU64(buffer, 8);
  const status = readU64(buffer, 16);
  const state = { offset: 64 };
  const values = Array.from(
    { length: readU64(buffer, 56) },
    () => readInteger(buffer, state),
  );
  assert.equal(state.offset, buffer.length);
  return {
    degree,
    status,
    supplied: readU64(buffer, 24),
    resolved: readU64(buffer, 32),
    native: readU64(buffer, 40),
    unramified: readU64(buffer, 48),
    denominator: values[0],
    index: values[1],
    equationDiscriminant: values[2],
    orderDiscriminant: values[3],
    fallbackPrime: values[4],
    numerator: Array.from({ length: degree }, (_, row) =>
      values.slice(5 + row * degree, 5 + (row + 1) * degree)),
  };
}

try {
  if (sanitize && ["darwin", "win32"].includes(process.platform)) {
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.number-field-order-resource/v1",
      capability: "sanitizers",
      supported: false,
      reason: process.platform === "darwin"
        ? "Apple ASan does not provide the required leak checker"
        : "the native Windows lifecycle witness is not an ASan/UBSan configuration",
    })}\n`);
    process.exit(0);
  }
  writeFileSync(
    source,
    readFileSync(
      join(root, "packages", "flint", "test", "number_field_order_resource_ffi.c"),
    ),
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
  assert.equal(report.schema, "sagejs.number-field-order-resource/v1");

  // Independent JS decoding and exact frozen Sage/PARI-compatible lattices.
  assert.deepEqual(decodeOrder(report.sqrt5), {
    degree: 2,
    status: 0,
    supplied: 1,
    resolved: 1,
    native: 1,
    unramified: 0,
    denominator: 2n,
    index: 2n,
    equationDiscriminant: 20n,
    orderDiscriminant: 5n,
    fallbackPrime: 0n,
    numerator: [[1n, 1n], [0n, 2n]],
  });
  assert.deepEqual(decodeOrder(report.gaussian), {
    degree: 2,
    status: 0,
    supplied: 1,
    resolved: 1,
    native: 1,
    unramified: 0,
    denominator: 1n,
    index: 1n,
    equationDiscriminant: -4n,
    orderDiscriminant: -4n,
    fallbackPrime: 0n,
    numerator: [[1n, 0n], [0n, 1n]],
  });
  assert.deepEqual(decodeOrder(report.cubicIndexTwo), {
    degree: 3,
    status: 0,
    supplied: 1,
    resolved: 1,
    native: 1,
    unramified: 0,
    denominator: 2n,
    index: 2n,
    equationDiscriminant: -2012n,
    orderDiscriminant: -503n,
    fallbackPrime: 0n,
    numerator: [[2n, 0n, 0n], [0n, 1n, 1n], [0n, 0n, 2n]],
  });
  const large = decodeOrder(report.largeUnramified);
  assert.equal(large.status, 0);
  assert.equal(large.native, 0);
  assert.equal(large.unramified, 1);
  assert.equal(large.denominator, 1n);
  assert.equal(report.largeFallbackStatus, 1);

  if (!sanitize && process.platform !== "win32") {
    const optimized = compileHardWitness("hard-optimized");
    const exact = compileHardWitness("hard-exact", [
      "SAGEJS_NF_ORDER_FORCE_EXACT_MULTIPLIER=1",
    ]);
    for (const caseIndex of [4, 5]) {
      assert.equal(
        hardPayload(optimized, caseIndex),
        hardPayload(exact, caseIndex),
        `hard case ${caseIndex} p^2 multiplier differs from the exact lattice-inverse oracle`,
      );
    }
    assert.equal(
      randomizedPayloads(optimized, 0x5a17, 32),
      randomizedPayloads(exact, 0x5a17, 32),
      "randomized p^2 multiplier results differ from the exact lattice-inverse oracle",
    );
  }

  const header = readFileSync(
    join(root, "packages", "flint", "include", "sagejs", "number_field_order_resource_ffi.h"),
    "utf8",
  );
  assert.doesNotMatch(header, /napi_|node_api|PyObject|emscripten/);
  assert.match(header, /FALLBACK_ARBITRARY_PRIME/);
  assert.match(header, /const sagejs_fmpz_polynomial_t polynomial/);
  assert.match(header, /sagejs_number_field_order_resource_data/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
