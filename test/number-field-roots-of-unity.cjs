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
from sagejs.number_fields.units import RootsOfUnityCertificate, roots_of_unity

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

# Reconstructing the field produces the same canonical detached payload.
detached = roots_of_unity(NumberField(x**4 + 1, "z"))
assert detached.verify(force_replay=True)
assert detached.certificate.to_dict() == fast.certificate.to_dict()

# The resource boundary never promotes a known subgroup to complete torsion.
translated = NumberField((x - 1)**4 + 1, "b")
bounded = roots_of_unity(translated, max_primes=0, max_candidates=1)
assert not bounded.complete
assert bounded.certificate is None
assert "exceeding max_candidates=1" in bounded.reason

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
