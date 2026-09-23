"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "../..");
const resident = process.argv[2];
assert.ok(
  resident,
  "usage: node check_presentation_authority.cjs RESIDENT_OUTPUT_JSON",
);

const program = String.raw`
import copy
import hashlib
import importlib
import json
import pathlib
import sys

sys.set_int_max_str_digits(20000)
sys.path.extend([sys.argv[1] + "/src/lib"])
m = importlib.import_module("bench.pari-class-group-port.presentation_authority")

payload = m.capture_presentation_authority(sys.argv[2])
summary = m.replay_presentation_authority(payload)
assert summary["factor_base_size"] == 66
assert summary["principal_relations"] == 73
assert summary["active_shape"] == [8, 15]
assert summary["presentation_shape"] == [8, 8]
assert summary["witness_state"] == [0, 8, 15, 7, 120, 450, 120, 120]
assert summary["hnf_final_state"] == [0, 7, 66, 0, 7, 8, 0]

def rejected(change):
    changed = copy.deepcopy(payload)
    change(changed)
    try:
        m.replay_presentation_authority(changed)
    except m.PresentationAuthorityFailure:
        return
    raise AssertionError("coordinated presentation mutation was accepted")

mutations = [
    lambda p: p["field"]["multiplication_table"].__setitem__(13, "-3"),
    lambda p: p["factor_base"][0].__setitem__("prime", "3"),
    lambda p: p["factor_base"][1]["generator"].__setitem__(0, "4"),
    lambda p: p["factor_base"][2]["hnf"].__setitem__(0, "4"),
    lambda p: p["relations"][12]["exponents"].__setitem__(5, "3"),
    lambda p: p["relations"][40]["alpha"].__setitem__(1, "43"),
    lambda p: p["hnf"]["initial_permutation"].__setitem__(0, "1"),
    lambda p: p["hnf"]["logs"].__setitem__(127, str(int(p["hnf"]["logs"][127]) + 1)),
    lambda p: p["hnf"]["active_relation"].__setitem__(0, "1"),
    lambda p: p["hnf"]["full_hnf"].__setitem__(56, "2"),
    lambda p: p["hnf"]["transform"].__setitem__(0, "1"),
]
for change in mutations:
    rejected(change)

encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False)
detached = json.loads(encoded)
assert m.replay_presentation_authority(detached) == summary

print(json.dumps({
    **summary,
    "authority_bytes": len(encoded.encode("ascii")),
    "authority_sha256": hashlib.sha256(encoded.encode("ascii")).hexdigest(),
    "mutations_rejected": len(mutations),
    "resident_sha256": m.RESIDENT_SHA256,
    "backends": ["cpython"],
}, sort_keys=True))
`;

const result = spawnSync(
  "python3",
  ["-c", program, repo, path.resolve(resident)],
  {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
  },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
