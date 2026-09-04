"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { generateArtifacts } = require("../c-backend.cjs");
const { lowerSource } = require("../ir.cjs");
const { generateJavaScript } = require("../js-backend.cjs");

test("closed native helpers borrow one resident exact vector", async () => {
  const source = String.raw`
from sagejs.native import NativeExactArena, NativeIntegerVector, native, uint64


@native
def resident_helper(
    workspace: NativeIntegerVector,
    index: uint64,
    value: int,
) -> int:
    workspace[index] = value
    workspace.addmul(index, value, value)
    return workspace[index]


@native
def resident_entry(
    memory_limit: uint64,
    temporary_limit: uint64,
    value: int,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        workspace = arena.integer_vector(8, 512)
        return resident_helper(workspace, 3, value)
`;
  const ir = await lowerSource(source, "borrowed-resident-vector.py", {
    functions: ["resident_entry"],
  });
  const helper = ir.functions.find((fn) => fn.name === "resident_helper");
  const entry = ir.functions.find((fn) => fn.name === "resident_entry");
  assert.equal(helper.hostCallable, false);
  assert.equal(helper.analysis.backend.kind, "gmp");
  assert.equal(helper.analysis.backend.requiresExactWorkspace, true);
  assert.deepEqual(helper.analysis.effects.externalWrites, ["workspace"]);
  assert.equal(entry.hostCallable, true);

  const artifacts = generateArtifacts(ir);
  assert.match(
    artifacts.coreSource,
    /static int native_resident_helper\([^)]*sagejs_native_integer_vector \*sagejs_arg_workspace/s,
  );
  assert.match(
    artifacts.coreSource,
    /native_resident_helper\([^;]*&sagejs_workspace/s,
  );
  assert.match(
    artifacts.coreSource,
    /\(\*sagejs_arg_workspace\)\.entries/,
  );
  assert.doesNotMatch(
    artifacts.coreHeader,
    /sagejs_kernel_resident_helper/,
  );
  assert.doesNotMatch(
    artifacts.adapterSource,
    /compiled_resident_helper/,
  );
  assert.doesNotMatch(artifacts.coreSource, /sagejs_integer_buffer_(?:get|set)_mpz/);

  const javascript = generateJavaScript(ir);
  assert.match(javascript, /function javascript_resident_helper\(/);
  assert.match(javascript, /const nativeFunctions = \{ resident_entry \};/);
  assert.doesNotMatch(javascript, /const nativeFunctions = \{[^}]*resident_helper/);
});
