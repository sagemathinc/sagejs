"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const TARGET_BITS = 153088;
const TOTAL_COLUMNS = 301;
const MAX_BATCH_COLUMNS = 4;
const CELLS_PER_COLUMN = 7;
const TIMEOUT_MS = 10 * 60 * 1000;
const ABORT_RSS_KIB = 3584 * 1024;
const HARD_RSS_KIB = 4096 * 1024;
const RUN_IDENTITY = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const BATCH_SCHEMA = "sagejs.pari-class-group/field3-complex-log-batch-v1";
const RECEIPT_SCHEMA =
  "sagejs.pari-class-group/field3-complex-log-batch-receipt-v1";
const OWNER_SCHEMA =
  "sagejs.pari-class-group/field3-complex-log-column-owner-v1";
const MERGE_RECEIPT_SCHEMA =
  "sagejs.pari-class-group/field3-complex-log-merge-receipt-v1";
const FRAGMENT_SCHEMA =
  "sagejs.pari-class-group/field3-complex-log-column-fragment-v1";
const FRAGMENT_RECEIPT_SCHEMA =
  "sagejs.pari-class-group/field3-complex-log-column-fragment-receipt-v1";
const LAYOUT =
  "source-column-major [kind, weighted-2logabs triple, weighted-2arg triple]";
const AUTHORITY_SHA =
  "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const INITIAL_SHA =
  "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const PREPARED_SHA =
  "bc0dfbca45a575a381ba87371fb27906f68b34cedd025435986fad4c7c6287cf";
const NORM_SHA =
  "65e1bbd5c05b89b63d08d91e137c2ac68116db3df66073080d89ca4a55275f53";
const KERNEL_SOURCE_SHA =
  "87d2b07569daa31ebf62ce88c971dd0fbdf4e87e898509b9fe9d59d4da1e2007";
const PREFIX_SHA =
  "f0a842ef820888e76b4421684a98a3cfd4654c47dee8896d63f204df7e7174fd";
const SOURCE_DIGESTS = Object.freeze({
  principalGeneratorsSha256:
    "31e9c9b4c0245417ce9265d5233d1a67fb717206e9811975cb85a59af03ab5de",
  relationMetadataSha256:
    "c751a9a91b9f17fc4047d8483e36d6ac6f9a0c1fe04ad072ed405f4a9c3a9f3b",
  relationRecordsSha256:
    "5df8c4bb02cd481965fdb01bac424f58d419216e3cefd4883ac985631da0e719",
});
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const BATCH_NAME =
  /^complex-log-batch-([0-9]+)-([0-9]+)-([0-9a-f]{64})\.json$/;
const RECEIPT_NAME =
  /^complex-log-batch-receipt-([0-9]+)-([0-9]+)-([0-9a-f]{64})\.json$/;
const FRAGMENT_NAME =
  /^complex-log-fragment-([0-9]+)-([0-9]+)-column-([0-9]+)-([0-9a-f]{64})\.json$/;
const FRAGMENT_RECEIPT_NAME =
  /^complex-log-fragment-receipt-([0-9]+)-([0-9]+)-column-([0-9]+)-([0-9a-f]{64})\.json$/;
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const packedSha = (entries) => sha(entries.map(String).join("\n"));
const root = path.resolve(__dirname, "../..");
const durableDirectory =
  process.env.FIELD3_DURABLE_DIRECTORY ||
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const capsuleDirectory =
  process.env.FIELD3_COMPLEX_CAPSULE_DIRECTORY || durableDirectory;
const authorityPath =
  process.env.FIELD3_AUTHORITY ||
  path.join(durableDirectory, `authority-${AUTHORITY_SHA}.json`);
const initialPath =
  process.env.FIELD3_INITIAL ||
  path.join(durableDirectory, `initial-collector-fixtures-${INITIAL_SHA}.json`);
const prefixPath =
  process.env.FIELD3_COMPLEX_LOG_PREFIX ||
  path.join(
    durableDirectory,
    "translated-log-columns",
    `complex-log-prefix-${PREFIX_SHA}.json`,
  );
const kernelSourcePath = path.join(
  __dirname,
  "field3_complex_log_columns.py",
);

const EXPECTED_SCHEDULE = Object.freeze(
  Array.from({ length: 76 }, (_, index) => {
    const sourceStart = 4 * index;
    const sourceCount = sourceStart === 300 ? 1 : 4;
    return Object.freeze({ index, sourceStart, sourceCount });
  }),
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function argument(name, fallback = undefined) {
  const offset = process.argv.indexOf(name);
  if (offset < 0) return fallback;
  assert(offset + 1 < process.argv.length, `missing value for ${name}`);
  return process.argv[offset + 1];
}

function scheduledRange(sourceStart, sourceCount) {
  assert(Number.isSafeInteger(sourceStart) && Number.isSafeInteger(sourceCount));
  const entry = EXPECTED_SCHEDULE.find(
    (candidate) =>
      candidate.sourceStart === sourceStart &&
      candidate.sourceCount === sourceCount,
  );
  assert(entry, "range is not one deterministic field3 complex-log batch");
  return entry;
}

function values(buffer) {
  return (buffer.toArray ? buffer.toArray() : Array.from(buffer)).map(BigInt);
}

function authenticatedOwners() {
  const authorityBytes = fs.readFileSync(authorityPath);
  const initialBytes = fs.readFileSync(initialPath);
  assert.equal(sha(authorityBytes), AUTHORITY_SHA);
  assert.equal(sha(initialBytes), INITIAL_SHA);
  assert.equal(sha(fs.readFileSync(kernelSourcePath)), KERNEL_SOURCE_SHA);
  const authority = JSON.parse(authorityBytes).authority;
  const initial = JSON.parse(initialBytes).expected[0];
  assert.deepEqual(authority.state.slice(0, 3), [0, 288, TOTAL_COLUMNS]);
  assert.equal(authority.owners.principalGenerators.length, 1204);
  assert.equal(authority.owners.relationMetadata.length, 903);
  assert.equal(authority.owners.relationRecords.length, 86688);
  const sourceDigests = {
    principalGeneratorsSha256: packedSha(
      authority.owners.principalGenerators,
    ),
    relationMetadataSha256: packedSha(authority.owners.relationMetadata),
    relationRecordsSha256: packedSha(authority.owners.relationRecords),
  };
  assert.deepEqual(sourceDigests, SOURCE_DIGESTS);
  return { owner: authority.owners, initial, sourceDigests };
}

function preparedOwner() {
  const text = run(process.execPath, [
    path.join(__dirname, "check_field3_high_precision_embeddings.cjs"),
    "--oracle",
  ]);
  const value = JSON.parse(text);
  assert.equal(value.runIdentity, RUN_IDENTITY);
  assert.equal(value.requestedBits, TARGET_BITS);
  assert.equal(value.makeMRootPrecisionBits, TARGET_BITS + 64);
  assert.equal(value.makeMTruncation, false);
  const identity = {
    polynomial: value.polynomial,
    signature: value.signature,
    zkden: value.zkden,
    zk: value.zk,
    tensor: value.tensor,
    requestedBits: value.requestedBits,
    makeMRootPrecisionBits: value.makeMRootPrecisionBits,
    makeMTruncation: value.makeMTruncation,
    makeMRootState: value.roots,
  };
  assert.equal(sha(JSON.stringify(identity)), PREPARED_SHA);
  return { value, preparedOwnerSha256: PREPARED_SHA };
}

function determinant4(matrix) {
  const a = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => matrix[4 * column + row]),
  );
  let sign = 1n;
  let denominator = 1n;
  for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
    if (a[pivotIndex][pivotIndex] === 0n) {
      const swap = a.findIndex(
        (row, index) => index > pivotIndex && row[pivotIndex] !== 0n,
      );
      assert.notEqual(swap, -1);
      [a[pivotIndex], a[swap]] = [a[swap], a[pivotIndex]];
      sign = -sign;
    }
    const pivot = a[pivotIndex][pivotIndex];
    for (let row = pivotIndex + 1; row < 4; row += 1) {
      for (let column = pivotIndex + 1; column < 4; column += 1) {
        const numerator =
          a[row][column] * pivot -
          a[row][pivotIndex] * a[pivotIndex][column];
        assert.equal(numerator % denominator, 0n);
        a[row][column] = numerator / denominator;
      }
    }
    denominator = pivot;
  }
  return sign * a[3][3];
}

function authenticateNormConsequences(owner, tensor) {
  const norms = [];
  for (let column = 0; column < TOTAL_COLUMNS; column += 1) {
    const element = owner.principalGenerators
      .slice(4 * column, 4 * column + 4)
      .map(BigInt);
    const multiplication = Array.from({ length: 16 }, (_, entry) =>
      element.reduce(
        (sum, coefficient, basis) =>
          sum + coefficient * BigInt(tensor[16 * basis + entry]),
        0n,
      ),
    );
    const elementNorm = determinant4(multiplication);
    let idealNorm = 1n;
    for (let row = 0; row < 288; row += 1) {
      const exponent = BigInt(owner.relationRecords[column * 288 + row]);
      assert(exponent >= 0n);
      if (exponent !== 0n) idealNorm *= BigInt(owner.packetNorms[row]) ** exponent;
    }
    assert.equal(elementNorm < 0n ? -elementNorm : elementNorm, idealNorm);
    norms.push(elementNorm);
  }
  assert.equal(packedSha(norms), NORM_SHA);
  return NORM_SHA;
}

function publishImmutable(directory, name, bytes) {
  fs.mkdirSync(directory, { recursive: true });
  const durablePath = path.join(directory, name);
  const digest = sha(bytes);
  if (fs.existsSync(durablePath)) {
    assert.equal(sha(fs.readFileSync(durablePath)), digest);
    assert.equal(fs.statSync(durablePath).mode & 0o777, 0o444);
  } else {
    const temporary = `${durablePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    const descriptor = fs.openSync(temporary, "wx", 0o400);
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.chmodSync(temporary, 0o444);
    try {
      fs.linkSync(temporary, durablePath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      assert.equal(sha(fs.readFileSync(durablePath)), digest);
    } finally {
      fs.unlinkSync(temporary);
    }
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
    assert.equal(fs.statSync(durablePath).mode & 0o777, 0o444);
  }
  return { path: durablePath, sha256: digest, bytes: bytes.length, mode: "0444" };
}

function commonIdentity() {
  return {
    runIdentity: RUN_IDENTITY,
    targetBits: TARGET_BITS,
    totalColumns: TOTAL_COLUMNS,
    layout: LAYOUT,
    authoritySha256: AUTHORITY_SHA,
    initialOwnerSha256: INITIAL_SHA,
    preparedOwnerSha256: PREPARED_SHA,
    kernelSourceSha256: KERNEL_SOURCE_SHA,
    normConsequencesSha256: NORM_SHA,
    sourceDigests: SOURCE_DIGESTS,
  };
}

function makeCapsule(sourceStart, sourceCount, packedWeightedComplex) {
  const schedule = scheduledRange(sourceStart, sourceCount);
  assert.equal(
    packedWeightedComplex.length,
    CELLS_PER_COLUMN * sourceCount,
  );
  for (const cell of packedWeightedComplex) {
    assert.equal(typeof cell, "string");
    assert(INTEGER.test(cell), "noncanonical weighted complex cell");
  }
  for (let local = 0; local < sourceCount; local += 1) {
    const column = sourceStart + local;
    assert.equal(
      packedWeightedComplex[CELLS_PER_COLUMN * local],
      column < 26 ? "1" : "2",
      `wrong raw kind for source column ${column}`,
    );
  }
  return {
    schema: BATCH_SCHEMA,
    ...commonIdentity(),
    scheduleIndex: schedule.index,
    sourceStart,
    sourceCount,
    sourceStop: sourceStart + sourceCount,
    scalarColumns: Math.max(0, Math.min(sourceStart + sourceCount, 26) - sourceStart),
    nonscalarColumns:
      sourceCount - Math.max(0, Math.min(sourceStart + sourceCount, 26) - sourceStart),
    packedWeightedComplex,
  };
}

function publishCapsule(directory, capsule) {
  const bytes = Buffer.from(`${JSON.stringify(capsule)}\n`);
  const digest = sha(bytes);
  return publishImmutable(
    directory,
    `complex-log-batch-${capsule.sourceStart}-${capsule.sourceCount}-${digest}.json`,
    bytes,
  );
}

function makeFragment(parentSourceStart, parentSourceCount, column, packedWeightedComplex) {
  const schedule = scheduledRange(parentSourceStart, parentSourceCount);
  assert(Number.isSafeInteger(column));
  assert(
    column >= parentSourceStart && column < parentSourceStart + parentSourceCount,
    "fragment column is outside its deterministic parent batch",
  );
  assert.equal(packedWeightedComplex.length, CELLS_PER_COLUMN);
  for (const cell of packedWeightedComplex) {
    assert.equal(typeof cell, "string");
    assert(INTEGER.test(cell), "noncanonical weighted complex fragment cell");
  }
  assert.equal(
    packedWeightedComplex[0],
    column < 26 ? "1" : "2",
    `wrong raw kind for fragment column ${column}`,
  );
  return {
    schema: FRAGMENT_SCHEMA,
    ...commonIdentity(),
    parentScheduleIndex: schedule.index,
    parentSourceStart,
    parentSourceCount,
    parentSourceStop: parentSourceStart + parentSourceCount,
    column,
    sourceStart: column,
    sourceCount: 1,
    sourceStop: column + 1,
    packedWeightedComplex,
  };
}

function publishFragment(directory, fragment) {
  const bytes = Buffer.from(`${JSON.stringify(fragment)}\n`);
  const digest = sha(bytes);
  return publishImmutable(
    directory,
    `complex-log-fragment-${fragment.parentSourceStart}-${fragment.parentSourceCount}-column-${fragment.column}-${digest}.json`,
    bytes,
  );
}

function readFragment(fragmentPath) {
  const bytes = fs.readFileSync(fragmentPath);
  const digest = sha(bytes);
  const match = FRAGMENT_NAME.exec(path.basename(fragmentPath));
  assert(match, `invalid complex-log fragment filename: ${fragmentPath}`);
  assert.equal(match[4], digest, `fragment filename hash mismatch: ${fragmentPath}`);
  assert.equal(fs.statSync(fragmentPath).mode & 0o777, 0o444, "fragment is not 0444");
  const value = JSON.parse(bytes);
  assert.equal(value.schema, FRAGMENT_SCHEMA);
  const expected = commonIdentity();
  for (const key of Object.keys(expected)) {
    assert.deepEqual(value[key], expected[key], `mismatched fragment ${key}`);
  }
  const schedule = scheduledRange(value.parentSourceStart, value.parentSourceCount);
  assert.equal(value.parentScheduleIndex, schedule.index);
  assert.equal(value.parentSourceStop, value.parentSourceStart + value.parentSourceCount);
  assert.equal(Number(match[1]), value.parentSourceStart);
  assert.equal(Number(match[2]), value.parentSourceCount);
  assert.equal(Number(match[3]), value.column);
  assert.equal(value.sourceStart, value.column);
  assert.equal(value.sourceCount, 1);
  assert.equal(value.sourceStop, value.column + 1);
  makeFragment(
    value.parentSourceStart,
    value.parentSourceCount,
    value.column,
    value.packedWeightedComplex,
  );
  return { path: path.resolve(fragmentPath), bytes, digest, value };
}

function readFragmentReceipt(receiptPath) {
  const bytes = fs.readFileSync(receiptPath);
  const digest = sha(bytes);
  const match = FRAGMENT_RECEIPT_NAME.exec(path.basename(receiptPath));
  assert(match, `invalid complex-log fragment receipt filename: ${receiptPath}`);
  assert.equal(match[4], digest, `fragment receipt filename hash mismatch: ${receiptPath}`);
  assert.equal(
    fs.statSync(receiptPath).mode & 0o777,
    0o444,
    "fragment receipt is not 0444",
  );
  const value = JSON.parse(bytes);
  assert.equal(value.schema, FRAGMENT_RECEIPT_SCHEMA);
  const expected = commonIdentity();
  for (const key of Object.keys(expected)) {
    assert.deepEqual(value[key], expected[key], `mismatched fragment receipt ${key}`);
  }
  scheduledRange(value.parentSourceStart, value.parentSourceCount);
  assert.equal(
    value.parentSourceStop,
    value.parentSourceStart + value.parentSourceCount,
  );
  assert.equal(Number(match[1]), value.parentSourceStart);
  assert.equal(Number(match[2]), value.parentSourceCount);
  assert.equal(Number(match[3]), value.column);
  assert.equal(value.sourceStart, value.column);
  assert.equal(value.sourceCount, 1);
  assert.equal(value.sourceStop, value.column + 1);
  assert.equal(value.packedCells, CELLS_PER_COLUMN);
  assert.equal(value.fragment.mode, "0444");
  assert(Number.isFinite(value.runMilliseconds) && value.runMilliseconds >= 0);
  assert(Number.isFinite(value.wallMilliseconds) && value.wallMilliseconds >= 0);
  assert(value.wallMilliseconds >= value.runMilliseconds);
  assert(
    Number.isSafeInteger(value.peakAggregateRssKiB) &&
      value.peakAggregateRssKiB >= 0,
  );
  assert.deepEqual(value.resourcePolicy, {
    abortGiB: 3.5,
    hardGiB: 4,
    timeoutSeconds: 600,
  });
  const fragment = readFragment(value.fragment.path);
  assert.equal(fragment.digest, value.fragment.sha256);
  assert.equal(fragment.bytes.length, value.fragment.bytes);
  assert.equal(fragment.value.parentSourceStart, value.parentSourceStart);
  assert.equal(fragment.value.parentSourceCount, value.parentSourceCount);
  assert.equal(fragment.value.column, value.column);
  assert.equal(
    value.outputSha256,
    packedSha(fragment.value.packedWeightedComplex),
    "fragment receipt outputSha256 mismatch",
  );
  const scalarCount = value.column < 26 ? 1 : 0;
  assert.deepEqual(value.state, [
    "0",
    String(TARGET_BITS),
    String(value.column),
    "1",
    String(scalarCount),
    "0",
    String(1 - scalarCount),
    String(value.column + 1),
    String(TOTAL_COLUMNS - value.column - 1),
  ]);
  return { path: path.resolve(receiptPath), bytes, digest, value, fragment };
}

function readCapsule(capsulePath) {
  const bytes = fs.readFileSync(capsulePath);
  const digest = sha(bytes);
  const match = BATCH_NAME.exec(path.basename(capsulePath));
  assert(match, `invalid complex-log capsule filename: ${capsulePath}`);
  assert.equal(match[3], digest, `capsule filename hash mismatch: ${capsulePath}`);
  assert.equal(fs.statSync(capsulePath).mode & 0o777, 0o444, "capsule is not 0444");
  const value = JSON.parse(bytes);
  assert.equal(value.schema, BATCH_SCHEMA);
  const expected = commonIdentity();
  for (const key of Object.keys(expected)) {
    assert.deepEqual(value[key], expected[key], `mismatched capsule ${key}`);
  }
  const schedule = scheduledRange(value.sourceStart, value.sourceCount);
  assert.equal(value.scheduleIndex, schedule.index);
  assert.equal(value.sourceStop, value.sourceStart + value.sourceCount);
  assert.equal(Number(match[1]), value.sourceStart);
  assert.equal(Number(match[2]), value.sourceCount);
  assert.equal(
    value.scalarColumns,
    Math.max(0, Math.min(value.sourceStop, 26) - value.sourceStart),
  );
  assert.equal(value.scalarColumns + value.nonscalarColumns, value.sourceCount);
  makeCapsule(value.sourceStart, value.sourceCount, value.packedWeightedComplex);
  return { path: path.resolve(capsulePath), bytes, digest, value };
}

function readReceipt(receiptPath) {
  const bytes = fs.readFileSync(receiptPath);
  const digest = sha(bytes);
  const match = RECEIPT_NAME.exec(path.basename(receiptPath));
  assert(match, `invalid complex-log receipt filename: ${receiptPath}`);
  assert.equal(match[3], digest, `receipt filename hash mismatch: ${receiptPath}`);
  assert.equal(fs.statSync(receiptPath).mode & 0o777, 0o444, "receipt is not 0444");
  const value = JSON.parse(bytes);
  assert.equal(value.schema, RECEIPT_SCHEMA);
  const expected = commonIdentity();
  for (const key of Object.keys(expected)) {
    assert.deepEqual(value[key], expected[key], `mismatched receipt ${key}`);
  }
  scheduledRange(value.sourceStart, value.sourceCount);
  assert.equal(value.sourceStop, value.sourceStart + value.sourceCount);
  assert.equal(Number(match[1]), value.sourceStart);
  assert.equal(Number(match[2]), value.sourceCount);
  assert.equal(value.packedCells, CELLS_PER_COLUMN * value.sourceCount);
  assert.equal(value.capsule.mode, "0444");
  assert(/^[0-9a-f]{64}$/.test(value.capsule.sha256));
  return { path: path.resolve(receiptPath), bytes, digest, value };
}

function readPrefix(selectedPrefixPath = prefixPath) {
  const bytes = fs.readFileSync(selectedPrefixPath);
  assert.equal(sha(bytes), PREFIX_SHA);
  const value = JSON.parse(bytes);
  assert.equal(value.schema, "sagejs-field3-complex-log-prefix-owner-v1");
  assert.equal(value.targetBits, TARGET_BITS);
  assert.equal(value.sourceAuthoritySha256, AUTHORITY_SHA);
  assert.equal(value.sourceInitialOwnerSha256, INITIAL_SHA);
  return value;
}

function verifyCompleteCapsules(capsulePaths, selectedPrefix = readPrefix()) {
  assert.equal(capsulePaths.length, EXPECTED_SCHEDULE.length);
  const batches = capsulePaths.map(readCapsule);
  let expectedStart = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const schedule = EXPECTED_SCHEDULE[index];
    if (batch.value.sourceStart < expectedStart) {
      throw new Error(`overlap/out-of-order at ${batch.value.sourceStart}; expected ${expectedStart}`);
    }
    if (batch.value.sourceStart > expectedStart) {
      throw new Error(`gap/out-of-order at ${batch.value.sourceStart}; expected ${expectedStart}`);
    }
    assert.equal(batch.value.scheduleIndex, schedule.index);
    assert.equal(batch.value.sourceStart, schedule.sourceStart);
    assert.equal(batch.value.sourceCount, schedule.sourceCount);
    expectedStart = batch.value.sourceStop;
  }
  assert.equal(expectedStart, TOTAL_COLUMNS);
  const packedWeightedComplex = batches.flatMap(
    ({ value }) => value.packedWeightedComplex,
  );
  assert.equal(packedWeightedComplex.length, TOTAL_COLUMNS * CELLS_PER_COLUMN);
  const compatible = [];
  for (const expectedColumn of selectedPrefix.columns) {
    const actual = packedWeightedComplex.slice(
      CELLS_PER_COLUMN * expectedColumn.column,
      CELLS_PER_COLUMN * (expectedColumn.column + 1),
    );
    const expectedBytes = Buffer.from(JSON.stringify(expectedColumn.raw));
    const actualBytes = Buffer.from(JSON.stringify(actual));
    assert(expectedBytes.equals(actualBytes), `selected-prefix mismatch at column ${expectedColumn.column}`);
    compatible.push(...actual);
  }
  return {
    batches,
    packedWeightedComplex,
    prefixCompatibilitySha256: packedSha(compatible),
    selectedPrefixColumns: selectedPrefix.columns.length,
  };
}

function ownerFromCapsules(verified) {
  return {
    schema: OWNER_SCHEMA,
    ...commonIdentity(),
    sourceStart: 0,
    sourceCount: TOTAL_COLUMNS,
    sourceStop: TOTAL_COLUMNS,
    scalarColumns: 26,
    nonscalarColumns: 275,
    packedWeightedComplex: verified.packedWeightedComplex,
    selectedPrefixSha256: PREFIX_SHA,
    selectedPrefixColumns: verified.selectedPrefixColumns,
    prefixCompatibilitySha256: verified.prefixCompatibilitySha256,
    batches: verified.batches.map(({ digest, value }) => ({
      scheduleIndex: value.scheduleIndex,
      sourceStart: value.sourceStart,
      sourceCount: value.sourceCount,
      sha256: digest,
    })),
  };
}

function mergeCapsules(capsulePaths, outputDirectory, selectedPrefix = readPrefix()) {
  const verified = verifyCompleteCapsules(capsulePaths, selectedPrefix);
  const owner = ownerFromCapsules(verified);
  const ownerBytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const ownerSha256 = sha(ownerBytes);
  const publishedOwner = publishImmutable(
    outputDirectory,
    `complex-log-columns-complete-${ownerSha256}.json`,
    ownerBytes,
  );
  const receipt = {
    schema: MERGE_RECEIPT_SCHEMA,
    ...commonIdentity(),
    owner: publishedOwner,
    sourceColumns: TOTAL_COLUMNS,
    packedCells: owner.packedWeightedComplex.length,
    batchCount: owner.batches.length,
    selectedPrefixSha256: PREFIX_SHA,
    selectedPrefixColumns: owner.selectedPrefixColumns,
    prefixCompatibilitySha256: owner.prefixCompatibilitySha256,
    batches: owner.batches,
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const receiptSha256 = sha(receiptBytes);
  const publishedReceipt = publishImmutable(
    outputDirectory,
    `complex-log-merge-receipt-${receiptSha256}.json`,
    receiptBytes,
  );
  return { ...receipt, receipt: publishedReceipt };
}

function integer(api, length, capacity, data = Array(length).fill(0n)) {
  return api.createIntegerBuffer(length, capacity, data);
}

async function executeRange(sourceStart, sourceCount) {
  assert(Number.isSafeInteger(sourceStart) && Number.isSafeInteger(sourceCount));
  assert(sourceStart >= 0 && sourceCount >= 1 && sourceCount <= MAX_BATCH_COLUMNS);
  assert(sourceStart + sourceCount <= TOTAL_COLUMNS);
  const phases = {};
  let phaseStarted = process.hrtime.bigint();
  const finishPhase = (name) => {
    const now = process.hrtime.bigint();
    phases[name] = Number(now - phaseStarted) / 1e6;
    phaseStarted = now;
  };
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const { owner, initial, sourceDigests } = authenticatedOwners();
  finishPhase("ownerAuthentication");
  const prepared = preparedOwner();
  assert.deepEqual(
    prepared.value.tensor.map(BigInt),
    initial.basisTable.map(BigInt),
  );
  finishPhase("embeddingOracle");
  authenticateNormConsequences(owner, initial.basisTable);
  finishPhase("normAuthentication");
  const built = await compileKernel({ sourcePath: kernelSourcePath });
  const api = require(built.modulePath).pari_field3_complex_log_columns;
  assert(api.nativeAvailable);
  finishPhase("compileAndLoad");
  const triples = prepared.value.embedding.map(BigInt);
  const storage = {
    polynomial: integer(api, 5, 64, prepared.value.polynomial.map(BigInt)),
    basis: integer(api, 16, 64, prepared.value.zk.map(BigInt)),
    embeddingM: integer(api, 16, 200000, Array.from({ length: 16 }, (_, i) => triples[3 * i])),
    embeddingP: integer(api, 16, 200000, Array.from({ length: 16 }, (_, i) => triples[3 * i + 1])),
    embeddingE: integer(api, 16, 200000, Array.from({ length: 16 }, (_, i) => triples[3 * i + 2])),
    embeddingState: api.createInt64Buffer([0n, 153088n, 153152n, 153664n, 2n, 1n]),
    generators: integer(api, 1204, 64, owner.principalGenerators.map(BigInt)),
    metadata: integer(api, 903, 64, owner.relationMetadata.map(BigInt)),
    relations: integer(api, 86688, 64, owner.relationRecords.map(BigInt)),
    piCache: integer(api, 3, 200000),
    logCache: integer(api, 3, 200000),
    a: integer(api, 16385, 128),
    b: integer(api, 16385, 128),
    p: integer(api, 16385, 128),
    q: integer(api, 16385, 128),
    stack: integer(api, 105, 1000000),
    scratch: integer(api, 13 * sourceCount, 200000),
    principal: integer(api, 6 * sourceCount, 200000, Array(6 * sourceCount).fill(777n)),
    raw: integer(api, 7 * sourceCount, 200000, Array(7 * sourceCount).fill(777n)),
    state: api.createInt64Buffer(Array(9).fill(777n)),
  };
  finishPhase("storageAllocation");
  const started = process.hrtime.bigint();
  assert.equal(
    api.gmp(
      storage.polynomial,
      storage.basis,
      37n,
      storage.embeddingM,
      storage.embeddingP,
      storage.embeddingE,
      storage.embeddingState,
      storage.generators,
      storage.metadata,
      storage.relations,
      BigInt(sourceStart),
      BigInt(sourceCount),
      BigInt(TARGET_BITS),
      storage.piCache,
      storage.logCache,
      storage.a,
      storage.b,
      storage.p,
      storage.q,
      storage.stack,
      storage.scratch,
      storage.principal,
      storage.raw,
      storage.state,
    ),
    0n,
  );
  const runMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  finishPhase("nativeKernel");
  const packedWeightedComplex = values(storage.raw).map(String);
  const state = values(storage.state);
  const scalarCount = Math.max(
    0,
    Math.min(sourceStart + sourceCount, 26) - sourceStart,
  );
  assert.deepEqual(state, [
    0n,
    BigInt(TARGET_BITS),
    BigInt(sourceStart),
    BigInt(sourceCount),
    BigInt(scalarCount),
    0n,
    BigInt(sourceCount - scalarCount),
    BigInt(sourceStart + sourceCount),
    BigInt(TOTAL_COLUMNS - sourceStart - sourceCount),
  ]);
  finishPhase("outputValidation");
  return {
    sourceStart,
    sourceCount,
    sourceStop: sourceStart + sourceCount,
    sourceDigests,
    packedWeightedComplex,
    outputSha256: packedSha(packedWeightedComplex),
    packedCells: packedWeightedComplex.length,
    state: state.map(String),
    runMilliseconds,
    phaseMilliseconds: phases,
    cacheKey: built.cacheKey,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    addonBytes: fs.statSync(built.addonPath).size,
  };
}

async function executeBatch(sourceStart, sourceCount) {
  scheduledRange(sourceStart, sourceCount);
  const computed = await executeRange(sourceStart, sourceCount);
  const { packedWeightedComplex, sourceDigests, ...metadata } = computed;
  const capsule = makeCapsule(
    sourceStart,
    sourceCount,
    packedWeightedComplex,
  );
  assert.deepEqual(capsule.sourceDigests, sourceDigests);
  const published = publishCapsule(capsuleDirectory, capsule);
  return {
    ...metadata,
    capsule: published,
  };
}

async function executeFragment(parentSourceStart, parentSourceCount, column) {
  const schedule = scheduledRange(parentSourceStart, parentSourceCount);
  assert(
    column >= schedule.sourceStart &&
      column < schedule.sourceStart + schedule.sourceCount,
    "fragment column is outside its deterministic parent batch",
  );
  const computed = await executeRange(column, 1);
  const fragment = makeFragment(
    parentSourceStart,
    parentSourceCount,
    column,
    computed.packedWeightedComplex,
  );
  assert.deepEqual(fragment.sourceDigests, computed.sourceDigests);
  const published = publishFragment(capsuleDirectory, fragment);
  return {
    ...computed,
    parentSourceStart,
    parentSourceCount,
    parentSourceStop: parentSourceStart + parentSourceCount,
    column,
    fragment: published,
  };
}

function processTreeRss(rootPid) {
  const listing = spawnSync("ps", ["-e", "-o", "pid=,ppid=,rss="], { encoding: "utf8" });
  if (listing.status !== 0) return 0;
  const rows = listing.stdout.trim().split("\n").filter(Boolean)
    .map((line) => line.trim().split(/\s+/).map(Number));
  const wanted = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) {
      if (wanted.has(ppid) && !wanted.has(pid)) {
        wanted.add(pid);
        changed = true;
      }
    }
  }
  return rows.reduce((sum, [pid, , rss]) => sum + (wanted.has(pid) ? rss : 0), 0);
}

function monitoredWorker(workerArguments, outputDirectory, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "prlimit",
      [
        `--as=${HARD_RSS_KIB * 1024}`,
        "--",
        process.execPath,
        __filename,
        "--worker",
        ...workerArguments,
      ],
      {
        detached: true,
        env: {
          ...process.env,
          FIELD3_COMPLEX_CAPSULE_DIRECTORY: outputDirectory,
          SAGEJS_NATIVE_CACHE_ROOT:
            process.env.SAGEJS_NATIVE_CACHE_ROOT ||
            "/scratch/sagejs-field3-complex-log-batch-cache",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let peakAggregateRssKiB = 0;
    let stopped = false;
    const started = Date.now();
    const timer = setInterval(() => {
      peakAggregateRssKiB = Math.max(peakAggregateRssKiB, processTreeRss(child.pid));
      if (peakAggregateRssKiB > ABORT_RSS_KIB || Date.now() - started > TIMEOUT_MS) {
        stopped = true;
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    }, 250);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearInterval(timer);
      if (stopped || code !== 0) {
        reject(new Error(`field3 complex ${label} failed code=${code} signal=${signal} peak=${peakAggregateRssKiB}\n${stderr}`));
        return;
      }
      const result = JSON.parse(stdout.trim().split("\n").at(-1));
      result.wallMilliseconds = Date.now() - started;
      result.peakAggregateRssKiB = peakAggregateRssKiB;
      result.resourcePolicy = { abortGiB: 3.5, hardGiB: 4, timeoutSeconds: 600 };
      resolve(result);
    });
  });
}

function monitoredBatch(sourceStart, sourceCount, outputDirectory) {
  scheduledRange(sourceStart, sourceCount);
  return monitoredWorker(
    ["--source-start", String(sourceStart), "--count", String(sourceCount)],
    outputDirectory,
    "batch",
  );
}

function monitoredFragment(
  parentSourceStart,
  parentSourceCount,
  column,
  outputDirectory,
) {
  scheduledRange(parentSourceStart, parentSourceCount);
  return monitoredWorker(
    [
      "--fragment-parent-start",
      String(parentSourceStart),
      "--fragment-parent-count",
      String(parentSourceCount),
      "--column",
      String(column),
    ],
    outputDirectory,
    `fragment column ${column}`,
  );
}

function publishFragmentReceipt(outputDirectory, result) {
  const receipt = {
    schema: FRAGMENT_RECEIPT_SCHEMA,
    ...commonIdentity(),
    ...result,
  };
  delete receipt.sourceDigests;
  delete receipt.packedWeightedComplex;
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const receiptSha256 = sha(receiptBytes);
  const publishedReceipt = publishImmutable(
    outputDirectory,
    `complex-log-fragment-receipt-${receipt.parentSourceStart}-${receipt.parentSourceCount}-column-${receipt.column}-${receiptSha256}.json`,
    receiptBytes,
  );
  return { ...receipt, receipt: publishedReceipt };
}

function assembleFragments(
  parentSourceStart,
  parentSourceCount,
  fragmentReceiptPaths,
  outputDirectory,
) {
  const schedule = scheduledRange(parentSourceStart, parentSourceCount);
  assert.equal(
    fragmentReceiptPaths.length,
    parentSourceCount,
    `fragment assembly requires exactly ${parentSourceCount} receipt paths`,
  );
  const fragments = fragmentReceiptPaths.map(readFragmentReceipt);
  const seen = new Set();
  for (let local = 0; local < fragments.length; local += 1) {
    const entry = fragments[local];
    assert.equal(entry.value.parentSourceStart, schedule.sourceStart);
    assert.equal(entry.value.parentSourceCount, schedule.sourceCount);
    const expectedColumn = parentSourceStart + local;
    assert.equal(
      entry.value.column,
      expectedColumn,
      `fragment gap/overlap/out-of-order at column ${entry.value.column}; expected ${expectedColumn}`,
    );
    assert(!seen.has(entry.value.column), `duplicate fragment column ${entry.value.column}`);
    seen.add(entry.value.column);
  }
  const packedWeightedComplex = fragments.flatMap(
    (entry) => entry.fragment.value.packedWeightedComplex,
  );
  const capsule = makeCapsule(
    parentSourceStart,
    parentSourceCount,
    packedWeightedComplex,
  );
  const scalarCount = Math.max(
    0,
    Math.min(parentSourceStart + parentSourceCount, 26) - parentSourceStart,
  );
  const state = [
    "0",
    String(TARGET_BITS),
    String(parentSourceStart),
    String(parentSourceCount),
    String(scalarCount),
    "0",
    String(parentSourceCount - scalarCount),
    String(parentSourceStart + parentSourceCount),
    String(TOTAL_COLUMNS - parentSourceStart - parentSourceCount),
  ];
  const cacheKeys = new Set(fragments.map((entry) => entry.value.cacheKey));
  const coreBytes = new Set(fragments.map((entry) => entry.value.coreBytes));
  const addonBytes = new Set(fragments.map((entry) => entry.value.addonBytes));
  assert.equal(cacheKeys.size, 1, "fragment cache-key mismatch");
  assert.equal(coreBytes.size, 1, "fragment core-size mismatch");
  assert.equal(addonBytes.size, 1, "fragment addon-size mismatch");
  const phaseNames = new Set(
    fragments.flatMap((entry) => Object.keys(entry.value.phaseMilliseconds || {})),
  );
  const phaseMilliseconds = Object.fromEntries(
    Array.from(phaseNames).map((name) => [
      name,
      fragments.reduce(
        (sum, entry) => sum + (entry.value.phaseMilliseconds?.[name] || 0),
        0,
      ),
    ]),
  );
  const publishedCapsule = publishCapsule(outputDirectory, capsule);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    ...commonIdentity(),
    capsule: publishedCapsule,
    sourceStart: parentSourceStart,
    sourceCount: parentSourceCount,
    sourceStop: parentSourceStart + parentSourceCount,
    outputSha256: packedSha(packedWeightedComplex),
    packedCells: packedWeightedComplex.length,
    state,
    runMilliseconds: fragments.reduce(
      (sum, entry) => sum + entry.value.runMilliseconds,
      0,
    ),
    phaseMilliseconds,
    cacheKey: fragments[0].value.cacheKey,
    coreBytes: fragments[0].value.coreBytes,
    addonBytes: fragments[0].value.addonBytes,
    wallMilliseconds: fragments.reduce(
      (sum, entry) => sum + entry.value.wallMilliseconds,
      0,
    ),
    peakAggregateRssKiB: Math.max(
      ...fragments.map((entry) => entry.value.peakAggregateRssKiB),
    ),
    resourcePolicy: { abortGiB: 3.5, hardGiB: 4, timeoutSeconds: 600 },
    assembledFromColumnFragments: fragments.map((entry) => ({
      column: entry.value.column,
      receipt: {
        path: entry.path,
        sha256: entry.digest,
        bytes: entry.bytes.length,
        mode: "0444",
      },
      fragment: entry.value.fragment,
    })),
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const receiptSha256 = sha(receiptBytes);
  const publishedReceipt = publishImmutable(
    outputDirectory,
    `complex-log-batch-receipt-${parentSourceStart}-${parentSourceCount}-${receiptSha256}.json`,
    receiptBytes,
  );
  return { ...receipt, receipt: publishedReceipt };
}

function findCapsules(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => BATCH_NAME.test(name))
    .map((name) => path.join(directory, name));
}

function findReceipts(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => RECEIPT_NAME.test(name))
    .map((name) => path.join(directory, name));
}

function findFragments(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => FRAGMENT_NAME.test(name))
    .map((name) => path.join(directory, name));
}

function findFragmentReceipts(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => FRAGMENT_RECEIPT_NAME.test(name))
    .map((name) => path.join(directory, name));
}

function fragmentResumePlan(parentSourceStart, parentSourceCount, directory) {
  const schedule = scheduledRange(parentSourceStart, parentSourceCount);
  const fragments = new Map();
  for (const fragmentPath of findFragments(directory)) {
    const match = FRAGMENT_NAME.exec(path.basename(fragmentPath));
    assert(match);
    if (
      Number(match[1]) !== parentSourceStart ||
      Number(match[2]) !== parentSourceCount
    ) {
      continue;
    }
    const fragment = readFragment(fragmentPath);
    assert(
      !fragments.has(fragment.value.column),
      `ambiguous duplicate fragment for column ${fragment.value.column}`,
    );
    fragments.set(fragment.value.column, fragment);
  }
  const receipts = new Map();
  for (const receiptPath of findFragmentReceipts(directory)) {
    const match = FRAGMENT_RECEIPT_NAME.exec(path.basename(receiptPath));
    assert(match);
    if (
      Number(match[1]) !== parentSourceStart ||
      Number(match[2]) !== parentSourceCount
    ) {
      continue;
    }
    const receipt = readFragmentReceipt(receiptPath);
    assert(
      !receipts.has(receipt.value.column),
      `ambiguous duplicate fragment receipt for column ${receipt.value.column}`,
    );
    receipts.set(receipt.value.column, receipt);
  }
  const columns = Array.from({ length: parentSourceCount }, (_, local) => {
    const column = parentSourceStart + local;
    const fragment = fragments.get(column);
    const receipt = receipts.get(column);
    if (receipt) {
      assert(fragment, `fragment receipt without fragment for column ${column}`);
      assert.equal(receipt.value.fragment.sha256, fragment.digest);
      assert.equal(path.resolve(receipt.value.fragment.path), fragment.path);
    }
    const status = fragment && receipt
      ? "complete"
      : fragment
        ? "fragment-only"
        : "missing";
    return {
      column,
      status,
      fragment: fragment
        ? { path: fragment.path, sha256: fragment.digest }
        : null,
      receipt: receipt ? { path: receipt.path, sha256: receipt.digest } : null,
      command: status === "complete"
        ? null
        : `node ${path.relative(root, __filename)} --fragment-parent-start ${schedule.sourceStart} --fragment-parent-count ${schedule.sourceCount} --column ${column}`,
    };
  });
  assert.equal(
    fragments.size,
    columns.filter((entry) => entry.status !== "missing").length,
  );
  assert.equal(
    receipts.size,
    columns.filter((entry) => entry.status === "complete").length,
  );
  return {
    schema: "sagejs.pari-class-group/field3-complex-log-fragment-resume-plan-v1",
    ...commonIdentity(),
    parentScheduleIndex: schedule.index,
    parentSourceStart,
    parentSourceCount,
    parentSourceStop: parentSourceStart + parentSourceCount,
    directory: path.resolve(directory),
    columns,
    complete: columns.filter((entry) => entry.status === "complete").length,
    missing: columns.filter((entry) => entry.status === "missing").length,
    fragmentOnly: columns.filter((entry) => entry.status === "fragment-only").length,
  };
}

function resumablePlan(directory) {
  const grouped = new Map();
  for (const capsulePath of findCapsules(directory)) {
    const capsule = readCapsule(capsulePath);
    const key = `${capsule.value.sourceStart}:${capsule.value.sourceCount}`;
    assert(!grouped.has(key), `ambiguous duplicate capsule for ${key}`);
    grouped.set(key, capsule);
  }
  const receipts = new Map();
  for (const receiptPath of findReceipts(directory)) {
    const receipt = readReceipt(receiptPath);
    const key = `${receipt.value.sourceStart}:${receipt.value.sourceCount}`;
    assert(!receipts.has(key), `ambiguous duplicate receipt for ${key}`);
    receipts.set(key, receipt);
  }
  const batches = EXPECTED_SCHEDULE.map((schedule) => {
    const key = `${schedule.sourceStart}:${schedule.sourceCount}`;
    const found = grouped.get(key);
    const receipt = receipts.get(key);
    if (receipt) {
      assert(found, `receipt without capsule for ${key}`);
      assert.equal(receipt.value.capsule.sha256, found.digest, `receipt/capsule mismatch for ${key}`);
      assert.equal(path.resolve(receipt.value.capsule.path), found.path, `receipt capsule path mismatch for ${key}`);
    }
    const status = found && receipt ? "complete" : found ? "capsule-only" : "missing";
    return {
      ...schedule,
      status,
      capsule: found ? { path: found.path, sha256: found.digest } : null,
      receipt: receipt ? { path: receipt.path, sha256: receipt.digest } : null,
      command: status === "complete"
        ? null
        : `node ${path.relative(root, __filename)} --source-start ${schedule.sourceStart} --count ${schedule.sourceCount}`,
    };
  });
  assert.equal(grouped.size, batches.filter((batch) => batch.status !== "missing").length);
  assert.equal(receipts.size, batches.filter((batch) => batch.status === "complete").length);
  return {
    schema: "sagejs.pari-class-group/field3-complex-log-resume-plan-v1",
    ...commonIdentity(),
    directory: path.resolve(directory),
    batches,
    complete: batches.filter((batch) => batch.status === "complete").length,
    missing: batches.filter((batch) => batch.status === "missing").length,
    capsuleOnly: batches.filter((batch) => batch.status === "capsule-only").length,
  };
}

function expectFailure(action, pattern) {
  assert.throws(action, pattern);
  return 1;
}

function lightweightSelfTest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field3-complex-protocol-"));
  const selectedPrefix = readPrefix();
  const selected = new Map(selectedPrefix.columns.map((column) => [column.column, column.raw]));
  const capsulePaths = [];
  for (const batch of EXPECTED_SCHEDULE) {
    const cells = [];
    for (let local = 0; local < batch.sourceCount; local += 1) {
      const column = batch.sourceStart + local;
      cells.push(...(selected.get(column) || [column < 26 ? "1" : "2", "0", "0", "0", "0", "0", "0"]));
    }
    capsulePaths.push(publishCapsule(directory, makeCapsule(batch.sourceStart, batch.sourceCount, cells)).path);
  }
  const verified = verifyCompleteCapsules(capsulePaths, selectedPrefix);
  assert.equal(verified.packedWeightedComplex.length, 2107);
  const merged = mergeCapsules(capsulePaths, directory, selectedPrefix);
  assert.equal(merged.packedCells, 2107);
  assert.equal(merged.batchCount, 76);
  const firstCapsule = readCapsule(capsulePaths[0]);
  const syntheticReceipt = {
    schema: RECEIPT_SCHEMA,
    ...commonIdentity(),
    capsule: {
      path: firstCapsule.path,
      sha256: firstCapsule.digest,
      bytes: firstCapsule.bytes.length,
      mode: "0444",
    },
    sourceStart: 0,
    sourceCount: 4,
    sourceStop: 4,
    packedCells: 28,
  };
  const syntheticReceiptBytes = Buffer.from(`${JSON.stringify(syntheticReceipt, null, 2)}\n`);
  const syntheticReceiptPath = publishImmutable(
    directory,
    `complex-log-batch-receipt-0-4-${sha(syntheticReceiptBytes)}.json`,
    syntheticReceiptBytes,
  ).path;
  assert.equal(readReceipt(syntheticReceiptPath).value.capsule.sha256, firstCapsule.digest);
  const fragmentDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "field3-complex-fragments-"),
  );
  const fragmentReceiptPaths = [];
  for (let column = 88; column < 92; column += 1) {
    const cells = ["2", "0", "0", "0", "0", "0", "0"];
    const fragment = makeFragment(88, 4, column, cells);
    const publishedFragment = publishFragment(fragmentDirectory, fragment);
    const fragmentReceipt = {
      schema: FRAGMENT_RECEIPT_SCHEMA,
      ...commonIdentity(),
      fragment: publishedFragment,
      parentSourceStart: 88,
      parentSourceCount: 4,
      parentSourceStop: 92,
      column,
      sourceStart: column,
      sourceCount: 1,
      sourceStop: column + 1,
      outputSha256: packedSha(cells),
      packedCells: CELLS_PER_COLUMN,
      state: [
        "0",
        String(TARGET_BITS),
        String(column),
        "1",
        "0",
        "0",
        "1",
        String(column + 1),
        String(TOTAL_COLUMNS - column - 1),
      ],
      runMilliseconds: 1,
      phaseMilliseconds: { nativeKernel: 1 },
      cacheKey: "synthetic-cache-key",
      coreBytes: 1,
      addonBytes: 1,
      wallMilliseconds: 2,
      peakAggregateRssKiB: 3,
      resourcePolicy: { abortGiB: 3.5, hardGiB: 4, timeoutSeconds: 600 },
    };
    const bytes = Buffer.from(`${JSON.stringify(fragmentReceipt, null, 2)}\n`);
    fragmentReceiptPaths.push(
      publishImmutable(
        fragmentDirectory,
        `complex-log-fragment-receipt-88-4-column-${column}-${sha(bytes)}.json`,
        bytes,
      ).path,
    );
  }
  assert.equal(
    findCapsules(fragmentDirectory).length,
    0,
    "column fragments must not publish an ordinary batch capsule",
  );
  const fragmentPlan = fragmentResumePlan(88, 4, fragmentDirectory);
  assert.equal(fragmentPlan.complete, 4);
  assert.equal(fragmentPlan.missing, 0);
  assert.equal(fragmentPlan.fragmentOnly, 0);
  const assembled = assembleFragments(
    88,
    4,
    fragmentReceiptPaths,
    fragmentDirectory,
  );
  assert.equal(findCapsules(fragmentDirectory).length, 1);
  assert.equal(assembled.sourceStart, 88);
  assert.equal(assembled.sourceCount, 4);
  assert.equal(assembled.packedCells, 28);
  assert.equal(assembled.assembledFromColumnFragments.length, 4);
  assert.equal(
    assembled.capsule.sha256,
    readCapsule(capsulePaths[22]).digest,
    "fragment assembly must reproduce the canonical direct 88:4 capsule bytes",
  );
  let negativeTests = 0;
  negativeTests += expectFailure(
    () => verifyCompleteCapsules(capsulePaths.slice(1), selectedPrefix),
    /76/,
  );
  negativeTests += expectFailure(
    () => verifyCompleteCapsules([capsulePaths[0], capsulePaths[0], ...capsulePaths.slice(2)], selectedPrefix),
    /overlap|scheduleIndex|sourceStart/,
  );
  fs.chmodSync(capsulePaths[0], 0o644);
  negativeTests += expectFailure(() => readCapsule(capsulePaths[0]), /0444/);
  fs.chmodSync(capsulePaths[0], 0o444);
  const incompatible = makeCapsule(0, 4, JSON.parse(fs.readFileSync(capsulePaths[0])).packedWeightedComplex.slice());
  incompatible.packedWeightedComplex[1] = incompatible.packedWeightedComplex[1] === "0" ? "1" : "0";
  const incompatiblePath = publishCapsule(directory, incompatible).path;
  negativeTests += expectFailure(
    () => verifyCompleteCapsules([incompatiblePath, ...capsulePaths.slice(1)], selectedPrefix),
    /selected-prefix mismatch/,
  );
  const wrongIdentity = JSON.parse(fs.readFileSync(capsulePaths[1]));
  wrongIdentity.preparedOwnerSha256 = "0".repeat(64);
  const wrongBytes = Buffer.from(`${JSON.stringify(wrongIdentity)}\n`);
  const wrongPath = publishImmutable(
    directory,
    `complex-log-batch-4-4-${sha(wrongBytes)}.json`,
    wrongBytes,
  ).path;
  negativeTests += expectFailure(() => readCapsule(wrongPath), /preparedOwnerSha256/);
  const badName = path.join(directory, `complex-log-batch-0-4-${"0".repeat(64)}.json`);
  fs.copyFileSync(capsulePaths[0], badName);
  fs.chmodSync(badName, 0o444);
  negativeTests += expectFailure(() => readCapsule(badName), /filename hash mismatch/);
  fs.chmodSync(syntheticReceiptPath, 0o644);
  negativeTests += expectFailure(() => readReceipt(syntheticReceiptPath), /0444/);
  fs.chmodSync(syntheticReceiptPath, 0o444);
  const rejectedAssemblyDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "field3-complex-rejected-assembly-"),
  );
  negativeTests += expectFailure(
    () =>
      assembleFragments(
        88,
        4,
        fragmentReceiptPaths.slice(1),
        rejectedAssemblyDirectory,
      ),
    /exactly 4/,
  );
  negativeTests += expectFailure(
    () =>
      assembleFragments(
        88,
        4,
        [fragmentReceiptPaths[1], fragmentReceiptPaths[0], ...fragmentReceiptPaths.slice(2)],
        rejectedAssemblyDirectory,
      ),
    /gap|overlap|out-of-order/,
  );
  negativeTests += expectFailure(
    () =>
      assembleFragments(
        88,
        4,
        [fragmentReceiptPaths[0], fragmentReceiptPaths[0], ...fragmentReceiptPaths.slice(2)],
        rejectedAssemblyDirectory,
      ),
    /gap|overlap|out-of-order|duplicate/,
  );
  assert.equal(
    findCapsules(rejectedAssemblyDirectory).length,
    0,
    "rejected fragment assemblies must not publish an ordinary batch capsule",
  );
  const firstFragmentPath = readFragmentReceipt(fragmentReceiptPaths[0]).fragment.path;
  fs.chmodSync(firstFragmentPath, 0o644);
  negativeTests += expectFailure(
    () => readFragmentReceipt(fragmentReceiptPaths[0]),
    /fragment is not 0444/,
  );
  fs.chmodSync(firstFragmentPath, 0o444);
  const fragmentBadName = path.join(
    fragmentDirectory,
    `complex-log-fragment-88-4-column-88-${"0".repeat(64)}.json`,
  );
  fs.copyFileSync(firstFragmentPath, fragmentBadName);
  fs.chmodSync(fragmentBadName, 0o444);
  negativeTests += expectFailure(
    () => readFragment(fragmentBadName),
    /fragment filename hash mismatch/,
  );
  const mutatedFragmentReceipt = JSON.parse(
    fs.readFileSync(fragmentReceiptPaths[0]),
  );
  mutatedFragmentReceipt.outputSha256 = "0".repeat(64);
  const mutatedFragmentReceiptBytes = Buffer.from(
    `${JSON.stringify(mutatedFragmentReceipt, null, 2)}\n`,
  );
  const mutatedFragmentReceiptPath = publishImmutable(
    fragmentDirectory,
    `complex-log-fragment-receipt-88-4-column-88-${sha(mutatedFragmentReceiptBytes)}.json`,
    mutatedFragmentReceiptBytes,
  ).path;
  negativeTests += expectFailure(
    () => readFragmentReceipt(mutatedFragmentReceiptPath),
    /outputSha256/,
  );
  return {
    schema: "sagejs-field3-complex-log-corpus-protocol-self-test-v1",
    scheduleBatches: EXPECTED_SCHEDULE.length,
    packedCells: verified.packedWeightedComplex.length,
    selectedPrefixColumns: verified.selectedPrefixColumns,
    prefixCompatibilitySha256: verified.prefixCompatibilitySha256,
    immutableCapsules: capsulePaths.length,
    immutableReceipts: 1,
    immutableMergeArtifacts: 2,
    immutableColumnFragments: fragmentReceiptPaths.length,
    fragmentAssemblyCapsuleSha256: assembled.capsule.sha256,
    negativeTests,
    expectedBatchRuntimeSeconds: { warm: [190, 230], cold: [210, 260] },
    expectedPeakAggregateRssKiB: [1450000, 1600000],
    estimatedSerialCorpusHours: [3.8, 4.8],
  };
}

async function commandLine() {
  const outputDirectory = path.resolve(argument("--output-directory", durableDirectory));
  if (process.argv.includes("--self-test")) {
    console.log(JSON.stringify(lightweightSelfTest(), null, 2));
    return;
  }
  if (process.argv.includes("--plan")) {
    console.log(JSON.stringify(resumablePlan(outputDirectory), null, 2));
    return;
  }
  if (process.argv.includes("--merge")) {
    const offset = process.argv.indexOf("--merge");
    const paths = process.argv.slice(offset + 1).filter((entry, index, all) =>
      entry !== "--output-directory" && (index === 0 || all[index - 1] !== "--output-directory"));
    assert(paths.length === 76, "merge requires exactly 76 ordered capsule paths");
    console.log(JSON.stringify(mergeCapsules(paths, outputDirectory), null, 2));
    return;
  }
  if (process.argv.includes("--fragment-plan")) {
    const parentSourceStart = Number(argument("--fragment-parent-start"));
    const parentSourceCount = Number(argument("--fragment-parent-count"));
    console.log(
      JSON.stringify(
        fragmentResumePlan(
          parentSourceStart,
          parentSourceCount,
          outputDirectory,
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (process.argv.includes("--assemble-fragments")) {
    const parentSourceStart = Number(argument("--fragment-parent-start"));
    const parentSourceCount = Number(argument("--fragment-parent-count"));
    const offset = process.argv.indexOf("--assemble-fragments");
    const paths = process.argv.slice(offset + 1);
    assert(
      paths.every((entry) => !entry.startsWith("--")),
      "fragment receipt paths must follow --assemble-fragments",
    );
    console.log(
      JSON.stringify(
        assembleFragments(
          parentSourceStart,
          parentSourceCount,
          paths,
          outputDirectory,
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (process.argv.includes("--fragment-parent-start")) {
    const parentSourceStart = Number(argument("--fragment-parent-start"));
    const parentSourceCount = Number(argument("--fragment-parent-count"));
    const column = Number(argument("--column"));
    scheduledRange(parentSourceStart, parentSourceCount);
    if (process.argv.includes("--worker")) {
      console.log(
        JSON.stringify(
          await executeFragment(parentSourceStart, parentSourceCount, column),
        ),
      );
      return;
    }
    const result = await monitoredFragment(
      parentSourceStart,
      parentSourceCount,
      column,
      outputDirectory,
    );
    console.log(
      JSON.stringify(publishFragmentReceipt(outputDirectory, result), null, 2),
    );
    return;
  }
  const sourceStart = Number(argument("--source-start"));
  const sourceCount = Number(argument("--count"));
  scheduledRange(sourceStart, sourceCount);
  if (process.argv.includes("--worker")) {
    console.log(JSON.stringify(await executeBatch(sourceStart, sourceCount)));
    return;
  }
  const result = await monitoredBatch(sourceStart, sourceCount, outputDirectory);
  const receipt = {
    schema: RECEIPT_SCHEMA,
    ...commonIdentity(),
    ...result,
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  const receiptSha256 = sha(receiptBytes);
  const publishedReceipt = publishImmutable(
    outputDirectory,
    `complex-log-batch-receipt-${sourceStart}-${sourceCount}-${receiptSha256}.json`,
    receiptBytes,
  );
  console.log(JSON.stringify({ ...receipt, receipt: publishedReceipt }, null, 2));
}

module.exports = {
  BATCH_SCHEMA,
  RECEIPT_SCHEMA,
  OWNER_SCHEMA,
  FRAGMENT_SCHEMA,
  FRAGMENT_RECEIPT_SCHEMA,
  EXPECTED_SCHEDULE,
  commonIdentity,
  makeCapsule,
  makeFragment,
  publishImmutable,
  publishCapsule,
  publishFragment,
  readCapsule,
  readReceipt,
  readFragment,
  readFragmentReceipt,
  verifyCompleteCapsules,
  ownerFromCapsules,
  mergeCapsules,
  assembleFragments,
  fragmentResumePlan,
  resumablePlan,
  lightweightSelfTest,
};

if (require.main === module) {
  commandLine().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
