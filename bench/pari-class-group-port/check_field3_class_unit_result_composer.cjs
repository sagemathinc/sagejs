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
const pariPath = "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4";
const pariArchive = "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz";
const analyticPath = path.join(
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917",
  "phase0-bd4cb3518-durable-20260917/stages/analytic/attempts/attempt-T2yKcK",
  "generated/sagejs-analytic-invhr-gnrGNj/fixtures.json",
);
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

function retainedUnitEvidence() {
  const output = run(process.execPath, [
    path.join(runtimeRoot, "bench/pari-class-group-port/check_post_rnd_lie_iteration.cjs"),
    pariPath,
    pariArchive,
    initialPath,
    analyticPath,
  ], {
    cwd: runtimeRoot,
    env: { ...process.env, FIELD3_TRANSFORM_CAPTURE_ONLY: "1" },
  });
  return lastJSON(output).cpython.rawToAcceptedTransform;
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
  const exactOwner = JSON.parse(fs.readFileSync(authorityPath, "utf8")).authority.owners;
  relation.selectedGeneratorIdeals = relation.matrix.selected.map(packet =>
    exactOwner.packetIdeals.slice(16 * (packet - 1), 16 * packet));
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

function determinant4(matrix) {
  const a = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => BigInt(matrix[4 * row + column])));
  let sign = 1n;
  let denominator = 1n;
  for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
    if (a[pivotIndex][pivotIndex] === 0n) {
      const swap = a.findIndex((row, index) => index > pivotIndex && row[pivotIndex] !== 0n);
      assert(swap > pivotIndex, "singular principal generator");
      [a[pivotIndex], a[swap]] = [a[swap], a[pivotIndex]];
      sign = -sign;
    }
    const pivot = a[pivotIndex][pivotIndex];
    for (let row = pivotIndex + 1; row < 4; row += 1) {
      for (let column = pivotIndex + 1; column < 4; column += 1) {
        const numerator = a[row][column] * pivot -
          a[row][pivotIndex] * a[pivotIndex][column];
        assert.equal(numerator % denominator, 0n);
        a[row][column] = numerator / denominator;
      }
    }
    denominator = pivot;
  }
  return sign * a[3][3];
}

function composeFactored(transform, compactTransform) {
  const answer = [];
  for (let unit = 0; unit < 2; unit += 1) {
    for (let relation = 0; relation < 301; relation += 1) {
      let value = 0n;
      for (let accepted = 0; accepted < 13; accepted += 1) {
        value += BigInt(transform[accepted * 301 + relation]) *
          BigInt(compactTransform[unit * 13 + accepted]);
      }
      answer.push(String(value));
    }
  }
  return answer;
}

function validateExactKernel(relations, transform) {
  for (let accepted = 0; accepted < 13; accepted += 1) {
    for (let row = 0; row < 288; row += 1) {
      let value = 0n;
      for (let relation = 0; relation < 301; relation += 1) {
        value += BigInt(relations[relation * 288 + row]) *
          BigInt(transform[accepted * 301 + relation]);
      }
      assert.equal(value, 0n, `R*T at (${row},${accepted})`);
    }
  }
}

function exactUnitNorms(principalGenerators, factored, multiplicationTable) {
  const norms = [];
  for (let relation = 0; relation < 301; relation += 1) {
    const element = principalGenerators.slice(4 * relation, 4 * relation + 4)
      .map(BigInt);
    const matrix = Array.from({ length: 16 }, (_, entry) => {
      let value = 0n;
      for (let basis = 0; basis < 4; basis += 1) {
        value += element[basis] * BigInt(multiplicationTable[16 * basis + entry]);
      }
      return value;
    });
    const norm = determinant4(matrix);
    assert.notEqual(norm, 0n);
    norms.push(norm);
  }
  return [0, 1].map(unit => {
    let parity = 0n;
    for (let relation = 0; relation < 301; relation += 1) {
      if (norms[relation] < 0n) {
        parity += BigInt(factored[unit * 301 + relation]);
      }
    }
    return parity % 2n === 0n ? "1" : "-1";
  });
}

function makeUnitBoundary(candidateEvidence, trustedEvidence, compactReceipt) {
  const authorityOwners = JSON.parse(fs.readFileSync(authorityPath, "utf8"))
    .authority.owners;
  const table = JSON.parse(fs.readFileSync(initialPath, "utf8"))
    .expected[0].basisTable;
  assert.deepEqual(trustedEvidence.sameRunAuthority.relationRecords,
    authorityOwners.relationRecords);
  assert.deepEqual(trustedEvidence.sameRunAuthority.principalGenerators,
    authorityOwners.principalGenerators);
  assert.deepEqual(candidateEvidence, trustedEvidence,
    "independent retained-unit captures diverged");
  assert.deepEqual(trustedEvidence.shape, [301, 13]);
  assert.deepEqual(trustedEvidence.relationKernelState, [0, 288, 301, 13, 3744]);
  assert.deepEqual(trustedEvidence.packedReplayState, [0, 301, 13, 273, 4, 0, 0, 0]);
  assert.deepEqual(trustedEvidence.mutationsRejected,
    ["raw-relation", "raw-log", "terminal-A", "local-transform", "input-permutation"]);
  const transform = trustedEvidence.entries.map(String);
  const relations = trustedEvidence.sameRunAuthority.relationRecords.map(String);
  const generators = trustedEvidence.sameRunAuthority.principalGenerators.map(String);
  const sourceRawLogs = trustedEvidence.sourceRawLogs.map(String);
  const terminalAcceptedA = trustedEvidence.terminalAcceptedA.map(String);
  const compactTransform = compactReceipt.verified.compact_transform_entries.map(String);
  validateExactKernel(relations, transform);
  const factored = composeFactored(transform, compactTransform);
  // R*(T*U)=0 proves each factored principal product has ideal one; verify it
  // directly as a second exact gate rather than relying only on associativity.
  for (let unit = 0; unit < 2; unit += 1) {
    for (let row = 0; row < 288; row += 1) {
      let value = 0n;
      for (let relation = 0; relation < 301; relation += 1) {
        value += BigInt(relations[relation * 288 + row]) *
          BigInt(factored[unit * 301 + relation]);
      }
      assert.equal(value, 0n, `factored principal ideal at (${row},${unit})`);
    }
  }
  const unitNorms = exactUnitNorms(generators, factored, table);
  assert.deepEqual(unitNorms, ["1", "1"]);
  const trusted = {
    factoredUnitTransform: factored,
    principalGenerators: generators,
    rawToAcceptedTransform: transform,
    relationRecords: relations,
    sourceRawLogs,
    terminalAcceptedA,
    unitNorms,
  };
  const authoritySha256 = neutral.sha256Canonical({
    compactTransform,
    relationAuthoritySha256: composer.AUTHORITY_SHA256,
    suffixAuthoritySha256: composer.SUFFIX_SHA256,
    trusted,
  });
  return {
    authoritySha256,
    factoredUnitTransform: [...factored],
    fieldId: composer.FIELD_ID,
    principalGenerators: [...generators],
    rawToAcceptedTransform: [...transform],
    relationRecords: [...relations],
    replay(candidate) {
      assert.deepEqual(candidate.rawToAcceptedTransform, trusted.rawToAcceptedTransform);
      assert.deepEqual(candidate.relationRecords, trusted.relationRecords);
      assert.deepEqual(candidate.principalGenerators, trusted.principalGenerators);
      assert.deepEqual(candidate.sourceRawLogs, trusted.sourceRawLogs);
      assert.deepEqual(candidate.terminalAcceptedA, trusted.terminalAcceptedA);
      assert.deepEqual(candidate.factoredUnitTransform, trusted.factoredUnitTransform);
      assert.deepEqual(candidate.unitNorms, trusted.unitNorms);
      validateExactKernel(candidate.relationRecords, candidate.rawToAcceptedTransform);
      assert.deepEqual(
        composeFactored(candidate.rawToAcceptedTransform, compactTransform),
        candidate.factoredUnitTransform,
      );
      return {
        authoritySha256,
        compactUnitTransformSha256: neutral.sha256Canonical(compactTransform),
        correspondenceComplete: true,
        exactKernelVerified: true,
        factoredUnitNormsVerified: true,
        factoredUnitTransformSha256:
          neutral.sha256Canonical(candidate.factoredUnitTransform),
        fieldId: composer.FIELD_ID,
        packedLogTransformVerified: true,
        pariCallsAfterBoundary: 0,
        principalGeneratorsSha256: neutral.sha256Canonical(candidate.principalGenerators),
        principalIdealOneVerified: true,
        publicComplete: false,
        relationAuthoritySha256: composer.AUTHORITY_SHA256,
        relationRecordsSha256: neutral.sha256Canonical(candidate.relationRecords),
        sameRunPrincipalGeneratorsVerified: true,
        sameRunSuffixVerified: true,
        schema: composer.UNIT_BOUNDARY_SCHEMA,
        sourceRawLogsSha256: neutral.sha256Canonical(candidate.sourceRawLogs),
        suffixAuthoritySha256: composer.SUFFIX_SHA256,
        terminalAcceptedASha256: neutral.sha256Canonical(candidate.terminalAcceptedA),
        transformSha256: neutral.sha256Canonical(candidate.rawToAcceptedTransform),
        unitNorms: [...unitNorms],
      };
    },
    schema: composer.UNIT_BOUNDARY_SCHEMA,
    sourceRawLogs: [...sourceRawLogs],
    terminalAcceptedA: [...terminalAcceptedA],
    unitNorms: [...unitNorms],
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
reject(value => { value.relation.selectedGeneratorIdeals[1][0] = "1"; }, false);
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

// Two independent producer invocations bind the data passed to the composer
// to a separately retained source-order replay.  Each invocation itself
// rejects raw relation/log/A/local-transform/permutation mutations.
const candidateUnitEvidence = retainedUnitEvidence();
const trustedUnitEvidence = retainedUnitEvidence();
const unitBoundary = makeUnitBoundary(
  candidateUnitEvidence,
  trustedUnitEvidence,
  receipts.compact,
);
const FINAL_REPLAY_SCHEMA =
  "sagejs.pari-class-group/field3-final-correspondence-replay-v1";
const ready = composer.prepareField3ClassUnitResult(authorized, {
  publicationReplaySchema: FINAL_REPLAY_SCHEMA,
  unitCorrespondence: unitBoundary,
});
assert.equal(ready.status, "ready-for-out-of-band-publication-authority");
assert.equal(ready.correspondenceComplete, true);
assert.equal(ready.publicComplete, false);
assert(Object.isFrozen(ready));
const readyRaw = Buffer.from(ready.sealedEnvelopeHex, "hex");
assert.equal(neutral.sha256Bytes(readyRaw), ready.sealedEnvelopeSha256);
const readyPayload = JSON.parse(readyRaw.toString("ascii")).payload;
const expectedOwners = new Map([
  ["compact-unit-transform", receipts.compact.verified.compact_transform_entries.map(String)],
  ["factored-unit-norms", unitBoundary.unitNorms],
  ["factored-unit-transform", unitBoundary.factoredUnitTransform],
  ["principal-generators", unitBoundary.principalGenerators],
  ["raw-relation-records", unitBoundary.relationRecords],
  ["raw-to-accepted-unit-transform", unitBoundary.rawToAcceptedTransform],
  ["source-raw-packed-logs", unitBoundary.sourceRawLogs],
  ["terminal-accepted-packed-logs", unitBoundary.terminalAcceptedA],
  ["torsion-generator", ["-1", "0", "0", "0"]],
]);
const finalMathematicalAuthoritySha256 = neutral.sha256Canonical({
  componentAuthorities: [
    composer.AUTHORITY_SHA256,
    composer.INITIAL_SHA256,
    composer.SUFFIX_SHA256,
  ],
  unitCorrespondenceAuthoritySha256: unitBoundary.authoritySha256,
});

function independentFinalReplay(candidate) {
  assert.equal(candidate.field.id, composer.FIELD_ID);
  assert.deepEqual(candidate.field.definingPolynomialAscending, composer.POLYNOMIAL);
  assert.deepEqual(candidate.classGroup.invariantFactors, ["2", "2"]);
  assert.equal(candidate.classGroup.classNumber, "4");
  assert.equal(candidate.unitGroup.rank, "2");
  assert.deepEqual(candidate.unitGroup.materialization,
    { precisionBits: "192", reason: "PRECI", tag: "not_given" });
  assert.equal(candidate.unitGroup.torsionOrder, "2");
  assert.equal(candidate.terminal.correspondence_complete, true);
  assert.equal(candidate.terminal.public_complete, false);
  assert.equal(candidate.source.pariVersion, "2.17.4");
  const owners = new Map(candidate.storage.map(entry => [entry.name, entry]));
  for (const [name, entries] of expectedOwners) {
    const current = owners.get(name);
    assert(current, `missing final owner ${name}`);
    assert.equal(current.logicalLength, String(entries.length));
    assert.equal(current.capacity, String(entries.length));
    assert.deepEqual(current.entries, entries);
  }
  assert.deepEqual(owners.get("class-presentation").entries, [
    "2", "0", "0", "2",
    ...receipts.relation.selectedGeneratorIdeals.flat().map(String),
  ]);
  assert.deepEqual(owners.get("regulator-enclosure").entries,
    receipts.compact.verified.regulator.map(String));
  return {
    correspondence_complete: true,
    fieldId: composer.FIELD_ID,
    mathematicalAuthoritySha256: finalMathematicalAuthoritySha256,
    payloadSha256: neutral.sha256Canonical(candidate),
    public_complete: false,
    schema: FINAL_REPLAY_SCHEMA,
  };
}

function finalAuthority(raw) {
  return neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw),
    mathematicalAuthoritySha256: finalMathematicalAuthoritySha256,
    replay: independentFinalReplay,
    replaySchema: FINAL_REPLAY_SCHEMA,
  });
}

const publisher = new neutral.ClassUnitCorrespondencePublisher();
const published = composer.publishPreparedField3Result(
  ready, finalAuthority(readyRaw), publisher);
assert.equal(published, publisher.current());
assert.equal(composer.publishPreparedField3Result(
  ready, finalAuthority(readyRaw), publisher), published);
assert.equal(published.detachedPayload().terminal.public_complete, false);
assert.equal(published.detachedPayload().terminal.correspondence_complete, true);

function rejectBoundaryMutation(name, index) {
  const changed = {
    ...unitBoundary,
    [name]: [...unitBoundary[name]],
  };
  changed[name][index] = String(BigInt(changed[name][index]) + 1n);
  assert.throws(() => composer.prepareField3ClassUnitResult(authorized, {
    publicationReplaySchema: FINAL_REPLAY_SCHEMA,
    unitCorrespondence: changed,
  }), composer.Field3ResultCompositionFailure);
  mutationsRejected += 1;
}
rejectBoundaryMutation("rawToAcceptedTransform", 0);
rejectBoundaryMutation("relationRecords", 0);
rejectBoundaryMutation("principalGenerators", 0);
rejectBoundaryMutation("sourceRawLogs", 0);
rejectBoundaryMutation("terminalAcceptedA", 0);
rejectBoundaryMutation("factoredUnitTransform", 0);
rejectBoundaryMutation("unitNorms", 0);

// Even a coordinated JSON re-seal and a fresh envelope digest cannot alter a
// mathematical owner because the final replay remains rooted out of band.
const fraudPayload = structuredClone(readyPayload);
const fraudOwner = fraudPayload.storage.find(
  entry => entry.name === "factored-unit-transform");
fraudOwner.entries[0] = String(BigInt(fraudOwner.entries[0]) + 1n);
const fraudRaw = neutral.sealClassUnitCorrespondenceResult(fraudPayload);
const fraudPrepared = {
  ...ready,
  sealedEnvelopeHex: fraudRaw.toString("hex"),
  sealedEnvelopeSha256: neutral.sha256Bytes(fraudRaw),
};
assert.throws(() => composer.publishPreparedField3Result(
  fraudPrepared, finalAuthority(fraudRaw)), neutral.ClassUnitResultFailure);
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
  correspondenceComplete: true,
  exactRelationOwners: 301,
  field: composer.FIELD_ID,
  invariantFactors: [2, 2],
  retainedTransformEntries: 3913,
  factoredUnitNorms: unitBoundary.unitNorms.map(Number),
  factoredUnitSupports: [0, 1].map(unit =>
    unitBoundary.factoredUnitTransform
      .slice(301 * unit, 301 * (unit + 1))
      .filter(value => value !== "0").length),
  mutationsRejected,
  pariCallsAfterBoundary: 0,
  publicComplete: false,
  schema: blocked.schema,
  publishedSha256: published.sha256,
  status: "pari-correspondence-complete-internal",
  torsionOrder: 2,
  unitMaterialization: "not_given(PRECI)",
  unitRank: 2,
}));
