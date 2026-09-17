"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { generateHostCore } = require("../c-backend.cjs");
const { lowerSource } = require("../ir.cjs");
const {
  privateIntegerBufferLayoutDigest,
} = require("../private-integer-buffer-layout.cjs");

const source = String.raw`
from sagejs.native import IntegerBuffer, native

def private_leaf(destination: IntegerBuffer, value: int) -> int:
    destination[0] = value
    return destination[0]

@native
def private_root(scratch: IntegerBuffer, value: int) -> int:
    return private_leaf(scratch, value)
`;

async function lower() {
  return lowerSource(source, "private-integer-buffer-host-core.py");
}

function layout(root = "private_root") {
  return {
    schema: "sagejs.private-integer-buffer-layout/v1",
    name: "private-host-core-test-v1",
    root,
    selection: "written-proven-private",
    expected: {
      parameterSha256: privateIntegerBufferLayoutDigest([
        ["scratch", "IntegerBuffer"],
      ]),
      candidateSha256: privateIntegerBufferLayoutDigest(["scratch"]),
      integerBuffers: 1,
      candidates: 1,
      rejected: 0,
      public: 0,
    },
  };
}

function emittedFunction(text, marker) {
  let start = text.indexOf(marker);
  while (start !== -1) {
    const open = text.indexOf("{", start);
    const semicolon = text.indexOf(";", start);
    if (open !== -1 && (semicolon === -1 || open < semicolon)) break;
    start = text.indexOf(marker, start + marker.length);
  }
  assert.notEqual(start, -1, `missing emitted function ${marker}`);
  const end = text.indexOf("\n}\n", start);
  assert.notEqual(end, -1, `unterminated emitted function ${marker}`);
  return text.slice(start, end + 3);
}

test("host core emits private stores and canonical root boundaries visibly", async () => {
  const ir = await lower();
  const core = generateHostCore(ir, {
    privateIntegerBufferLayout: layout(),
  });
  assert.deepEqual(core.audit.privateIntegerBuffers, {
    authority: "private-integer-buffer-v1",
    layout: "private-host-core-test-v1",
    root: "private_root",
    buffers: ["scratch"],
    publicBuffers: [],
    rejected: [],
    expected: layout().expected,
    canonicalizeAt: ["public-output", "raw-hash", "resume", "ffi", "fallback"],
    failurePublication: "canonicalize-before-publish",
  });
  assert.match(core.source, /sagejs_private_integer_buffer_lookup\(buffer\)/);
  assert.match(core.source, /sagejs_private_integer_buffer_hash/);
  assert.match(core.source, /sagejs_private_integer_buffer_context_end/);
  assert.match(core.source,
    /sagejs_private_integer_buffer_state \*sagejs_private_table\[2\] = \{0\}/);
  assert.match(core.source,
    /sagejs_private_integer_buffer_begin\(&sagejs_private_context, &sagejs_private_scratch, &sagejs_arg_scratch\)/);
  assert.match(core.source,
    /sagejs_private_integer_buffer_state sagejs_private_scratch = \{0\}/);
  assert.match(core.source,
    /sagejs_private_integer_buffer_canonicalize\(&sagejs_private_scratch\)/);
  assert.match(core.source,
    /if \(sagejs_private_state == NULL\)[\s\S]*memset\(slot, 0,[\s\S]*else[\s\S]*sagejs_private_integer_buffer_mark/);
  const root = emittedFunction(core.source, "static int native_private_root(");
  assert.equal(
    root.match(/sagejs_private_integer_buffer_canonicalize\(/g)?.length,
    2,
  );
  assert.match(root,
    /success:[\s\S]*canonicalize\(&sagejs_private_scratch\)[\s\S]*return 1/);
  assert.match(root,
    /fail:[\s\S]*canonicalize\(&sagejs_private_scratch\)[\s\S]*return 0/);
});

test("ordinary public IntegerBuffer generation keeps canonical clearing", async () => {
  const core = generateHostCore(await lower());
  assert.equal(core.audit.privateIntegerBuffers, null);
  assert.doesNotMatch(core.source, /sagejs_private_integer_buffer_lookup/);
  assert.match(core.source,
    /static int sagejs_integer_buffer_set_mpz[\s\S]*memset\(slot, 0, buffer->word_capacity \* sizeof\(\*slot\)\)/);
});

test("invalid or escaped authority fails closed to the public ABI", async () => {
  const ir = await lower();
  // Simulate a stale/incomplete private graph claim while leaving the ordinary
  // compiled program valid. The call is then unknown to the proof authority.
  ir.callGraph.private_root = [];
  const core = generateHostCore(ir, {
    privateIntegerBufferLayout: layout(),
  });
  const ordinary = generateHostCore(ir);
  assert.equal(core.audit.privateIntegerBuffers, null);
  assert.equal(core.source, ordinary.source);
  assert.doesNotMatch(core.source, /sagejs_private_integer_buffer_lookup/);
  assert.match(core.source,
    /static int sagejs_integer_buffer_set_mpz[\s\S]*memset\(slot, 0, buffer->word_capacity \* sizeof\(\*slot\)\)/);
});

test("unknown roots and mutated layouts do not activate private storage", async () => {
  const wrongShape = layout();
  wrongShape.expected.candidateSha256 = "0".repeat(64);
  for (const privateIntegerBufferLayout of [layout("unknown"), wrongShape]) {
    const ir = await lower();
    const core = generateHostCore(ir, { privateIntegerBufferLayout });
    const ordinary = generateHostCore(ir);
    assert.equal(core.audit.privateIntegerBuffers, null);
    assert.equal(core.source, ordinary.source);
    assert.doesNotMatch(core.source, /sagejs_private_integer_buffer_lookup/);
  }
});
