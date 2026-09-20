#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");

const directory = __dirname;
const schemaFiles = fs
  .readdirSync(directory)
  .filter((name) => name.endsWith(".schema.json"))
  .sort();

assert.deepEqual(schemaFiles, [
  "benchmark-receipt.schema.json",
  "capability-status.schema.json",
  "common.schema.json",
  "corpus-manifest.schema.json",
  "neutral-input.schema.json",
  "result-evidence.schema.json",
]);

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
ajv.addFormat("date-time", {
  type: "string",
  validate(value) {
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) && !Number.isNaN(Date.parse(value))
    );
  },
});

const schemas = schemaFiles.map((name) => ({
  name,
  value: JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")),
}));
for (const { value } of schemas) {
  ajv.addSchema(value);
}
for (const { name, value } of schemas) {
  assert.ok(ajv.getSchema(value.$id), `strict compilation failed for ${name}`);
}

const SHA256 = "a".repeat(64);
const CONTENT_ID = `sha256:${SHA256}`;
const COMMIT = "a".repeat(40);
const TREE = "b".repeat(40);

function validator(id) {
  const answer = ajv.getSchema(id);
  assert.ok(answer, `missing validator ${id}`);
  return answer;
}

function expectAccepted(label, id, value) {
  const validate = validator(id);
  assert.equal(
    validate(value),
    true,
    `${label} should be accepted: ${JSON.stringify(validate.errors)}`,
  );
}

function expectRejected(label, id, value) {
  const validate = validator(id);
  assert.equal(validate(value), false, `${label} should be rejected`);
  assert.ok(validate.errors?.length, `${label} should report validation errors`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const limits = {
  wallMilliseconds: "1000",
  memoryBytes: "1000000",
  relationCandidates: "1000",
  precisionBits: 128,
  continuationPasses: 10,
};

const neutralInput = {
  schema: "sagejs.rust-class-group.neutral-input/v1",
  inputId: CONTENT_ID,
  fieldId: "x^3-x-1",
  field: {
    variable: "x",
    coefficientsAscending: ["-1", "-1", "0", "1"],
    degree: 3,
    monic: true,
    irreducible: true,
  },
  preparation: { kind: "public-polynomial" },
  request: {
    proof: "conditional-grh",
    output: "class-group",
    mapPolicy: "construct-eagerly",
    unitPolicy: "completion-only",
    limits,
  },
  randomness: { algorithm: "none", seed: null },
  containsOracleAnswers: false,
};

const neutralInputId =
  "https://sagejs.org/schemas/rust-class-group-qualification/neutral-input-v1.json";
expectAccepted("neutral public input", neutralInputId, neutralInput);
expectRejected("oracle answer injection", neutralInputId, {
  ...neutralInput,
  classNumber: "1",
});

const preparedInputDirectory = path.join(directory, "../row6-candidate/inputs");
const preparedInputs = fs
  .readdirSync(preparedInputDirectory)
  .filter((name) => name.endsWith("-neutral-prepared-field.json"))
  .sort()
  .map((name) => ({
    name,
    value: JSON.parse(
      fs.readFileSync(path.join(preparedInputDirectory, name), "utf8"),
    ),
  }));
assert.equal(preparedInputs.length, 3);
for (const { name, value } of preparedInputs) {
  expectAccepted(`neutral prepared input ${name}`, neutralInputId, value);
}
const row6PreparedInput = preparedInputs.find(({ name }) =>
  name.startsWith("row6-"),
).value;
const nonIntegralTable = clone(row6PreparedInput);
nonIntegralTable.preparation.multiplicationTable[0][0][0].denominator = "2";
expectAccepted(
  "schema permits exact rational structure constants",
  neutralInputId,
  nonIntegralTable,
);

const evidenceBinding = {
  kind: "exact-replay",
  sha256: SHA256,
  replayable: true,
  verified: true,
  path: null,
};
const candidateResult = {
  schema: "sagejs.rust-class-group.result-evidence/v1",
  resultId: CONTENT_ID,
  inputId: CONTENT_ID,
  fieldId: "x^3-x-1",
  outcome: "completed",
  requestedProof: "conditional-grh",
  claim: {
    status: "candidate",
    publicComplete: false,
    proofAuthority: "none",
    reason: "collected relation lattice only",
  },
  classGroup: {
    classNumber: "1",
    invariantFactors: [],
    generatorIdeals: [],
  },
  maps: null,
  units: null,
  evidence: {
    relationLattice: evidenceBinding,
    smith: evidenceBinding,
    independentChecks: [evidenceBinding],
  },
  resourceUse: {
    wallNanoseconds: "1",
    peakLiveBytes: "1",
    peakRssBytes: "1",
    retries: 0,
  },
  implementation: {
    backend: "sagejs-rust-class-group",
    version: "test",
    artifactSha256: SHA256,
    linksPari: false,
    usesOracleInput: false,
  },
  failure: null,
};

const resultId =
  "https://sagejs.org/schemas/rust-class-group-qualification/result-evidence-v1.json";
expectAccepted("candidate result", resultId, candidateResult);
expectRejected("forged candidate completeness", resultId, {
  ...candidateResult,
  claim: { ...candidateResult.claim, publicComplete: true },
});

const artifact = {
  name: "rust-class-group.wasm",
  path: "dist/rust-class-group.wasm",
  sha256: SHA256,
  bytes: "1",
};
const directSupport = {
  status: "backend",
  fallback: null,
  limitation: null,
};
const allPassedGates = {
  w0Arithmetic: "passed",
  correctness: "passed",
  publicCompleteness: "passed",
  performance: "passed",
  memory: "passed",
  browserLifecycle: "passed",
  payloadAndStartup: "passed",
  platformPackaging: "passed",
  maintainability: "passed",
};
const capabilityStatus = {
  schema: "sagejs.rust-class-group.capability-status/v1",
  manifestId: CONTENT_ID,
  generatedAt: "2026-01-01T00:00:00Z",
  repository: {
    commit: COMMIT,
    tree: TREE,
    clean: true,
    statusSha256: SHA256,
  },
  backend: {
    id: "sagejs-rust-class-group",
    version: "test",
    hostIndependentCore: true,
    linksPari: false,
    license: "GPL-2.0-or-later",
  },
  capabilities: [
    {
      capabilityId: "browser-chromium-class-group",
      operation: "class-group",
      status: "qualified",
      maximumClaim: "publicly-complete",
      domain: {
        minimumDegree: 2,
        maximumDegree: 6,
        monicIntegralIrreducible: true,
        allSignatures: true,
        basisDenominators: true,
        indexPrimes: true,
        resourceLimits: limits,
      },
      target: {
        platform: "browser",
        architecture: "wasm32",
        route: "wasm-worker",
        browserEngine: "chromium",
        threadsRequired: false,
      },
      proofModes: {
        conditionalGrh: directSupport,
        unconditional: directSupport,
      },
      outputs: {
        classNumber: true,
        invariantFactors: true,
        generatorIdeals: true,
        idealToClass: true,
        principality: true,
      },
      arithmetic: {
        exactInteger: "gmp",
        realComplex: "mpfr-mpc",
        allocator: "single-wasm-linear-memory",
        overflowPolicy: "checked-checkpoint-promotion",
        abiProbeSha256: SHA256,
      },
      gates: allPassedGates,
      qualification: {
        corpusSha256: SHA256,
        receipts: [SHA256],
        artifact,
      },
      limitations: [],
    },
  ],
  overallDecision: "qualified-rust-class-group-backend",
};

const capabilityId =
  "https://sagejs.org/schemas/rust-class-group-qualification/capability-status-v1.json";
expectAccepted("qualified browser capability", capabilityId, capabilityStatus);
const missingW0 = clone(capabilityStatus);
missingW0.capabilities[0].gates.w0Arithmetic = "not-run";
expectRejected("qualified browser capability missing W0", capabilityId, missingW0);

const samples = Array(15).fill("100");
function implementationSamples(implementationId) {
  return {
    implementationId,
    boundarySha256: SHA256,
    resultDigest: SHA256,
    samplesNanoseconds: samples,
    medianNanoseconds: "100",
    peakMemoryBytes: "100",
    timeouts: 0,
    failures: 0,
  };
}

const benchmarkReceipt = {
  schema: "sagejs.rust-class-group.benchmark-receipt/v1",
  receiptId: CONTENT_ID,
  runId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  collectedAt: "2026-01-01T00:00:00Z",
  qualifiedTiming: true,
  repository: {
    commit: COMMIT,
    tree: TREE,
    clean: true,
    statusSha256: SHA256,
  },
  corpusSha256: SHA256,
  caseId: "x^3-x-1",
  boundary: {
    kind: "public-call",
    stage: "complete-public-call",
    publicTimingMode: "warmed-code-fresh-field",
    start: "polynomial construction",
    stop: "completed Sage.js result",
    includes: ["maximal order", "completion", "result construction"],
    excludes: [],
  },
  workload: {
    proofMode: "conditional-grh",
    claimStatus: "publicly-complete",
    outputContract: "class-group",
    mapPolicy: "construct-eagerly",
    unitPolicy: "completion-only",
    matchedOutputWork: true,
    freshFields: true,
    computedResultReuse: false,
  },
  environment: {
    hostId: "test-linux",
    os: "linux",
    architecture: "x86_64",
    kernel: "test",
    cpu: "test",
    logicalCpus: 8,
    memoryBytes: "1000000000",
    quietTimingHost: true,
    threadCount: 1,
    powerPolicy: null,
    browser: null,
  },
  tools: [
    {
      name: "rustc",
      version: "test",
      target: "x86_64-unknown-linux-gnu",
      flags: [],
      executableSha256: null,
    },
  ],
  artifacts: [artifact],
  schedule: {
    kind: "alternating-blocks-v1",
    warmups: 1,
    blocks: 15,
    order: "AB",
    randomSeeds: [SHA256],
  },
  implementations: {
    rust: implementationSamples("rust"),
    pari: implementationSamples("pari-2.17.4"),
  },
  comparison: {
    comparable: true,
    rustOverPari: 1,
    uncertainty: null,
    gate: "passed",
    reason: null,
  },
  stageBreakdown: [],
  counters: {},
  failures: [],
};

const benchmarkId =
  "https://sagejs.org/schemas/rust-class-group-qualification/benchmark-receipt-v1.json";
expectAccepted("qualified public benchmark", benchmarkId, benchmarkReceipt);
expectRejected("candidate-only qualified timing", benchmarkId, {
  ...benchmarkReceipt,
  workload: { ...benchmarkReceipt.workload, claimStatus: "candidate" },
});

const expectedEvidence = {
  oracleSha256: SHA256,
  independentCheckKind: "certificate-replay",
  independentCheckSha256: SHA256,
};
const qualificationCase = {
  caseId: "development-cubic",
  role: "development",
  degree: 3,
  signature: { realPlaces: 1, complexPairs: 1 },
  inputSha256: SHA256,
  source: {
    authority: "frozen-test-source",
    recordId: "development-cubic",
    recordSha256: SHA256,
  },
  features: ["ramification"],
  timingStratum: "under-5ms",
  proofModes: ["conditional-grh"],
  expectedEvidence,
  resourceLimitExpected: false,
};
const corpusManifest = {
  schema: "sagejs.rust-class-group.corpus-manifest/v1",
  manifestId: CONTENT_ID,
  frozenAt: "2026-01-01T00:00:00Z",
  selectionProcedureSha256: SHA256,
  selectionSeed: SHA256,
  pariReference: {
    version: "2.17.4",
    sourceSha256: SHA256,
    buildConfigurationSha256: SHA256,
  },
  counts: {
    qualification: 120,
    development: 60,
    heldOut: 60,
    minimumRandom: 1000,
  },
  qualificationCases: Array.from({ length: 120 }, (_, index) => ({
    ...qualificationCase,
    caseId: `qualification-${index + 1}`,
    role: index < 60 ? "development" : "held-out",
  })),
  extensionCases: [],
  randomCampaign: {
    generator: "bounded-random-fields-v1",
    generatorSha256: SHA256,
    seed: SHA256,
    caseCount: 1000,
    degreeRange: [2, 6],
    coefficientBounds: ["-10", "10"],
  },
  exhaustiveCampaigns: [
    {
      campaignId: "small-quadratics",
      generatorSha256: SHA256,
      degree: 2,
      coefficientBounds: ["-2", "2"],
      expectedCaseCount: 1,
    },
  ],
  holdoutPolicy: {
    sealedBeforeTuning: true,
    answersUnavailableToRuntime: true,
    fixRequiresFreshConfirmation: true,
    removalRequiresManifestVersion: true,
  },
  expectedEvidencePolicy: {
    runtimeReceivesAnswers: false,
    independentOracleRequired: true,
    semanticGeneratorComparison: true,
    exactTraceOnlyWhenMatched: true,
  },
};

const corpusId =
  "https://sagejs.org/schemas/rust-class-group-qualification/corpus-manifest-v1.json";
expectAccepted("120-case corpus shape", corpusId, corpusManifest);
expectRejected("undersized qualification corpus", corpusId, {
  ...corpusManifest,
  qualificationCases: corpusManifest.qualificationCases.slice(0, 119),
});

console.log(
  `Rust class-group schema contracts passed: ${schemaFiles.length} schemas compiled, 5 counterfeit classes rejected.`,
);
