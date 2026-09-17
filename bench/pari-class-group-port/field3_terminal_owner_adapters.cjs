#!/usr/bin/env node
"use strict";

// Transactional adapters for the two owners consumed by the field-3 C7
// correspondence join.  They copy authenticated mathematical owners and
// verify their ancestry; they never manufacture an answer from a fixture.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const FIELD = "x^4-2000022*x-2000042";
const RUN = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const FULL15_SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1";
const C5_SCHEMA = "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1";
const C6_SCHEMA = "sagejs.pari-class-group/field3-c6-getfu-v1";
const FACTORBACK_SOURCE_SCHEMA =
  "sagejs.pari-class-group/field3-c6-factorback-source-v1";
const FACTORBACK_SCHEMA = "sagejs.pari-class-group/field3-c6-factorback-receipt-v1";
const UNIT_SCHEMA = "sagejs.pari-class-group/field3-c5-c6-unit-owner-v1";
const RELATION_SCHEMA = "sagejs.pari-class-group/field3-full-owner-authority-v1";
const CLASS_SCHEMA = "sagejs.pari-class-group/field3-live-class-suffix-owner-v1";
const LIVE_SCHEMA = "sagejs.pari-class-group/field3-live-final-owner-v1";
const RESIDENT_AUTHORITY_SHA256 =
  "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const LIVE_CLASS_JOIN_SHA256 =
  "b8df9b99acb501d8ea0faf3034c1059d451ffd84180735c89c982b0f014da814";
const PROTOCOL_SHA256 =
  "892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class TerminalOwnerFailure extends Error {}
function fail(message) { throw new TerminalOwnerFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function strictParse(bytes, label) {
  // JSON.parse silently accepts duplicate keys.  The immutable owner boundary
  // must not have two interpretations, so use the repository's Python runtime
  // only as a strict JSON parser.
  const { spawnSync } = require("node:child_process");
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
    input: bytes, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  const value = JSON.parse(parsed.stdout);
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is not an object`);
  return value;
}

function openOwner(selected, expected, label) {
  if (typeof expected !== "string" || !DIGEST.test(expected))
    fail(`${label} digest is invalid`);
  const info = fs.statSync(selected);
  if (!info.isFile() || (info.mode & 0o777) !== 0o444)
    fail(`${label} is not an immutable mode-0444 file`);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== expected) fail(`${label} digest changed`);
  return { value: strictParse(bytes, label), sha256: expected };
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} is not an object`);
  return value;
}
function integer(value, label) {
  if ((typeof value !== "string" && typeof value !== "number") ||
      !INTEGER.test(String(value)) ||
      (typeof value === "number" && (!Number.isSafeInteger(value) || String(value) !== String(Number(value)))))
    fail(`${label} is not a canonical integer`);
  return String(value);
}
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => integer(entry, `${label}[${index}]`));
}
function digest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) fail(`${label} is not a digest`);
  return value;
}
function digestWords(value) {
  return Array.from({ length: 4 }, (_, index) => {
    const word = BigInt(`0x${value.slice(16 * index, 16 * index + 16)}`);
    return String(word >= (1n << 63n) ? word - (1n << 64n) : word);
  });
}
function arrayDigest(values) { return sha(Buffer.from(values.join("\n"))); }
function equal(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail(`${label} changed`);
}
function identity(owner, schema, label) {
  if (owner.schema !== schema || owner.field !== FIELD || owner.runIdentity !== RUN)
    fail(`${label} identity changed`);
}

function validateFull15(owner) {
  identity(owner.value, FULL15_SCHEMA, "full15 owner");
  if (owner.value.transformShape?.join(",") !== "301,15" ||
      owner.value.terminalShape?.join(",") !== "3,15" ||
      owner.value.unitColumns !== 13 || owner.value.classColumns !== 2)
    fail("full15 owner shape changed");
  return {
    transform: integers(owner.value.transform, 301 * 15, "full15 transform"),
    packedA: integers(owner.value.packedA, 273, "full15 packed A"),
    W: integers(owner.value.terminalH, 4, "full15 terminal H"),
    packedC: integers(owner.value.packedCe, 42, "full15 packed Ce"),
  };
}

function determinant4(element, tensor) {
  const matrix = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => {
      let value = 0n;
      for (let basis = 0; basis < 4; basis += 1)
        value += BigInt(element[basis]) * BigInt(tensor[16 * basis + 4 * column + row]);
      return value;
    }));
  let previous = 1n; let sign = 1n;
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    while (pivot < 4 && matrix[pivot][column] === 0n) pivot += 1;
    if (pivot === 4) return 0n;
    if (pivot !== column) {
      [matrix[pivot], matrix[column]] = [matrix[column], matrix[pivot]];
      sign = -sign;
    }
    const value = matrix[column][column];
    for (let row = column + 1; row < 4; row += 1)
      for (let inner = column + 1; inner < 4; inner += 1) {
        const numerator = matrix[row][inner] * value -
          matrix[row][column] * matrix[column][inner];
        if (numerator % previous !== 0n) fail("principal norm determinant is not exact");
        matrix[row][inner] = numerator / previous;
      }
    previous = value;
  }
  return sign * matrix[3][3];
}

function compactUnitProof(full, c5, relation, raw, factor) {
  identity(relation.value, RELATION_SCHEMA, "compact relation authority");
  if (relation.value.residentAuthoritySha256 !== RESIDENT_AUTHORITY_SHA256 ||
      relation.value.liveClassJoinSha256 !== LIVE_CLASS_JOIN_SHA256 ||
      relation.value.exactOwnersAreAuthority !== true ||
      relation.value.principalGeneratorsAreExact !== true)
    fail("compact relation owner lacks exact authority");
  equal(integers(relation.value.shape, 2, "compact relation shape"),
    ["288", "301"], "compact relation shape");
  if (integer(relation.value.degree, "compact relation degree") !== "4")
    fail("compact relation degree changed");
  const replay = object(relation.value.replay, "compact relation replay");
  if (replay.principalRelationsExact !== true ||
      integer(replay.relations, "compact replay relations") !== "301" ||
      integer(replay.factorBaseSize, "compact replay factor base") !== "288")
    fail("compact relation replay lacks exact authority");
  const assumptions = object(relation.value.assumptions, "compact relation assumptions");
  if (assumptions.pari2174Correspondence !== true ||
      assumptions.upstreamBoundsAssumed !== true ||
      assumptions.publicCompletion !== false)
    fail("compact relation assumptions changed");
  const exact = object(relation.value.exactOwners, "compact exact owners");
  const records = integers(exact.relationRecords, 288 * 301, "compact relation records");
  const generators = integers(exact.principalGenerators, 4 * 301,
    "compact principal generators");
  const tensor = integers(exact.basisTable, 64, "compact multiplication basis");
  if (tensor.slice(0, 16).join(",") !==
      "1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1")
    fail("compact multiplication identity changed");
  const finalTransform = integers(c5.value.finalTransform, 26,
    "C5 final transform");
  equal(integers(c5.value.finalTransformShape, 2, "C5 final transform shape"),
    ["13", "2"], "C5 final transform shape");
  equal(integers(c5.value.rawUnitTransformShape, 2, "C5 raw transform shape"),
    ["301", "2"], "C5 raw transform shape");
  equal(integers(c5.value.getfuFactorShape, 2, "C5 getfu factor shape"),
    ["2", "2"], "C5 getfu factor shape");

  // W = T * U, in the column-major layout retained by the PARI translation.
  for (let unit = 0; unit < 2; unit += 1)
    for (let row = 0; row < 301; row += 1) {
      let expected = 0n;
      for (let accepted = 0; accepted < 13; accepted += 1)
        expected += BigInt(full.transform[301 * accepted + row]) *
          BigInt(finalTransform[13 * unit + accepted]);
      if (expected !== BigInt(raw[301 * unit + row]))
        fail("compact W=T*U replay changed");
    }

  // R * W = 0 proves that each product has trivial finite divisor.
  for (let unit = 0; unit < 2; unit += 1)
    for (let row = 0; row < 288; row += 1) {
      let image = 0n;
      for (let column = 0; column < 301; column += 1)
        image += BigInt(records[288 * column + row]) *
          BigInt(raw[301 * unit + column]);
      if (image !== 0n) fail("compact unit left the exact relation kernel");
    }

  // Exact principal-generator norms provide the remaining infinite sign.
  // The trivial divisor already proves absolute norm one, so no enormous
  // algebraic unit needs to be expanded merely to certify its norm.
  const signs = [];
  for (let column = 0; column < 301; column += 1) {
    const norm = determinant4(generators.slice(4 * column, 4 * column + 4), tensor);
    if (norm === 0n) fail("compact principal generator is zero");
    signs.push(norm < 0n ? -1n : 1n);
  }
  const norms = [];
  for (let unit = 0; unit < 2; unit += 1) {
    let sign = 1n;
    for (let column = 0; column < 301; column += 1)
      if (signs[column] < 0n && (BigInt(raw[301 * unit + column]) & 1n) !== 0n)
        sign = -sign;
    if (sign !== 1n) fail("compact unit norm changed");
    norms.push("1");
  }
  return {
    relationKernel: true, transformComposition: true, exactFactorback: true,
    principalIdealOne: true, normOne: true, logLattice: true,
    sourceRelationOwnerSha256: digest(relation.sha256, "compact relation owner"),
    columns: norms.map((norm, column) => ({ column, norm,
      representation: "authenticated-principal-generator-product" })),
    factorDeterminant: String(BigInt(factor[0]) * BigInt(factor[3]) -
      BigInt(factor[1]) * BigInt(factor[2])),
  };
}

function composeUnit(full15, c5, c6, factorbackSource = null, factorback = null,
  relation = null) {
  const full = validateFull15(full15);
  identity(c5.value, C5_SCHEMA, "C5 owner");
  identity(c6.value, C6_SCHEMA, "C6 owner");
  if (c5.value.fullTerminalOwnerSha256 !== full15.sha256 ||
      c6.value.c5OwnerSha256 !== c5.sha256)
    fail("unit owner ancestry changed");
  const c3OwnerSha256 = digest(c5.value.c3OwnerSha256, "C5 C3 owner");
  const acceptedC4OwnerSha256 = digest(c5.value.acceptedC4OwnerSha256,
    "C5 accepted C4 owner");
  const precision = Number(integer(c5.value.precision, "C5 precision"));
  const generation = Number(integer(c5.value.generation, "C5 generation"));
  if (precision < 64 || precision % 64 !== 0 || generation < 1)
    fail("C5 precision or generation changed");
  if (Number(integer(c6.value.precision, "C6 precision")) !== precision ||
      Number(integer(c6.value.generation, "C6 generation")) !== generation)
    fail("C5/C6 precision generation changed");
  const state = integers(c5.value.state, 15, "C5 state");
  const acceptanceState = integers(c5.value.acceptanceState, 4,
    "C5 acceptance state");
  const c3Hash = integers(c5.value.c3Hash, 4, "C5 C3 hash");
  const c3Latches = integers(c5.value.c3Latches, 2, "C5 C3 latches");
  if (c3Hash.join(",") !== digestWords(c3OwnerSha256).join(","))
    fail("C5 C3 digest latch changed");
  if (state[0] !== "0" || state[1] !== String(precision) || state[2] !== "3" ||
      state[3] !== "0" || state[4] !== "0" || state[5] !== "0" ||
      state[6] !== "0" || !["-1", "1"].includes(state[7]) ||
      !["-1", "1"].includes(state[8]) || state[9] !== "1" ||
      state.slice(10).join(",") !== "301,13,2,2,15")
    fail("C5 did not publish an accepted rank-two lattice");
  if (acceptanceState[0] !== "0" || BigInt(acceptanceState[1]) < 1n ||
      acceptanceState[2] !== String(precision) || acceptanceState[3] !== "1")
    fail("C5 analytic acceptance is not terminal");
  const raw = integers(c5.value.rawUnitTransform, 602, "C5 raw unit transform");
  const factor = integers(c5.value.getfuFactor, 4, "C5 getfu factor");
  const determinant = BigInt(factor[0]) * BigInt(factor[3]) -
    BigInt(factor[1]) * BigInt(factor[2]);
  if (determinant !== 1n && determinant !== -1n || determinant !== BigInt(state[8]))
    fail("C5 factor determinant changed");
  const c6State = integers(c6.value.state, 12, "C6 state");
  digest(c6.value.embeddingOwnerSha256, "C6 embedding owner");
  digest(c6.value.candidateSha256, "C6 candidate owner");
  const requiredCoefficients = precision > 768 ? "16385" : "512";
  if (c6State[1] !== String(precision) || c6State[2] !== String(generation) ||
      c6State[5] !== String(determinant) || c6State[6] !== requiredCoefficients ||
      c6State[7] !== "301") fail("C6 terminal protocol changed");
  const status = c6.value.status;
  if (status === "not_given") {
    if (factorbackSource !== null || factorback !== null)
      fail("not_given must not claim factorback evidence");
    if (c6.value.reason !== "LARGE" && c6.value.reason !== "PRECI")
      fail("unknown C6 not_given reason");
    const expectedStatus = c6.value.reason === "LARGE" ? "2" : "3";
    if (c6State[0] !== expectedStatus || c6State[3] !== "0" ||
        c6State[4] !== "0" || c6State[10] !== "0" || c6State[11] !== "0")
      fail("C6 not_given state changed");
    if (c6.value.reason === "LARGE" &&
        (c6State[8] !== "0" || c6State[9] !== "0"))
      fail("C6 LARGE diagnostic state changed");
    if (c6.value.reason === "PRECI" &&
        (BigInt(c6State[8]) < 0n ||
         (c6State[8] !== "0" && c6State[9] !== "0")))
      fail("C6 PRECI diagnostic state changed");
    for (const key of ["units", "logsReal", "logsImag", "adjustedFactor", "adjustedWraw"])
      if (!Array.isArray(c6.value[key]) || c6.value[key].length !== 0)
        fail(`C6 not_given exposed ${key}`);
    if (c6.value.reason !== "PRECI")
      fail("LARGE does not retain an authenticated compact unit result");
    if (relation === null) fail("PRECI compact units require relation authority");
    const compactProof = compactUnitProof(full, c5, relation, raw, factor);
    return {
      schema: UNIT_SCHEMA, field: FIELD, runIdentity: RUN,
      accepted: false, compactAccepted: true, status: "not_given", reason: c6.value.reason,
      precision, generation, packedA: full.packedA,
      c3Hash, c3Latches, acceptanceState,
      units: [], factoredTransformShape: [301, 2], factoredTransform: raw,
      finalTransformShape: [13, 2], finalTransform:
        integers(c5.value.finalTransform, 26, "C5 final transform"),
      getfuFactorShape: [2, 2], getfuFactor: factor, norms: ["1", "1"],
      ancestry: { full15OwnerSha256: full15.sha256, c5OwnerSha256: c5.sha256,
        c6OwnerSha256: c6.sha256,
        c3OwnerSha256, acceptedC4OwnerSha256,
        embeddingOwnerSha256: c6.value.embeddingOwnerSha256,
        candidateSha256: c6.value.candidateSha256,
        relationOwnerSha256: relation.sha256,
        factorbackSourceOwnerSha256: null, factorbackReceiptSha256: null },
      proof: compactProof,
      assumptions: { pari2174Correspondence: true, flagZeroNotGiven: true,
        exactCompactUnitsVerified: true, exactUnitsPublished: false,
        publicCompletion: false },
    };
  }
  if (status !== "success" || c6.value.reason !== null ||
      factorbackSource === null || factorback === null)
    fail("successful C6 requires factorback source and receipt owners");
  identity(factorbackSource.value, FACTORBACK_SOURCE_SCHEMA,
    "factorback source owner");
  identity(factorback.value, FACTORBACK_SCHEMA, "factorback receipt");
  const relationOwnerSha256 = digest(factorbackSource.value.relationOwnerSha256,
    "factorback source relation owner");
  if (factorbackSource.value.c5OwnerSha256 !== c5.sha256 ||
      factorbackSource.value.c6OwnerSha256 !== c6.sha256 ||
      factorbackSource.value.embeddingOwnerSha256 !==
        c6.value.embeddingOwnerSha256 ||
      Number(integer(factorbackSource.value.precision,
        "factorback source precision")) !== precision ||
      Number(integer(factorbackSource.value.generation,
        "factorback source generation")) !== generation ||
      factorback.value.sourceOwnerSha256 !== factorbackSource.sha256 ||
      factorback.value.c5OwnerSha256 !== c5.sha256 ||
      factorback.value.c6OwnerSha256 !== c6.sha256 ||
      factorback.value.embeddingOwnerSha256 !==
        factorbackSource.value.embeddingOwnerSha256 ||
      factorback.value.relationOwnerSha256 !== relationOwnerSha256 ||
      Number(integer(factorback.value.precision, "factorback precision")) !== precision ||
      Number(integer(factorback.value.generation, "factorback generation")) !== generation)
    fail("factorback ancestry changed");
  const verified = object(factorback.value.verified, "factorback verification");
  for (const key of ["relationKernel", "exactFactorback", "principalIdealOne",
    "torsionPlusMinusOne", "normAndInverse", "logLattice"])
    if (verified[key] !== true) fail(`factorback ${key} was not verified`);
  const counts = object(factorback.value.counts, "factorback counts");
  if (Number(integer(counts.relations, "factorback relation count")) !== 301 ||
      Number(integer(counts.relationRows, "factorback relation row count")) !== 288 ||
      Number(integer(counts.units, "factorback unit count")) !== 2 ||
      Number(integer(counts.logCells, "factorback log cell count")) !== 42)
    fail("factorback counts changed");
  const mask = Number(integer(c6.value.inverseMask, "C6 inverse mask"));
  if (mask < 0 || mask > 3 || Number(integer(factorback.value.inverseMask,
    "factorback inverse mask")) !== mask) fail("inverse mask changed");
  if (c6State[0] !== "0" || c6State[3] !== "2" ||
      c6State[4] !== String(mask) || c6State[10] !== "1" ||
      c6State[11] !== "602" || c6State[8] !== "0" ||
      BigInt(c6State[9]) >= 0n) fail("C6 success state changed");
  const adjusted = integers(c6.value.adjustedWraw, 602, "C6 adjusted Wraw");
  const adjustedFactor = integers(c6.value.adjustedFactor, 4, "C6 adjusted factor");
  for (let column = 0; column < 2; column += 1) {
    const sign = mask & (1 << column) ? -1n : 1n;
    for (let row = 0; row < 301; row += 1)
      if (BigInt(adjusted[301 * column + row]) !== sign * BigInt(raw[301 * column + row]))
        fail("C5/C6 Wraw sign correspondence changed");
    for (let row = 0; row < 2; row += 1)
      if (BigInt(adjustedFactor[2 * column + row]) !== sign * BigInt(factor[2 * column + row]))
        fail("C5/C6 factor sign correspondence changed");
  }
  const columns = factorback.value.columns;
  if (!Array.isArray(columns) || columns.length !== 2) fail("factorback column count changed");
  const norms = integers(c6.value.unitNorms, 2, "C6 unit norms");
  const materialized = integers(c6.value.units, 8, "C6 materialized units");
  const units = columns.map((entry, column) => {
    entry = object(entry, `factorback column ${column}`);
    if (Number(integer(entry.column, `factorback column ${column} index`)) !== column ||
        entry.inverseChosen !== Boolean(mask & (1 << column)) ||
        ![-1, 1].includes(Number(integer(entry.torsionSign, "torsion sign"))) ||
        integer(entry.factorbackNorm, "factorback norm") !== norms[column] ||
        integer(entry.materializedNorm, "materialized norm") !== norms[column])
      fail("factorback column correspondence changed");
    return { column, powerBasis: materialized.slice(4 * column, 4 * column + 4),
      norm: norms[column], inverseChosen: entry.inverseChosen,
      torsionSign: Number(entry.torsionSign), exactFactorback: true };
  });
  return {
    schema: UNIT_SCHEMA, field: FIELD, runIdentity: RUN,
    accepted: true, status: "success", reason: null, precision, generation,
    packedA: full.packedA, c3Hash, c3Latches, acceptanceState,
    units, factoredTransformShape: [301, 2],
    factoredTransform: adjusted, adjustedFactorShape: [2, 2],
    adjustedFactor, norms,
    ancestry: { full15OwnerSha256: full15.sha256, c5OwnerSha256: c5.sha256,
      c6OwnerSha256: c6.sha256,
      c3OwnerSha256, acceptedC4OwnerSha256,
      embeddingOwnerSha256: c6.value.embeddingOwnerSha256,
      candidateSha256: c6.value.candidateSha256,
      relationOwnerSha256,
      factorbackSourceOwnerSha256: factorbackSource.sha256,
      factorbackReceiptSha256: factorback.sha256 },
    proof: { ...verified, inverseMask: mask,
      sourceOwnerSha256: factorbackSource.sha256,
      sourceC6OwnerSha256: factorback.value.c6OwnerSha256,
      sourceEmbeddingOwnerSha256: factorback.value.embeddingOwnerSha256,
      sourceRelationOwnerSha256: factorback.value.relationOwnerSha256,
      columns: columns.map((entry) => ({ ...entry })) },
    assumptions: { pari2174Correspondence: true, exactFactorbackVerified: true,
      signInverseMaterializationVerified: true, publicCompletion: false },
  };
}

function composeLive(full15, relation, classOwner) {
  const full = validateFull15(full15);
  identity(relation.value, RELATION_SCHEMA, "relation authority");
  identity(classOwner.value, CLASS_SCHEMA, "class authority");
  for (const source of [relation.value, classOwner.value]) {
    if (source.residentAuthoritySha256 !== RESIDENT_AUTHORITY_SHA256 ||
        source.liveClassJoinSha256 !== LIVE_CLASS_JOIN_SHA256)
      fail("terminal serializer source identity changed");
  }
  const rawOwnerSha256 = digest(full15.value.rawOwnerSha256, "full15 raw owner");
  const protocolOwnerSha256 = digest(full15.value.protocolOwnerSha256,
    "full15 protocol owner");
  if (full15.value.authorityOwnerSha256 !== RESIDENT_AUTHORITY_SHA256 ||
      protocolOwnerSha256 !== PROTOCOL_SHA256 ||
      classOwner.value.fullTerminalOwnerSha256 !== full15.sha256 ||
      classOwner.value.relationAuthoritySha256 !== relation.sha256 ||
      classOwner.value.rawOwnerSha256 !== rawOwnerSha256 ||
      classOwner.value.protocolOwnerSha256 !== protocolOwnerSha256)
    fail("live owner ancestry changed");
  equal(integers(relation.value.shape, 2, "relation shape"), ["288", "301"],
    "relation shape");
  if (integer(relation.value.degree, "relation degree") !== "4" ||
      relation.value.exactOwnersAreAuthority !== true ||
      relation.value.principalGeneratorsAreExact !== true)
    fail("relation owner lacks exact authority");
  const exact = object(relation.value.exactOwners, "relation exact owners");
  const records = integers(exact.relationRecords, 288 * 301, "relation records");
  const generators = integers(exact.principalGenerators, 4 * 301,
    "principal generators");
  integers(exact.packetIdeals, 288 * 16, "packet ideals");
  integers(exact.packetNorms, 288, "packet norms");
  integers(exact.packetIds, 288, "packet ids");
  const metadata = integers(exact.relationMetadata, 903, "relation metadata");
  const outerPermutation = integers(exact.outerPermutation, 288,
    "relation outer permutation");
  integers(exact.basisTable, 64, "relation basis table");
  const relationReplay = object(relation.value.replay, "relation replay");
  let nonzero = 0; let maximumSupport = 0;
  for (let column = 0; column < 301; column += 1) {
    let support = 0;
    for (let row = 0; row < 288; row += 1)
      if (records[288 * column + row] !== "0") { support += 1; nonzero += 1; }
    if (support > maximumSupport) maximumSupport = support;
  }
  if (relationReplay.principalRelationsExact !== true ||
      integer(relationReplay.relations, "replayed relations") !== "301" ||
      integer(relationReplay.factorBaseSize, "replayed factor base") !== "288" ||
      Number(integer(relationReplay.nonzeroRelationEntries,
        "nonzero relation entries")) !== nonzero ||
      Number(integer(relationReplay.maximumRelationSupport,
        "maximum relation support")) !== maximumSupport)
    fail("relation replay changed");
  equal(integers(relationReplay.selectedPermutationPrefix, 2,
    "relation selected prefix"), outerPermutation.slice(0, 2),
  "relation selected prefix");
  if (digest(relationReplay.relationRecordsSha256, "relation records digest") !==
        arrayDigest(records) ||
      digest(relationReplay.principalGeneratorsSha256,
        "principal generators digest") !== arrayDigest(generators) ||
      digest(relationReplay.relationMetadataSha256, "relation metadata digest") !==
        arrayDigest(metadata)) fail("relation replay digest changed");
  const relationAssumptions = object(relation.value.assumptions,
    "relation assumptions");
  if (relationAssumptions.pari2174Correspondence !== true ||
      relationAssumptions.upstreamBoundsAssumed !== true ||
      relationAssumptions.publicCompletion !== false)
    fail("relation assumptions changed");

  if (Number(integer(classOwner.value.precision, "class precision")) !== 153088 ||
      Number(integer(full15.value.targetBits, "full15 target bits")) !== 153088)
    fail("class precision changed");
  const W = integers(classOwner.value.W, 4, "class W");
  const packedC = integers(classOwner.value.packedC, 42, "class packed C");
  equal(W, full.W, "class/full15 W"); equal(packedC, full.packedC,
    "class/full15 packed C");
  const B = integers(classOwner.value.B, 572, "terminal B");
  const definition = object(classOwner.value.BDefinition, "terminal B definition");
  if (definition.layout !== "column-major 2x286 reduced trailing block" ||
      definition.equation !==
        "C_B[j] = g_perm[2+j] + sum_i B[i,j]*g_perm[i]" ||
      digest(definition.checkpointSha256, "terminal B checkpoint") !== arrayDigest(B))
    fail("terminal B definition changed");
  const invariants = integers(classOwner.value.invariants, 2, "class invariants");
  equal(invariants, [W[0], W[3]], "class invariant diagonal");
  if (BigInt(integer(classOwner.value.classNumber, "class number")) !==
      BigInt(invariants[0]) * BigInt(invariants[1])) fail("class number changed");
  const retained = object(classOwner.value.retainedWitness, "retained class witness");
  const lengths = { indices: 2, primes: 2, generators: 8, antiuniformizers: 8,
    tau: 32, order: 4, m1: 4, offsets: 3, kinds: 2, numerators: 2,
    denominators: 2, exponents: 2, generatorIdeals: 32, generatedIdeals: 32,
    relationExponents: 4, invariants: 2, classNumber: 1, state: 12,
    uir: 4, computedM1: 4 };
  const witness = {};
  for (const [name, length] of Object.entries(lengths))
    witness[name] = integers(retained[name], length, `retained ${name}`);
  equal(witness.indices, outerPermutation.slice(0, 2), "relation/class packet prefix");
  equal(witness.invariants, invariants, "retained invariants");
  equal(witness.classNumber, [classOwner.value.classNumber], "retained class number");
  equal(witness.order, witness.relationExponents, "retained relation exponents");
  equal(witness.m1, witness.uir, "retained Uir");
  equal(witness.m1, witness.computedM1, "retained computed M1");
  if (witness.state[0] !== "0") fail("retained class state changed");
  const descriptors = classOwner.value.Vbase;
  if (!Array.isArray(descriptors) || descriptors.length !== 2)
    fail("class descriptor count changed");
  const Vbase = descriptors.map((value, index) => {
    const entry = object(value, `Vbase[${index}]`);
    const descriptor = { packetIndex: integer(entry.packetIndex,
      `Vbase[${index}].packetIndex`), prime: integer(entry.prime,
      `Vbase[${index}].prime`), generator: integers(entry.generator, 4,
      `Vbase[${index}].generator`), antiuniformizer: integers(entry.antiuniformizer,
      4, `Vbase[${index}].antiuniformizer`), tau: integers(entry.tau, 16,
      `Vbase[${index}].tau`) };
    if (descriptor.packetIndex !== witness.indices[index] ||
        descriptor.prime !== witness.primes[index]) fail("Vbase identity changed");
    equal(descriptor.generator, witness.generators.slice(4 * index, 4 * index + 4),
      "Vbase generator");
    equal(descriptor.antiuniformizer,
      witness.antiuniformizers.slice(4 * index, 4 * index + 4),
      "Vbase antiuniformizer");
    equal(descriptor.tau, witness.tau.slice(16 * index, 16 * index + 16),
      "Vbase tau");
    return descriptor;
  });
  const transform = integers(full15.value.transform, 301 * 15, "full15 transform");
  const factorback = classOwner.value.orderPrincipalFactorback;
  if (!Array.isArray(factorback) || factorback.length !== 2)
    fail("order principal factorback changed");
  for (let index = 0; index < 2; index += 1) {
    const entry = object(factorback[index], `order factorback[${index}]`);
    if (integer(entry.packetIndex, "order packet index") !== witness.indices[index] ||
        integer(entry.packetExponent, "order packet exponent") !== invariants[index])
      fail("order factorback identity changed");
    equal(integers(entry.relationExponents, 301, "order relation exponents"),
      transform.slice((13 + index) * 301, (14 + index) * 301),
      "order principal factorback");
  }
  const classReplay = object(classOwner.value.replay, "class replay");
  for (const name of ["smithExact", "descriptorReplay", "principalFactorsExact",
    "terminalBExact", "selectedIdealsExact", "orderPrincipalIdealsExact"])
    if (classReplay[name] !== true) fail(`class ${name} was not verified`);
  if (classReplay.wholePermutationCompared !== false) fail("class replay scope changed");
  equal(integers(classReplay.selectedPermutationPrefix, 2, "class selected prefix"),
    witness.indices, "class selected prefix");
  const classAssumptions = object(classOwner.value.assumptions, "class assumptions");
  if (classAssumptions.pari2174Correspondence !== true ||
      classAssumptions.upstreamBoundsAssumed !== true ||
      classAssumptions.publicCompletion !== false)
    fail("class assumptions changed");
  const principals = [];
  for (let column = 0; column < 301; column += 1) principals.push({
    relation: column, divisor: records.slice(288 * column, 288 * (column + 1)),
    exactFactor: { powerBasis: generators.slice(4 * column, 4 * (column + 1)),
      source: "authenticated-principal-generator" },
  });
  return { schema: LIVE_SCHEMA, field: FIELD, runIdentity: RUN, precision: 153088,
    W, packedC, B, Vbase, relationRecords: records, relationPrincipals: principals,
    torsion: { order: "2", generator: ["-1", "0", "0", "0"],
      proof: "mixed-signature characteristic-zero field has a real embedding" },
    ancestry: { full15OwnerSha256: full15.sha256,
      relationAuthoritySha256: relation.sha256, classAuthoritySha256: classOwner.sha256,
      residentAuthoritySha256: RESIDENT_AUTHORITY_SHA256,
      liveClassJoinSha256: LIVE_CLASS_JOIN_SHA256, rawOwnerSha256,
      protocolOwnerSha256 },
    proof: { relationReplay: { ...relationReplay }, classReplay: { ...classReplay },
      BDefinition: { ...definition }, retainedWitness: witness,
      orderPrincipalFactorback: factorback.map((entry) => ({ ...entry })) },
    assumptions: { pari2174Correspondence: true, upstreamBoundsAssumed: true,
      exactRelationAuthority: true, exactClassReplay: true,
      authenticatedTerminalSerializers: true,
      torsionDerivedFromRealEmbedding: true, publicCompletion: false } };
}

function publish(payload, outputDirectory, prefix) {
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`);
  const digestValue = sha(bytes);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory, `${prefix}-${digestValue}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 ||
        sha(fs.readFileSync(destination)) !== digestValue)
      fail("existing published owner changed");
  } else {
    const temporary = path.join(outputDirectory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: payload.schema, path: destination, sha256: digestValue,
    bytes: bytes.length, status: payload.status ?? "success" };
}

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  return result;
}
function requireKeys(options, required, optional = []) {
  const admitted = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(options, key)) ||
      Object.keys(options).some((key) => !admitted.has(key)))
    fail(`required arguments are ${required.map((key) => `--${key}`).join(", ")}`);
}

function main(argv = process.argv) {
  const options = argumentsOf(argv);
  if (options.operation === "unit") {
    const required = ["operation", "full15", "full15-sha256", "c5", "c5-sha256",
      "c6", "c6-sha256", "output-dir"];
    requireKeys(options, required, ["factorback-source", "factorback-source-sha256",
      "factorback", "factorback-sha256", "relation", "relation-sha256"]);
    const factorbackKeys = ["factorback-source", "factorback-source-sha256",
      "factorback", "factorback-sha256"];
    const factorbackCount = factorbackKeys.filter((key) => Object.hasOwn(options, key)).length;
    if (factorbackCount !== 0 && factorbackCount !== factorbackKeys.length)
      fail("factorback source, receipt, and both digests must appear together");
    const full15 = openOwner(options.full15, options["full15-sha256"], "full15 owner");
    const c5 = openOwner(options.c5, options["c5-sha256"], "C5 owner");
    const c6 = openOwner(options.c6, options["c6-sha256"], "C6 owner");
    const factorbackSource = options["factorback-source"]
      ? openOwner(options["factorback-source"], options["factorback-source-sha256"],
        "factorback source owner") : null;
    const factorback = options.factorback
      ? openOwner(options.factorback, options["factorback-sha256"], "factorback receipt") : null;
    if (Boolean(options.relation) !== Boolean(options["relation-sha256"]))
      fail("relation and its digest must appear together");
    const relation = options.relation
      ? openOwner(options.relation, options["relation-sha256"], "relation authority") : null;
    return publish(composeUnit(full15, c5, c6, factorbackSource, factorback, relation),
      options["output-dir"],
      "field3-c5-c6-unit-owner");
  }
  if (options.operation === "live") {
    const required = ["operation", "full15", "full15-sha256", "relation",
      "relation-sha256", "class", "class-sha256", "output-dir"];
    requireKeys(options, required);
    const full15 = openOwner(options.full15, options["full15-sha256"], "full15 owner");
    const relation = openOwner(options.relation, options["relation-sha256"],
      "relation authority");
    const classOwner = openOwner(options.class, options["class-sha256"],
      "class authority");
    return publish(composeLive(full15, relation, classOwner), options["output-dir"],
      "field3-live-final-owner");
  }
  fail("--operation must be unit or live");
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(main())}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { CLASS_SCHEMA, FACTORBACK_SCHEMA, FACTORBACK_SOURCE_SCHEMA,
  LIVE_SCHEMA, RELATION_SCHEMA,
  TerminalOwnerFailure, UNIT_SCHEMA, composeLive, composeUnit, main, openOwner,
  publish };
