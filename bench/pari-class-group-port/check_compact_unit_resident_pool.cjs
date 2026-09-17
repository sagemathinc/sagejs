// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const resident =
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json";
const fixture = path.join(
  __dirname,
  "compact_unit_result_fixture.json",
);

const program = String.raw`
import copy
import hashlib
import importlib
import json
import pathlib
import sys
import tempfile

sys.set_int_max_str_digits(20000)
sys.path.append(sys.argv[1] + "/src/lib")
resident_path, fixture_path = sys.argv[2:]
pool_module = importlib.import_module(
    "bench.pari-class-group-port.compact_unit_resident_pool"
)
compact_module = importlib.import_module(
    "bench.pari-class-group-port.compact_unit_result"
)

resident_pool = pool_module.capture_resident_kernel_pool(resident_path)
assert pool_module.replay_resident_kernel_pool(resident_pool, resident_path) == resident_pool
resident_payload = resident_pool.detached_payload()
factor_pool = resident_payload["factor_pool"]
assert resident_payload["terminal"] == {
    "status": "resident-derived-kernel-factor-pool",
    "answer_derived": False,
    "expanded_inside_matched_workload": False,
}
assert resident_payload["relation_provenance"]["shape"] == ["7", "73"]
assert len(resident_payload["relation_provenance"]["exponents"]) == 511
assert factor_pool["norms"] == ["-1", "-1", "1", "1", "1", "1", "-1"]

# Build the compact publication from its authentic transforms and the new
# resident-derived pool.  The fixture's old replay_factor_pool is never read.
fixture_payload = json.load(open(fixture_path, encoding="utf-8"))
payload = {
    key: copy.deepcopy(fixture_payload[key])
    for key in ("source", "compact_units", "archimedean", "materialization", "terminal")
}
payload["compact_units"]["relation_ids"] = factor_pool["relation_ids"]
payload["compact_units"]["factor_pool_sha256"] = resident_payload[
    "factor_pool_sha256"
]
payload["compact_units"]["factor_norms"] = factor_pool["norms"]
authority = compact_module.CompactUnitAuthority(
    field_id=payload["source"]["field_id"],
    run_id=payload["source"]["run_id"],
    owner_generation=int(payload["source"]["owner_generation"]),
    factor_pool_sha256=resident_payload["factor_pool_sha256"],
    source_fixture_sha256=payload["source"]["source_fixture_sha256"],
    source_trace_sha256=payload["source"]["source_trace_sha256"],
    assumptions=tuple(payload["source"]["assumptions"]),
)
compact = compact_module.publish_compact_units(payload, authority)
assert compact.detached_payload()["materialization"]["expanded_units"] is None
units = pool_module.materialize_resident_compact_units(compact, resident_path)
expected = tuple(
    tuple(int(value) for value in row)
    for row in fixture_payload["expected_materialized_units"]
)
assert units == expected
assert compact.detached_payload()["materialization"]["expanded_units"] is None

def canonical(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    ).encode("ascii")

def rejected_pool(change):
    changed = copy.deepcopy(resident_payload)
    change(changed)
    payload_raw = canonical(changed)
    envelope = {
        "schema": pool_module.SCHEMA,
        "payload": changed,
        "payload_sha256": hashlib.sha256(payload_raw).hexdigest(),
    }
    try:
        pool_module.replay_resident_kernel_pool(canonical(envelope), resident_path)
    except pool_module.ResidentKernelPoolFailure:
        return
    raise AssertionError("coordinated resident kernel-pool mutation was accepted")

pool_mutations = [
    lambda p: p["source"].__setitem__("resident_sha256", "0" * 64),
    lambda p: p["source"].__setitem__("cleanup_transform_sha256", "0" * 64),
    lambda p: p["source"].__setitem__("active_hnf_transform_sha256", "0" * 64),
    lambda p: p["source"].__setitem__("principal_generators_sha256", "0" * 64),
    lambda p: p["relation_provenance"]["exponents"].__setitem__(0, "1"),
    lambda p: p["relation_provenance"].__setitem__("orientation", "relation-by-factor"),
    lambda p: p["factor_pool"]["coordinates"][6].__setitem__(0, "1"),
    lambda p: p["factor_pool"]["norms"].__setitem__(6, "1"),
    lambda p: p["factor_pool"]["relation_ids"].__setitem__(0, "other-kernel"),
    lambda p: p.__setitem__("factor_pool_sha256", "0" * 64),
    lambda p: p["terminal"].__setitem__("answer_derived", True),
    lambda p: p["terminal"].__setitem__("expanded_inside_matched_workload", True),
]
for change in pool_mutations:
    rejected_pool(change)

# Mutation of any resident source owner is rejected before it can become
# factor authority, even if the JSON remains otherwise well formed.
resident = json.load(open(resident_path, encoding="utf-8"))
resident_mutations = [
    lambda p: p["generators"].__setitem__(0, str(int(p["generators"][0]) + 1)),
    lambda p: p["hnf_transform"].__setitem__(0, str(int(p["hnf_transform"][0]) + 1)),
    lambda p: p["hnf_hnf_transform"].__setitem__(0, str(int(p["hnf_hnf_transform"][0]) + 1)),
    lambda p: p["basis_table"].__setitem__(0, str(int(p["basis_table"][0]) + 1)),
]
for change in resident_mutations:
    changed = copy.deepcopy(resident)
    change(changed)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as handle:
        json.dump(changed, handle, separators=(",", ":"))
        handle.flush()
        try:
            pool_module.capture_resident_kernel_pool(handle.name)
        except pool_module.ResidentKernelPoolFailure:
            continue
    raise AssertionError("mutated resident owner was accepted")

# The authentic 2x7 exponent provenance remains part of the compact boundary.
changed_compact = copy.deepcopy(payload)
changed_compact["compact_units"]["exponents"][6] = "2"
try:
    compact_module.publish_compact_units(changed_compact, authority)
except compact_module.CompactUnitFailure:
    pass
else:
    raise AssertionError("mutated unit provenance was accepted")

print(json.dumps({
    "field": payload["source"]["field_id"],
    "originalRelationGenerators": 73,
    "kernelFactors": 7,
    "kernelRelationExponents": 511,
    "residentPoolBytes": len(resident_pool.canonical_json),
    "residentPoolSha256": resident_pool.sha256,
    "poolMutationsRejected": len(pool_mutations),
    "residentMutationsRejected": len(resident_mutations),
    "unitProvenanceMutationsRejected": 1,
    "exactUnitsMatchIndependentPariOracle": True,
    "answerDerivedFactors": False,
    "expandedInsideMatchedWorkload": False,
}, sort_keys=True))
`;

const result = spawnSync(
  "/usr/bin/python3",
  ["-c", program, repo, path.resolve(resident), fixture],
  {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
