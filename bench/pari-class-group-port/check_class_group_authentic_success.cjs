#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root);
const { createSage } = require(path.join(runtimeRoot, "dist/tools/kernel.js"));
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const oracleExecutable = process.argv[3] && path.resolve(process.argv[3]);

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
const regulatorSource = readFileSync(path.join(__dirname, "regulator_acceptance_replay.py"), "utf8");
const regulatorFixture = JSON.parse(readFileSync(path.join(__dirname, "regulator-acceptance-replay-fixture.json"), "utf8"));
const regulatorSession = await createSage({ mode: "python" });
let regulatorAuthority;
try {
  const regulatorProgram = regulatorSource + String.raw`
import json
fixture = json.loads(${JSON.stringify(JSON.stringify(regulatorFixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - 20018*x + 20034, "a")
payload = build_regulator_acceptance_replay(K, fixture)
raw, authority = seal_regulator_acceptance_replay(payload)
assert cold_replay_regulator_acceptance(K, raw, authority) == payload
print(json.dumps({"envelope": json.loads(raw), "sha256": authority.envelope_sha256}, sort_keys=True))
`;
  const replay = await regulatorSession.evaluate(regulatorProgram, { filename: "regulator-authority.py" });
  assert.equal(replay.stderr || "", "");
  regulatorAuthority = JSON.parse(replay.stdout);
} finally {
  regulatorSession.close();
}
const oracle = oracleExecutable
  ? JSON.parse(run(oracleExecutable, []))
  : JSON.parse(
      run("node", [path.join(__dirname, "check_unit_bridge_cubic.cjs")], {
        env: { ...process.env, SAGEJS_DUMP_UNIT_ORACLE: "1" },
      }),
    );

const program = String.raw`
import copy
import dataclasses
import decimal
import hashlib
import json
import pathlib
import sys
import typing

sys.path[:0] = [${JSON.stringify(root)}, ${JSON.stringify(root + "/src/lib")}]
m = __import__("bench.pari-class-group-port.class_group_authentic_success", fromlist=["*"])
resident = ${JSON.stringify(resident)}
fixture = ${JSON.stringify(path.join(__dirname, "unit-bridge-cubic-fixtures.json"))}
oracle = json.loads(${JSON.stringify(JSON.stringify(oracle))})
regulator_authority = json.loads(${JSON.stringify(JSON.stringify(regulatorAuthority))})
payload = m.build_authentic_success_payload(resident, fixture, oracle, regulator_authority)

assert payload["candidate"]["class_number"] == "1"
assert payload["candidate"]["invariant_factors"] == []
assert payload["transforms"]["smith"]["diagonal"] == [
    str(int(row == column)) for column in range(8) for row in range(8)
]
assert payload["generators"] == {"entries": []}
assert payload["unit_component"]["terminal_status"] == "getfu-and-cleanarch-complete"
assert payload["unit_component"]["evidence"]["rank"] == "2"
assert payload["unit_component"]["evidence"]["claimed_norms"] == ["-1", "-1"]
assert payload["correspondence"]["status"] == "cold-replayed-exact-unit-correspondence-live-oracle-blocked"
assert payload["correspondence"]["equal_bound_honesty"] == "equal-bound-source-skip"
assert payload["correspondence"]["cleanarch_status"] == "cold-replayed-class-relation-cleanarch"
assert payload["correspondence"]["final_driver_status"] == "not-published"
assert len(payload["correspondence"]["hnf_kernel_basis"]) == 105
assert len(payload["correspondence"]["unit_kernel_provenance"]) == 14
assert len(payload["correspondence"]["active_relation_provenance"]) == 30
assert payload["terminal"]["phase5_complete"] is False
assert payload["terminal"]["public_complete"] is False
assert payload["terminal"]["internal_unverified_requirements"] == [
    "remove-live-pari-unit-oracle-input",
]
assert payload["terminal"]["public_unverified_requirements"] == [
    "independent-unit-saturation-index-one-certificate",
    "independent-factor-base-relation-completeness-certificate",
]

publisher = m.AuthenticSuccessPublisher()
assert publisher.current() is None
published = [publisher.publish(payload) for _ in range(64)]
assert len({item.sha256 for item in published}) == 1
result = published[0]
assert publisher.current() == result
authority = m.AuthenticSuccessAuthority(result.sha256)
assert m.cold_replay_authentic_success(result, authority) == result

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("ascii")

def rehashed(changed):
    payload_raw = canonical(changed)
    envelope = {
        "schema": m.SUCCESS_SCHEMA,
        "payload": changed,
        "payload_sha256": hashlib.sha256(payload_raw).hexdigest(),
    }
    raw = canonical(envelope)
    return raw, m.AuthenticSuccessAuthority(hashlib.sha256(raw).hexdigest())

def rejected(changed):
    raw, changed_authority = rehashed(changed)
    try:
        m.cold_replay_authentic_success(raw, changed_authority)
    except m.AuthenticSuccessFailure:
        return
    raise AssertionError("coordinated, rehashed mutation was accepted")

mutations = []
def mutation(change):
    changed = copy.deepcopy(payload)
    change(changed)
    mutations.append(changed)

mutation(lambda p: p["source"].__setitem__("pari_version", "2.17.3"))
mutation(lambda p: p["candidate"]["active_relation_matrix"].__setitem__(0, "99"))
mutation(lambda p: p["candidate"]["equal_bound_state"].__setitem__(4, "8"))
mutation(lambda p: p["candidate"].__setitem__("class_number", "2"))
mutation(lambda p: p["transforms"]["relation_to_presentation"]["entries"].__setitem__(0, "99"))
mutation(lambda p: p["transforms"]["presentation_to_relation"]["entries"].__setitem__(0, "99"))
mutation(lambda p: p["transforms"]["smith"]["left"].__setitem__(0, "99"))
mutation(lambda p: p["transforms"]["states"]["smith"].__setitem__(0, "1"))
mutation(lambda p: p.__setitem__("generators", {"entries": [{"fake": "1"}]}))
mutation(lambda p: p["buchall"]["M1"].__setitem__("shape", ["8", "1"]))
mutation(lambda p: p["buchall"]["GD"].__setitem__("entries", ["1"]))
mutation(lambda p: p["unit_component"].__setitem__("candidate_sha256", "0" * 64))
mutation(lambda p: p["unit_component"].__setitem__("transforms_sha256", "0" * 64))
mutation(lambda p: p["unit_component"]["evidence"]["claimed_norms"].__setitem__(0, "1"))
mutation(lambda p: p["unit_component"]["evidence"]["packed_log_words"].__setitem__(0, "99"))
mutation(lambda p: p["correspondence"]["hnf_kernel_basis"].__setitem__(0, "99"))
mutation(lambda p: p["correspondence"]["unit_kernel_provenance"].__setitem__(0, "99"))
mutation(lambda p: p["correspondence"]["active_relation_provenance"].__setitem__(0, "99"))
mutation(lambda p: p["correspondence"].__setitem__("equal_bound_honesty", "verified"))
mutation(lambda p: p["correspondence"].__setitem__("cleanarch_status", "not-run"))
mutation(lambda p: p["correspondence"].__setitem__("final_driver_status", "complete"))
mutation(lambda p: p["authorities"]["presentation"]["relations"][0]["alpha"].__setitem__(0, "3"))
mutation(lambda p: p["authorities"]["torsion"]["envelope"]["payload"]["torsion"].__setitem__("order", "3"))
mutation(lambda p: p["authorities"]["cleanarch"]["output"].__setitem__(1, "99"))
mutation(lambda p: p["authorities"]["regulator"]["envelope"]["payload"]["evidence"]["exact_unit_norms"].__setitem__(0, "1"))
mutation(lambda p: p["authorities"]["relation_unit"]["active_to_retained_relations"]["entries"].__setitem__(0, "2"))
mutation(lambda p: p["authorities"]["relation_unit"]["published_units_power_basis"]["entries"].__setitem__(0, "1"))
mutation(lambda p: p["authorities"]["retry_units"]["getfu_factor"].__setitem__(3, "1"))
mutation(lambda p: p["terminal"].__setitem__("phase5_complete", True))
mutation(lambda p: p["terminal"].__setitem__("public_complete", True))
mutation(lambda p: p["terminal"]["internal_unverified_requirements"].pop())
mutation(lambda p: p["terminal"]["public_unverified_requirements"].pop())
for changed in mutations:
    rejected(changed)

# Even a coordinated scaling which preserves A*R2P=H and H*P2R=A must fail
# the independently replayed Smith identity.
coordinated = copy.deepcopy(payload)
for place in (
    coordinated["candidate"]["active_relation_matrix"],
    coordinated["candidate"]["presentation_matrix"],
    coordinated["transforms"]["relation"]["entries"],
    coordinated["transforms"]["presentation"]["entries"],
):
    place[:] = [str(2 * int(value)) for value in place]
rejected(coordinated)

# Internal rehashing never substitutes for the retained publication hash.
stale_raw, _ = rehashed(copy.deepcopy(payload))
stale = json.loads(stale_raw)
stale["payload"]["terminal"]["status"] = "forged"
try:
    m.cold_replay_authentic_success(canonical(stale), authority)
except m.AuthenticSuccessFailure:
    pass
else:
    raise AssertionError("stale publication mutation was accepted")

print(json.dumps({
    "schema": m.SUCCESS_SCHEMA,
    "field": m.CONNECTED_FIELD_ID,
    "classNumber": 1,
    "classGeneratorCount": 0,
    "unitRank": 2,
    "unitNorms": [-1, -1],
    "correspondenceStatus": payload["correspondence"]["status"],
    "finalDriverStatus": payload["correspondence"]["final_driver_status"],
    "phase5Complete": False,
    "publicComplete": False,
    "coordinatedRehashedMutations": len(mutations) + 1,
    "publicationSha256": result.sha256,
    "residentSha256": m.RESIDENT_SHA256 if hasattr(m, "RESIDENT_SHA256") else payload["source"]["resident_sha256"],
    "sourceOracle": "PARI-2.17.4-live",
}, sort_keys=True))
`;

const result = spawnSync("python3", ["-c", program], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
  timeout: 240000,
});
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
