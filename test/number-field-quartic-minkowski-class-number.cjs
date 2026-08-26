"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function runPublic(source, timeout = 240_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-quartic-minkowski-"));
  try {
    const filename = join(directory, "test.py");
    writeFileSync(filename, source, "utf8");
    const executable =
      process.platform === "win32"
        ? process.execPath
        : join(root, "bin", "sagejs");
    const arguments_ =
      process.platform === "win32"
        ? [join(root, "bin", "sagejs-source.cjs"), "--python", filename]
        : ["--python", filename];
    const result = spawnSync(executable, arguments_, {
      cwd: root,
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, SAGEJS_USE_SOURCE: "1" },
    });
    assert.equal(
      result.status,
      0,
      result.error?.message || result.stderr || result.stdout,
    );
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("small-bound quartics use exact principal Minkowski evidence", () => {
  const output = runPublic(String.raw`
import hashlib
import json

import sagejs.number_fields.class_unit_groups as class_unit_module
from sagejs.number_fields.class_groups import MinkowskiPrincipalFactorBaseCertificate, bounded_minkowski_class_number_one

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**4 + 2
quartic_cases = (
    ("totally-real", x**4 - x**3 - 3*x**2 + x + 1, 2, 0),
    ("mixed", x**4 - x - 1, 2, 0),
    ("cyclotomic", x**4 + 1, 2, 1),
    ("totally-complex", polynomial, 6, 3),
)

# The scalar API must not enter the complete class/unit engine when the exact
# Minkowski factor base is already proved principal.
original_class_number = class_unit_module.class_number
fallback_calls = [0]
def forbidden_fallback(*args, **kwargs):
    fallback_calls[0] += 1
    raise AssertionError("the successful quartic projection entered the fallback")
class_unit_module.class_number = forbidden_fallback
try:
    for proof in (False, True):
        for index, (_label, case_polynomial, bound, factor_base_size) in enumerate(
            quartic_cases
        ):
            K = NumberField(case_polynomial, "a" + str(int(proof)) + str(index))
            assert K.class_number(proof=proof) == 1
            result = K.class_group_result()
            assert result.complete and result.order() == 1
            assert result.minkowski_bound == bound
            assert result.invariants() == ()
            assert result.proof_status == "exact-minkowski-principal-factor-base"
            assert len(
                result.certificate.arithmetic_certificate.factor_base
            ) == factor_base_size
            assert result.certificate.verify(max_elements=1)
    assert fallback_calls == [0]
finally:
    class_unit_module.class_number = original_class_number

K = NumberField(polynomial, "q")
result = bounded_minkowski_class_number_one(K)
certificate = result.certificate.arithmetic_certificate
assert isinstance(certificate, MinkowskiPrincipalFactorBaseCertificate)
assert certificate.verify()
assert len(certificate.factor_base) == len(certificate.witnesses) == 3
assert len(certificate.candidates_checked) == 3
assert max(certificate.candidates_checked) <= 16
assert all(
    witness.principal_ideal(K.maximal_order()) == record.prime_ideal
    for witness, record in zip(
        certificate.principal_relation_witnesses,
        __import__(
            "sagejs.number_fields.class_group_factor_base",
            fromlist=["class_group_factor_base"],
        ).build_factor_base(
            __import__(
                "sagejs.number_fields.class_group_factor_base",
                fromlist=["class_group_factor_base"],
            ).factor_base_plan(
                K.maximal_order(),
                proof=True,
                theorem="minkowski",
                max_bound=64,
                max_rational_primes=64,
                max_prime_ideals=64,
                max_memory_bytes=16 * 1024 * 1024,
            )
        ),
        strict=True,
    )
)

payload = certificate.to_dict()
detached = MinkowskiPrincipalFactorBaseCertificate.from_dict(K, payload)
assert detached.to_dict() == payload and detached.verify()

# The separately exposed bounded-result cache is a convenience, never proof
# authority for the scalar API.  Mutating and reinstalling it cannot change a
# fresh exact class-number decision.
class FakeGroup:
    def order(self):
        return 2
poisoned_cache = K.class_group_result()
poisoned_cache.group = FakeGroup()
K._global_class_group_cache = poisoned_cache
assert K.class_number(proof=False) == 1

def rehash(value):
    body = dict(value)
    del body["content_sha256"]
    value["content_sha256"] = hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

for mutation in ("bound", "factor-base", "witness", "wrong-field"):
    forged = json.loads(json.dumps(payload))
    if mutation == "bound":
        forged["plan"]["bound"]["bound"] += 1
    elif mutation == "factor-base":
        forged["factor_base"][0]["hnf_fingerprint"][0][0][0] += 1
    elif mutation == "witness":
        forged["witnesses"][0]["factors"][0]["exponent"] += 1
    rehash(forged)
    target = NumberField(x**4 + 1, "z") if mutation == "wrong-field" else K
    try:
        MinkowskiPrincipalFactorBaseCertificate.from_dict(target, forged)
        raise AssertionError("mutated quartic Minkowski evidence passed replay")
    except ValueError:
        pass

# A cap below the observed exact search is incomplete, never a false proof.
limited = bounded_minkowski_class_number_one(
    NumberField(polynomial, "l"), max_reduction_candidates=13
)
assert not limited.complete and limited.certificate is None
assert "principal-generator search exhausted" in limited.reason

# This totally complex quartic has class number two.  The class-number-one
# producer declines and the retained exact Minkowski state enters the general
# engine directly, without rebuilding through the legacy scalar adapter.
nontrivial = NumberField(x**4 - 3*x**3 + 4*x + 4, "n")
declined = bounded_minkowski_class_number_one(nontrivial)
assert not declined.complete and declined.certificate is None
fallback_calls = [0]
original_class_number = class_unit_module.class_number
def forbidden_legacy_fallback(*args, **kwargs):
    del args, kwargs
    fallback_calls[0] += 1
    raise AssertionError("the retained quartic state entered the legacy fallback")
class_unit_module.class_number = forbidden_legacy_fallback
try:
    assert nontrivial.class_number(proof=False) == 2
    assert fallback_calls == [0]
finally:
    class_unit_module.class_number = original_class_number

print("quartic-minkowski-class-number-ok")
`);
  assert.equal(output, "quartic-minkowski-class-number-ok");
});
