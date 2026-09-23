"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BATCH_SCHEMA = "sagejs.pari-class-group/real-log-column-batch-v1";
const OWNER_SCHEMA = "sagejs.pari-class-group/real-log-column-owner-v1";
const TOTAL_COLUMNS = 301;
const REAL_PLACES = 2;
const CELLS_PER_COLUMN = 3 * REAL_PLACES;
const TARGET_BITS = 153088;
const RUN_IDENTITY = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const BATCH_NAME = /^real-log-batch-([0-9]+)-([0-9]+)-([0-9a-f]{64})\.json$/;
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

function equalRecord(actual, expected, label) {
  assert.deepEqual(actual, expected, `mismatched ${label}`);
}

function readBatch(capsulePath) {
  const bytes = fs.readFileSync(capsulePath);
  const digest = sha(bytes);
  const match = BATCH_NAME.exec(path.basename(capsulePath));
  assert(match, `invalid real-log batch filename: ${capsulePath}`);
  assert.equal(match[3], digest, `filename hash mismatch: ${capsulePath}`);
  assert.equal(
    fs.statSync(capsulePath).mode & 0o777,
    0o444,
    `batch is not 0444: ${capsulePath}`,
  );
  const value = JSON.parse(bytes);
  assert.equal(value.schema, BATCH_SCHEMA);
  assert.equal(value.runIdentity, RUN_IDENTITY);
  assert.equal(value.targetBits, TARGET_BITS);
  assert.equal(value.totalColumns, TOTAL_COLUMNS);
  assert.equal(value.realPlaces, REAL_PLACES);
  assert(Number.isSafeInteger(value.sourceStart));
  assert(Number.isSafeInteger(value.sourceCount));
  assert(Number.isSafeInteger(value.sourceStop));
  assert(value.sourceStart >= 0);
  assert(value.sourceCount >= 1 && value.sourceCount <= 28);
  assert.equal(value.sourceStop, value.sourceStart + value.sourceCount);
  assert(value.sourceStop <= TOTAL_COLUMNS);
  assert.equal(Number(match[1]), value.sourceStart);
  assert.equal(Number(match[2]), value.sourceCount);
  const expectedScalarColumns = Math.max(
    0,
    Math.min(value.sourceStop, 26) - value.sourceStart,
  );
  assert.equal(value.scalarColumns, expectedScalarColumns);
  assert.equal(value.nonscalarColumns, value.sourceCount - expectedScalarColumns);
  assert.equal(value.scalarColumns + value.nonscalarColumns, value.sourceCount);
  assert.equal(value.packedTriples.length, CELLS_PER_COLUMN * value.sourceCount);
  for (const cell of value.packedTriples) {
    assert.equal(typeof cell, "string");
    assert(INTEGER.test(cell), "noncanonical packed integer cell");
  }
  assert(/^[0-9a-f]{64}$/.test(value.authoritySha256));
  assert(/^[0-9a-f]{64}$/.test(value.initialOwnerSha256));
  assert(/^[0-9a-f]{64}$/.test(value.preparedOwnerSha256));
  assert.deepEqual(Object.keys(value.sourceDigests), [
    "principalGeneratorsSha256",
    "relationMetadataSha256",
    "relationRecordsSha256",
  ]);
  for (const sourceDigest of Object.values(value.sourceDigests)) {
    assert(/^[0-9a-f]{64}$/.test(sourceDigest));
  }
  return { capsulePath: path.resolve(capsulePath), bytes, digest, value };
}

function verifyCompleteBatches(capsulePaths) {
  assert(Array.isArray(capsulePaths) && capsulePaths.length > 0);
  const batches = capsulePaths.map(readBatch);
  const first = batches[0].value;
  let expectedStart = 0;
  let scalarColumns = 0;
  let nonscalarColumns = 0;
  for (const batch of batches) {
    const value = batch.value;
    if (value.sourceStart < expectedStart) {
      throw new Error(
        `overlapping or out-of-order real-log batch at ${value.sourceStart}; expected ${expectedStart}`,
      );
    }
    if (value.sourceStart > expectedStart) {
      throw new Error(
        `gap or out-of-order real-log batch at ${value.sourceStart}; expected ${expectedStart}`,
      );
    }
    equalRecord(value.runIdentity, first.runIdentity, "run identity");
    equalRecord(value.targetBits, first.targetBits, "target precision");
    equalRecord(value.totalColumns, first.totalColumns, "total columns");
    equalRecord(value.realPlaces, first.realPlaces, "real-place count");
    equalRecord(value.layout, first.layout, "layout");
    equalRecord(value.authoritySha256, first.authoritySha256, "authority");
    equalRecord(value.initialOwnerSha256, first.initialOwnerSha256, "initial owner");
    equalRecord(value.preparedOwnerSha256, first.preparedOwnerSha256, "prepared owner");
    equalRecord(value.sourceDigests, first.sourceDigests, "source digests");
    expectedStart = value.sourceStop;
    scalarColumns += value.scalarColumns;
    nonscalarColumns += value.nonscalarColumns;
  }
  assert.equal(
    expectedStart,
    TOTAL_COLUMNS,
    `incomplete real-log coverage: stopped at ${expectedStart}`,
  );
  assert.equal(scalarColumns, 26);
  assert.equal(nonscalarColumns, 275);
  return { batches, scalarColumns, nonscalarColumns };
}

function ownerFromBatches(verified) {
  const { batches, scalarColumns, nonscalarColumns } = verified;
  const first = batches[0].value;
  return {
    schema: OWNER_SCHEMA,
    runIdentity: first.runIdentity,
    targetBits: first.targetBits,
    sourceStart: 0,
    sourceCount: TOTAL_COLUMNS,
    sourceStop: TOTAL_COLUMNS,
    totalColumns: TOTAL_COLUMNS,
    scalarColumns,
    nonscalarColumns,
    realPlaces: REAL_PLACES,
    layout: first.layout,
    packedTriples: batches.flatMap(({ value }) => value.packedTriples),
    authoritySha256: first.authoritySha256,
    initialOwnerSha256: first.initialOwnerSha256,
    preparedOwnerSha256: first.preparedOwnerSha256,
    sourceDigests: first.sourceDigests,
    batches: batches.map(({ digest, value }) => ({
      sourceStart: value.sourceStart,
      sourceCount: value.sourceCount,
      sha256: digest,
    })),
  };
}

function publishOwner(outputDirectory, owner) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const durablePath = path.join(
    outputDirectory,
    `real-log-columns-complete-${digest}.json`,
  );
  if (fs.existsSync(durablePath)) {
    assert.equal(sha(fs.readFileSync(durablePath)), digest);
    assert.equal(fs.statSync(durablePath).mode & 0o777, 0o444);
  } else {
    const temporary = `${durablePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, bytes, { mode: 0o400, flag: "wx" });
    fs.renameSync(temporary, durablePath);
    fs.chmodSync(durablePath, 0o444);
  }
  return {
    schema: owner.schema,
    durablePath,
    sha256: digest,
    bytes: bytes.length,
    sourceColumns: owner.sourceCount,
    packedTriples: owner.packedTriples.length / 3,
    packedCells: owner.packedTriples.length,
    batchCount: owner.batches.length,
  };
}

function mergeCapsules(capsulePaths, outputDirectory) {
  const verified = verifyCompleteBatches(capsulePaths);
  const owner = ownerFromBatches(verified);
  assert.equal(owner.packedTriples.length, CELLS_PER_COLUMN * TOTAL_COLUMNS);
  return publishOwner(outputDirectory, owner);
}

function commandLine() {
  const outputOffset = process.argv.indexOf("--output-directory");
  const outputDirectory =
    outputOffset < 0
      ? "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority"
      : path.resolve(process.argv[outputOffset + 1]);
  assert(outputOffset < 0 || outputOffset + 1 < process.argv.length);
  const capsulePaths = process.argv
    .slice(2)
    .filter(
      (entry, index, all) =>
        entry !== "--output-directory" &&
        (index === 0 || all[index - 1] !== "--output-directory"),
    );
  assert(capsulePaths.length > 0, "no real-log batch capsules supplied");
  console.log(JSON.stringify(mergeCapsules(capsulePaths, outputDirectory), null, 2));
}

module.exports = {
  BATCH_SCHEMA,
  OWNER_SCHEMA,
  readBatch,
  verifyCompleteBatches,
  ownerFromBatches,
  publishOwner,
  mergeCapsules,
};

if (require.main === module) {
  try {
    commandLine();
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}
