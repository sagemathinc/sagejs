#!/usr/bin/env node
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
import types

sagejs = types.ModuleType("sagejs")
number_fields = types.ModuleType("sagejs.number_fields")
sagejs.number_fields = number_fields
sys.modules["sagejs"] = sagejs
sys.modules["sagejs.number_fields"] = number_fields

spec = importlib.util.spec_from_file_location(
    "sagejs.number_fields.discriminant_components",
    ${JSON.stringify(decompositionPath)},
)
components_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = components_module
spec.loader.exec_module(components_module)
for name in components_module.__all__:
    globals()[name] = getattr(components_module, name)

spec = importlib.util.spec_from_file_location(
    "sagejs.number_fields.maximal_order_certification",
    ${JSON.stringify(certificationPath)},
)
certificate_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = certificate_module
spec.loader.exec_module(certificate_module)
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
assert coprime_decomposition([12, 18]) == [2, 3]
assert coprime_decomposition([72, 50]) == [2, 9, 25]

assert primality_status(97)[0] == PROVEN_PRIME
for pseudoprime in [341, 561, 3215031751]:
    assert primality_status(pseudoprime)[0] == COMPOSITE

large_prime = 18446744073709551653
assert primality_status(large_prime)[0] == PROBABLE_PRIME
large_proof = prove_prime(large_prime, 1000000)
assert large_proof is not None
assert check_prime_certificate(large_proof)
corrupt_proof = dict(large_proof)
corrupt_proof["factored_part"] += 1
assert not check_prime_certificate(corrupt_proof)

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
t_components = decompose_discriminant(
    t_polynomial, t_discriminant, small_prime_bound=1000
)
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
