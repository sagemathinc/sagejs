"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  privateIntegerBufferLayoutDigest,
  resolvePrivateIntegerBufferLayout,
} = require("../private-integer-buffer-layout.cjs");

function fixture() {
  const root = {
    name: "root",
    params: [
      { name: "written", type: "IntegerBuffer" },
      { name: "readonly", type: "IntegerBuffer" },
      { name: "value", type: "Integer" },
    ],
    body: [
      { kind: "integer.buffer.set", buffer: "written", index: "zero", value: "value" },
      { kind: "integer.buffer.get", buffer: "readonly", index: "zero", target: "x" },
      { kind: "return", value: "x", type: "Integer" },
    ],
  };
  const expected = {
    parameterSha256: privateIntegerBufferLayoutDigest([
      ["written", "IntegerBuffer"], ["readonly", "IntegerBuffer"],
    ]),
    candidateSha256: privateIntegerBufferLayoutDigest(["written"]),
    integerBuffers: 2,
    candidates: 1,
    rejected: 0,
    public: 1,
  };
  return {
    functions: [root],
    root,
    manifest: {
      schema: "sagejs.private-integer-buffer-layout/v1",
      name: "test-layout-v1",
      root: "root",
      selection: "written-proven-private",
      expected,
    },
  };
}

test("named layout selects all and only proven written private buffers", () => {
  const { functions, root, manifest } = fixture();
  const layout = resolvePrivateIntegerBufferLayout(functions, root, manifest);
  assert.deepEqual(layout.candidates, ["written"]);
  assert.deepEqual(layout.publicBuffers, ["readonly"]);
  assert.deepEqual(layout.rejected, []);
});

test("layout identity, shape, authority, and expected counts fail closed", () => {
  for (const mutate of [
    (value) => { value.manifest.name = ""; },
    (value) => { value.manifest.root = "other"; },
    (value) => { value.manifest.expected.candidates = 2; },
    (value) => { value.manifest.expected.candidateSha256 = "0".repeat(64); },
    (value) => {
      value.root.body[0] = { kind: "integer.buffer.raw_limbs", buffer: "written" };
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.equal(resolvePrivateIntegerBufferLayout(
      value.functions, value.root, value.manifest,
    ), undefined);
  }
});
