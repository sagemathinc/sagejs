// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");

function run(source, timeout = 120_000) {
  const result = spawnSync(sagejs, ["--python", "-"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("exact roots of unity cover higher-degree totally imaginary fields", () => {
  const output = run(String.raw`
import json
import time

from sagejs.number_fields.units import (
    RootsOfUnityCertificate,
    RootsOfUnityResult,
    _element_key,
    roots_of_unity,
)

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = [
    (x**4 + 1, 8),
    (x**4 + x**3 + x**2 + x + 1, 10),
    (x**4 - x**2 + 1, 12),
    ((x - 1)**4 + 1, 8),
    (x**4 - x + 1, 2),
]
answer = []
for polynomial, expected_order in cases:
    K = NumberField(polynomial, "a")
    torsion = roots_of_unity(K)
    assert torsion.complete
    assert torsion.order == expected_order
    assert torsion.verify()
    assert type(torsion.certificate) is RootsOfUnityCertificate
    assert len(torsion.elements) == expected_order
    assert torsion.generator**expected_order == 1
    payload = torsion.certificate.to_dict()
    assert payload["schema"] == "sagejs.number-fields/roots-of-unity-certificate-v1"
    assert payload["proof_status"] == "exact"
    answer.append((expected_order, payload["kind"]))

# The direct cyclotomic presentation attains the residue-field upper bound;
# disabling residue primes independently exercises exact box exhaustion.
K8 = NumberField(x**4 + 1, "z")
fast = roots_of_unity(K8)
fallback = roots_of_unity(K8, max_primes=0)
assert fast.certificate.kind == "residue-upper-bound"
assert fallback.certificate.kind == "embedding-box-exhaustion"
assert fallback.certificate.coefficient_bounds == (1, 1, 1, 1)
assert fallback.certificate.candidates_checked == 81
assert fast.elements == fallback.elements

# A JSON round trip reconstructs and mathematically replays the certificate
# against a distinct field instance without rerunning the producer.
payload = json.loads(json.dumps(fast.certificate.to_dict()))
detached_field = NumberField(x**4 + 1, "detached_z")
detached_certificate = RootsOfUnityCertificate.from_dict(detached_field, payload)
detached_generator = detached_field._from_coefficients(
    [QQ(numerator) / QQ(denominator) for numerator, denominator in payload["generator_coordinates"]]
)
detached_result = RootsOfUnityResult(
    [detached_generator**exponent for exponent in range(8)],
    detached_generator,
    8,
    True,
    "detached test reconstruction",
    detached_certificate,
)
assert detached_result.verify(force_replay=True)
assert detached_certificate.to_dict() == payload

# The resource boundary never promotes a known subgroup to complete torsion.
translated = NumberField((x - 1)**4 + 1, "b")
bounded = roots_of_unity(translated, max_primes=0, max_candidates=1)
assert not bounded.complete
assert bounded.certificate is None
assert "exceeding max_candidates=1" in bounded.reason

# A zero cap and the universal 3^degree box lower bound must refuse before
# expensive maximal-order/embedding setup, even in a degree-16 field.
degree_sixteen = NumberField(x**16 + 1, "degree_sixteen")
started = time.time()
setup_limited = roots_of_unity(
    degree_sixteen, max_primes=0, max_candidates=0
)
assert time.time() - started < 5
assert not setup_limited.complete
assert setup_limited.certificate is None
assert "at least 43046721 candidates" in setup_limited.reason

# Producer authentication and the issuance seal reject forged/tampered proof.
try:
    RootsOfUnityCertificate(
        "residue-upper-bound", 4, (0, 2), (), 120, (),
    )
    raise AssertionError("an unauthenticated certificate was accepted")
except ValueError:
    pass
tampered = roots_of_unity(NumberField(x**4 + 1, "t"))
tampered.certificate.universal_exponent += 1
assert not tampered.verify()
tampered_result = roots_of_unity(NumberField(x**4 + 1, "u"))
tampered_result.elements = tuple(reversed(tampered_result.elements))
assert not tampered_result.certificate.verify(tampered_result, force_replay=True)

# Public attributes cannot forge positive verification authority.  In
# particular, the former identity/result-seal cache names are inert even when
# a caller assigns exactly matching values for a false order-two result.
cache_target = roots_of_unity(NumberField(x**4 + 1, "cache_target"))
false_generator = cache_target.generator.parent()(-1)
false_result = RootsOfUnityResult(
    [false_generator.parent()(1), false_generator],
    false_generator,
    2,
    True,
    "forged order-two replacement",
    cache_target.certificate,
)
cache_target.certificate._verified_result = false_result
cache_target.certificate._verified_result_seal = (
    True,
    2,
    _element_key(false_generator),
    tuple(_element_key(element) for element in false_result.elements),
)
assert not cache_target.certificate.verify(false_result)
assert not cache_target.certificate.verify(false_result, force_replay=True)

# Proof status is an immutable property rather than mutable serialized state.
try:
    cache_target.certificate.proof_status = "incomplete"
    raise AssertionError("mutable proof status was accepted")
except AttributeError:
    pass

def rejected_detached(changed_payload, changed_field=detached_field):
    try:
        RootsOfUnityCertificate.from_dict(changed_field, changed_payload)
        raise AssertionError("a malformed detached certificate was accepted")
    except ValueError:
        pass

unknown = json.loads(json.dumps(payload))
unknown["unknown_authority"] = True
rejected_detached(unknown)
wrong_status = json.loads(json.dumps(payload))
wrong_status["proof_status"] = "incomplete"
rejected_detached(wrong_status)
oversized = json.loads(json.dumps(payload))
oversized["candidate_cap"] = 100001
rejected_detached(oversized)
wrong_candidate_count = json.loads(json.dumps(payload))
wrong_candidate_count["candidates_checked"] += 1
rejected_detached(wrong_candidate_count)
noncanonical = json.loads(json.dumps(payload))
noncanonical["generator_coordinates"][0] = [0, 2]
rejected_detached(noncanonical)
nested_unknown = json.loads(json.dumps(payload))
nested_unknown["prime_records"][0]["factors"][0]["unknown"] = 1
rejected_detached(nested_unknown)
wrong_field = NumberField(x**4 - x**2 + 1, "wrong_field")
rejected_detached(json.loads(json.dumps(payload)), wrong_field)

# Every caller-controlled list shape is rejected by length before decoding.
# Reuse one adversarial allocation so this checks the verifier's incremental
# time and resident-memory behavior rather than charging payload construction.
million_entries = [None] * 1000000
oversized_shapes = []
for top_level_key in (
    "universal_prime_powers",
    "generator_coordinates",
    "coefficient_bounds",
    "prime_records",
):
    changed = dict(payload)
    changed[top_level_key] = million_entries
    oversized_shapes.append(changed)
oversized_nested = dict(payload)
oversized_nested_records = list(payload["prime_records"])
oversized_nested_record = dict(oversized_nested_records[0])
oversized_nested_record["factors"] = million_entries
oversized_nested_records[0] = oversized_nested_record
oversized_nested["prime_records"] = oversized_nested_records
oversized_shapes.append(oversized_nested)

def resident_pages():
    try:
        with open("/proc/self/statm") as statm:
            return int(statm.read().split()[1])
    except (OSError, ValueError):
        return None

pages_before = resident_pages()
oversized_started = time.time()
for oversized_shape in oversized_shapes:
    rejected_detached(oversized_shape)
oversized_elapsed = time.time() - oversized_started
pages_after = resident_pages()
assert oversized_elapsed < 5
if pages_before is not None and pages_after is not None:
    assert pages_after - pages_before < 8192  # Less than 32 MiB at 4 KiB/page.

# Existing real-place and imaginary-quadratic semantics remain exact.
real = roots_of_unity(NumberField(x**3 - 2, "r"))
gaussian = roots_of_unity(NumberField(x**2 + 1, "i"))
eisenstein = roots_of_unity(NumberField(x**2 + 3, "j"))
assert real.complete and real.order == 2 and real.verify()
assert gaussian.complete and gaussian.order == 4 and gaussian.verify()
assert eisenstein.complete and eisenstein.order == 6 and eisenstein.verify()

print(answer)
`);
  assert.match(output, /\(8, 'residue-upper-bound'\)/);
  assert.match(output, /\(10, 'residue-upper-bound'\)/);
  assert.match(output, /\(12, 'residue-upper-bound'\)/);
});

test("cyclotomic quartic class and unit computation reaches completion", () => {
  const output = run(
    String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**4 + 1, "a")
conditional = K.class_unit_group(proof=False)
assert conditional.complete
assert conditional.class_number() == 1
assert conditional.unit_group().complete
assert conditional.unit_group().torsion.order == 8
assert conditional.unit_group().unit_rank == 1
assert conditional.saturation_record is not None
print(conditional.class_number())
`,
    180_000,
  );
  assert.equal(output, "1");
});
