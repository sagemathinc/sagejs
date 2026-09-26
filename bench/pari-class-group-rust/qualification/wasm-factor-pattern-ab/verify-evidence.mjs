import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const revision = "c4d07156194765506d137792732ba5109cd8c87e";
const q = "bench/pari-class-group-rust/qualification";
const ab = `${q}/wasm-factor-pattern-ab`;
const factorBase = `${q}/wasm-prepared-factor-base`;
const relationPrefix = `${q}/wasm-prepared-relation-prefix`;

function bytes(filename) {
  return fs.readFileSync(path.resolve(root, filename));
}

function json(filename) {
  return JSON.parse(bytes(filename));
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function identity(filename) {
  const value = bytes(filename);
  return { sha256: hash(value), bytes: value.byteLength };
}

function absoluteIdentity(filename) {
  const value = fs.readFileSync(filename);
  return { sha256: hash(value), bytes: value.byteLength };
}

function median(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function assertIdentity(actual, filename) {
  const expected = identity(filename);
  assert.equal(actual.path, filename);
  assert.equal(actual.sha256, expected.sha256, `${filename} SHA-256 is stale`);
  assert.equal(actual.bytes, expected.bytes, `${filename} byte count is stale`);
}

function assertFrozenIdentity(actual) {
  assert.equal(typeof actual.path, "string");
  assert.match(actual.sha256, /^[0-9a-f]{64}$/);
  assert.equal(Number.isSafeInteger(actual.bytes) && actual.bytes > 0, true);
}

function assertCommittedClosure(entries) {
  assert.equal(Array.isArray(entries) && entries.length > 0, true);
  for (const entry of entries) {
    assertFrozenIdentity(entry);
    const value = execFileSync("git", ["show", `${revision}:${entry.path}`], {
      cwd: root,
    });
    assert.equal(entry.sha256, hash(value), `${entry.path} is not from ${revision}`);
    assert.equal(entry.bytes, value.byteLength);
  }
}

function assertSamples(samples, recordedMedian, count = 15) {
  assert.equal(samples.length, count);
  assert.equal(samples.every((sample) => Number.isFinite(sample) && sample > 0), true);
  assert.equal(recordedMedian, median(samples));
}

function assertBrowserReceipt(filename, expected) {
  const receipt = json(filename);
  assert.equal(receipt.schema, "sagejs.rust-class-group-browser-route/v1");
  assert.equal(receipt.status, "pass");
  assert.equal(receipt.repository_revision, expected.revision ?? revision);
  assert.equal(Number.isNaN(Date.parse(receipt.observed_at)), false);
  assert.deepEqual(receipt.requested_engines, ["chromium", "firefox", "webkit"]);
  assert.deepEqual(receipt.failures, []);
  assert.equal(receipt.engines.length, 3);
  assert.deepEqual(
    receipt.engines.map(({ engine }) => engine),
    ["chromium", "firefox", "webkit"],
  );
  for (const engine of receipt.engines) {
    assert.equal(engine.status, "pass");
    assert.equal(typeof engine.browser_version, "string");
    assert.equal(engine.browser_version.length > 0, true);
    assertSamples(engine.timings_ms.call_samples, engine.timings_ms.call);
    assert.deepEqual(engine.result, receipt.vector.expected);
    assert.equal(engine.result[expected.digestField], expected.digest);
    if (expected.pages) assert.deepEqual(engine.memory_pages, expected.pages);
  }
  return receipt;
}

function assertNativeReceipt(filename, expected) {
  const receipt = json(filename);
  assert.equal(receipt.status, "pass");
  assert.equal(receipt.repositoryRevision, revision);
  assert.equal(Number.isNaN(Date.parse(receipt.observedAt)), false);
  for (const key of ["hostname", "platform", "release", "architecture", "uname"]) {
    assert.equal(typeof receipt.host[key], "string");
    assert.equal(receipt.host[key].length > 0, true);
  }
  assert.match(receipt.tools.rustc, /^rustc /);
  assert.match(receipt.tools.cargo, /^cargo /);
  assert.match(receipt.tools.cc, /gcc|cc/i);
  assertFrozenIdentity(receipt.executable);
  assert.equal(receipt.executable.retained, false);
  assert.match(receipt.executable.identitySemantics, /exact measured binary/);
  assert.match(receipt.executable.identitySemantics, /not a claim.*reopened/);
  assertCommittedClosure(receipt.sourceClosure);
  for (const library of receipt.nativeLibraries) {
    assertFrozenIdentity(library);
    const current = absoluteIdentity(path.resolve(root, library.path));
    assert.equal(library.sha256, current.sha256, `${library.path} is stale`);
    assert.equal(library.bytes, current.bytes);
  }
  if (receipt.modes) {
    assert.equal(receipt.modes.length, 2);
    for (const mode of receipt.modes) {
      assertSamples(mode.samplesMs, mode.medianMs);
      assert.equal(mode.result.digestSha256, expected.digest);
      assert.equal(mode.result.rationalPrimeCount, 1139);
      assert.equal(mode.result.factorCount, 2066);
    }
  } else {
    assert.equal(receipt.sampleCount, 15);
    assertSamples(receipt.samplesMs, receipt.medianMs);
    assert.equal(receipt.result[expected.digestField], expected.digest);
  }
  return receipt;
}

function assertHistoricalNative(receipt, expected) {
  assert.equal(receipt.schema, expected.schema);
  assert.equal(receipt.status, "pass");
  assert.equal(receipt.boundary, expected.boundary);
  assert.equal(receipt.sampleCount, 15);
  assertSamples(receipt.samplesMs, receipt.medianMs);
  assert.equal(receipt.result.schema, expected.resultSchema);
  assert.equal(receipt.result.status, "bounded-stage");
  assert.equal(receipt.result.stage, expected.boundary);
  assert.equal(receipt.result[expected.digestField], expected.digest);
}

function assertHistoricalIdentity(group, expected) {
  assert.match(group.receiptCommit, /^[0-9a-f]{40}$/);
  assert.match(group.measuredRevision, /^[0-9a-f]{40}$/);
  assert.match(group.revisionProvenance, /committed together/);
  assert.match(group.revisionProvenance, /predates embedded revision metadata/);
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", group.measuredRevision, group.receiptCommit],
    { cwd: root },
  );
  for (const recorded of [group.native, group.browser]) {
    assertIdentity(recorded, recorded.path);
    const committed = execFileSync(
      "git",
      ["show", `${group.receiptCommit}:${recorded.path}`],
      { cwd: root },
    );
    assert.equal(recorded.sha256, hash(committed));
    assert.equal(recorded.bytes, committed.byteLength);
  }
  const native = json(group.native.path);
  const browser = assertBrowserReceipt(group.browser.path, {
    ...expected,
    revision: group.measuredRevision,
  });
  assertHistoricalNative(native, expected);
  assert.deepEqual(native.result, browser.vector.expected);
  return { native, browser };
}

const optimization = json(`${ab}/optimization-receipt.json`);
assert.equal(
  optimization.schema,
  "sagejs.rust-class-group/factor-pattern-optimization-evidence-v2",
);
assert.equal(optimization.status, "pass");
assert.equal(optimization.repositoryRevision, revision);
assert.equal(Number.isNaN(Date.parse(optimization.observedAt)), false);

for (const closureEntries of Object.values(optimization.sourceClosure)) {
  assertCommittedClosure(closureEntries);
}
const requiredClosurePaths = [
  "bench/pari-class-group-rust/src/factor_base.rs",
  "bench/pari-class-group-rust/src/prepared_factor_base.rs",
  `${ab}/Cargo.lock`,
  `${factorBase}/Cargo.lock`,
  `${relationPrefix}/Cargo.lock`,
  `${ab}/build-wasm.sh`,
  `${factorBase}/build-wasm.sh`,
  `${relationPrefix}/build-wasm.sh`,
  `${q}/browser/run-browser.mjs`,
  `${q}/browser/class-group-route.mjs`,
  `${q}/browser/browser-loader.mjs`,
  "packages/flint-wasm/src/wasi-runtime.mjs",
  "packages/flint-wasm/src/wasi-constants.mjs",
  "packages/flint-wasm/src/wasi-filesystem.mjs",
  "package.json",
  "pnpm-lock.yaml",
];
const closurePaths = new Set(
  Object.values(optimization.sourceClosure).flatMap((entries) =>
    entries.map(({ path: filename }) => filename),
  ),
);
for (const filename of requiredClosurePaths) {
  assert.equal(closurePaths.has(filename), true, `missing closure input ${filename}`);
}
assert.deepEqual(
  optimization.sourceClosure.browserHarness.map(({ path: filename }) => filename).sort(),
  [
    `${q}/browser/run-browser.mjs`,
    `${q}/browser/class-group-route.html`,
    `${q}/browser/class-group-route.mjs`,
    `${q}/browser/browser-loader.mjs`,
    "packages/flint-wasm/test/browser-wasm-support.mjs",
    "packages/flint-wasm/src/wasi-runtime.mjs",
    "packages/flint-wasm/src/wasi-constants.mjs",
    "packages/flint-wasm/src/wasi-filesystem.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "packages/flint-wasm/package.json",
  ].sort(),
  "browser runtime closure is incomplete or unexpectedly expanded",
);

for (const value of Object.values(optimization.evidence)) {
  assertIdentity(value, value.path);
}

const patternDigest = optimization.workload.factorPatternDigestSha256;
const factorDigest = optimization.workload.factorBaseDescriptorSha256;
const relationDigest = optimization.workload.relationPrefixSha256;
const baseline = assertBrowserReceipt(`${ab}/baseline.browser-receipt.json`, {
  digestField: "digestSha256",
  digest: patternDigest,
});
const bounded = assertBrowserReceipt(`${ab}/bounded-i64.browser-receipt.json`, {
  digestField: "digestSha256",
  digest: patternDigest,
});
assert.deepEqual(baseline.artifact, bounded.artifact);
assert.equal(baseline.vector.request.mode, "baseline");
assert.equal(bounded.vector.request.mode, "bounded-i64");

const factorBrowser = assertBrowserReceipt(`${factorBase}/optimized-receipt.json`, {
  digestField: "descriptorSha256",
  digest: factorDigest,
  pages: { before_call: 17, after_call: 33 },
});
const relationBrowser = assertBrowserReceipt(
  `${relationPrefix}/factor-pattern-optimized-receipt.json`,
  {
    digestField: "prefixSha256",
    digest: relationDigest,
    pages: { before_call: 18, after_call: 258 },
  },
);
const abNative = assertNativeReceipt(`${ab}/native-receipt.json`, {
  digest: patternDigest,
});
const factorNative = assertNativeReceipt(`${factorBase}/optimized-native-receipt.json`, {
  digestField: "descriptorSha256",
  digest: factorDigest,
});
const relationNative = assertNativeReceipt(
  `${relationPrefix}/factor-pattern-optimized-native-receipt.json`,
  { digestField: "prefixSha256", digest: relationDigest },
);
const factorHistorical = assertHistoricalIdentity(
  optimization.historicalEvidence.preparedFactorBase,
  {
    schema: "sagejs.rust-class-group/native-prepared-factor-base-benchmark-v1",
    boundary: "prepared-maximal-cubic-factor-base",
    resultSchema: "sagejs.rust-class-group/prepared-factor-base-v1",
    digestField: "descriptorSha256",
    digest: factorDigest,
    pages: { before_call: 17, after_call: 33 },
  },
);
const relationHistorical = assertHistoricalIdentity(
  optimization.historicalEvidence.relationPrefix,
  {
    schema: "sagejs.rust-class-group/native-prepared-relation-prefix-benchmark-v1",
    boundary: "prepared-cubic-relation-prefix",
    resultSchema: "sagejs.rust-class-group/prepared-relation-prefix-v1",
    digestField: "prefixSha256",
    digest: relationDigest,
    pages: { before_call: 18, after_call: 258 },
  },
);

assert.deepEqual(
  optimization.comparisons.factorPattern.native,
  Object.fromEntries(abNative.modes.map((mode) => [mode.mode, mode.medianMs])),
);
assert.equal(
  optimization.comparisons.preparedFactorBase.after.native,
  factorNative.medianMs,
);
assert.equal(
  optimization.comparisons.relationPrefix.after.native,
  relationNative.medianMs,
);
assert.equal(
  optimization.comparisons.preparedFactorBase.before.native,
  factorHistorical.native.medianMs,
);
assert.equal(
  optimization.comparisons.relationPrefix.before.native,
  relationHistorical.native.medianMs,
);
for (const [name, receipt, comparison] of [
  ["factor pattern baseline", baseline, optimization.comparisons.factorPattern.browserBaseline],
  ["factor pattern bounded", bounded, optimization.comparisons.factorPattern.browserBoundedI64],
  ["factor base", factorBrowser, optimization.comparisons.preparedFactorBase.after.browser],
  ["relation prefix", relationBrowser, optimization.comparisons.relationPrefix.after.browser],
]) {
  assert.deepEqual(
    comparison,
    Object.fromEntries(receipt.engines.map((engine) => [engine.engine, engine.timings_ms.call])),
    `${name} comparison is stale`,
  );
}
for (const [name, receipt, comparison] of [
  ["historical factor base", factorHistorical.browser, optimization.comparisons.preparedFactorBase.before.browser],
  ["historical relation prefix", relationHistorical.browser, optimization.comparisons.relationPrefix.before.browser],
]) {
  assert.deepEqual(
    comparison,
    Object.fromEntries(receipt.engines.map((engine) => [engine.engine, engine.timings_ms.call])),
    `${name} comparison is stale`,
  );
}

const toolchain = optimization.buildClosure;
assert.match(toolchain.rustc, /^rustc /);
assert.match(toolchain.cargo, /^cargo /);
assert.equal(
  toolchain.toolchainDigest,
  "37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c",
);
assertFrozenIdentity(toolchain.toolchainReceipt);
assertFrozenIdentity(toolchain.toolchain.gmp.artifact);
assertFrozenIdentity(toolchain.toolchain.mpfr.artifact);
const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const toolchainRoot = path.resolve(
  root,
  common,
  "sagejs-wasm-toolchains/v2",
  toolchain.toolchainDigest,
);
for (const [recorded, filename] of [
  [toolchain.toolchainReceipt, path.join(toolchainRoot, "receipt.json")],
  [toolchain.toolchain.gmp.artifact, path.join(toolchainRoot, "prefixes/gmp/lib/libgmp.a")],
  [toolchain.toolchain.mpfr.artifact, path.join(toolchainRoot, "prefixes/mpfr/lib/libmpfr.a")],
]) {
  const current = absoluteIdentity(filename);
  assert.equal(recorded.sha256, current.sha256, `${recorded.path} is stale`);
  assert.equal(recorded.bytes, current.bytes);
}
for (const artifact of Object.values(toolchain.artifacts)) assertFrozenIdentity(artifact);
for (const vector of Object.values(toolchain.vectors)) {
  assert.match(vector.sha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof vector.id, "string");
}
assert.deepEqual(toolchain.artifacts.factorPattern, baseline.artifact);
assert.deepEqual(toolchain.artifacts.preparedFactorBase, factorBrowser.artifact);
assert.deepEqual(toolchain.artifacts.relationPrefix, relationBrowser.artifact);
assert.deepEqual(toolchain.vectors.factorPatternBaseline, baseline.vector);
assert.deepEqual(toolchain.vectors.factorPatternBoundedI64, bounded.vector);
assert.deepEqual(toolchain.vectors.preparedFactorBase, factorBrowser.vector);
assert.deepEqual(toolchain.vectors.relationPrefix, relationBrowser.vector);

console.log(
  JSON.stringify(
    {
      status: "pass",
      revision,
      samples: { native: 60, browser: 180 },
      digests: { factorPattern: patternDigest, factorBase: factorDigest, relationPrefix: relationDigest },
    },
    null,
    2,
  ),
);
