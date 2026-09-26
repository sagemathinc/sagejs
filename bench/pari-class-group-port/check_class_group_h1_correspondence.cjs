#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);

const program = String.raw`
import copy
import hashlib
import importlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.extend([sys.argv[1] + "/src/lib"])
m = importlib.import_module("bench.pari-class-group-port.class_group_h1_correspondence")

payload = m.build_h1_class_correspondence(sys.argv[2])
replay = payload["presentation_replay"]
group = payload["class_group"]
status = payload["status"]
assert replay["factor_base_size"] == 66
assert replay["principal_relations"] == 73
assert replay["presentation_shape"] == [8, 8]
assert replay["hnf_final_state"] == [0, 7, 66, 0, 7, 8, 0]
assert payload["smith_witness"]["diagonal"] == [
    str(int(row == column)) for column in range(8) for row in range(8)
]
assert group == {
    "class_number": "1",
    "invariant_factors": [],
    "generators": [],
    "generator_order_witnesses": [],
    "generator_order_witnesses_vacuous": True,
    "exact_presentation_saturated": True,
    "global_factor_base_generation": "assumed-from-pinned-upstream-policy",
}
assert status["class_correspondence_complete"] is True
assert status["proof_tier"] == "upstream-assumed-pari-correspondence"
assert status["phase5_complete"] is False
assert status["public_class_complete"] is False
assert status["public_class_unit_complete"] is False
assert status["unverified_public_requirements"] == [
    "certified-maximal-order-authority",
    "proved-factor-base-generation-bound",
    "replayable-global-class-saturation-record",
    "completed-public-proof-stage-and-theorem-payload",
    "rigorous-regulator-enclosure-and-unit-saturation",
]

publisher = m.H1CorrespondencePublisher()
with ThreadPoolExecutor(max_workers=16) as pool:
    published = list(pool.map(lambda _: publisher.publish(payload), range(32)))
assert len({value.sha256 for value in published}) == 1
result = published[0]
authority = m.H1CorrespondenceAuthority(result.sha256)
assert publisher.current() == result
assert m.cold_replay_h1_class_correspondence(result, authority) == result

def canonical(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("ascii")

def rehashed(changed):
    payload_raw = canonical(changed)
    envelope = {
        "schema": m.SCHEMA,
        "payload": changed,
        "payload_sha256": hashlib.sha256(payload_raw).hexdigest(),
    }
    raw = canonical(envelope)
    return raw, m.H1CorrespondenceAuthority(hashlib.sha256(raw).hexdigest())

def rejected(change):
    changed = copy.deepcopy(payload)
    change(changed)
    raw, changed_authority = rehashed(changed)
    try:
        m.cold_replay_h1_class_correspondence(raw, changed_authority)
    except m.H1CorrespondenceFailure:
        return
    raise AssertionError("coordinated, rehashed class-witness mutation was accepted")

mutations = [
    lambda p: p["source"].__setitem__("pari_version", "2.17.3"),
    lambda p: p["presentation_authority"]["factor_base"][2]["hnf"].__setitem__(0, "9"),
    lambda p: p["presentation_authority"]["relations"][12]["alpha"].__setitem__(1, "9"),
    lambda p: p["presentation_authority"]["hnf"]["full_hnf"].__setitem__(56, "2"),
    lambda p: p["presentation_replay"].__setitem__("principal_relations", 72),
    lambda p: p["smith_witness"]["left"].__setitem__(0, "2"),
    lambda p: p["class_group"].__setitem__("class_number", "2"),
    lambda p: p["class_group"]["invariant_factors"].append("2"),
    lambda p: p["class_group"]["generators"].append({"fake": "1"}),
    lambda p: p["class_group"]["generator_order_witnesses"].append({"fake": "1"}),
    lambda p: p["class_group"].__setitem__("generator_order_witnesses_vacuous", False),
    lambda p: p["class_group"].__setitem__("exact_presentation_saturated", False),
    lambda p: p["class_group"].__setitem__("global_factor_base_generation", "proved"),
    lambda p: p["upstream_assumptions"].__setitem__("global_generation", "proved"),
    lambda p: p["status"].__setitem__("proof_tier", "certified"),
    lambda p: p["status"].__setitem__("class_correspondence_complete", False),
    lambda p: p["status"].__setitem__("phase5_complete", True),
    lambda p: p["status"].__setitem__("public_class_complete", True),
    lambda p: p["status"].__setitem__("public_class_unit_complete", True),
    lambda p: p["status"]["unverified_public_requirements"].pop(),
]
for mutation in mutations:
    rejected(mutation)

# Rehashing a structurally valid original payload cannot replace the retained
# out-of-band publication authority.
stale_raw, _ = rehashed(copy.deepcopy(payload))
stale = json.loads(stale_raw)
stale["payload"]["status"]["proof_tier"] = "forged"
stale_raw = canonical(stale)
try:
    m.cold_replay_h1_class_correspondence(stale_raw, authority)
except m.H1CorrespondenceFailure:
    pass
else:
    raise AssertionError("stale publication authority accepted a mutation")

print(json.dumps({
    "schema": m.SCHEMA,
    "field": m.CONNECTED_FIELD_ID,
    "factorBaseSize": replay["factor_base_size"],
    "principalRelations": replay["principal_relations"],
    "classNumber": 1,
    "invariantFactors": [],
    "classGeneratorCount": 0,
    "generatorOrderWitnesses": 0,
    "generatorOrderWitnessesVacuous": True,
    "exactPresentationSaturated": True,
    "globalFactorBaseGeneration": "assumed",
    "classCorrespondenceComplete": True,
    "publicClassComplete": False,
    "publicClassUnitComplete": False,
    "mutationsRejected": len(mutations),
    "publicationSha256": result.sha256,
    "presentationSha256": payload["source"]["presentation_sha256"],
}, sort_keys=True))
`;

const result = spawnSync(
  "/usr/bin/python3",
  ["-c", program, root, resident],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
