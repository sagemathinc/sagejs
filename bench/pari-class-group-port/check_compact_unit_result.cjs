// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const program = String.raw`
import copy
import hashlib
import importlib.util
import json
import sys

module_path, fixture_path = sys.argv[1:]
spec = importlib.util.spec_from_file_location("compact_unit_result", module_path)
assert spec is not None and spec.loader is not None
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)
fixture = json.load(open(fixture_path, encoding="utf-8"))

payload = {key: copy.deepcopy(fixture[key]) for key in (
    "source", "compact_units", "archimedean", "materialization", "terminal"
)}
authority = m.CompactUnitAuthority(
    field_id=payload["source"]["field_id"],
    run_id=payload["source"]["run_id"],
    owner_generation=int(payload["source"]["owner_generation"]),
    factor_pool_sha256=payload["compact_units"]["factor_pool_sha256"],
    source_fixture_sha256=payload["source"]["source_fixture_sha256"],
    source_trace_sha256=payload["source"]["source_trace_sha256"],
    assumptions=tuple(payload["source"]["assumptions"]),
)
published = m.publish_compact_units(payload, authority)
assert published.detached_payload() == payload
assert published.detached_payload()["materialization"] == {
    "status": "not-requested",
    "expanded_units": None,
    "policy": "separate-hash-authorized-replay",
}
assert b"expected_materialized_units" not in published.canonical_json
assert b"coordinates" not in published.canonical_json

# Caller-owned mutations cannot alter an already-published result.
payload["compact_units"]["exponents"][6] = "99"
payload["archimedean"]["packed_logs"][0] = "99"
assert published.detached_payload()["compact_units"]["exponents"][6] == "1"
assert published.detached_payload()["archimedean"]["packed_logs"][0] != "99"

pinned = m.CompactUnitAuthority(
    field_id=authority.field_id,
    run_id=authority.run_id,
    owner_generation=authority.owner_generation,
    factor_pool_sha256=authority.factor_pool_sha256,
    source_fixture_sha256=authority.source_fixture_sha256,
    source_trace_sha256=authority.source_trace_sha256,
    assumptions=authority.assumptions,
    expected_sha256=published.sha256,
)
assert m.cold_replay_compact_units(published, pinned) == published
assert m.cold_replay_compact_units(published.canonical_json, pinned) == published

units = m.materialize_cubic_compact_units(
    published,
    fixture["replay_factor_pool"],
    fixture["multiplication_basis"],
)
expected = tuple(tuple(int(value) for value in row) for row in fixture["expected_materialized_units"])
assert units == expected
# Explicit replay does not modify or enlarge the compact publication.
assert m.cold_replay_compact_units(published, pinned) == published
assert published.detached_payload()["materialization"]["expanded_units"] is None

def canonical(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    ).encode("ascii")

def rewrapped(changed):
    payload_raw = canonical(changed)
    envelope = {
        "schema": m.COMPACT_UNIT_SCHEMA,
        "payload": changed,
        "payload_sha256": hashlib.sha256(payload_raw).hexdigest(),
    }
    raw = canonical(envelope)
    changed_authority = m.CompactUnitAuthority(
        field_id=authority.field_id,
        run_id=authority.run_id,
        owner_generation=authority.owner_generation,
        factor_pool_sha256=authority.factor_pool_sha256,
        source_fixture_sha256=authority.source_fixture_sha256,
        source_trace_sha256=authority.source_trace_sha256,
        assumptions=authority.assumptions,
        expected_sha256=hashlib.sha256(raw).hexdigest(),
    )
    return raw, changed_authority

def rejected(changed):
    raw, changed_authority = rewrapped(changed)
    try:
        m.cold_replay_compact_units(raw, changed_authority)
    except m.CompactUnitFailure:
        return
    raise AssertionError("coordinated compact-unit mutation was accepted")

original = published.detached_payload()
mutations = []
def mutation(change):
    changed = copy.deepcopy(original)
    change(changed)
    mutations.append(changed)

mutation(lambda p: p["source"].__setitem__("field_id", "x^3-x+1"))
mutation(lambda p: p["source"].__setitem__("run_id", "other-run"))
mutation(lambda p: p["source"].__setitem__("owner_generation", "2"))
mutation(lambda p: p["source"].__setitem__("pari_version", "2.15.4"))
mutation(lambda p: p["source"].__setitem__("source_fixture_sha256", "0" * 64))
mutation(lambda p: p["source"].__setitem__("source_trace_sha256", "0" * 64))
mutation(lambda p: p["source"]["assumptions"].reverse())
mutation(lambda p: p["compact_units"].__setitem__("rank", "3"))
mutation(lambda p: p["compact_units"]["relation_ids"].__setitem__(0, "relation-1"))
mutation(lambda p: p["compact_units"].__setitem__("factor_pool_sha256", "0" * 64))
mutation(lambda p: p["compact_units"]["factor_norms"].__setitem__(6, "1"))
mutation(lambda p: p["compact_units"]["unit_transform"].__setitem__(6, "2"))
mutation(lambda p: p["compact_units"]["getfu_factor"].__setitem__(0, "2"))
mutation(lambda p: p["compact_units"]["exponents"].__setitem__(6, "2"))
mutation(lambda p: p["compact_units"]["claimed_norms"].__setitem__(0, "1"))
mutation(lambda p: p["archimedean"].__setitem__("place_count", "2"))
mutation(lambda p: p["archimedean"]["packed_logs"].__setitem__(1, "9000"))
mutation(lambda p: p["archimedean"]["phases"].__setitem__(0, "2"))
mutation(lambda p: p["archimedean"]["regulator_triplet"].__setitem__(0, "-1"))
mutation(lambda p: p["materialization"].__setitem__("status", "expanded"))
mutation(lambda p: p["materialization"].__setitem__("expanded_units", [["1", "0", "0"]]))
mutation(lambda p: p["terminal"].__setitem__("public_complete", True))
mutation(lambda p: p["terminal"].__setitem__("unit_saturation_certified", True))
mutation(lambda p: p["terminal"].__setitem__("correspondence_complete", False))
for changed in mutations:
    rejected(changed)

def rejected_materialization(pool=None, tensor=None):
    try:
        m.materialize_cubic_compact_units(
            published,
            fixture["replay_factor_pool"] if pool is None else pool,
            fixture["multiplication_basis"] if tensor is None else tensor,
        )
    except m.CompactUnitFailure:
        return
    raise AssertionError("mutated compact-unit materialization was accepted")

pool = copy.deepcopy(fixture["replay_factor_pool"])
pool["coordinates"][6][0] = str(int(pool["coordinates"][6][0]) + 1)
rejected_materialization(pool=pool)
pool = copy.deepcopy(fixture["replay_factor_pool"])
pool["norms"][6] = "1"
rejected_materialization(pool=pool)
pool = copy.deepcopy(fixture["replay_factor_pool"])
pool["relation_ids"][0] = "other-relation"
rejected_materialization(pool=pool)
tensor = copy.deepcopy(fixture["multiplication_basis"])
tensor[0] = str(int(tensor[0]) + 1)
rejected_materialization(tensor=tensor)

print(json.dumps({
    "field": authority.field_id,
    "rank": 2,
    "relationFactors": 7,
    "resultBytes": len(published.canonical_json),
    "resultSha256": published.sha256,
    "semanticMutationsRejected": len(mutations),
    "materializationMutationsRejected": 4,
    "expandedOnlyAfterExplicitReplay": True,
    "exactUnitsMatchPristinePari": True,
}, sort_keys=True))
`;

const result = spawnSync(
  "/usr/bin/python3",
  [
    "-c",
    program,
    path.join(__dirname, "compact_unit_result.py"),
    path.join(__dirname, "compact_unit_result_fixture.json"),
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
