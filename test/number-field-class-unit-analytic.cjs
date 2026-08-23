"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const modulePath = join(
  root,
  "src/lib/sagejs/number_fields/class_unit_analytic.py",
);
const nativePath = join(root, "src/lib/sagejs/native.py");
const zetaKernelPath = join(
  root,
  "src/lib/sagejs/number_fields/zeta_coefficient_kernel.py",
);
const fixturePath = join(
  root,
  "test/fixtures/number-field-class-unit-analytic.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

function runPython(witness, timeout = 120_000) {
  const bootstrap = String.raw`
import importlib.util
import json
import sys
import types

sagejs = types.ModuleType("sagejs")
number_fields = types.ModuleType("sagejs.number_fields")
ffi_package = types.ModuleType("sagejs.ffi")
ffi_flint = types.ModuleType("sagejs.ffi.flint")
def unavailable_integer_log_sqrt_balls(*_args):
    raise RuntimeError("declared FLINT is unavailable in the CPython oracle")
ffi_flint.integer_log_sqrt_balls_packed = unavailable_integer_log_sqrt_balls
ffi_package.flint = ffi_flint
sagejs.number_fields = number_fields
sagejs.ffi = ffi_package
sys.modules["sagejs"] = sagejs
sys.modules["sagejs.number_fields"] = number_fields
sys.modules["sagejs.ffi"] = ffi_package
sys.modules["sagejs.ffi.flint"] = ffi_flint
for dependency_name, dependency_path in [
    ("sagejs.native", ${JSON.stringify(nativePath)}),
    ("sagejs.number_fields.zeta_coefficient_kernel", ${JSON.stringify(zetaKernelPath)}),
]:
    dependency_spec = importlib.util.spec_from_file_location(
        dependency_name, dependency_path
    )
    dependency = importlib.util.module_from_spec(dependency_spec)
    sys.modules[dependency_name] = dependency
    dependency_spec.loader.exec_module(dependency)

spec = importlib.util.spec_from_file_location(
    "sagejs.number_fields.class_unit_analytic",
    ${JSON.stringify(modulePath)},
)
module = importlib.util.module_from_spec(spec)
sys.modules["sagejs.number_fields.class_unit_analytic"] = module
spec.loader.exec_module(module)
for exported_name in module.__all__:
    globals()[exported_name] = getattr(module, exported_name)
fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
`;
  const result = spawnSync(pythonExecutable(), ["-I", "-c", `${bootstrap}\n${witness}`], {
    cwd: root,
    encoding: "utf8",
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function runSagejs(witness, timeout = 120_000) {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin/sagejs"), "--python", "-"],
    {
      cwd: root,
      encoding: "utf8",
      input: witness,
      timeout,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

test("relation dependencies expose exact kernel and saturation states", () => {
  const output = runPython(String.raw`
relations = [[2, 0], [0, 3], [2, 3]]
complete = extract_unit_lattice(relations, [[-1, -1, 1]], expected_rank=1)
assert complete.verify()
assert complete.exact_kernel and complete.saturated
assert complete.saturation_index == 1

index_two = extract_unit_lattice(relations, [[-2, -2, 2]], expected_rank=1)
assert index_two.exact_kernel and not index_two.saturated
assert index_two.saturation_index == 2

try:
    extract_unit_lattice(relations, [[-1, 0, 1]])
    raise AssertionError("a false relation dependency was accepted")
except UnitLatticeError:
    pass

class SaturationCertificate:
    def __init__(self, expected_prime):
        self.expected_prime = expected_prime
    def verify(self, lattice, prime, saturated):
        return lattice.verify() and prime == self.expected_prime and saturated

evidence = UnitSaturationEvidence(
    2,
    True,
    method="exact-local-pth-root-obstruction",
    certificate=SaturationCertificate(2),
    rigorous=True,
    precision_history=[32, 64, 128],
    decisive_precision_bits=128,
)
saturation = validate_unit_saturation(complete, [evidence], required_primes=[2])
assert saturation.rigorous and saturation.saturated

unchecked = UnitSaturationEvidence(
    3,
    True,
    method="search-found-no-root",
    certificate=None,
    rigorous=False,
)
assert not validate_unit_saturation(complete, [unchecked]).rigorous
stale_precision = UnitSaturationEvidence(
    5, True, method="exact-local-pth-root-obstruction",
    certificate=SaturationCertificate(5), rigorous=True,
    precision_history=[32, 64], decisive_precision_bits=32,
)
assert not validate_unit_saturation(complete, [stale_precision]).rigorous
try:
    UnitSaturationEvidence(
        7, True, method="invalid-history",
        certificate=SaturationCertificate(7), rigorous=True,
        precision_history=[32, 96], decisive_precision_bits=96,
    )
    raise AssertionError("a nondoubling saturation retry was accepted")
except ValueError:
    pass
try:
    UnitSaturationEvidence(
        7, False, method="missing-enlargement",
        certificate=SaturationCertificate(7), rigorous=True,
        precision_history=[32], decisive_precision_bits=32,
    )
    raise AssertionError("nonmaximal evidence omitted its enlargement index")
except ValueError:
    pass

# Resource preflight must terminate before touching field/order operations.
huge_index = (1 << 4096) - 159
bounded_factorization = saturate_unit_lattice(
    None,
    None,
    [],
    huge_index,
    maximum_saturation_work=8,
)
assert not bounded_factorization.complete
assert not bounded_factorization.factorization_complete
assert bounded_factorization.factorization_work <= 8
assert bounded_factorization.factorization_remaining > 1
assert "factorization" in bounded_factorization.incomplete_reason
class DegreeOnlyField:
    def degree(self):
        return 2
oversized_evidence = bounded_factorization.to_dict()
oversized_evidence["evidence"] = [{}] * 4097
assert not verify_saturation_evidence(
    DegreeOnlyField(), None, [], oversized_evidence
)

cancel_polls = []
def cancel_factorization():
    cancel_polls.append(1)
    return len(cancel_polls) == 4
try:
    saturate_unit_lattice(
        None,
        None,
        [],
        huge_index,
        maximum_saturation_work=1000,
        cancelled=cancel_factorization,
    )
    raise AssertionError("unit-index factorization ignored cancellation")
except AnalyticResourceError:
    pass

assert module._checked_power_at_most(2, 1000000, 100, None) is None
assert module._checked_power_at_most(1000000, 1000000, 100, None) is None
power_factors, power_cofactor, power_complete, power_work = (
    module._bounded_prime_divisors(1 << 100000, 100, None)
)
assert power_factors == ()
assert power_cofactor == 1 << 100000
assert not power_complete and power_work == 0

determinant_provider_calls = []
def forbidden_high_rank_provider(precision):
    determinant_provider_calls.append(precision)
    raise AssertionError("high-rank determinant preflight called its provider")
try:
    certified_regulator_enclosure(
        forbidden_high_rank_provider,
        63,
        maximum_determinant_states=65536,
    )
    raise AssertionError("an exponential rank-63 determinant was attempted")
except AnalyticResourceError:
    pass
assert determinant_provider_calls == []
print("unit-lattice-ok")
`);
  assert.equal(output, "unit-lattice-ok");
});

test("BF plan aggregation and bounded provenance preserve exact intervals", () => {
  runPython(String.raw`
module._shared_integer_log_endpoints.clear()
module._shared_integer_sqrt_endpoints.clear()
module._shared_bf_packed_layouts.clear()
first_shared_field = IntervalBallField(128)
first_log = first_shared_field.log_integer(37)
first_sqrt = first_shared_field.sqrt_integer(37)
expected_log = first_log.to_dict()
expected_sqrt = first_sqrt.to_dict()
# Cached state is immutable endpoint data rather than these mutable objects.
first_log.lower = RationalEndpoint(-1000)
first_sqrt.upper = RationalEndpoint(1000)
second_shared_field = IntervalBallField(128)
assert second_shared_field.log_integer(37).to_dict() == expected_log
assert second_shared_field.sqrt_integer(37).to_dict() == expected_sqrt
shared_diagnostics = second_shared_field.diagnostics()
assert shared_diagnostics["log_cache_hits"] == 1
assert shared_diagnostics["sqrt_cache_hits"] == 1

from sagejs.native import (
    integer_buffer_values,
    kernel_integer_buffer,
    kernel_integer_zeros,
)
from sagejs.number_fields.zeta_coefficient_kernel import (
    assemble_bf_integer_transcendental_endpoints,
)
transcendental_values = list(range(1, 258)) + [1009, 4093, 8191, 24039, 999983]
for precision in (64, 96, 128, 160, 256):
    module._shared_integer_log_endpoints.clear()
    module._shared_integer_sqrt_endpoints.clear()
    scalar_field = IntervalBallField(precision)
    expected = []
    for value in transcendental_values:
        expected.extend(module._dyadic_mantissas(
            scalar_field.log_integer(value), precision
        ))
        expected.extend(module._dyadic_mantissas(
            scalar_field.sqrt_integer(value), precision
        ))
    packed_values = kernel_integer_buffer(
        assemble_bf_integer_transcendental_endpoints, transcendental_values
    )
    output = kernel_integer_zeros(
        assemble_bf_integer_transcendental_endpoints,
        4 * len(transcendental_values),
        max(8, (precision + 511) // 64),
    )
    assert assemble_bf_integer_transcendental_endpoints(
        output, packed_values, precision
    )
    assert list(integer_buffer_values(output)) == expected

def reference_plan(threshold, splitting):
    ninth = threshold // 9
    aggregated = {}
    raw_terms = 0
    def add(sign, scale, norm, exponent):
        nonlocal raw_terms
        raw_terms += 1
        key = (scale, norm, exponent)
        aggregated[key] = aggregated.get(key, 0) + sign
    for prime, factors in splitting.items():
        for exponent in range(1, module._max_power_strict(prime, threshold) + 1):
            add(-1, 0, prime, exponent)
        for _ramification, residue_degree in factors:
            norm = prime**residue_degree
            for exponent in range(
                1, module._max_power_strict(norm, threshold) + 1
            ):
                add(1, 0, norm, exponent)
        if prime < ninth:
            for exponent in range(
                1, module._max_power_strict(prime, ninth) + 1
            ):
                add(1, 1, prime, exponent)
            for _ramification, residue_degree in factors:
                norm = prime**residue_degree
                for exponent in range(
                    1, module._max_power_strict(norm, ninth) + 1
                ):
                    add(-1, 1, norm, exponent)
    terms = [
        (multiplicity, scale, norm, exponent)
        for (scale, norm, exponent), multiplicity in sorted(aggregated.items())
        if multiplicity
    ]
    return module._BFPrimePowerPlan(threshold, terms, raw_terms)

def reference_finite_term(plan, field):
    threshold = plan.threshold
    ninth = threshold // 9
    sqrt_threshold = field.sqrt_integer(threshold)
    sqrt_ninth = field.sqrt_integer(ninth)
    scales = (
        sqrt_threshold * field.log_integer(threshold),
        sqrt_ninth * field.log_integer(ninth),
    )
    total = RealBall(0, precision_bits=field.precision_bits)
    log_cache = {}
    sqrt_cache = {}
    for multiplicity, scale_index, norm, exponent in plan.terms:
        summand = module._bf_prime_power_summand(
            norm,
            exponent,
            scales[scale_index],
            field,
            log_cache,
            sqrt_cache,
        )
        if multiplicity != 1:
            summand = summand * RealBall(
                multiplicity, precision_bits=field.precision_bits
            )
        total = total + summand
    multiplier = RealBall(3, precision_bits=field.precision_bits) / (
        RealBall(2, precision_bits=field.precision_bits)
        * sqrt_threshold
        * field.log_integer(3 * threshold)
    )
    return multiplier * total

splitting = {
    2: ((1, 1), (1, 4)),
    3: ((1, 2), (1, 3)),
    5: ((1, 5),),
    7: ((1, 1), (2, 2)),
    11: ((1, 1), (1, 1), (1, 3)),
    13: ((1, 5),),
}
threshold = 729
old_plan = reference_plan(threshold, splitting)
new_plan = module._build_bf_plan(threshold, splitting)
assert old_plan.raw_terms == new_plan.raw_terms
assert old_plan.terms == new_plan.terms

old_finite = reference_finite_term(old_plan, IntervalBallField(128))
scalar_finite = module._bf_finite_term_scalar(
    new_plan, IntervalBallField(128)
)
kernel_field = IntervalBallField(128)
new_finite = module._bf_finite_term(new_plan, kernel_field)
assert old_finite.lower == new_finite.lower
assert old_finite.upper == new_finite.upper
assert old_finite.precision_bits == new_finite.precision_bits
assert old_finite.rigorous == new_finite.rigorous
assert scalar_finite.to_dict() == new_finite.to_dict()
assert kernel_field.diagnostics()["bf_dyadic_kernel_successes"] == 1
assert kernel_field.diagnostics()["bf_dyadic_kernel_fallbacks"] == 0
assert len(new_finite.source) < 512
assert "exact outward integer transcendental rounding" in new_finite.source
assert kernel_field.diagnostics()["bf_transcendental_kernel_successes"] == 1
module._shared_integer_log_endpoints.clear()
module._shared_integer_sqrt_endpoints.clear()
module._shared_bf_packed_layouts.clear()
zeta_kernel_module = sys.modules[
    "sagejs.number_fields.zeta_coefficient_kernel"
]
zeta_kernel_module.assemble_bf_integer_transcendental_endpoints_flint = None
fallback_field = IntervalBallField(128)
fallback_finite = module._bf_finite_term(new_plan, fallback_field)
assert fallback_field.diagnostics()["bf_flint_transcendental_calls"] == 0
assert fallback_field.diagnostics()["bf_transcendental_kernel_successes"] == 1
assert fallback_finite.to_dict() == scalar_finite.to_dict()
repeat_field = IntervalBallField(128)
repeat_finite = module._bf_finite_term(new_plan, repeat_field)
assert repeat_finite.to_dict() == fallback_finite.to_dict()
repeat_diagnostics = repeat_field.diagnostics()
assert repeat_diagnostics["bf_packed_layout_cache_hits"] == 1
assert repeat_diagnostics["bf_transcendental_kernel_calls"] == 0

# Precision escalation must preserve the full serialized proof object, not
# merely overlap numerically with the scalar oracle.
for precision in (64, 96, 160, 256):
    scalar = module._bf_finite_term_scalar(
        new_plan, IntervalBallField(precision)
    )
    accelerated_field = IntervalBallField(precision)
    accelerated = module._bf_finite_term(new_plan, accelerated_field)
    assert accelerated.to_dict() == scalar.to_dict()
    diagnostics = accelerated_field.diagnostics()
    assert diagnostics["bf_dyadic_kernel_calls"] == 1
    assert diagnostics["bf_dyadic_kernel_successes"] == 1

import builtins
original_import = builtins.__import__
def without_dyadic_kernel(name, *args, **kwargs):
    if name == "sagejs.number_fields.zeta_coefficient_kernel":
        raise ImportError("focused unavailable-kernel witness")
    return original_import(name, *args, **kwargs)
builtins.__import__ = without_dyadic_kernel
try:
    fallback_field = IntervalBallField(128)
    fallback = module._bf_finite_term(new_plan, fallback_field)
finally:
    builtins.__import__ = original_import
assert fallback.to_dict() == scalar_finite.to_dict()
assert fallback_field.diagnostics()["bf_dyadic_kernel_calls"] == 0
assert fallback_field.diagnostics()["bf_dyadic_kernel_fallbacks"] == 1

certificate = UnitSaturationIndexCertificate(
    {"field": "focused-provenance-test"},
    [],
    {},
    1,
    {"finite_term": new_finite.to_dict()},
    {"generation": "focused-provenance-test"},
    "exact-relations-conditional-grh",
)
original_certificate_payload = certificate.to_dict()
mutated = certificate.to_dict()
mutated["analytic_proof"]["finite_term"]["source"] = "forged-provenance"
mutated["generation_evidence"]["generation"] = "forged-generation"
assert certificate.to_dict() == original_certificate_payload
exposed_generation = certificate.generation_evidence
exposed_generation["generation"] = "another-forgery"
assert certificate.to_dict() == original_certificate_payload
try:
    UnitSaturationIndexCertificate.from_dict(mutated)
    raise AssertionError("a finite-term provenance mutation retained authority")
except AnalyticCertificationError:
    pass
  `);
});

test("weighted logarithm determinants give certified regulator balls", () => {
  const output = runPython(String.raw`
quadratic = fixture["fields"][0]
quadratic_rows = [[RealBall(
    quadratic["weightedLogarithms"][0][0],
    quadratic["weightedLogarithms"][0][1],
    precision_bits=160, rigorous=True,
    source="Sage/PARI offline embedding enclosure",
)]]
quadratic_regulator = certified_regulator_enclosure(
    quadratic_rows,
    1,
    precision_bits=160,
    absolute_tolerance_bits=120,
)
assert quadratic_regulator.rigorous
assert quadratic_regulator.ball.contains(quadratic["regulator"])

cubic = fixture["fields"][2]
cubic_rows = []
for row in cubic["weightedLogarithms"]:
    cubic_rows.append([
        RealBall.midpoint_radius(
            entry, "0.000000000000000000000000000001",
            precision_bits=140,
            source="Sage/PARI offline embedding enclosure",
        )
        for entry in row
    ])
cubic_regulator = certified_regulator_enclosure(
    cubic_rows,
    2,
    precision_bits=140,
    absolute_tolerance_bits=90,
)
assert cubic_regulator.rigorous
assert cubic_regulator.ball.contains(cubic["regulator"])

calls = []
def escalating_provider(precision):
    calls.append(precision)
    if precision == 64:
        return [[RealBall("-1", "1", precision_bits=precision)]]
    return [[RealBall("0.48", "0.49", precision_bits=precision)]]
refined = certified_regulator_enclosure(
    escalating_provider, 1, precision_bits=64,
    absolute_tolerance_bits=5, maximum_precision_bits=128,
)
assert calls == [64, 128]
assert refined.precision_history == (64, 128)
assert refined.precision_bits == 128
assert len(refined.determinant_widths) == 2

# A narrow high-precision refinement must not be rounded back to the initial
# precision before taking the determinant.
precision_calls = []
def precision_intersection_provider(precision):
    precision_calls.append(precision)
    return [[RealBall.midpoint_radius(
        "0.5", RationalEndpoint(1, 2 ** (precision - 4)),
        precision_bits=precision,
    )]]
precision_refined = certified_regulator_enclosure(
    precision_intersection_provider, 1, precision_bits=16,
    absolute_tolerance_bits=40, maximum_precision_bits=128,
)
assert precision_calls == [16, 32, 64]
assert precision_refined.precision_bits == 64
assert precision_refined.ball.radius() <= RationalEndpoint(1, 2**40)

dyadic = RealBall.dyadic_endpoints("-3", "-4", "5", "-5", precision_bits=80)
assert dyadic.lower == RationalEndpoint(-3, 16)
assert dyadic.upper == RationalEndpoint(5, 32)

for numerator, denominator in ((1.5, 1), (True, 1), (1, 2.0), (1, False)):
    try:
        RationalEndpoint(numerator, denominator)
        raise AssertionError("a truncating rational endpoint was accepted")
    except TypeError:
        pass

for bad_value in ("01", "+1", "-0", "1.0", True, 1.0):
    try:
        RealBall.dyadic_endpoints(bad_value, "0", "1", "0")
        raise AssertionError("a noncanonical dyadic mantissa was accepted")
    except (TypeError, ValueError):
        pass
    try:
        RealBall.dyadic_endpoints("0", bad_value, "1", "0")
        raise AssertionError("a noncanonical dyadic exponent was accepted")
    except (TypeError, ValueError):
        pass

def inconsistent_provider(precision):
    if precision == 64:
        return [[RealBall("-0.1", "0.1", precision_bits=precision)]]
    return [[RealBall("0.48", "0.49", precision_bits=precision)]]
try:
    certified_regulator_enclosure(
        inconsistent_provider, 1, precision_bits=64,
        absolute_tolerance_bits=5, maximum_precision_bits=128,
    )
    raise AssertionError("disjoint refinement balls were accepted")
except AnalyticCertificationError:
    pass

try:
    certified_regulator_enclosure([[0.48]], 1)
    raise AssertionError("a binary64 midpoint certified a regulator")
except AnalyticCertificationError:
    pass
print("regulator-ok")
`);
  assert.equal(output, "regulator-ok");
});

test("Belabas-Friedman tails and hR give a rigorous index-one result", () => {
  const output = runPython(String.raw`
def is_prime(value):
    if value < 2:
        return False
    divisor = 2
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 1
    return True

def quadratic_character(discriminant, prime):
    if discriminant % prime == 0:
        return 0
    if prime == 2:
        residue = discriminant % 8
        return 1 if residue in (1, 7) else -1
    symbol = pow(discriminant % prime, (prime - 1) // 2, prime)
    return -1 if symbol == prime - 1 else symbol

def quadratic_provider(discriminant):
    def provider(start, stop):
        records = []
        for prime in range(max(2, start), stop):
            if not is_prime(prime):
                continue
            character = quadratic_character(discriminant, prime)
            if character == 0:
                factors = [(2, 1)]
            elif character == 1:
                factors = [(1, 1), (1, 1)]
            else:
                factors = [(1, 2)]
            records.append({"prime": prime, "factors": factors})
        return records
    return provider

# The maximal-order provider may expose the same exact local factors in the
# private packed shape used by zeta-coefficient construction.  The analytic
# workspace must validate that shape without touching the nested-record
# fallback, and reject even a one-prime reordering.
class PackedProvider:
    def __init__(self):
        self.public_calls = 0
        self.packed_calls = 0
        self.primes = [2, 3, 5]
    def splitting_records(self, _start, _stop):
        self.public_calls += 1
        raise AssertionError("the packed splitting path fell back")
    def _zeta_factor_degree_data(self, start, stop):
        self.packed_calls += 1
        return {
            "degree": 2,
            "intervalStart": start,
            "intervalStop": stop,
            "completePrimeInterval": True,
            "primes": list(self.primes),
            "factorCounts": [1, 2, 1],
            "exponents": [1, 0, 1, 1, 2, 0],
            "degrees": [2, 0, 1, 1, 1, 0],
        }

packed_provider = PackedProvider()
packed_workspace = ZetaLogResidueWorkspace(
    5, 2, packed_provider.splitting_records
)
assert packed_workspace.splitting_types([2, 3, 5], 4096) == {
    2: ((1, 2),),
    3: ((1, 1), (1, 1)),
    5: ((2, 1),),
}
assert packed_provider.packed_calls == 1
assert packed_provider.public_calls == 0
packed_provider.primes = [2, 5, 3]
try:
    module._packed_splitting_block(
        packed_provider.splitting_records, 2, 6, [2, 3, 5], 2
    )
    raise AssertionError("reordered packed splitting data was accepted")
except AnalyticCertificationError:
    pass

# Floating-point cutoff location is only a proposal: the accelerated search
# must reproduce the exact minimal threshold and its outward interval, while
# using exactly two certified evaluations on representative quadratic and
# cubic discriminants.
for discriminant, degree, maximum in ((5, 2, 20000), (283, 3, 1000000), (1083, 3, 1000000)):
    target = RationalEndpoint(1, 16)
    accelerated_model = module._BFErrorModel(
        discriminant, degree, IntervalBallField(96)
    )
    exact_model = module._BFErrorModel(discriminant, degree, IntervalBallField(96))
    accelerated = module._bf_threshold(accelerated_model, target, maximum)
    exact = module._bf_threshold_exact(exact_model, target, maximum)
    assert accelerated[0] == exact[0]
    assert accelerated[1].to_dict() == exact[1].to_dict()
    assert accelerated_model.evaluations == 2
    assert exact_model.evaluations > accelerated_model.evaluations

for field in fixture["fields"][:2]:
    enclosure = zeta_log_residue_bound(
        field["discriminant"],
        2,
        quadratic_provider(field["discriminant"]),
        absolute_error="0.125",
        precision_bits=96,
        limits=ZetaLogResidueLimits(maximum_prime_bound=20000),
    )
    assert enclosure.rigorous
    assert enclosure.ball.contains(field["logResidue"])
    assert enclosure.tail_bound.upper < RationalEndpoint(1, 16)
    assert enclosure.rational_primes > 100

quadratic = fixture["fields"][0]
regulator = RegulatorEnclosure(
    RealBall(
        "0.48121182505960344", "0.48121182505960346",
        precision_bits=120,
    ),
    1,
    [120],
    weighted_complex_places=True,
)
provider_calls = []
base_provider = quadratic_provider(5)
def counted_provider(start, stop):
    provider_calls.append((start, stop))
    return base_provider(start, stop)
workspace = ZetaLogResidueWorkspace(5, 2, counted_provider)
zeta = zeta_log_residue_bound(
    5,
    2,
    counted_provider,
    absolute_error="0.125",
    precision_bits=96,
    limits=ZetaLogResidueLimits(maximum_prime_bound=20000),
    workspace=workspace,
)
calls_after_cold = len(provider_calls)
warm_zeta = zeta_log_residue_bound(
    5, 2, counted_provider, absolute_error="0.125", precision_bits=96,
    limits=ZetaLogResidueLimits(maximum_prime_bound=20000),
    workspace=workspace,
)
assert len(provider_calls) == calls_after_cold
assert warm_zeta.diagnostics["provider_calls"] == 0
assert warm_zeta.diagnostics["splitting_cache_hits"] == 1
assert warm_zeta.diagnostics["prime_enumeration_cache_hits"] == 1
assert warm_zeta.diagnostics["prime_power_plan_cache_hits"] == 1
assert warm_zeta.diagnostics["threshold_cache_hits"] == 1
assert warm_zeta.diagnostics["finite_term_cache_hits"] == 1
assert warm_zeta.diagnostics["threshold_bound_evaluations"] == 0
assert zeta.aggregated_prime_power_terms < zeta.prime_power_terms
assert zeta.aggregated_prime_power_terms == 800
assert zeta.prime_power_terms == 1534
assert warm_zeta.ball.contains(quadratic["logResidue"])
assert warm_zeta.ball.to_dict() == zeta.ball.to_dict()
assert workspace.diagnostics()["zeta_residue_calls"] == 2
assert workspace.diagnostics()["splitting_nanoseconds"] >= 0

class FakeCoordinate:
    def __init__(self, numerator, denominator=1):
        self._numerator = numerator
        self._denominator = denominator

class FakeElement:
    def __init__(self, numerator):
        self.numerator = numerator
    def list(self):
        return [FakeCoordinate(self.numerator), FakeCoordinate(0)]

class CountedFactoredUnit:
    def __init__(self, numerator):
        self.element = FakeElement(numerator)
        self.calls = []
    def evaluate(self):
        return self.element
    def archimedean_logarithms(self, precision):
        self.calls.append(precision)
        return [RealBall("1", precision_bits=precision)]

counted_unit = CountedFactoredUnit(1)
cached_regulator = workspace.regulator_from_factored_units(
    [counted_unit], unit_rank=1, precision_bits=96,
    absolute_tolerance_bits=60, maximum_precision_bits=192,
)
warm_regulator = workspace.regulator_from_factored_units(
    [counted_unit], unit_rank=1, precision_bits=96,
    absolute_tolerance_bits=60, maximum_precision_bits=192,
)
assert cached_regulator.to_dict() == warm_regulator.to_dict()
assert counted_unit.calls == [96]
assert workspace.diagnostics()["regulator_calls"] == 2
assert workspace.diagnostics()["regulator_cache_hits"] == 1
try:
    workspace.regulator_from_factored_units(
        [counted_unit], unit_rank=1, precision_bits=96,
        absolute_tolerance_bits=60, maximum_precision_bits=192,
        cancelled=lambda: True,
    )
    raise AssertionError("a warm regulator cache ignored cancellation")
except AnalyticResourceError:
    pass

escalating_workspace = ZetaLogResidueWorkspace(5, 2, counted_provider)
refined_zeta = zeta_log_residue_bound(
    5, 2, counted_provider, absolute_error="0.05", precision_bits=16,
    limits=ZetaLogResidueLimits(
        maximum_prime_bound=100000, maximum_precision_bits=128,
    ),
    workspace=escalating_workspace,
)
assert refined_zeta.precision_history == (16, 32)
assert refined_zeta.refinement_attempts == 2
assert refined_zeta.enclosure_widths[1] < refined_zeta.enclosure_widths[0]
assert refined_zeta.diagnostics["splitting_cache_hits"] == 1

try:
    zeta_log_residue_bound(
        5, 2, quadratic_provider(5), absolute_error="0.125",
        limits=ZetaLogResidueLimits(maximum_prime_bound=20000),
        workspace=workspace,
    )
    raise AssertionError("a workspace accepted a different provider identity")
except AnalyticCertificationError:
    pass
try:
    zeta_log_residue_bound(
        13, 2, counted_provider, absolute_error="0.125",
        limits=ZetaLogResidueLimits(maximum_prime_bound=20000),
        workspace=workspace,
    )
    raise AssertionError("a workspace accepted a different discriminant")
except AnalyticCertificationError:
    pass
validation = validate_hr_index(
    signature=(2, 0),
    discriminant=5,
    class_number=1,
    roots_of_unity=2,
    regulator=regulator,
    zeta_log_residue=zeta,
    precision_bits=128,
)
assert validation.rigorous and validation.index_one
assert validation.lower_index == validation.upper_index == 1

forged = validate_hr_index(
    signature=(2, 0), discriminant=5, class_number=2, roots_of_unity=2,
    regulator=regulator, zeta_log_residue=zeta, precision_bits=128,
)
assert forged.rigorous and forged.unique_index == 2 and not forged.index_one

try:
    zeta_log_residue_bound(
        5, 2, lambda start, stop: [], absolute_error="0.125",
        limits=ZetaLogResidueLimits(maximum_prime_bound=20000),
    )
    raise AssertionError("an incomplete splitting stream certified a zeta bound")
except AnalyticCertificationError:
    pass
print("analytic-index-ok")
`, 180_000);
  assert.equal(output, "analytic-index-ok");
});

test("declared FLINT integer balls agree with independent rigorous endpoints", () => {
  const output = runSagejs(String.raw`
import sagejs.native as native_module
import sagejs.number_fields.zeta_coefficient_kernel as kernel_module
from sagejs.number_fields.class_unit_analytic import (
    IntervalBallField,
    _dyadic_mantissas,
    _primes_below,
)

assert _primes_below(30) == [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]

flint_kernel = kernel_module.assemble_bf_integer_transcendental_endpoints_flint
source_kernel = kernel_module.assemble_bf_integer_transcendental_endpoints
assert native_module.is_compiled(flint_kernel)
assert native_module.is_compiled(source_kernel)
values = list(range(1, 34)) + [1009, 4093, 8191, 24039, 999983]
for precision in [64, 96, 128, 160, 256]:
    packed_values = native_module.kernel_integer_buffer(flint_kernel, values)
    flint_output = native_module.kernel_integer_zeros(
        flint_kernel, 4 * len(values), 8
    )
    source_output = native_module.kernel_integer_zeros(
        source_kernel, 4 * len(values), 8
    )
    assert flint_kernel(flint_output, packed_values, precision)
    source_values = native_module.kernel_integer_buffer(source_kernel, values)
    assert source_kernel(source_output, source_values, precision)
    flint_endpoints = native_module.integer_buffer_values(flint_output)
    source_endpoints = native_module.integer_buffer_values(source_output)
    field = IntervalBallField(precision)
    for index, value in enumerate(values):
        offset = 4 * index
        log_lower, log_upper = _dyadic_mantissas(
            field.log_integer(value), precision
        )
        sqrt_lower, sqrt_upper = _dyadic_mantissas(
            field.sqrt_integer(value), precision
        )
        assert flint_endpoints[offset] <= log_upper
        assert log_lower <= flint_endpoints[offset + 1]
        assert flint_endpoints[offset + 2] <= sqrt_upper
        assert sqrt_lower <= flint_endpoints[offset + 3]
        assert flint_endpoints[offset] <= source_endpoints[offset + 1]
        assert source_endpoints[offset] <= flint_endpoints[offset + 1]
        assert flint_endpoints[offset + 2] <= source_endpoints[offset + 3]
        assert source_endpoints[offset + 2] <= flint_endpoints[offset + 3]

bad_values = native_module.kernel_integer_buffer(flint_kernel, [0])
bad_output = native_module.kernel_integer_zeros(flint_kernel, 4, 8)
try:
    flint_kernel(bad_output, bad_values, 128)
    raise AssertionError("FLINT accepted a nonpositive integer")
except ValueError:
    pass
print("ok")
`);
  assert.equal(output, "ok");
});
