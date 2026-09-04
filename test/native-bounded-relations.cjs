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

const { generateHostCore } = require("../tools/native-kernel/c-backend.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(root, "bench/native_bounded_relations.py");

function runNode(modulePath, source) {
  const result = spawnSync(process.execPath, ["-e", source, modulePath], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("portable bounded maps and sets match deterministic capacity semantics", () => {
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

class Key(module.NativeRecord):
    left: module.uint64
    right: module.uint64

with module.NativeExactArena(176, 4096) as arena:
    mapping = arena.bounded_map(Key, module.uint64, 2)
    values = arena.bounded_set(Key, 2)
    a, b, c = Key(1, 2), Key(3, 4), Key(5, 6)
    assert mapping.insert(a, 7) is True
    assert mapping.insert(b, 11) is True
    assert mapping.insert(a, 17) is False
    assert mapping.get(a, 19) == 17
    assert mapping.get(c, 19) == 19
    assert mapping.contains(b) is True
    assert values.add(a) is True
    assert values.add(b) is True
    assert values.add(a) is False
    assert values.contains(c) is False
    try:
        mapping.insert(c, 13)
    except MemoryError as error:
        assert str(error) == "NativeBoundedMap capacity exceeded"
    else:
        raise AssertionError("full bounded map unexpectedly grew")
    try:
        values.add(c)
    except MemoryError as error:
        assert str(error) == "NativeBoundedSet capacity exceeded"
    else:
        raise AssertionError("full bounded set unexpectedly grew")
try:
    len(mapping)
except ValueError as error:
    assert str(error) == "NativeBoundedMap is closed"
else:
    raise AssertionError("closed bounded map remained usable")
try:
    with module.NativeExactArena(175, 4096) as arena:
        arena.bounded_map(Key, module.uint64, 2)
        arena.bounded_set(Key, 2)
except MemoryError as error:
    assert str(error) == "NativeExactArena memory limit exceeded"
else:
    raise AssertionError("undersized shared budget unexpectedly passed")
`], { cwd: root, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("bounded relation IR records hash, probing, ownership, and effects", async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  assert.equal(ir.version, 37);
  const fn = ir.functions.find((candidate) =>
    candidate.name === "bounded_relation_summary"
  );
  assert.equal(fn.analysis.backend.kind, "gmp");
  assert.deepEqual(fn.analysis.liveExactWorkspace.scopes[0].children, [
    {
      owner: "weights",
      storage: "bounded-open-addressed-map",
      capacity: "sagejs_native_tmp_0",
      record: "RelationKey",
      fields: [
        { name: "residue", type: "uint64" },
        { name: "source", type: "uint64" },
      ],
      entryCharge: 48,
      probing: "linear",
      hash: "fnv64-record-fields-v1",
    },
    {
      owner: "admitted",
      storage: "bounded-open-addressed-set",
      capacity: "sagejs_native_tmp_1",
      record: "RelationKey",
      fields: [
        { name: "residue", type: "uint64" },
        { name: "source", type: "uint64" },
      ],
      entryCharge: 40,
      probing: "linear",
      hash: "fnv64-record-fields-v1",
    },
  ]);
  assert.deepEqual(fn.analysis.effects.mayRaise.sort(), ["MemoryError"]);
  const kinds = JSON.stringify(fn.body);
  for (const kind of [
    "bounded.map.arena.allocate",
    "bounded.set.arena.allocate",
    "bounded.map.insert",
    "bounded.map.contains",
    "bounded.map.get",
    "bounded.map.length",
    "bounded.set.add",
    "bounded.set.contains",
    "bounded.set.length",
  ]) assert.match(kinds, new RegExp(kind.replaceAll(".", "\\.")));
  const core = generateHostCore(ir);
  assert.match(core.source, /sagejs_native_bounded_table_init_in_budget/);
  assert.match(core.source, /UINT64_C\(1469598103934665603\)/);
  assert.match(core.source, /sagejs_bounded_position\+\+/);
  assert.match(core.source, /NativeBoundedMap capacity exceeded/);
  assert.match(core.source, /NativeBoundedSet capacity exceeded/);
});

test("bounded relations agree across JavaScript and compiled native tiers", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-bounded-relations-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot });
    runNode(compiled.modulePath, String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
for (const implementation of [
  module.bounded_relation_summary,
  module.bounded_relation_summary.javascript,
  module.bounded_relation_summary.gmp,
  module.bounded_relation_summary.tagged,
]) {
  assert.equal(implementation(176n, 4096n), 103n);
  assert.throws(
    () => implementation(175n, 4096n),
    /NativeExactArena memory limit exceeded/,
  );
}
for (const name of ["bounded_relation_map_full", "bounded_relation_set_full"]) {
  for (const implementation of [
    module[name], module[name].javascript, module[name].gmp, module[name].tagged,
  ]) assert.throws(() => implementation(96n, 4096n), /capacity exceeded/);
}
`);
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("bounded relation cleanup is sanitizer-clean", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, async () => {
  const ir = await lowerSource(readFileSync(sourcePath, "utf8"), sourcePath);
  const core = generateHostCore(ir);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-bounded-relations-asan-"));
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
        assert(sagejs_kernel_bounded_relation_summary(
            &status, &result, 176, 4096));
        assert(result == 103);
        status.code = SAGEJS_NATIVE_OK;
        status.message = 0;
        assert(!sagejs_kernel_bounded_relation_map_full(
            &status, &result, 96, 4096));
        assert(status.code == SAGEJS_NATIVE_RANGE_ERROR);
    }
    return 0;
}
`);
    const executable = join(temporary, "bounded-relations-sanitizer");
    const sanitizerFlags = process.platform === "darwin"
      ? ["-fsanitize=undefined"]
      : ["-fsanitize=address,undefined"];
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-g", "-Wall", "-Wextra", "-Werror",
      "-Wno-error=unused-function", "-fno-omit-frame-pointer",
      ...sanitizerFlags,
      `-I${temporary}`, `-I${join(prefix, "include")}`,
      join(temporary, "kernel_core.c"), join(temporary, "harness.c"),
      join(prefix, "lib", "libgmp.a"), "-lm", "-o", executable,
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

test("bounded relation core runs through WASI", async (context) => {
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
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-bounded-relations-wasi-"));
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
    assert(sagejs_kernel_bounded_relation_summary(
        &status, &result, 176, 4096));
    assert(result == 103);
    return 0;
}
`);
    const wasiGmp = toolchain.paths.libraries.gmp.prefix;
    const wasm = join(temporary, "bounded-relations.wasm");
    const build = spawnSync(toolchain.paths.clang, [
      "--target=wasm32-wasip1", `--sysroot=${toolchain.paths.sysroot}`, "-O3",
      `-I${temporary}`, `-I${join(wasiGmp, "include")}`,
      join(temporary, "kernel_core.c"), join(temporary, "driver.c"),
      resolve(root, "packages/flint-wasm/src/wasi-stubs.c"),
      `-L${join(wasiGmp, "lib")}`, "-lgmp", "-lm", "-lwasi-emulated-signal",
      "-o", wasm,
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
