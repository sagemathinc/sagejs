// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  makeProfileFunctionIdentity,
  makeProfileRegionIdentity,
  makeProfileSourceIdentity,
  normalizedProfilePath,
  validProfileRegionIdentity,
  validProfileSourceIdentity,
} = require("../dist/tools/python/optimizer/profile-identity.js");

test("profile identities erase checkout roots and bind exact contents", () => {
  const left = makeProfileSourceIdentity("x = 1\n", "/tmp/a/src/lib/a.py", "/tmp/a");
  const right = makeProfileSourceIdentity("x = 1\n", "/work/b/src/lib/a.py", "/work/b");
  assert.deepEqual(left, right);
  assert.equal(normalizedProfilePath("/other/tree/a.py", "/tmp/a"), "<external>/a.py");
  assert.ok(validProfileSourceIdentity(left));
  assert.notEqual(
    makeProfileSourceIdentity("x = 2\n", "/tmp/a/src/lib/a.py", "/tmp/a").sha256,
    left.sha256,
  );
});

test("profile region identity includes semantic and compiler authority", () => {
  const source = makeProfileSourceIdentity("def f():\n    pass\n", "src/lib/a.py", process.cwd());
  const functionIdentity = makeProfileFunctionIdentity({
    sourceUnitId: source.id,
    qualifiedName: "f",
    kind: "function",
    semanticFingerprint: "function-body-v1",
    range: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 8 },
    ordinal: 1,
  });
  const options = {
    functionId: functionIdentity.id,
    kind: "python.ForIn",
    range: { startLine: 1, startColumn: 0, endLine: 2, endColumn: 8 },
    semanticFingerprint: "body-v1",
    ordinal: 1,
  };
  const first = makeProfileRegionIdentity(options);
  assert.deepEqual(first, makeProfileRegionIdentity(options));
  assert.ok(validProfileRegionIdentity(first));
  assert.notEqual(
    first.id,
    makeProfileRegionIdentity({ ...options, semanticFingerprint: "body-v2" }).id,
  );
  assert.equal(validProfileRegionIdentity({ ...first, id: "not-a-digest" }), false);
});
