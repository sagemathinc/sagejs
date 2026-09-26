"use strict";

// Same-run row-23 mathematical pipeline. All intermediate publications live
// in a caller-owned private temporary directory and are only file adapters for
// the existing immutable final composer; none is accepted from the caller.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
const hnfHost = require("./row23_first_hnf_host.cjs");
const acceptanceHost = require("./row23_acceptance_host.cjs");
const finalInputs = require("./row23_final_inputs_coordinator.cjs");
const classCoordinator = require("./row23_class_group_witness_coordinator.cjs");
const correspondenceCoordinator =
  require("./row23_degree5_correspondence_coordinator.cjs");
const bridgeHost = require("./row23_live_rank4_unit_host.cjs");
const unitHost = require("./row23_live_unit_owner.cjs");
const unitCoordinator = require("./row23_live_unit_owner_coordinator.cjs");
const adapter = require("./row23_terminal_neutral_adapter.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROOT = path.resolve(__dirname, "../..");
const CLASS_SOURCE = path.join(__dirname, "row23_class_group_witness.py");
const RELATION_SOURCE = path.join(__dirname, "row23_connected_relation_hnf.py");
const FINAL_SOURCE = path.join(__dirname, "row23_final_result.py");
const REPLAY_SCHEMA =
  "sagejs.pari-class-group/row23-neutral-publication-replay-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const arraySha = values => sha(Buffer.from(values.map(String).join("\n")));
const strings = (owner, length = owner.length) =>
  (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
const numbers = (owner, length = owner.length) =>
  strings(owner, length).map(Number);

function publishPrepared(prepared, directory) {
  const raw = Buffer.from(`${JSON.stringify(prepared)}\n`);
  const destination = path.join(directory, "prepared.json");
  fs.writeFileSync(destination, raw, { flag: "wx", mode: 0o400 });
  return destination;
}

function classInputs(live, factor) {
  const relationMatrix = strings(live.values.hnf_original, 31 * 40);
  assert.deepEqual(relationMatrix,
    strings(live.values.relation_records, 31 * 40),
    "row-23 HNF input detached from same-run relations");
  const principalGenerators = strings(live.values.generators, 5 * 40);
  const cleanupTransform = strings(live.values.hnf_transform, 40 * 40);
  const hnfTransform = strings(live.values.hnf_hnf_transform, 13 * 13);
  const terminalH = strings(live.values.hnf_result_h, 1);
  const terminalB = strings(live.values.hnf_result_b, 30);
  const terminalPermutation = strings(live.values.hnf_perm, 31);
  const ideal = factor.owner.factorBase.ideals[0].map(String);
  const ancestry = {
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
    factorOwnerSha256: factor.ownerSha256,
    relationMatrixSha256: arraySha(relationMatrix),
    principalGeneratorsSha256: arraySha(principalGenerators),
    cleanupTransformSha256: arraySha(cleanupTransform),
    hnfTransformSha256: arraySha(hnfTransform),
    hnfResultSha256: arraySha(terminalH),
    hnfTailSha256: arraySha(terminalB),
    terminalPermutationSha256: arraySha(terminalPermutation),
    selectedIdealSha256: arraySha(ideal),
    relationRootSourceSha256: sha(fs.readFileSync(RELATION_SOURCE)),
    relationRootCoreSha256: sha(fs.readFileSync(live.built.coreSourcePath)),
    composerSourceSha256: sha(fs.readFileSync(CLASS_SOURCE)),
  };
  return {
    ancestry,
    projection: {
      dimensions: { degree: 5, factorRows: 31, relations: 40,
        assemblyRows: 4, assemblyColumns: 13 },
      states: { relation: live.relationState.map(Number), chain: live.chainState,
        hnf: live.hnfState,
        assembly: numbers(live.values.hnf_assembly_state, 6),
        final: numbers(live.values.hnf_final_state, 7),
        diagonal: numbers(live.values.hnf_diagonal, 4) },
      factor: {
        selectedDescriptor: factor.owner.factorBase.descriptors[0].map(String),
        selectedIdealHnf: ideal,
        norm: String(factor.owner.factorBase.norms[0]),
      },
      relations: { matrix: relationMatrix, principalGenerators },
      hnf: { cleanupTransform, hnfTransform,
        fullH: strings(live.values.hnf_full_h, 4 * 13), W: terminalH,
        B: terminalB, terminalPermutation },
    },
  };
}

function pythonFinal(preparedPath, publications, correspondenceOwner, unitOwner) {
  const correspondenceContentSha256 =
    neutral.sha256Canonical(correspondenceOwner);
  const unitContentSha256 = neutral.sha256Canonical(unitOwner);
  const program = String.raw`
import base64,importlib,json,sys
m=importlib.import_module("bench.pari-class-group-port.row23_final_result")
c=m.FreshRow23CorrespondenceAuthority(expected_owner_sha256=sys.argv[8],expected_content_sha256=sys.argv[9])
u=m.FreshRow23UnitAuthority(expected_owner_sha256=sys.argv[10],expected_content_sha256=sys.argv[11])
p=m.build_row23_payload(*sys.argv[1:8],correspondence_authority=c,unit_authority=u)
r=m.AtomicRow23Publisher(m.Row23ReplayAuthority(correspondence_authority=c,unit_authority=u)).publish(p)
print(json.dumps({"raw":base64.b64encode(r.canonical_json).decode("ascii"),"sha256":r.sha256},separators=(",",":")))
`;
  const run = spawnSync("python3", ["-c", program, preparedPath,
    publications.factor.path, publications.relation.path,
    publications.acceptance.path, publications.classWitness.path,
    publications.correspondence.path, publications.units.path,
    publications.correspondence.ownerSha256, correspondenceContentSha256,
    publications.units.contentSha256, unitContentSha256], {
    cwd: ROOT, encoding: "utf8", timeout: 120_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const parsed = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  const raw = Buffer.from(parsed.raw, "base64");
  assert.equal(sha(raw), parsed.sha256);
  return { raw, sha256: parsed.sha256,
    correspondenceAuthority: {
      ownerSha256: publications.correspondence.ownerSha256,
      contentSha256: correspondenceContentSha256,
    },
    unitAuthority: {
      ownerSha256: publications.units.contentSha256,
      contentSha256: unitContentSha256,
    } };
}

function pythonColdReplay(raw, expectedSha256, mathematicalAuthoritySha256,
  correspondenceAuthority, unitAuthority) {
  const program = String.raw`
import importlib,json,sys
m=importlib.import_module("bench.pari-class-group-port.row23_final_result")
raw=sys.stdin.buffer.read()
c=m.FreshRow23CorrespondenceAuthority(expected_owner_sha256=sys.argv[4],expected_content_sha256=sys.argv[5])
u=m.FreshRow23UnitAuthority(expected_owner_sha256=sys.argv[6],expected_content_sha256=sys.argv[7])
r=m.cold_replay_row23(raw,m.Row23ReplayAuthority(expected_sha256=sys.argv[1],correspondence_authority=c,unit_authority=u))
p=r.detached_payload()
print(json.dumps({"schema":sys.argv[2],"sourceSha256":r.sha256,"sourcePayloadSha256":json.loads(raw)["payloadSha256"],"mathematicalAuthoritySha256":sys.argv[3],"fieldId":"5.5.1002836007889.1","classNumber":p["classGroup"]["classNumber"],"invariantFactors":p["classGroup"]["invariantFactors"],"unitCount":p["units"]["fundamental"]["freeRank"],"correspondenceComplete":p["terminal"]["correspondenceComplete"],"publicComplete":p["terminal"]["publicComplete"]},sort_keys=True,separators=(",",":")))
`;
  const run = spawnSync("python3", ["-c", program, expectedSha256,
    adapter.SOURCE_REPLAY_SCHEMA, mathematicalAuthoritySha256,
    correspondenceAuthority.ownerSha256,
    correspondenceAuthority.contentSha256,
    unitAuthority.ownerSha256, unitAuthority.contentSha256], {
    cwd: ROOT, input: raw, encoding: "utf8", timeout: 120_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
}

function neutralResult(sourceRaw, correspondenceAuthority, unitAuthority) {
  const sourceSha256 = neutral.sha256Bytes(sourceRaw);
  const sourceEnvelope = JSON.parse(sourceRaw.toString("ascii"));
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    coldReplayImplementation: "row23_final_result.cold_replay_row23",
    sourcePayloadSha256: sourceEnvelope.payloadSha256,
    sourceSchema: adapter.SOURCE_SCHEMA,
    sourceSha256,
  });
  const sourceAuthority = adapter.createDetachedRow23SourceAuthority({
    mathematicalAuthoritySha256,
    replay: candidate => pythonColdReplay(candidate, sourceSha256,
      mathematicalAuthoritySha256, correspondenceAuthority, unitAuthority),
    sourceSha256,
  });
  const prepared = adapter.prepareRow23NeutralResult(sourceRaw, sourceAuthority, {
    publicationReplaySchema: REPLAY_SCHEMA,
  });
  const sealed = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const trustedPayload = JSON.parse(sealed.toString("ascii")).payload;
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: prepared.envelopeSha256,
    mathematicalAuthoritySha256,
    replay(payload) {
      assert(neutral.canonical(payload).equals(neutral.canonical(trustedPayload)),
        "neutral replay payload detached from same-run final source");
      return {
        correspondence_complete: true,
        fieldId: adapter.FIELD_ID,
        mathematicalAuthoritySha256,
        payloadSha256: neutral.sha256Canonical(payload),
        public_complete: false,
        schema: REPLAY_SCHEMA,
      };
    },
    replaySchema: REPLAY_SCHEMA,
  });
  const result = adapter.publishPreparedRow23NeutralResult(prepared, authority);
  assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult);
  return { mathematicalAuthoritySha256, prepared, result, sealed };
}

async function runSameInvocation(prepared, directory) {
  const preparedPath = publishPrepared(prepared, directory);
  const factor = await factorCoordinator.run({ prepared,
    preparedAuthoritySha256: factorCoordinator.PREPARED_SHA256,
    outputDirectory: path.join(directory, "factor") });
  assert.equal(factor.ownerSha256, classCoordinator.FACTOR_SHA256);

  const live = await hnfHost.runFirstHnf(prepared, factor.owner);
  assert.equal(live.status, 0, "row-23 first HNF did not complete");
  const relationOwner = finalInputs.relationProjection(live, factor.ownerSha256);
  const relation = finalInputs.publish(relationOwner,
    path.join(directory, "relation"), "row23-live-relation-hnf");

  const accepted = await acceptanceHost.runAcceptance(prepared, live);
  assert.equal(accepted.status, 0, "row-23 acceptance did not complete");
  const acceptanceOwner = finalInputs.acceptanceProjection(
    accepted, relation.ownerSha256);
  const acceptance = finalInputs.publish(acceptanceOwner,
    path.join(directory, "acceptance"), "row23-live-acceptance");

  const classInput = classInputs(live, factor);
  const classOwner = classCoordinator.compose(
    classInput.projection, classInput.ancestry);
  classCoordinator.verifyOwner(classOwner, classInput.ancestry);
  const classWitness = classCoordinator.publish(classOwner,
    path.join(directory, "class"));

  const correspondenceAncestry = {
    ...classOwner.ancestry,
    classWitnessOwnerSha256: classWitness.ownerSha256,
    composerSourceSha256: sha(fs.readFileSync(
      path.join(__dirname, "row23_degree5_correspondence.py"))),
  };
  // Deliberately call compose, never run: run opens W0 after publication.
  const correspondenceOwner = correspondenceCoordinator.compose(
    classOwner, factor.owner, {
      multiplicationTensor: prepared.basis_table.map(String),
      roundedEmbedding: prepared.preparation_rounded_embedding.map(String),
    }, correspondenceAncestry);
  correspondenceCoordinator.verifyOwner(correspondenceOwner);
  const correspondence = correspondenceCoordinator.publish(correspondenceOwner,
    path.join(directory, "correspondence"));

  const bridge = await bridgeHost.runLiveRank4UnitBridge(live, accepted);
  assert.equal(bridge.status, 0, "row-23 rank-four bridge did not complete");
  const liveUnits = await unitHost.runLiveUnitOwner(prepared, bridge);
  assert.equal(liveUnits.status, 0, "row-23 exact units did not complete");
  const unitOwner = unitCoordinator.compose({ prepared, factor,
    acceptance: accepted, bridge, units: liveUnits });
  const units = unitCoordinator.publish(unitOwner, path.join(directory, "units"));

  const final = pythonFinal(preparedPath, { factor, relation, acceptance,
    classWitness, correspondence, units }, correspondenceOwner, unitOwner);
  const terminal = neutralResult(final.raw, final.correspondenceAuthority,
    final.unitAuthority);
  return {
    final,
    neutral: terminal,
    summary: {
      acceptanceOwnerSha256: acceptance.ownerSha256,
      classWitnessOwnerSha256: classWitness.ownerSha256,
      correspondenceOwnerSha256: correspondence.ownerSha256,
      factorOwnerSha256: factor.ownerSha256,
      relationOwnerSha256: relation.ownerSha256,
      unitOwnerSha256: units.contentSha256,
    },
  };
}

module.exports = { runSameInvocation };
