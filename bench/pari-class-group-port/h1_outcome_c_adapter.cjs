"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Ajv2020 = require("ajv/dist/2020");
const {
  deriveSummary,
  validateReceipt: validateDiagnosticReceipt,
} = require("./h1_exclusive_stage_timing.cjs");
const { canonical, digest } = require("./h1_outcome_c_worker.cjs");
const { authenticatePreparedNf } = require("./prepared_nf_authentication.cjs");

const HERE = __dirname;
const WORKER_PATH = path.join(HERE, "h1_outcome_c_worker.cjs");
const ADAPTER_SCHEMA_PATH = path.join(HERE, "h1-outcome-c-adapter-receipt.schema.json");
const EXCLUSIVE_SCHEMA_PATH = path.join(HERE, "h1-exclusive-stage-timing-receipt.schema.json");
const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const PREPARED_SCHEMA = "sagejs.pari-class-group/sanitized-prepared-h1-v1";
const ROOT_BOUNDARY = "prepared-nfinit-class-unit-h1";
const PARAMETER_KINDS = new Set([
  "bool", "float", "int", "Integer", "Float64Buffer", "Int64Buffer",
  "IntegerBuffer",
]);
const NONZERO_PREPARED_OWNERS = new Set([
  "admission_matrix_m", "admission_matrix_p", "admission_matrix_e",
  "preparation_embedding", "preparation_rounded_embedding",
  "admission_primes", "admission_products", "n", "precision",
  "admission_real_count", "admission_factorlimit", "admission_prime_limit",
  "analytic_discriminant", "analytic_roots_of_unity", "prep_index",
  "prep_zkden", "prep_polynomial", "prep_invzk", "prep_zk",
  "prep_zk_degrees", "basis_table", "analytic_primes",
]);
const SENTINEL_OWNERS = Object.freeze({
  accept_inverse_hr: ["-991", "-992", "-993"],
  analytic_log_discriminant: [-999],
});

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has unexpected fields`);
}

function parseRootParameters(sourceText) {
  const match = sourceText.match(
    /def\s+pari_resident_generated_class_attempt\(([\s\S]*?)\n\)/,
  );
  assert(match, "prepared h1 root declaration disappeared");
  const parameters = match[1].trim().split("\n").map(line => {
    const declaration = line.trim().replace(/,$/, "");
    const pieces = declaration.split(": ");
    assert.equal(pieces.length, 2, `unparseable prepared parameter: ${declaration}`);
    assert(PARAMETER_KINDS.has(pieces[1]), `unsupported prepared type: ${pieces[1]}`);
    return pieces;
  });
  assert.equal(new Set(parameters.map(([name]) => name)).size, parameters.length);
  return parameters;
}

function exactInteger(value, name) {
  assert.notEqual(typeof value, "boolean", `${name} must be an integer`);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    assert(Number.isSafeInteger(value), `${name} must be an exact safe integer`);
    return String(value);
  }
  assert.equal(typeof value, "string", `${name} must be an integer`);
  assert.match(value, /^-?(0|[1-9][0-9]*)$/, `${name} is not canonical`);
  assert.notEqual(value, "-0", `${name} is not canonical`);
  return value;
}

function canonicalScalar(value, kind, name) {
  if (kind === "bool") {
    assert.equal(typeof value, "boolean", `${name} must be boolean`);
    return value;
  }
  if (kind === "float") {
    const number = Number(value);
    assert(Number.isFinite(number), `${name} must be finite`);
    return number;
  }
  return exactInteger(value, name);
}

function canonicalValue(value, kind, name) {
  if (!kind.endsWith("Buffer")) {
    assert(!Array.isArray(value), `${name} scalar became an owner`);
    return canonicalScalar(value, kind, name);
  }
  assert(Array.isArray(value), `${name} must be a buffer owner`);
  assert(value.length <= 5_000_000, `${name} exceeds the owner cell cap`);
  const scalarKind = kind === "Float64Buffer" ? "float" : "Integer";
  return value.map((entry, index) => canonicalScalar(entry, scalarKind, `${name}[${index}]`));
}

function isZero(value) {
  if (Array.isArray(value)) return value.every(isZero);
  return value === false || value === 0 || value === "0";
}

function sanitizePreparedInput(raw, sourceText) {
  exactKeys(raw, ["names", "input"], "prepared input envelope");
  const expectedNames = parseRootParameters(sourceText);
  assert.deepEqual(raw.names, expectedNames, "prepared input parameter ABI changed");
  exactKeys(raw.input, expectedNames.map(([name]) => name), "prepared input owners");
  const input = {};
  let totalCells = 0;
  const nonzeroOwners = [];
  for (const [name, kind] of expectedNames) {
    const value = canonicalValue(raw.input[name], kind, name);
    totalCells += Array.isArray(value) ? value.length : 1;
    assert(totalCells <= 20_000_000, "prepared input exceeds the aggregate cell cap");
    if (!isZero(value)) {
      nonzeroOwners.push(name);
      if (Object.hasOwn(SENTINEL_OWNERS, name)) {
        assert.deepEqual(value, SENTINEL_OWNERS[name], `${name} sentinel changed`);
      } else {
        assert(NONZERO_PREPARED_OWNERS.has(name), `${name} leaks non-prepared result data`);
      }
    }
    input[name] = value;
  }
  for (const name of NONZERO_PREPARED_OWNERS) {
    assert(Object.hasOwn(input, name), `prepared allowlist owner disappeared: ${name}`);
  }
  const preparedAuthority = authenticatePreparedNf(input);
  assert.deepEqual(
    preparedAuthority.polynomial,
    ["20034", "-20018", "0", "1"],
    "prepared number field does not match the selected H1 field",
  );
  const record = {
    schema: PREPARED_SCHEMA,
    fieldId: FIELD_ID,
    names: expectedNames,
    input,
  };
  const bytes = Buffer.from(JSON.stringify(canonical(record)));
  return {
    record,
    metadata: {
      schema: PREPARED_SCHEMA,
      sha256: sha256Bytes(bytes),
      rootSourceSha256: sha256Bytes(sourceText),
      canonicalBytes: bytes.length,
      parameterCount: expectedNames.length,
      nonzeroOwners: [...nonzeroOwners].sort(),
    },
  };
}

function workerRequest({ pairIndex, repetitions, implementation, seed, prepared }) {
  return {
    schema: 1,
    fieldId: FIELD_ID,
    seed,
    pairIndex,
    repetitions,
    implementation,
    preparedInputSha256: digest(prepared),
    preparedInput: prepared,
  };
}

function workerResponse(spec, request, { timeout = 600_000 } = {}) {
  const args = [
    WORKER_PATH,
    "--implementation", request.implementation,
    "--adapter", spec.adapterPath,
    ...(spec.selfTestClockStep === undefined
      ? []
      : ["--self-test-clock-step", String(spec.selfTestClockStep)]),
  ];
  const answer = spawnSync(process.execPath, args, {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout,
    maxBuffer: 128 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LANG: "C",
      LC_ALL: "C",
      OMP_NUM_THREADS: "1",
      OPENBLAS_NUM_THREADS: "1",
      MKL_NUM_THREADS: "1",
    },
  });
  assert.equal(answer.status, 0, answer.stderr || String(answer.error));
  const response = JSON.parse(answer.stdout);
  exactKeys(response, [
    "schema", "implementation", "requestSha256", "preparedInputSha256",
    "selfTestClock", "arm",
  ], "worker response");
  assert.equal(response.schema, 1);
  assert.equal(response.implementation, request.implementation);
  assert.equal(response.requestSha256, digest(request));
  assert.equal(response.preparedInputSha256, request.preparedInputSha256);
  assert.equal(response.selfTestClock, spec.selfTestClockStep !== undefined);
  return response;
}

function validateAdapterReceipt(receipt) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
    validateFormats: false,
  });
  const exclusive = JSON.parse(fs.readFileSync(EXCLUSIVE_SCHEMA_PATH, "utf8"));
  ajv.addSchema(exclusive);
  const schema = JSON.parse(fs.readFileSync(ADAPTER_SCHEMA_PATH, "utf8"));
  const validate = ajv.compile(schema);
  if (!validate(receipt)) {
    throw new assert.AssertionError({
      message: `Outcome-C adapter receipt violation: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
    });
  }
  validateDiagnosticReceipt(receipt.diagnosticReceipt);
  assert.equal(
    receipt.diagnosticReceipt.provenance.rootSourceSha256,
    receipt.preparedInput.rootSourceSha256,
    "diagnostic root provenance changed",
  );
  assert.equal(receipt.workers.sagejs.implementation, "sagejs");
  assert.equal(receipt.workers.pari.implementation, "pari");
  return receipt;
}

function runOutcomeCDiagnostic({
  rawPreparedInput,
  rootSourceText,
  sagejsWorker,
  pariWorker,
  provenance,
  repetitions = { sagejs: 1, pari: 1 },
  pairCount = 7,
  seed = "1",
  workerMode = "authentic",
}) {
  assert(Number.isInteger(pairCount) && pairCount >= 7);
  assert.match(seed, /^(0|[1-9][0-9]*)$/);
  assert(["authentic", "self-test"].includes(workerMode));
  const specs = { sagejs: sagejsWorker, pari: pariWorker };
  for (const implementation of ["sagejs", "pari"]) {
    const spec = specs[implementation];
    exactKeys(spec, [
      "adapterPath",
      ...(workerMode === "self-test" ? ["selfTestClockStep"] : []),
    ], `${implementation} worker specification`);
    assert(fs.statSync(spec.adapterPath).isFile());
    if (workerMode === "authentic") assert.equal(spec.selfTestClockStep, undefined);
  }
  const sanitized = sanitizePreparedInput(rawPreparedInput, rootSourceText);
  const pairs = [];
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const order = pairIndex % 2 === 0 ? "AB" : "BA";
    const implementations = [...order].map(label => label === "A" ? "sagejs" : "pari");
    const arms = implementations.map((implementation, position) => {
      const request = workerRequest({
        pairIndex,
        repetitions: repetitions[implementation],
        implementation,
        seed,
        prepared: sanitized.record,
      });
      const response = workerResponse(specs[implementation], request);
      return { ...response.arm, position, label: order[position] };
    });
    pairs.push({ pairIndex, order, arms });
  }
  const diagnosticReceipt = {
    schema: 1,
    qualifiedTiming: false,
    fieldId: FIELD_ID,
    rootBoundary: ROOT_BOUNDARY,
    timerProtocol: "single-active-stage-contiguous-v1",
    clock: "monotonic-wall-nanoseconds",
    seed,
    provenance: {
      ...provenance,
      rootSourceSha256: sanitized.metadata.rootSourceSha256,
    },
    pairs,
    // Attribution is derived only here, after authenticated worker records
    // have been collected. No worker or caller can supply it.
    summary: deriveSummary(pairs),
  };
  validateDiagnosticReceipt(diagnosticReceipt);
  const workerSha256 = sha256Bytes(fs.readFileSync(WORKER_PATH));
  const receipt = {
    schema: 1,
    qualifiedTiming: false,
    finalTimingRun: false,
    executionStatus: "diagnostic-complete",
    workerMode,
    preparedInput: sanitized.metadata,
    workers: Object.fromEntries(["sagejs", "pari"].map(implementation => [
      implementation,
      {
        implementation,
        workerSha256,
        adapterSha256: sha256Bytes(fs.readFileSync(specs[implementation].adapterPath)),
      },
    ])),
    authenticatedDigests: ["result", "replay", "rng", "work"],
    attributionDerived: true,
    diagnosticReceipt,
  };
  return validateAdapterReceipt(receipt);
}

function integrationEdge() {
  return {
    schema: "sagejs.pari-class-group/h1-outcome-c-integration-edge-v1",
    baseCommit: "f0d3cfe24d58e46492635fd20c6a24dd5e0c0772",
    timedPreparedCandidateAvailable: true,
    timedPreparedFinalResultAvailable: false,
    firstMissingEdge:
      "accepted candidate -> resident p2240 unit input/retry -> live final driver -> correspondence-complete standardized result",
    currentComposition:
      "the internally complete authority is assembled outside the prepared native root from later resident artifacts; it is not one fresh timed prepared-root computation",
  };
}

module.exports = {
  ADAPTER_SCHEMA_PATH,
  FIELD_ID,
  NONZERO_PREPARED_OWNERS,
  PREPARED_SCHEMA,
  ROOT_BOUNDARY,
  SENTINEL_OWNERS,
  WORKER_PATH,
  integrationEdge,
  parseRootParameters,
  runOutcomeCDiagnostic,
  sanitizePreparedInput,
  validateAdapterReceipt,
  workerRequest,
  workerResponse,
};
