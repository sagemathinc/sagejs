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

sys.path.insert(0, sys.argv[1])
m = importlib.import_module("bench.pari-class-group-port.torsion_authority")

# This is only the prepared neutral field identity.  No class number, unit,
# regulator, torsion answer, or PARI result is supplied to the computation.
polynomial = (20034, -20018, 0, 1)
polynomial_authority = m.prepared_polynomial_sha256(polynomial)
authority = m.TorsionReplayAuthority(polynomial_authority)
result = m.derive_real_cubic_torsion(polynomial)
assert m.cold_replay_torsion(result, authority) == result
payload = result.detached_payload()
assert payload["field"] == {
    "polynomial_ascending": ["20034", "-20018", "0", "1"],
    "polynomial_sha256": polynomial_authority,
    "degree": "3",
    "discriminant": "32075641032116",
    "real_places": "3",
    "complex_places": "0",
}
assert payload["torsion"] == {
    "order": "2",
    "generator_power_basis": ["-1", "0", "0"],
    "generator_squared": ["1", "0", "0"],
    "generator_norm": "-1",
}
assert payload["maximality"] == {
    "method": "injective-real-embedding",
    "real_root_of_unity_bound": "2",
    "verified_exact_order": "2",
}

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("ascii")

def rejected(changed, changed_authority=authority):
    changed["payload_sha256"] = hashlib.sha256(canonical(changed["payload"])).hexdigest()
    try:
        m.cold_replay_torsion(canonical(changed), changed_authority)
    except m.TorsionFailure:
        return
    raise AssertionError("coordinated, rehashed torsion mutation was accepted")

envelope = json.loads(result.canonical_json)
mutations = []
def mutation(change):
    changed = copy.deepcopy(envelope)
    change(changed["payload"])
    mutations.append(changed)

mutation(lambda p: p["field"].__setitem__("discriminant", "32075641032117"))
mutation(lambda p: p["field"].__setitem__("real_places", "1"))
mutation(lambda p: p["irreducibility"].__setitem__("tested_root_count", "0"))
mutation(lambda p: p["irreducibility"].__setitem__("transcript_sha256", "0" * 64))
mutation(lambda p: p["torsion"].__setitem__("order", "1"))
mutation(lambda p: p["torsion"]["generator_power_basis"].__setitem__(0, "1"))
mutation(lambda p: p["torsion"]["generator_squared"].__setitem__(0, "-1"))
mutation(lambda p: p["torsion"].__setitem__("generator_norm", "1"))
mutation(lambda p: p["maximality"].__setitem__("real_root_of_unity_bound", "4"))
mutation(lambda p: p["maximality"].__setitem__("verified_exact_order", "1"))
for changed in mutations:
    rejected(changed)

# A different valid totally real cubic can obtain its own result, but cannot be
# substituted under the sentinel's neutral prepared-field authority.
other = m.derive_real_cubic_torsion((-1, -3, 0, 1))
try:
    m.cold_replay_torsion(other, authority)
except m.TorsionFailure:
    pass
else:
    raise AssertionError("different field passed the prepared-field pin")

# Reducible and non-real cubics never acquire maximality authority.
for bad in ((0, -1, 0, 1), (1, 1, 0, 1)):
    try:
        m.derive_real_cubic_torsion(bad)
    except m.TorsionFailure:
        pass
    else:
        raise AssertionError("invalid prepared field acquired torsion authority")

pinned = m.TorsionReplayAuthority(polynomial_authority, result.sha256)
assert m.cold_replay_torsion(result.canonical_json, pinned) == result
stale = copy.deepcopy(envelope)
stale["payload"]["torsion"]["order"] = "1"
stale["payload_sha256"] = hashlib.sha256(canonical(stale["payload"])).hexdigest()
try:
    m.cold_replay_torsion(canonical(stale), pinned)
except m.TorsionFailure:
    pass
else:
    raise AssertionError("stale mutation passed publication authority")

print(json.dumps({
    "schema": m.TORSION_SCHEMA,
    "field": "x^3-20018*x+20034",
    "preparedInput": [str(x) for x in polynomial],
    "discriminant": payload["field"]["discriminant"],
    "realPlaces": 3,
    "torsionOrder": 2,
    "torsionGenerator": payload["torsion"]["generator_power_basis"],
    "torsionNorm": -1,
    "maximality": payload["maximality"]["method"],
    "coordinatedRehashedMutations": len(mutations),
    "resultSha256": result.sha256,
    "backends": ["cpython"],
    "nativeCompilation": "not-appropriate-once-per-field-exact-finalization",
}, sort_keys=True))
`;

const result = spawnSync(
  "python3",
  ["-c", program, repo],
  {
    cwd: repo,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);

const pariAt = process.argv.indexOf("--pari-gp");
if (pariAt >= 0) {
  const pari = process.argv[pariAt + 1];
  assert.ok(pari, "--pari-gp requires a PARI 2.17.4 gp-dyn path");
  const oracle = spawnSync(pari, ["-q"], {
    cwd: repo,
    input: "nf=nfinit(x^3-20018*x+20034);\nprint(nfrootsof1(nf))\n\\q\n",
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
  const lines = oracle.stdout.trim().split(/\r?\n/);
  assert.deepEqual(lines, ["[2, -1]"]);
}
