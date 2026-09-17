#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPreparedH1Adapter } = require("./h1_outcome_c_live_adapter.cjs");
const { digest } = require("./h1_outcome_c_worker.cjs");

const here = __dirname;
function declarations(file, entry) {
  const source = fs.readFileSync(path.join(here, file), "utf8");
  const match = source.match(new RegExp(`def\\s+${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match);
  return match[1].trim().split("\n").map(line => line.trim().replace(/,$/, "").split(": "));
}
const candidateNames = declarations("resident_generated_class_attempt.py", "pari_resident_generated_class_attempt");
const bridgeNames = declarations("live_h1_owner_bridge.py", "pari_live_h1_owner_bridge");
assert.equal(candidateNames.length, 351);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-live-h1-adapter-"));
const candidateModule = path.join(temporary, "candidate.cjs");
const bridgeModule = path.join(temporary, "bridge.cjs");
const candidateIndex = Object.fromEntries(candidateNames.map(([name], index) => [name, index]));
const bridgeIndex = Object.fromEntries(bridgeNames.map(([name], index) => [name, index]));
fs.writeFileSync(candidateModule, `
"use strict";
const index=${JSON.stringify(candidateIndex)};
function replace(args,name,values){const target=args[index[name]];target.splice(0,target.length,...values.map(BigInt));}
function tagged(...args){
 replace(args,"attempt_state",[4,0,1,1]);replace(args,"class_number",[1]);
 replace(args,"class_invariants",[]);replace(args,"relation_state",[73,0,0,0,73,0]);
 replace(args,"hnf_state",[0,8,0,0,0,0,0,0,0]);
 replace(args,"hnf_result_c",Array(147).fill(0).map((_,i)=>i+1));
 replace(args,"accept_relations",Array(14).fill(0).map((_,i)=>i===0?1:0));
 replace(args,"accept_regulator",[1,1,0]);replace(args,"prep_base_state",[333,333,66,48,48,66,0]);
 replace(args,"prep_state",[0,0,0,0,0,0,0,0]);replace(args,"accept_acceptance_state",[0,0,0]);
 replace(args,"prep_kummer_random_state",[17,23,42]);return 0n;
}
tagged.tagged=tagged;module.exports.pari_resident_generated_class_attempt=tagged;
`);
fs.writeFileSync(bridgeModule, `
"use strict";
const index=${JSON.stringify(bridgeIndex)};
function tagged(...args){
 const set=(name,values)=>{const target=args[index[name]];target.splice(0,target.length,...values.map(BigInt));};
 set("bridge_state",[0,0,0,0,0,7,1,0,73,8,48,48,2,7,7,0]);
 set("compact_provenance",[0,0,0,0,0,0,1,0,0,0,0,0,1,-1]);
 set("cleaned_arch",Array(147).fill(0).map((_,i)=>i+1));return 0n;
}
tagged.tagged=tagged;module.exports.pari_live_h1_owner_bridge=tagged;
`);

const compiler = async ({ sourcePath }) => ({
  modulePath: sourcePath.endsWith("resident_generated_class_attempt.py")
    ? candidateModule : bridgeModule,
});
const runPreparedH1 = createPreparedH1Adapter({ compiler });
const input = Object.fromEntries(candidateNames.map(([name, kind]) => [
  name, kind.endsWith("Buffer") ? [] : kind === "bool" ? false : kind === "float" ? 0 : "0",
]));
const preparedInput = {
  schema: "sagejs.pari-class-group/sanitized-prepared-h1-v1",
  fieldId: "pari-2.17.4:x^3-20018*x+20034",
  names: candidateNames,
  input,
};

async function main() {
  const stages = [];
  const direct = await runPreparedH1({
    implementation: "sagejs", seed: "9", preparedInput: structuredClone(preparedInput),
    switchStage: stage => stages.push(stage),
  });
  assert.deepEqual(stages, [
    "relation-retry", "sparse-hnf-snf-transform", "unit-regulator", "honesty-generators-final",
  ]);
  assert.equal(direct.correspondenceComplete, false);
  assert.equal(direct.terminalStatus, "live-candidate-bridge-prefix-h1");
  assert.equal(direct.result.classGroup.classNumber, "1");
  assert.equal(direct.result.assumptions.publicClassUnitComplete, false);
  assert.equal(direct.replay.resultSha256, digest(direct.result));
  assert.deepEqual(direct.rng, { seed: "9", terminal: ["17", "23", "42"] });
  assert.deepEqual(direct.work, { action: "0", relations: "73", hnfRank: "8", cleanedColumns: "7" });

  const changed = structuredClone(preparedInput);
  changed.names = changed.names.slice(0, -1);
  await assert.rejects(() => runPreparedH1({
    implementation: "sagejs", seed: "9", preparedInput: changed, switchStage() {},
  }), /351|ABI/);
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/outcome-c-live-adapter-check-v1",
    parameterCount: candidateNames.length,
    stageOrder: stages,
    resultSha256: direct.replay.resultSha256,
    authoritySha256: direct.replay.authoritySha256,
    correspondenceComplete: direct.correspondenceComplete,
    terminalStatus: direct.terminalStatus,
    inMemoryOnly: true, fixtureReads: false, pariCalls: false,
  }));
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
