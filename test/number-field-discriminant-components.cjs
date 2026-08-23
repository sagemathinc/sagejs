#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const decompositionPath = join(
  root,
  "src/lib/sagejs/number_fields/discriminant_components.py",
);
const certificationPath = join(
  root,
  "src/lib/sagejs/number_fields/maximal_order_certification.py",
);
const decompositionSource = readFileSync(decompositionPath, "utf8");
const certificationSource = readFileSync(certificationPath, "utf8");
const fixture = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-components.json"),
    "utf8",
  ),
);

const certificationImport = `from sagejs.number_fields.discriminant_components import (
    PROVEN_PRIME,
    CertificationError,
    check_decomposition_certificate,
    integer_gcd,
)
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-discriminant-components-"));
  const filename = join(directory, "witness.py");
  try {
    const combined = `${decompositionSource}\n${certificationSource.replace(
      certificationImport,
      "",
    )}\n${source}\n`;
    writeFileSync(filename, combined);
    return run(process.execPath, [join(root, "bin/sagejs"), filename], {
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCPython(source) {
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "/usr/bin/python3");
  const bootstrap = String.raw`
import importlib.util
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})

components_module = importlib.import_module(
    "sagejs.number_fields.discriminant_components"
)
for name in components_module.__all__:
    globals()[name] = getattr(components_module, name)

certificate_module = importlib.import_module(
    "sagejs.number_fields.maximal_order_certification"
)
for name in certificate_module.__all__:
    globals()[name] = getattr(certificate_module, name)
`;
  return run(python, ["-I", "-c", `${bootstrap}\n${source}`]);
}

const witness = String.raw`
assert perfect_power_data(2**60) == (2, 60)
assert perfect_power_data(3**12) == (3, 12)
assert perfect_power_data(12) == (12, 1)
assert perfect_power_data(-343) == (-7, 3)
large_root = 2**521 + 12345
assert perfect_power_data(large_root**2) == (large_root, 2)
assert perfect_power_data(large_root**2 - 1) == (large_root**2 - 1, 1)
def slow_perfect_power(value):
    if value in (-1, 0, 1):
        return (value, 1)
    magnitude = abs(value)
    def slow_root(exponent):
        low = 1
        high = 1 << ((magnitude.bit_length() + exponent - 1) // exponent)
        while low <= high:
            middle = (low + high) // 2
            if middle**exponent <= magnitude:
                low = middle + 1
            else:
                high = middle - 1
        return high
    for exponent in range(magnitude.bit_length(), 1, -1):
        if value < 0 and exponent % 2 == 0:
            continue
        root = slow_root(exponent)
        if root**exponent == magnitude:
            return (-root if value < 0 else root, exponent)
    return (value, 1)
for perfect_power_probe in range(-500, 501):
    assert perfect_power_data(perfect_power_probe) == slow_perfect_power(perfect_power_probe)
assert coprime_decomposition([12, 18]) == [2, 3]
assert coprime_decomposition([72, 50]) == [2, 9, 25]

assert primality_status(97)[0] == PROVEN_PRIME
for pseudoprime in [341, 561, 3215031751]:
    assert primality_status(pseudoprime)[0] == COMPOSITE
for nonprime in [-7, 0, 1]:
    assert prove_prime(nonprime) is None
    nonprime_state = new_prime_proof_state(nonprime)
    assert nonprime_state["status"] == "composite"
    assert check_prime_proof_state(nonprime_state)

large_prime = 18446744073709551653
assert primality_status(large_prime)[0] == PROBABLE_PRIME
large_proof = prove_prime(large_prime, 1000000)
assert large_proof is not None
assert check_prime_certificate(large_proof)
corrupt_proof = dict(large_proof)
corrupt_proof["factored_part"] += 1
assert not check_prime_certificate(corrupt_proof)
cyclic_proof = {"kind": "pocklington", "prime": large_prime}
cyclic_proof["factors"] = [
    {"prime": large_prime, "exponent": 1, "certificate": cyclic_proof}
]
cyclic_proof["witnesses"] = []
cyclic_proof["factored_part"] = large_prime
assert not check_prime_certificate(cyclic_proof)

# Exact corpus blocker: pari-round4-vector-168.  A deliberately tiny first
# budget must return a valid resumable checkpoint, never a probable-prime
# claim.  Resuming that same checkpoint must produce an independently checked
# deterministic certificate for the formerly unproved support prime.
round4_168_polynomial = [
    -1467437, 2351580, 6350523, -9102293, -3106271,
    9023194, -4481430, 797843, -39793, 1,
]
round4_168_prime = 1732299231618007792631498567
round4_168_state = new_prime_proof_state(round4_168_prime)
resume_prime_proof(
    round4_168_state,
    prime_proof_budget(
        trial_divisions=3, rho_steps=7, witness_trials=1,
        max_recursion_depth=64, rho_bit_limit=256,
    ),
)
assert round4_168_state["status"] == "resource-exhausted"
assert check_prime_proof_state(round4_168_state)
assert round4_168_state["certificate"] is None
resume_prime_proof(
    round4_168_state,
    prime_proof_budget(
        trial_divisions=30000, rho_steps=100000, witness_trials=1024,
        max_recursion_depth=64, rho_bit_limit=256,
    ),
)
assert round4_168_state["status"] == "complete"
assert check_prime_proof_state(round4_168_state)
assert check_prime_certificate(round4_168_state["certificate"])
round4_168_decomposition = decompose_discriminant(
    round4_168_polynomial, round4_168_prime, small_prime_bound=47,
    proof_work=500000,
)
assert round4_168_decomposition["certified"]
assert check_decomposition_certificate(round4_168_decomposition)
assert round4_168_decomposition["components"][0]["evidence"] == round4_168_state["certificate"]

# Exact same-class blocker: pari-round4-vector-250.  Its unresolved support is
# composite, but each factor emitted by the external corpus oracle must receive
# its own deterministic certificate before the decomposition is certified.
round4_250_polynomial = [
    -18433878713, 23835146496, 46833416626, -91476357427,
    29078205681, 23102811288, -14798379535, 1922958558, -885599, 1,
]
round4_250_support = 53971155942437379054403765484033096990861743
round4_250_primes = [366221, 147373187071296782692428248199947837483]
round4_250_proofs = {}
for round4_250_prime in round4_250_primes:
    round4_250_proof = prove_prime(round4_250_prime, 500000)
    assert round4_250_proof is not None
    assert check_prime_certificate(round4_250_proof)
    round4_250_proofs[round4_250_prime] = round4_250_proof
round4_250_decomposition = decompose_discriminant(
    round4_250_polynomial, round4_250_support,
    hints=[round4_250_primes[0]], small_prime_bound=47, proof_work=500000,
)
for round4_250_prime in round4_250_primes:
    round4_250_decomposition = certify_decomposition_component(
        round4_250_decomposition,
        round4_250_prime,
        round4_250_proofs[round4_250_prime],
    )
assert round4_250_decomposition["certified"]
assert [entry["base"] for entry in round4_250_decomposition["components"]] == round4_250_primes
assert check_decomposition_certificate(round4_250_decomposition)

# Remaining same-class failures found by the full PARI round-4 sweep.  The
# expected support split is frozen corpus evidence; this test performs no eager
# factorization and independently certifies every resulting prime.
round4_additional = [
    (
        "pari-round4-vector-285",
        [
            33502771, 811733712, -6580536485, 14635813347, -14501253063,
            7055600862, -1587001214, 120356183, -129121, 1,
        ],
        14084755575021082833695060810014260859,
        [140363, 100345216153979915174904075931793],
    ),
    (
        "pari-round4-vector-314",
        [
            -85980663233, 246541089532, 668167599734, -20329193443,
            -535328756625, -51279535173, 154966313561, 10623466568,
            -15580412921, 1,
        ],
        9240552257684428109612188325937456907,
        [82655773, 111795606311544967459347193159],
    ),
    (
        "pari-round4-vector-365",
        [
            -4708346837, -17022201300, -12801064069, 10047668573,
            9157180447, -1948890582, -1477944460, 155219491, -660365, 1,
        ],
        213927298754036334134720476248118715456251,
        [213927298754036334134720476248118715456251],
    ),
]
for round4_id, round4_polynomial, round4_support, round4_primes in round4_additional:
    assert round4_polynomial[-1] == 1 and round4_id.startswith("pari-round4-vector-")
    round4_decomposition = decompose_discriminant(
        round4_polynomial,
        round4_support,
        hints=round4_primes[:-1],
        small_prime_bound=47,
        proof_work=500000,
    )
    for round4_prime in round4_primes:
        round4_proof = prove_prime(round4_prime, 500000)
        assert round4_proof is not None
        assert check_prime_certificate(round4_proof)
        round4_decomposition = certify_decomposition_component(
            round4_decomposition, round4_prime, round4_proof,
        )
    assert round4_decomposition["certified"]
    assert [entry["base"] for entry in round4_decomposition["components"]] == round4_primes
    assert check_decomposition_certificate(round4_decomposition)

# This strong pseudoprime survives every preliminary base.  It must be rejected
# by explicit evidence, and when it occurs inside a true prime's n-1 the proof
# and direct-factor branches must make progress together until completion.
strong_pseudoprime = 3317044064679887385961981
assert primality_status(strong_pseudoprime)[0] == PROBABLE_PRIME
pseudoprime_state = prove_prime_resumable(
    strong_pseudoprime,
    prime_proof_budget(
        trial_divisions=30000, rho_steps=100000, witness_trials=1024,
        max_recursion_depth=64, rho_bit_limit=256,
    ),
)
assert pseudoprime_state["status"] == "composite"
assert pseudoprime_state["composite_evidence"]["kind"] == "fermat-witness"
assert check_prime_proof_state(pseudoprime_state)

prime_with_pseudoprime_branch = 159218115104634594526175089
branch_state = new_prime_proof_state(prime_with_pseudoprime_branch)
for _resume in range(8):
    resume_prime_proof(
        branch_state,
        prime_proof_budget(
            trial_divisions=20000, rho_steps=500000, witness_trials=1024,
            max_recursion_depth=64, rho_bit_limit=256,
        ),
    )
    assert check_prime_proof_state(branch_state)
    if branch_state["status"] == "complete":
        break
assert branch_state["status"] == "complete"
assert check_prime_certificate(branch_state["certificate"])

# A discovered local divisor replaces just that branch; already certified
# siblings survive unchanged and no complete residual factorization is needed.
branch_decomposition = decompose_discriminant(
    None, 9*1009*1013, small_prime_bound=3, rho_steps=0,
    prove_large_primes=False,
)
branch_split = split_decomposition_component(
    branch_decomposition, 1009*1013, 1009, reason="test-local-obstruction",
)
assert branch_split["restart"]["retired"] == 1009*1013
assert branch_split["restart"]["preserved"] == [9]
assert [entry["value"] for entry in branch_split["restart"]["children"]] == [1009, 1013]
assert [entry["value"] for entry in branch_split["decomposition"]["components"]] == [9, 1009, 1013]
assert [entry["value"] for entry in branch_decomposition["components"]] == [9, 1009*1013]
assert check_decomposition_certificate(branch_split["decomposition"])

proof_split_state = new_prime_proof_state(1009*1013 + 1)
proof_split = apply_prime_proof_factor_split(
    proof_split_state, 1009*1013, 1009,
)
assert proof_split["children"] == [1009, 1013]
assert check_prime_proof_state(proof_split_state)
corrupt_state = dict(proof_split_state)
corrupt_state["pending"] = [dict(entry) for entry in proof_split_state["pending"]]
corrupt_state["pending"][0]["value"] += 1
assert not check_prime_proof_state(corrupt_state)

split = polynomial_gcd_mod_composite([1, 0, 1], [1, 3], 15)
assert split["status"] == "split" and split["divisor"] == 3
gcd_result = polynomial_gcd_mod_composite([0, 3, 1], [0, 1], 15)
assert gcd_result == {"status": "gcd", "polynomial": [0, 1]}

prime_powers = decompose_discriminant([1, 0, 1], 523584, small_prime_bound=50)
assert [entry["value"] for entry in prime_powers["components"]] == [64, 81, 101]
assert check_decomposition_certificate(prime_powers)

semiprime = decompose_discriminant([1, 0, 1], 1009*1013, small_prime_bound=50)
assert [entry["value"] for entry in semiprime["components"]] == [1009, 1013]
assert check_decomposition_certificate(semiprime)
assert semiprime == decompose_discriminant([1, 0, 1], 1009*1013, small_prime_bound=50)

large = decompose_discriminant([1, 0, 1], large_prime, small_prime_bound=47)
assert large["certified"] and check_decomposition_certificate(large)

# Exact catastrophic regression T(8, 2^32), where beta=theta+2^32*theta^2
# and theta^8=2.  The lazy path extracts cheap certified components and leaves
# the enormous residual composite for local BL work; it must not fully factor.
t_polynomial = [
    463168356949264781694283940034751631413079938662562256157830336031652518559742,
    -68719476736,
    -737869762948382064640,
    -2535301200456458802993406410752,
    -1361129467683753853853498429727072845824,
    0, 0, 0, 1,
]
t_discriminant = -21710164295456076474617584992928400544833610601629804355184679244996915561412300835826721961473986210846221241668229561383669720498272349088880631305049540139658418696001872225883615848168684737389095929421187727305784044410712841760108032615159582727797205555480654514063496576529568532155684010892034531696954852925758102686293986687124850026407026794770565008181062411476722017842952446807496024829206568854130556510788231681478340637127527630719970512743917683144381077389312
bounded_factor_calls = []
original_bounded_factor = bounded_factor
def counted_bounded_factor(*args, **kwds):
    bounded_factor_calls.append(args[0])
    return original_bounded_factor(*args, **kwds)
bounded_factor = counted_bounded_factor
t_components = decompose_discriminant(
    t_polynomial, t_discriminant, small_prime_bound=1000
)
bounded_factor = original_bounded_factor
assert bounded_factor_calls == []
assert check_decomposition_certificate(t_components, require_proven=False)
assert [(entry["base"], entry["exponent"]) for entry in t_components["components"][:4]] == [
    (7, 2), (73, 2), (233, 2), (2, 31)
]
assert t_components["components"][-1]["state"] == COMPOSITE
assert not t_components["certified"]

# Executable Buchmann--Lenstra orchestration: the fixture adapter models the
# exact radical/multiplier/ideal operations while the algorithm owns restarts,
# split validation, and fail-closed bounds.
bl_component = DiscriminantComponent(15, COMPOSITE, 15, 1, {"kind": "fixture"})
def bl_adapter(radical_divisor, enlarge):
    return {
        "degree": lambda order: 3,
        "discriminant": lambda order: order["discriminant"],
        "q_radical": lambda order, q: {
            "ideal": ("I", order["level"], q),
            "divisor": radical_divisor,
            "trivial": False,
        },
        "multiplier_ring": lambda order, ideal: (
            {"level": 1, "discriminant": 1} if enlarge and order["level"] == 0 else order
        ),
        "orders_equal": lambda left, right: left == right,
        "colon_freeness_obstruction": lambda order, ideal, q: 1,
        "ideal_multiply": lambda left, right: ("mul", left, right),
        "ideal_add_integer": lambda ideal, q: ("add", ideal, q),
        "ideals_equal": lambda left, right: False,
        "relation_freeness_obstruction": lambda left, right, q: 1,
    }

bl_complete = buchmann_lenstra_cycle(
    {"level": 0, "discriminant": 15}, bl_component, bl_adapter(1, True)
)
assert bl_complete["state"] == "complete"
assert bl_complete["evidence"]["component_removed"] is True
bl_split = buchmann_lenstra_cycle(
    {"level": 0, "discriminant": 15}, bl_component, bl_adapter(3, False)
)
assert bl_split["state"] == "split"
assert [entry["value"] for entry in bl_split["split"]["children"]] == [3, 5]
bl_stable = buchmann_lenstra_cycle(
    {"level": 0, "discriminant": 15}, bl_component, bl_adapter(1, False)
)
assert bl_stable["state"] == "resource-error"
assert "further factor discovery" in bl_stable["message"]

unresolved = decompose_discriminant(
    None, 1009*1013, small_prime_bound=2, rho_steps=0
)
assert not unresolved["certified"]
assert check_decomposition_certificate(unresolved, require_proven=False)
try:
    require_certified_decomposition(unresolved)
except CertificationError:
    pass
else:
    raise AssertionError("unresolved decomposition was accepted")

# Q(sqrt(5)): O_K has basis 1,(1+x)/2 over the equation order Z[x].
decomposition = decompose_discriminant([-5, 0, 1], 20)
local = make_local_maximality_witness(
    2, "round-2", 2, 0, 1, {"kind": "independent-round-2", "closed": True}
)
certificate = make_maximal_order_certificate(
    [-5, 0, 1], [[2, 0], [1, 1]], 2, 20, 5, 2,
    decomposition, [local], "global", None, [2]
)
assert check_order_lattice([-5, 0, 1], [[2, 0], [1, 1]], 2)["valid"]
conditional = check_certificate(certificate)
assert conditional["valid"] and not conditional["certified"]

def independent_local_checker(local_witness, _certificate):
    proof = local_witness["proof"]
    if "component_value" in local_witness:
        return (
            local_witness["assumes_prime"] is False
            and proof.get("kind") == "buchmann-lenstra"
            and proof.get("radical_multiplier_freeness_checked") is True
        )
    return proof.get("kind") == "independent-round-2" and proof.get("closed") is True

checked = check_certificate(certificate, independent_local_checker)
assert checked == {"valid": True, "certified": True, "reason": "checked"}

bad_discriminant = dict(certificate)
bad_discriminant["order_discriminant"] = 20
assert not check_certificate(bad_discriminant, independent_local_checker)["valid"]
bad_basis = dict(certificate)
bad_basis["basis_numerator"] = [[2, 0], [0, 1]]
assert not check_certificate(bad_basis, independent_local_checker)["valid"]
bad_local = dict(certificate)
bad_local["local_witnesses"] = []
assert not check_certificate(bad_local, independent_local_checker)["valid"]

adapter = {
    "defining_polynomial": lambda candidate: candidate["polynomial"],
    "basis_data": lambda candidate: (candidate["basis"], candidate["denominator"]),
    "equation_discriminant": lambda candidate: candidate["equation_discriminant"],
    "order_discriminant": lambda candidate: candidate["order_discriminant"],
    "index": lambda candidate: candidate["index"],
    "verify_local_witness": independent_local_checker,
}
candidate = {
    "polynomial": [-5, 0, 1],
    "basis": [[2, 0], [1, 1]],
    "denominator": 2,
    "equation_discriminant": 20,
    "order_discriminant": 5,
    "index": 2,
}
adapter_certificate = certify_global_order(
    adapter, candidate, decomposition, [local], merge_denominator_primes=[2]
)
assert adapter_certificate["certified"]

# A conditionally constructed order may prove only explicitly requested local
# branches even while another coprime component awaits a proof.
partial_decomposition = {
    "version": decomposition["version"],
    "original": decomposition["original"],
    "components": [dict(entry) for entry in decomposition["components"]],
    "events": list(decomposition["events"]),
    "certified": False,
}
for entry in partial_decomposition["components"]:
    if entry["base"] == 5:
        entry["state"] = PROBABLE_PRIME
        entry["evidence"] = primality_status(5)[1]
local_certificate = make_maximal_order_certificate(
    [-5, 0, 1], [[2, 0], [1, 1]], 2, 20, 5, 2,
    partial_decomposition, [local], "local", [2], [2]
)
assert check_certificate(local_certificate, independent_local_checker)["certified"]
local_certificate["requested_primes"] = [5]
assert check_certificate(local_certificate, independent_local_checker)["reason"] == "requested-prime-unproved"

component_witness = make_composite_local_maximality_witness(
    5,
    "buchmann-lenstra",
    {"kind": "buchmann-lenstra", "radical_multiplier_freeness_checked": True},
)
composite_global = make_maximal_order_certificate(
    [-5, 0, 1], [[2, 0], [1, 1]], 2, 20, 5, 2,
    partial_decomposition, [local, component_witness], "global", None, [2]
)
assert check_certificate(composite_global, independent_local_checker)["certified"]
component_witness["assumes_prime"] = True
assert check_certificate(composite_global, independent_local_checker)["reason"] == "composite-proof-assumes-prime"
print("number-field-components-ok")
`;

test("P1 component fixtures are versioned and cover adversarial classes", () => {
  assert.equal(fixture.schema_version, 1);
  assert.deepEqual(
    fixture.primality.map((entry) => entry.state),
    [
      "proven-prime",
      "composite",
      "composite",
      "composite",
      "probable-prime-awaiting-proof",
    ],
  );
  assert.deepEqual(
    fixture.decompositions.map((entry) => entry.label),
    ["prime-powers", "semiprime", "large-prime"],
  );
});

test("lazy decomposition and independent certification agree in CPython", () => {
  assert.equal(runCPython(witness), "number-field-components-ok");
});

test("lazy decomposition and independent certification agree in Sage.js", () => {
  assert.equal(runSagejs(witness), "number-field-components-ok");
});

test("P1 source remains strict ordinary Python and has no eager factor dependency", () => {
  assert.doesNotMatch(decompositionSource, /sage\.factor|\.factor\(/);
  assert.doesNotMatch(decompositionSource, /sagejs\.runtime|#\s*globals/);
  assert.match(decompositionSource, /probable-prime-awaiting-proof/);
  assert.match(certificationSource, /local-checker-required/);
});
