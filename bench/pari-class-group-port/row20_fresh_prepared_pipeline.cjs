"use strict";

// One same-invocation mathematical pipeline from authenticated row-20
// prepared data through exact relation closure, units and neutral publication.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const factorCoordinator = require("./row20_fresh_factor_base_coordinator.cjs");
const hnfHost = require("./row20_fresh_first_hnf_host.cjs");
const acceptanceHost = require("./row20_fresh_acceptance_host.cjs");
const closureCoordinator = require("./row20_c7_closure_coordinator.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROOT = path.resolve(__dirname, "../..");
const UNIT_SOURCE = path.join(__dirname, "row20_fresh_units.py");
const CLOSURE_SOURCE = path.join(__dirname, "row20_fresh_closure.py");
const HNF_SOURCE = path.join(__dirname, "row20_connected_relation_hnf.py");
const ACCEPTANCE_SOURCE = path.join(__dirname, "row20_fresh_acceptance_host.cjs");
const REPLAY_SCHEMA =
  "sagejs.pari-class-group/row20-fresh-correspondence-replay-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const values = (owner, length = owner.length) =>
  (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);

function runFreshClosure(input) {
  const program = String.raw`
import importlib,json,sys
sys.path.append(${JSON.stringify(path.join(ROOT, "src/lib"))})
u=importlib.import_module('bench.pari-class-group-port.row20_fresh_units')
c=importlib.import_module('bench.pari-class-group-port.row20_fresh_closure')
x=json.load(sys.stdin)
units=u.compose_fresh_row20_units([int(v) for v in x['live']['compactLogs']],[int(v) for v in x['acceptance']['lattice']],[int(v) for v in x['acceptance']['regulator']],x['prepared'])
out=c.compose_fresh_row20_closure(x['prepared'],x['factor'],x['live'],x['acceptance'],units,x['ancestry'])
json.dump({'evidence':out,'units':units},sys.stdout,separators=(',',':'))
`;
  const run = spawnSync("python3", ["-c", program], {
    cwd: ROOT,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function publishNeutral(evidence, ancestry) {
  closureCoordinator.verifyEvidence(evidence, ancestry);
  const payload = closureCoordinator.payloadFromEvidence(evidence);
  payload.source.replaySchema = REPLAY_SCHEMA;
  const raw = neutral.sealClassUnitCorrespondenceResult(payload);
  const envelopeSha256 = neutral.sha256Bytes(raw);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical(ancestry);
  const trustedPayload = JSON.parse(neutral.canonical(payload).toString("ascii"));
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256,
    mathematicalAuthoritySha256,
    replaySchema: REPLAY_SCHEMA,
    replay(candidate) {
      assert(neutral.canonical(candidate).equals(neutral.canonical(trustedPayload)),
        "row-20 neutral payload detached from same-run exact closure");
      return {
        correspondence_complete: true,
        fieldId: "5.1.1000000.1",
        mathematicalAuthoritySha256,
        payloadSha256: neutral.sha256Canonical(candidate),
        public_complete: false,
        schema: REPLAY_SCHEMA,
      };
    },
  });
  const result = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult);
  return { mathematicalAuthoritySha256, raw, result };
}

async function runSameInvocation(prepared, directory) {
  const factor = await factorCoordinator.run({
    outputDirectory: path.join(directory, "factor"),
    prepared,
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
  });
  const hnf = await hnfHost.runFirstHnf(prepared, factor.owner);
  assert.equal(hnf.status, 0, "row-20 connected HNF did not complete");
  const acceptance = await acceptanceHost.runAcceptance(prepared, hnf);
  assert.equal(acceptance.status, 0, "row-20 regulator acceptance did not complete");
  assert.equal(acceptance.classNumber, "1");

  const live = {
    relationRecords: values(hnf.values.relation_records, 7 * 14),
    principalGenerators: values(hnf.values.generators, 5 * 14),
    rawLogs: values(hnf.values.log_embeddings, 3 * 7 * 14),
    compactLogs: values(hnf.values.hnf_result_c, 3 * 7 * 14),
  };
  const accepted = { lattice: acceptance.lattice, regulator: acceptance.regulator };
  const ancestry = {
    acceptanceSourceSha256: sha(fs.readFileSync(ACCEPTANCE_SOURCE)),
    closureSourceSha256: sha(fs.readFileSync(CLOSURE_SOURCE)),
    factorOwnerSha256: factor.ownerSha256,
    freshInputSha256: neutral.sha256Canonical(prepared),
    hnfCoreSha256: sha(fs.readFileSync(hnf.built.coreSourcePath)),
    hnfSourceSha256: sha(fs.readFileSync(HNF_SOURCE)),
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
    unitSourceSha256: sha(fs.readFileSync(UNIT_SOURCE)),
  };
  const completed = runFreshClosure({ acceptance: accepted, ancestry,
    factor: factor.owner, live, prepared });
  const closureAncestry = completed.evidence.ancestry;
  assert.equal(closureAncestry.pristineW0Sha256, ancestry.freshInputSha256,
    "legacy C7 ancestry slot is not rooted in fresh prepared input");
  const terminal = publishNeutral(completed.evidence, closureAncestry);
  return {
    ancestry: closureAncestry,
    evidence: completed.evidence,
    mathematicalAuthoritySha256: terminal.mathematicalAuthoritySha256,
    raw: terminal.raw,
    result: terminal.result,
    summary: {
      classNumber: completed.evidence.proof.classNumber,
      exactUnitCount: completed.units.exactUnitProofs.length,
      factorOwnerSha256: factor.ownerSha256,
      hnfState: completed.evidence.proof.hnfState,
      invariantFactors: completed.evidence.proof.invariants,
      torsionOrder: completed.evidence.torsion.order,
      unitCoordinates: completed.evidence.units.coordinates,
    },
  };
}

module.exports = { REPLAY_SCHEMA, publishNeutral, runFreshClosure,
  runSameInvocation };
