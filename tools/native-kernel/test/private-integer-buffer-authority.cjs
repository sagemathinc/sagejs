"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  privateIntegerBufferPlan,
  privateIntegerBufferPlanAuthorized,
} = require("../private-integer-buffer-authority.cjs");

function fixture() {
  const root = {
    name: "root",
    params: [
      { name: "scratch", type: "IntegerBuffer" },
      { name: "value", type: "Integer" },
    ],
    body: [
      { kind: "integer.buffer.set", buffer: "scratch", index: "zero", value: "value" },
      { kind: "native.call", function: "leaf", args: ["scratch"] },
      { kind: "return", value: "value", type: "Integer" },
    ],
  };
  const leaf = {
    name: "leaf",
    params: [{ name: "scratch", type: "IntegerBuffer" }],
    body: [{ kind: "integer.buffer.get", buffer: "scratch", index: "zero", target: "x" }],
  };
  return { functions: [root, leaf], root, leaf };
}

test("authorizes only the complete closed private graph", () => {
  const { functions, root, leaf } = fixture();
  const claim = privateIntegerBufferPlan(functions, root, ["scratch"]);
  assert.equal(claim.authority, "private-integer-buffer-v1");
  assert.deepEqual(claim.canonicalizeAt,
    ["public-output", "raw-hash", "resume", "ffi", "fallback"]);
  assert.equal(privateIntegerBufferPlanAuthorized(functions, root, claim), true);
  leaf.body[0].index = "one";
  assert.equal(privateIntegerBufferPlanAuthorized(functions, root, claim), false);
});

test("revokes on unknown calls, raw access, alias escape, and fallback", () => {
  for (const mutation of [
    ({ root }) => { root.body[1].function = "unknown"; },
    ({ root }) => { root.body[0] = { kind: "integer.buffer.raw_limbs", buffer: "scratch" }; },
    ({ root }) => { root.body[2] = { kind: "return", value: "scratch", type: "IntegerBuffer" }; },
    ({ root }) => { root.body[0] = { kind: "fallback.call", argument: "scratch" }; },
  ]) {
    const value = fixture();
    mutation(value);
    assert.equal(privateIntegerBufferPlan(value.functions, value.root, ["scratch"]), undefined);
  }
});

test("views remain private but any later escape rejects the plan", () => {
  const { functions, root } = fixture();
  root.body.splice(1, 0, {
    kind: "integer.buffer.view", buffer: "scratch", target: "window",
    start: "zero", length: "one",
  });
  root.body.splice(2, 0, {
    kind: "integer.buffer.set", buffer: "window", index: "zero", value: "value",
  });
  const claim = privateIntegerBufferPlan(functions, root, ["scratch"]);
  assert.equal(privateIntegerBufferPlanAuthorized(functions, root, claim), true);
  root.body.push({ kind: "return", value: "window", type: "IntegerBuffer" });
  assert.equal(privateIntegerBufferPlan(functions, root, ["scratch"]), undefined);
});
