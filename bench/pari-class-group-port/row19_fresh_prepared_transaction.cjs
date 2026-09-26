"use strict";

// Prepared-input-only row-19 transaction.  Every intermediate owner is
// created below in a private directory and is destroyed before this call
// returns.  The only durable artifact is the verified neutral envelope.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const firstHost = require("./row19_first_hnf_host.cjs");
const terminalHost = require("./row19_terminal_continuation_host.cjs");
const classApi = require("./row19_class_group_principal_coordinator.cjs");
const compactApi = require("./row19_live_rank1_unit_coordinator.cjs");
const unitApi = require("./row19_live_unit_result_coordinator.cjs");
const finalApi = require("./row19_final_result_coordinator.cjs");
const adapter = require("./row19_class_unit_result_adapter.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROOT = path.resolve(__dirname, "../..");
const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/row19-fresh-prepared-transaction-v1";
const FRESH_RECEIPTS = new WeakSet();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));

function runPython(moduleName, prepared) {
  const program = `import runpy,sys\nsys.path.extend(['src/lib','src/baselib','.'])\n` +
    `runpy.run_module(${JSON.stringify(moduleName)},run_name='__main__')`;
  const run = spawnSync("python3", ["-c", program], { cwd: ROOT,
    input: JSON.stringify(prepared), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function writePrivateOwner(directory, basename, owner) {
  const plain = Buffer.from(`${JSON.stringify(owner)}\n`);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const ownerSha256 = sha(plain), compressedSha256 = sha(compressed);
  const destination = path.join(directory, `${basename}-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256 };
}

async function firstOwner(prepared, prefix, directory) {
  const live = await firstHost.runFirstHnf(prepared, prefix);
  const owner = {
    schema: "sagejs.pari-class-group/row19-first-hnf-owner-v1",
    authority: { preparedAuthoritySha256: prepared.authoritySha256,
      prefixSha256: hash(prefix) },
    relationState: live.collected.values.relation_state.toArray().map(String),
    ...live.exact,
    publication: { firstHnfComplete: true, continuationExecuted: false,
      classGroupConstructed: false, unitsConstructed: false,
      oracleDataConsumed: false },
  };
  return { owner, descriptor: writePrivateOwner(directory, "first-hnf", owner) };
}

async function terminalOwner(prepared, prefix, catalog, first, directory) {
  const live = await terminalHost.runTerminalContinuation(
    prepared, prefix, catalog, first.descriptor);
  const owner = {
    schema: "sagejs.pari-class-group/row19-terminal-continuation-owner-v1",
    authority: { preparedAuthoritySha256: prepared.authoritySha256,
      firstHnfOwnerSha256: live.firstOwnerSha256,
      prefixSha256: hash(prefix), analyticCatalogSha256: hash(catalog) },
    ...live.exact, nextControl: live.nextControl,
    publication: { collectionComplete: true, terminalHnfComplete: true,
      acceptanceComplete: true, classWitnessesComplete: false,
      unitExpansionComplete: false, oracleDataConsumed: false },
  };
  return { owner, descriptor: writePrivateOwner(directory, "terminal", owner) };
}

function writeImmutable(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  try { fs.writeFileSync(filename, bytes, { flag: "wx", mode: 0o400 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(filename), bytes);
  }
  fs.chmodSync(filename, 0o444);
}

async function runFreshPrepared(preparedInput, outputDirectory) {
  assert.equal(typeof outputDirectory, "string");
  const authority = authentication.authenticatePreparedNf(preparedInput);
  const prepared = structuredClone(preparedInput);
  prepared.authoritySha256 = authority.sha256;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row19-fresh-"));
  fs.chmodSync(temporary, 0o700);
  try {
    const prefix = runPython(
      "bench.pari-class-group-port.row19_prepared_prefix_probe", prepared);
    const catalog = runPython(
      "bench.pari-class-group-port.row19_analytic_catalog", prepared);
    const first = await firstOwner(prepared, prefix, temporary);
    const terminal = await terminalOwner(prepared, prefix, catalog, first, temporary);
    const classBuilt = classApi.buildFreshOwner({
      terminalDescriptor: terminal.descriptor, firstDescriptor: first.descriptor,
      prepared, prefix, preparedAuthoritySha256: authority.sha256,
      outputDirectory: path.join(temporary, "class"),
    });
    const compactDescriptor = compactApi.compose(
      terminal.descriptor, path.join(temporary, "compact"));
    const unitDescriptor = unitApi.compose(
      compactDescriptor, terminal.descriptor, path.join(temporary, "unit"));
    const descriptors = { terminal: terminal.descriptor, first: first.descriptor,
      classOwner: classBuilt.receipt, unit: unitDescriptor };
    const finalOwner = finalApi.composeFresh(descriptors);
    finalApi.verifyOwner(finalOwner, finalOwner.ancestry);
    const finalPlain = Buffer.from(`${JSON.stringify(finalOwner)}\n`);
    const finalSha256 = sha(finalPlain);
    const mathematicalAuthoritySha256 = neutral.sha256Canonical({
      classOwnerSha256: classBuilt.receipt.ownerSha256,
      finalOwnerSha256: finalSha256,
      firstHnfOwnerSha256: first.descriptor.ownerSha256,
      generatorPowerEqualities: 9,
      terminalOwnerSha256: terminal.descriptor.ownerSha256,
      unitOwnerSha256: unitDescriptor.ownerSha256,
      valuationCells: [424 * 423, 424 * 430],
    });
    const trusted = structuredClone(finalOwner);
    const boundary = { owner: finalOwner, authority: {
      ownerSha256: finalSha256, replaySchema: adapter.INPUT_REPLAY_SCHEMA,
      replay(candidate) {
        finalApi.verifyOwner(candidate, trusted.ancestry);
        assert.deepEqual(candidate, trusted);
        return { accepted: true, correspondenceComplete: true,
          fieldId: adapter.FIELD_ID, firstStageValuationCells: 424 * 423,
          generatorPowerEqualities: 9, mathematicalAuthoritySha256,
          ownerSha256: finalSha256, publicComplete: false,
          schema: adapter.INPUT_REPLAY_SCHEMA,
          terminalValuationCells: 424 * 430 };
      },
    } };
    const composition = adapter.prepareFreshRow19ClassUnitResult(boundary, {
      final: finalSha256, classOwner: classBuilt.receipt.ownerSha256,
      unitOwner: unitDescriptor.ownerSha256,
    });
    assert.equal(adapter.isAuthenticFreshPrepared(composition), true);
    const raw = Buffer.from(composition.sealedEnvelopeHex, "hex");
    const trustedPayload = structuredClone(JSON.parse(raw).payload);
    const publicationAuthority = neutral.createDetachedClassUnitAuthority({
      envelopeSha256: composition.sealedEnvelopeSha256,
      mathematicalAuthoritySha256, replaySchema: adapter.PUBLICATION_REPLAY_SCHEMA,
      replay(candidate) {
        assert.deepEqual(candidate, trustedPayload);
        return { correspondence_complete: true, fieldId: adapter.FIELD_ID,
          mathematicalAuthoritySha256,
          payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
          schema: adapter.PUBLICATION_REPLAY_SCHEMA };
      },
    });
    const result = adapter.publishPreparedRow19ClassUnitResult(
      composition, publicationAuthority, new neutral.ClassUnitCorrespondencePublisher());
    const filename = path.join(outputDirectory,
      `row19-class-unit-result-${result.sha256}.json`);
    writeImmutable(filename, result.canonicalJSON());
    const receipt = { schema: RECEIPT_SCHEMA, panelIndex: 19,
      fieldId: adapter.FIELD_ID, path: filename, sha256: result.sha256,
      bytes: result.canonicalJSON().length, correspondenceComplete: true,
      preparedAuthoritySha256: authority.sha256,
      publicComplete: false, freshPreparedExecution: true,
      retainedRuntimeInputs: false, retainedOwnersRuntimeInputs: false,
      privateSameRunOwners: true, frozenW0RuntimeInput: false,
      qualifiedTiming: false, reserveAccess: false,
      runtimeInputs: Object.freeze(["authenticated normalized prepared-nf data"]) };
    Object.defineProperty(receipt, "verifiedResult", { configurable: false,
      enumerable: false, value: result, writable: false });
    Object.freeze(receipt);
    FRESH_RECEIPTS.add(receipt);
    return receipt;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { RECEIPT_SCHEMA,
  isAuthenticFreshReceipt(receipt) { return FRESH_RECEIPTS.has(receipt); },
  runFreshPrepared };
