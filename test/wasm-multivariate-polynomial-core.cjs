// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { WASI } = require("node:wasi");

const root = resolve(__dirname, "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX || join(root, "packages/flint/.native/prefix"),
);
const core = join(root, "packages/flint/src/multivariate_wasm_core.c");
const coreInclude = join(root, "packages/flint/src");

function compile(compiler, arguments_, options = {}) {
  const result = spawnSync(compiler, arguments_, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function publicResult(environment = {}) {
  const source = [
    "R = PolynomialRing(ZZ, names=('x', 'y', 'z'), order='lex')",
    "x, y, z = R.gens()",
    "large = 2**100 + 17",
    "print((x**2 + y).resultant(x + z, x))",
    "print((x + large*y).resultant(x + z, x))",
  ].join("\n");
  const result = spawnSync(process.execPath, [join(root, "bin/sagejs"), "--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const driver = String.raw`
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "multivariate_wasm_core.h"

static void put_u32(uint8_t *bytes, size_t *offset, uint32_t value)
{
    bytes[*offset] = (uint8_t) value;
    bytes[*offset + 1] = (uint8_t) (value >> 8);
    bytes[*offset + 2] = (uint8_t) (value >> 16);
    bytes[*offset + 3] = (uint8_t) (value >> 24);
    *offset += 4;
}

static uint32_t get_u32(const uint8_t *bytes, size_t offset)
{
    return (uint32_t) bytes[offset] |
        ((uint32_t) bytes[offset + 1] << 8) |
        ((uint32_t) bytes[offset + 2] << 16) |
        ((uint32_t) bytes[offset + 3] << 24);
}

static void term(uint8_t *bytes, size_t *offset, uint32_t sign,
    const uint32_t *words, uint32_t word_count,
    uint32_t x, uint32_t y, uint32_t z)
{
    uint32_t index;
    put_u32(bytes, offset, sign);
    put_u32(bytes, offset, word_count);
    for (index = 0; index < word_count; index++)
        put_u32(bytes, offset, words[index]);
    put_u32(bytes, offset, x);
    put_u32(bytes, offset, y);
    put_u32(bytes, offset, z);
}

static size_t header(uint8_t *bytes, uint32_t left, uint32_t right)
{
    size_t offset = 0;
    put_u32(bytes, &offset, SAGEJS_MPOLY_PACKED_INPUT_MAGIC);
    put_u32(bytes, &offset, SAGEJS_MPOLY_PACKED_VERSION);
    put_u32(bytes, &offset, SAGEJS_MPOLY_PACKED_RESULTANT);
    put_u32(bytes, &offset, 3);
    put_u32(bytes, &offset, SAGEJS_MPOLY_PACKED_LEX);
    put_u32(bytes, &offset, 0);
    put_u32(bytes, &offset, left);
    put_u32(bytes, &offset, right);
    return offset;
}

static int find_term(const uint8_t *output, uint32_t x, uint32_t y, uint32_t z,
    uint32_t *sign, uint32_t *words, uint32_t *word_count)
{
    size_t offset = 24;
    uint32_t term_index;
    for (term_index = 0; term_index < get_u32(output, 20); term_index++)
    {
        uint32_t index;
        uint32_t current_sign = get_u32(output, offset);
        uint32_t count = get_u32(output, offset + 4);
        size_t exponent_offset = offset + 8 + (size_t) count * 4;
        if (get_u32(output, exponent_offset) == x &&
            get_u32(output, exponent_offset + 4) == y &&
            get_u32(output, exponent_offset + 8) == z)
        {
            *sign = current_sign;
            *word_count = count;
            for (index = 0; index < count; index++)
                words[index] = get_u32(output, offset + 8 + index * 4);
            return 1;
        }
        offset = exponent_offset + 12;
    }
    return 0;
}

static void simple_and_large(void)
{
    uint8_t input[512], output[4096];
    uint32_t one[] = {1};
    uint32_t large[] = {17, 0, 0, 16};
    uint32_t sign, words[8], word_count;
    size_t offset = header(input, 2, 2), output_length = 0;
    int status;

    term(input, &offset, 1, one, 1, 2, 0, 0);
    term(input, &offset, 1, one, 1, 0, 1, 0);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    term(input, &offset, 1, one, 1, 0, 0, 1);
    status = sagejs_fmpz_mpoly_resultant_packed(
        input, offset, NULL, 0, &output_length);
    assert(status == SAGEJS_MPOLY_PACKED_OUTPUT_TOO_SMALL);
    assert(output_length > 24 && output_length < sizeof(output));
    status = sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, output_length - 1, &output_length);
    assert(status == SAGEJS_MPOLY_PACKED_OUTPUT_TOO_SMALL);
    status = sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, sizeof(output), &output_length);
    assert(status == SAGEJS_MPOLY_PACKED_OK);
    assert(get_u32(output, 0) == SAGEJS_MPOLY_PACKED_OUTPUT_MAGIC);
    assert(get_u32(output, 20) == 2);
    assert(find_term(output, 0, 1, 0, &sign, words, &word_count));
    assert(sign == 1 && word_count == 1 && words[0] == 1);
    assert(find_term(output, 0, 0, 2, &sign, words, &word_count));
    assert(sign == 1 && word_count == 1 && words[0] == 1);

    offset = header(input, 2, 2);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    term(input, &offset, 1, large, 4, 0, 1, 0);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    term(input, &offset, 1, one, 1, 0, 0, 1);
    status = sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, sizeof(output), &output_length);
    assert(status == SAGEJS_MPOLY_PACKED_OK);
    assert(find_term(output, 0, 1, 0, &sign, words, &word_count));
    assert(sign == 2 && word_count == 4);
    assert(words[0] == 17 && words[1] == 0 && words[2] == 0 && words[3] == 16);
    assert(find_term(output, 0, 0, 1, &sign, words, &word_count));
    assert(sign == 1 && word_count == 1 && words[0] == 1);
}

static void rejected_domains(void)
{
    uint8_t input[512], output[512];
    uint32_t one[] = {1};
    size_t offset, output_length;

    offset = header(input, 2, 1);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    term(input, &offset, 1, one, 1, 0, 1, 0);
    assert(sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, sizeof(output), &output_length) ==
        SAGEJS_MPOLY_PACKED_MALFORMED);

    offset = header(input, 1, 1);
    term(input, &offset, 1, one, 1, 9, 0, 0);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    assert(sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, sizeof(output), &output_length) ==
        SAGEJS_MPOLY_PACKED_UNSUPPORTED);

    offset = header(input, 1, 1);
    term(input, &offset, 1, one, 1, 1, 9, 0);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    assert(sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, sizeof(output), &output_length) ==
        SAGEJS_MPOLY_PACKED_UNSUPPORTED);

    offset = header(input, 1, 1);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    term(input, &offset, 1, one, 1, 1, 0, 0);
    input[offset++] = 0;
    assert(sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, sizeof(output), &output_length) ==
        SAGEJS_MPOLY_PACKED_MALFORMED);
}

static void zero_result(void)
{
    uint8_t input[128], output[128];
    uint32_t one[] = {1};
    size_t offset = header(input, 0, 1), output_length;
    term(input, &offset, 1, one, 1, 1, 0, 0);
    assert(sagejs_fmpz_mpoly_resultant_packed(
        input, offset, output, sizeof(output), &output_length) ==
        SAGEJS_MPOLY_PACKED_OK);
    assert(output_length == 24 && get_u32(output, 20) == 0);
}

int main(void)
{
    simple_and_large();
    rejected_domains();
    zero_result();
    puts("bounded-multivariate-resultant-core-ok");
    return 0;
}
`;

test("packed FLINT resultant core is exact and rejects malformed domains", {
  skip: process.platform === "win32" ? "compiled by Windows CI through ClangCL" : false,
}, () => {
  assert.ok(existsSync(join(prefix, "include/flint/fmpz_mpoly.h")));
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-mpoly-core-"));
  try {
    const source = join(temporary, "driver.c");
    const executable = join(temporary, "driver");
    writeFileSync(source, driver);
    compile(process.env.CC || "cc", [
      "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
      `-I${coreInclude}`, `-I${join(prefix, "include")}`,
      core, source,
      `-L${join(prefix, "lib")}`,
      "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lpthread", "-lm",
      "-o", executable,
    ]);
    const result = spawnSync(executable, [], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "bounded-multivariate-resultant-core-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("public Node resultants agree with the native-disabled oracle", () => {
  const expected = [
    "y + z^2",
    "-1267650600228229401496703205393*y + z",
  ].join("\n");
  assert.equal(publicResult(), expected);
  assert.equal(publicResult({ SAGEJS_NATIVE_DISABLE: "1" }), expected);
});

function wasmToolchain() {
  const resolver = require("../packages/flint-wasm/scripts/wasm-toolchain.cjs");
  try {
    const current = resolver.resolveToolchain();
    return current.ready ? current.paths : null;
  } catch {
    return null;
  }
}

test("the same packed core links and executes as direct FLINT WebAssembly", {
  skip: wasmToolchain() ? false : "pinned FLINT Wasm toolchain is not prepared",
}, async () => {
  const toolchain = wasmToolchain();
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-mpoly-wasm-"));
  try {
    const source = join(temporary, "driver.c");
    const wasm = join(temporary, "driver.wasm");
    writeFileSync(source, driver);
    compile(toolchain.clang, [
      "--target=wasm32-wasip1", `--sysroot=${toolchain.sysroot}`,
      "-std=c11", "-O3", "-Wall", "-Wextra", "-Werror",
      `-I${coreInclude}`,
      `-I${join(toolchain.libraries.flint.prefix, "include")}`,
      `-I${join(toolchain.libraries.gmp.prefix, "include")}`,
      core, source,
      `-L${join(toolchain.libraries.flint.prefix, "lib")}`,
      `-L${join(toolchain.libraries.mpfr.prefix, "lib")}`,
      `-L${join(toolchain.libraries.gmp.prefix, "lib")}`,
      "-lflint", "-lmpfr", "-lgmp", "-lm", "-lwasi-emulated-signal",
      "-o", wasm,
    ]);
    const wasi = new WASI({ version: "preview1" });
    const module = await WebAssembly.compile(readFileSync(wasm));
    const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
    const exitCode = wasi.start(instance);
    assert.equal(exitCode, 0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
