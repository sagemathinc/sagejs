"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function runPublic(source, timeout = 240_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-quartic-public-group-"));
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

test("quartic Minkowski evidence constructs the exact public class group", () => {
  const output = runPublic(String.raw`
import hashlib
import json

import sagejs.number_fields.class_unit_groups as class_unit_module
import sagejs.number_fields.class_groups as class_groups_module
from sagejs.number_fields.class_group_maps import IdealClassGroup

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomials = (x**4 + 2, x**4 + 1, x**4 - x - 1)

original_class_group = class_unit_module.class_group
fallback_calls = [0]
def forbidden_fallback(*args, **kwargs):
    fallback_calls[0] += 1
    raise AssertionError("the proved quartic class group entered the fallback")
class_unit_module.class_group = forbidden_fallback
try:
    for proof in (False, True):
        for index, polynomial in enumerate(polynomials):
            K = NumberField(polynomial, "a" + str(int(proof)) + str(index))
            C = K.class_group(proof=proof)
            assert type(C) is IdealClassGroup
            assert C.order() == 1 and C.invariants() == () and C.gens() == ()
            assert C.proof_status == "exact-unconditional"
            assert C.algorithm == "minkowski-principal-factor-base"
            assert C.verify()
            payload = C.proof_payload()
            assert payload["schema"] == (
                "sagejs.number-fields/minkowski-principal-factor-base-v2"
            )
            assert C.verify_proof_payload(payload)
            assert not C.verify_proof_payload(payload, cancelled=lambda: True)
            unit = K.maximal_order().ideal(1)
            logarithm = C.discrete_log(unit)
            assert logarithm.coordinates == () and logarithm.verify(unit, C)
            assert C(unit).is_one() and C.is_principal(unit, proof=True)
    assert fallback_calls == [0]
finally:
    class_unit_module.class_group = original_class_group

# Public wrappers and dictionaries are observations, not retained proof
# authority.  Mutating one group cannot affect the next fresh exact result.
K = NumberField(x**4 + 2, "m")
C = K.class_group(proof=True)
payload = C.proof_payload()
factor_base_module = __import__(
    "sagejs.number_fields.class_group_factor_base",
    fromlist=["class_group_factor_base"],
)
prime = factor_base_module.factor_base_prime_from_dict(
    K.maximal_order(), payload["factor_base"][0]
).prime_ideal
prime_logarithm = C.discrete_log(prime)
assert prime_logarithm.coordinates == ()
assert prime_logarithm.verify(prime, C) and C(prime).is_one()
C._invariants = (2,)
assert not C.verify()
D = K.class_group(proof=True)
assert D is not C and D.invariants() == () and D.verify()

forged = json.loads(json.dumps(payload))
forged["factor_base"][0]["hnf_fingerprint"][0][0][0] += 1
body = dict(forged)
del body["content_sha256"]
forged["content_sha256"] = hashlib.sha256(
    json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
).hexdigest()
assert not D.verify_proof_payload(forged)

# Even an exact same-degree result cannot be transplanted across field
# instances by replacing the producer.
other = NumberField(x**4 + 1, "other")
other_result = class_groups_module.bounded_minkowski_class_number_one(other)
original_producer = class_groups_module.bounded_minkowski_class_number_one
class_groups_module.bounded_minkowski_class_number_one = lambda field: other_result
try:
    target = NumberField(x**4 + 2, "target")
    try:
        target.class_group(proof=True)
        raise AssertionError("a cross-field public group was accepted")
    except ArithmeticError:
        pass
    try:
        target.class_number(proof=True)
        raise AssertionError("a cross-field class number was accepted")
    except ArithmeticError:
        pass
finally:
    class_groups_module.bounded_minkowski_class_number_one = original_producer

# A nontrivial quartic and custom policy both retain the unchanged general
# engine route after the bounded producer declines or is not selected.
sentinel = object()
fallback_calls = [0]
def expected_fallback(*args, **kwargs):
    fallback_calls[0] += 1
    return sentinel
class_unit_module.class_group = expected_fallback
try:
    nontrivial = NumberField(x**4 - 3*x**3 + 4*x + 4, "n")
    assert nontrivial.class_group(proof=False) is sentinel
    custom = NumberField(x**4 + 2, "c")
    assert custom.class_group(proof=False, max_relation_attempts=1) is sentinel
    assert fallback_calls == [2]
finally:
    class_unit_module.class_group = original_class_group

print("quartic-minkowski-public-class-group-ok")
`);
  assert.equal(output, "quartic-minkowski-public-class-group-ok");
});
