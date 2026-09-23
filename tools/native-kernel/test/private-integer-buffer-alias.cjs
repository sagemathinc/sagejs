"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  privateIntegerBufferPlan,
} = require("../private-integer-buffer-authority.cjs");
const {
  emitPrivateIntegerBufferRuntime,
} = require("../private-integer-buffer-emitter.cjs");

function runtimeSupport() {
  const root = {
    name: "root",
    params: [
      { name: "private_a", type: "IntegerBuffer" },
      { name: "private_b", type: "IntegerBuffer" },
      { name: "public_c", type: "IntegerBuffer" },
    ],
    body: [
      { kind: "integer.buffer.set", buffer: "private_a", index: "i", value: "x" },
      { kind: "integer.buffer.set", buffer: "private_b", index: "i", value: "x" },
      { kind: "integer.buffer.get", buffer: "public_c", index: "i" },
      { kind: "return", value: "x", type: "Integer" },
    ],
  };
  const claim = privateIntegerBufferPlan(
    [root], root, ["private_a", "private_b"],
  );
  return emitPrivateIntegerBufferRuntime([root], root, claim).support;
}

test("runtime alias gate rejects every overlapping root storage range", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-private-alias-"));
  const source = path.join(directory, "alias.c");
  const executable = path.join(directory, "alias");
  fs.writeFileSync(source, String.raw`
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include <limits.h>
#include <gmp.h>
typedef struct {
    int32_t *sizes;
    uint64_t *limbs;
    size_t length;
    size_t word_capacity;
} sagejs_integer_buffer;
typedef struct { int code; } sagejs_native_status;
#define SAGEJS_NATIVE_RANGE_ERROR 1
static void sagejs_native_status_set(
    sagejs_native_status *status, int code, const char *message)
{ (void)message; status->code = code; }
${runtimeSupport()}
#define EXPECT(value) do { if (!(value)) return __LINE__; } while (0)
static sagejs_integer_buffer buffer(
    int32_t *sizes, uint64_t *limbs, size_t length)
{
    sagejs_integer_buffer answer = { sizes, limbs, length, 2 };
    return answer;
}
int main(void)
{
    int32_t sizes_a[8] = {0}, sizes_b[8] = {0}, sizes_c[8] = {0};
    uint64_t limbs_a[16] = {0}, limbs_b[16] = {0}, limbs_c[16] = {0};
    sagejs_integer_buffer a = buffer(sizes_a, limbs_a, 2);
    sagejs_integer_buffer b = buffer(sizes_b, limbs_b, 2);
    sagejs_integer_buffer c = buffer(sizes_c, limbs_c, 2);
    sagejs_integer_buffer *private_pair[2] = { &a, &b };
    sagejs_integer_buffer *private_public[2] = { &a, &c };
    sagejs_private_integer_buffer_context context = {0};
    sagejs_private_integer_buffer_state state = {0};
    sagejs_private_integer_buffer_state *table[2] = {0};

    EXPECT(sagejs_private_integer_buffers_disjoint(private_pair, 2));
    EXPECT(sagejs_private_integer_buffers_disjoint(private_public, 2));

    b.sizes = a.sizes;
    EXPECT(!sagejs_private_integer_buffers_disjoint(private_pair, 2));
    b.sizes = sizes_b;
    b.limbs = a.limbs;
    EXPECT(!sagejs_private_integer_buffers_disjoint(private_pair, 2));
    b.limbs = limbs_b;
    b.sizes = a.sizes + 1;
    EXPECT(!sagejs_private_integer_buffers_disjoint(private_pair, 2));
    b.sizes = sizes_b;
    b.limbs = a.limbs + 1;
    EXPECT(!sagejs_private_integer_buffers_disjoint(private_pair, 2));

    b.limbs = limbs_b;
    c.limbs = a.limbs;
    EXPECT(!sagejs_private_integer_buffers_disjoint(private_public, 2));
    c.limbs = limbs_c;

    b.sizes = a.sizes;
    sagejs_private_integer_buffer_context_begin(&context, table, 2);
    if (sagejs_private_integer_buffers_disjoint(private_pair, 2))
        sagejs_private_integer_buffer_begin(&context, &state, &a);
    EXPECT(sagejs_private_integer_buffer_lookup(&a) == NULL);
    sagejs_private_integer_buffer_context_end(&context);

    b.sizes = sizes_b;
    sagejs_private_integer_buffer_context_begin(&context, table, 2);
    EXPECT(sagejs_private_integer_buffer_lookup(&a) == NULL);
    sagejs_private_integer_buffer_begin(&context, &state, &a);
    EXPECT(sagejs_private_integer_buffer_lookup(&a) == &state);
    sagejs_private_integer_buffer_context_end(&context);
    return 0;
}
`);
  const built = spawnSync("cc", [
    "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wno-unused-function",
    source, "-lgmp", "-o", executable,
  ], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  const run = spawnSync(executable, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
