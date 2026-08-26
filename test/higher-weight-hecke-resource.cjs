#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-higher-weight-resource-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const behavior = String.raw`
import sagejs.runtime as runtime
from sagejs.ffi.flint import fmpq_matrix_nrows

cases = [
    (5, 2, 0, 2),
    (7, 4, -1, 3),
    (11, 4, 0, 5),
    (11, 4, 0, 101),
    (11, 6, 1, 7),
    (13, 4, 0, 13),
    (1000, 4, 1, 2),
    (1000, 4, -1, 2),
    (1000, 6, 1, 2),
    (1000, 6, -1, 2),
]

for level, weight, sign, prime in cases:
    line = P1List(level)
    presentation = line.higher_weight_presentation(weight, sign)
    result = line.higher_weight_hecke_matrix(weight, sign, prime)
    assert result._has_fmpq_matrix_resource()
    storage = result._rational_storage_cache
    assert runtime.reflect.get(storage, 'numerators') is runtime.undefined
    assert runtime.reflect.get(storage, 'denominators') is runtime.undefined
    oracle = line._higher_weight_hecke_matrix_flint(
        weight, sign, prime, presentation
    )
    assert result == oracle
    assert line.higher_weight_hecke_matrix(weight, sign, prime) is result

closed_result = P1List(5).higher_weight_hecke_matrix(2, 0, 2)
owned = closed_result._rational_resource()
assert not owned.closed
owned.close()
owned.close()
assert owned.closed
try:
    fmpq_matrix_nrows(owned)
except ValueError as error:
    assert str(error) == 'FFI resource is closed'
else:
    raise AssertionError('closed Hecke resource remained readable')

print('higher-weight-resource-ok')
`;

assert.equal(
  runSage(behavior, {
    SAGEJS_NATIVE_REQUIRED: "1",
  }),
  "higher-weight-resource-ok",
);

const dynamicFallback = String.raw`
import sagejs.runtime as runtime

for level, weight, sign, prime in [(5, 2, 0, 2), (11, 4, 0, 101)]:
    line = P1List(level)
    presentation = line.higher_weight_presentation(weight, sign)
    result = line.higher_weight_hecke_matrix(weight, sign, prime)
    assert result._has_fmpq_matrix_resource()
    oracle = line._higher_weight_hecke_matrix_flint(
        weight, sign, prime, presentation
    )
    assert result == oracle

print('higher-weight-resource-fallback-ok')
`;

assert.equal(
  runSage(dynamicFallback, {
    SAGEJS_NATIVE_DISABLE: "1",
  }),
  "higher-weight-resource-fallback-ok",
);

const trace = runSage(String.raw`
import sagejs.runtime as runtime

P = P1List(11)
presentation = P.higher_weight_presentation(4, 0)
presentation._native_kernel_data()

def forbidden_boundary(*args):
    raise AssertionError('production higher-weight Hecke used legacy output')

backend = runtime.flint_backend()
backend.qqMatrixExportPacked = forbidden_boundary
backend.p1ListHigherWeightHeckeMatrix = forbidden_boundary
runtime.rational_class._from_reduced = forbidden_boundary
T = P.higher_weight_hecke_matrix(4, 0, 101)
assert T._has_fmpq_matrix_resource()
print('trace-ok')
`, {
  SAGEJS_NATIVE_REQUIRED: "1",
  SAGEJS_NATIVE_TRACE: "1",
});
assert.doesNotMatch(
  trace,
  /qqMatrixExportPacked|p1ListHigherWeightHeckeMatrix|_from_reduced/,
);
assert.match(trace, /trace-ok/);

console.log("higher-weight Hecke resource tests passed");
