// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { removeLoadedNativeCache } = require("./helpers/native-cache-cleanup.cjs");

function oracle(...args) {
  const result = spawnSync(pythonExecutable(), [resolve(__dirname, "fixtures/cubic-residue-map-linear.py"), ...args], {
    encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stderr}`);
  return result.stdout;
}

test("cubic linear-fiber filter preserves exhaustive residue maps", () => {
  assert.match(oracle(), /253 exhaustive production-source comparisons passed/);
});

test("compiled production filter agrees with exhaustive CPython controls", { timeout: 240_000 }, async t => {
  const directory = mkdtempSync(resolve(tmpdir(), "cubic-linear-fiber-"));
  t.after(() => removeLoadedNativeCache(directory));
  const sourcePath = resolve(directory, "probe.py");
  const source = oracle("--source");
  const vectors = JSON.parse(oracle("--vectors"));
  const dynamicPath = resolve(directory, "dynamic.py");
  writeFileSync(dynamicPath, source + `
controls = ${JSON.stringify(vectors.filter((_, i) => i % 17 === 0))}
with NativeIntegerVector(27, 4096) as table:
    for entries, parameters, expected in controls:
        for i in range(27):
            table[i] = entries[i]
        assert list(_cubic_map_linear_fiber(table, *parameters)) == expected
print("dynamic-fiber-ok")
`);
  const dynamic = spawnSync(process.execPath, [resolve(__dirname, "../bin/sagejs"), "--python", dynamicPath], {
    encoding: "utf8", timeout: 120_000,
    env: { ...process.env, SAGEJS_NATIVE_MODE: "dynamic", SAGEJS_NATIVE_AUTOLOAD: "0" },
  });
  assert.equal(dynamic.status, 0, `${dynamic.error || ""}\n${dynamic.stderr}\n${dynamic.stdout}`);
  assert.match(dynamic.stdout, /dynamic-fiber-ok/);
  writeFileSync(sourcePath, source + `
from sagejs.native import checked_uint64, IntegerBuffer, NativeExactArena
@native
def probe(entries: IntegerBuffer, parameters: IntegerBuffer, output: IntegerBuffer) -> bool:
    with NativeExactArena(8192, 1048576) as arena:
        table = arena.integer_vector(27, 0)
        i: uint64 = 0
        while i < 27:
            table[i] = entries[i]
            i += 1
        start, end = _cubic_map_linear_fiber(
            table, parameters[0], parameters[1], parameters[2], parameters[3],
            checked_uint64(parameters[4]), parameters[5], checked_uint64(parameters[6]),
            checked_uint64(parameters[7]), parameters[8],
        )
        output[0] = start
        output[1] = end
        return True
`);
  const built = await compileKernel({ sourcePath, functions: ["probe"], cacheRoot: resolve(directory, "cache") });
  const compiledModule = require(built.modulePath);
  const kernel = compiledModule.probe;
  assert.ok(kernel, JSON.stringify({ exports: Object.keys(compiledModule), functions: built.ir.functions.map(fn => fn.name), modulePath: built.modulePath }));
  const output = kernel.createIntegerBuffer(2, 8);
  for (const [table, parameters, expected] of vectors) {
    for (const backend of ["javascript", "gmp", "fmpz"]) {
      assert.equal(kernel[backend](kernel.packIntegerBuffer(table), kernel.packIntegerBuffer(parameters), output), true);
      assert.deepEqual(output.toArray().map(Number), expected, backend);
    }
  }
});
