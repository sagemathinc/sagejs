"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const semantic = require("./row6_prepared_semantic_authority.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row6_rank2_c5_c6.py");
const SCHEMA = "sagejs.pari-class-group/row6-rank2-c5-c6-v1";
const sha = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceSha = () => crypto.createHash("sha256").update(fs.readFileSync(SOURCE)).digest("hex");

function verifyOwner(owner, ancestry) {
  if (owner?.schema !== SCHEMA || owner.precision !== 192 || owner.status !== "not_given" ||
      owner.reason !== "LARGE" || owner.materialization !== "not_given(LARGE)" ||
      owner.exactUnitsPublished !== false || owner.compactFactoredUnitsRetained !== true ||
      owner.correspondenceComplete !== true || owner.provenance?.frozenW0RuntimeInput !== false) {
    throw new Error("invalid row-6 C5/C6 owner");
  }
  if (JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry)) throw new Error("row-6 unit ancestry changed");
  if (owner.compact?.unitTransformShape?.join() !== "7,2" || owner.compact.unitTransform.length !== 14 ||
      owner.compact?.getfuFactorShape?.join() !== "2,2" || owner.compact.getfuFactor.length !== 4 ||
      owner.c6State?.[0] !== 2) throw new Error("invalid row-6 compact unit evidence");
  return true;
}

function composeInMemory(gate, post, metadata, ancestryEvidence = {}) {
  const metadataValue = metadata.metadata || metadata;
  const ancestry = {
    ...ancestryEvidence,
    gateOwnerSha256: semantic.semanticSha256(gate),
    gateContentSha256: post.gateOwnerSha256,
    metadataSha256: sha(metadataValue), sourceSha256: sourceSha(),
  };
  const program = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(1000000);sys.path.extend(['src/lib','src/baselib']);x=json.load(sys.stdin)
m=importlib.import_module('bench.pari-class-group-port.row6_rank2_c5_c6')
json.dump(m.compose_row6_rank2_c5_c6(x['gate'],x['post'],x['metadata'],x['ancestry']),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296", "--cpu=600", "--", "python3", "-c", program],
    { cwd: ROOT, input: JSON.stringify({ gate, post, metadata, ancestry }), encoding: "utf8",
      timeout: 600_000, maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error((run.stderr || run.stdout || `Python exited ${run.status}`).trim());
  const owner = JSON.parse(run.stdout); verifyOwner(owner, ancestry);
  return { owner, ownerSha256: sha(owner), ancestry };
}

module.exports = { SCHEMA, composeInMemory, verifyOwner };
