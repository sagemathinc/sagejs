"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const script = path.join(__dirname, "field3_high_precision_log_join.py");
const durable =
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const authoritySha =
  "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const initialSha =
  "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const preparedSha =
  "bc0dfbca45a575a381ba87371fb27906f68b34cedd025435986fad4c7c6287cf";
const normSha =
  "65e1bbd5c05b89b63d08d91e137c2ac68116db3df66073080d89ca4a55275f53";
const kernelSha =
  "87d2b07569daa31ebf62ce88c971dd0fbdf4e87e898509b9fe9d59d4da1e2007";
const prefixSha =
  "f0a842ef820888e76b4421684a98a3cfd4654c47dee8896d63f204df7e7174fd";
const realPrefixSha =
  "09b0a20f1f059757ee3ed347f693fed92fb6749c2d46aac872abcffdd244fde8";
const sourceDigests = {
  principalGeneratorsSha256:
    "31e9c9b4c0245417ce9265d5233d1a67fb717206e9811975cb85a59af03ab5de",
  relationMetadataSha256:
    "c751a9a91b9f17fc4047d8483e36d6ac6f9a0c1fe04ad072ed405f4a9c3a9f3b",
  relationRecordsSha256:
    "5df8c4bb02cd481965fdb01bac424f58d419216e3cefd4883ac985631da0e719",
};
const authority = path.join(durable, `authority-${authoritySha}.json`);
const initial = path.join(
  durable,
  `initial-collector-fixtures-${initialSha}.json`,
);
const realPrefix = path.join(
  durable,
  `real-log-columns-${realPrefixSha}.json`,
);
const complexPrefix = path.join(
  durable,
  "translated-log-columns",
  `complex-log-prefix-${prefixSha}.json`,
);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const packedSha = (values) => sha(values.map(String).join("\n"));

function run(args, expected = 0) {
  const result = spawnSync("python3", [script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

function publish(directory, stem, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = sha(bytes);
  const selected = path.join(directory, `${stem}-${digest}.json`);
  fs.writeFileSync(selected, bytes, { mode: 0o444 });
  fs.chmodSync(selected, 0o444);
  return { path: selected, digest };
}

function ranges(width) {
  const answer = [];
  for (let start = 0; start < 301; start += width) {
    answer.push({
      sourceStart: start,
      sourceCount: Math.min(width, 301 - start),
      sha256: sha(`synthetic protocol batch ${width} ${start}`),
    });
  }
  return answer;
}

function syntheticOwners(directory) {
  const realQualified = JSON.parse(fs.readFileSync(realPrefix, "utf8"));
  const complexQualified = JSON.parse(fs.readFileSync(complexPrefix, "utf8"));
  const dummy = ["9223372036854775808", "64", "0"];
  const realCells = [...realQualified.packedTriples];
  while (realCells.length < 301 * 6) realCells.push(...dummy, ...dummy);
  const complexCells = Array.from({ length: 301 }, (_, column) =>
    column < 26
      ? ["1", ...dummy, "0", "-1", "0"]
      : ["2", ...dummy, "0", "-1", "0"],
  );
  for (const record of complexQualified.columns)
    complexCells[record.column] = [...record.raw];
  const packedComplexCells = complexCells.flat();
  const common = {
    runIdentity: "pari-2.17.4:nfinit192->nfnewprec153088:field3",
    targetBits: 153088,
    totalColumns: 301,
    authoritySha256: authoritySha,
    initialOwnerSha256: initialSha,
    preparedOwnerSha256: preparedSha,
    sourceDigests,
  };
  const real = {
    schema: "sagejs.pari-class-group/real-log-column-owner-v1",
    ...common,
    sourceStart: 0,
    sourceCount: 301,
    sourceStop: 301,
    scalarColumns: 26,
    nonscalarColumns: 275,
    realPlaces: 2,
    layout:
      "source-column-major [real-place-0 triple, real-place-1 triple]; append weighted-complex triple to form 3x301 raw log order",
    packedTriples: realCells,
    batches: ranges(28),
  };
  const complexBatches = ranges(4).map((batch, scheduleIndex) => ({
    scheduleIndex,
    ...batch,
  }));
  const compatible = complexQualified.columns.flatMap((record) =>
    packedComplexCells.slice(7 * record.column, 7 * (record.column + 1)),
  );
  const complex = {
    schema: "sagejs.pari-class-group/field3-complex-log-column-owner-v1",
    ...common,
    layout:
      "source-column-major [kind, weighted-2logabs triple, weighted-2arg triple]",
    kernelSourceSha256: kernelSha,
    normConsequencesSha256: normSha,
    sourceStart: 0,
    sourceCount: 301,
    sourceStop: 301,
    scalarColumns: 26,
    nonscalarColumns: 275,
    packedWeightedComplex: packedComplexCells,
    selectedPrefixSha256: prefixSha,
    selectedPrefixColumns: 32,
    prefixCompatibilitySha256: packedSha(compatible),
    batches: complexBatches,
  };
  return {
    real,
    complex,
    realPublished: publish(directory, "real-log-columns-complete", real),
    complexPublished: publish(
      directory,
      "complex-log-columns-complete",
      complex,
    ),
  };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-log-join-"));
const outputDirectory = path.join(temporary, "published");

const prefix = JSON.parse(
  run([
    "--inspect-prefix",
    "--real-prefix",
    realPrefix,
    "--complex-prefix",
    complexPrefix,
    "--authority",
    authority,
    "--initial",
    initial,
  ]).stdout,
);
assert.deepEqual(prefix, {
  authoritySha256: authoritySha,
  commonScalarColumns: 26,
  complete: false,
  complexColumns: 32,
  complexPrefixSha256: prefixSha,
  initialOwnerSha256: initialSha,
  missingComplexColumns: 269,
  normConsequencesSha256: normSha,
  preparedOwnerSha256: preparedSha,
  published: false,
  realColumns: 28,
  realPrefixSha256: realPrefixSha,
  schema: "sagejs.pari-class-group/field3-raw-log-prefix-check-v1",
  status: "authenticated-prefix-only",
});
assert.equal(fs.existsSync(outputDirectory), false);

run(
  [
    "--inspect-prefix",
    "--real-prefix",
    realPrefix,
    "--complex-prefix",
    complexPrefix,
    "--authority",
    authority,
    "--initial",
    initial,
    "--output-directory",
    outputDirectory,
  ],
  1,
);
assert.equal(fs.existsSync(outputDirectory), false);

const synthetic = syntheticOwners(temporary);
const args = [
  "--real-owner",
  synthetic.realPublished.path,
  "--real-sha256",
  synthetic.realPublished.digest,
  "--complex-owner",
  synthetic.complexPublished.path,
  "--complex-sha256",
  synthetic.complexPublished.digest,
  "--authority",
  authority,
  "--initial",
  initial,
  "--output-directory",
  outputDirectory,
];
const joinedReceipt = JSON.parse(run(args).stdout);
assert.equal(joinedReceipt.sourceColumns, 301);
assert.equal(joinedReceipt.packedLogEntries, 903);
assert.equal(joinedReceipt.packedCells, 6321);
assert.equal(joinedReceipt.schema, "sagejs.pari-class-group/field3-raw-log-owner-v1");
assert.equal(fs.statSync(joinedReceipt.durablePath).mode & 0o777, 0o444);
assert.equal(sha(fs.readFileSync(joinedReceipt.durablePath)), joinedReceipt.sha256);
const joined = JSON.parse(fs.readFileSync(joinedReceipt.durablePath));
assert.equal(joined.packedLogs.length, 6321);
for (let column = 0; column < 301; column += 1) {
  const target = 21 * column;
  const realAt = 6 * column;
  const complexAt = 7 * column;
  assert.deepEqual(joined.packedLogs.slice(target, target + 7), [
    "1",
    ...synthetic.real.packedTriples.slice(realAt, realAt + 3),
    "0",
    "-1",
    "0",
  ]);
  assert.deepEqual(joined.packedLogs.slice(target + 7, target + 14), [
    "1",
    ...synthetic.real.packedTriples.slice(realAt + 3, realAt + 6),
    "0",
    "-1",
    "0",
  ]);
  assert.deepEqual(
    joined.packedLogs.slice(target + 14, target + 21),
    synthetic.complex.packedWeightedComplex.slice(complexAt, complexAt + 7),
  );
}

const publishedBefore = fs.readdirSync(outputDirectory).sort();
function rejectedMutation(stem, owner, mutate, replaceArgument, replacementDigest = true) {
  const changed = structuredClone(owner);
  mutate(changed);
  const published = publish(temporary, stem, changed);
  const changedArguments = [...args];
  const pathOffset = changedArguments.indexOf(replaceArgument);
  assert(pathOffset >= 0);
  changedArguments[pathOffset] = published.path;
  if (replacementDigest) changedArguments[pathOffset + 2] = published.digest;
  run(changedArguments, 1);
  assert.deepEqual(fs.readdirSync(outputDirectory).sort(), publishedBefore);
}

rejectedMutation(
  "real-log-columns-complete",
  synthetic.real,
  (owner) => owner.batches.reverse(),
  synthetic.realPublished.path,
);
rejectedMutation(
  "real-log-columns-complete",
  synthetic.real,
  (owner) => {
    owner.targetBits = 153024;
  },
  synthetic.realPublished.path,
);
rejectedMutation(
  "complex-log-columns-complete",
  synthetic.complex,
  (owner) => {
    owner.normConsequencesSha256 = "0".repeat(64);
  },
  synthetic.complexPublished.path,
);
rejectedMutation(
  "complex-log-columns-complete",
  synthetic.complex,
  (owner) => {
    owner.packedWeightedComplex[1] =
      owner.packedWeightedComplex[1] === "0" ? "1" : "0";
  },
  synthetic.complexPublished.path,
);
// A mutation with a newly named file still cannot replace the separately
// authorized expected owner digest.
rejectedMutation(
  "complex-log-columns-complete",
  synthetic.complex,
  (owner) => {
    owner.packedWeightedComplex[7 * 100 + 1] = "1";
  },
  synthetic.complexPublished.path,
  false,
);

console.log(
  JSON.stringify({
    schema: "sagejs-field3-high-precision-log-join-check-v1",
    prefixAuthenticated: true,
    syntheticFullProtocol: true,
    realInputCells: 1806,
    complexInputCells: 2107,
    packedLogEntries: 903,
    outputCells: 6321,
    exactNormConsequences: 301,
    scalarIdentities: 26,
    failAtomicMutations: 5,
    completeOwnerPublishedFromRealData: false,
  }),
);
