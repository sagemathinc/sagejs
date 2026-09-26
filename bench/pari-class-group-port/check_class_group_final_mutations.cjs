"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: all

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const fixture = path.join(
  __dirname,
  "class_group_final_mutation_fixture.json",
);

const program = String.raw`
import copy
import dataclasses
import hashlib
import importlib
import json
import pathlib
import sys

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
m = importlib.import_module("bench.pari-class-group-port.class_group_final_state")
internal = importlib.import_module("bench.pari-class-group-port.class_group_internal_result")

fixture_path = pathlib.Path(sys.argv[2])
fixture = json.loads(fixture_path.read_text())
assert fixture.pop("schema") == "sagejs.pari-class-group/final-mutation-fixture-v1"

def canonical(value):
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")

def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()

field_id = fixture["field_id"]
run_id = fixture["run_id"]
generation = fixture["owner_generation"]
assumptions = tuple(fixture["assumptions"])
layout = internal.PreparedCandidateLayout(*fixture["layout"])
state = fixture["state"]
candidate = internal.snapshot_prepared_candidate(state, layout, field_id)
candidate_hash = m.canonical_component_sha256(candidate)
transforms = fixture["transforms"]
generators = fixture["generators"]
units = fixture["units"]
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
    run_id,
    generation,
    "getfu-and-cleanarch-complete",
    candidate_hash,
    transform_hash,
    units,
)
generator_output = m.ClassGeneratorComponentOutput(
    run_id,
    generation,
    "class-group-gen-complete",
    candidate_hash,
    transform_hash,
    generators,
)
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
    fixture["source_state"],
)
live_authority = m.ConnectedReplayAuthority(
    field_id, assumptions, run_id, generation
)
published = m.ConnectedFinalStateAssembler(live_authority).assemble_and_publish(
    relation_output,
    transform_output,
    unit_output,
    generator_output,
    driver_output,
    assumptions,
)
pinned = m.ConnectedReplayAuthority(
    field_id, assumptions, run_id, generation, published.sha256
)
assert m.cold_replay_connected_final_state(published, pinned) == published
baseline = json.loads(published.canonical_json)

def nested_payload(envelope):
    return envelope["payload"]["partial_result"]["payload"]

def rehash(envelope):
    inner = envelope["payload"]["partial_result"]
    inner["payload_sha256"] = hashlib.sha256(canonical(inner["payload"])).hexdigest()
    partial = inner["payload"]
    provenance = envelope["payload"]["provenance"]
    provenance["candidate_sha256"] = digest(partial["candidate"])
    provenance["transforms_sha256"] = digest(partial["transforms"])
    provenance["generators_sha256"] = digest(partial["generators"])
    provenance["units_sha256"] = digest(envelope["payload"]["unit_evidence"])
    envelope["payload_sha256"] = hashlib.sha256(
        canonical(envelope["payload"])
    ).hexdigest()
    raw = canonical(envelope)
    authority = m.ConnectedReplayAuthority(
        field_id,
        assumptions,
        run_id,
        generation,
        hashlib.sha256(raw).hexdigest(),
    )
    return raw, authority

def expect_semantic_rejection(name, mutate):
    changed = copy.deepcopy(baseline)
    mutate(changed)
    raw, attacker_authority = rehash(changed)
    try:
        m.cold_replay_connected_final_state(raw, attacker_authority)
    except m.AssemblyFailure:
        return {"name": name, "guard": "independent-replay"}
    raise AssertionError(name + " mutation survived coordinated rehash")

def expect_authority_rejection(name, mutate):
    changed = copy.deepcopy(baseline)
    mutate(changed)
    raw, _ = rehash(changed)
    try:
        m.cold_replay_connected_final_state(raw, pinned)
    except m.AssemblyFailure:
        return {"name": name, "guard": "publisher-pinned-retained-state"}
    raise AssertionError(name + " mutation survived pinned publication replay")

semantic_cases = (
    (
        "relation",
        lambda e: nested_payload(e)["candidate"]["relation_matrix"].__setitem__(0, "7"),
    ),
    (
        "transform",
        lambda e: nested_payload(e)["transforms"]["left"].__setitem__(0, "2"),
    ),
    (
        "unit-factor",
        lambda e: e["payload"]["unit_evidence"]["factor_exponents"].__setitem__(0, "0"),
    ),
    (
        "log-cell",
        lambda e: e["payload"]["unit_evidence"]["packed_log_words"].__setitem__(0, "3"),
    ),
    (
        "regulator-evidence",
        lambda e: e["payload"]["unit_evidence"].__setitem__(
            "regulator_determinant_numerator", "6"
        ),
    ),
    (
        "torsion",
        lambda e: e["payload"]["unit_evidence"].__setitem__("torsion_order", "0"),
    ),
    (
        "invariant-factor",
        lambda e: nested_payload(e)["candidate"]["invariant_factors"].__setitem__(0, "7"),
    ),
    (
        "owner-length",
        lambda e: nested_payload(e)["candidate"]["owner_lengths"].__setitem__(
            "relation_records", "3"
        ),
    ),
    (
        "assumption-flag",
        lambda e: nested_payload(e)["assumptions"].__setitem__(
            0, "PARI correspondence assumption was removed"
        ),
    ),
    (
        "terminal-status",
        lambda e: e["payload"]["terminal"].__setitem__(
            "status", "connected-source-state-reopened"
        ),
    ),
)

results = [expect_semantic_rejection(name, mutate) for name, mutate in semantic_cases]

# The current connected schema explicitly records exact ideal arithmetic as an
# unverified requirement.  Its principal-generator coordinates are retained
# material, not independently checked field arithmetic.  Mutation is still
# impossible under the out-of-band immutable publication authority.  This test
# deliberately does not relabel that hash pin as an exact ideal proof.
results.append(
    expect_authority_rejection(
        "ideal-generator",
        lambda e: nested_payload(e)["generators"]["entries"][0][
            "principal_generator"
        ].__setitem__(0, "2"),
    )
)

# Publication owns detached bytes: changing every original live owner after
# publication cannot alter either the immutable result or its replay.
before = published.canonical_json
state["relation_records"][0] = 999999
transforms["left"][0] = "999999"
generators["entries"][0]["principal_generator"][0] = "999999"
units["packed_log_words"][0] = "999999"
fixture["source_state"]["M2"]["entries"][0] = 999999
assert published.canonical_json == before
assert m.cold_replay_connected_final_state(published, pinned) == published

assert {result["name"] for result in results} == {
    "relation",
    "transform",
    "ideal-generator",
    "unit-factor",
    "log-cell",
    "regulator-evidence",
    "torsion",
    "invariant-factor",
    "owner-length",
    "assumption-flag",
    "terminal-status",
}
print(json.dumps({
    "schema": "sagejs.pari-class-group/final-mutation-replay-v1",
    "connectedSchema": m.CONNECTED_SCHEMA,
    "mutationCount": len(results),
    "independentlyReplayed": sum(
        result["guard"] == "independent-replay" for result in results
    ),
    "publisherPinnedRetained": sum(
        result["guard"] == "publisher-pinned-retained-state" for result in results
    ),
    "mutations": results,
    "phase5Complete": False,
    "publicComplete": False,
    "publicationSha256": published.sha256,
}, sort_keys=True))
`;

const result = spawnSync("python3", ["-c", program, repo, fixture], {
  cwd: repo,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: 120000,
});
assert.equal(result.status, 0, result.stderr || String(result.error));
const receipt = JSON.parse(result.stdout);
assert.equal(receipt.mutationCount, 11);
assert.equal(receipt.independentlyReplayed, 10);
assert.equal(receipt.publisherPinnedRetained, 1);
assert.equal(receipt.phase5Complete, false);
assert.equal(receipt.publicComplete, false);
process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
