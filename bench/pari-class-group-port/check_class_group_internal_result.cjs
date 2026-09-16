"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const modulePath = path.join(__dirname, "class_group_internal_result.py");
const program = String.raw`
import copy
import hashlib
import importlib.util
import json
import sys
from concurrent.futures import ThreadPoolExecutor

spec = importlib.util.spec_from_file_location("class_group_internal_result", sys.argv[1])
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)

assumptions = tuple(sorted((
    "PARI 2.17.4 heuristic bounds and floating decisions are assumed",
    "GRH-dependent factor-base policy inherited from PARI 2.17.4",
)))
authority = m.ReplayAuthority("synthetic:x^2+5", assumptions)
state = {
    "relation_records": [6, 0, 0, 2, 999],
    "hnf_result_h": [6, 0, 0, 2, 999],
    "hnf_result_c": [2, 1, 1, 3, 999],
    "class_invariants": [6, 2, 999],
    "class_number": [12, 999],
    "accept_regulator": [5, 53, -2, 999],
    "driver_state": [4, 0, 3, 2, 1, 2, 0, 2, 999],
    "relation_state": [2, 0, 0, 0, 2, 999],
}
layout = m.PreparedCandidateLayout(2, 2, 2, 2, 4, 2, 2)
candidate = m.snapshot_prepared_candidate(state, layout, authority.field_id)
assert candidate["relation_matrix"] == ["6", "0", "0", "2"]
assert candidate["owner_lengths"]["relation_records"] == "5"
orientation_state = copy.deepcopy(state)
orientation_state["relation_records"][:4] = [1, 3, 2, 4]
orientation_state["hnf_result_h"][:4] = [5, 7, 6, 8]
orientation = m.snapshot_prepared_candidate(orientation_state, layout, authority.field_id)
assert orientation["relation_matrix"] == ["1", "2", "3", "4"]
assert orientation["hnf_matrix"] == ["5", "6", "7", "8"]

# The authentic resident quartic corridor reaches 303 relation columns.  The
# rectangular replay bound must permit that while square Smith arithmetic keeps
# its independent 256-dimensional work bound.
wide_state = copy.deepcopy(state)
wide_state["relation_records"] = [0] * (2 * 303)
wide_state["relation_state"][0] = 303
wide_layout = m.PreparedCandidateLayout(2, 303, 2, 2, 4, 2, 2)
wide_candidate = m.snapshot_prepared_candidate(wide_state, wide_layout, authority.field_id)
wide_payload = m.make_internal_payload(wide_candidate, assumptions)
wide_result = m.AtomicResultPublisher(authority).publish(wide_payload)
assert m.cold_replay(wide_result, authority) == wide_result

transforms = {
    "shape": ["2", "2"],
    "presentation": ["6", "0", "0", "2"],
    "left": ["1", "0", "0", "1"],
    "left_inverse": ["1", "0", "0", "1"],
    "right": ["1", "0", "0", "1"],
    "right_inverse": ["1", "0", "0", "1"],
    "diagonal": ["6", "0", "0", "2"],
    "relation_to_presentation_shape": ["2", "2"],
    "relation_to_presentation": ["1", "0", "0", "1"],
    "presentation_to_relation_shape": ["2", "2"],
    "presentation_to_relation": ["1", "0", "0", "1"],
}
generators = {
    "entries": [
        {
            "class_vector": ["1", "0"],
            "order": "6",
            "relation_coefficients": ["1", "0"],
            "ideal_hnf": ["2", "0", "0", "1"],
            "principal_generator": ["1", "1"],
            "smith_index": "0",
        },
        {
            "class_vector": ["0", "1"],
            "order": "2",
            "relation_coefficients": ["0", "1"],
            "ideal_hnf": ["3", "0", "0", "1"],
            "principal_generator": ["2", "1"],
            "smith_index": "1",
        },
    ]
}
units = {
    "rank": "2",
    "factor_norms": ["-1", "1", "-1"],
    "factor_exponent_shape": ["2", "3"],
    "factor_exponents": ["1", "0", "1", "1", "0", "0"],
    "claimed_norms": ["1", "-1"],
    "log_minor_shape": ["2", "2"],
    "log_minor_numerators": ["2", "1", "1", "3"],
    "log_denominator": "2",
    "regulator_determinant_numerator": "5",
    "regulator_determinant_denominator": "4",
    "log_minor_indices": ["0", "1", "2", "3"],
    "candidate_regulator_triplet": ["5", "53", "-2"],
    "torsion_order": "2",
    "torsion_coordinates": ["-1", "0"],
    "torsion_norm": "1",
}

# An incomplete prepared candidate is honest about every missing component.
candidate_payload = m.make_internal_payload(candidate, assumptions)
assert candidate_payload["terminal"] == {
    "status": "published-partial-v1",
    "schema_components_present": False,
    "phase5_complete": False,
    "public_complete": False,
    "missing_components": ["transforms", "generators", "units"],
    "unverified_requirements": [
        "exact-ideal-arithmetic-replay",
        "exact-unit-principality-and-norm-replay",
        "factor-base-and-relation-authentication",
        "full-buchall-end-state",
        "rigorous-regulator-enclosure-and-acceptance",
    ],
}
candidate_publisher = m.AtomicResultPublisher(authority)
candidate_result = candidate_publisher.publish(candidate_payload)
assert m.cold_replay(candidate_result, authority) == candidate_result

# A failed draft is validated before publication and exposes no partial object.
bad_publisher = m.AtomicResultPublisher(authority)
bad = copy.deepcopy(candidate_payload)
bad["candidate"]["class_number"] = "13"
try:
    bad_publisher.publish(bad)
except m.ReplayFailure:
    pass
else:
    raise AssertionError("invalid draft published")
assert bad_publisher.current() is None

full_payload = m.make_internal_payload(
    candidate,
    assumptions,
    transforms=transforms,
    generators=generators,
    units=units,
)
assert full_payload["terminal"] == {
    "status": "published-partial-v1",
    "schema_components_present": True,
    "phase5_complete": False,
    "public_complete": False,
    "missing_components": [],
    "unverified_requirements": [
        "exact-ideal-arithmetic-replay",
        "exact-unit-principality-and-norm-replay",
        "factor-base-and-relation-authentication",
        "full-buchall-end-state",
        "rigorous-regulator-enclosure-and-acceptance",
    ],
}
publisher = m.AtomicResultPublisher(authority)
result = publisher.publish(full_payload)
assert publisher.publish(copy.deepcopy(full_payload)) is result
with ThreadPoolExecutor(max_workers=8) as pool:
    assert all(item is result for item in pool.map(publisher.publish, [full_payload] * 32))

# Publication detached all caller-owned containers.
full_payload["candidate"]["relation_matrix"][0] = "999"
assert publisher.current() is result
assert m.cold_replay(result, authority).sha256 == result.sha256

pinned = m.ReplayAuthority(authority.field_id, assumptions, result.sha256)
assert m.cold_replay(result.canonical_json, pinned).sha256 == result.sha256

# Conflicting terminal publication cannot replace the existing object.
other = m.make_internal_payload(candidate, assumptions, transforms=transforms, units=units)
try:
    publisher.publish(other)
except m.PublicationConflict:
    pass
else:
    raise AssertionError("conflicting terminal publication succeeded")
assert publisher.current() is result

# Publication authority is enforced before the lock is touched.
wrong_pin = m.AtomicResultPublisher(m.ReplayAuthority(authority.field_id, assumptions, "0" * 64))
try:
    wrong_pin.publish(m.make_internal_payload(candidate, assumptions))
except m.ReplayFailure:
    pass
else:
    raise AssertionError("publisher ignored its pinned result authority")
assert wrong_pin.current() is None

try:
    m.make_internal_payload(candidate, ())
except m.ReplayFailure:
    pass
else:
    raise AssertionError("empty PARI assumption record was accepted")

envelope = json.loads(result.canonical_json)
paths = [
    ("source", "pari_version"),
    ("source", "archive_sha256"),
    ("source", "buch2_sha256"),
    ("candidate", "field_id"),
    ("candidate", "class_number"),
    ("candidate", "invariant_factors", 0),
    ("candidate", "relation_matrix", 0),
    ("candidate", "relation_shape", 0),
    ("candidate", "hnf_matrix", 0),
    ("candidate", "hnf_shape", 0),
    ("candidate", "transformed_logs", 0),
    ("candidate", "regulator_triplet", 0),
    ("candidate", "driver_state", 0),
    ("candidate", "relation_state", 0),
    ("candidate", "owner_lengths", "relation_records"),
    ("candidate", "expected_unit_rank"),
    ("transforms", "shape", 0),
    ("transforms", "presentation", 0),
    ("transforms", "relation_to_presentation", 0),
    ("transforms", "relation_to_presentation_shape", 0),
    ("transforms", "presentation_to_relation", 0),
    ("transforms", "presentation_to_relation_shape", 0),
    ("transforms", "left", 0),
    ("transforms", "left_inverse", 0),
    ("transforms", "right", 0),
    ("transforms", "right_inverse", 0),
    ("transforms", "diagonal", 0),
    ("generators", "entries", 0, "class_vector", 0),
    ("generators", "entries", 0, "order"),
    ("generators", "entries", 0, "relation_coefficients", 0),
    ("generators", "entries", 0, "ideal_hnf", 0),
    ("generators", "entries", 0, "principal_generator", 0),
    ("generators", "entries", 0, "smith_index"),
    ("units", "rank"),
    ("units", "factor_norms", 0),
    ("units", "factor_exponents", 0),
    ("units", "factor_exponent_shape", 0),
    ("units", "claimed_norms", 0),
    ("units", "log_minor_numerators", 0),
    ("units", "log_minor_shape", 0),
    ("units", "log_denominator"),
    ("units", "regulator_determinant_numerator"),
    ("units", "regulator_determinant_denominator"),
    ("units", "log_minor_indices", 0),
    ("units", "candidate_regulator_triplet", 0),
    ("units", "torsion_order"),
    ("units", "torsion_coordinates", 0),
    ("units", "torsion_norm"),
    ("assumptions", 0),
    ("terminal", "status"),
    ("terminal", "schema_components_present"),
    ("terminal", "phase5_complete"),
    ("terminal", "public_complete"),
    ("terminal", "missing_components"),
    ("terminal", "unverified_requirements"),
]

def mutate_at(root, path):
    parent = root["payload"]
    for part in path[:-1]:
        parent = parent[part]
    key = path[-1]
    old = parent[key]
    if isinstance(old, bool):
        parent[key] = not old
    elif isinstance(old, list):
        parent[key] = ["unexpected"]
    else:
        parent[key] = "999999" if old != "999999" else "888888"

# Every currently representable material cell is authenticated.  These
# mutations intentionally retain the old payload digest.
for path in paths:
    changed = copy.deepcopy(envelope)
    mutate_at(changed, path)
    raw = json.dumps(changed, sort_keys=True, separators=(",", ":"))
    try:
        m.cold_replay(raw, authority)
    except m.ReplayFailure:
        pass
    else:
        raise AssertionError(f"mutation was accepted: {path}")

# Recompute the transport hash for selected attacks.  Exact replay or pinned
# authority, rather than the stale digest, must still reject each one.
semantic_paths = [
    ("candidate", "class_number"),
    ("candidate", "relation_matrix", 0),
    ("candidate", "hnf_matrix", 0),
    ("candidate", "expected_unit_rank"),
    ("transforms", "diagonal", 0),
    ("transforms", "relation_to_presentation", 0),
    ("generators", "entries", 0, "order"),
    ("generators", "entries", 0, "class_vector", 0),
    ("units", "claimed_norms", 0),
    ("units", "log_minor_numerators", 0),
    ("units", "regulator_determinant_numerator"),
    ("assumptions", 0),
    ("terminal", "public_complete"),
]
for path in semantic_paths:
    changed = copy.deepcopy(envelope)
    mutate_at(changed, path)
    payload_raw = json.dumps(changed["payload"], sort_keys=True, separators=(",", ":")).encode()
    changed["payload_sha256"] = hashlib.sha256(payload_raw).hexdigest()
    raw = json.dumps(changed, sort_keys=True, separators=(",", ":"))
    try:
        m.cold_replay(raw, authority)
    except m.ReplayFailure:
        pass
    else:
        raise AssertionError(f"semantic mutation was accepted: {path}")

# Retained ideal coordinates are authenticated, but this v1 module does not
# pretend to re-run number-field ideal arithmetic.  A recomputed transport hash
# is still rejected when the publication itself is pinned out of band.
opaque = copy.deepcopy(envelope)
mutate_at(opaque, ("generators", "entries", 0, "ideal_hnf", 0))
opaque_payload = json.dumps(opaque["payload"], sort_keys=True, separators=(",", ":")).encode()
opaque["payload_sha256"] = hashlib.sha256(opaque_payload).hexdigest()
try:
    m.cold_replay(json.dumps(opaque, sort_keys=True, separators=(",", ":")), pinned)
except m.ReplayFailure:
    pass
else:
    raise AssertionError("pinned retained-evidence mutation was accepted")

# Regression for the independent review's coordinated counterexample: unrelated
# relations/HNF/presentation, empty generators, and rank-zero units must not be
# able to acquire even schema-component presence after transport rehashing.
unrelated_candidate = copy.deepcopy(candidate)
unrelated_candidate.update({
    "class_number": "2",
    "invariant_factors": ["2"],
    "relation_shape": ["1", "1"],
    "relation_matrix": ["999"],
    "hnf_shape": ["1", "1"],
    "hnf_matrix": ["123"],
    "expected_unit_rank": "0",
    "relation_state": ["1", "0", "0", "0", "1"],
})
unrelated_transforms = {
    "shape": ["1", "1"],
    "presentation": ["2"],
    "left": ["1"],
    "left_inverse": ["1"],
    "right": ["1"],
    "right_inverse": ["1"],
    "diagonal": ["2"],
    "relation_to_presentation_shape": ["1", "1"],
    "relation_to_presentation": ["1"],
    "presentation_to_relation_shape": ["1", "1"],
    "presentation_to_relation": ["1"],
}
rank_zero_units = copy.deepcopy(units)
rank_zero_units.update({
    "rank": "0",
    "factor_norms": [],
    "factor_exponent_shape": ["0", "0"],
    "factor_exponents": [],
    "claimed_norms": [],
    "log_minor_shape": ["0", "0"],
    "log_minor_numerators": [],
    "log_minor_indices": [],
    "log_denominator": "1",
    "regulator_determinant_numerator": "1",
    "regulator_determinant_denominator": "1",
})
for broken_generators, broken_units in (({"entries": []}, units), (generators, rank_zero_units)):
    try:
        m.make_internal_payload(
            candidate,
            assumptions,
            transforms=transforms,
            generators=broken_generators,
            units=broken_units,
        )
    except m.ReplayFailure:
        pass
    else:
        raise AssertionError("incomplete generator/unit evidence acquired schema presence")
try:
    m.make_internal_payload(
        unrelated_candidate,
        assumptions,
        transforms=unrelated_transforms,
        generators={"entries": []},
        units=rank_zero_units,
    )
except m.ReplayFailure:
    pass
else:
    raise AssertionError("unrelated candidate/presentation evidence published")

# Duplicate keys and a noncanonical exact integer are rejected before replay.
duplicate = result.canonical_json.decode().replace('{"payload":', '{"payload":null,"payload":', 1)
for raw in (duplicate, result.canonical_json.decode().replace('"12"', '"012"', 1)):
    try:
        m.cold_replay(raw, authority)
    except m.ReplayFailure:
        pass
    else:
        raise AssertionError("malformed detached result was accepted")

print(json.dumps({
    "schema": m.SCHEMA,
    "resultSha256": result.sha256,
    "authenticatedMutationCases": len(paths),
    "semanticMutationCases": len(semantic_paths),
    "pinnedRetainedEvidenceCases": 1,
    "publicComplete": False,
    "phase5Complete": False,
    "schemaComponentsPresent": True,
}, sort_keys=True))
`;

const run = spawnSync("python3", ["-c", program, modulePath], {
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const receipt = JSON.parse(run.stdout);
assert.equal(receipt.schema, "sagejs.pari-class-group/internal-result-v1");
assert.equal(receipt.authenticatedMutationCases, 55);
assert.equal(receipt.semanticMutationCases, 13);
assert.equal(receipt.pinnedRetainedEvidenceCases, 1);
assert.equal(receipt.publicComplete, false);
assert.equal(receipt.phase5Complete, false);
assert.equal(receipt.schemaComponentsPresent, true);
console.log(JSON.stringify(receipt));
