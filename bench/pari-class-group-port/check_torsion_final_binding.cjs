#!/usr/bin/env node
"use strict";

// This focused composition check supplies no PARI oracle and reads no fixture.
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const program = String.raw`
import copy
import hashlib
import importlib
import json
import sys

sys.path.insert(0, sys.argv[1])
t = importlib.import_module("bench.pari-class-group-port.torsion_authority")
m = importlib.import_module("bench.pari-class-group-port.torsion_final_binding")

polynomial = [20034, -20018, 0, 1]
derived = t.derive_real_cubic_torsion(polynomial)
torsion = derived.detached_payload()["torsion"]

# This is the narrow live view emitted by internal correspondence completion.
# Its torsion fields come from the live derived authority above, not a fixture.
live = {
    "schema": "sagejs.pari-class-group/internal-correspondence-completion-v1",
    "field": {
        "id": "x^3-20018*x+20034",
        "polynomial_ascending": [str(value) for value in polynomial],
    },
    "source_authorities": {"torsion_sha256": derived.sha256},
    "unit_group_correspondence": {
        "torsion_order": torsion["order"],
        "torsion_generator_power_coordinates": torsion["generator_power_basis"],
    },
    "terminal": {
        "status": "pari-correspondence-complete-internal-h1",
        "correspondence_complete": True,
        "composition_driver_published": True,
        "source_leaf_final_driver_published": False,
        "public_complete": False,
        "class_unit_computation_complete": False,
        "standard_public_adapter_eligible": False,
        "unit_saturation_certified": False,
        "missing_public_evidence": [
            "replayable-unit-saturation-index-one-certificate",
            "standard-class-unit-proof-payload-with-factor-base-bound-and-proof-stage",
        ],
    },
}

result = m.compose_torsion_final_binding(polynomial, live)
assert m.replay_torsion_final_binding(result, polynomial, live) == result
payload = result.detached_payload()
assert payload["torsion"] == {
    "authority_sha256": derived.sha256,
    "order": "2",
    "generator_power_coordinates": ["-1", "0", "0"],
    "generator_norm": "-1",
    "maximality": "injective-real-embedding",
}
assert payload["binding"] == {
    "status": "exact-torsion-bound-to-live-final-state",
    "oracle_inputs": [],
    "fixture_inputs": [],
}

def rejected_live(change):
    changed = copy.deepcopy(live)
    change(changed)
    try:
        m.compose_torsion_final_binding(polynomial, changed)
    except m.TorsionBindingFailure:
        return
    raise AssertionError("mutated live final state acquired a torsion binding")

live_mutations = [
    lambda p: p["field"].__setitem__("id", "x^3-20018*x+20035"),
    lambda p: p["field"]["polynomial_ascending"].__setitem__(0, "20035"),
    lambda p: p["source_authorities"].__setitem__("torsion_sha256", "0" * 64),
    lambda p: p["unit_group_correspondence"].__setitem__("torsion_order", "1"),
    lambda p: p["unit_group_correspondence"]["torsion_generator_power_coordinates"].__setitem__(0, "1"),
    lambda p: p["terminal"].__setitem__("status", "partial"),
    lambda p: p["terminal"].__setitem__("correspondence_complete", False),
    lambda p: p["terminal"].__setitem__("composition_driver_published", False),
    lambda p: p["terminal"].__setitem__("public_complete", True),
    lambda p: p["terminal"].__setitem__("class_unit_computation_complete", True),
]
for mutation in live_mutations:
    rejected_live(mutation)

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("ascii")

# Rehashing a false binding does not help because replay recomposes it.
changed = json.loads(result.canonical_json)
changed["payload"]["torsion"]["order"] = "4"
changed["payload_sha256"] = hashlib.sha256(canonical(changed["payload"])).hexdigest()
try:
    m.replay_torsion_final_binding(canonical(changed), polynomial, live)
except m.TorsionBindingFailure:
    pass
else:
    raise AssertionError("coordinated rehashed binding mutation was accepted")

# The live-state digest is substantive: adding a live final-state field makes
# the old binding stale even though all field/torsion claims remain unchanged.
changed_live = copy.deepcopy(live)
changed_live["new_final_state"] = {"retained": True}
try:
    m.replay_torsion_final_binding(result, polynomial, changed_live)
except m.TorsionBindingFailure:
    pass
else:
    raise AssertionError("binding ignored live final-state identity")

print(json.dumps({
    "schema": m.BINDING_SCHEMA,
    "field": payload["field"]["id"],
    "liveSchema": payload["live_final_state"]["schema"],
    "liveSha256": payload["live_final_state"]["sha256"],
    "torsionOrder": 2,
    "torsionGenerator": payload["torsion"]["generator_power_coordinates"],
    "torsionNorm": -1,
    "liveMutationsRejected": len(live_mutations),
    "bindingMutationsRejected": 2,
    "oracleInputs": [],
    "fixtureInputs": [],
    "resultSha256": result.sha256,
}, sort_keys=True))
`;

const result = spawnSync("python3", ["-c", program, root], {
  cwd: root,
  encoding: "utf8",
  timeout: 30000,
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
