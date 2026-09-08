// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const {readFileSync, writeFileSync, mkdtempSync, rmSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join, resolve} = require("node:path");
const {spawnSync} = require("node:child_process");
const test = require("node:test");
const {lowerSource} = require("../ir.cjs");
const {generateHostCore} = require("../c-backend.cjs");
const {compileKernel} = require("../compiler.cjs");
const {sanitizerEnvironment} = require("../../../test/helpers/sanitizers.cjs");
const sourcePath = join(__dirname, "integer_bit_length_witness.py");
const source = readFileSync(sourcePath, "utf8");

test("integer bit length is explicit, live-input-aware closed native IR", async () => {
  const ir = await lowerSource(source, sourcePath);
  const scalar = ir.functions.find(f => f.name === "scalar_bits");
  assert.ok(scalar.body.some(op => op.kind === "integer.bit_length"));
  assert.equal(scalar.analysis.execution.arithmeticOperations, 1);
  assert.equal(scalar.analysis.execution.integerGrowthOperations, 0);
  const core = generateHostCore(ir).source;
  assert.match(core, /set_mpz_uint64\([^\n]+mpz_sgn\(/);
  assert.match(core, /fmpz_set_ui\([^\n]+fmpz_bits\(/);
  assert.match(core, /sagejs_word_bit_length\(/);
  assert.match(core, /sagejs_tagged_bit_length\(/);
  assert.doesNotMatch(core, /napi_|PyObject|PyLong/);
});

test("integer bit length rejects arguments and non-integer receivers", async () => {
  for (const expression of ["value.bit_length(1)",
    "value.bit_length(extra=1)", "value.bit_length(*[1])",
    'value.bit_length(**{"extra": 1})']) {
    await assert.rejects(lowerSource(
      `from sagejs.native import native\n@native\ndef bad(value: int) -> int:\n    return ${expression}\n`,
      "bad-bits.py"), /bit_length\(\) takes no arguments/);
  }
  await assert.rejects(lowerSource(
    "from sagejs.native import native\n@native\ndef bad(value: float) -> int:\n    return value.bit_length()\n",
    "float-bits.py"), /requires an integer receiver/);
});

test("bit length agrees with CPython on signs, boundaries, aliases and resident calls", {
  timeout: 240_000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-int-bit-length-"));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const compiled = await compileKernel({sourcePath, cacheRoot: directory});
  const module = require(compiled.modulePath);
  assert.equal(module.nativeAvailable, true);
  const cases = new Set([0n, 1n, -1n]);
  for (const exponent of [...Array.from({length: 130}, (_, i) => i), 255, 256, 511,
    512, 1023, 1024, 4095, 4096, 16384]) {
    const power = 1n << BigInt(exponent);
    for (const delta of [-1n, 0n, 1n]) {
      cases.add(power + delta); cases.add(-power + delta);
    }
  }
  let state = 17n;
  for (let i = 0; i < 300; i++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 127n) - 1n);
    cases.add((i % 2 ? -state : state) << BigInt(i % 211));
  }
  const values = [...cases];
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const oracle = spawnSync(python, ["-c",
    "import json,sys; print(json.dumps([int(x,16).bit_length() for x in json.load(sys.stdin)]))"],
    {encoding: "utf8", input: JSON.stringify(values.map(x => x.toString(16)))});
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout).map(BigInt);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (let i = 0; i < values.length; i++) {
      assert.equal(module.scalar_bits[backend](values[i]), expected[i], backend + " scalar " + i);
      assert.equal(module.aliased_bits[backend](values[i]),
        expected[i] === 0n ? 0n : BigInt(expected[i].toString(2).length), backend + " alias " + i);
    }
    for (const value of [0n, 1n, 1n << 63n, (1n << 64n) - 1n]) {
      assert.equal(module.unsigned_bits[backend](value),
        value === 0n ? 0n : BigInt(value.toString(2).length));
    }
  }
  for (const backend of ["javascript", "gmp", "fmpz"]) {
    for (let i = 0; i < values.length; i++) {
      assert.equal(module.resident_bits[backend](values[i]), expected[i], backend + " resident " + i);
    }
  }
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const value of [0n, -(1n << 63n), (1n << 4096n) + 1n]) {
      const counter = module.expression_bits.packIntegerBuffer([0n]);
      const result = module.expression_bits[backend](counter, value);
      assert.equal(result, value === 0n ? 0n : BigInt((value < 0n ? -value : value).toString(2).length));
      assert.deepEqual(counter.toArray(), [1n], "receiver evaluated exactly once");
    }
  }
  console.log(values.length + " CPython integer cases per backend");
});

test("word magnitudes and tagged aliases survive sanitizers", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
  timeout: 120_000,
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-bit-length-sanitizer-"));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const core = generateHostCore(await lowerSource(source, sourcePath));
  writeFileSync(join(directory, "kernel_core.c"), core.source);
  writeFileSync(join(directory, "kernel_core.h"), core.header);
  writeFileSync(join(directory, "harness.c"), String.raw`
#include <assert.h>
#include "kernel_core.c"
int main(void) {
    assert(sagejs_word_bit_length(0) == 0);
    assert(sagejs_word_bit_length(INT64_MIN) == 64);
    assert(sagejs_word_bit_length(INT64_MAX) == 63);
    for (unsigned int i = 0; i < 63; i++) {
        int64_t value = (int64_t) (UINT64_C(1) << i);
        assert(sagejs_word_bit_length(value) == i + 1);
        assert(sagejs_word_bit_length(-value) == i + 1);
        assert(sagejs_word_bit_length(value - 1) == i);
    }
    sagejs_tagged_int value;
    sagejs_tagged_init(&value);
    sagejs_tagged_set_small(&value, INT64_MIN);
    sagejs_tagged_set_uint64(&value, sagejs_tagged_bit_length(&value));
    assert(!value.is_big && value.small == 64);
    sagejs_tagged_make_big(&value);
    mpz_set_ui(value.big, 1);
    mpz_mul_2exp(value.big, value.big, 16384);
    mpz_neg(value.big, value.big);
    sagejs_tagged_set_uint64(&value, sagejs_tagged_bit_length(&value));
    assert(!value.is_big && value.small == 16385);
    sagejs_tagged_clear(&value);
    return 0;
}
`);
  const root = resolve(__dirname, "../../..");
  const prefix = process.env.SAGEJS_FLINT_PREFIX || join(root, "packages/flint/.native/prefix");
  const libraries = ["flint", "mpfr", "gmp", "openblas"].map(name => join(prefix, "lib", `lib${name}.a`));
  const build = spawnSync(process.env.CC || "cc", ["-std=c11", "-O1", "-g",
    "-fno-omit-frame-pointer", process.platform === "darwin" ? "-fsanitize=undefined" : "-fsanitize=address,undefined",
    `-I${directory}`, `-I${join(prefix, "include")}`, join(directory, "harness.c"),
    ...(process.platform === "darwin" ? libraries : ["-Wl,--start-group", ...libraries, "-Wl,--end-group"]),
    "-lm", "-lpthread", "-ldl", "-o", join(directory, "harness")],
  {encoding: "utf8", timeout: 120_000});
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const result = spawnSync(join(directory, "harness"), [], {
    encoding: "utf8", env: sanitizerEnvironment({strictStringChecks: true}), timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
