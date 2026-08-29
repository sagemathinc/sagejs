// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  generateHostCore,
} = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(root, "bench/native_live_exact_records.py");

function runNode(modulePath, source) {
  const result = spawnSync(process.execPath, ["-e", source, modulePath], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("portable record vectors reserve, copy, validate, and close", () => {
  const result = spawnSync("python3", ["-c", String.raw`
import importlib.util, sys, types
package = types.ModuleType("sagejs")
package.__path__ = []
sys.modules["sagejs"] = package
spec = importlib.util.spec_from_file_location(
    "sagejs.native", ${JSON.stringify(resolve(root, "src/lib/sagejs/native.py"))}
)
module = importlib.util.module_from_spec(spec)
sys.modules["sagejs.native"] = module
spec.loader.exec_module(module)

class Metadata(module.NativeRecord):
    witness: module.uint64
    provenance: module.uint64

try:
    with module.NativeExactArena(63, 4096) as arena:
        arena.records(Metadata, 2)
except MemoryError as error:
    assert str(error) == "NativeExactArena memory limit exceeded"
else:
    raise AssertionError("undersized record budget unexpectedly passed")

value = Metadata(5, 7)
with module.NativeExactArena(64, 4096) as arena:
    records = arena.records(Metadata, 2)
    records[0] = value
    value.witness = 19
    copy = records[0]
    copy.provenance = 23
    assert (records[0].witness, records[0].provenance) == (5, 7)
    assert (records[1].witness, records[1].provenance) == (0, 0)
    try:
        records[-1]
    except IndexError as error:
        assert str(error) == "NativeRecordVector index out of range"
    else:
        raise AssertionError("negative record index unexpectedly passed")
    try:
        records[0] = Metadata(-1, 0)
    except OverflowError as error:
        assert str(error) == "Metadata.witness is outside uint64"
    else:
        raise AssertionError("negative record field unexpectedly passed")
try:
    len(records)
except ValueError as error:
    assert str(error) == "NativeRecordVector is closed"
else:
    raise AssertionError("closed record vector remained usable")
`], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("record-vector IR retains its schema and lexical ownership", async () => {
  const source = readFileSync(sourcePath, "utf8");
  const ir = await lowerSource(source, sourcePath);
  assert.equal(ir.version, 34);
  assert.deepEqual(ir.records, [{
    name: "RelationMetadata",
    type: "Record:RelationMetadata",
    layout: "compiler-owned-value",
    ownership: "borrowed-fields",
    fields: [
      { name: "witness_index", type: "uint64" },
      { name: "provenance_index", type: "uint64" },
    ],
  }]);
  const fn = ir.functions.find((candidate) =>
    candidate.name === "live_arena_record_checksum"
  );
  assert.equal(fn.analysis.backend.kind, "gmp");
  assert.deepEqual(fn.analysis.liveExactWorkspace.scopes[0].children, [{
    owner: "metadata",
    storage: "fixed-schema-record-vector",
    capacity: "capacity",
    record: "RelationMetadata",
    fields: [
      { name: "witness_index", type: "uint64" },
      { name: "provenance_index", type: "uint64" },
    ],
    entryCharge: 32,
  }]);
  const arena = fn.body.find((operation) =>
    operation.kind === "integer.arena.scope"
  );
  assert.deepEqual(arena.children.map((child) => child.type), [
    "NativeRecordVector:RelationMetadata",
  ]);
  const kinds = JSON.stringify(arena.body);
  const allocation = arena.body.find((operation) =>
    operation.kind === "record.arena.vector.allocate"
  );
  assert.equal(allocation.provenance.file, sourcePath);
  assert.equal(allocation.provenance.start.line, 19);
  assert.match(allocation.id, /^live_arena_record_checksum:/);
  for (const kind of [
    "record.arena.vector.allocate",
    "record.construct",
    "record.vector.set",
    "record.vector.get",
    "record.get",
    "record.copy",
    "record.vector.length",
  ]) {
    assert.match(kinds, new RegExp(kind.replaceAll(".", "\\.")));
  }
  const core = generateHostCore(ir);
  assert.match(core.header, /sagejs_native_record_RelationMetadata/);
  assert.match(core.source, /sagejs_native_record_vector_init_in_budget/);
  assert.match(core.source, /sagejs_native_record_vector_clear/);
  assert.match(core.source, /NativeRecordVector index out of range/);
  assert.match(core.source, /sizeof\(sagejs_native_record_RelationMetadata\)/);
});

test("record vectors agree across Python-shaped JavaScript and native tiers", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-live-records-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    runNode(compiled.modulePath, String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
for (const implementation of [
  module.live_arena_record_checksum,
  module.live_arena_record_checksum.javascript,
  module.live_arena_record_checksum.gmp,
  module.live_arena_record_checksum.tagged,
]) {
  assert.equal(implementation(160n, 4096n, 5n), 45n);
  assert.throws(
    () => implementation(159n, 4096n, 5n),
    /NativeExactArena memory limit exceeded/,
  );
}
for (const implementation of [
  module.live_arena_record_default,
  module.live_arena_record_default.javascript,
  module.live_arena_record_default.gmp,
  module.live_arena_record_default.tagged,
]) {
  assert.equal(implementation(64n, 4096n), 12n);
  assert.throws(
    () => implementation(63n, 4096n),
    /NativeExactArena memory limit exceeded/,
  );
}
for (const implementation of [
  module.live_arena_record_probe,
  module.live_arena_record_probe.javascript,
  module.live_arena_record_probe.gmp,
  module.live_arena_record_probe.tagged,
]) {
  assert.equal(implementation(64n, 4096n, 1n), 24n);
  assert.throws(
    () => implementation(64n, 4096n, 2n),
    /NativeRecordVector index out of range/,
  );
}
`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("resident records reject borrowed schemas, aliases, and augmented writes", async () => {
  const header =
    "from sagejs.native import NativeExactArena, NativeRecord, UInt64Buffer, native, uint64\n";
  await assert.rejects(
    () => lowerSource(
      header +
        "class Borrowed(NativeRecord):\n" +
        "    values: UInt64Buffer\n" +
        "@native\n" +
        "def f(n: uint64) -> uint64:\n" +
        "    with NativeExactArena(n, n) as arena:\n" +
        "        records = arena.records(Borrowed, 1)\n" +
        "        return 0\n",
      "resident-record-borrowed.py",
    ),
    /currently requires scalar uint64 fields/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "class Metadata(NativeRecord):\n" +
        "    value: uint64\n" +
        "@native\n" +
        "def f(n: uint64) -> uint64:\n" +
        "    with NativeExactArena(n, n) as arena:\n" +
        "        records = arena.records(Metadata, 1)\n" +
        "        alias = records\n" +
        "        return 0\n",
      "resident-record-alias.py",
    ),
    /live exact owners cannot be copied, passed, or returned/,
  );
  await assert.rejects(
    () => lowerSource(
      header +
        "class Metadata(NativeRecord):\n" +
        "    value: uint64\n" +
        "@native\n" +
        "def f(n: uint64) -> uint64:\n" +
        "    with NativeExactArena(n, n) as arena:\n" +
        "        records = arena.records(Metadata, 1)\n" +
        "        records[0] += Metadata(1)\n" +
        "        return 0\n",
      "resident-record-augmented.py",
    ),
    /do not support augmented assignment/,
  );
});

test("record-vector success and failure cleanup is sanitizer-clean", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-live-records-asan-"));
  const prefix = resolve(
    process.env.SAGEJS_FLINT_PREFIX ||
      join(root, "packages", "flint", ".native", "prefix"),
  );
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "harness.c"), String.raw`
#include <assert.h>
#include <stdint.h>
#include "kernel_core.h"
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    uint64_t result = 0;
    for (unsigned round = 0; round < 1000; round += 1)
    {
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(sagejs_kernel_live_arena_record_checksum(
            &status, &result, 160, 4096, 5));
        assert(result == 45);
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(!sagejs_kernel_live_arena_record_checksum(
            &status, &result, 159, 4096, 5));
        assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(!sagejs_kernel_live_arena_record_probe(
            &status, &result, 64, 4096, 2));
        assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    }
    return 0;
}
`);
    const executable = join(temporary, "records-sanitizer");
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11",
      "-O1",
      "-g",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-Wno-error=unused-function",
      "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`,
      `-I${join(prefix, "include")}`,
      join(temporary, "kernel_core.c"),
      join(temporary, "harness.c"),
      join(prefix, "lib", "libgmp.a"),
      "-lm",
      "-o",
      executable,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    const run = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
      timeout: 120_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("record-vector core runs through WASI", async (context) => {
  let toolchain;
  try {
    toolchain = require(
      "../packages/wasm-toolchain/scripts/toolchain.cjs"
    ).resolveToolchain({ root });
  } catch {
    context.skip("a prepared WASI GMP toolchain is not available");
    return;
  }
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-live-records-wasi-"));
  try {
    writeFileSync(join(temporary, "kernel_core.c"), core.source);
    writeFileSync(join(temporary, "kernel_core.h"), core.header);
    writeFileSync(join(temporary, "driver.c"), String.raw`
#include <assert.h>
#include <stdint.h>
#include "kernel_core.h"
int main(void)
{
    sagejs_native_status status = { SAGEJS_NATIVE_OK, 0 };
    uint64_t result = 0;
    assert(sagejs_kernel_live_arena_record_checksum(
        &status, &result, 160, 4096, 5));
    assert(result == 45);
    assert(!sagejs_kernel_live_arena_record_probe(
        &status, &result, 64, 4096, 2));
    assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    return 0;
}
`);
    const wasiGmp = toolchain.paths.libraries.gmp.prefix;
    const wasm = join(temporary, "records.wasm");
    const build = spawnSync(toolchain.paths.clang, [
      "--target=wasm32-wasip1",
      `--sysroot=${toolchain.paths.sysroot}`,
      "-O3",
      `-I${temporary}`,
      `-I${join(wasiGmp, "include")}`,
      join(temporary, "kernel_core.c"),
      join(temporary, "driver.c"),
      resolve(root, "packages/flint-wasm/src/wasi-stubs.c"),
      `-L${join(wasiGmp, "lib")}`,
      "-lgmp",
      "-lm",
      "-lwasi-emulated-signal",
      "-o",
      wasm,
    ], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const run = spawnSync(process.execPath, ["-e", String.raw`
const { readFileSync } = require("node:fs");
const { WASI } = require("node:wasi");
const wasi = new WASI({ version: "preview1", args: [], env: {} });
(async () => {
  const module = await WebAssembly.compile(readFileSync(process.argv[1]));
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
  wasi.start(instance);
})().catch((error) => { console.error(error); process.exit(1); });
`, wasm], { cwd: root, encoding: "utf8", timeout: 120_000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
