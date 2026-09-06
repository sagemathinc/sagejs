// sagejs-test-tier: specialized
"use strict";
const { pythonExecutable } = require("../tools/python-executable.cjs");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

const prefix = `
from sagejs.native import native, NativeWorkspace, NativeExactArena, NativeIntegerVector
class Scratch(NativeWorkspace):
    left: NativeIntegerVector
    right: NativeIntegerVector

def update(scratch: Scratch, value: int) -> int:
    scratch.left[0] = value
    scratch.right[1] = scratch.left[0] + 1
    return scratch.left[1]
`;

test("workspace parameters erase into identity-preserving native borrows", async t => {
  const directory = mkdtempSync(join(tmpdir(), "native-workspace-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, "workspace.py");
  writeFileSync(sourcePath, prefix + `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
        return update(scratch, value)
`);
  const built = await compileKernel({ sourcePath, functions: ["witness"], cacheRoot: join(directory, "cache") });
  const kernel = require(built.modulePath).witness;
  for (const backend of ["javascript", "gmp", "fmpz"]) {
    for (const value of [0n, -9n, 1n << 300n]) assert.equal(kernel[backend](value), value + 1n);
  }
});

test("workspace bindings cannot escape or be rebound", async () => {
  for (const body of ["return scratch", "scratch.left = vector", "scratch = Scratch(vector, vector)",
    "vector = arena.integer_vector(2, 0)", "return scratch.missing[0]", "values = (scratch,)"]) {
    await assert.rejects(() => lowerSource(prefix + `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
        ${body}
    return value
`, "workspace.py", { functions: ["witness"] }), /workspace/i);
  }
});

test("workspace construction validates unused members and lexical lifetimes", async () => {
  for (const binding of ["Scratch(vector, value)", "Scratch(vector)", "Scratch(vector, scratch)"]) {
    await assert.rejects(() => lowerSource(prefix + `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = ${binding}
        return value
`, "workspace.py", { functions: ["witness"] }), /workspace|unknown native/i);
  }
  await assert.rejects(() => lowerSource(prefix + `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
    return update(scratch, value)
`, "workspace.py", { functions: ["witness"] }), /workspace/i);
});

test("workspace schema names cannot be shadowed by local values", async () => {
  for (const shadow of ["Scratch = 7", "Scratch, other = (7, 8)"]) {
    await assert.rejects(() => lowerSource(prefix + `
@native
def witness(value: int) -> int:
    ${shadow}
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
        return update(scratch, value)
`, "workspace.py", { functions: ["witness"] }), /workspace.*shadow/i);
  }
});

test("workspace helper parameters cannot be selected as a public ABI", async () => {
  await assert.rejects(() => lowerSource(prefix, "workspace.py", { functions: ["update"] }),
    /workspace bundle parameters have no public host ABI/);
});

test("workspace schemas require the actual imported base", async () => {
  await assert.rejects(() => lowerSource(prefix.replace("native, NativeWorkspace,", "native,"),
    "missing-workspace-import.py", { functions: ["update"] }), /workspace.*import/i);
});

test("workspace helper calls cannot bypass Python value shadowing", async () => {
  const entry = `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
        return update(scratch, value)
`;
  for (const source of [
    (prefix + entry).replace("def witness(value: int)", "def witness(update: int, value: int)"),
    prefix + entry.replace("    with NativeExactArena", "    update = 7\n    with NativeExactArena"),
    prefix + "\nupdate = 7\n" + entry,
    prefix + "\nfrom math import sqrt as update\n" + entry,
    prefix + "\nclass update:\n    pass\n" + entry,
    prefix + "\ndef update(value: int) -> int:\n    return value\n" + entry,
    prefix + entry.replace("    with NativeExactArena", "    for update in range(1):\n        pass\n    with NativeExactArena"),
  ]) {
    await assert.rejects(() => lowerSource(source, "shadowed-workspace-helper.py",
      { functions: ["witness"] }), /workspace.*shadow/i);
  }
});

test("workspace schema resolution rejects module-level rebinding", async () => {
  for (const replacement of [
    "class Scratch:\n    pass\n",
    "for Scratch in range(1):\n    pass\n",
    "if True:\n    Scratch = 1\n",
    "import math as Scratch\n",
    "from math import sqrt as Scratch\n",
    "from math import sqrt as NativeWorkspace\n",
  ]) {
    await assert.rejects(() => lowerSource(prefix + replacement + `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
        return update(scratch, value)
`, "workspace.py", { functions: ["witness"] }), /workspace.*shadow/i);
  }
});

test("workspace calls reject named and expanded arguments before erasure", async () => {
  for (const [construction, call] of [
    ["Scratch(vector, vector, left=vector)", "update(scratch, value)"],
    ["Scratch(vector, vector, **unknown)", "update(scratch, value)"],
    ["Scratch(vector, vector, *unknown)", "update(scratch, value)"],
    ["Scratch(vector, vector)", "update(scratch, value, value=99)"],
    ["Scratch(vector, vector)", "update(scratch, value, **unknown)"],
    ["Scratch(vector, vector)", "update(scratch, value, *unknown)"],
  ]) {
    await assert.rejects(() => lowerSource(prefix + `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = ${construction}
        return ${call}
`, "workspace.py", { functions: ["witness"] }), /workspace.*positional/i);
  }
});

test("workspace schema names cannot be shadowed by loops or context managers", async () => {
  for (const schema of ["Scratch", "NativeWorkspace"]) {
    for (const binding of [`for ${schema} in range(1):`,
      `with NativeIntegerVector(2, 4096) as ${schema}:`]) {
      await assert.rejects(() => lowerSource(prefix + `
@native
def witness(value: int) -> int:
    ${binding}
        with NativeExactArena(8192, 1048576) as arena:
            vector = arena.integer_vector(2, 0)
            scratch = Scratch(vector, vector)
            return update(scratch, value)
    return value
`, "workspace.py", { functions: ["witness"] }), /workspace.*shadow/i);
    }
  }
});

test("bundle erasure preserves explicit-argument executable IR", async () => {
  const entry = `
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        vector = arena.integer_vector(2, 0)
        scratch = Scratch(vector, vector)
        return update(scratch, value)
`;
  const bundled = await lowerSource(prefix + entry, "bundle.py", { functions: ["witness"] });
  const explicitSource = (prefix + entry)
    .replace("scratch: Scratch, value", "left: NativeIntegerVector, right: NativeIntegerVector, value")
    .replaceAll("scratch.left", "left").replaceAll("scratch.right", "right")
    .replace("        scratch = Scratch(vector, vector)\n", "")
    .replace("update(scratch, value)", "update(vector, vector, value)");
  const explicit = await lowerSource(explicitSource, "explicit.py", { functions: ["witness"] });
  const normalize = value => JSON.parse(JSON.stringify(value, (key, item) => {
    if (["provenance", "workspaceBundles"].includes(key)) return undefined;
    if (typeof item === "string") return item.replaceAll("sagejs_workspace_scratch__", "");
    return item;
  }));
  for (const fn of bundled.functions) {
    const other = explicit.functions.find(item => item.name === fn.name);
    for (const key of ["params", "locals", "body", "dependencies", "resourceAliases"])
      assert.deepEqual(normalize(fn[key]), normalize(other[key]), `${fn.name}.${key}`);
  }
});

test("workspace bundles combine FFI matrices and arena vectors", async t => {
  const directory = mkdtempSync(join(tmpdir(), "native-workspace-ffi-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = join(directory, "workspace.py");
  writeFileSync(sourcePath, `
from sagejs.native import native, NativeWorkspace, NativeExactArena, NativeIntegerVector
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix
class Mixed(NativeWorkspace):
    matrix: FmpzMatrix
    vector: NativeIntegerVector
def inner(scratch: Mixed, value: int) -> int:
    scratch.matrix[0, 0] = value
    scratch.vector[0] = scratch.matrix[0, 0] + 1
    return scratch.vector[0]
def outer(scratch: Mixed, value: int) -> int:
    return inner(scratch, value)
@native
def witness(value: int) -> int:
    with NativeExactArena(8192, 1048576) as arena:
        matrix = arena.foreign_resource(fmpz_matrix, 2, 2)
        vector = arena.integer_vector(2, 0)
        scratch = Mixed(matrix, vector)
        return outer(scratch, value)
`);
  const built = await compileKernel({ sourcePath, functions: ["witness"], cacheRoot: join(directory, "cache") });
  const kernel = require(built.modulePath).witness;
  for (const backend of ["javascript", "gmp", "fmpz"]) {
    for (const value of [0n, -9n, 1n << 300n]) assert.equal(kernel[backend](value), value + 1n);
  }
});

test("workspace fallback retains aliases and rejects expired owners", t => {
  const directory = mkdtempSync(join(tmpdir(), "workspace-fallback-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "fallback.py");
  writeFileSync(path, readFileSync(join(__dirname, "../src/lib/sagejs/native.py"), "utf8") + `
class Scratch(NativeWorkspace):
    left: NativeIntegerVector
    right: NativeIntegerVector
with NativeIntegerVector(2, 4096) as vector:
    scratch = Scratch(vector, vector)
    scratch.left[0] = 17
    assert scratch.right[0] == 17
    try:
        scratch.left = vector
    except AttributeError:
        pass
    else:
        raise AssertionError("rebound")
try:
    scratch.left
except ValueError:
    pass
else:
    raise AssertionError("expired owner")
print("workspace-fallback-ok")
`);
  for (const [command, args] of [[pythonExecutable(), [path]], [process.execPath, [join(__dirname, "../bin/sagejs"), "--python", path]]]) {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 120000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /workspace-fallback-ok/);
  }
});
