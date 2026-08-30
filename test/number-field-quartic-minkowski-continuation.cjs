// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

function runPublic(source, timeout = 240_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-quartic-continuation-"));
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

test("nontrivial bounded quartics continue with the exact Minkowski base", () => {
  const output = runPublic(String.raw`
import sagejs.number_fields.class_unit_groups as class_unit_module
import sagejs.number_fields.class_group_maps as class_group_maps
from sagejs.number_fields.class_groups import bounded_minkowski_class_number_one

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    ("complex-h2", x**4 - x**3 + 3*x**2 + 2*x + 1, (0, 2), 2),
    ("mixed-h2", x**4 - 2*x**3 - x**2 - 3*x + 1, (2, 1), 2),
    ("real-h2", x**4 - 4*x**3 - 5*x**2 + 5*x + 4, (4, 0), 2),
    ("complex-h4", x**4 - 4*x**3 + 4*x**2 - x + 6, (0, 2), 4),
)

for proof in (False, True):
    for index, (_label, polynomial, signature, expected) in enumerate(cases):
        K = NumberField(polynomial, "a" + str(int(proof)) + str(index))
        K.maximal_order()
        bounded = bounded_minkowski_class_number_one(K)
        assert not bounded.complete and bounded.certificate is None
        assert bounded.minkowski_factor_base_complete
        assert K.signature() == signature
        assert K.class_number(proof=proof) == expected
        retained = class_unit_module.class_unit_context(
            K, proof=proof, algorithm="minkowski"
        )
        assert retained.complete and retained.class_number() == expected
        assert retained.proof_status == "exact-unconditional"
        assert retained.diagnostics["resources"]["proof_primes_completed"] == 0

# The direct factor-base logarithm is exactly the unit column in the retained
# Smith presentation.  It preserves the generic logarithm and its principal
# quotient witness without refactoring a prime already in the base.
K = NumberField(x**4 - 2*x**3 - x**2 - 3*x + 1, "maps")
result = class_unit_module.class_unit_context(
    K, proof=True, algorithm="minkowski"
)
engine_group = result.class_group()
direct_log = engine_group._factor_base_discrete_log
for position, prime in enumerate(engine_group._factor_base):
    coordinates, generator = direct_log(position, prime)
    assert coordinates == engine_group.discrete_log(prime)[0]
    representative = engine_group.representative_ideal(coordinates)
    quotient = class_group_maps._ideal_quotient(prime, representative)
    witness = class_group_maps.PrincipalIdealWitness(quotient, generator)
    assert witness.verify(K.maximal_order())
try:
    direct_log(0, K.maximal_order().ideal(1))
    raise AssertionError("a direct factor-base logarithm accepted another ideal")
except ArithmeticError:
    pass

# The shortcut remains an untrusted producer.  Its output is checked by the
# ordinary public witness replay before any projection can be published.
engine_group._factor_base_discrete_log = lambda position, prime: ((), object())
try:
    class_group_maps.class_group_from_engine_result(result)
    raise AssertionError("forged direct factor-base evidence was accepted")
except (ArithmeticError, TypeError, ValueError):
    pass
finally:
    engine_group._factor_base_discrete_log = direct_log

group = K.class_group(proof=True)
assert group.invariants() == (2,) and group.verify()
assert group.verify_proof_payload(group.proof_payload())

print("quartic-minkowski-continuation-ok")
`);
  assert.equal(output, "quartic-minkowski-continuation-ok");
});
