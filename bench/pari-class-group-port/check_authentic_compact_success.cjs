#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildRegulatorAuthority } = require("./build_regulator_authority.cjs");

const root = path.resolve(__dirname, "../..");
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);

function run(command, args, options = {}) {
  const answer = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 240000,
    ...options,
  });
  assert.equal(answer.status, 0, answer.stderr || String(answer.error));
  return answer.stdout;
}

async function main() {
  const runtimeRoot = path.resolve(
    process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root,
  );
  const regulatorAuthority = await buildRegulatorAuthority();
  const oracle = JSON.parse(
    run("node", [
      path.join(
        runtimeRoot,
        "bench/pari-class-group-port/check_unit_bridge_cubic.cjs",
      ),
    ], {
      cwd: runtimeRoot,
      env: { ...process.env, SAGEJS_DUMP_UNIT_ORACLE: "1" },
    }),
  );
  const program = String.raw`
import copy
import dataclasses
import decimal
import hashlib
import importlib
import json
import pathlib
import sys
import tempfile
import typing

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
success_module = importlib.import_module(
    "bench.pari-class-group-port.class_group_authentic_success"
)
composer = importlib.import_module(
    "bench.pari-class-group-port.authentic_compact_success"
)
resident = sys.argv[2]
fixture = sys.argv[3]
oracle = json.loads(sys.argv[4])
regulator_authority = json.loads(sys.argv[5])

success = success_module.build_authentic_success_payload(
    resident, fixture, oracle, regulator_authority
)
result = composer.compose_authentic_compact_success(success, resident)
authority = composer.AuthenticCompactSuccessAuthority(result.sha256)
assert composer.cold_replay_authentic_compact_success(
    result, authority, success, resident
) == result
payload = result.detached_payload()
compact = payload["compact_units"]
assert payload["class_group"] == {"class_number": "1", "invariant_factors": []}
assert compact["rank"] == "2"
assert compact["exponent_shape"] == ["2", "7"]
assert compact["exponents"] == [
    "0", "0", "0", "0", "0", "0", "1",
    "0", "0", "0", "0", "0", "1", "-1",
]
assert compact["factor_norms"] == ["-1", "-1", "1", "1", "1", "1", "-1"]
assert compact["expanded_units"] is None
assert compact["materialization"] == "separate-qualified-resident-replay"
assert payload["terminal"] == {
    "status": "authentic-h1-success-with-genuine-compact-units",
    "phase5_complete": False,
    "public_complete": False,
    "unit_saturation_certified": False,
    "answer_derived_factor_pool": False,
    "expanded_inside_matched_workload": False,
    "internal_unverified_requirements": ["remove-live-pari-unit-oracle-input"],
    "public_unverified_requirements": [
        "independent-unit-saturation-index-one-certificate",
        "independent-factor-base-relation-completeness-certificate",
    ],
}
assert b"replay_factor_pool" not in result.canonical_json
assert b"expected_materialized_units" not in result.canonical_json
assert b"coordinates" not in result.canonical_json

def canonical(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    ).encode("ascii")

def rejected_composition(change):
    changed = copy.deepcopy(payload)
    change(changed)
    payload_raw = canonical(changed)
    envelope = {
        "schema": composer.SCHEMA,
        "payload": changed,
        "payload_sha256": hashlib.sha256(payload_raw).hexdigest(),
    }
    raw = canonical(envelope)
    changed_authority = composer.AuthenticCompactSuccessAuthority(
        hashlib.sha256(raw).hexdigest()
    )
    try:
        composer.cold_replay_authentic_compact_success(
            raw, changed_authority, success, resident
        )
    except composer.AuthenticCompactSuccessFailure:
        return
    raise AssertionError("coordinated compact-success mutation was accepted")

composition_mutations = [
    lambda p: p["source"].__setitem__("authentic_success_sha256", "0" * 64),
    lambda p: p["source"].__setitem__("resident_kernel_pool_sha256", "0" * 64),
    lambda p: p["class_group"].__setitem__("class_number", "2"),
    lambda p: p["compact_units"]["factor_ids"].__setitem__(0, "other-kernel"),
    lambda p: p["compact_units"]["factor_norms"].__setitem__(6, "1"),
    lambda p: p["compact_units"]["exponents"].__setitem__(6, "2"),
    lambda p: p["compact_units"].__setitem__("materialized_unit_sha256", "0" * 64),
    lambda p: p["compact_units"].__setitem__("expanded_units", [["1", "0", "0"]]),
    lambda p: p["authority_links"].__setitem__("regulator_sha256", "0" * 64),
    lambda p: p["terminal"].__setitem__("answer_derived_factor_pool", True),
    lambda p: p["terminal"].__setitem__("public_complete", True),
]
for change in composition_mutations:
    rejected_composition(change)

def rejected_success(change):
    changed = copy.deepcopy(success)
    change(changed)
    try:
        composer.cold_replay_authentic_compact_success(
            result, authority, changed, resident
        )
    except composer.AuthenticCompactSuccessFailure:
        return
    raise AssertionError("mutated authentic-success authority was accepted")

success_mutations = [
    lambda p: p["correspondence"]["hnf_kernel_basis"].__setitem__(0, "1"),
    lambda p: p["authorities"]["relation_unit"]["unit_kernel_provenance"]["entries"].__setitem__(6, "2"),
    lambda p: p["authorities"]["relation_unit"]["active_to_retained_relations"]["entries"].__setitem__(0, "2"),
    lambda p: p["authorities"]["relation_unit"]["published_units_integral_basis"]["entries"].__setitem__(0, "1"),
    lambda p: p["authorities"]["presentation"]["field"]["multiplication_table"].__setitem__(0, "2"),
    lambda p: p["authorities"]["regulator"]["envelope"]["payload"]["evidence"]["exact_unit_norms"].__setitem__(0, "1"),
]
for change in success_mutations:
    rejected_success(change)

resident_payload = json.load(open(resident, encoding="utf-8"))
resident_mutations = [
    lambda p: p["generators"].__setitem__(0, str(int(p["generators"][0]) + 1)),
    lambda p: p["hnf_transform"].__setitem__(0, str(int(p["hnf_transform"][0]) + 1)),
]
for change in resident_mutations:
    changed = copy.deepcopy(resident_payload)
    change(changed)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as handle:
        json.dump(changed, handle, separators=(",", ":"))
        handle.flush()
        try:
            composer.cold_replay_authentic_compact_success(
                result, authority, success, handle.name
            )
        except composer.AuthenticCompactSuccessFailure:
            continue
    raise AssertionError("mutated resident authority was accepted")

print(json.dumps({
    "field": payload["source"]["field_id"],
    "classNumber": 1,
    "unitRank": 2,
    "genuineKernelFactors": 7,
    "answerDerivedFactors": False,
    "expandedInsideMatchedWorkload": False,
    "resultBytes": len(result.canonical_json),
    "resultSha256": result.sha256,
    "compositionMutationsRejected": len(composition_mutations),
    "successAuthorityMutationsRejected": len(success_mutations),
    "residentAuthorityMutationsRejected": len(resident_mutations),
}, sort_keys=True))
`;

  const result = spawnSync(
    "python3",
    [
      "-c",
      program,
      root,
      resident,
      path.join(__dirname, "unit-bridge-cubic-fixtures.json"),
      JSON.stringify(oracle),
      JSON.stringify(regulatorAuthority),
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      timeout: 240000,
    },
  );
  assert.equal(result.status, 0, result.stderr || String(result.error));
  process.stdout.write(result.stdout);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
