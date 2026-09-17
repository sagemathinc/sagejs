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
const FACTORBACK_SCHEMA = "sagejs.pari-class-group/field3-c6-factorback-receipt-v1";
const UNIT_SCHEMA = "sagejs.pari-class-group/field3-c5-c6-unit-owner-v1";
const RELATION_SCHEMA = "sagejs.pari-class-group/field3-full-owner-authority-v1";
const CLASS_SCHEMA = "sagejs.pari-class-group/field3-live-class-suffix-owner-v1";
const LIVE_SCHEMA = "sagejs.pari-class-group/field3-live-final-owner-v1";
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
    packedA: integers(owner.value.packedA, 273, "full15 packed A"),
    W: integers(owner.value.terminalH, 4, "full15 terminal H"),
    packedC: integers(owner.value.packedCe, 42, "full15 packed Ce"),
  };
}

function composeUnit(full15, c5, c6, factorback = null) {
  const full = validateFull15(full15);
  identity(c5.value, C5_SCHEMA, "C5 owner");
  identity(c6.value, C6_SCHEMA, "C6 owner");
  if (c5.value.fullTerminalOwnerSha256 !== full15.sha256 ||
      c6.value.c5OwnerSha256 !== c5.sha256)
    fail("unit owner ancestry changed");
  const precision = Number(integer(c5.value.precision, "C5 precision"));
  const generation = Number(integer(c5.value.generation, "C5 generation"));
  if (Number(integer(c6.value.precision, "C6 precision")) !== precision ||
      Number(integer(c6.value.generation, "C6 generation")) !== generation)
    fail("C5/C6 precision generation changed");
  const state = integers(c5.value.state, 15, "C5 state");
  if (state[0] !== "0" || state[2] !== "3" || state[9] !== "1" ||
      state.slice(10).join(",") !== "301,13,2,2,15")
    fail("C5 did not publish an accepted rank-two lattice");
  const raw = integers(c5.value.rawUnitTransform, 602, "C5 raw unit transform");
  const factor = integers(c5.value.getfuFactor, 4, "C5 getfu factor");
  const status = c6.value.status;
  if (status === "not_given") {
    if (factorback !== null) fail("not_given must not claim factorback evidence");
    if (c6.value.reason !== "LARGE" && c6.value.reason !== "PRECI")
      fail("unknown C6 not_given reason");
    for (const key of ["units", "logsReal", "logsImag", "adjustedFactor", "adjustedWraw"])
      if (!Array.isArray(c6.value[key]) || c6.value[key].length !== 0)
        fail(`C6 not_given exposed ${key}`);
    return {
      schema: UNIT_SCHEMA, field: FIELD, runIdentity: RUN,
      accepted: false, status: "not_given", reason: c6.value.reason,
      precision, generation, packedA: full.packedA,
      units: [], factoredTransform: [], norms: [],
      ancestry: { full15OwnerSha256: full15.sha256, c5OwnerSha256: c5.sha256,
        c6OwnerSha256: c6.sha256, factorbackReceiptSha256: null },
      assumptions: { pari2174Correspondence: true, flagZeroNotGiven: true,
        exactUnitsPublished: false },
    };
  }
  if (status !== "success" || c6.value.reason !== null || factorback === null)
    fail("successful C6 requires an exact factorback receipt");
  identity(factorback.value, FACTORBACK_SCHEMA, "factorback receipt");
  if (factorback.value.c5OwnerSha256 !== c5.sha256 ||
      factorback.value.c6OwnerSha256 !== c6.sha256 ||
      Number(integer(factorback.value.precision, "factorback precision")) !== precision ||
      Number(integer(factorback.value.generation, "factorback generation")) !== generation)
    fail("factorback ancestry changed");
  const verified = object(factorback.value.verified, "factorback verification");
  for (const key of ["relationKernel", "exactFactorback", "principalIdealOne",
    "torsionPlusMinusOne", "normAndInverse", "logLattice"])
    if (verified[key] !== true) fail(`factorback ${key} was not verified`);
  const mask = Number(integer(c6.value.inverseMask, "C6 inverse mask"));
  if (mask < 0 || mask > 3 || Number(integer(factorback.value.inverseMask,
    "factorback inverse mask")) !== mask) fail("inverse mask changed");
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
        integer(entry.materializedNorm, "materialized norm") !== norms[column])
      fail("factorback column correspondence changed");
    return { column, powerBasis: materialized.slice(4 * column, 4 * column + 4),
      norm: norms[column], inverseChosen: entry.inverseChosen,
      torsionSign: Number(entry.torsionSign), exactFactorback: true };
  });
  return {
    schema: UNIT_SCHEMA, field: FIELD, runIdentity: RUN,
    accepted: true, status: "success", reason: null, precision, generation,
    packedA: full.packedA, units, factoredTransformShape: [301, 2],
    factoredTransform: adjusted, adjustedFactorShape: [2, 2],
    adjustedFactor, norms,
    ancestry: { full15OwnerSha256: full15.sha256, c5OwnerSha256: c5.sha256,
      c6OwnerSha256: c6.sha256, factorbackReceiptSha256: factorback.sha256 },
    assumptions: { pari2174Correspondence: true, exactFactorbackVerified: true,
      signInverseMaterializationVerified: true, publicCompletion: false },
  };
}

function composeLive(full15, relation, classOwner) {
  const full = validateFull15(full15);
  identity(relation.value, RELATION_SCHEMA, "relation authority");
  identity(classOwner.value, CLASS_SCHEMA, "class authority");
  if (classOwner.value.fullTerminalOwnerSha256 !== full15.sha256 ||
      classOwner.value.relationAuthoritySha256 !== relation.sha256)
    fail("live owner ancestry changed");
  const exact = object(relation.value.exactOwners, "relation exact owners");
  const records = integers(exact.relationRecords, 288 * 301, "relation records");
  const generators = integers(exact.principalGenerators, 4 * 301,
    "principal generators");
  if (relation.value.exactOwnersAreAuthority !== true ||
      relation.value.principalGeneratorsAreExact !== true)
    fail("relation owner lacks exact authority");
  const B = integers(classOwner.value.B, 572, "terminal B");
  equal(integers(classOwner.value.W, 4, "class W"), full.W, "class/full15 W");
  equal(integers(classOwner.value.packedC, 42, "class packed C"), full.packedC,
    "class/full15 packed C");
  const replay = object(classOwner.value.replay, "class replay");
  for (const key of ["smithExact", "descriptorReplay", "principalFactorsExact"])
    if (replay[key] !== true) fail(`class ${key} was not verified`);
  equal(integers(classOwner.value.invariants, 2, "class invariants"),
    integers(classOwner.value.W, 4, "class W").filter((_, index) => index % 3 === 0),
    "class invariant diagonal");
  const descriptors = classOwner.value.Vbase;
  if (!Array.isArray(descriptors) || descriptors.length !== 2)
    fail("class descriptor count changed");
  const Vbase = descriptors.map((entry, index) => {
    entry = object(entry, `Vbase[${index}]`);
    const prime = integer(entry.prime, `Vbase[${index}].prime`);
    if (BigInt(prime) <= 1n) fail("class descriptor prime changed");
    return { packetIndex: integer(entry.packetIndex, `Vbase[${index}].packetIndex`),
      prime, tau: integers(entry.tau, 16, `Vbase[${index}].tau`) };
  });
  const principals = [];
  for (let column = 0; column < 301; column += 1) principals.push({
    relation: column,
    divisor: records.slice(288 * column, 288 * (column + 1)),
    exactFactor: { powerBasis: generators.slice(4 * column, 4 * (column + 1)),
      source: "authenticated-principal-generator" },
  });
  const precision = Number(integer(classOwner.value.precision, "class precision"));
  if (precision < 64 || precision % 64 !== 0) fail("class precision changed");
  return {
    schema: LIVE_SCHEMA, field: FIELD, runIdentity: RUN, precision,
    W: full.W, packedC: full.packedC, B, Vbase,
    relationRecords: records, relationPrincipals: principals,
    torsion: { order: "2", generator: ["-1", "0", "0", "0"],
      proof: "mixed-signature characteristic-zero field has a real embedding" },
    ancestry: { full15OwnerSha256: full15.sha256,
      relationAuthoritySha256: relation.sha256, classAuthoritySha256: classOwner.sha256 },
    assumptions: { pari2174Correspondence: true, exactRelationAuthority: true,
      exactClassReplay: true, torsionDerivedFromRealEmbedding: true,
      publicCompletion: false },
  };
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
    requireKeys(options, required, ["factorback", "factorback-sha256"]);
    if (Object.hasOwn(options, "factorback") !== Object.hasOwn(options, "factorback-sha256"))
      fail("factorback path and digest must appear together");
    const full15 = openOwner(options.full15, options["full15-sha256"], "full15 owner");
    const c5 = openOwner(options.c5, options["c5-sha256"], "C5 owner");
    const c6 = openOwner(options.c6, options["c6-sha256"], "C6 owner");
    const factorback = options.factorback
      ? openOwner(options.factorback, options["factorback-sha256"], "factorback receipt") : null;
    return publish(composeUnit(full15, c5, c6, factorback), options["output-dir"],
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

module.exports = { CLASS_SCHEMA, FACTORBACK_SCHEMA, LIVE_SCHEMA, RELATION_SCHEMA,
  TerminalOwnerFailure, UNIT_SCHEMA, composeLive, composeUnit, main, openOwner,
  publish };
