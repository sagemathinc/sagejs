#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const zlib = require("node:zlib");

const SCHEMA = "sagejs.pari-class-group/row14-initial-capsule-v1";
const W0_SCHEMA = "sagejs.pari-class-group/development-default-driver-trace-v1";
const W0_SHA256 = "13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a";
const FIELD_ID = "generated-sha256-e1d4643ab62bde9546d63340545e5302c2cef517222d569e634fb5e2093f6413";
const W0_BYTES = 96_797_505;
const ROWS = 799;
const INITIAL_RELATIONS = 42;
const LIVE_TARGET = 806;
const RECORD_RESERVE = 8_110;
const CAPACITY_SCALAR_CELLS = 7_207_387;
const SIGNED_WORD_BYTES = 8;
const FOUR_GIB = 4 * 1024 * 1024 * 1024;

// `jq --stream` never constructs W0. Only these three event subtrees and the
// prepared boundary are reconstructed. Event indices are authenticated source
// positions, not a search for a convenient terminal event.
const STREAM_FILTER = String.raw`
def selected_path:
  if length != 2 then empty
  elif .[0][0] == "schema" then .[0][0] = "w0Schema"
  elif .[0][0] == "field" or .[0][0] == "prepared" then .
  elif .[0][0] == "events" and .[0][1] == 2
    then .[0] = (["factorBase"] + .[0][2:])
  elif .[0][0] == "events" and .[0][1] == 3 and .[0][2] != "basis"
    then .[0] = (["initialized"] + .[0][2:])
  elif .[0][0] == "events" and .[0][1] == 6
    then .[0] = (["initialSearch"] + .[0][2:])
  else empty end;
reduce (inputs | selected_path) as $item ({};
  setpath($item[0]; $item[1])
) | .factorBase.embeddingPermutation.values = []`;

function fail(message) { throw new Error(`row-14 initial capsule: ${message}`); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) { return JSON.stringify(value); }

function argumentsOf(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || i + 1 >= argv.length) fail("invalid arguments");
    const key = argv[i].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[i + 1];
  }
  const required = ["pristine-w0", "pristine-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(key => `--${key}`).join(", ")}`);
  return result;
}

function decimal(value, label, minimum = undefined) {
  if (typeof value !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value))
    fail(`${label} is not a canonical integer`);
  const integer = BigInt(value);
  if (minimum !== undefined && integer < BigInt(minimum)) fail(`${label} is too small`);
  return integer;
}

function vector(value, kind, length, label) {
  if (!value || value.kind !== kind || !Array.isArray(value.values) || value.values.length !== length)
    fail(`${label} has the wrong shape`);
  return value.values;
}

function typedInteger(value, label) {
  if (!value || value.kind !== "integer") fail(`${label} is not an integer descriptor`);
  return decimal(value.value, label);
}

function integerLeaves(value, output, label) {
  if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value)) {
    output.push(decimal(value, label));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => integerLeaves(item, output, `${label}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    if (value.kind === "real") return;
    for (const [key, item] of Object.entries(value)) integerLeaves(item, output, `${label}.${key}`);
  }
}

function compactRelation(record, index) {
  if (!record || Object.keys(record).sort().join(",") !== "R,automorphism,m,nz,origin")
    fail(`initial relation ${index} keys changed`);
  const row = vector(record.R, "small-vector", ROWS, `initial relation ${index} row`);
  const entries = [];
  for (let column = 0; column < row.length; column++) {
    const value = decimal(row[column], `initial relation ${index} row ${column}`);
    if (value !== 0n) entries.push([column, value.toString()]);
  }
  if (entries.length === 0 || entries[0][0] + 1 !== record.nz)
    fail(`initial relation ${index} nz changed`);
  return {
    entries,
    sourceNz: record.nz,
    multiplier: typedInteger(record.m, `initial relation ${index} multiplier`).toString(),
    origin: record.origin,
    automorphism: record.automorphism,
  };
}

function validateSelected(selected, sourceSha256, sourceBytes) {
  if (selected.w0Schema !== W0_SCHEMA || selected.field?.id !== FIELD_ID ||
      selected.field.degree !== 4 || selected.field.signature?.join(",") !== "2,1" ||
      selected.prepared?.event !== "prepared" || selected.prepared.degree !== 4 ||
      selected.prepared.signature?.join(",") !== "2,1" || selected.prepared.precision !== 192)
    fail("prepared field identity changed");
  const factor = selected.factorBase;
  if (factor?.event !== "factor_base" || factor.attempt !== 1 || factor.precision !== 192 ||
      factor.KC !== ROWS || factor.KCZ !== 487 || factor.KCZ2 !== 487 ||
      factor.C1 !== 5978 || factor.C2 !== 5978 || factor.subfactorCount !== 4)
    fail("factor-base schedule changed");
  const descriptors = vector(factor.LP, "vector", ROWS, "factor-base descriptors");
  vector(factor.FB, "small-vector", factor.KCZ, "factor-base rational primes");
  vector(factor.perm, "small-vector", ROWS, "factor-base permutation");
  vector(factor.subfactor, "small-vector", factor.subfactorCount, "factor-base subfactor");
  if (!Array.isArray(factor.rng) || factor.rng.length !== 66) fail("factor-base RNG changed");
  const initial = selected.initialized;
  if (initial?.event !== "initialized" || initial.relations !== INITIAL_RELATIONS ||
      initial.target !== LIVE_TARGET || initial.need !== LIVE_TARGET - INITIAL_RELATIONS ||
      initial.Nrelid !== 4 || initial.missing !== 757 ||
      !Array.isArray(initial.relationRecords) || initial.relationRecords.length !== INITIAL_RELATIONS ||
      !Array.isArray(initial.rng) || initial.rng.length !== 66)
    fail("initial relation schedule changed");
  const search = selected.initialSearch;
  if (search?.event !== "small_norm_before" || search.j !== 0 ||
      search.relations !== INITIAL_RELATIONS || search.target !== LIVE_TARGET ||
      !Array.isArray(search.rng) || search.rng.length !== 66)
    fail("initial live search schedule changed");
  vector(search.search, "small-vector", ROWS, "initial search ideals");
  vector(search.perm, "small-vector", ROWS, "initial search permutation");
  vector(search.subfactor, "small-vector", 4, "initial search subfactor");
  if (canonical(search.perm) !== canonical(factor.perm) ||
      canonical(search.subfactor) !== canonical(factor.subfactor) ||
      canonical(search.rng) !== canonical(initial.rng))
    fail("source schedule continuity changed");

  const relations = initial.relationRecords.map(compactRelation);
  const signed = [];
  integerLeaves(descriptors, signed, "factorBase.descriptors");
  integerLeaves(relations, signed, "initialRelations");
  integerLeaves(factor.FB, signed, "factorBase.rationalPrimes");
  integerLeaves(factor.perm, signed, "factorBase.permutation");
  integerLeaves(factor.subfactor, signed, "factorBase.subfactor");
  integerLeaves(search.search, signed, "sourceSchedule.search");
  const min = signed.reduce((a, b) => a < b ? a : b);
  const max = signed.reduce((a, b) => a > b ? a : b);
  if (min < -(1n << 63n) || max >= (1n << 63n)) fail("signed-word payload exceeds int64");
  const rng = [...factor.rng, ...initial.rng, ...search.rng].map((value, index) =>
    decimal(value, `RNG word ${index}`, 0));
  if (rng.some(value => value >= (1n << 64n))) fail("RNG payload exceeds uint64");

  const packedDriverBytes = CAPACITY_SCALAR_CELLS * SIGNED_WORD_BYTES;
  if (packedDriverBytes + sourceBytes >= FOUR_GIB) fail("resource contract exceeds 4 GiB");
  const sourceMetadata = {
    factorBase: {
      attempt: factor.attempt, precision: factor.precision, C1: factor.C1, C2: factor.C2,
      rows: factor.KC, primeCount: factor.KCZ, primeSquareCount: factor.KCZ2,
      subfactorCount: factor.subfactorCount, ballvol: factor.ballvol,
      rationalPrimes: factor.FB, permutation: factor.perm, subfactor: factor.subfactor,
      embeddingPermutation: factor.embeddingPermutation, rng: factor.rng,
    },
    initialization: {
      relations: initial.relations, target: initial.target, need: initial.need,
      Nrelid: initial.Nrelid, missing: initial.missing, rng: initial.rng,
    },
    firstSearch: {
      pass: search.j, relations: search.relations, target: search.target,
      search: search.search, permutation: search.perm, subfactor: search.subfactor,
      rng: search.rng,
    },
  };
  const sections = { prepared: selected.prepared, factorBaseDescriptors: descriptors,
    initialRelations: relations, sourceSchedule: sourceMetadata };
  const sectionSha256 = Object.fromEntries(Object.entries(sections).map(
    ([key, value]) => [key, sha(Buffer.from(canonical(value)))]));
  return {
    schema: SCHEMA,
    ancestry: { pristineW0Sha256: sourceSha256, pristineW0Bytes: sourceBytes,
      selectedEventIndices: { factorBase: 2, initialized: 3, initialSearch: 6 }, sectionSha256 },
    field: selected.field,
    ...sections,
    capacityEvidence: {
      descriptorCount: descriptors.length, initialRelationCount: relations.length,
      initialDenseCellsAvoided: ROWS * INITIAL_RELATIONS,
      signedIntegerLeaves: signed.length, signedMinimum: min.toString(), signedMaximum: max.toString(),
      signedWordBits: 64, signedWordFit: true, rngWordBits: 64, rngWordFit: true,
      liveTarget: LIVE_TARGET, recordReserve: RECORD_RESERVE,
      ownerScalarCells: CAPACITY_SCALAR_CELLS, packedOwnerBytes: packedDriverBytes,
      sourceAndPackedOwnerBytes: sourceBytes + packedDriverBytes,
      addressSpaceCeilingBytes: FOUR_GIB, sourceParseCoResidentWithNativeRoot: false,
    },
    exclusions: ["post-initial relation candidates", "post-initial relation snapshots",
      "HNF matrices and transforms", "class-group and class-number answers",
      "regulator and unit answers", "acceptance and terminal events"],
  };
}

async function streamSelected(file, expectedSha256) {
  if (expectedSha256 !== W0_SHA256) fail("pristine W0 digest is not the frozen row-14 digest");
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size !== W0_BYTES) fail("pristine W0 size changed");
  const child = spawn("jq", ["-nc", "--stream", STREAM_FILTER],
    { stdio: ["pipe", "pipe", "pipe"] });
  const digest = crypto.createHash("sha256");
  const chunks = [], errors = [];
  let outputBytes = 0;
  child.stdout.on("data", chunk => {
    outputBytes += chunk.length;
    if (outputBytes > 64 * 1024 * 1024) child.kill("SIGKILL");
    else chunks.push(chunk);
  });
  child.stderr.on("data", chunk => errors.push(chunk));
  const source = fs.createReadStream(file, { highWaterMark: 1024 * 1024 });
  source.on("data", chunk => digest.update(chunk));
  source.pipe(child.stdin);
  const [code] = await Promise.all([
    new Promise((resolve, reject) => child.on("error", reject).on("close", resolve)),
    new Promise((resolve, reject) => source.on("error", reject).on("close", resolve)),
  ]);
  if (code !== 0) fail(`stream selector failed: ${Buffer.concat(errors).toString().trim()}`);
  const actual = digest.digest("hex");
  if (actual !== expectedSha256) fail("pristine W0 digest changed");
  return { selected: JSON.parse(Buffer.concat(chunks)), sourceBytes: stat.size, sourceSha256: actual,
    selectedBytes: outputBytes };
}

function atomicPublish(directory, capsule) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(capsule)}\n`);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const digest = sha(compressed);
  const destination = path.join(directory, `row14-initial-${digest}.json.gz`);
  if (fs.existsSync(destination)) {
    if (sha(fs.readFileSync(destination)) !== digest || (fs.statSync(destination).mode & 0o777) !== 0o444)
      fail("existing capsule changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, compressed, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { schema: SCHEMA, path: destination, sha256: digest,
    compressedBytes: compressed.length, uncompressedBytes: plain.length };
}

async function main() {
  const options = argumentsOf(process.argv);
  const streamed = await streamSelected(options["pristine-w0"], options["pristine-sha256"]);
  const capsule = validateSelected(streamed.selected, streamed.sourceSha256, streamed.sourceBytes);
  process.stdout.write(`${canonical({ ...atomicPublish(options["output-dir"], capsule),
    selectedBytes: streamed.selectedBytes })}\n`);
}

if (require.main === module) main().catch(error => {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
});

module.exports = { CAPACITY_SCALAR_CELLS, FIELD_ID, FOUR_GIB, INITIAL_RELATIONS,
  LIVE_TARGET, RECORD_RESERVE, ROWS, SCHEMA, STREAM_FILTER, W0_BYTES, W0_SHA256,
  atomicPublish, compactRelation, streamSelected, validateSelected };
