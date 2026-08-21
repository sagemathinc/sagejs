"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { performance } = require("node:perf_hooks");

const root = join(__dirname, "..");
function sagejsInvocation(args) {
  if (process.env.SAGEJS_TEST_EXECUTABLE) {
    return [process.env.SAGEJS_TEST_EXECUTABLE, args];
  }
  if (process.platform === "win32") {
    return [process.execPath, [join(root, "bin", "sagejs-source.cjs"), ...args]];
  }
  return [join(root, "bin", "sagejs"), args];
}
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "number-field-quadratic-class-units.json"),
    "utf8",
  ),
);

function runSage(source) {
  const [executable, arguments_] = sagejsInvocation(["--python", "-"]);
  const result = spawnSync(executable, arguments_, {
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
  assert.equal(
    fixture.routing_benchmark.imaginary_forms_max_abs_discriminant,
    1000000007,
  );
  assert.equal(
    fixture.routing_benchmark.real_forms_default_max_enumeration_checks,
    5000000,
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

test("real quadratic class numbers stream cycles without group materialization", () => {
  const cases = JSON.stringify(fixture.cases);
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import real_quadratic_class_number

cases = ${cases}
for expected in cases:
    discriminant = expected["discriminant"]
    ordinary = real_quadratic_class_number(discriminant)
    narrow = real_quadratic_class_number(discriminant, narrow=True)
    expected_ordinary = 1
    for invariant in expected["ordinary_invariants"]:
        expected_ordinary *= invariant
    expected_narrow = 1
    for invariant in expected["narrow_invariants"]:
        expected_narrow *= invariant
    assert ordinary.order() == expected_ordinary
    assert narrow.order() == expected_narrow
    assert ordinary.certificate.reduced_forms_checked == expected["reduced_forms"]
    assert ordinary.certificate.proper_cycles == expected["proper_cycles"]
    assert not ordinary.materializes_all_reduced_forms
    assert not ordinary.plan.materializes_all_reduced_forms
    assert ordinary.proof_status == "exact-unconditional"
    if discriminant in (12, 60):
        assert ordinary.certificate.verify()
        assert narrow.certificate.verify()

# Public class-number requests use the streaming counter and leave the
# materializing real class-group backend untouched.  Narrow class numbers have
# the same independent path; requesting the group afterward still supplies its
# generators and invariant factors.
x = polygen(QQ, "x")
field = NumberField(x*x - 15, "a")
assert field.class_number() == 2
assert field.narrow_class_number() == 4
assert field.class_group().invariants() == (2,)
assert field.narrow_class_group().invariants() == (2, 2)

imaginary = NumberField(x*x + x + 6, "i")
assert imaginary.narrow_class_number() == imaginary.class_number() == 3

print("quadratic-streaming-class-number-ok")
`);
  assert.equal(output, "quadratic-streaming-class-number-ok");
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

test("public quadratic routing preserves signatures and ideal presentations", () => {
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import quadratic_form_from_ideal_lattice, real_quadratic_field_unit_group

x = polygen(QQ, "x")

# The real route is selected from the signature, including translated defining
# polynomials with the same maximal-order discriminant.
standard = NumberField(x*x - 15, "s")
translated = NumberField(x*x + 2*x - 14, "t")
for field in (standard, translated):
    assert field.signature() == (2, 0)
    assert field.discriminant() == 60
    group = field.class_group()
    assert group.invariants() == (2,)
    generator = group.gen()
    assert not generator.is_one()
    assert (generator**2).is_one()
    assert generator.ideal().number_field() is field
    units = real_quadratic_field_unit_group(field, algorithm="quadratic-forms")
    assert units.complete and units.unit_rank == 1
    assert units.algorithm == "principal-form-continued-fraction"
    assert units.proof_status == "exact-unconditional"
    assert units.generators[0].norm() == 1
    assert units.verify_completion()
    regulator = units.regulator(100)
    assert regulator.rigorous and regulator.full_rank_certified
    assert regulator.precision_bits >= 100

# D=12 is accepted through a translated integral presentation, and exact
# square-root transport gives the expected unit t + 4.
translated_twelve = NumberField(x*x + 4*x + 1, "u")
units_twelve = real_quadratic_field_unit_group(translated_twelve)
assert units_twelve.generators == (translated_twelve.gen() + 4,)
assert units_twelve.verify_completion()

# The existing public inverse map works in the canonical square-root
# presentation.
standard_group = standard.class_group()
standard_generator = standard_group.gen()
standard_ideal = standard_generator.ideal()
assert standard_group(standard_ideal) == standard_generator
assert not standard_ideal.is_principal()

# In the translated field t = -1 + sqrt(15), the same ideal is (2, t).
# Its coordinates in [1, sqrt(15)] are [(2, 0), (-1, 1)].  The backend helper
# is presentation-independent and supplies the exact form needed by the public
# adapter.
translated_generator = translated.class_group().gen()
assert translated_generator.ideal() == translated.ideal(2, translated.gen())
form = quadratic_form_from_ideal_lattice(60, ((2, 0), (-1, 1)))
assert form.coefficients() == (2, 2, -7)
assert translated.class_group()._group(form) == translated_generator._element

# Imaginary quadratic fields retain their established backend, also under a
# translated defining polynomial.
for polynomial in (x*x + x + 6, x*x + 3*x + 8):
    field = NumberField(polynomial, "i")
    assert field.signature() == (0, 1)
    assert field.discriminant() == -23
    group = field.class_group()
    assert group.invariants() == (3,)
    assert group.gen().ideal().number_field() is field
    assert (group.gen()**3).is_one()

print("quadratic-public-routing-ok")
`);
  assert.equal(output, "quadratic-public-routing-ok");
});

test("public quadratic certificates, narrow groups, and rigorous regulators", () => {
  const output = runSage(String.raw`
x = polygen(QQ, "x")

# D=12 is settled before any factor-base or reduced-form materialization, in
# both the square-root and translated presentations.
for polynomial in (x*x - 3, x*x + 4*x + 1):
    field = NumberField(polynomial, "a")
    ordinary = field.class_group()
    assert ordinary.order() == 1
    assert ordinary.algorithm == "minkowski"
    assert ordinary.proof_status == "exact-unconditional"
    assert ordinary.certificate.proves_triviality
    assert ordinary.certificate.exact_inequality == "sqrt(12)/2 < 2"
    assert ordinary.certificate.verify()
    assert ordinary.routing_plan.backend == "minkowski-triviality"
    assert not ordinary.routing_plan.materializes_all_reduced_forms
    assert ordinary.verify()
    narrow = field.narrow_class_group()
    assert narrow.invariants() == (2,)
    assert narrow.routing_plan.narrow
    assert narrow.routing_plan.backend == "quadratic-forms"
    generator = narrow.gen()
    assert narrow(generator.ideal()) == generator

# D=60 distinguishes ordinary and narrow groups and is stable under translation.
for polynomial in (x*x - 15, x*x + 2*x - 14):
    field = NumberField(polynomial, "b")
    assert field.class_group().invariants() == (2,)
    assert field.narrow_class_group().invariants() == (2, 2)

# The public regulator is an Arb-backed rational enclosure.  Increasing prec
# narrows the exact interval instead of returning another binary64 value.
field = NumberField(x*x + 4*x + 1, "u")
regulator_100 = field.regulator(100)
regulator_200 = field.regulator(200)
for regulator, precision in ((regulator_100, 100), (regulator_200, 200)):
    assert regulator.rigorous
    assert regulator.full_rank_certified
    assert regulator.ball.is_positive()
    assert regulator.precision_bits >= precision
    assert regulator.proof_status == "interval-certified-weighted-log-regulator"
assert regulator_200.ball.width() < regulator_100.ball.width()
assert regulator_100.ball.intersection(regulator_200.ball).is_positive()

print("quadratic-public-certificates-ok")
`);
  assert.equal(output, "quadratic-public-certificates-ok");
});

test("imaginary public ideal maps include inverses and fractional ideals", () => {
  const output = runSage(String.raw`
x = polygen(QQ, "x")

for polynomial in (x*x + x + 6, x*x + 3*x + 8):
    field = NumberField(polynomial, "i")
    group = field.class_group()
    generator = group.gen()
    ideal = generator.ideal()
    assert group(ideal) == generator
    assert group(~ideal) == ~generator
    assert group(ideal / 2) == generator
    assert not ideal.is_principal()
    assert not (~ideal).is_principal()
    assert (ideal * ~ideal).is_principal()
    assert (ideal / 2).ideal_class_log() == generator

# Imaginary fields with Minkowski bound below 2 use the same public certificate
# short circuit; every nonzero fractional ideal maps to the unique class.
eisenstein = NumberField(x*x + x + 1, "z")
trivial = eisenstein.class_group()
assert trivial.algorithm == "minkowski"
assert trivial.certificate.proves_triviality
principal = eisenstein.maximal_order().ideal(2)
assert trivial(principal / 3).is_one()
assert (principal / 3).is_principal()

print("quadratic-imaginary-ideal-maps-ok")
`);
  assert.equal(output, "quadratic-imaginary-ideal-maps-ok");
});

test("quadratic resource caps fail instead of claiming truncated completeness", () => {
  const output = runSage(String.raw`
from sagejs.number_fields.quadratic_class_units import is_fundamental_discriminant, real_quadratic_class_group, real_quadratic_class_group_plan, real_quadratic_fundamental_unit

plan = real_quadratic_class_group_plan(2005)
assert plan.algorithm == "quadratic-forms"
assert plan.root_floor == 44
assert plan.enumeration_checks == 484
assert plan.supported
assert plan.exact_integer_storage
assert plan.materializes_all_reduced_forms

group = real_quadratic_class_group(60, algorithm="quadratic-forms")
assert group.algorithm == "quadratic-forms"
assert group.plan.requested_algorithm == "quadratic-forms"
assert group.certificate.verify()
unit = real_quadratic_fundamental_unit(60, algorithm="quadratic-forms")
assert unit.requested_algorithm == "quadratic-forms"
assert unit.verify()

for algorithm in ("minkowski", "buchmann-hecke"):
    try:
        real_quadratic_class_group(60, algorithm=algorithm)
        raise AssertionError("an unavailable explicit algorithm was ignored")
    except NotImplementedError:
        pass
try:
    real_quadratic_fundamental_unit(60, algorithm="guess")
    raise AssertionError("an unknown algorithm was ignored")
except ValueError:
    pass

for operation in (
    lambda: real_quadratic_fundamental_unit(73, max_steps=19),
    lambda: real_quadratic_class_group(401, narrow=True, max_reduced_forms=37),
    lambda: real_quadratic_class_group(401, max_enumeration_checks=99),
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

# This is a fundamental discriminant strictly above signed 64-bit range.  Its
# primality certificate is covered by the deterministic unsigned-64-bit test;
# planning rejects exhaustive O(D) enumeration before attempting it.
large_discriminant = 9223372036854775868
assert large_discriminant > 2**63
assert is_fundamental_discriminant(large_discriminant)
large_plan = real_quadratic_class_group_plan(large_discriminant)
assert large_plan.exact_integer_storage and not large_plan.supported
try:
    real_quadratic_class_group(large_discriminant)
    raise AssertionError("an infeasible exhaustive computation did not fail fast")
except ValueError as error:
    assert "max_enumeration_checks" in str(error)

# Public routing never starts an enumerate-all computation outside its explicit
# measured/resource caps.  Auto selects the shared Buchmann--Hecke relation
# engine; explicitly demanding forms produces an inspectable unsupported plan
# and then fails before materialization.
x = polygen(QQ, "x")
real_field = NumberField(x*x - 15, "r")
real_auto = real_field.quadratic_class_group_plan(
    "auto", False, max_enumeration_checks=1
)
assert real_auto.backend == "buchmann-hecke"
assert real_auto.supported and not real_auto.materializes_all_reduced_forms
real_forced = real_field.quadratic_class_group_plan(
    "quadratic-forms", False, max_enumeration_checks=1
)
assert real_forced.backend == "quadratic-forms"
assert not real_forced.supported and real_forced.materializes_all_reduced_forms
try:
    real_field.class_number(
        algorithm="quadratic-forms", max_enumeration_checks=1
    )
    raise AssertionError("an explicitly capped real enumeration started")
except ValueError as error:
    assert "candidate estimate" in str(error)

boundary = NumberField(x*x + x + 250000002, "b")
assert boundary.discriminant() == -1000000007
boundary_plan = boundary.quadratic_class_group_plan()
assert boundary_plan.backend == "quadratic-forms"
assert boundary_plan.benchmark_threshold == 1000000007

beyond = NumberField(x*x - x + 250000022, "c")
assert beyond.discriminant() == -1000000087
beyond_plan = beyond.quadratic_class_group_plan()
assert beyond_plan.backend == "buchmann-hecke"
assert beyond_plan.supported
assert not beyond_plan.materializes_all_reduced_forms
assert "compare-quadratic-class-groups.cjs" in beyond_plan.benchmark_source
forced_beyond = beyond.quadratic_class_group_plan("quadratic-forms")
assert not forced_beyond.supported
try:
    beyond.class_number(algorithm="quadratic-forms")
    raise AssertionError("an imaginary enumeration exceeded its benchmark cap")
except ValueError as error:
    assert "benchmark" in str(error)

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
