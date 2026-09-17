#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const durable = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const paths = {
  authority: path.join(durable, "authority-246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c.json"),
  initial: path.join(durable, "initial-collector-fixtures-81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe.json"),
  suffix: path.join(durable, "mixed-unit-live-b3ccd8916527e8a7df4a7d10a2f5cb9e76865d5209532817ac65c1aaa178f5e7.json"),
};

function runPython(arguments_, input = "") {
  const result = spawnSync("python3", arguments_, {
    cwd: root,
    input,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const program = String.raw`
import json,sys
sys.path[:0]=[sys.argv[1]]
m=__import__('bench.pari-class-group-port.field3_compact_unit_replay',fromlist=['*'])
r=m.replay_field3_compact_units(*sys.argv[2:5])
print(json.dumps(r,sort_keys=True,separators=(',',':')))
`;
const result = JSON.parse(
  runPython(["-c", program, root, paths.authority, paths.initial, paths.suffix]),
);
assert.equal(result.terminal.status, "honest-partial-missing-exact-owner");
assert.equal(result.terminal.exact_units_verified, false);
assert.equal(result.terminal.principal_ideal_one_verified, false);
assert.equal(result.verified.principal_relation_norms, 301);
assert.equal(result.verified.scalar_generator_log_bindings, 26);
assert.equal(result.verified.terminal_packed_log_columns, 2);
assert.deepEqual(result.verified.selected_log_support, ["0", "1"]);
assert.deepEqual(result.verified.unmatched_unused_suffix_columns, ["7", "8", "9", "10", "11", "12"]);
assert.deepEqual(result.verified.compact_transform_shape, ["13", "2"]);
assert.deepEqual(result.verified.compact_transform_entries.slice(0, 13), ["1", ...Array(12).fill("0")]);
assert.deepEqual(result.verified.compact_transform_entries.slice(13), ["-2", "1", ...Array(11).fill("0")]);
assert.equal(result.verified.getfu_decision, "PRECI-not_given");
assert.equal(result.verified.expanded_units, null);
assert.deepEqual(result.terminal.missing_owner.shape, ["301", "13"]);
assert.equal(result.terminal.missing_owner.required_entries, "3913");
assert.equal(result.source.hashes_are_mathematical_authority, false);

// A coordinated relation/generator mutation can preserve the superficial
// norm equation.  It must still fail because the independently retained log
// column remains log(2), not log(4).
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-field3-compact-unit-"));
const changedAuthority = path.join(temporary, path.basename(paths.authority));
const authority = JSON.parse(fs.readFileSync(paths.authority, "utf8"));
authority.authority.owners.relationRecords[0] = "8";
authority.authority.owners.principalGenerators[0] = "4";
fs.writeFileSync(changedAuthority, JSON.stringify(authority));
const mutationProgram = String.raw`
import hashlib,json,sys
sys.path[:0]=[sys.argv[1]]
m=__import__('bench.pari-class-group-port.field3_compact_unit_replay',fromlist=['*'])
# Preserve artifact selection while testing mathematical replay rather than a
# digest mismatch: patch only the local provenance selector.
m.AUTHORITY_SHA256=hashlib.sha256(open(sys.argv[2],'rb').read()).hexdigest()
try:m.replay_field3_compact_units(*sys.argv[2:5])
except m.Field3CompactUnitReplayFailure as e:
 print(str(e));raise SystemExit(0)
raise SystemExit('coordinated mutation was accepted')
`;
const rejected = runPython(["-c", mutationProgram, root, changedAuthority, paths.initial, paths.suffix]);
assert.match(rejected, /principal generator\/log mismatch at column 0/);

// Even an all-zero owner with the required shape cannot cross the boundary.
const transformProgram = String.raw`
import sys
sys.path[:0]=[sys.argv[1]]
m=__import__('bench.pari-class-group-port.field3_compact_unit_replay',fromlist=['*'])
try:m.replay_field3_compact_units(*sys.argv[2:5],[0]*(301*13))
except m.Field3CompactUnitReplayFailure as e:
 print(str(e));raise SystemExit(0)
raise SystemExit('zero transform was accepted')
`;
const transformRejected = runPython(["-c", transformProgram, root, paths.authority, paths.initial, paths.suffix]);
assert.match(transformRejected, /packed-log and ideal replay are not yet connected/);

console.log(JSON.stringify({
  field: 3,
  polynomial: result.field,
  relations: result.verified.principal_relation_norms,
  unitColumns: 13,
  unitRank: 2,
  decision: result.verified.getfu_decision,
  exactUnitsPublished: false,
  missingOwner: result.terminal.missing_owner,
  additionalCaptureGap: result.terminal.additional_capture_gap,
  coordinatedMutationRejected: true,
  fingerprintsAreAuthority: false,
}));
