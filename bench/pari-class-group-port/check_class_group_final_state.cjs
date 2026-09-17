"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const program = String.raw`
import copy
import hashlib
import importlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
m = importlib.import_module("bench.pari-class-group-port.class_group_final_state")
internal = importlib.import_module("bench.pari-class-group-port.class_group_internal_result")

assumptions = tuple(sorted((
    "PARI 2.17.4 heuristic bounds and floating decisions are assumed",
    "GRH-dependent factor-base policy inherited from PARI 2.17.4",
)))
run_id = "synthetic-connected-run-1"
field_id = "synthetic:x^2+5"
generation = 7
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
layout = internal.PreparedCandidateLayout(2, 2, 2, 2, 4, 2, 2)
candidate = internal.snapshot_prepared_candidate(state, layout, field_id)
candidate_hash = m.canonical_component_sha256(candidate)
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
    # The selected source words are linked exactly, but are never treated as
    # rational numerators.  The rational enclosure is a separate derivation.
    "packed_log_ranges": [["0", "1"], ["1", "1"], ["2", "1"], ["3", "1"]],
    "packed_log_words": ["2", "1", "1", "3"],
    "derived_log_minor_shape": ["2", "2"],
    "derived_log_minor_numerators": ["2", "1", "1", "3"],
    "derived_log_denominator": "2",
    "derived_from_packed_sha256": "pending",
    "derivation_method": "independent-rational-enclosure-v1",
    "regulator_determinant_numerator": "5",
    "regulator_determinant_denominator": "4",
    "candidate_regulator_triplet": ["5", "53", "-2"],
    "torsion_order": "2",
    "torsion_coordinates": ["-1", "0"],
    "torsion_norm": "1",
}
units["derived_from_packed_sha256"] = m.canonical_component_sha256({
    "ranges": units["packed_log_ranges"],
    "words": units["packed_log_words"],
})
transform_hash = m.canonical_component_sha256(transforms)
unit_hash = m.canonical_component_sha256(units)
generator_hash = m.canonical_component_sha256(generators)

relation_output = m.RelationComponentOutput(
    run_id, field_id, generation, "candidate-accepted", state, layout
)
transform_output = m.TransformComponentOutput(
    run_id, generation, "smith-and-hnf-complete", candidate_hash, transforms
)
unit_output = m.UnitComponentOutput(
    run_id, generation, "getfu-and-cleanarch-complete", candidate_hash,
    transform_hash, units
)
generator_output = m.ClassGeneratorComponentOutput(
    run_id,
    generation,
    "class-group-gen-complete",
    candidate_hash,
    transform_hash,
    generators,
)
source_state = {
    "M1": [1, 0, 0, 1],
    "M2": [1, 1, 0, 1],
    "Ga": [1, 2],
    "Ge": [3, 4],
    "GD": [6, 2],
    "ga": [5, 7],
    "clg2": [12, 2, 6],
}
driver_output = m.FinalDriverComponentOutput(
    run_id,
    generation,
    "buchall-end-assembled",
    "verified",
    "accepted",
    candidate_hash,
    transform_hash,
    unit_hash,
    generator_hash,
    source_state,
)
authority = m.ConnectedReplayAuthority(field_id, assumptions, run_id, generation)

# Authentic partial relation output cannot publish without each source-required
# suffix component, and no failed attempt exposes a partial result.
missing_cases = (
    (None, unit_output, generator_output, driver_output),
    (transform_output, None, generator_output, driver_output),
    (transform_output, unit_output, None, driver_output),
    (transform_output, unit_output, generator_output, None),
)
missing_relation = m.ConnectedFinalStateAssembler(authority)
try:
    missing_relation.assemble_and_publish(
        None, transform_output, unit_output, generator_output, driver_output, assumptions
    )
except m.AssemblyFailure:
    pass
else:
    raise AssertionError("connected state published without relations")
assert missing_relation.current() is None
for suffix in missing_cases:
    assembler = m.ConnectedFinalStateAssembler(authority)
    try:
        assembler.assemble_and_publish(relation_output, *suffix, assumptions)
    except m.AssemblyFailure:
        pass
    else:
        raise AssertionError("authentic partial state published without its suffix")
    assert assembler.current() is None

assembler = m.ConnectedFinalStateAssembler(authority)
result = assembler.assemble_and_publish(
    relation_output,
    transform_output,
    unit_output,
    generator_output,
    driver_output,
    assumptions,
)
assert result.partial_result.detached_payload()["terminal"]["phase5_complete"] is False
pinned = m.ConnectedReplayAuthority(field_id, assumptions, run_id, generation, result.sha256)
assert m.cold_replay_connected_final_state(result, pinned) == result
try:
    m.cold_replay_connected_final_state(result, authority)
except m.AssemblyFailure:
    pass
else:
    raise AssertionError("cold replay accepted no publisher authority")
assert assembler.assemble_and_publish(
    relation_output,
    transform_output,
    unit_output,
    generator_output,
    driver_output,
    assumptions,
) is result
with ThreadPoolExecutor(max_workers=8) as pool:
    repeated = lambda _: assembler.assemble_and_publish(
        relation_output,
        transform_output,
        unit_output,
        generator_output,
        driver_output,
        assumptions,
    )
    assert all(item is result for item in pool.map(repeated, range(32)))

# The real equal-bound h=1 target has substantive rank-two units but no Smith
# generators.  Empty generator evidence is therefore a valid complete spanning
# set when (and only when) every Smith factor is trivial.
trivial_state = copy.deepcopy(state)
trivial_state["relation_records"][:4] = [1, 0, 0, 1]
trivial_state["hnf_result_h"][:4] = [1, 0, 0, 1]
trivial_state["class_invariants"][:2] = [1, 1]
trivial_state["class_number"][0] = 1
trivial_layout = internal.PreparedCandidateLayout(2, 2, 2, 2, 4, 0, 2)
trivial_candidate = internal.snapshot_prepared_candidate(
    trivial_state, trivial_layout, field_id
)
trivial_candidate_hash = m.canonical_component_sha256(trivial_candidate)
trivial_transforms = copy.deepcopy(transforms)
trivial_transforms["presentation"] = ["1", "0", "0", "1"]
trivial_transforms["diagonal"] = ["1", "0", "0", "1"]
trivial_transform_hash = m.canonical_component_sha256(trivial_transforms)
trivial_generators = {"entries": []}
trivial_generator_hash = m.canonical_component_sha256(trivial_generators)
trivial_units = copy.deepcopy(units)
trivial_unit_hash = m.canonical_component_sha256(trivial_units)
trivial_source = copy.deepcopy(source_state)
trivial_source["GD"] = [1, 1]
trivial_source["clg2"] = [1, 0]
trivial_result = m.ConnectedFinalStateAssembler(authority).assemble_and_publish(
    m.RelationComponentOutput(run_id, field_id, generation, "candidate-accepted", trivial_state, trivial_layout),
    m.TransformComponentOutput(run_id, generation, "smith-and-hnf-complete", trivial_candidate_hash, trivial_transforms),
    m.UnitComponentOutput(run_id, generation, "getfu-and-cleanarch-complete", trivial_candidate_hash, trivial_transform_hash, trivial_units),
    m.ClassGeneratorComponentOutput(run_id, generation, "class-group-gen-complete", trivial_candidate_hash, trivial_transform_hash, trivial_generators),
    m.FinalDriverComponentOutput(
        run_id, generation, "buchall-end-assembled", "verified", "accepted",
        trivial_candidate_hash, trivial_transform_hash, trivial_unit_hash,
        trivial_generator_hash, trivial_source,
    ),
    assumptions,
)
assert trivial_result.partial_result.detached_payload()["generators"] == {"entries": []}

# Every source provenance link is mandatory and stale outputs fail before the
# atomic publication point.
bad_components = [
    m.TransformComponentOutput(run_id, generation, "smith-and-hnf-complete", "0" * 64, transforms),
    m.UnitComponentOutput(run_id, generation, "getfu-and-cleanarch-complete", "0" * 64, transform_hash, units),
    m.ClassGeneratorComponentOutput(run_id, generation, "class-group-gen-complete", candidate_hash, "0" * 64, generators),
    m.FinalDriverComponentOutput(run_id, generation, "buchall-end-assembled", "verified", "accepted", candidate_hash, transform_hash, unit_hash, "0" * 64, source_state),
]
for index, bad_component in enumerate(bad_components):
    parts = [transform_output, unit_output, generator_output, driver_output]
    parts[index] = bad_component
    rejected = m.ConnectedFinalStateAssembler(authority)
    try:
        rejected.assemble_and_publish(relation_output, *parts, assumptions)
    except m.AssemblyFailure:
        pass
    else:
        raise AssertionError("stale connected component published")
    assert rejected.current() is None

# Missing final source state and invalid source decisions fail closed.
for changed in (
    m.FinalDriverComponentOutput(run_id, generation, "buchall-end-assembled", "verified", "accepted", candidate_hash, transform_hash, unit_hash, generator_hash, {k:v for k,v in source_state.items() if k != "M2"}),
    m.FinalDriverComponentOutput(run_id, generation, "buchall-end-assembled", "not-run", "accepted", candidate_hash, transform_hash, unit_hash, generator_hash, source_state),
    m.FinalDriverComponentOutput(run_id, generation, "buchall-end-assembled", "verified", "retry", candidate_hash, transform_hash, unit_hash, generator_hash, source_state),
):
    rejected = m.ConnectedFinalStateAssembler(authority)
    try:
        rejected.assemble_and_publish(relation_output, transform_output, unit_output, generator_output, changed, assumptions)
    except m.AssemblyFailure:
        pass
    else:
        raise AssertionError("incomplete final driver output published")
    assert rejected.current() is None

# A connected conflict cannot replace the first terminal result.
changed_state = copy.deepcopy(source_state)
changed_state["M2"][0] = 9
changed_driver = m.FinalDriverComponentOutput(
    run_id, generation, "buchall-end-assembled", "verified", "accepted",
    candidate_hash, transform_hash, unit_hash, generator_hash, changed_state,
)
try:
    assembler.assemble_and_publish(
        relation_output, transform_output, unit_output, generator_output,
        changed_driver, assumptions,
    )
except m.AssemblyConflict:
    pass
else:
    raise AssertionError("connected conflict replaced the terminal result")
assert assembler.current() is result

envelope = json.loads(result.canonical_json)

# A separately valid v1 candidate-only partial is an authentic partial result,
# not malformed JSON.  It still cannot substitute for the linked v2 embedded
# result, even after the attacker rehashes both envelopes.
candidate_only_payload = internal.make_internal_payload(candidate, assumptions)
candidate_only = internal.AtomicResultPublisher(
    internal.ReplayAuthority(field_id, assumptions)
).publish(candidate_only_payload)
candidate_only_envelope = json.loads(candidate_only.canonical_json)
partial_substitution = copy.deepcopy(envelope)
partial_substitution["payload"]["partial_result"] = candidate_only_envelope
partial_payload_raw = json.dumps(
    partial_substitution["payload"], sort_keys=True, separators=(",", ":")
).encode()
partial_substitution["payload_sha256"] = hashlib.sha256(partial_payload_raw).hexdigest()
try:
    m.cold_replay_connected_final_state(
        json.dumps(partial_substitution, sort_keys=True, separators=(",", ":")),
        m.ConnectedReplayAuthority(
            field_id, assumptions, run_id, generation,
            hashlib.sha256(json.dumps(partial_substitution, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        ),
    )
except m.AssemblyFailure:
    pass
else:
    raise AssertionError("authentic candidate-only partial substituted into v2")
paths = [
    ("provenance", "run_id"),
    ("provenance", "field_id"),
    ("provenance", "owner_generation"),
    ("provenance", "candidate_sha256"),
    ("provenance", "transforms_sha256"),
    ("provenance", "units_sha256"),
    ("provenance", "generators_sha256"),
    ("driver", "terminal_status"),
    ("driver", "honesty_status"),
    ("driver", "cleanarch_status"),
    ("driver", "source_state", "M1", 0),
    ("driver", "source_state", "M2", 0),
    ("driver", "source_state", "Ga", 0),
    ("driver", "source_state", "Ge", 0),
    ("driver", "source_state", "GD", 0),
    ("driver", "source_state", "ga", 0),
    ("driver", "source_state", "clg2", 0),
    ("terminal", "status"),
    ("terminal", "all_source_components_present"),
    ("terminal", "phase5_complete"),
    ("terminal", "public_complete"),
    ("terminal", "unverified_requirements"),
    ("partial_result", "payload", "candidate", "class_number"),
]

def mutate(root, path):
    node = root["payload"]
    for part in path[:-1]:
        node = node[part]
    key = path[-1]
    old = node[key]
    if isinstance(old, bool):
        node[key] = not old
    elif isinstance(old, list):
        node[key] = ["changed"]
    else:
        node[key] = "changed" if old != "changed" else "changed-again"

for path in paths:
    changed = copy.deepcopy(envelope)
    mutate(changed, path)
    raw = json.dumps(changed, sort_keys=True, separators=(",", ":"))
    try:
        m.cold_replay_connected_final_state(raw, authority)
    except m.AssemblyFailure:
        pass
    else:
        raise AssertionError(f"connected mutation was accepted: {path}")

# Rehashed semantic changes are rejected independently. Final source vectors are
# retained source outputs rather than re-derived mathematics, so their stronger
# mutation authority is the pinned connected publication hash.
semantic_paths = [
    ("provenance", "run_id"),
    ("provenance", "candidate_sha256"),
    ("driver", "honesty_status"),
    ("terminal", "phase5_complete"),
    ("partial_result", "payload", "candidate", "class_number"),
    ("unit_evidence", "packed_log_words", 0),
]
for path in semantic_paths:
    changed = copy.deepcopy(envelope)
    mutate(changed, path)
    changed_payload = json.dumps(changed["payload"], sort_keys=True, separators=(",", ":")).encode()
    changed["payload_sha256"] = hashlib.sha256(changed_payload).hexdigest()
    changed_raw = json.dumps(changed, sort_keys=True, separators=(",", ":"))
    changed_authority = m.ConnectedReplayAuthority(
        field_id, assumptions, run_id, generation,
        hashlib.sha256(changed_raw.encode()).hexdigest(),
    )
    try:
        m.cold_replay_connected_final_state(
            changed_raw, changed_authority
        )
    except m.AssemblyFailure:
        pass
    else:
        raise AssertionError(f"rehashed connected mutation was accepted: {path}")

# These are the two-way relation/presentation witnesses and V inverse required
# by the actual Smith replay, not merely retained metadata.  Even an attacker
# who rehashes both nested envelopes and supplies the resulting outer digest
# cannot make a false witness replay.
linked_witness_paths = [
    ("right_inverse", 0),
    ("relation_to_presentation", 0),
    ("presentation_to_relation", 0),
]
for key, index in linked_witness_paths:
    changed = copy.deepcopy(envelope)
    inner = changed["payload"]["partial_result"]
    inner["payload"]["transforms"][key][index] = "2"
    inner_payload_raw = json.dumps(
        inner["payload"], sort_keys=True, separators=(",", ":")
    ).encode()
    inner["payload_sha256"] = hashlib.sha256(inner_payload_raw).hexdigest()
    changed_payload_raw = json.dumps(
        changed["payload"], sort_keys=True, separators=(",", ":")
    ).encode()
    changed["payload_sha256"] = hashlib.sha256(changed_payload_raw).hexdigest()
    changed_raw = json.dumps(changed, sort_keys=True, separators=(",", ":"))
    changed_authority = m.ConnectedReplayAuthority(
        field_id, assumptions, run_id, generation,
        hashlib.sha256(changed_raw.encode()).hexdigest(),
    )
    try:
        m.cold_replay_connected_final_state(changed_raw, changed_authority)
    except m.AssemblyFailure:
        pass
    else:
        raise AssertionError(f"rehashed Smith linkage mutation accepted: {key}")

retained = copy.deepcopy(envelope)
mutate(retained, ("driver", "source_state", "M1", 0))
retained_payload = json.dumps(retained["payload"], sort_keys=True, separators=(",", ":")).encode()
retained["payload_sha256"] = hashlib.sha256(retained_payload).hexdigest()
try:
    m.cold_replay_connected_final_state(
        json.dumps(retained, sort_keys=True, separators=(",", ":")), pinned
    )
except m.AssemblyFailure:
    pass
else:
    raise AssertionError("pinned final source-state mutation was accepted")

wrong_pin = m.ConnectedReplayAuthority(field_id, assumptions, run_id, generation, "0" * 64)
pin_publisher = m.ConnectedFinalStateAssembler(wrong_pin)
try:
    pin_publisher.assemble_and_publish(
        relation_output, transform_output, unit_output, generator_output,
        driver_output, assumptions,
    )
except m.AssemblyFailure:
    pass
else:
    raise AssertionError("assembler ignored connected publication authority")
assert pin_publisher.current() is None

print(json.dumps({
    "schema": m.CONNECTED_SCHEMA,
    "sha256": result.sha256,
    "sourceRequiredRejections": 1 + len(missing_cases) + len(bad_components) + 3 + 1,
    "authenticatedMutations": len(paths),
    "semanticMutations": len(semantic_paths),
    "linkedWitnessMutations": len(linked_witness_paths),
    "pinnedRetainedMutations": 1,
    "phase5Complete": False,
    "publicComplete": False,
    "trivialClassGeneratorCount": 0,
}, sort_keys=True))
`;

const run = spawnSync("python3", ["-c", program, repo], {
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const receipt = JSON.parse(run.stdout);
assert.equal(receipt.schema, "sagejs.pari-class-group/connected-final-state-v2");
assert.equal(receipt.sourceRequiredRejections, 13);
assert.equal(receipt.authenticatedMutations, 23);
assert.equal(receipt.semanticMutations, 6);
assert.equal(receipt.linkedWitnessMutations, 3);
assert.equal(receipt.pinnedRetainedMutations, 1);
assert.equal(receipt.phase5Complete, false);
assert.equal(receipt.publicComplete, false);
assert.equal(receipt.trivialClassGeneratorCount, 0);
console.log(JSON.stringify(receipt));
