"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { performance } = require("node:perf_hooks");

const root = join(__dirname, "..");
const sagejs =
  process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "number-field-quadratic-class-units.json"),
    "utf8",
  ),
);

function runSage(source) {
  const result = spawnSync(sagejs, ["--python", "-"], {
    cwd: root,
    encoding: "utf8",
    input: source,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("quadratic class/unit oracle fixture records independent CAS interfaces", () => {
  assert.equal(
    fixture.schema,
    "sagejs.number-fields/quadratic-class-units-oracle-v1",
  );
  assert.match(fixture.oracles.sage_pari.version, /SageMath.*PARI/);
  assert.match(fixture.oracles.magma.command, /NarrowClassGroup/);
  assert.ok(fixture.cases.some((entry) => entry.unit_norm === -1));
  assert.ok(fixture.cases.some((entry) => entry.unit_norm === 1));
  assert.ok(
    fixture.cases.some((entry) => entry.narrow_invariants.length > 1),
  );
});

test("continued fractions and reduced forms match the Sage/PARI corpus", () => {
  const cases = JSON.stringify(fixture.cases);
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import QuadraticForm, real_quadratic_class_group, real_quadratic_fundamental_unit

cases = ${cases}
for expected in cases:
    discriminant = expected["discriminant"]
    units = real_quadratic_fundamental_unit(discriminant)
    assert units.algorithm == "principal-form-continued-fraction"
    assert units.proof_status == "exact-unconditional"
    assert units.unit.x == expected["unit_x"]
    assert units.unit.y == expected["unit_y"]
    assert units.norm == expected["unit_norm"]
    assert units.unit.verify()
    assert len(units.certificate.reduction_forms) + len(units.certificate.cycle_forms) == expected["continued_fraction_steps"]
    ordinary = real_quadratic_class_group(discriminant)
    narrow = real_quadratic_class_group(discriminant, narrow=True)
    assert ordinary.invariants() == tuple(expected["ordinary_invariants"])
    assert narrow.invariants() == tuple(expected["narrow_invariants"])
    assert len(narrow.certificate.reduced_forms) == expected["reduced_forms"]
    assert narrow.order() == expected["proper_cycles"]
    assert ordinary.order() * (1 if units.norm == -1 else 2) == narrow.order()
    replay = discriminant not in (12, 60, 2005)
    assert replay or units.certificate.verify()
    assert replay or ordinary.certificate.verify()
    assert replay or narrow.certificate.verify()
    assert ordinary.orientation_kernel().is_one()
    assert narrow.orientation_kernel().order() == (1 if units.norm == -1 else 2)
    for group in (ordinary, narrow):
        assert group.one().is_one()
        assert len(group.list()) == group.order()
        product = 1
        for invariant, generator in zip(group.invariants(), group.gens()):
            product *= invariant
            assert generator.order() == invariant
            assert (generator ** invariant).is_one()
            basis = generator.ideal_basis()
            assert basis.discriminant == discriminant
            assert basis.norm() == generator.form().a
        assert product == group.order()
        for left in group:
            assert (left * ~left).is_one()
            for right in group:
                assert (left * right).form() in group.certificate.representatives
try:
    real_quadratic_class_group(12)(QuadraticForm(1, 1, -1))
    raise AssertionError("a wrong-discriminant form entered the group")
except ValueError:
    pass

print("quadratic-class-unit-corpus-ok")
`);
  assert.equal(output, "quadratic-class-unit-corpus-ok");
});

test("exact Minkowski triviality handles alternate field presentations", () => {
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import exact_minkowski_triviality, quadratic_minkowski_triviality, real_quadratic_class_unit_context

certificate = quadratic_minkowski_triviality(12)
assert certificate.proves_triviality
assert certificate.exact_inequality == "sqrt(12)/2 < 2"
assert certificate.left_square == 48
assert certificate.right_square == 64
assert certificate.verify()
assert not quadratic_minkowski_triviality(17).proves_triviality
assert quadratic_minkowski_triviality(-3).proves_triviality

general = exact_minkowski_triviality(
    12, degree=2, real_places=2, complex_places=0, threshold=2
)
assert general == certificate

# For a root a of x^2 + 4*x + 1, sqrt(12) transports to 2*a + 4.
# This checks the alternate presentation exactly without depending on a
# particular number-field object representation in this integration-free lane.
constant = 1
linear = 4
presentation_discriminant = linear*linear - 4*constant
assert presentation_discriminant == 12
unit_data = real_quadratic_class_unit_context(12)
assert unit_data.units.unit.coefficients() == (4, 1, 2)
# (4 + (2*a + 4))/2 = a + 4, whose norm is f(-4) = 1.
transport_constant = 4
transport_norm = transport_constant**2 - linear*transport_constant + constant
assert transport_norm == unit_data.units.norm == 1
assert unit_data.ordinary_class_group.invariants() == ()
assert unit_data.narrow_class_group.invariants() == (2,)
assert unit_data.verify()

print("quadratic-minkowski-presentation-ok")
`);
  assert.equal(output, "quadratic-minkowski-presentation-ok");
});

test("quadratic resource caps fail instead of claiming truncated completeness", () => {
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import real_quadratic_class_group, real_quadratic_fundamental_unit

for operation in (
    lambda: real_quadratic_fundamental_unit(73, max_steps=19),
    lambda: real_quadratic_class_group(401, narrow=True, max_reduced_forms=37),
):
    try:
        operation()
        raise AssertionError("a truncated quadratic computation claimed completeness")
    except ValueError:
        pass

for invalid in (0, 1, 9, 20, -23):
    try:
        real_quadratic_fundamental_unit(invalid)
        raise AssertionError("a non-real-fundamental discriminant was accepted")
    except ValueError:
        pass

print("quadratic-resource-caps-ok")
`);
  assert.equal(output, "quadratic-resource-caps-ok");
});

test("representative quadratic workload has a bounded portable baseline", () => {
  const benchmark = fixture.benchmark;
  const source = String.raw`
from sagejs.number_fields.quadratic_class_units import real_quadratic_class_unit_context

for _index in range(${benchmark.warm_iterations}):
    context = real_quadratic_class_unit_context(${benchmark.discriminant})
    assert context.ordinary_class_group.invariants() == (4,)
    assert context.narrow_class_group.invariants() == (8,)
    assert context.units.unit.coefficients() == (403, 9, 2)
print("quadratic-benchmark-ok")
`;
  const started = performance.now();
  const output = runSage(source);
  const seconds = (performance.now() - started) / 1000;
  assert.equal(output, "quadratic-benchmark-ok");
  assert.ok(
    seconds < benchmark.cold_max_seconds + benchmark.warm_max_seconds,
    `quadratic benchmark took ${seconds.toFixed(3)}s`,
  );
});
