#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const fixture = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-buchmann-lenstra.json"),
    "utf8",
  ),
).t8_2pow32;

function run(source, timeout = 180_000) {
  const result = spawnSync(sagejs, [], {
    cwd: root,
    input: source,
    encoding: "utf8",
    timeout,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test("T8 fused public path is exact, lazy, independently checked, and fail closed", () => {
  const coefficients = fixture.coefficients_low_to_high.join(",");
  const expectedIndex =
    "3179557053031851899185109992371205233166102563054994659612778573877352351101815706666153685320008306418583370978265859646929314209130671444551656380504174391180190567870975750525148778143146969696718736142491176896345575184876739493887";
  const output = run(String.raw`
import sagejs.number_fields.composite_field_analysis as analysis
import sagejs.number_fields.maximal_order_engine as engine
from sagejs.number_fields.maximal_order_certification import check_maximal_order_certificate

coefficients = [${coefficients}]
ring = PolynomialRing(QQ, 'x')
polynomial = ring(coefficients)

packed = analysis.construct_composite_field_analysis(coefficients, 1)
assert packed.certified
assert analysis.check_composite_field_analysis(packed)
assert analysis.authenticated_composite_field_analysis_matches(
    packed,
    polynomial=coefficients,
    scale=1,
    index=${expectedIndex},
    order_discriminant=-2147483648,
)
assert packed.trace['factor_discovery_ns'] > 0
assert packed.trace['bl_construction_ns'] > 0
assert packed.trace['local_work_ns'] > 0
assert packed.trace['proof_check_ns'] > 0
assert any(
    event.get('packed_prime_count') == 1
    and event.get('native_fallback_count') == 0
    for event in packed.trace['events']
)

fast_field = NumberField(polynomial, 'fast')
fast = fast_field.maximal_order()
assert fast.discriminant() == -2147483648
assert fast.is_maximal()
assert fast._maximal_order_certificate_factory is not None
assert fast.maximality_certificate()['index'] == ${expectedIndex}
assert fast.maximality_certificate()['certified']
assert fast._maximal_order_certificate_factory is None
assert fast.maximal_order_trace()['analysis_trace']['proof_check_ns'] > 0
assert fast._basis_rows_cache is None
assert fast_field.maximal_order() is fast

generic = NumberField(polynomial, 'generic').maximal_order(trace=True)
assert generic.discriminant() == fast.discriminant()
assert generic.maximality_certificate()['index'] == fast.maximality_certificate()['index']
assert generic.maximality_certificate()['basis_numerator'] == fast.maximality_certificate()['basis_numerator']
assert generic.maximality_certificate()['basis_denominator'] == fast.maximality_certificate()['basis_denominator']
assert [element.list() for element in generic.basis()] == [
    element.list() for element in fast.basis()
]
assert fast._basis_rows_cache is not None

corrupt_certificate = dict(fast.maximality_certificate())
corrupt_rows = [list(row) for row in corrupt_certificate['basis_numerator']]
corrupt_rows[0][0] += 1
corrupt_certificate['basis_numerator'] = corrupt_rows
assert not check_maximal_order_certificate(corrupt_certificate)['certified']

bad = analysis.CompositeFieldAnalysisResult(
    packed.state,
    list(packed.polynomial),
    packed.scale,
    packed.equation_discriminant,
    packed.residual_prime,
    packed.residual_exponent,
    packed.square_support,
    engine.OrderBasis(
        [list(row) for row in packed.basis_numerator],
        packed.basis_denominator,
        canonical=True,
    ),
    packed.index + 1,
    packed.order_discriminant,
    dict(packed.trace),
)
assert not bad.certified
assert not analysis.check_composite_field_analysis(bad)
assert not analysis.authenticated_composite_field_analysis_matches(
    bad, polynomial=coefficients, scale=1
)

original = analysis.construct_composite_field_analysis
analysis.construct_composite_field_analysis = lambda _coefficients, _scale: bad
try:
    fallback = NumberField(polynomial, 'fallback').maximal_order()
finally:
    analysis.construct_composite_field_analysis = original
assert fallback.discriminant() == fast.discriminant()
assert fallback.maximality_certificate()['index'] == fast.maximality_certificate()['index']
assert fallback.maximality_certificate()['basis_numerator'] == fast.maximality_certificate()['basis_numerator']
assert fallback.maximality_certificate()['certified']
assert fallback.maximal_order_trace().get('analysis_trace') is None
print('T8_FUSED_ANALYSIS_OK')
`);
  assert.match(output, /T8_FUSED_ANALYSIS_OK/);
});

test("new compact proof kernels remain source transparent", () => {
  const source = join(
    root,
    "src/lib/sagejs/number_fields/composite_field_analysis.py",
  );
  for (const name of [
    "packed_polynomial_discriminant",
    "packed_integer_square_root",
    "packed_order_lattice_is_valid",
  ]) {
    const result = spawnSync(
      sagejs,
      ["native", "explain", source, "--function", name],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /source-transparent: yes/);
    assert.match(result.stdout, /0 callbacks inside core/);
  }
});
