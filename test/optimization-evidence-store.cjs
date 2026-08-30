// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { attachIdentity, sha256 } = require("../tools/optimizer-development/common.cjs");
const contracts = require("../tools/optimization-engine/contracts.cjs");
const store = require("../tools/optimization-engine/evidence-store.cjs");

const id = (name) => `sha256:${sha256(name)}`;
const digest = (name) => sha256(name);

function workload(name) {
  return contracts.createDocument("workload", {
    authority: {
      kind: "reviewed-contract",
      producer: "test.evidence-store",
      validatedInputIds: [],
    },
    sourceClosureId: id(`${name}-source`),
    title: name,
    owner: "optimization-engine",
    role: name === "held-out" ? "held-out" : "representative",
    publicEntry: {
      path: `bench/optimizer-workloads/${name}.py`,
      name: `public.${name}`,
      mode: "sage",
      outputBoundary: "complete public output",
    },
    runner: {
      path: `bench/optimizer-workloads/${name}.cjs`,
      argv: [name],
      environment: [],
    },
    corpus: { id: name, digest: digest(`${name}-corpus`), provenance: "fixture" },
    oracles: [{
      id: "exact",
      kind: "invariant",
      digest: digest(`${name}-oracle`),
      provenance: "independent fixture",
    }],
    phases: [{
      id: "production", label: "complete call", parentId: null,
      timing: "inclusive", mayOverlap: false,
    }],
    protocol: {
      warmupRuns: 3, repetitions: 11, timeoutMilliseconds: 1000,
      reset: "process", preparation: "warm-prepared",
    },
    platforms: ["linux-x64"],
    browsers: [],
    instrumentation: ["inclusive-timer"],
    materiality: { minimumWorstPairFraction: 0.1, minimumPairs: 11 },
  });
}

test("canonical evidence streams ignore input and property ordering", () => {
  const left = workload("representative");
  const right = workload("held-out");
  const forward = store.canonicalRecordStream([left, right]);
  const reverse = store.canonicalRecordStream([right, left]);
  assert.equal(forward.logicalId, reverse.logicalId);
  assert.deepEqual(forward.bytes, reverse.bytes);
  assert.equal(store.parseCanonicalRecordStream(forward.bytes).logicalId, forward.logicalId);
});
test("noncanonical, duplicate, and trailing evidence records fail closed", () => {
  const document = workload("representative");
  const stream = store.canonicalRecordStream([document]);
  const noncanonical = stream.bytes.toString("utf8").replace(
    '{"kind":"header","schema":',
    '{"schema":',
  );
  assert.throws(() => store.parseCanonicalRecordStream(noncanonical), /header/);

  const lines = stream.bytes.toString("utf8").trimEnd().split("\n");
  assert.throws(
    () => store.parseCanonicalRecordStream(`${lines.join("\n")}\n${lines[1]}\n`),
    /strictly sorted|duplicate/,
  );
  assert.throws(
    () => store.parseCanonicalRecordStream(`${stream.bytes.toString("utf8")}garbage`),
    /newline|JSON/,
  );
});

test("SQLite is a derived query view with an exact NDJSON round trip", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-optimization-store-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const documents = [workload("representative"), workload("held-out")];
  const stream = store.canonicalRecordStream(documents);
  const filename = path.join(directory, "evidence.sqlite");
  store.createDatabase(filename, stream);
  assert.equal(store.readDatabase(filename).logicalId, stream.logicalId);

  const { DatabaseSync } = require("node:sqlite");
  const database = new DatabaseSync(filename);
  database.prepare("UPDATE metadata SET value = ? WHERE key = 'logical_id'").run(id("fake"));
  database.close();
  assert.throws(() => store.readDatabase(filename), /logical identity is stale/);
});

test("store assets have separate physical hashes from the logical identity", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-optimization-assets-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const manifest = store.writeStore(directory, [workload("representative")]);
  assert.match(manifest.logicalId, /^sha256:/);
  assert.deepEqual(manifest.assets.map((asset) => asset.kind), [
    "canonical-ndjson", "sqlite-query-database",
  ]);
  for (const asset of manifest.assets) {
    assert.equal(fs.existsSync(path.join(directory, asset.name)), true);
    assert.notEqual(`sha256:${asset.sha256}`, manifest.logicalId);
  }
});

test("unknown v2 schemas remain inadmissible store records", () => {
  const counterfeit = attachIdentity("sagejs.optimization-unknown/v2", { value: 1 });
  assert.throws(() => store.canonicalRecordStream([counterfeit]), /unknown schema/);
});
