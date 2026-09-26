#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const residentPath = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 300000,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const program = String.raw`
import copy
import dataclasses
import hashlib
import importlib
import json
import pathlib
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, sys.argv[1])
sys.path.append(sys.argv[1] + "/src/lib")
h1 = importlib.import_module("bench.pari-class-group-port.class_group_h1_correspondence")
m = importlib.import_module("bench.pari-class-group-port.class_group_live_result_assembly")

resident = sys.argv[2]
h1_payload = h1.build_h1_class_correspondence(resident)
h1_publisher = h1.H1CorrespondencePublisher()
h1_owner = h1_publisher.publish(h1_payload)
h1_authority = h1.H1CorrespondenceAuthority(h1_owner.sha256)

publisher = m.LiveClassResultPublisher()
assert publisher.current() is None
with ThreadPoolExecutor(max_workers=8) as pool:
    published = list(
        pool.map(
            lambda _: publisher.publish(resident, h1_owner, h1_authority),
            range(16),
        )
    )
assert len({result.sha256 for result in published}) == 1
result = published[0]
assert publisher.current() == result
payload = result.detached_payload()
authority = m.LiveClassResultAuthority(result.sha256)
assert m.cold_replay_live_class_result(
    result, authority, resident, h1_owner, h1_authority
) == result

assert payload["class_group"]["class_number"] == "1"
assert payload["class_group"]["invariant_factors"] == []
assert payload["class_group"]["generators"] == []
assert payload["cleanarch"]["status"] == "accepted"
assert payload["cleanarch"]["honesty_status"] == "equal-bound-source-skip"
assert payload["cleanarch"]["driver_state"] == [
    "0", "1", "1", "48", "48", "7", "7", "73", "8", "0"
]
assert len(payload["cleanarch"]["cleaned_entries"]) == 147
assert payload["buchall"]["M1"] == {"shape": ["8", "0"], "entries": []}
assert payload["buchall"]["Ga"] == {"shape": ["0", "3", "7"], "entries": []}
assert payload["buchall"]["Ge"] == {"shape": ["0", "0"], "entries": []}
assert payload["buchall"]["GD"] == {"shape": ["0", "3", "7"], "entries": []}
assert len(payload["buchall"]["Ur"]["entries"]) == 64
assert len(payload["buchall"]["M2"]["entries"]) == 64
assert len(payload["buchall"]["ga"]["entries"]) == 168
assert payload["terminal"]["atomic_publication"] is True
assert payload["terminal"]["class_result_complete_under_upstream_assumption"] is True
assert payload["terminal"]["unit_group_included"] is False
assert payload["terminal"]["phase5_complete"] is False
assert payload["terminal"]["public_class_complete"] is False
assert payload["terminal"]["public_class_unit_complete"] is False

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
    return raw, m.LiveClassResultAuthority(hashlib.sha256(raw).hexdigest())

def rejected(change):
    changed = copy.deepcopy(payload)
    change(changed)
    raw, changed_authority = rehashed(changed)
    try:
        m.cold_replay_live_class_result(
            raw, changed_authority, resident, h1_owner, h1_authority
        )
    except m.LiveClassAssemblyFailure:
        return
    raise AssertionError("coordinated, rehashed class-result mutation was accepted")

mutations = [
    lambda p: p["source"].__setitem__("resident_sha256", "0" * 64),
    lambda p: p["source"].__setitem__("class_correspondence_sha256", "0" * 64),
    lambda p: p["class_group"].__setitem__("class_number", "2"),
    lambda p: p["cleanarch"].__setitem__("status", "retry"),
    lambda p: p["cleanarch"]["cleaned_entries"].__setitem__(1, "99"),
    lambda p: p["cleanarch"].__setitem__("cleaned_sha256", "0" * 64),
    lambda p: p["cleanarch"]["driver_state"].__setitem__(1, "0"),
    lambda p: p["buchall"]["M2"]["entries"].__setitem__(0, "99"),
    lambda p: p["buchall"]["ga"]["entries"].pop(),
    lambda p: p["terminal"].__setitem__("unit_group_included", True),
    lambda p: p["terminal"].__setitem__("phase5_complete", True),
    lambda p: p["terminal"].__setitem__("public_class_complete", True),
    lambda p: p["terminal"].__setitem__("public_class_unit_complete", True),
    lambda p: p["terminal"]["unverified_public_requirements"].pop(),
]
for mutation in mutations:
    rejected(mutation)

# Failed owner replay occurs before the publisher lock and cannot replace the
# successfully published result.
bad_owner = h1.ImmutableH1Correspondence(b"{}", hashlib.sha256(b"{}").hexdigest())
try:
    publisher.publish(resident, bad_owner, h1_authority)
except m.LiveClassAssemblyFailure:
    pass
else:
    raise AssertionError("invalid correspondence owner was published")
assert publisher.current() == result

source_text = pathlib.Path(m.__file__).read_text()
assert "unit-bridge-cubic" not in source_text
assert "check_unit_bridge" not in source_text

print(json.dumps({
    "schema": m.SCHEMA,
    "field": payload["source"]["field_id"],
    "classNumber": 1,
    "invariantFactors": [],
    "classGeneratorCount": 0,
    "acceptedRelations": 73,
    "cleanedColumns": 7,
    "cleanedEntries": len(payload["cleanarch"]["cleaned_entries"]),
    "cleanedSha256": payload["cleanarch"]["cleaned_sha256"],
    "nativeState": payload["cleanarch"]["driver_state"],
    "buchallComponents": payload["buchall"]["clg2"]["components"],
    "atomicPublications": len(published),
    "mutationsRejected": len(mutations) + 1,
    "publicationSha256": result.sha256,
    "classCorrespondenceSha256": h1_owner.sha256,
    "phase5Complete": False,
    "publicClassComplete": False,
    "publicClassUnitComplete": False,
}, sort_keys=True))
`;

const dynamic = JSON.parse(
  run("/usr/bin/python3", ["-c", program, root, residentPath]),
);

const resident = JSON.parse(fs.readFileSync(residentPath, "utf8"));
const hashValues = (values) =>
  crypto.createHash("sha256").update(JSON.stringify(values.map(String))).digest("hex");
const values = (value) =>
  Array.isArray(value) ? value : value.toArray ? value.toArray() : Array.from(value);

(async () => {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "class_group_final_driver_status.py"),
  });
  const fn = require(built.modulePath).pari_equal_bound_cleanarch_driver_status;
  assert(fn.nativeAvailable);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const I = (data) =>
      backend === "javascript"
        ? data.map(BigInt)
        : fn.createIntegerBuffer(data.length, 4096, data.map(BigInt));
    const Z = (length) => I(Array(length).fill(0));
    const S = (data) =>
      backend === "javascript"
        ? data.map(BigInt)
        : fn.createInt64Buffer(data.map(BigInt));
    const output = Z(147);
    const state = S(Array(4).fill(0));
    const driver = S(Array(10).fill(0));
    const status = fn[backend](
      I(resident.prep_base_state.slice(0, 7)),
      I(resident.prep_state.slice(0, 8)),
      S(resident.hnf_state.slice(0, 9)),
      S(resident.accept_acceptance_state.slice(0, 3)),
      I(resident.hnf_result_c.slice(0, 147)),
      7n,
      BigInt(resident.precision),
      Z(3),
      Z(512),
      Z(512),
      Z(512),
      Z(512),
      Z(1024),
      Z(147),
      output,
      state,
      driver,
    );
    assert.equal(status, 0n);
    assert.deepEqual(values(driver), dynamic.nativeState.map(BigInt));
    assert.equal(hashValues(values(output)), dynamic.cleanedSha256);
  }
  console.log(
    JSON.stringify({
      ...dynamic,
      backends: ["cpython", "javascript", "gmp", "tagged"],
      liveOwnersOnly: true,
      externalOracleCalls: 0,
      cacheKey: built.cacheKey,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
