#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src/lib/sagejs/number_fields/field_analysis_resource.py",
);

function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    ...options,
    env: { ...process.env, ...(options.env || {}) },
  });
  assert.equal(
    result.status,
    0,
    `${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

test("packed analysis projection has one isolated crossing", () => {
  const explanation = run([
    sagejs,
    "native",
    "explain",
    source,
    "--function",
    "packed_field_analysis_authenticate_projection",
  ]);
  assert.match(explanation, /source-transparent: yes/);
  assert.match(explanation, /host boundary: 1 public crossing\/call/);
  assert.match(explanation, /0 callbacks inside core/);
  assert.match(explanation, /packed_field_analysis_fixed_points_are_valid/);
});

test("compiled and dynamic projections agree with the generic proof oracle", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-projection-test-"));
  try {
    const cache = join(temporary, "native-cache");
    run([sagejs, "native", "compile", source, "--cache-root", cache]);
    const script = join(temporary, "projection.py");
    writeFileSync(script, String.raw`
import json
import sagejs.ffi.flint as flint
import sagejs.number_fields.field_analysis_resource as analysis
from sagejs.native import is_compiled

cases = [
    [-2, 0, 0, 1],
    [8, -2, 1, 1],
    [3, -2, 0, 0, 0, 0, 0, 1],
]

def payload(coefficients):
    polynomial = flint.fmpz_polynomial(len(coefficients))
    try:
        for index, value in enumerate(coefficients):
            flint.fmpz_polynomial_set_coefficient(polynomial, index, value)
        flint.fmpz_polynomial_seal(polynomial)
        resource = flint.number_field_analyze_resource(polynomial, 1, 1000)
        try:
            return list(resource.copy_bytes())
        finally:
            resource.close()
    finally:
        polynomial.close()

records = []
for coefficients in cases:
    raw = payload(coefficients)
    compact = analysis.decode_field_analysis_projection(
        raw,
        expected_polynomial=coefficients,
        expected_scale=1,
        expected_trial_bound=1000,
    )
    generic = analysis.decode_field_analysis_resource(
        raw,
        expected_polynomial=coefficients,
        expected_scale=1,
        expected_trial_bound=1000,
    )
    records.append({
        "certified": compact.certified,
        "polynomial": list(compact.polynomial) == list(generic.polynomial),
        "components": compact.components_flat == tuple(
            value
            for component in generic.components
            for value in (component.value, component.exponent, component.state)
        ),
        "basis": compact.basis_numerator == generic.basis_numerator,
        "denominator": compact.basis_denominator == generic.basis_denominator,
        "index": compact.index == generic.index,
        "equation_discriminant": compact.equation_discriminant == generic.equation_discriminant,
        "order_discriminant": compact.order_discriminant == generic.order_discriminant,
        "binding": analysis.authenticated_field_analysis_projection_matches(
            compact, polynomial=coefficients, scale=1, trial_bound=1000
        ),
    })

raw = payload(cases[0])
corruptions = []
for offset in [0, 16, 56, 80, len(raw) - 1]:
    corrupt = list(raw)
    corrupt[offset] = (corrupt[offset] + 1) % 256
    try:
        analysis.decode_field_analysis_projection(
            corrupt,
            expected_polynomial=cases[0],
            expected_scale=1,
            expected_trial_bound=1000,
        )
    except (IndexError, OverflowError, ValueError, ZeroDivisionError):
        corruptions.append(True)
    else:
        corruptions.append(False)

direct = analysis.AuthenticatedFieldAnalysisProjection(cases[0], [0] * 20)
print(json.dumps({
    "compiled": is_compiled(analysis.packed_field_analysis_authenticate_projection),
    "records": records,
    "corruptions": corruptions,
    "directCertified": direct.certified,
}))
`);
    const compiled = JSON.parse(
      run([sagejs, script], { env: { SAGEJS_NATIVE_CACHE_DIR: cache } })
        .split(/\r?\n/).at(-1),
    );
    const dynamic = JSON.parse(
      run([sagejs, script], { env: { SAGEJS_NATIVE_MODE: "dynamic" } })
        .split(/\r?\n/).at(-1),
    );
    assert.equal(compiled.compiled, true);
    assert.equal(dynamic.compiled, false);
    for (const report of [compiled, dynamic]) {
      assert.equal(report.directCertified, false);
      assert.deepEqual(report.corruptions, [true, true, true, true, true]);
      for (const record of report.records) {
        assert.ok(Object.values(record).every(Boolean), JSON.stringify(record));
      }
    }
    assert.deepEqual(compiled.records, dynamic.records);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
