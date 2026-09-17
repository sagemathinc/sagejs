"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const resident = process.argv[2];
assert.ok(
  resident,
  "usage: node check_class_group_authentic_final_state.cjs RESIDENT_OUTPUT_JSON",
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
import threading
import typing
from concurrent.futures import ThreadPoolExecutor

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
m = importlib.import_module("bench.pari-class-group-port.class_group_authentic_final_state")

payload = m.build_authentic_frontier_payload(sys.argv[2], sys.argv[3])
assert payload["class_state"]["relation"]["accepted_relation_count"] == "73"
assert payload["class_state"]["relation"]["shape"] == ["8", "15"]
assert payload["class_state"]["presentation"]["shape"] == ["8", "8"]
assert payload["class_state"]["smith"]["class_number"] == "1"
assert payload["class_state"]["smith"]["invariants"] == []
assert payload["class_state"]["generators"] == {"entries": []}
buchall = payload["class_state"]["buchall"]
assert buchall["M1"] == {"shape": ["8", "0"], "entries": []}
assert buchall["Ga"] == {"shape": ["0", "3", "7"], "entries": []}
assert buchall["Ge"] == {"shape": ["0", "0"], "entries": []}
assert buchall["GD"] == {"shape": ["0", "3", "7"], "entries": []}
assert len(buchall["Ur"]["entries"]) == 64
assert len(buchall["M2"]["entries"]) == 64
assert len(buchall["ga"]["entries"]) == 168
unit = payload["unit_frontier"]
assert unit["status"] == "fupb_PRECI"
assert unit["unit_component"] is None
assert unit["getfu_state"][0] == "3"
assert unit["required_precision"] == {
    "packed_logs": "2176", "embedding": "2240", "working_capacity": "2304"
}
assert payload["terminal"]["status"] == "awaiting-unit-precision-retry"
assert payload["terminal"]["phase5_complete"] is False
assert payload["terminal"]["public_complete"] is False

publisher = m.AuthenticFrontierPublisher()
assert publisher.current() is None
with ThreadPoolExecutor(max_workers=16) as pool:
    published = list(pool.map(lambda _: publisher.publish(payload), range(64)))
assert len({item.sha256 for item in published}) == 1
result = published[0]
assert publisher.current() == result
authority = m.FrontierReplayAuthority(result.sha256)
assert m.cold_replay_authentic_frontier(result, authority) == result

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("ascii")

def envelope_for(changed):
    payload_raw = canonical(changed)
    envelope = {
        "schema": m.FRONTIER_SCHEMA,
        "payload": changed,
        "payload_sha256": hashlib.sha256(payload_raw).hexdigest(),
    }
    raw = canonical(envelope)
    return raw, m.FrontierReplayAuthority(hashlib.sha256(raw).hexdigest())

def rejected(changed):
    raw, changed_authority = envelope_for(changed)
    try:
        m.cold_replay_authentic_frontier(raw, changed_authority)
    except m.FrontierFailure:
        return
    raise AssertionError("coordinated, rehashed mutation was accepted")

mutations = []
def mutation(change):
    changed = copy.deepcopy(payload)
    change(changed)
    mutations.append(changed)

mutation(lambda p: p["source"].__setitem__("field_id", "x^3-x+1"))
mutation(lambda p: p["class_state"]["relation"]["entries"].__setitem__(0, "99"))
mutation(lambda p: p["class_state"]["relation"].__setitem__("accepted_relation_count", "72"))
mutation(lambda p: p["class_state"]["relation_to_presentation"]["entries"].__setitem__(0, "99"))
mutation(lambda p: p["class_state"]["presentation_to_relation"]["entries"].__setitem__(0, "99"))
mutation(lambda p: p["class_state"]["presentation"]["shape"].__setitem__(1, "7"))
mutation(lambda p: p["class_state"]["smith"]["left"].__setitem__(0, "99"))
mutation(lambda p: p["class_state"]["smith"]["right_inverse"].__setitem__(0, "99"))
mutation(lambda p: p["class_state"]["smith"].__setitem__("class_number", "2"))
mutation(lambda p: p["class_state"]["states"]["witness"].__setitem__(0, "1"))
mutation(lambda p: p["class_state"].__setitem__("generators", {"entries": [{"fake": "1"}]}))
mutation(lambda p: p["class_state"]["buchall"]["M1"].__setitem__("shape", ["8", "1"]))
mutation(lambda p: p["class_state"]["buchall"]["M1"].__setitem__("entries", ["1"]))
mutation(lambda p: p["class_state"]["buchall"]["ga"]["entries"].pop())
mutation(lambda p: p["class_state"]["buchall"]["clg2"]["components"].reverse())
mutation(lambda p: p["unit_frontier"].__setitem__("status", "complete"))
mutation(lambda p: p["unit_frontier"].__setitem__("unit_component", {}))
mutation(lambda p: p["unit_frontier"].__setitem__("precision", "2304"))
mutation(lambda p: p["unit_frontier"]["required_precision"].__setitem__("working_capacity", "2048"))
mutation(lambda p: p["unit_frontier"].__setitem__("accepted_arch_sha256", "0" * 64))
mutation(lambda p: p["unit_frontier"]["unit_transform"].pop())
mutation(lambda p: p["unit_frontier"]["relation_provenance"].__setitem__(0, "99"))
mutation(lambda p: p["unit_frontier"]["getfu_state"].__setitem__(0, "0"))
mutation(lambda p: p["terminal"].__setitem__("phase5_complete", True))
mutation(lambda p: p["terminal"].__setitem__("public_complete", True))
mutation(lambda p: p["terminal"]["unverified_requirements"].pop())
for changed in mutations:
    rejected(changed)

# A coordinated matrix mutation preserves A*R2P=H and H*P2R=A, but must still
# fail the independently checked Smith identity for the changed presentation.
coordinated = copy.deepcopy(payload)
for key in ("relation", "presentation"):
    coordinated["class_state"][key]["entries"] = [
        str(2 * int(value)) for value in coordinated["class_state"][key]["entries"]
    ]
rejected(coordinated)

# Rehashing is not enough without the separately retained publication hash.
stale_raw, _ = envelope_for(copy.deepcopy(payload))
stale = json.loads(stale_raw)
stale["payload"]["unit_frontier"]["getfu_state"][0] = "0"
stale_raw = canonical(stale)
try:
    m.cold_replay_authentic_frontier(stale_raw, authority)
except m.FrontierFailure:
    pass
else:
    raise AssertionError("stale-hash mutation was accepted")

print(json.dumps({
    "schema": m.FRONTIER_SCHEMA,
    "field": m.FIELD_ID,
    "acceptedRelations": 73,
    "presentationShape": [8, 8],
    "classNumber": 1,
    "classGeneratorCount": 0,
    "unitStatus": unit["status"],
    "terminalStatus": payload["terminal"]["status"],
    "phase5Complete": False,
    "publicComplete": False,
    "coordinatedRehashedMutations": len(mutations) + 1,
    "publicationSha256": result.sha256,
    "residentSha256": m.RESIDENT_SHA256,
    "fixtureSha256": m.FIXTURE_SHA256,
    "backends": ["cpython"],
}, sort_keys=True))
`;

const fixture = path.join(__dirname, "unit-bridge-cubic-fixtures.json");
const result = spawnSync(
  "python3",
  ["-c", program, repo, path.resolve(resident), fixture],
  {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 180000,
  },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
