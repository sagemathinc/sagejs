// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const common = require("../tools/optimizer-development/common.cjs");
const identity = require("../tools/optimizer-development/identity.cjs");
const reasons = require("../tools/optimizer-development/reason-codes.cjs");

const FIXTURES = path.join(__dirname, "fixtures", "optimizer-development", "schemas");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

function realIdentities() {
  const input = fixture("real-optimizer-region.json");
  const sourceUnit = identity.sourceUnitIdentity({
    path: input.sourcePath,
    digest: input.sourceDigest,
    language: "python",
  });
  const functionFingerprint = identity.semanticFingerprint(input.function.semanticStructure);
  const functionRecord = identity.functionIdentity({
    sourceUnitId: sourceUnit.id,
    qualifiedName: input.function.qualifiedName,
    kind: input.function.kind,
    semanticFingerprint: functionFingerprint,
    range: input.function.range,
    ordinal: input.function.ordinal,
  });
  const regionFingerprint = identity.semanticFingerprint(input.region.semanticStructure);
  const region = identity.semanticRegionIdentity({
    functionId: functionRecord.id,
    kind: input.region.kind,
    semanticFingerprint: regionFingerprint,
    range: input.region.range,
    ordinal: input.region.ordinal,
  });
  const compilerBundleId = common.contentIdentity("fixture.compiler-source/v1", {
    files: ["tools/python/optimizer/index.ts", "src/parse.ts"],
  });
  const compiler = identity.compilerIdentity({
    irSchema: "sagejs.optimizing-mathematics/v1",
    compilerSourceBundleId: compilerBundleId,
    frontendDigest: "1".repeat(64),
    catalogDigest: "2".repeat(64),
    optionsDigest: "3".repeat(64),
  });
  const decision = identity.decisionIdentity({
    regionId: region.id,
    passId: input.passId,
    compilerId: compiler.id,
  });
  return { sourceUnit, functionRecord, region, compiler, decision };
}

test("canonical JSON and identities are independent of property order", () => {
  assert.equal(common.canonicalJson({ z: 1, a: { d: 2, b: 3 } }),
    common.canonicalJson({ a: { b: 3, d: 2 }, z: 1 }));
  assert.equal(identity.semanticFingerprint({ z: 1, a: 2 }),
    identity.semanticFingerprint({ a: 2, z: 1 }));
  assert.match(identity.semanticFingerprint({ a: 2 }), /^sha256:[0-9a-f]{64}$/);
});

test("production optimizer names and AST kinds form deterministic identities", () => {
  const first = realIdentities();
  const second = realIdentities();
  assert.deepEqual(first, second);
  assert.equal(first.decision.passId, "math.bounded-integer-region.v1");
  assert.equal(first.region.kind, "AST_ForIn");
  assert.ok(Object.isFrozen(first.region));
  assert.ok(Object.isFrozen(first.region.range));
  assert.throws(() => {
    first.region.range.startLine = 99;
  }, TypeError);
});

test("source-bundle identities ignore checkout location", () => {
  const left = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-identity-left-"));
  const right = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-identity-right-"));
  try {
    for (const root of [left, right]) {
      fs.mkdirSync(path.join(root, "src", "lib"), { recursive: true });
      fs.writeFileSync(path.join(root, "src", "lib", "sample.py"), "def f(x):\n    return x + 1\n");
    }
    assert.deepEqual(
      identity.sourceBundleIdentity(left, ["src/lib/sample.py"]),
      identity.sourceBundleIdentity(right, ["src/lib/sample.py"]),
    );
  } finally {
    fs.rmSync(left, { recursive: true });
    fs.rmSync(right, { recursive: true });
  }
});

test("identity inputs reject host paths and malformed stable names", () => {
  assert.throws(() => identity.sourceUnitIdentity({
    path: "/tmp/source.py", digest: "0".repeat(64), language: "python",
  }), /repository-relative/);
  const { region, compiler } = realIdentities();
  assert.throws(() => identity.decisionIdentity({
    regionId: region.id, passId: "invalid pass", compilerId: compiler.id,
  }), /stable dot/);
});

test("predecessors require one unique semantic match", () => {
  const fingerprint = identity.semanticFingerprint({ kind: "AST_ForIn", operation: "+" });
  const current = {
    id: `sha256:${"a".repeat(64)}`,
    path: "src/lib/a.py",
    qualifiedName: "f",
    kind: "for-loop",
    semanticFingerprint: fingerprint,
  };
  const previous = { ...current, id: `sha256:${"b".repeat(64)}` };
  assert.equal(identity.linkPredecessor([previous], current), previous.id);
  assert.equal(identity.linkPredecessor([previous, { ...previous, id: `sha256:${"c".repeat(64)}` }], current), null);
});

test("the checked reason registry accepts structured and legacy detailed reasons", () => {
  assert.equal(reasons.DEFAULT_REASON_REGISTRY.schema,
    "sagejs.optimizer-reason-registry/v1");
  assert.deepEqual(
    reasons.validateReason("bounded-integer.unsupported-operation://"),
    { code: "bounded-integer.unsupported-operation", detail: { operator: "//" } },
  );
  assert.throws(() => reasons.validateReason({ code: "invented.reason", detail: {} }),
    /unknown reason code/);
  assert.throws(() => reasons.validateReason({
    code: "bounded-integer.unsupported-operation", detail: {},
  }), /fields must be exactly operator/);
});
