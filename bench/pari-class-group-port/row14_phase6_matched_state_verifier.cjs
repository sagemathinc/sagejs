"use strict";

// Row-specific authority for the first strict Phase-6 v2 admission.  The
// static half authenticates the complete Sage.js class/unit output evidence;
// the live half only normalizes values that the standard prepared Sage/PARI
// kernels actually return.  It never reconstructs missing PARI witnesses.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const outputV2 = require("./class_unit_output_evidence_v2.cjs");
const campaign = require("./row14_matched_alternating_campaign.cjs");
const staticReplay = require("./row14_phase6_static_math_replay.cjs");
const nativeProvenance = require("./row14_live_native_provenance.cjs");
const timing = require("./row14_sage_prepared_timing_adapter.cjs");

const PANEL_INDEX = 14;
const FIELD_ID = timing.FIELD_ID;
const POLYNOMIAL = Object.freeze([...timing.POLYNOMIAL]);
const EVIDENCE_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-matched-state-evidence-v2";
const MATCHED_OUTPUT_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-matched-output-v2";
const TERMINAL_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-terminal-state-v1";
const PRECISION_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-precision-state-v1";
const RETRY_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-retry-state-v1";
const STATE_ENVELOPE_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-state-envelope-v1";
const WORK_OBSERVATION_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-work-observation-v1";
const NATIVE_OBSERVATION_SCHEMA =
  "sagejs.pari-class-group/row14-phase6-native-call-observation-v1";
const PROVENANCE_SCHEMA =
  "sagejs.pari-class-group/phase6-implementation-provenance-manifest-v1";
const MUTATION_FAMILIES = Object.freeze([
  "class-invariants", "class-generators", "class-principal-witnesses",
  "unit-basis", "regulator-log-lattice", "torsion", "terminal-state",
  "precision-state", "retry-state", "replay-authority", "work-counters",
  "native-calls", "source-provenance",
]);
const COVERAGE_KEYS = Object.freeze([
  "class-invariants",
  "class-generator-ideals-orders-principal-witnesses",
  "unit-compact-or-factored-basis-or-exact-not-given",
  "regulator-value-and-log-lattice-semantics",
  "torsion", "terminal-precision-retry-state",
  "independent-replay-distinct-from-output", "replay-mutation-coverage",
  "source-and-provenance-hashes",
]);
const SHA256 = /^[0-9a-f]{64}$/;
const EXPECTED_OUTPUT_DIGEST =
  "e1c39bb437ff52efc4b03cc1d195756c5e61b4deef0b8b1ffa845553fe6f1519";
const EXPECTED_GENERATOR_IDEALS = Object.freeze([
  [["334218769636951", "58264613846794", "132395815055232",
    "140653091603643"], ["0", "1", "0", "0"],
    ["0", "0", "1", "0"], ["0", "0", "0", "1"]],
  [["5099", "1784", "2435", "3663"], ["0", "1", "0", "0"],
    ["0", "0", "1", "0"], ["0", "0", "0", "1"]],
]);
const EXPECTED_REGULATOR = Object.freeze([
  "81286872183153500261162314966675306285467183490741584490233697199637458337870",
  "256", "210",
]);
// This is also exported to the durable-receipt builder.  The receipt's commit
// closure must cover every implementation file whose bytes this verifier
// authenticates before accepting a timed arm.
const PROVENANCE_SOURCE_FILES = Object.freeze({
  matchedHost: "row14_matched_kernel_clock_host.cjs",
  initialRoot: "check_row14_prepared_initial_root.cjs",
  gateCHost: "row14_prepared_gate_c_host.cjs",
  postTerminalHost: "row14_post806_terminal_host.cjs",
  postTerminalSource: "row14_post806_terminal.py",
  classAssemblySource: "quartic_direct_composition.py",
  unitSelectionSource: "unit_lattice_selection.py",
  unitReductionSource: "unit_lattice_reduction.py",
  unitLogSource: "log_matrix_transform.py",
  unitSuffixSource: "field3_mixed_unit_suffix.py",
  getfuSource: "getfu_mixed_quartic.py",
  registryWrapper: "phase6_registered_prepared_adapter.cjs",
  pariHelperSource: "row14_pari_prepared_timing_adapter.c",
  pariAdapter: "row14_pari_prepared_timing_adapter.cjs",
});

// These hashes are deliberately literal.  The central registry separately
// authenticates this verifier and the evidence JSON; these manifests bind the
// implementation sources used by a live arm.
const PROVENANCE_BY_IMPLEMENTATION = Object.freeze({
  sagejs: Object.freeze({
    schema: PROVENANCE_SCHEMA,
    implementation: "sagejs",
    artifacts: Object.freeze([
      Object.freeze({ role: "prepared-input", sha256:
        "6c8ac1e7e6a47a486de92cd180f9524a1be132d8fe1f7ccbd822166e77d4da92" }),
      Object.freeze({ role: "matched-host", sha256:
        "4cffc33b4ed42d56e2ab837b3f042bc287eab081a1423c18348455caffa31e38" }),
      Object.freeze({ role: "initial-root", sha256:
        "9001352b14900d8bb35c6b84f9e1fd1607ed8e0ce8bd059d44c25dee6f4de934" }),
      Object.freeze({ role: "gate-c-host", sha256:
        "d249bc347508ec741217e6a7b9962ecd41a329d8089b4a223143696b57edd36e" }),
      Object.freeze({ role: "post-terminal-host", sha256:
        "a0d9db354458d7d0cb078b84098ba5c4760577c83806e888d1bb8c9ceb9f20c9" }),
      Object.freeze({ role: "post-terminal-source", sha256:
        "2fac475287fa313dd83a769f67d88d97ba233ed7e5d506c3ce7b576b5280999f" }),
      Object.freeze({ role: "class-assembly-source", sha256:
        "bd836267921b1fbc63b0ffdb5e694d68243ef8c0b853c0d0011f9da402ccf04f" }),
      Object.freeze({ role: "unit-selection-source", sha256:
        "87770cef153502f1b5018b06116270eefd9dcc7a7cee0b39484542c8d8b90090" }),
      Object.freeze({ role: "unit-reduction-source", sha256:
        "3a81ccea7bab200a21d647e409d85d04f23cc083d4e8de730366dff7f1fc409d" }),
      Object.freeze({ role: "unit-log-source", sha256:
        "3e57217c900e224f5c7cf15422d3abc327d2891ac7a041699c9fc78abdd058c0" }),
      Object.freeze({ role: "unit-suffix-source", sha256:
        "d2557657d42f8934e47039844300df0244df75a5bfe8b79eca490e7ec8035542" }),
      Object.freeze({ role: "getfu-source", sha256:
        "a993dd6ac6fdfb60f493ae5e7d0a9e3963d097d951217afbd54d0a318e264440" }),
      Object.freeze({ role: "registry-wrapper", sha256:
        "8156602247406d782dcaa02aae0e6ba02835470f8d96da835b5685067b9725c2" }),
    ]),
  }),
  pari: Object.freeze({
    schema: PROVENANCE_SCHEMA,
    implementation: "pari",
    artifacts: Object.freeze([
      Object.freeze({ role: "pari-archive", sha256:
        "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53" }),
      Object.freeze({ role: "pari-buch2-source", sha256:
        "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac" }),
      Object.freeze({ role: "pari-helper-source", sha256:
        "ba911604c5fbc6d34b82efe7f1a4e5ca0f0ed5414b18d49a1d3dd3787a3be895" }),
      Object.freeze({ role: "pari-adapter", sha256:
        "6f9f2fe77c61058407ff6c4488fcd0ecd95ee6dac1d58003e7a5694238694d99" }),
      Object.freeze({ role: "pari-library", sha256:
        "fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f" }),
      Object.freeze({ role: "c-compiler", sha256:
        "b5f1b773a7c733738352000c92a077dc5852a1a2fc6d836b1e411be1e9ec5f88" }),
      Object.freeze({ role: "pari-helper-executable", sha256:
        "f732fe5ca5226869a79534decd2a3f087d35648a492052c5f7d914da90fd17bf" }),
      Object.freeze({ role: "pari-toolchain", sha256:
        "9784c5fa29abe3d14511e76dbcc7de6478bc4aaff921cc43f0c12fef9f4810b9" }),
      Object.freeze({ role: "registry-wrapper", sha256:
        "8156602247406d782dcaa02aae0e6ba02835470f8d96da835b5685067b9725c2" }),
    ]),
  }),
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = value => crypto.createHash("sha256").update(canonical(value))
  .digest("hex");
const fileDigest = filename => crypto.createHash("sha256")
  .update(fs.readFileSync(filename)).digest("hex");

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(),
    `${label} has unexpected fields`);
}

function precisionState() {
  return { schema: PRECISION_SCHEMA, requestedBits: "192",
    packedRealBits: "256", convention: "PARI-nbits2prec-word-rounded" };
}
function retryState() {
  return { schema: RETRY_SCHEMA, precisionRetries: "0",
    terminalReason: "LARGE-not-precision-failure" };
}
function terminalState() {
  return { schema: TERMINAL_SCHEMA, status: "pari-flag-zero-complete",
    correspondenceAssumed: true, publicCertified: false };
}
function matchedState() {
  return {
    classGroup: { classNumber: "192", invariantFactors: ["8", "24"],
      generatorIdealHnfs: structuredClone(EXPECTED_GENERATOR_IDEALS) },
    unitGroup: { basis: null, mode: "not_given", notGivenState: {
      precisionBits: "192", reason: "LARGE", status: "not_given" }, rank: "2" },
    regulator: { value: [...EXPECTED_REGULATOR] },
    torsion: { generator: ["-1", "0", "0", "0"], order: "2" },
    terminal: terminalState(), precision: precisionState(), retry: retryState(),
  };
}

function evidenceWorkAuthority() {
  return { classHnfColumns: "3", degree: "4", factorBaseSize: "799",
    logEmbeddingColumns: "2", logEmbeddingRows: "3", relationCount: "806" };
}

function evidenceEntry(output, id) {
  const found = output.evidence.find(value => value.id === id);
  assert(found, `static output lacks ${id}`);
  return found;
}

function authenticateSources(evidence) {
  exactKeys(evidence.sourceAuthorities, ["fixtures", "replaySources"],
    "source authorities");
  assert.deepEqual(evidence.sourceAuthorities.fixtures,
    staticReplay.AUTHORITY_SHA256);
  const expected = {
    "h1_exclusive_stage_timing.cjs":
      "2e6dff2c94c3f705a3821aab9f98a3b6bc4c5b63dce6ea569b70fa8fac0437b0",
    "check_row14_general_ideal_maps.cjs":
      "cd036e1813ec8194170d0f5f9576e6d162c74a93a21eddee4fafa0f74393f908",
    "class_unit_output_evidence_v2.cjs":
      "81fafa6654e181d7acc15dd90b9aab0b5fa75b21e85bc0636e7676212091f1da",
    "field3_relation_replay_map.py":
      "0e295ac264fd8f0756f1b5b325a44084618f25d7c40947369c1eeccfb442af28",
    "independent_rich_quartic_class_replay.py":
      "540cd82a1c0dec128d60f3b8d880e7c3db439bc24b5024d4520947d683d8e6a6",
    "row14_class_unit_output_evidence_v2.cjs":
      "aa7530a3bfb0e7c1a695620113466d15049f1af8a74534592c794ed08dd9a901",
    "row14_full_raw_smith_ancestry.cjs":
      "0a49b931becd1497d12e64ff9865f7377432a36b4178bc36712b5a476b50a187",
    "row14_general_ideal_maps.py":
      "e93609da39db54cdcbb12003de5f4ccf66e84fe45b70906d783649c47dfeab02",
    "row14_live_native_provenance.cjs":
      "42eb23da18ba54028eddab0d804456cf6af9faca5d70523681aa01e9dddc77ba",
    "row14_phase6_static_math_replay.cjs":
      "ecbf0e7b1d8e811cc57cd4e501f2e17ffa35a25e35f939d0b286591bbf1ce3e7",
    "row14_rank2_c5_c6.py":
      "b5489b63480bc2763f6be59a134da2bec0fcd519b1457bb202ae0eb09aa29a05",
    "row14_signed_generator_witness.py":
      "2ed87b6c4ec60dd3fe3b87300532d12ead95815d8422200115096d71f32cdd83",
    "row14_terminal_class_owner.py":
      "155342083f8418a25c052ce2b6f51fd41598c6f9c7086a7377156984260a0f64",
  };
  assert.deepEqual(evidence.sourceAuthorities.replaySources, expected);
  for (const [basename, expectedSha256] of Object.entries(expected))
    assert.equal(fileDigest(path.join(__dirname, basename)), expectedSha256,
      `${basename} static replay source changed`);
}

function validateEvidence(evidence) {
  exactKeys(evidence, ["classUnitOutput", "classUnitOutputSha256", "coverage",
    "field", "matchedState", "mutationFamilies", "nativeCallAuthority",
    "panelIndex", "replayAuthority", "schema", "sourceAuthorities",
    "workAuthority"], "row-14 matched evidence");
  assert.equal(evidence.schema, EVIDENCE_SCHEMA);
  assert.equal(evidence.panelIndex, PANEL_INDEX);
  assert.deepEqual(evidence.field,
    { id: FIELD_ID, polynomialAscending: POLYNOMIAL });
  outputV2.validate(evidence.classUnitOutput);
  assert.equal(outputV2.sha256Canonical(evidence.classUnitOutput),
    evidence.classUnitOutputSha256);
  assert.equal(evidence.classUnitOutputSha256, EXPECTED_OUTPUT_DIGEST);
  const output = evidence.classUnitOutput;
  assert.deepEqual(output.classGroup.invariantFactors, ["8", "24"]);
  assert.equal(output.classGroup.classNumber, "192");
  assert.deepEqual(output.classGroup.generators.map(value => value.order),
    ["8", "24"]);
  for (const generator of output.classGroup.generators) {
    assert.equal(evidenceEntry(output, generator.idealRef).kind,
      "class_generator_ideal");
    assert.equal(evidenceEntry(output, generator.principalWitnessRef).kind,
      "principal_order_witness");
  }
  assert.equal(output.presentation.variant, "smith_uwvd");
  assert.deepEqual(output.presentation.proof, { dRef: "raw-smith-d",
    uRef: "raw-smith-u", vRef: "raw-smith-v", wRef: "raw-smith-w" });
  assert.equal(output.relations.factorBaseCount, "799");
  assert.equal(output.relations.relationCount, "806");
  assert.equal(output.unitGroup.rank, "2");
  assert.equal(output.unitGroup.compactUnits.length, 2);
  assert.deepEqual(output.unitGroup.exactUnits,
    { precisionBits: "192", reason: "LARGE", status: "not_given" });
  assert.equal(output.unitGroup.regulator.precisionBits, "192");
  assert.equal(evidenceEntry(output, "regulator-packed").sha256,
    "7db5f1b09e7d7740498aa0c53a8e6738b8f9da65f000e1b768a24064db2b7db7");
  assert.equal(evidenceEntry(output, "unit-log-0").kind, "compact_unit_log");
  assert.equal(evidenceEntry(output, "unit-log-1").kind, "compact_unit_log");
  assert.equal(output.unitGroup.torsion.order, "2");
  assert.deepEqual(output.maps, {
    combine: { evidenceRefs: ["combine-map"], missing: [], ready: true },
    factor: { evidenceRefs: ["factor-map"], missing: [], ready: true },
    reduce: { evidenceRefs: ["reduce-map"], missing: [], ready: true },
  });
  assert.deepEqual(output.completion, {
    correspondenceComplete: true, freshCorrespondence: true, missing: [],
    outputBoundaryComplete: true, phase3Complete: true,
    phase4Complete: true, phase5Complete: true,
  });
  assert.deepEqual(evidence.matchedState, matchedState());
  exactKeys(evidence.coverage, COVERAGE_KEYS, "coverage");
  COVERAGE_KEYS.forEach(name => assert.equal(evidence.coverage[name], true));
  assert.deepEqual(evidence.mutationFamilies, MUTATION_FAMILIES);
  assert.deepEqual(evidence.workAuthority, evidenceWorkAuthority());
  assert.deepEqual(evidence.nativeCallAuthority, {
    formula: "18 + 2*(collectionPasses-1) + (acceptedCheckpoints-1)",
    roots: ["prepared-initial", "gate-collector-hnf", "post-terminal",
      "rank-two-unit-suffix", "class-group-assembly"],
  });
  exactKeys(evidence.replayAuthority, ["replaySha256", "schema", "summary"],
    "replay authority");
  assert.equal(evidence.replayAuthority.schema,
    "sagejs.pari-class-group/row14-independent-static-math-replay-v1");
  assert.match(evidence.replayAuthority.replaySha256, SHA256);
  assert.equal(evidence.replayAuthority.summary.outputSha256,
    EXPECTED_OUTPUT_DIGEST);
  assert.equal(evidence.replayAuthority.replaySha256,
    evidence.replayAuthority.summary.replaySha256);
  authenticateSources(evidence);
  return evidence;
}

function verifySageCorrectnessEvidence(evidence) {
  validateEvidence(evidence);
  const replay = staticReplay.replayStaticAuthority();
  const replaySummary = staticReplay.replaySummary(replay);
  assert.deepEqual(replay.output, evidence.classUnitOutput,
    "source-backed output reconstruction differs from admitted evidence");
  assert.deepEqual(evidence.replayAuthority.summary, replaySummary,
    "source-backed mathematical replay differs from admitted replay");
  assert.equal(evidence.replayAuthority.replaySha256, replaySummary.replaySha256);
  assert.equal(replay.identityCells, "643994");
  assert.deepEqual([replay.determinantU, replay.determinantV], ["-1", "-1"]);
  assert.equal(replay.python.classReplay.principalRelationsReplayed, 806);
  assert.equal(replay.python.classReplay.orderRelationsReplayed, 2);
  assert.equal(replay.python.classReplay.classGeneratorIdealsDirectlyReplayed, 1);
  assert.equal(replay.python.classReplay.classGeneratorIdealReplayGaps.length, 1);
  assert.equal(replay.python.signedGeneratorReplay
    .signedGeneratorIdealReductionsReplayed, 2);
  assert.equal(replay.python.signedGeneratorReplay
    .principalOrderWitnessesReplayed, 2);
  assert.equal(replay.python.signedGeneratorReplay
    .oppositePrincipalCorrectionsRejected, 1);
  assert.deepEqual(replay.python.signedGeneratorReplay.missingOwners, []);
  assert.equal(replay.unitReplay.kernelCells, 1598);
  assert.equal(replay.torsionReplay.order, "2");
  const mutationCoverage = {};
  const reject = (name, mutate) => {
    const changed = structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateEvidence(changed), undefined,
      `${name} mutation was accepted`);
    mutationCoverage[name] = true;
  };
  reject("class-invariants", value => {
    value.classUnitOutput.classGroup.classNumber = "193";
  });
  reject("class-generators", value => {
    value.classUnitOutput.classGroup.generators[0].order = "24";
  });
  reject("class-principal-witnesses", value => {
    value.classUnitOutput.classGroup.generators[0].principalWitnessRef =
      "class-witness-0";
  });
  reject("unit-basis", value => { value.classUnitOutput.unitGroup.compactUnits.pop(); });
  reject("regulator-log-lattice", value => {
    value.classUnitOutput.evidence.find(item => item.id === "unit-log-0").sha256 =
      "0".repeat(64);
  });
  reject("torsion", value => { value.matchedState.torsion.order = "4"; });
  reject("terminal-state", value => {
    value.matchedState.terminal.status = "not-complete";
  });
  reject("precision-state", value => {
    value.matchedState.precision.requestedBits = "256";
  });
  reject("retry-state", value => {
    value.matchedState.retry.precisionRetries = "1";
  });
  reject("replay-authority", value => {
    value.replayAuthority.replaySha256 = "0".repeat(64);
  });
  reject("work-counters", value => { value.workAuthority.factorBaseSize = "800"; });
  reject("native-calls", value => { value.nativeCallAuthority.formula = "1"; });
  reject("source-provenance", value => {
    value.sourceAuthorities.replaySources["class_unit_output_evidence_v2.cjs"] =
      "0".repeat(64);
  });
  assert.deepEqual(Object.keys(mutationCoverage), MUTATION_FAMILIES);
  const mutationMechanisms = Object.fromEntries(MUTATION_FAMILIES.map(name =>
    [name, "authenticated-envelope-rejection"]));
  const sourceOwnerArithmeticMutations = replay.mathematicalMutations;
  assert.deepEqual(sourceOwnerArithmeticMutations, {
    smithRelation: true, classPrincipalWitness: true,
    compactUnitEquation: true, rawPrincipalEquation: true,
    regulatorLogLattice: true, generalIdealMaps: true,
    signedGeneratorEquation: true,
  });
  const coverage = Object.fromEntries(COVERAGE_KEYS.map(name => [name, true]));
  return { panelIndex: PANEL_INDEX, evidenceSchema: EVIDENCE_SCHEMA,
    matchedReady: true, coverage, mutationCoverage, mutationMechanisms,
    sourceOwnerArithmeticMutations,
    replaySha256: replaySummary.replaySha256,
    leanSemanticDigest: digest({ field: evidence.field,
      classGroup: evidence.matchedState.classGroup,
      unitGroup: evidence.matchedState.unitGroup,
      regulator: evidence.matchedState.regulator,
      torsion: evidence.matchedState.torsion,
      terminal: evidence.matchedState.terminal }) };
}

function assertProvenanceFiles() {
  const expected = new Map();
  for (const manifest of Object.values(PROVENANCE_BY_IMPLEMENTATION))
    for (const artifact of manifest.artifacts) expected.set(artifact.role,
      artifact.sha256);
  const role = name => name.replace(/[A-Z]/g, character =>
    `-${character.toLowerCase()}`);
  for (const [name, basename] of Object.entries(PROVENANCE_SOURCE_FILES)) {
    const key = role(name);
    assert.equal(fileDigest(path.join(__dirname, basename)), expected.get(key),
      `${key} provenance changed`);
  }
}

function normalizedOutput(semantic) {
  assert.deepEqual(semantic.field, { id: FIELD_ID,
    polynomialAscending: POLYNOMIAL });
  assert.equal(semantic.classGroup.classNumber, "192");
  assert.deepEqual(semantic.classGroup.invariantFactors, ["8", "24"]);
  assert.deepEqual(semantic.classGroup.generatorIdealHnfs,
    EXPECTED_GENERATOR_IDEALS);
  assert.equal(semantic.unitGroup.rank, "2");
  assert.equal(semantic.unitGroup.flagZeroStatus, "not_given(LARGE)");
  assert.deepEqual(semantic.unitGroup.torsionGeneratorPowerBasis,
    ["-1", "0", "0", "0"]);
  return matchedState();
}

function workObservation(values, derivationEvidence) {
  return { schema: WORK_OBSERVATION_SCHEMA, values, derivationEvidence,
    evidenceDigest: digest(derivationEvidence) };
}
function nativeObservation(value, derivationEvidence) {
  return { schema: NATIVE_OBSERVATION_SCHEMA, value, derivationEvidence,
    evidenceDigest: digest(derivationEvidence) };
}

function sageStageLeaves(raw) {
  const timing = raw.exclusiveStageTiming;
  const boundary = raw.exclusiveRootBoundary;
  assert(timing && boundary, "exclusive stage authority is absent");
  const totals = timing.stageTotalsNanoseconds;
  const keys = ["relation-retry", "sparse-hnf-snf-transform",
    "unit-regulator", "honesty-generators-final", "unattributed-remainder"];
  assert.deepEqual(Object.keys(totals), keys);
  for (const key of keys) assert.match(totals[key], /^(0|[1-9][0-9]*)$/);
  assert.match(timing.rootNanoseconds, /^[1-9][0-9]*$/);
  assert.equal(Object.values(totals).reduce((sum, value) => sum + BigInt(value), 0n),
    BigInt(timing.rootNanoseconds), "exclusive stage totals do not close");
  assert.equal(boundary.relationship,
    "exclusive = kernel - startOffset + endOffset");
  assert.match(boundary.startOffsetNanoseconds, /^(0|[1-9][0-9]*)$/);
  assert.match(boundary.endOffsetNanoseconds, /^(0|[1-9][0-9]*)$/);
  assert.equal(BigInt(timing.rootNanoseconds), BigInt(raw.kernelNanoseconds) -
    BigInt(boundary.startOffsetNanoseconds) +
    BigInt(boundary.endOffsetNanoseconds),
  "exclusive root is not bound to the published kernel clock");
  return {
    relationRetry: totals["relation-retry"],
    sparseHnfSnfTransform: totals["sparse-hnf-snf-transform"],
    unitRegulator: totals["unit-regulator"],
    honestyGeneratorsFinal: totals["honesty-generators-final"],
  };
}

function deriveSageWork(raw) {
  const state = raw.live.resident.state.map(Number);
  assert(state.length >= 8 && state.every(Number.isSafeInteger));
  const relationState = raw.live.collectorValues.relation_state.toArray().map(Number);
  assert(relationState.length >= 1 && relationState.every(Number.isSafeInteger));
  const relationCount = state[7];
  assert.equal(relationState[0], relationCount,
    "collector and accepted owner disagree on relation count");
  assert.equal(raw.live.checkpoints.at(-1).columns, relationCount,
    "last accepted checkpoint differs from relation count");
  const classHnfColumns = state[0];
  assert.equal(raw.live.resident.h.length, classHnfColumns * classHnfColumns,
    "accepted HNF storage does not derive its column count");
  const factorBaseSize = state[0] + state[2];
  assert.equal(raw.live.resident.perm.length, factorBaseSize,
    "accepted permutation does not derive factor-base size");
  const packedWidth = 7;
  assert.equal(raw.live.resident.c.length % (packedWidth * relationCount), 0,
    "accepted packed-log storage has no integral row count");
  const logEmbeddingRows = raw.live.resident.c.length /
    (packedWidth * relationCount);
  assert.equal(raw.units.archimedeanUnits.length % (packedWidth * logEmbeddingRows), 0,
    "unit log storage has no integral column count");
  const logEmbeddingColumns = raw.units.archimedeanUnits.length /
    (packedWidth * logEmbeddingRows);
  const degree = raw.accepted.field.degree;
  assert.equal(raw.accepted.field.polynomial.length, degree + 1,
    "accepted polynomial does not derive its degree");
  const authorityValues = { classHnfColumns: String(classHnfColumns), degree: String(degree),
    factorBaseSize: String(factorBaseSize),
    logEmbeddingColumns: String(logEmbeddingColumns),
    logEmbeddingRows: String(logEmbeddingRows),
    relationCount: String(relationCount) };
  const { relationCount: unused, ...values } = authorityValues;
  void unused;
  return { authorityValues, values, derivationEvidence: { source: "live-owner-shapes",
    acceptedState: state.map(String), relationState: relationState.map(String),
    finalCheckpointColumns: String(raw.live.checkpoints.at(-1).columns),
    hCells: String(raw.live.resident.h.length),
    permutationCells: String(raw.live.resident.perm.length),
    packedLogCells: String(raw.live.resident.c.length), packedWidth: "7",
    archimedeanUnitCells: String(raw.units.archimedeanUnits.length),
    polynomialLength: String(raw.accepted.field.polynomial.length) } };
}

function sageVerified(raw, wrapperObservation) {
  const semantic = campaign.sageProjection(raw);
  semantic.classGroup.generatorIdealHnfs.reverse();
  timing.compareWithPari; // Keep the source-level normalization dependency explicit.
  const state = normalizedOutput(semantic);
  assert.deepEqual(timing.internalToPariTriplet(
    semantic.unitGroup.regulatorInternalTriplet), EXPECTED_REGULATOR);
  const derivedWork = deriveSageWork(raw);
  const work = derivedWork.values;
  const workEvidence = derivedWork.derivationEvidence;
  assert.deepEqual(derivedWork.authorityValues, evidenceWorkAuthority());
  const continuations = raw.live.collectionPasses - 1;
  const appends = raw.live.checkpoints.length - 1;
  const nativeCalls = String(18 + 2 * continuations + appends);
  const nativeEvidence = { source: "live-stage-call-graph",
    preparedInitialCalls: 1, gateInitialCalls: 2, continuationPasses: continuations,
    appendTransactions: appends, postTerminalCalls: 3, unitSuffixCalls: 11,
    classAssemblyCalls: 1, formula:
      "18 + 2*(collectionPasses-1) + (acceptedCheckpoints-1)" };
  assert.equal(wrapperObservation?.authority, "process-thread-self");
  assert.match(wrapperObservation.cpuNanoseconds, /^[1-9][0-9]*$/);
  const nativeAuthority = wrapperObservation.nativeProvenance;
  nativeProvenance.verifyRow14LiveNativeProvenance(nativeAuthority);
  const leaves = sageStageLeaves(raw);
  const leafTotal = Object.values(leaves)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  const expectedUnattributed =
    BigInt(raw.exclusiveStageTiming.stageTotalsNanoseconds["unattributed-remainder"]) +
    BigInt(raw.exclusiveRootBoundary.startOffsetNanoseconds) -
    BigInt(raw.exclusiveRootBoundary.endOffsetNanoseconds);
  assert(expectedUnattributed >= 0n,
    "exclusive/kernel boundary correction made residual negative");
  assert.equal(BigInt(raw.kernelNanoseconds) - leafTotal, expectedUnattributed,
    "named leaves plus explicit residual do not close the kernel clock");
  return { semantic, state, work, workEvidence, nativeCalls, nativeEvidence,
    kernelNanoseconds: raw.kernelNanoseconds,
    peakRssKiB: String(raw.maxRssKiB),
    cpu: { schema: "sagejs.pari-class-group/phase6-cpu-observation-v1",
      availability: "available", authority: "process-thread-self",
      nanoseconds: wrapperObservation.cpuNanoseconds }, leaves,
    provenance: PROVENANCE_BY_IMPLEMENTATION.sagejs,
    provenanceObservation: { declared: PROVENANCE_BY_IMPLEMENTATION.sagejs,
      liveNative: nativeAuthority } };
}

function pariVerified(raw, wrapperObservation) {
  const semantic = {
    field: raw.result.field,
    classGroup: { classNumber: raw.result.classGroup.classNumber,
      invariantFactors: [...raw.result.classGroup.invariantFactorsSourceOrder].reverse(),
      generatorIdealHnfs: [...raw.result.classGroup.generatorIdealHnfs].reverse() },
    unitGroup: { rank: raw.result.unitGroup.rank,
      regulatorInternalTriplet: null,
      flagZeroStatus: raw.result.unitGroup.flagZeroFundamentalUnits.status,
      torsionGeneratorPowerBasis: raw.result.unitGroup.torsionGeneratorPowerBasis },
  };
  const state = normalizedOutput(semantic);
  assert.deepEqual(raw.result.unitGroup.regulatorTriplet, EXPECTED_REGULATOR);
  const work = {
    classHnfColumns: raw.work.classHnfColumns, degree: raw.work.degree,
    factorBaseSize: raw.work.factorBaseSize,
    logEmbeddingColumns: raw.work.logEmbeddingColumns,
    logEmbeddingRows: raw.work.logEmbeddingRows,
  };
  const workEvidence = { source: "post-clock-bnf-accessors",
    accessors: ["nf_get_degree", "bnf-factor-base", "bnf-class-hnf",
      "bnf_get_logfu"], values: work };
  const nativeCalls = "1";
  const nativeEvidence = { source: "row14-pari-helper-control-flow",
    function: "bnfinit0", callsBetweenClocks: 1 };
  assert.equal(wrapperObservation?.authority, "pari-child-rusage");
  assert.equal(wrapperObservation.cpuNanoseconds, raw.cpuNanoseconds);
  assert.match(raw.cpuNanoseconds, /^[1-9][0-9]*$/);
  const provenance = wrapperObservation.buildProvenance;
  assert.equal(provenance.archiveSha256,
    PROVENANCE_BY_IMPLEMENTATION.pari.artifacts[0].sha256);
  assert.equal(provenance.buch2Sha256,
    PROVENANCE_BY_IMPLEMENTATION.pari.artifacts[1].sha256);
  assert.equal(provenance.sourceSha256,
    PROVENANCE_BY_IMPLEMENTATION.pari.artifacts[2].sha256);
  const pariArtifacts = new Map(PROVENANCE_BY_IMPLEMENTATION.pari.artifacts
    .map(value => [value.role, value.sha256]));
  assert.equal(provenance.librarySha256, pariArtifacts.get("pari-library"));
  assert.equal(provenance.compiler.executableSha256,
    pariArtifacts.get("c-compiler"));
  assert.equal(provenance.executableSha256,
    pariArtifacts.get("pari-helper-executable"));
  assert.equal(provenance.toolchainSha256, pariArtifacts.get("pari-toolchain"));
  const leaves = { relationRetry: "0", sparseHnfSnfTransform: "0",
    unitRegulator: "0", honestyGeneratorsFinal: "0" };
  return { semantic, state, work, workEvidence, nativeCalls, nativeEvidence,
    kernelNanoseconds: raw.kernelNanoseconds,
    peakRssKiB: raw.processMaxRssKiB,
    cpu: { schema: "sagejs.pari-class-group/phase6-cpu-observation-v1",
      availability: "available", authority: "pari-child-rusage",
      nanoseconds: raw.cpuNanoseconds }, leaves,
    provenance: PROVENANCE_BY_IMPLEMENTATION.pari,
    provenanceObservation: PROVENANCE_BY_IMPLEMENTATION.pari };
}

function verifyMatchedSample({ implementation, request, raw,
  diagnosticProjection, wrapperObservation }) {
  assertProvenanceFiles();
  assert.deepEqual(request.fieldId, FIELD_ID);
  assert.equal(request.boundary, "prepared-kernel");
  assert.equal(request.seed, "1");
  assert.deepEqual(diagnosticProjection,
    { schema: "sagejs.pari-class-group/row14-prepared-common-projection-v1",
      field: { id: FIELD_ID, polynomialAscending: POLYNOMIAL },
      classGroup: { classNumber: "192", invariantFactors: ["8", "24"],
        generatorCount: "2" },
      unitGroup: { rank: "2", regulatorPresent: true, torsionOrder: "2",
        flagZeroStatus: "not_given(LARGE)" },
      completionMode: "flag-zero-class-and-unit-result" });
  const normalized = implementation === "sagejs"
    ? sageVerified(raw, wrapperObservation)
    : pariVerified(raw, wrapperObservation);
  const output = { schema: MATCHED_OUTPUT_SCHEMA,
    field: { id: FIELD_ID, polynomialAscending: POLYNOMIAL },
    matchedState: normalized.state, provenance: normalized.provenance };
  const stageLeafTotal = Object.values(normalized.leaves)
    .reduce((sum, value) => sum + BigInt(value), 0n);
  const unattributed = String(BigInt(normalized.kernelNanoseconds) - stageLeafTotal);
  assert(BigInt(unattributed) >= 0n);
  const sample = {
    counters: normalized.work,
    cpu: normalized.cpu,
    kernelNanoseconds: normalized.kernelNanoseconds,
    output,
    peakRssKiB: normalized.peakRssKiB,
    resourceCounters: { nativeCalls: normalized.nativeCalls },
    rng: { schema: STATE_ENVELOPE_SCHEMA,
      terminal: normalized.state.terminal,
      precision: normalized.state.precision,
      retry: normalized.state.retry },
    stageTiming: { inclusiveNanoseconds: normalized.kernelNanoseconds,
      leaves: normalized.leaves, unattributedNanoseconds: unattributed },
  };
  return { sample, observations: {
    workCounters: workObservation(normalized.work, normalized.workEvidence),
    nativeCalls: nativeObservation(normalized.nativeCalls,
      normalized.nativeEvidence),
    provenance: normalized.provenanceObservation,
  } };
}

module.exports = Object.freeze({ COVERAGE_KEYS, EVIDENCE_SCHEMA, FIELD_ID,
  MATCHED_OUTPUT_SCHEMA, MUTATION_FAMILIES, NATIVE_OBSERVATION_SCHEMA,
  PANEL_INDEX, POLYNOMIAL, PRECISION_SCHEMA, PROVENANCE_BY_IMPLEMENTATION,
  PROVENANCE_SOURCE_FILES,
  RETRY_SCHEMA, STATE_ENVELOPE_SCHEMA, TERMINAL_SCHEMA,
  WORK_OBSERVATION_SCHEMA, deriveSageWork, digest, matchedState, sageStageLeaves, validateEvidence,
  verifyMatchedSample, verifySageCorrectnessEvidence });
