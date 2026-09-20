import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const cases = JSON.parse(fs.readFileSync(path.join(here, "cases.json")));
const aggregate = JSON.parse(fs.readFileSync(path.join(here, "receipt.json")));

const schemaDirectory = path.join(here, "schemas");
const schemas = {
  cases: JSON.parse(fs.readFileSync(path.join(schemaDirectory, "cases.schema.json"))),
  vector: JSON.parse(fs.readFileSync(path.join(schemaDirectory, "vector.schema.json"))),
  native: JSON.parse(fs.readFileSync(path.join(schemaDirectory, "native-receipt.schema.json"))),
  aggregate: JSON.parse(fs.readFileSync(path.join(schemaDirectory, "aggregate-receipt.schema.json"))),
  common: JSON.parse(fs.readFileSync(path.join(root, "bench/pari-class-group-rust/qualification/schemas/common.schema.json"))),
  neutral: JSON.parse(fs.readFileSync(path.join(root, "bench/pari-class-group-rust/qualification/schemas/neutral-input.schema.json"))),
  browser: JSON.parse(fs.readFileSync(path.join(root, "bench/pari-class-group-rust/qualification/browser/receipt.schema.json"))),
};
const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
for (const [name, schema] of Object.entries(schemas)) {
  assert.ok(ajv.validateSchema(schema), `${name} is not a valid JSON Schema`);
  ajv.addSchema(schema);
}
function validate(name, value, filename) {
  const validator = ajv.getSchema(schemas[name].$id);
  assert.ok(validator(value), `${filename} schema failure:\n${JSON.stringify(validator.errors, null, 2)}`);
}

function bytes(relative) {
  return fs.readFileSync(path.join(root, relative));
}
function json(relative) {
  return JSON.parse(bytes(relative));
}
function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function checkIdentity(recorded) {
  const value = bytes(recorded.path);
  assert.equal(recorded.sha256, hash(value));
  assert.equal(recorded.bytes, value.byteLength);
}
function committed(relative) {
  return execFileSync("git", ["show", `${cases.artifactRevision}:${relative}`], {
    cwd: root,
    encoding: "utf8",
  });
}

assert.equal(aggregate.status, "pass");
assert.equal(aggregate.artifactRevision, cases.artifactRevision);
validate("cases", cases, "cases.json");
validate("aggregate", aggregate, "receipt.json");
assert.deepEqual(aggregate.fixedRow6Assumptions.productionRuntime, []);
assert.equal(aggregate.evidence.length, cases.cases.length * 2);
assert.match(aggregate.claims.scope, /not W0\/R5 or an end-to-end class-group result/);
assert.match(aggregate.claims.revisionPolicy, /later checkout HEAD is excluded/);

const runtimeRoots = [
  "bench/pari-class-group-rust/src",
  "bench/pari-class-group-rust/build.rs",
  "bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/src",
  "bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/build.rs",
  "bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/src",
  "bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/build.rs",
];
const runtimeFiles = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", cases.artifactRevision, "--", ...runtimeRoots],
  { cwd: root, encoding: "utf8" },
).trim().split("\n").filter((filename) => filename.endsWith(".rs"));
assert.equal(runtimeFiles.length, 33, "unexpected c4 first-party Rust source closure");
for (const filename of runtimeFiles) {
  const source = committed(filename);
  const marker = source.indexOf("#[cfg(test)]");
  const runtime = marker === -1 ? source : source.slice(0, marker);
  assert.doesNotMatch(
    runtime,
    /row6|ROW6|9_196|9196|1_130|1130|2_000_000_000_01[08]|200000000001[08]/,
  );
}

const artifacts = {
  "factor-base": {
    path: "bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/build/prepared-factor-base.wasm",
    sha256: "1bc6515472a34c559664840afa6f459432b58b8ea14025e5a82bc2188baecdec",
    bytes: 484386,
  },
  "relation-prefix": {
    path: "bench/pari-class-group-rust/qualification/wasm-prepared-relation-prefix/build/prepared-relation-prefix.wasm",
    sha256: "385e830caeb981ef1035b8c93b37c9ee76244dd1bedafd73bb0dea4e30309c43",
    bytes: 698053,
  },
};
const factorImports = [
  "environ_get", "environ_sizes_get", "fd_close", "fd_prestat_get",
  "fd_prestat_dir_name", "fd_seek", "fd_write", "proc_exit",
].map((name) => ({ module: "wasi_snapshot_preview1", name, kind: "function" }));
const relationImports = [
  "environ_get", "environ_sizes_get", "clock_time_get", "fd_close",
  "fd_prestat_get", "fd_prestat_dir_name", "fd_seek", "fd_write", "proc_exit",
].map((name) => ({ module: "wasi_snapshot_preview1", name, kind: "function" }));
const expectedExports = [
  { name: "memory", kind: "memory" },
  { name: "sagejs_class_group_abi_version", kind: "function" },
  { name: "sagejs_class_group_alloc", kind: "function" },
  { name: "sagejs_class_group_dealloc", kind: "function" },
  { name: "sagejs_class_group_run_json", kind: "function" },
];

const observedDigests = new Set();
for (const entry of aggregate.evidence) {
  const spec = cases.cases.find((item) => item.id === entry.fieldId);
  assert.ok(spec);
  assert.equal(entry.role, spec.role);
  for (const item of [entry.input, entry.native, entry.vector, entry.browser]) {
    checkIdentity(item);
  }
  const input = json(spec.input);
  const frozenInput = Buffer.from(committed(spec.input));
  assert.equal(hash(bytes(spec.input)), hash(frozenInput), `${spec.input} differs from frozen c4 input`);
  validate("neutral", input, spec.input);
  assert.equal(input.fieldId, entry.fieldId);
  assert.equal(input.containsOracleAnswers, false);
  assert.equal(input.preparation.kind, "neutral-prepared-field");
  const native = json(entry.native.path);
  const vector = json(entry.vector.path);
  const browser = json(entry.browser.path);
  validate("native", native, entry.native.path);
  validate("vector", vector, entry.vector.path);
  validate("browser", browser, entry.browser.path);
  assert.equal(native.repositoryRevision, cases.artifactRevision);
  assert.equal(native.sampleCount, 15);
  assert.equal(native.samplesMs.length, 15);
  assert.equal(native.medianMs, median(native.samplesMs));
  assert.equal(native.result.fieldId, entry.fieldId);
  assert.equal(native.inputPath, spec.input);
  assert.equal(native.caseRole, spec.role);
  assert.deepEqual(vector.expected, native.result);
  assert.equal(vector.id, `${entry.fieldId}-${entry.stage}`);
  const expectedArtifact = artifacts[entry.stage];
  assert.deepEqual(
    { path: entry.artifact.path, sha256: entry.artifact.sha256, bytes: entry.artifact.bytes },
    expectedArtifact,
  );
  assert.equal(entry.artifact.retained, true);
  assert.equal(entry.artifact.revision, cases.artifactRevision);
  checkIdentity(expectedArtifact);
  if (entry.stage === "factor-base") {
    assert.deepEqual(vector.request, input);
    assert.equal(native.boundary, "prepared-maximal-cubic-factor-base");
    assert.equal(native.result.stage, "prepared-maximal-cubic-factor-base");
    observedDigests.add(native.result.descriptorSha256);
  } else {
    assert.deepEqual(vector.request.preparedField, input);
    assert.deepEqual(
      {
        schema: vector.request.schema,
        maximumVisitedIdeals: vector.request.maximumVisitedIdeals,
        maximumCandidates: vector.request.maximumCandidates,
      },
      {
        schema: "sagejs.rust-class-group/prepared-relation-prefix-request-v1",
        maximumVisitedIdeals: 1,
        maximumCandidates: 64,
      },
    );
    assert.equal(native.boundary, "prepared-cubic-relation-prefix");
    assert.equal(native.result.stage, "prepared-cubic-relation-prefix");
    assert.equal(native.result.completeRankAndSurplus, false);
    observedDigests.add(native.result.prefixSha256);
  }
  assert.equal(browser.schema, "sagejs.rust-class-group-browser-route/v1");
  assert.equal(browser.status, "pass");
  assert.deepEqual(browser.failures, []);
  assert.equal(browser.repository_revision, cases.artifactRevision);
  assert.deepEqual(browser.artifact, expectedArtifact);
  assert.equal(browser.vector.sha256, hash(bytes(entry.vector.path)));
  assert.equal(browser.vector.path, entry.vector.path);
  assert.equal(vector.schema, "sagejs.rust-class-group-browser-vector/v1");
  assert.deepEqual(
    {
      id: browser.vector.id,
      request: browser.vector.request,
      expected: browser.vector.expected,
    },
    { id: vector.id, request: vector.request, expected: vector.expected },
  );
  assert.deepEqual(browser.requested_engines, ["chromium", "firefox", "webkit"]);
  assert.equal(browser.engines.length, 3);
  assert.deepEqual(new Set(browser.engines.map((engine) => engine.engine)), new Set(browser.requested_engines));
  assert.equal(new Set(browser.engines.map((engine) => engine.browser_version)).size, 3);
  assert.equal(new Set(browser.engines.map((engine) => engine.user_agent)).size, 3);
  assert.equal(Number.isNaN(Date.parse(browser.observed_at)), false);
  for (const engine of browser.engines) {
    assert.equal(engine.status, "pass");
    assert.equal(typeof engine.browser_version, "string");
    assert.equal(engine.browser_version.length > 0, true);
    assert.equal(typeof engine.user_agent, "string");
    assert.equal(engine.user_agent.length > 0, true);
    assert.match(
      engine.user_agent,
      engine.engine === "chromium" ? /Chrome\// : engine.engine === "firefox" ? /Firefox\// : /AppleWebKit\/.+Safari\//,
    );
    assert.equal(engine.route, "rust-class-group-wasm-artifact");
    assert.equal(engine.artifact_request_count, 1);
    assert.equal(engine.cross_origin_isolated, false);
    assert.equal(engine.shared_array_buffer, false);
    assert.deepEqual(engine.imports, entry.stage === "factor-base" ? factorImports : relationImports);
    assert.deepEqual(engine.exports, expectedExports);
    assert.equal(engine.failure, null);
    assert.equal(engine.timings_ms.call_samples.length, 15);
    assert.equal(engine.timings_ms.call, median(engine.timings_ms.call_samples));
    assert.deepEqual(engine.result, native.result);
    assert.equal(engine.memory_pages.after_call >= engine.memory_pages.before_call, true);
  }
  assert.deepEqual(entry.result, native.result);
  assert.equal(entry.nativeMedianMs, native.medianMs);
  assert.deepEqual(
    entry.browserMedianMs,
    Object.fromEntries(browser.engines.map((engine) => [engine.engine, engine.timings_ms.call])),
  );
  assert.deepEqual(
    entry.browserMemoryPages,
    Object.fromEntries(browser.engines.map((engine) => [engine.engine, engine.memory_pages])),
  );
}
assert.equal(observedDigests.size, cases.cases.length * 2);

const h1 = aggregate.evidence.find((item) => item.fieldId === "h1-real-cubic" && item.stage === "factor-base");
const row1 = aggregate.evidence.find((item) => item.fieldId === "row1-index-3-cubic" && item.stage === "factor-base");
const complex = aggregate.evidence.find((item) => item.fieldId === "complex-cubic-discriminant-minus-23" && item.stage === "factor-base");
assert.deepEqual(
  [h1.result.relationBound, h1.result.idealCount, row1.result.relationBound, row1.result.idealCount, complex.result.relationBound, complex.result.idealCount],
  [333, 66, 259, 51, 11, 3],
);
assert.deepEqual(json(cases.cases[1].input).preparation.indexPrimes, ["3"]);
assert.deepEqual(json(cases.cases[2].input).preparation.signature, { realPlaces: 1, complexPairs: 1 });

const evidenceJson = fs.readdirSync(here, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => entry.name)
  .sort();
assert.equal(evidenceJson.length, 14, "every top-level evidence JSON must be accounted for");
const vectorJson = fs.readdirSync(path.join(here, "vectors"))
  .filter((filename) => filename.endsWith(".json"))
  .sort();
assert.equal(vectorJson.length, 6, "every vector JSON must be accounted for");
assert.deepEqual(
  new Set(aggregate.evidence.map((entry) => path.basename(entry.vector.path))),
  new Set(vectorJson),
);

console.log(JSON.stringify({ status: "pass", fields: cases.cases.length, stages: 2, nativeSamples: 90, browserSamples: 270 }, null, 2));
