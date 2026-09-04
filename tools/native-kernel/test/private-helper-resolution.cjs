"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { compileKernel } = require("../compiler.cjs");
const root = resolve(__dirname, "../../..");
const sagejs = join(root, "bin", "sagejs");

const program = String.raw`
from sagejs.native import NativeExactArena, NativeIntegerVector, execution_mode, is_compiled, is_native, native, uint64


@native
def decorated_private(workspace: NativeIntegerVector, value: int) -> int:
    workspace[0] = value
    workspace.addmul(0, value, value)
    return workspace[0]


def ordinary_private(workspace: NativeIntegerVector, value: int) -> int:
    workspace[1] = value + 2
    return workspace[1]


@native
def public_entry(memory_limit: uint64, temporary_limit: uint64, value: int) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        workspace = arena.integer_vector(2, 512)
        return decorated_private(workspace, value) + ordinary_private(workspace, value)


assert is_native(decorated_private)
assert not is_compiled(decorated_private)
assert execution_mode(decorated_private) == "dynamic"
assert not is_native(ordinary_private)
assert is_compiled(public_entry)
assert decorated_private(NativeIntegerVector(2, 4096), 3) == 12
assert public_entry(1 << 20, 1 << 20, 3) == 17
print("PRIVATE_HELPER_OK")
`;

function execute(sourcePath, cacheRoot, required = true) {
  return spawnSync(process.execPath, [sagejs, sourcePath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
      SAGEJS_NATIVE_REQUIRED: required ? "1" : "0",
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
    },
  });
}

function writeIndex(cacheRoot, mutate) {
  const path = join(cacheRoot, "index.json");
  const index = JSON.parse(readFileSync(path, "utf8"));
  const record = Object.values(index.sources)[0];
  mutate(record);
  writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`);
}

test("only same-source lexical private helpers receive authenticated fallback", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-private-helper-"));
  const sourcePath = join(temporary, "private_helper_program.py");
  const cacheRoot = join(temporary, "cache");
  try {
    writeFileSync(sourcePath, program);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot,
      functions: ["public_entry"],
    });
    assert.deepEqual(compiled.privateFunctions, ["decorated_private"]);
    const functions = new Map(compiled.ir.functions.map((fn) => [fn.name, fn]));
    assert.equal(functions.get("decorated_private").lexicallyNative, true);
    assert.equal(functions.get("ordinary_private").lexicallyNative, false);
    assert.equal(functions.get("public_entry").lexicallyNative, true);
    assert.equal(functions.get("decorated_private").hostCallable, false);
    assert.equal(functions.get("ordinary_private").hostCallable, false);

    const wrapper = require(compiled.modulePath);
    assert.deepEqual(wrapper.privateFunctions, ["decorated_private"]);
    assert.equal(Object.isFrozen(wrapper.privateFunctions), true);
    assert.equal(wrapper.decorated_private, undefined);
    assert.equal(wrapper.ordinary_private, undefined);
    assert.equal(typeof wrapper.public_entry, "function");

    const executed = execute(sourcePath, cacheRoot);
    assert.equal(executed.status, 0, executed.stdout + executed.stderr);
    assert.equal(executed.stdout.trim(), "PRIVATE_HELPER_OK");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("missing, invalid, and mismatched private metadata fail closed", async () => {
  for (const mutation of [
    (record) => delete record.privateFunctions,
    (record) => record.privateFunctions = ["decorated_private", "ordinary_private"],
    (record) => record.privateFunctions = [],
  ]) {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-private-tamper-"));
    const sourcePath = join(temporary, "private_helper_program.py");
    const cacheRoot = join(temporary, "cache");
    try {
      writeFileSync(sourcePath, program);
      await compileKernel({
        sourcePath,
        cacheRoot,
        functions: ["public_entry"],
      });
      writeIndex(cacheRoot, mutation);

      const required = execute(sourcePath, cacheRoot);
      assert.notEqual(required.status, 0);
      assert.match(required.stderr, /stale native kernel artifact/);

      const fallback = execute(sourcePath, cacheRoot, false);
      assert.notEqual(fallback.status, 0);
      assert.doesNotMatch(fallback.stderr, /stale native kernel artifact/);
      assert.match(fallback.stderr, /AssertionError/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test("wrapper-side private metadata mismatch fails closed", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-private-wrapper-"));
  const sourcePath = join(temporary, "private_helper_program.py");
  const cacheRoot = join(temporary, "cache");
  try {
    writeFileSync(sourcePath, program);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot,
      functions: ["public_entry"],
    });
    const wrapper = readFileSync(compiled.modulePath, "utf8");
    const metadata = 'privateFunctions: Object.freeze(["decorated_private"]),';
    assert.ok(wrapper.includes(metadata));
    writeFileSync(
      compiled.modulePath,
      wrapper.replace(metadata, "privateFunctions: Object.freeze([]),"),
    );
    const required = execute(sourcePath, cacheRoot);
    assert.notEqual(required.status, 0);
    assert.match(required.stderr, /cache index and generated wrapper metadata differ/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("a genuinely unmarked function remains fatal in strict mode", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-private-missing-"));
  const sourcePath = join(temporary, "missing_public_program.py");
  const cacheRoot = join(temporary, "cache");
  const source = String.raw`
from sagejs.native import is_compiled, native


@native
def compiled_entry(value: int) -> int:
    return value + 1


@native
def missing_entry(value: int) -> int:
    return value + 2


print(str(is_compiled(compiled_entry)) + "," + str(is_compiled(missing_entry)))
`;
  try {
    writeFileSync(sourcePath, source);
    await compileKernel({
      sourcePath,
      cacheRoot,
      functions: ["compiled_entry"],
    });
    const required = execute(sourcePath, cacheRoot);
    assert.notEqual(required.status, 0);
    assert.match(required.stderr, /native kernel missing_entry/);
    assert.match(required.stderr, /has no matching compiled artifact/);

    const fallback = execute(sourcePath, cacheRoot, false);
    assert.equal(fallback.status, 0, fallback.stdout + fallback.stderr);
    assert.equal(fallback.stdout.trim(), "True,False");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
