#!/usr/bin/env node
"use strict";

// Authenticate one source-transparent native embedding result and publish the
// prepared owner consumed by C6.  The exact prepared basis is trusted input;
// roots and embeddings present in an upstream capsule are deliberately
// ignored, so they cannot become an answer fixture for the native result.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SOURCE_SCHEMA =
  "sagejs.pari-class-group/field3-prepared-embedding-owner-v1";
const CANDIDATE_SCHEMA =
  "sagejs.pari-class-group/field3-native-embedding-candidate-v1";
const RUN = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const POLYNOMIAL = [-2000042n, -2000022n, 0n, 0n, 1n];
const BASIS = [
  37n, 0n, 0n, 0n, 0n, 37n, 0n, 0n,
  0n, -37n, 37n, 0n, -1499998n, -63n, 14n, 1n,
];
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

function fail(message) {
  throw new Error(`field3 C6 embedding owner: ${message}`);
}

function sha(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function strictParse(bytes, label) {
  const parser = String.raw`import json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
value=json.load(sys.stdin,object_pairs_hook=strict)
json.dump(value,sys.stdout,separators=(',',':'))`;
  const parsed = spawnSync("python3", ["-c", parser], {
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

function loadOwner(selected, expected, label) {
  if (!DIGEST.test(expected)) fail(`${label} digest is invalid`);
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
  return value.map((entry) => {
    const text = String(entry);
    if (!INTEGER.test(text) || (typeof entry === "number" && !Number.isSafeInteger(entry)))
      fail(`${label} contains a noncanonical integer`);
    return BigInt(text);
  });
}

function equal(left, right, label) {
  if (left.length !== right.length || left.some((entry, index) => entry !== right[index]))
    fail(`${label} changed`);
}

function exactPrepared(source) {
  if (source.schema !== SOURCE_SCHEMA || source.runIdentity !== RUN)
    fail("wrong exact prepared owner identity");
  const polynomial = integers(source.polynomial, 5, "prepared polynomial");
  const signature = integers(source.signature, 2, "prepared signature");
  const basis = integers(source.zk, 16, "prepared integral basis");
  const tensor = integers(source.tensor, 64, "prepared multiplication tensor");
  equal(polynomial, POLYNOMIAL, "prepared polynomial");
  equal(signature, [2n, 1n], "prepared signature");
  equal(basis, BASIS, "prepared integral basis");
  if (BigInt(source.zkden) !== 37n) fail("prepared basis denominator changed");
  // Multiplication by the first basis element must be the identity.  The
  // remaining 48 tensor entries are bound byte-for-byte by the source hash.
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++)
      if (tensor[4 * column + row] !== (row === column ? 1n : 0n))
        fail("prepared multiplication identity changed");
  return { polynomial, signature, basis, tensor };
}

function validate(sourceOwner, candidateOwner) {
  const source = sourceOwner.value;
  const candidate = candidateOwner.value;
  const exact = exactPrepared(source);
  if (candidate.schema !== CANDIDATE_SCHEMA)
    fail("wrong native embedding candidate schema");
  if (
    candidate.preparedOwnerSha256 !== sourceOwner.sha256 ||
    candidate.runIdentity !== RUN ||
    candidate.requestedBits !== 153088 ||
    candidate.makeMRootPrecisionBits !== 153152 ||
    candidate.makeMTruncation !== false
  ) fail("native embedding candidate ancestry changed");
  const state = integers(candidate.state, 6, "native embedding state");
  equal(state, [0n, 153088n, 153152n, 153664n, 2n, 1n], "native embedding state");
  const roots = integers(candidate.roots, 12, "native roots");
  const embedding = integers(candidate.embedding, 48, "native embedding");
  for (const offset of [0, 3, 6, 9]) {
    const mantissa = roots[offset];
    const precision = roots[offset + 1];
    if (mantissa === 0n || precision !== 153152n || (mantissa < 0n ? -mantissa : mantissa).toString(2).length !== 153152)
      fail("native root is not a normalized 153152-bit real");
  }
  // The first embedding column is exactly one at the two real places and the
  // complex real place, and zero at its imaginary place.
  equal(embedding.slice(0, 3), [1n, -1n, 0n], "first real embedding identity");
  equal(embedding.slice(12, 15), [1n, -1n, 0n], "second real embedding identity");
  equal(embedding.slice(24, 27), [1n, -1n, 0n], "complex real embedding identity");
  equal(embedding.slice(36, 39), [0n, -1n, 0n], "complex imaginary embedding identity");
  return { exact, roots, embedding, state };
}

function atomicPublish(directory, stem, payload) {
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `${stem}-${digest}.json`);
  if (fs.existsSync(destination)) {
    if (sha(fs.readFileSync(destination)) !== digest || (fs.statSync(destination).mode & 0o777) !== 0o444)
      fail("existing published owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      const descriptor = fs.openSync(temporary, "wx", 0o400);
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
      const directoryDescriptor = fs.openSync(directory, "r");
      fs.fsyncSync(directoryDescriptor);
      fs.closeSync(directoryDescriptor);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { path: destination, sha256: digest, bytes: bytes.length };
}

function publishEmbedding(sourceOwner, candidateOwner, outputDirectory) {
  const checked = validate(sourceOwner, candidateOwner);
  const rootRows = [
    [...checked.roots.slice(0, 3), "0", "-1", "0"],
    [...checked.roots.slice(3, 6), "0", "-1", "0"],
    [...checked.roots.slice(6, 12)],
  ].map((row) => row.map(String));
  const payload = {
    schema: SOURCE_SCHEMA,
    runIdentity: RUN,
    preparedOwnerSha256: sourceOwner.sha256,
    nativeCandidateSha256: candidateOwner.sha256,
    polynomial: checked.exact.polynomial.map(String),
    signature: checked.exact.signature.map(String),
    zkden: "37",
    zk: checked.exact.basis.map(String),
    tensor: checked.exact.tensor.map(String),
    requestedBits: 153088,
    makeMRootPrecisionBits: 153152,
    makeMTruncation: false,
    roots: rootRows,
    embedding: checked.embedding.map(String),
    state: checked.state.map(String),
  };
  return { ...atomicPublish(outputDirectory, "field3-prepared-embedding", payload), value: payload };
}

function argumentsFrom(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length)
      fail("invalid arguments");
    result[argv[index].slice(2)] = argv[index + 1];
  }
  const required = ["prepared-owner", "prepared-sha256", "candidate", "candidate-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map((key) => `--${key}`).join(", ")}`);
  return result;
}

function main(argv = process.argv) {
  const options = argumentsFrom(argv);
  const source = loadOwner(options["prepared-owner"], options["prepared-sha256"], "prepared owner");
  const candidate = loadOwner(options.candidate, options["candidate-sha256"], "native embedding candidate");
  const result = publishEmbedding(source, candidate, options["output-dir"]);
  process.stdout.write(`${JSON.stringify({ schema: SOURCE_SCHEMA, path: result.path, sha256: result.sha256, bytes: result.bytes })}\n`);
}

module.exports = {
  CANDIDATE_SCHEMA,
  RUN,
  SOURCE_SCHEMA,
  atomicPublish,
  loadOwner,
  publishEmbedding,
  sha,
  strictParse,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
