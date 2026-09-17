"use strict";

// Diagnostic-only adapter for the genuinely unified prepared H1 native root.
// It deliberately exposes only the mathematical intersection of Sage.js's
// internal result and PARI's flag-zero result.  Source-specific work and RNG
// states are checked before this common projection is returned; they are not
// falsely asserted to have the same representation.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const pari = require("./pari_h1_outcome_c_adapter.cjs");

const HERE = __dirname;
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const TERMINAL_STATUS = "pari-correspondence-complete-internal-h1";
const ROOT_SOURCE = path.join(HERE, "pari_unified_complete_h1_root.py");
const ROOT_CHECKER = path.join(HERE, "check_pari_unified_complete_h1_root.cjs");
const BRIDGE_CHECKER = path.join(HERE, "check_live_h1_owner_bridge.cjs");
const DIAGNOSTIC_STAGES = Object.freeze([
  "unattributed-remainder",
  "relation-retry",
  "sparse-hnf-snf-transform",
  "unit-regulator",
  "honesty-generators-final",
]);
const DIAGNOSTIC_STAGE_CLOCK = Object.freeze({
  function: "pari_unified_complete_h1_root",
  stages: DIAGNOSTIC_STAGES,
  maximumVisits: 32,
});

function canonical(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

function digest(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonical(value))).digest("hex");
}

function parameters(source, entry) {
  const match = source.match(new RegExp(`def ${entry}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing ${entry} signature`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

function objectLiteral(source, name, context = {}) {
  const match = source.match(new RegExp(
    `const ${name} = Object\\.freeze\\((\\{[\\s\\S]*?\\n\\})\\);`,
  ));
  assert(match, `missing ${name} capacity table`);
  return vm.runInNewContext(`(${match[1]})`, context);
}

function bridgeSizes() {
  const source = fs.readFileSync(BRIDGE_CHECKER, "utf8");
  const match = source.match(/const sizes = (\{[\s\S]*?\n\});/);
  assert(match, "missing bridge capacity table");
  return vm.runInNewContext(`(${match[1]})`, { columnCapacity: 16 });
}

function rootSpecification() {
  const source = fs.readFileSync(ROOT_SOURCE, "utf8");
  const checker = fs.readFileSync(ROOT_CHECKER, "utf8");
  const storagePolicy = objectLiteral(checker, "storagePolicy");
  const capacityContext = {
    storagePolicy,
    classSquareCapacity: storagePolicy.classRows ** 2,
    classRelationCapacity: storagePolicy.classRows * storagePolicy.classColumns,
    classTransformCapacity: storagePolicy.classColumns ** 2,
  };
  return {
    names: parameters(source, "pari_unified_complete_h1_root"),
    residentNames: parameters(
      fs.readFileSync(path.join(HERE, "resident_generated_class_attempt.py"), "utf8"),
      "pari_resident_generated_class_attempt",
    ),
    sizes: {
      ...bridgeSizes(),
      ...objectLiteral(checker, "classSizes", capacityContext),
      ...objectLiteral(checker, "precisionSizes", capacityContext),
      ...objectLiteral(checker, "finalSizes", capacityContext),
      unified_state: 12,
    },
  };
}

function values(owner) {
  return Array.isArray(owner) ? owner
    : owner.toArray ? owner.toArray() : Array.from(owner);
}

function asStrings(owner, length = owner.length) {
  return values(owner).slice(0, length).map(String);
}

function validatePreparedInput(preparedInput, specification) {
  assert.equal(preparedInput.schema,
    "sagejs.pari-class-group/sanitized-prepared-h1-v1");
  assert.equal(preparedInput.fieldId, FIELD_ID);
  assert.deepEqual(preparedInput.names, specification.residentNames,
    "prepared resident ABI changed");
  assert.deepEqual(preparedInput.input.prep_polynomial.map(String),
    ["20034", "-20018", "0", "1"]);
}

function makeInputs(preparedInput, specification, fn) {
  const candidate = preparedInput.input;
  const input = {};
  const finalNames = new Set(Object.keys(specification.sizes)
    .filter(name => name.startsWith("final_")));
  for (const [name, kind] of specification.names) {
    if (Object.hasOwn(candidate, name)) {
      input[name] = structuredClone(candidate[name]);
    } else if (name === "precision_resource_cap") {
      input[name] = 4096n;
    } else {
      const size = specification.sizes[name];
      assert(Number.isInteger(size), `missing capacity for ${name}`);
      input[name] = Array(size).fill(finalNames.has(name) ? 777 : 0);
    }
    if (Array.isArray(input[name])) {
      input[name] = kind === "Float64Buffer"
        ? input[name].map(Number) : input[name].map(BigInt);
    } else if (kind === "float") input[name] = Number(input[name]);
    else if (kind === "bool") input[name] = Boolean(input[name]);
    else input[name] = BigInt(input[name]);
  }
  input.final_state.fill(0n);
  for (const [name, kind] of specification.names) {
    if (kind === "IntegerBuffer" &&
        (name.startsWith("precision_") || name.startsWith("final_"))) {
      input[name] = fn.createIntegerBuffer(input[name].length, 128, input[name]);
    }
  }
  return input;
}

function rootArguments(input, specification) {
  return specification.names.map(([name]) => input[name]);
}

function sageAuthority(input) {
  return {
    finalOwners: Object.fromEntries(Object.keys(input).sort()
      .filter(name => name.startsWith("final_"))
      .map(name => [name, asStrings(input[name])])),
    precisionAuthority: asStrings(input.precision_authority_state, 16),
  };
}

function validateSageResult(status, input) {
  assert.equal(status, 0n, "unified complete H1 root did not succeed");
  assert.deepEqual(asStrings(input.final_state, 16), [
    "0", "0", "0", "0", "0", "0", "73", "8",
    "1", "0", "2", "2", "0", "811", "1", "0",
  ]);
  assert.deepEqual(asStrings(input.final_exact_norms), ["-1", "-1"]);
  assert.deepEqual(asStrings(input.final_torsion_order), ["2"]);
  assert.deepEqual(asStrings(input.final_torsion_generator), ["-1", "0", "0"]);
  assert.deepEqual(asStrings(input.precision_authority_state, 5),
    ["0", "5", "2304", "0", "3"]);
  assert.equal(asStrings(input.precision_authority_state, 16)[14], "1");
  assert(values(input.final_exact_units).some(value => BigInt(value) !== 0n));
  assert(values(input.final_regulator).some(value => BigInt(value) !== 0n));
}

function matchedResult() {
  return {
    schema: "sagejs.pari-class-group/h1-matched-result-projection-v1",
    field: {
      id: FIELD_ID,
      polynomialAscending: ["20034", "-20018", "0", "1"],
    },
    classGroup: { classNumber: "1", invariantFactors: [], generatorCount: "0" },
    unitGroup: {
      rank: "2", torsionOrder: "2",
      torsionGeneratorPowerBasis: ["-1", "0", "0"],
      regulatorPresent: true,
    },
    assumptions: {
      scope: "internal-PARI-correspondence-only",
      pariCorrespondenceAssumed: true,
      publicComplete: false,
    },
    terminalStatus: TERMINAL_STATUS,
  };
}

function matchedRecords({ seed, preparedInput }) {
  const result = matchedResult();
  const authoritySha256 = digest({
    schema: "sagejs.pari-class-group/h1-matched-replay-projection-v1",
    preparedInputSha256: digest(preparedInput), result,
  });
  return {
    result,
    replay: {
      status: "cold-replay-authenticated",
      resultSha256: digest(result),
      authoritySha256,
    },
    rng: {
      schema: "sagejs.pari-class-group/h1-seed-projection-v1",
      seed: String(seed),
      terminalStateCompared: false,
    },
    work: {
      schema: "sagejs.pari-class-group/h1-common-work-projection-v1",
      degree: "3", factorBaseSize: "66", unitRank: "2",
    },
    terminalStatus: TERMINAL_STATUS,
  };
}

const sageBuildPromises = new Map();
async function sageBuild({ diagnosticStageClock = false } = {}) {
  const key = diagnosticStageClock ? "diagnostic-stage-clock-v1" : "ordinary";
  if (!sageBuildPromises.has(key)) {
    const options = { sourcePath: ROOT_SOURCE };
    if (diagnosticStageClock) options.diagnosticStageClock = DIAGNOSTIC_STAGE_CLOCK;
    sageBuildPromises.set(key, compileKernel(options).then(built => {
      const fn = require(built.modulePath).pari_unified_complete_h1_root;
      assert(fn.nativeAvailable, "unified complete H1 native root unavailable");
      assert.equal(
        typeof fn.diagnosticStageTrace,
        diagnosticStageClock ? "function" : "undefined",
        "unified root diagnostic clock capability changed",
      );
      return {
        built, fn, specification: rootSpecification(), diagnosticStageClock,
        diagnosticStageClockConfig: diagnosticStageClock
          ? DIAGNOSTIC_STAGE_CLOCK : null,
      };
    }));
  }
  return sageBuildPromises.get(key);
}

async function preparePreparedH1({
  implementation, seed, preparedInput, diagnosticStageClock = false,
}) {
  if (implementation === "pari") {
    return {
      implementation,
      inner: await pari.preparePreparedH1({ implementation, seed, preparedInput }),
      seed,
    };
  }
  assert.equal(implementation, "sagejs");
  assert.equal(seed, "1",
    "the frozen prepared owner graph authenticates only the seed-1 stream");
  const built = await sageBuild({ diagnosticStageClock });
  validatePreparedInput(preparedInput, built.specification);
  const replayInput = makeInputs(preparedInput, built.specification, built.fn);
  const replayStatus = built.fn.gmp(...rootArguments(replayInput, built.specification));
  const replayDiagnosticStageTrace = built.diagnosticStageClock
    ? built.fn.diagnosticStageTrace() : null;
  validateSageResult(replayStatus, replayInput);
  return {
    implementation, seed, built,
    replayAuthority: sageAuthority(replayInput),
    replayAuthoritySha256: digest(sageAuthority(replayInput)),
    replayDiagnosticStageTrace,
    timedInput: makeInputs(preparedInput, built.specification, built.fn),
  };
}

async function runPreparedH1({
  implementation, seed, preparedInput, preparedState, switchStage,
}) {
  assert.equal(seed, preparedState.seed);
  if (implementation === "pari") {
    const output = await pari.runPreparedH1({
      implementation, seed, preparedInput, preparedState: preparedState.inner,
    });
    assert.equal(output.correspondenceComplete, true);
    assert.equal(output.result.classGroup.classNumber, "1");
    assert.deepEqual(output.result.classGroup.invariantFactors, []);
    assert.equal(output.result.unitGroupCorrespondence.rank, "2");
    assert.deepEqual(output.result.unitGroupCorrespondence.logEmbeddingShape,
      ["3", "2"]);
    assert.equal(output.result.unitGroupCorrespondence.regulatorTriplet.length, 3);
    assert(output.result.unitGroupCorrespondence.regulatorTriplet.every(value =>
      typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value)));
    assert.equal(output.result.unitGroupCorrespondence.torsionOrder, "2");
    assert.deepEqual(output.result.unitGroupCorrespondence.torsionGeneratorPowerBasis,
      ["-1", "0", "0"]);
    assert.equal(output.work.factorBaseSize, "66");
    return { correspondenceComplete: true, ...matchedRecords({ seed, preparedInput }) };
  }
  assert.equal(implementation, "sagejs");
  validatePreparedInput(preparedInput, preparedState.built.specification);
  const input = preparedState.timedInput;
  const status = preparedState.built.fn.gmp(
    ...rootArguments(input, preparedState.built.specification),
  );
  const diagnosticStageTrace = preparedState.built.diagnosticStageClock
    ? preparedState.built.fn.diagnosticStageTrace() : null;
  validateSageResult(status, input);
  const sourceAuthority = sageAuthority(input);
  assert.equal(digest(sourceAuthority), preparedState.replayAuthoritySha256,
    "unified root changed under independent owner replay");
  // final_state[12] remains pending in the native result.  Only this adapter's
  // independent second owner graph authorizes the diagnostic correspondence
  // projection; the root's publication bit alone is never promoted.
  // Ordinary callers retain the explicit residual charge. Diagnostic builds
  // instead expose the compiler-owned native trace captured above.
  if (!preparedState.built.diagnosticStageClock) {
    switchStage("unattributed-remainder");
  }
  return {
    correspondenceComplete: true,
    ...matchedRecords({ seed, preparedInput }),
    sourceAuthority,
    ...(diagnosticStageTrace === null ? {} : { diagnosticStageTrace }),
  };
}

async function closePreparedH1(preparedState) {
  if (preparedState?.implementation === "pari") {
    await pari.closePreparedH1(preparedState.inner);
  }
}

module.exports = {
  FIELD_ID,
  DIAGNOSTIC_STAGE_CLOCK,
  DIAGNOSTIC_STAGES,
  closePreparedH1,
  digest,
  matchedResult,
  matchedRecords,
  preparePreparedH1,
  runPreparedH1,
  rootSpecification,
  sageAuthority,
  stageMode: "whole-root-only",
};
