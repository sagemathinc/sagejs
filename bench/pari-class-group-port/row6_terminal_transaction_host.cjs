"use strict";

// Connected row-6 terminal transaction.  This cut deliberately begins at the
// three authenticated retained owners (prepared projection, factor base, and
// Gate C); it does not claim to rerun relation collection.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const post = require("./row6_post1137_terminal_host.cjs");
const ancestryHost = require("./row6_terminal_class_ancestry.cjs");
const classCoordinator = require("./row6_terminal_class_coordinator.cjs");
const unitCoordinator = require("./row6_rank2_c5_c6_coordinator.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const semantic = require("./row6_prepared_semantic_authority.cjs");

const PREPARED_SHA256 =
  "abfa328710a3d1c2e39b3893e6f6b6cf0214b7da7a101d5360502fe56c8ac58b";
const PREPARED_CANONICAL_SHA256 =
  "abfa328710a3d1c2e39b3893e6f6b6cf0214b7da7a101d5360502fe56c8ac58b";
const GATE_COMPRESSED_SHA256 =
  "526cf175619801919509bdf21d4296a31864876e3d563a3728678e66b80b813d";
const FACTOR_COMPRESSED_SHA256 =
  "7ddf980ce29f730098464684533ca560c91d8465ab242e8d1762f5a4d4f505f6";

const bytesHash = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const hash = (value) => bytesHash(Buffer.from(JSON.stringify(value)));

function validateOwners(prepared, gate, factor) {
  assert.equal(hash(prepared), PREPARED_CANONICAL_SHA256);
  post.validateInputs(gate, factor, prepared);
  semantic.assertFactorAuthority(gate, factor);
  return true;
}

function unitAncestry(ancestry) {
  const packed = ancestry.state.packedLogProvenance;
  return {
    acceptedArch: ancestry.acceptedArch,
    acceptedSigns: ancestry.acceptedSigns,
    phasePi: ancestry.phasePi,
    acceptedArchSha256: packed.acceptedArchSha256,
    acceptedSignsSha256: packed.acceptedSignsSha256,
    phasePiSha256: packed.phasePiSha256,
  };
}

function rejectTerminalMutations(inputs, c7) {
  let rejected = 0;
  const reject = (mutate) => {
    const candidate = structuredClone(inputs);
    mutate(candidate);
    assert.throws(() => c7.prepareRow6C7Result(candidate));
    rejected += 1;
  };
  reject((x) => { x.prepared.data.prep_polynomial[0] = "1"; });
  reject((x) => { x.gate.final.state[0] = 3; });
  reject((x) => { x.factor.factor.packetNorms[0] = "1"; });
  reject((x) => { x.post1137.invariants = ["4"]; });
  reject((x) => { x.ancestry.rawToPresentation[0] = "0"; });
  reject((x) => { x.classOwner.classWitness.classGroup.classNumber = "2"; });
  reject((x) => { x.unitOwner.status = "given"; });
  reject((x) => { x.unitOwner.precision = 256; });
  return rejected;
}

function writeImmutable(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    assert(fs.readFileSync(file).equals(bytes), `immutable collision at ${file}`);
    assert.equal(fs.statSync(file).mode & 0o222, 0, `${file} became mutable`);
    return;
  }
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}`,
  );
  fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
  try {
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o444);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

const stageFile = (directory, name) => path.join(directory, `${name}.json`);
const readStage = (directory, name) =>
  JSON.parse(fs.readFileSync(stageFile(directory, name)));
function writeStage(directory, name, value) {
  fs.writeFileSync(stageFile(directory, name), JSON.stringify(value), {
    flag: "wx", mode: 0o400,
  });
}

async function stageMain(stage, directory) {
  const prepared = readStage(directory, "prepared");
  const gate = readStage(directory, "gate");
  const factor = readStage(directory, "factor");
  validateOwners(prepared, gate, factor);
  if (stage === "post1137") {
    writeStage(directory, "post1137",
      await post.runRow6Post1137TerminalFromOwners(gate, factor, prepared));
  } else if (stage === "ancestry") {
    writeStage(directory, "ancestry",
      await ancestryHost.deriveRow6ColumnAncestry(gate, factor));
  } else if (stage === "class") {
    writeStage(directory, "classOwner", classCoordinator.composeInMemory(
      gate, factor, prepared, readStage(directory, "ancestry")));
  } else if (stage === "units") {
    const ancestry = readStage(directory, "ancestry");
    writeStage(directory, "unitOwner", unitCoordinator.composeInMemory(
      gate,
      readStage(directory, "post1137"),
      prepared,
      unitAncestry(ancestry),
    ).owner);
  } else if (stage === "c7") {
    const c7 = require("./row6_c7_result_composer.cjs");
    writeStage(directory, "composition", c7.prepareRow6C7Result({
      prepared, gate, factor,
      post1137: readStage(directory, "post1137"),
      ancestry: readStage(directory, "ancestry"),
      classOwner: readStage(directory, "classOwner"),
      unitOwner: readStage(directory, "unitOwner"),
    }));
  } else {
    throw new Error(`unknown row-6 transaction stage ${stage}`);
  }
}

function runIsolatedStage(stage, directory) {
  const started = process.hrtime.bigint();
  const run = spawnSync("prlimit", [
    "--as=4294967296", "--rss=4294967296", "--cpu=600", "--",
    process.execPath, "--expose-gc", __filename, "--stage", stage, directory,
  ], {
    encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const stageReceipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  return {
    elapsedNs: String(process.hrtime.bigint() - started),
    maxRssKiB: stageReceipt.maxRssKiB,
  };
}

async function runPreparedComplete(prepared, gate, factor, outputDirectory) {
  validateOwners(prepared, gate, factor);
  const started = process.hrtime.bigint();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-transaction-"));
  fs.chmodSync(directory, 0o700);
  let stageElapsedNs;
  let terminalInputs;
  let composition;
  try {
    writeStage(directory, "prepared", prepared);
    writeStage(directory, "gate", gate);
    writeStage(directory, "factor", factor);
    stageElapsedNs = {
      post1137: runIsolatedStage("post1137", directory),
      ancestry: runIsolatedStage("ancestry", directory),
      classWitnesses: runIsolatedStage("class", directory),
      units: runIsolatedStage("units", directory),
      c7: runIsolatedStage("c7", directory),
    };
    terminalInputs = {
      prepared, gate, factor,
      post1137: readStage(directory, "post1137"),
      ancestry: readStage(directory, "ancestry"),
      classOwner: readStage(directory, "classOwner"),
      unitOwner: readStage(directory, "unitOwner"),
    };
    composition = readStage(directory, "composition");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  const c7 = require("./row6_c7_result_composer.cjs");
  const mutationChecks = rejectTerminalMutations(terminalInputs, c7);
  assert.deepEqual(c7.prepareRow6C7Result(terminalInputs), composition);
  const raw = Buffer.from(composition.sealedEnvelopeHex, "hex");
  const trustedPayload = structuredClone(JSON.parse(raw).payload);
  const replay = (candidate) => {
    assert.deepEqual(candidate, trustedPayload);
    const repeated = c7.prepareRow6C7Result(terminalInputs);
    assert.deepEqual(
      JSON.parse(Buffer.from(repeated.sealedEnvelopeHex, "hex")).payload,
      trustedPayload,
    );
    return {
      correspondence_complete: true,
      fieldId: c7.FIELD_ID,
      mathematicalAuthoritySha256: composition.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate),
      public_complete: false,
      schema: c7.PUBLICATION_REPLAY_SCHEMA,
    };
  };
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw),
    mathematicalAuthoritySha256: composition.mathematicalAuthoritySha256,
    replay,
    replaySchema: c7.PUBLICATION_REPLAY_SCHEMA,
  });
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const publication = publisher.publish(raw, authority);
  assert.equal(publisher.publish(raw, authority), publication);

  const outputPath = path.join(
    outputDirectory,
    `row6-prepared-complete-${composition.sealedEnvelopeSha256}.json`,
  );
  writeImmutable(outputPath, raw);
  const receipt = {
    schema: "sagejs.pari-class-group/row6-prepared-complete-receipt-v1",
    path: outputPath,
    sha256: composition.sealedEnvelopeSha256,
    bytes: raw.length,
    componentOwnerSha256: composition.componentOwnerSha256,
    mathematicalAuthoritySha256: composition.mathematicalAuthoritySha256,
    correspondenceComplete: true,
    publicComplete: false,
    frozenW0RuntimeInput: false,
    retainedOwnersRuntimeInputs: true,
    elapsedNs: String(process.hrtime.bigint() - started),
    stageElapsedNs,
    maxRssKiB: Math.max(
      process.resourceUsage().maxRSS,
      ...Object.values(stageElapsedNs).map((stage) => stage.maxRssKiB),
    ),
    relationState: gate.final.state.map(String),
    classGroup: { invariantFactors: ["2", "2"], classNumber: "4" },
    unitMaterialization: "not_given(LARGE)",
    mutationChecks,
  };
  // Keep the already replay-verified result available to the in-process fresh
  // execution registry without changing the durable JSON receipt.  A copied
  // or deserialized receipt intentionally loses this authority.
  Object.defineProperty(receipt, "verifiedResult", {
    configurable: false,
    enumerable: false,
    value: publication,
    writable: false,
  });
  return receipt;
}

if (require.main === module && process.argv[2] === "--stage") {
  stageMain(process.argv[3], process.argv[4])
    .then(() => process.stdout.write(`${JSON.stringify({
      maxRssKiB: process.resourceUsage().maxRSS,
      stage: process.argv[3],
    })}\n`))
    .catch((error) => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}

module.exports = {
  FACTOR_COMPRESSED_SHA256,
  GATE_COMPRESSED_SHA256,
  PREPARED_CANONICAL_SHA256,
  PREPARED_SHA256,
  runPreparedComplete,
  unitAncestry,
  validateOwners,
};
