#!/usr/bin/env node
"use strict";

// Transactional publisher for the C6 high-precision getfu boundary.  The
// expensive native arithmetic is deliberately external to this coordinator;
// its candidate must bind both immutable inputs and is independently replayed
// here before a content-addressed owner is made visible.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const C5_SCHEMA =
  "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1";
const EMBEDDING_SCHEMA =
  "sagejs.pari-class-group/field3-prepared-embedding-owner-v1";
const CANDIDATE_SCHEMA = "sagejs.pari-class-group/field3-c6-getfu-candidate-v1";
const OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-c6-getfu-v1";
const FIELD = "x^4-2000022*x-2000042";
const RUN = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const integerPattern = /^-?(0|[1-9][0-9]*)$/;
const digestPattern = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`field3 C6 getfu: ${message}`);
}

function sha(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function strictParse(bytes, label) {
  const script = String.raw`import json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
value=json.load(sys.stdin,object_pairs_hook=strict)
json.dump(value,sys.stdout,separators=(',',':'))`;
  const parsed = spawnSync("python3", ["-c", script], {
    input: bytes,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  const value = JSON.parse(parsed.stdout);
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is not an object`);
  return value;
}

function owner(selected, expected, label) {
  if (!digestPattern.test(expected)) fail(`${label} digest is invalid`);
  const stat = fs.statSync(selected);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o444)
    fail(`${label} is not an immutable mode-0444 file`);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== expected) fail(`${label} digest changed`);
  return { value: strictParse(bytes, label), sha256: expected };
}

function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length)
    fail(`${label} has the wrong length`);
  return value.map((cell) => {
    if (typeof cell !== "string" || !integerPattern.test(cell))
      fail(`${label} contains a noncanonical integer`);
    return BigInt(cell);
  });
}

function args(argv) {
  const value = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length)
      fail("invalid arguments");
    value[argv[index].slice(2)] = argv[index + 1];
  }
  const required = [
    "c5-owner",
    "c5-sha256",
    "embedding-owner",
    "embedding-sha256",
    "candidate",
    "candidate-sha256",
    "output-dir",
  ];
  if (Object.keys(value).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map((key) => `--${key}`).join(", ")}`);
  return value;
}

function det3(a, b, c, d, e, f, g, h, i) {
  return a * (e * i - h * f) - d * (b * i - h * c) + g * (b * f - e * c);
}

function authenticateUnit(unit, tensor) {
  if (unit[1] === 0n && unit[2] === 0n && unit[3] === 0n)
    fail("candidate unit is scalar");
  const matrix = Array(16).fill(0n);
  for (let index = 0; index < 16; index++)
    for (let basis = 0; basis < 4; basis++)
      matrix[index] += unit[basis] * tensor[16 * basis + index];
  const inverse = [
    det3(matrix[5], matrix[6], matrix[7], matrix[9], matrix[10], matrix[11], matrix[13], matrix[14], matrix[15]),
    -det3(matrix[1], matrix[2], matrix[3], matrix[9], matrix[10], matrix[11], matrix[13], matrix[14], matrix[15]),
    det3(matrix[1], matrix[2], matrix[3], matrix[5], matrix[6], matrix[7], matrix[13], matrix[14], matrix[15]),
    -det3(matrix[1], matrix[2], matrix[3], matrix[5], matrix[6], matrix[7], matrix[9], matrix[10], matrix[11]),
  ];
  let norm = 0n;
  for (let column = 0; column < 4; column++) norm += matrix[4 * column] * inverse[column];
  if (norm !== 1n && norm !== -1n) fail("candidate unit norm is not plus or minus one");
  for (let index = 0; index < 4; index++) inverse[index] /= norm;
  for (let row = 0; row < 4; row++) {
    let product = 0n;
    for (let column = 0; column < 4; column++)
      product += matrix[4 * column + row] * inverse[column];
    if (product !== (row === 0 ? 1n : 0n)) fail("candidate inverse product is not one");
  }
  return { inverse, norm };
}

function equal(left, right, label) {
  if (left.length !== right.length || left.some((value, index) => value !== right[index]))
    fail(`${label} changed`);
}

function polynomialField(coefficients) {
  let result = "x^4";
  for (let degree = 3; degree >= 0; degree--) {
    const coefficient = BigInt(coefficients[degree]);
    if (coefficient === 0n) continue;
    result += coefficient > 0n ? "+" : "-";
    const magnitude = coefficient < 0n ? -coefficient : coefficient;
    if (degree === 0 || magnitude !== 1n) result += magnitude.toString();
    if (degree > 0) {
      if (magnitude !== 1n) result += "*";
      result += degree === 1 ? "x" : `x^${degree}`;
    }
  }
  return result;
}

function validate(c5Owner, embeddingOwner, candidateOwner) {
  const c5 = c5Owner.value;
  const embedding = embeddingOwner.value;
  const candidate = candidateOwner.value;
  if (c5.schema !== C5_SCHEMA || typeof c5.field !== "string" || typeof c5.runIdentity !== "string")
    fail("wrong C5 owner identity");
  if (embedding.schema !== EMBEDDING_SCHEMA || embedding.runIdentity !== c5.runIdentity)
    fail("wrong embedding owner identity");
  if (candidate.schema !== CANDIDATE_SCHEMA) fail("wrong candidate schema");
  if (candidate.c5OwnerSha256 !== c5Owner.sha256 || candidate.embeddingOwnerSha256 !== embeddingOwner.sha256)
    fail("candidate input ancestry changed");
  const precision = Number(c5.precision);
  const generation = Number(c5.generation);
  if (candidate.precision !== precision || candidate.generation !== generation)
    fail("candidate precision or generation changed");
  if (precision < 64 || precision > 153088 || precision % 64 !== 0 || generation < 1)
    fail("invalid C5 precision protocol");
  if (!Array.isArray(c5.state) || c5.state.length !== 15)
    fail("wrong C5 terminal state length");
  const c5State = c5.state.map(BigInt);
  if (
    c5State[0] !== 0n || c5State[1] !== BigInt(precision) || c5State[2] !== 3n ||
    c5State[3] !== 0n || c5State[4] !== 0n || c5State[5] !== 0n || c5State[6] !== 0n ||
    (c5State[7] !== 1n && c5State[7] !== -1n) ||
    (c5State[8] !== 1n && c5State[8] !== -1n) || c5State[9] !== 1n ||
    c5State[10] !== 301n || c5State[11] !== 13n || c5State[12] !== 2n ||
    c5State[13] !== 2n || c5State[14] !== 15n
  ) fail("C5 owner is not an accepted rank-two publication");
  for (const [key, label] of [
    ["fullTerminalOwnerSha256", "full-terminal"],
    ["c3OwnerSha256", "C3"],
    ["acceptedC4OwnerSha256", "accepted C4"],
  ]) {
    if (typeof c5[key] !== "string" || !digestPattern.test(c5[key]))
      fail(`C5 ${label} ancestry is invalid`);
  }
  if (!Array.isArray(c5.acceptanceState) || c5.acceptanceState.length !== 4)
    fail("wrong C5 analytic acceptance state length");
  const acceptanceState = c5.acceptanceState.map(BigInt);
  if (
    acceptanceState[0] !== 0n || acceptanceState[1] < 1n ||
    acceptanceState[2] !== BigInt(precision) || acceptanceState[3] !== 1n
  ) fail("C5 analytic acceptance was not terminal");
  if (!Array.isArray(embedding.polynomial) || embedding.polynomial.length !== 5 || embedding.signature.join(",") !== "2,1")
    fail("wrong embedding field");
  if (c5.field !== polynomialField(embedding.polynomial)) fail("C5 and embedding fields differ");
  if (precision === 153088 && (c5.field !== FIELD || c5.runIdentity !== RUN))
    fail("wrong authentic field-3 identity");
  if (precision === 153088 && (
    embedding.requestedBits !== 153088 ||
    embedding.makeMRootPrecisionBits !== 153152 ||
    embedding.makeMTruncation !== false
  )) fail("wrong authentic field-3 embedding precision protocol");
  const tensor = embedding.tensor.map(BigInt);
  if (tensor.length !== 64) fail("wrong multiplication tensor length");
  const factor = integers(c5.getfuFactor, 4, "C5 getfu factor");
  const factorDeterminant = factor[0] * factor[3] - factor[1] * factor[2];
  if (factorDeterminant !== c5State[8] || factorDeterminant !== BigInt(candidate.factorDeterminant))
    fail("candidate factor determinant changed");
  const state = integers(candidate.state, 12, "candidate state");
  const status = Number(candidate.status);
  if (![0, 2, 3].includes(status) || state[0] !== BigInt(status))
    fail("invalid candidate terminal status");
  const expectedCoefficients = precision > 768 ? 16385n : 512n;
  if (
    state[1] !== BigInt(precision) || state[2] !== BigInt(generation) ||
    state[5] !== factorDeterminant || state[6] !== expectedCoefficients ||
    state[7] !== 301n
  ) fail("candidate protocol state changed");
  if (status !== 0) {
    for (const key of ["roundedUnits", "units", "logsReal", "logsImag", "adjustedFactor", "adjustedWraw"])
      if (!Array.isArray(candidate[key]) || candidate[key].length !== 0)
        fail(`terminal not_given exposed ${key}`);
    if (state[3] !== 0n || state[4] !== 0n || state[10] !== 0n || state[11] !== 0n)
      fail("terminal not_given published success state");
    return { status, precision, generation, field: c5.field, runIdentity: c5.runIdentity, reason: status === 2 ? "LARGE" : "PRECI" };
  }

  const rounded = integers(candidate.roundedUnits, 8, "rounded units");
  const units = integers(candidate.units, 8, "published units");
  const logsReal = integers(candidate.logsReal, 18, "published real logs");
  const logsImag = integers(candidate.logsImag, 18, "published imaginary logs");
  const adjustedFactor = integers(candidate.adjustedFactor, 4, "adjusted factor");
  const adjustedWraw = integers(candidate.adjustedWraw, 602, "adjusted Wraw");
  const sourceReal = integers(c5.preparedCleanReal, 18, "C5 prepared real logs");
  const sourceImag = integers(c5.preparedCleanImag, 18, "C5 prepared imaginary logs");
  const sourceWraw = integers(c5.rawUnitTransform, 602, "C5 raw unit transform");
  let mask = 0;
  const norms = [];
  for (let column = 0; column < 2; column++) {
    const direct = rounded.slice(4 * column, 4 * column + 4);
    const { inverse, norm } = authenticateUnit(direct, tensor);
    const directSize = direct.reduce((sum, value) => sum + value * value, 0n);
    const inverseSize = inverse.reduce((sum, value) => sum + value * value, 0n);
    const chooseInverse = inverseSize < directSize;
    if (chooseInverse) mask |= 1 << column;
    equal(units.slice(4 * column, 4 * column + 4), chooseInverse ? inverse : direct, `unit ${column} normalization`);
    const sign = chooseInverse ? -1n : 1n;
    equal(logsReal.slice(9 * column, 9 * column + 9), sourceReal.slice(9 * column, 9 * column + 9).map((v) => sign * v), `unit ${column} real logs`);
    equal(logsImag.slice(9 * column, 9 * column + 9), sourceImag.slice(9 * column, 9 * column + 9).map((v) => sign * v), `unit ${column} imaginary logs`);
    equal(adjustedFactor.slice(2 * column, 2 * column + 2), factor.slice(2 * column, 2 * column + 2).map((v) => sign * v), `unit ${column} factor`);
    equal(adjustedWraw.slice(301 * column, 301 * column + 301), sourceWraw.slice(301 * column, 301 * column + 301).map((v) => sign * v), `unit ${column} Wraw`);
    norms.push(norm.toString());
  }
  if (state[3] !== 2n || state[4] !== BigInt(mask) || state[10] !== 1n || state[11] !== 602n)
    fail("candidate success state changed");
  return { status, precision, generation, field: c5.field, runIdentity: c5.runIdentity, inverseMask: mask, norms };
}

function publish(options, validated, c5Owner, embeddingOwner, candidateOwner) {
  const payload = {
    schema: OUTPUT_SCHEMA,
    field: validated.field,
    runIdentity: validated.runIdentity,
    precision: validated.precision,
    generation: validated.generation,
    status: validated.status === 0 ? "success" : "not_given",
    reason: validated.reason || null,
    c5OwnerSha256: c5Owner.sha256,
    embeddingOwnerSha256: embeddingOwner.sha256,
    candidateSha256: candidateOwner.sha256,
    state: candidateOwner.value.state,
    inverseMask: validated.inverseMask ?? 0,
    unitNorms: validated.norms || [],
    units: candidateOwner.value.units,
    logsReal: candidateOwner.value.logsReal,
    logsImag: candidateOwner.value.logsImag,
    adjustedFactor: candidateOwner.value.adjustedFactor,
    adjustedWraw: candidateOwner.value.adjustedWraw,
  };
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(options["output-dir"], { recursive: true });
  const destination = path.join(options["output-dir"], `field3-c6-getfu-${digest}.json`);
  if (fs.existsSync(destination)) {
    if (sha(fs.readFileSync(destination)) !== digest || (fs.statSync(destination).mode & 0o777) !== 0o444)
      fail("existing published owner changed");
  } else {
    const temporary = path.join(options["output-dir"], `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o400, flag: "wx" });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { schema: OUTPUT_SCHEMA, path: destination, sha256: digest, bytes: bytes.length, status: payload.status, reason: payload.reason };
}

try {
  const options = args(process.argv);
  const c5 = owner(options["c5-owner"], options["c5-sha256"], "C5 owner");
  const embedding = owner(options["embedding-owner"], options["embedding-sha256"], "embedding owner");
  const candidate = owner(options.candidate, options["candidate-sha256"], "candidate owner");
  const validated = validate(c5, embedding, candidate);
  process.stdout.write(`${JSON.stringify(publish(options, validated, c5, embedding, candidate))}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
