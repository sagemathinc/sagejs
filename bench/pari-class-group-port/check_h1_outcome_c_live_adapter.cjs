#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const {
  COMPLETE_STATUS,
  OWNER_SHAPES,
  UNAUTHENTICATED_STATUS,
  createPreparedH1Adapter,
  digest,
  stageMode,
} = require("./h1_outcome_c_live_adapter.cjs");

const here = __dirname;
function declarations(file, entry) {
  const source = fs.readFileSync(path.join(here, file), "utf8");
  const match = source.match(new RegExp(`def\\s+${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

const candidateNames = declarations(
  "resident_generated_class_attempt.py", "pari_resident_generated_class_attempt",
);
const rootNames = declarations("pari_unified_complete_h1_root.py", "pari_unified_complete_h1_root");
assert.equal(candidateNames.length, 351);
assert.deepEqual(rootNames.slice(0, 351), candidateNames);
assert.equal(stageMode, "whole-root-only");

function objectLiteral(file, declaration, context = {}) {
  const source = fs.readFileSync(path.join(here, file), "utf8");
  const pattern = declaration === "sizes"
    ? /const sizes = (\{[\s\S]*?\n\});/
    : new RegExp(`const ${declaration} = Object\\.freeze\\((\\{[\\s\\S]*?\\n\\})\\);`);
  const match = source.match(pattern);
  assert(match, `missing ${declaration} in ${file}`);
  return vm.runInNewContext(`(${match[1]})`, context);
}
const canonicalShapes = {
  ...objectLiteral("check_live_h1_owner_bridge.cjs", "sizes", { columnCapacity: 16 }),
  ...objectLiteral("check_pari_unified_complete_h1_root.cjs", "classSizes"),
  ...objectLiteral("check_pari_unified_complete_h1_root.cjs", "precisionSizes"),
  ...objectLiteral("check_pari_unified_complete_h1_root.cjs", "finalSizes"),
  unified_state: 12,
};
assert.deepEqual(OWNER_SHAPES, canonicalShapes,
  "adapter owner shapes diverged from the complete-root checker");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-complete-h1-adapter-"));
const modulePath = path.join(temporary, "complete-root.cjs");
const indices = Object.fromEntries(rootNames.map(([name], index) => [name, index]));
fs.writeFileSync(modulePath, `
"use strict";
const indices=${JSON.stringify(indices)};
let mode="success";
function set(args,name,entries){
  const target=args[indices[name]];
  target.splice(0,target.length,...entries.map(BigInt));
}
function gmp(...args){
  if(mode==="status") return 6n;
  set(args,"prep_kummer_random_state",[17,23,42]);
  set(args,"precision_authority_state",[0,5,2304,0,3,73,15,7,2,7,2,0,0,0,1,4096]);
  set(args,"final_polynomial",[20034,-20018,0,1]);
  set(args,"final_exact_units",[1,2,3,4,5,6]);
  set(args,"final_exact_norms",mode==="bad-norm"?[-1,1]:[-1,-1]);
  set(args,"final_regulator",[991,192,-8]);
  set(args,"final_torsion_order",[2]);
  set(args,"final_torsion_generator",[-1,0,0]);
  set(args,"final_state",mode==="unpublished"
    ?[0,0,0,0,0,0,73,8,1,0,2,2,1,811,0,0]
    :[0,0,0,0,0,0,73,8,1,0,2,2,1,811,1,0]);
  return 0n;
}
gmp.gmp=gmp;
gmp.createIntegerBuffer=(length,_words,initial)=>Array.from(initial).slice(0,length);
module.exports={
  pari_unified_complete_h1_root:gmp,
  setMode(value){mode=value;},
};
`);
const fakeModule = require(modulePath);
const compiler = async ({ sourcePath }) => {
  assert(sourcePath.endsWith("pari_unified_complete_h1_root.py"));
  return { modulePath };
};

const input = Object.fromEntries(candidateNames.map(([name, kind]) => [
  name, kind.endsWith("Buffer") ? [] : kind === "bool" ? false : kind === "float" ? 0 : "0",
]));
input.prepared_test_marker = "bound";
const preparedInput = {
  schema: "sagejs.pari-class-group/sanitized-prepared-h1-v1",
  fieldId: "pari-2.17.4:x^3-20018*x+20034",
  names: candidateNames,
  input,
};
const expectedPreparedDigest = digest(input);
function authenticatePreparedInput(value) {
  assert.equal(digest(value), expectedPreparedDigest, "prepared field mutation rejected");
  return Object.freeze({
    schema: "test-prepared-authority",
    sha256: digest({ prepared: expectedPreparedDigest }),
  });
}

async function call(runPreparedH1, value = preparedInput, preparedState) {
  const stages = [];
  const output = await runPreparedH1({
    implementation: "sagejs",
    seed: "9",
    preparedInput: structuredClone(value),
    preparedState,
    switchStage: stage => stages.push(stage),
  });
  assert.deepEqual(stages, [], "monolithic native root invented host leaf timings");
  return output;
}

async function main() {
  const unauthenticated = createPreparedH1Adapter({ compiler, authenticatePreparedInput });
  const pending = await call(unauthenticated);
  assert.equal(pending.correspondenceComplete, false);
  assert.equal(pending.terminalStatus, UNAUTHENTICATED_STATUS);
  assert.equal(pending.result.assumptions.publicClassUnitComplete, false);
  assert.equal(pending.result.assumptions.preparedNfAuthoritySha256,
    digest({ prepared: expectedPreparedDigest }));
  assert.equal(pending.replay.status, "cold-replay-required");
  assert.equal(pending.replay.resultSha256, digest(pending.result));

  let replayCalls = 0;
  const authenticated = createPreparedH1Adapter({
    compiler,
    authenticatePreparedInput,
    authenticateFinalPublication(publication) {
      replayCalls += 1;
      assert.equal(publication.rootStatus, "0");
      assert.equal(publication.resultSha256, digest(publication.result));
      assert.equal(publication.preparedAuthority.sha256,
        publication.result.assumptions.preparedNfAuthoritySha256);
      assert(Object.isFrozen(publication.replayOwners));
      assert.equal(publication.replayOwners.final_state[14], 1n);
      assert.deepEqual(publication.replayOwners.final_exact_units,
        [1n, 2n, 3n, 4n, 5n, 6n]);
      assert(Object.hasOwn(publication.replayOwners, "relation_records"));
      assert(Object.hasOwn(publication.replayOwners, "generators"));
      assert.deepEqual(publication.result.units.norms, ["-1", "-1"]);
      assert.equal(publication.result.correspondence.finalState[14], "1");
      return {
        status: "cold-replay-authenticated",
        resultSha256: publication.resultSha256,
        authoritySha256: digest({ replayed: publication.resultSha256 }),
      };
    },
  });
  const preparedState = await authenticated.preparePreparedH1({
    implementation: "sagejs", preparedInput: structuredClone(preparedInput),
  });
  const direct = await call(authenticated, preparedInput, preparedState);
  assert.equal(replayCalls, 1);
  assert.equal(direct.correspondenceComplete, true);
  assert.equal(direct.terminalStatus, COMPLETE_STATUS);
  assert.equal(direct.result.classGroup.classNumber, "1");
  assert.deepEqual(direct.result.units.integralCoordinates,
    [["1", "2", "3"], ["4", "5", "6"]]);
  assert.deepEqual(direct.result.torsion, { order: "2", generator: ["-1", "0", "0"] });
  assert.deepEqual(direct.rng, { seed: "9", terminal: ["17", "23", "42"] });
  assert.deepEqual(direct.work, {
    nativeStatus: "0", relations: "73", hnfRank: "8",
    precisionAttempts: "5", retryPrecision: "2304", publishedCells: "811",
  });

  const changed = structuredClone(preparedInput);
  changed.input.prepared_test_marker = "changed";
  await assert.rejects(() => call(authenticated, changed), /prepared field mutation rejected/);
  await assert.rejects(() => call(authenticated, preparedInput, {}),
    /did not originate at this adapter/);

  fakeModule.setMode("unpublished");
  await assert.rejects(() => call(authenticated), /atomically publish/);
  fakeModule.setMode("status");
  await assert.rejects(() => call(authenticated), /did not succeed/);
  fakeModule.setMode("bad-norm");
  await assert.rejects(() => call(authenticated), /Expected values to be strictly deep-equal/);
  fakeModule.setMode("success");

  const detached = createPreparedH1Adapter({
    compiler, authenticatePreparedInput,
    authenticateFinalPublication() {
      return {
        status: "cold-replay-authenticated",
        resultSha256: "0".repeat(64), authoritySha256: "1".repeat(64),
      };
    },
  });
  await assert.rejects(() => call(detached), /detached from result/);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/outcome-c-live-adapter-check-v2",
    rootParameterCount: rootNames.length,
    preparedParameterCount: candidateNames.length,
    resultSha256: direct.replay.resultSha256,
    authoritySha256: direct.replay.authoritySha256,
    correspondenceComplete: direct.correspondenceComplete,
    terminalStatus: direct.terminalStatus,
    rootBoundary: "whole-root-only",
    mutationsRejected: 6,
    publicComplete: false,
  }));
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
