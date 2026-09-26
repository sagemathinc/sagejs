#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row14_rank2_c5_c6.py");
const SCHEMA = "sagejs.pari-class-group/row14-rank2-c5-c6-v1";
const ACCEPTED_SHA256 = "9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65";
const METADATA_SHA256 = "cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class Row14Rank2Failure extends Error {}
function fail(message) { throw new Row14Rank2Failure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function jsonSha(value) { return sha(Buffer.from(JSON.stringify(value))); }
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}
function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  const required = ["accepted-owner", "post806-output", "metadata", "output-dir"];
  if (Object.keys(values).sort().join() !== required.sort().join()) fail("required arguments are missing");
  return values;
}
function authenticateInputs(options) {
  const compressed = fs.readFileSync(options["accepted-owner"]);
  const plain = zlib.gunzipSync(compressed);
  if (sha(plain) !== ACCEPTED_SHA256) fail("accepted owner identity changed");
  const postBytes = fs.readFileSync(options["post806-output"]);
  const post = JSON.parse(postBytes);
  const unitRelations = integers(post.unitRelations, 14, "post806 unit relations");
  if (post.ownerSha256 !== ACCEPTED_SHA256 || post.metadataSha256 !== METADATA_SHA256 ||
      post.status !== 0 || post.unitRelationsSha256 !==
        "ac3b40e1d95edee9b8af61f2689a32a937945ed43b2a6112ec97f0783497aef8" ||
      sha(Buffer.from(JSON.stringify(unitRelations))) !== post.unitRelationsSha256)
    fail("post806 output identity changed");
  const metadataBytes = fs.readFileSync(options.metadata);
  const metadata = JSON.parse(metadataBytes);
  if (metadata.metadataSha256 !== METADATA_SHA256 ||
      sha(Buffer.from(JSON.stringify(metadata.metadata))) !== METADATA_SHA256)
    fail("factor metadata identity changed");
  const postArithmetic = { ownerSha256: post.ownerSha256, metadataSha256: post.metadataSha256,
    regulator: post.regulator, unitRelations, unitRelationsSha256: post.unitRelationsSha256,
    terminalState: post.terminalState };
  return { plain, postBytes, metadataBytes, postArithmetic };
}
function verifyOwner(owner, ancestry = null) {
  if (!owner || owner.schema !== SCHEMA || owner.precision !== 192 ||
      owner.status !== "not_given" || owner.reason !== "LARGE" ||
      owner.materialization !== "not_given(LARGE)" || owner.matchedFlagZero !== true ||
      owner.exactUnitsPublished !== false || owner.compactFactoredUnitsRetained !== false ||
      owner.correspondenceComplete !== false || owner.c6State?.join(",") !== "2,38,0,0,0,0,0,1" ||
      owner.provenance?.frozenW0RuntimeInput !== false ||
      owner.provenance?.postcomputeDifferentialOnly !== true) fail("invalid row-14 LARGE owner");
  if (ancestry && JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry)) fail("unit ancestry changed");
  if (owner.ancestry?.acceptedOwnerSha256 !== ACCEPTED_SHA256 ||
      owner.ancestry?.metadataSha256 !== METADATA_SHA256 ||
      !DIGEST.test(owner.ancestry?.post806ArithmeticSha256 || "") ||
      !DIGEST.test(owner.ancestry?.sourceSha256 || "")) fail("unit ancestry is invalid");
  const compact = owner.compact || {};
  integers(compact.unitTransform, 14, "unit transform");
  integers(compact.archimedeanUnits, 42, "archimedean units");
  integers(compact.getfuFactor, 4, "getfu factor");
  integers(compact.getfuCandidateA, 42, "getfu candidate A");
  integers(compact.relationLattice, 14, "relation lattice");
  integers(compact.regulator, 3, "regulator");
  if (compact.unitTransformShape?.join(",") !== "7,2" ||
      compact.archimedeanUnitShape?.join(",") !== "3,2" ||
      compact.getfuFactorShape?.join(",") !== "2,2" ||
      compact.relationLatticeShape?.join(",") !== "7,2") fail("compact unit shapes changed");
  const expectedDigests = {
    unitTransform: "a165a605ef8bfa6ec975aa6e85fe6e77e2836cd5fff60b5b2625e4e9ca25d498",
    archimedeanUnits: "80a2a3098c77eb45b080477744734a432d7241ec804de217d2bc18583e2fcd10",
    getfuFactor: "2a5884c973c6c339e563b762e0fb1eeb5955ed0922e368e26c0e5e9c8b4be2ba",
    getfuCandidateA: "76cfb2bb392f54cf4cdf529354ea9a08a6f3f8b70a37f04f50fc160a7a2ee2ff",
    relationLattice: "ac3b40e1d95edee9b8af61f2689a32a937945ed43b2a6112ec97f0783497aef8",
    regulator: "7db5f1b09e7d7740498aa0c53a8e6738b8f9da65f000e1b768a24064db2b7db7",
  };
  for (const [name, digest] of Object.entries(expectedDigests))
    if (jsonSha(compact[name]) !== digest) fail(`compact ${name} arithmetic changed`);
  if (JSON.stringify(owner.traceSha256) !== JSON.stringify({
    solved: "c239781a4966f313159d044aff0ac89819825fe1f55af08389e890e29c2d1f8b",
    rounded: "b3aacbaaf6dee82921fd7ce837abbe4ca30e24197dc4fceeeab2e001de049d55",
    candidate_units: "b3aacbaaf6dee82921fd7ce837abbe4ca30e24197dc4fceeeab2e001de049d55",
  })) fail("LARGE arithmetic trace changed");
  return true;
}
function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row14-rank2-c5-c6-${digest}.json`);
  if (fs.existsSync(destination)) {
    if (sha(fs.readFileSync(destination)) !== digest || (fs.statSync(destination).mode & 0o777) !== 0o444)
      fail("existing immutable unit owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, path: destination, sha256: digest, bytes: bytes.length };
}
function main() {
  const options = argumentsOf(process.argv);
  const input = authenticateInputs(options);
  const ancestry = { acceptedOwnerSha256: ACCEPTED_SHA256,
    post806ArithmeticSha256: jsonSha(input.postArithmetic), metadataSha256: METADATA_SHA256,
    sourceSha256: sha(fs.readFileSync(SOURCE)) };
  const program = String.raw`import gzip,hashlib,importlib,json,sys
sys.set_int_max_str_digits(1000000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row14_rank2_c5_c6')
accepted=json.loads(gzip.decompress(open(sys.argv[1],'rb').read()))
post=json.load(open(sys.argv[2]));metadata=json.load(open(sys.argv[3]));ancestry=json.load(sys.stdin)
json.dump(m.compose_row14_rank2_c5_c6(accepted,post,metadata,ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296", "--cpu=600",
    "--", "python3", "-c", program, options["accepted-owner"],
    options["post806-output"], options.metadata], { cwd: ROOT, input: JSON.stringify(ancestry),
    encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = JSON.parse(run.stdout); verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { ACCEPTED_SHA256, METADATA_SHA256, Row14Rank2Failure, SCHEMA,
  authenticateInputs, publish, verifyOwner };
