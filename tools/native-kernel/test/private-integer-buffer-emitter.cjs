"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  privateIntegerBufferPlan,
} = require("../private-integer-buffer-authority.cjs");
const {
  emitPrivateIntegerBufferRuntime,
} = require("../private-integer-buffer-emitter.cjs");

function fixture() {
  const root = {
    name: "root",
    params: [{ name: "scratch", type: "IntegerBuffer" }],
    body: [
      { kind: "integer.buffer.set", buffer: "scratch", index: "i", value: "x" },
      { kind: "return", value: "x", type: "Integer" },
    ],
  };
  return { functions: [root], root };
}

function canonicalize(model) {
  if (!model.dirty) return;
  for (let position = model.first; position <= model.last; position += 1) {
    const count = Math.abs(model.sizes[position]);
    model.limbs.fill(0n, position * model.capacity + count,
      (position + 1) * model.capacity);
  }
  model.dirty = false;
}

function privateStore(model, position, words, negative = false) {
  const start = position * model.capacity;
  words.forEach((word, index) => { model.limbs[start + index] = word; });
  model.sizes[position] = negative ? -words.length : words.length;
  model.first = model.dirty ? Math.min(model.first, position) : position;
  model.last = model.dirty ? Math.max(model.last, position) : position;
  model.dirty = true;
}

function hash(model) {
  return crypto.createHash("sha256").update(JSON.stringify({
    sizes: model.sizes,
    limbs: model.limbs.map(String),
  })).digest("hex");
}

test("authorized emitter canonicalizes every escape and failure boundary", () => {
  const { functions, root } = fixture();
  const claim = privateIntegerBufferPlan(functions, root, ["scratch"]);
  const emitted = emitPrivateIntegerBufferRuntime(functions, root, claim);
  assert.match(emitted.support, /sagejs_private_integer_buffer_set_mpz/);
  assert.doesNotMatch(emitted.support,
    /set_mpz[\s\S]*memset\(slot, 0, buffer->word_capacity/);
  for (const boundary of claim.canonicalizeAt) {
    assert.match(emitted.beforeBoundary[boundary], /canonicalize/);
  }
  assert.match(emitted.beforePublish, /canonicalize/);
  assert.equal(emitted.beforePublish, emitted.failureCleanup);
});

test("big to small to zero history is canonical at publication", () => {
  const model = {
    capacity: 4, sizes: [0], limbs: [91n, 92n, 93n, 94n],
    dirty: false, first: 0, last: 0,
  };
  privateStore(model, 0, [1n, 2n, 3n]);
  privateStore(model, 0, [7n]);
  privateStore(model, 0, []);
  assert.notDeepEqual(model.limbs, [0n, 0n, 0n, 0n]);
  canonicalize(model);
  assert.deepEqual(model.limbs, [0n, 0n, 0n, 0n]);
  assert.equal(hash(model), hash({ ...model, limbs: [0n, 0n, 0n, 0n] }));
});

test("revoked authority emits nothing and public setter still clears", () => {
  const { functions, root } = fixture();
  const claim = privateIntegerBufferPlan(functions, root, ["scratch"]);
  root.body[0].kind = "integer.buffer.raw_limbs";
  assert.equal(emitPrivateIntegerBufferRuntime(functions, root, claim), undefined);

  const core = fs.readFileSync(path.join(__dirname, "../c-backend.cjs"), "utf8");
  assert.match(core,
    /sagejs_integer_buffer_set_mpz[\s\S]*memset\(slot, 0, buffer->word_capacity \* sizeof\(\*slot\)\)/);
});
