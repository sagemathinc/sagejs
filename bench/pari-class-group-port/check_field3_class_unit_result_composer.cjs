#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const durable =
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const authorityPath = path.join(durable,
  "authority-246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c.json");
const initialPath = path.join(durable,
  "initial-collector-fixtures-81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe.json");
const suffixPath = path.join(durable,
  "mixed-unit-live-b3ccd8916527e8a7df4a7d10a2f5cb9e76865d5209532817ac65c1aaa178f5e7.json");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root);
const composer = require("./field3_class_unit_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 300_000,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function lastJSON(output) {
  return JSON.parse(output.trim().split(/\r?\n/).at(-1));
}

function exactReceipts() {
  for (const filename of [authorityPath, initialPath, suffixPath]) {
    assert(fs.statSync(filename).isFile(), `missing durable authority: ${filename}`);
  }
  const relation = lastJSON(run(process.execPath, [
    path.join(__dirname, "check_field3_relation_replay_map.cjs"),
    authorityPath,
    initialPath,
  ], {
    env: {
      ...process.env,
      SAGEJS_EXECUTABLE: path.join(runtimeRoot, "bin", "sagejs"),
    },
  }));
  // Wall-clock observations are not mathematical receipt fields and are not
  // canonical integers.  Keep them outside the authority boundary.
  delete relation.matrix.hnfSeconds;
  delete relation.matrix.presentationSeconds;
  const compactProgram = String.raw`
import importlib,json,sys
sys.path[:0]=[sys.argv[1]]
m=importlib.import_module('bench.pari-class-group-port.field3_compact_unit_replay')
print(json.dumps(m.replay_field3_compact_units(*sys.argv[2:5]),sort_keys=True,separators=(',',':')))
`;
  const compact = lastJSON(run("python3", ["-c", compactProgram, root,
    authorityPath, initialPath, suffixPath]));
  const torsionProgram = String.raw`
import importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+'/src/lib']
m=importlib.import_module('bench.pari-class-group-port.mixed_real_torsion_authority')
p=[-2000042,-2000022,0,0,1];o=[777];g=[777]*4;s=[0]*8
assert m.pari_exact_mixed_real_torsion(p,2,1,o,g,s)==0
print(json.dumps({'polynomial':p,'signature':[2,1],'order':o[0],
 'generator':g,'state':s,'generatorNorm':s[7]},sort_keys=True,separators=(',',':')))
`;
  const torsion = lastJSON(run("python3", ["-c", torsionProgram, root]));
  return { compact, relation, torsion };
}

function component(receipt, replaySchema, mathematicalAuthoritySha256) {
  const trusted = structuredClone(receipt);
  const receiptSha256 = neutral.sha256Canonical(receipt);
  return {
    authority: {
      mathematicalAuthoritySha256,
      receiptSha256,
      replay(candidate) {
        assert.deepEqual(candidate, trusted);
        return {
          accepted: true,
          fieldId: composer.FIELD_ID,
          mathematicalAuthoritySha256,
          receiptSha256: neutral.sha256Canonical(candidate),
          schema: replaySchema,
        };
      },
      replaySchema,
    },
    receipt,
  };
}

function authorizedReceipts(receipts) {
  const compactAuthority = neutral.sha256Canonical({
    authoritySha256: composer.AUTHORITY_SHA256,
    initialSha256: composer.INITIAL_SHA256,
    suffixSha256: composer.SUFFIX_SHA256,
  });
  const torsionAuthority = neutral.sha256Canonical({
    generator: ["-1", "0", "0", "0"],
    polynomial: composer.POLYNOMIAL,
    state: ["0", "4", "2", "1", "23", "23", "529", "1"],
  });
  return {
    compact: component(receipts.compact, composer.COMPONENT_REPLAY_SCHEMAS.compact,
      compactAuthority),
    relation: component(receipts.relation, composer.COMPONENT_REPLAY_SCHEMAS.relation,
      composer.AUTHORITY_SHA256),
    torsion: component(receipts.torsion, composer.COMPONENT_REPLAY_SCHEMAS.torsion,
      torsionAuthority),
  };
}

const receipts = exactReceipts();
const authorized = authorizedReceipts(receipts);
const blocked = composer.prepareField3ClassUnitResult(authorized);
assert.equal(blocked.schema, composer.COMPOSITION_SCHEMA);
assert.equal(blocked.status, "blocked-missing-exact-unit-correspondence");
assert.equal(blocked.correspondenceComplete, false);
assert.equal(blocked.publicComplete, false);
assert.equal(blocked.sealedEnvelopeHex, null);
assert(Object.isFrozen(blocked) && Object.isFrozen(blocked.missing));
assert.deepEqual(blocked.verified.classGroup,
  { classNumber: "4", invariantFactors: ["2", "2"] });
assert.equal(blocked.verified.arbitraryIdealExactQuotient, true);
assert.equal(blocked.verified.unitMaterialization, "not_given(PRECI)");
assert.equal(blocked.verified.torsionOrder, "2");
assert.deepEqual(blocked.missing.map(entry => entry.name), [
  "raw_to_accepted_relation_transform",
  "same_run_retained_unit_suffix",
]);
assert.throws(() => composer.publishPreparedField3Result(blocked, {}),
  composer.Field3ResultCompositionFailure);

let mutationsRejected = 0;
function reject(mutator, reauthorize = true) {
  const changed = structuredClone(receipts);
  mutator(changed);
  const input = reauthorize ? authorizedReceipts(changed) : {
    compact: { authority: authorized.compact.authority, receipt: changed.compact },
    relation: { authority: authorized.relation.authority, receipt: changed.relation },
    torsion: { authority: authorized.torsion.authority, receipt: changed.torsion },
  };
  assert.throws(() => composer.prepareField3ClassUnitResult(input));
  mutationsRejected += 1;
}

reject(value => { value.relation.authoritySha256 = "0".repeat(64); });
reject(value => { value.relation.matrix.invariants[0] = 4; });
reject(value => { value.relation.matrix.order = 8; });
reject(value => { value.relation.matrix.selected.reverse(); });
reject(value => { value.relation.arbitraryIdeal.exactQuotientReplay = false; });
reject(value => { value.relation.cpython.receipt.ideal[0] += 1; }, false);
reject(value => { value.compact.source.suffix_sha256 = "0".repeat(64); });
reject(value => { value.compact.verified.getfu_decision = "success"; });
reject(value => { value.compact.verified.regulator[0] = "1"; }, false);
reject(value => { value.compact.terminal.exact_units_verified = true; });
reject(value => { value.compact.terminal.missing_owner.required_entries = "3912"; });
reject(value => { value.torsion.generator[0] = 1; });
reject(value => { value.torsion.state[6] = 528; });

// A transform-shaped value is not enough.  It cannot open the future boundary
// unless a separately injected synchronous replay authenticates every exact
// identity and same-run owner.
const untrustedBoundary = {
  authoritySha256: "1".repeat(64),
  fieldId: composer.FIELD_ID,
  rawToAcceptedTransform: Array(3913).fill("0"),
  replay: () => ({
    correspondenceComplete: true,
    publicComplete: false,
    schema: composer.UNIT_BOUNDARY_SCHEMA,
  }),
  schema: composer.UNIT_BOUNDARY_SCHEMA,
};
assert.throws(() => composer.prepareField3ClassUnitResult(authorized, {
  publicationReplaySchema: "test-only",
  unitCorrespondence: untrustedBoundary,
}), composer.Field3ResultCompositionFailure);
mutationsRejected += 1;

const source = fs.readFileSync(path.join(__dirname,
  "field3_class_unit_result_composer.cjs"), "utf8");
assert(!source.includes("createDetachedClassUnitAuthority"));
assert(!source.includes("child_process"));
assert(!source.includes("readFileSync"));
assert(!source.includes("spawnSync"));

console.log(JSON.stringify({
  arbitraryIdealQuotientVerified: true,
  classNumber: 4,
  correspondenceComplete: false,
  exactRelationOwners: 301,
  field: composer.FIELD_ID,
  invariantFactors: [2, 2],
  missingEntries: 3913,
  mutationsRejected,
  pariCallsAfterBoundary: 0,
  publicComplete: false,
  schema: blocked.schema,
  status: blocked.status,
  torsionOrder: 2,
  unitMaterialization: "not_given(PRECI)",
  unitRank: 2,
}));
