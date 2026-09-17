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

async function executeBatch(sourceStart, sourceCount) {
  scheduledRange(sourceStart, sourceCount);
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const { owner, initial, sourceDigests } = authenticatedOwners();
  const prepared = preparedOwner();
  assert.deepEqual(
    prepared.value.tensor.map(BigInt),
    initial.basisTable.map(BigInt),
  );
  authenticateNormConsequences(owner, initial.basisTable);
  const built = await compileKernel({ sourcePath: kernelSourcePath });
  const api = require(built.modulePath).pari_field3_complex_log_columns;
  assert(api.nativeAvailable);
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
  const packedWeightedComplex = values(storage.raw).map(String);
  const capsule = makeCapsule(sourceStart, sourceCount, packedWeightedComplex);
  assert.deepEqual(capsule.sourceDigests, sourceDigests);
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
  const published = publishCapsule(capsuleDirectory, capsule);
  return {
    capsule: published,
    sourceStart,
    sourceCount,
    sourceStop: sourceStart + sourceCount,
    outputSha256: packedSha(packedWeightedComplex),
    packedCells: packedWeightedComplex.length,
    state: state.map(String),
    runMilliseconds,
    cacheKey: built.cacheKey,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    addonBytes: fs.statSync(built.addonPath).size,
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

function monitoredBatch(sourceStart, sourceCount, outputDirectory) {
  scheduledRange(sourceStart, sourceCount);
  return new Promise((resolve, reject) => {
    const child = spawn(
      "prlimit",
      [
        `--as=${HARD_RSS_KIB * 1024}`,
        "--",
        process.execPath,
        __filename,
        "--worker",
        "--source-start",
        String(sourceStart),
        "--count",
        String(sourceCount),
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
        reject(new Error(`field3 complex batch failed code=${code} signal=${signal} peak=${peakAggregateRssKiB}\n${stderr}`));
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
  return {
    schema: "sagejs-field3-complex-log-corpus-protocol-self-test-v1",
    scheduleBatches: EXPECTED_SCHEDULE.length,
    packedCells: verified.packedWeightedComplex.length,
    selectedPrefixColumns: verified.selectedPrefixColumns,
    prefixCompatibilitySha256: verified.prefixCompatibilitySha256,
    immutableCapsules: capsulePaths.length,
    immutableReceipts: 1,
    immutableMergeArtifacts: 2,
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
  EXPECTED_SCHEDULE,
  commonIdentity,
  makeCapsule,
  publishImmutable,
  publishCapsule,
  readCapsule,
  readReceipt,
  verifyCompleteCapsules,
  ownerFromCapsules,
  mergeCapsules,
  resumablePlan,
  lightweightSelfTest,
};

if (require.main === module) {
  commandLine().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
