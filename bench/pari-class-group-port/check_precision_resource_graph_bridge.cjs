#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "../..");
const sourcePath = join(__dirname, "precision_resource_graph_bridge.py");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    ...options,
    env: { ...process.env, ...(options.env || {}) },
  });
  assert.equal(
    result.status,
    0,
    `${result.error || ""}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout;
}

function installResourceRuntime() {
  const previousRequire = globalThis.__sagejs_runtime_require__;
  const previousLoader = globalThis.__sagejs_load_module__;
  globalThis.__sagejs_runtime_require__ = createRequire(join(root, "package.json"));
  globalThis.__sagejs_load_module__ = (moduleName) => {
    assert.equal(moduleName, "sagejs.ffi.flint");
    return {
      FmpzMatrix(token) {
        return {
          _ffi_borrow() {
            return token;
          },
          close() {
            const tag = globalThis.__sagejs_ffi_resource_tag__;
            const state = token[tag];
            if (state.closed) return;
            Reflect.apply(state.close, state.backend, [state.handle]);
            state.closed = true;
            state.handle = null;
            state.registry?.unregister(token);
          },
        };
      },
    };
  };
  return () => {
    if (previousRequire === undefined) delete globalThis.__sagejs_runtime_require__;
    else globalThis.__sagejs_runtime_require__ = previousRequire;
    if (previousLoader === undefined) delete globalThis.__sagejs_load_module__;
    else globalThis.__sagejs_load_module__ = previousLoader;
  };
}

function implementation(fn, backend) {
  return backend === "native" ? fn : fn[backend];
}

function exercise(module, backend) {
  const create = implementation(module.pari_precision_matrix_create, backend);
  const set = implementation(module.pari_precision_matrix_set, backend);
  const entry = implementation(module.pari_precision_matrix_entry, backend);
  const bridge = implementation(module.pari_precision_resource_retry_bridge, backend);
  const owned = [];
  const matrix = (rows, columns, values) => {
    const value = create(BigInt(rows), BigInt(columns));
    owned.push(value);
    values.forEach((item, index) =>
      assert.equal(
        set(value, BigInt(Math.floor(index / columns)), BigInt(index % columns), item),
        true,
      ),
    );
    return value;
  };
  const entries = (value, rows, columns) =>
    Array.from({ length: rows * columns }, (_, index) =>
      entry(value, BigInt(Math.floor(index / columns)), BigInt(index % columns)).toString(),
    );
  const huge = 1n << 180n;
  const exactValues = [huge + 3n, -huge + 11n, 37n, -19n, 5n, 7n];
  const exactOwner = matrix(2, 3, exactValues);
  const numerators = matrix(3, 1, [1n, 4n, 1n]);
  const denominators = matrix(3, 1, [1n, 1n, 4n]);
  const scratch = matrix(6, 1, Array(6).fill(-991n));
  const published = matrix(6, 1, Array(6).fill(-991n));
  const diagnostics = matrix(4, 1, Array(4).fill(-991n));
  try {
    assert.equal(
      bridge(
        exactOwner, 2n, 3n, numerators, denominators, scratch, published,
        diagnostics, 3n, 32n, 128n, true,
      ),
      true,
    );
    const successful = {
      exact: entries(exactOwner, 2, 3),
      scratch: entries(scratch, 6, 1),
      published: entries(published, 6, 1),
      diagnostics: entries(diagnostics, 4, 1),
    };

    const failedPublished = matrix(6, 1, Array(6).fill(-313n));
    const failedDiagnostics = matrix(4, 1, Array(4).fill(-317n));
    const failedScratch = matrix(6, 1, Array(6).fill(-319n));
    assert.throws(
      () => bridge(
        exactOwner, 2n, 3n, numerators, denominators, failedScratch,
        failedPublished, failedDiagnostics, 3n, 32n, 5000n, true,
      ),
      /invalid|precision/,
    );
    const aliasPublished = matrix(6, 1, Array(6).fill(-401n));
    const aliasDiagnostics = matrix(4, 1, Array(4).fill(-409n));
    assert.throws(
      () => bridge(
        exactOwner, 2n, 3n, numerators, denominators, numerators,
        aliasPublished, aliasDiagnostics, 3n, 32n, 128n, true,
      ),
      /invalid|alias|dimensions/,
    );
    return {
      successful,
      failed: {
        exact: entries(exactOwner, 2, 3),
        published: entries(failedPublished, 6, 1),
        diagnostics: entries(failedDiagnostics, 4, 1),
      },
      alias: {
        exact: entries(exactOwner, 2, 3),
        published: entries(aliasPublished, 6, 1),
        diagnostics: entries(aliasDiagnostics, 4, 1),
      },
    };
  } finally {
    for (const value of owned.reverse()) value.close();
  }
}

function decimalOracle(endpoints) {
  const program = String.raw`
import decimal
import json
import sys

values = [int(value) for value in json.loads(sys.stdin.read())]
decimal.getcontext().prec = 160
scale = decimal.Decimal(2) ** 128
targets = [decimal.Decimal(1).ln(), decimal.Decimal(4).ln(),
           (decimal.Decimal(1) / decimal.Decimal(4)).ln()]
for index, target in enumerate(targets):
    lower = decimal.Decimal(values[2 * index]) / scale
    upper = decimal.Decimal(values[2 * index + 1]) / scale
    assert lower <= target <= upper
assert values[0] == 0 and values[1] == 0
print("decimal-oracle-ok")
`;
  return run("python3", ["-c", program], {
    input: JSON.stringify(endpoints.map(String)),
  });
}

async function main() {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-precision-resource-graph-"));
  try {
    const cacheRoot = join(temporary, "cache");
    const built = await compileKernel({ sourcePath, cacheRoot });
    const core = readFileSync(built.coreSourcePath, "utf8");
    const ir = built.ir;
    const names = new Set(ir.functions.map((fn) => fn.name));
    assert.ok(names.has("pari_precision_resource_retry_bridge"));
    assert.ok(names.has("pari_exact_owner_checksum"));
    assert.ok(names.has("pari_refresh_positive_log_balls"));
    assert.match(core, /sagejs_flint_positive_rational_log_balls_resource/);
    assert.doesNotMatch(core, /\bnapi_|\bPyObject\b|napi_call_function|v8::/);

    const module = require(built.modulePath);
    const restoreRuntime = installResourceRuntime();
    let results;
    try {
      results = ["javascript", "gmp", "native"].map((backend) =>
        exercise(module, backend),
      );
    } finally {
      restoreRuntime();
    }
    assert.deepEqual(results[0].successful.exact, results[1].successful.exact);
    assert.deepEqual(results[0].successful.published, results[1].successful.published);
    assert.deepEqual(results[0].successful.scratch, results[1].successful.scratch);
    assert.deepEqual(results[0].successful.diagnostics, results[1].successful.diagnostics);
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[1], results[2]);
    assert.deepEqual(results[2].successful.scratch, results[2].successful.published);
    assert.deepEqual(results[2].successful.diagnostics.slice(0, 2), ["44", "44"]);
    assert.deepEqual(results[2].successful.diagnostics.slice(2), ["128", "2"]);
    assert.deepEqual(results[2].failed.exact, results[2].successful.exact);
    assert.deepEqual(results[2].failed.published, Array(6).fill("-313"));
    assert.deepEqual(results[2].failed.diagnostics, Array(4).fill("-317"));
    assert.deepEqual(results[2].alias.exact, results[2].successful.exact);
    assert.deepEqual(results[2].alias.published, Array(6).fill("-401"));
    assert.deepEqual(results[2].alias.diagnostics, Array(4).fill("-409"));
    assert.match(decimalOracle(results[2].successful.published), /decimal-oracle-ok/);
    console.log(
      "precision resource graph bridge matches dynamic/native execution, " +
        "retains exact owners, and publishes only successful retries",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
