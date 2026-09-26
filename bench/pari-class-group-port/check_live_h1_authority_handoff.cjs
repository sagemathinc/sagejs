#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const expectedOwnerSha256 =
  "7eed284b9a90e00bb27feea24fbbed30b9d1a9196ce4bddc5ead5e854b0eb6e9";
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const source = fs.readFileSync(
  path.join(__dirname, "live_h1_authority_handoff.py"),
  "utf8",
);
assert.doesNotMatch(source, /\bPath\b|\.read_bytes\(|json\.load\(|\bopen\(/);

const program = String.raw`
import dataclasses
import hashlib
import importlib
import json
import pathlib
import sys
import typing

sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
m = importlib.import_module("bench.pari-class-group-port.live_h1_authority_handoff")

# This read simulates the producer root's already-live buffers. The handoff API
# itself receives only owners and performs no file or fixture acquisition.
resident = json.loads(pathlib.Path(sys.argv[2]).read_text())
polynomial = list(resident["prep_polynomial"]) + [999]
table = list(resident["basis_table"]) + [999]
relations = list(resident["relation_records"]) + [999]
alphas = list(resident["generators"]) + [999]
cleanup = list(resident["hnf_transform"]) + [999]
active = list(resident["hnf_matbnew"]) + [999]
active_transform = list(resident["hnf_hnf_transform"]) + [999]

handoff = m.capture_live_h1_authority(
    m.AUTHENTIC_EXPECTATION,
    polynomial,
    table,
    relations,
    alphas,
    cleanup,
    active,
    active_transform,
)
assert m.require_live_h1_authority(handoff, m.AUTHENTIC_EXPECTATION) is handoff
assert handoff.owner_sha256 == sys.argv[3]
assert len(handoff.principal_alphas) == 73 * 3
assert len(handoff.cleanup_transform) == 73 * 73
assert len(handoff.active_hnf_transform) == 15 * 15
assert len(handoff.kernel_relation_map) == 7 * 73
assert handoff.alpha(0) == tuple(int(v) for v in resident["generators"][:3])
assert handoff.alpha(72) == tuple(int(v) for v in resident["generators"][216:219])

# Reuse all producer workspaces. The immutable handoff retains the logical
# prefixes and remains independently consumable.
for owner in (polynomial, table, relations, alphas, cleanup, active, active_transform):
    owner[:] = [0] * len(owner)
assert m.require_live_h1_authority(handoff, m.AUTHENTIC_EXPECTATION) is handoff

nonzero = [
    sum(value != 0 for value in handoff.kernel_relation_exponents(kernel))
    for kernel in range(7)
]
max_abs = [
    max(abs(value) for value in handoff.kernel_relation_exponents(kernel))
    for kernel in range(7)
]

def rejected(changed, expectation=m.AUTHENTIC_EXPECTATION):
    try:
        m.require_live_h1_authority(changed, expectation)
    except m.LiveH1AuthorityFailure:
        return
    raise AssertionError("mutated live authority handoff was accepted")

mutations = []
mutations.append(dataclasses.replace(handoff, owner_sha256="0" * 64))
mutations.append(dataclasses.replace(handoff, polynomial=(1, 0, 0, 1)))
mutations.append(dataclasses.replace(
    handoff,
    principal_alphas=(handoff.principal_alphas[0] + 1,) + handoff.principal_alphas[1:],
))
mutations.append(dataclasses.replace(
    handoff,
    cleanup_transform=(handoff.cleanup_transform[0] + 1,) + handoff.cleanup_transform[1:],
))
mutations.append(dataclasses.replace(
    handoff,
    active_relation=(handoff.active_relation[0] + 1,) + handoff.active_relation[1:],
))
mutations.append(dataclasses.replace(
    handoff,
    active_hnf_transform=(handoff.active_hnf_transform[0] + 1,) + handoff.active_hnf_transform[1:],
))
mutations.append(dataclasses.replace(
    handoff,
    kernel_relation_map=(handoff.kernel_relation_map[0] + 1,) + handoff.kernel_relation_map[1:],
))
for changed in mutations:
    rejected(changed)

stale = m.LiveH1AuthorityExpectation(m.RUN_ID, m.OWNER_GENERATION + 1)
rejected(handoff, stale)

def capture_rejected(*owners):
    try:
        m.capture_live_h1_authority(m.AUTHENTIC_EXPECTATION, *owners)
    except m.LiveH1AuthorityFailure:
        return
    raise AssertionError("malformed live owners were accepted")

original = json.loads(pathlib.Path(sys.argv[2]).read_text())
owners = [
    original["prep_polynomial"],
    original["basis_table"],
    original["relation_records"],
    original["generators"],
    original["hnf_transform"],
    original["hnf_matbnew"],
    original["hnf_hnf_transform"],
]
short = list(owners)
short[3] = short[3][:218]
capture_rejected(*short)
changed = [list(owner) for owner in owners]
changed[0][0] = int(changed[0][0]) + 1
capture_rejected(*changed)
changed = [list(owner) for owner in owners]
kernel = 0
relation = next(
    index
    for index, value in enumerate(handoff.kernel_relation_exponents(kernel))
    if value != 0
)
changed[2][66 * relation] = int(changed[2][66 * relation]) + 1
capture_rejected(*changed)
changed = [list(owner) for owner in owners]
column = next(
    index
    for index in range(15)
    if int(owners[6][15 * kernel + index]) != 0
)
changed[5][8 * column] = int(changed[5][8 * column]) + 1
capture_rejected(*changed)

# Fresh alpha owners are not compared with an in-bound frozen answer. They
# receive a different live digest; downstream principality replay decides
# whether those retained witnesses are mathematically valid.
changed = [list(owner) for owner in owners]
changed[3][0] = int(changed[3][0]) + 1
fresh = m.capture_live_h1_authority(m.AUTHENTIC_EXPECTATION, *changed)
assert fresh.owner_sha256 != handoff.owner_sha256
assert m.require_live_h1_authority(fresh, m.AUTHENTIC_EXPECTATION) is fresh

print(json.dumps({
    "schema": m.SCHEMA,
    "field": m.FIELD_ID,
    "runId": handoff.run_id,
    "ownerGeneration": handoff.owner_generation,
    "ownerSha256": handoff.owner_sha256,
    "principalAlphas": len(handoff.principal_alphas) // 3,
    "cleanupTransformShape": [73, 73],
    "activeHnfTransformShape": [15, 15],
    "kernelRelationMapShape": [7, 73],
    "kernelNonzeroCounts": nonzero,
    "kernelMaxAbsExponents": max_abs,
    "mutationsRejected": len(mutations) + 5,
    "downstreamFileJoins": 0,
    "downstreamFixtureJoins": 0,
    "unitSaturationProved": False,
    "publicCompletion": False,
}, sort_keys=True))
`;

const result = spawnSync(
  "python3",
  ["-c", program, root, resident, expectedOwnerSha256],
  {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: 240000,
  },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
