// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const source = `
from sagejs.native import native

def leaf(value: int) -> int:
    return value + 1

def helper(value: int) -> int:
    return leaf(value) * 2

@native
def decorated_helper(value: int) -> int:
    return value - 1

@native
def entry(value: int) -> int:
    return helper(value) + decorated_helper(value)
`;

test("dependency-only scalar helpers stay private in the isolated host ABI", async () => {
  const ir = await lowerSource(source, "host-entries.py", { functions: ["entry"] });
  assert.deepEqual(ir.functions.filter(f => f.hostCallable !== false).map(f => f.name).sort(),
    ["decorated_helper", "entry"]);
  assert.deepEqual(ir.callGraph.helper, ["leaf"]);
  for (const name of ["helper", "leaf"]) {
    const f = ir.functions.find(f => f.name === name);
    assert.equal(f.hostCallable, false);
    assert.equal(f.lexicallyNative, false);
  }
  const { header } = generateHostCore(ir);
  assert.equal((header.match(/\bint sagejs_kernel_/g) || []).length, 2);
});

test("an explicitly selected undecorated helper remains a public root", async () => {
  const ir = await lowerSource(source, "host-entries.py", { functions: ["helper"] });
  assert.deepEqual(ir.functions.filter(f => f.hostCallable !== false).map(f => f.name), ["helper"]);
  assert.equal(ir.functions.find(f => f.name === "leaf").hostCallable, false);
});

test("legacy undecorated root selection and borrowed-owner restrictions remain intact", async () => {
  const legacy = await lowerSource("def first(x: int) -> int:\n    return x + 1\n\ndef second(x: int) -> int:\n    return first(x)\n", "legacy-host.py");
  assert.equal(legacy.functions.filter(f => f.hostCallable !== false).length, 2);
  const borrowed = await lowerSource(`
from sagejs.native import native, NativeIntegerVector
@native
def borrowed(values: NativeIntegerVector) -> int:
    return values[0]
`, "borrowed-host.py", { functions: ["borrowed"] });
  assert.equal(borrowed.functions[0].hostCallable, false);
});

test("private integer dependencies execute in dynamic and emitted native backends", async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-private-entries-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, "entries.py");
  writeFileSync(sourcePath, source);
  const result = await compileKernel({ sourcePath, functions: ["entry"],
    cacheRoot: join(directory, "cache") });
  const module = require(result.modulePath);
  assert.equal(module.helper, undefined);
  assert.equal(module.leaf, undefined);
  for (const value of [0n, -12n, 1n << 200n]) {
    for (const backend of ["javascript", "tagged", "gmp"]) {
      assert.equal(module.entry[backend](value), 3n * value + 1n);
    }
  }
});

test("prime-source calls retain private checked integer adapters", async t => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-private-prime-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const mixed = `
from sagejs.native import native, uint64, UInt64Buffer, PrimeFieldModulus

def count(value: uint64) -> uint64:
    return value + 1

@native
def entry(output: UInt64Buffer, value: uint64, modulus: PrimeFieldModulus) -> bool:
    output[0] = count(value)
    return True
`;
  const sourcePath = join(directory, "mixed.py");
  writeFileSync(sourcePath, mixed);
  const ir = await lowerSource(mixed, sourcePath, { functions: ["entry"] });
  assert.equal(ir.functions.find(f => f.name === "count").hostCallable, false);
  const core = generateHostCore(ir);
  assert.match(core.source, /static int sagejs_kernel_count\(/);
  assert.doesNotMatch(core.header, /sagejs_kernel_count\(/);
  const result = await compileKernel({ sourcePath, functions: ["entry"],
    cacheRoot: join(directory, "cache") });
  const module = require(result.modulePath);
  assert.equal(module.count, undefined);
  const output = new BigUint64Array(1);
  assert.equal(module.entry(output, 6n, 101n), true);
  assert.equal(output[0], 7n);
});
