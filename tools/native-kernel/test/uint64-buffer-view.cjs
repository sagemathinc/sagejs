"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const witness = join(__dirname, "uint64_buffer_view_witness.py");

const uint64Int64IndexSource = String.raw`
from sagejs.native import (
    Int64Buffer,
    int64,
    is_compiled,
    native,
    uint64,
)


@native
def signed_get(storage: Int64Buffer, index: uint64) -> int64:
    return storage[index]


@native
def signed_set(
    storage: Int64Buffer,
    index: uint64,
    value: int64,
) -> int64:
    storage[index] = value
    return storage[index]


values = [-5, 8, 13]
assert signed_get(values, 1) == 8
assert signed_set(values, 1, -21) == -21
assert list(values) == [-5, -21, 13]
for call in (
    lambda: signed_get(values, 3),
    lambda: signed_set(values, 3, 34),
):
    try:
        call()
    except IndexError:
        pass
    else:
        raise AssertionError("missing Int64Buffer bounds error")
assert list(values) == [-5, -21, 13]
print("compiled=" + str(is_compiled(signed_get)))
print("UINT64_INT64_INDEX_OK")
`;

test("UInt64Buffer views lower as checked borrowed spans", async () => {
  const fallback = spawnSync(
    "python3",
    [
      "-c",
      [
        "import sys",
        `sys.path[:0] = [${JSON.stringify(join(__dirname, "../../../src/lib"))}, ${JSON.stringify(__dirname)}]`,
        "from uint64_buffer_view_witness import update_view",
        "owner = [2, 3, 5, 7, 11]",
        "assert update_view(owner, 1, 3) == 10",
        "assert owner == [2, 10, 5, 7, 11]",
        "owner = [(1 << 64) - 1, 1]",
        "assert update_view(owner, 0, 2) == 0",
        "assert owner == [0, 1]",
        "try:",
        "    update_view([2, 3, 5], 2, 2)",
        "except IndexError as error:",
        "    assert str(error) == 'UInt64Buffer view is outside its buffer'",
        "else:",
        "    raise AssertionError('missing invalid-view error')",
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(fallback.status, 0, fallback.stderr);

  const ir = await lowerSource(readFileSync(witness, "utf8"), witness);
  const fn = ir.functions.find((entry) => entry.name === "update_view");
  assert(fn);
  assert(fn.body.some((operation) => operation.kind === "uint64.buffer.view"));

  const cacheDirectory = mkdtempSync(join(tmpdir(), "sagejs-u64-view-"));
  const built = await compileKernel({ sourcePath: witness, cacheDirectory });
  const core = readFileSync(built.coreSourcePath, "utf8");
  assert.match(core, /UInt64Buffer view is outside its buffer/);
  assert.match(core, /\.data \+= \(size_t\)/);

  const fnc = require(built.modulePath).update_view;
  const empty = require(built.modulePath).empty_view;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const owner = fnc.createUInt64Buffer([2n, 3n, 5n, 7n, 11n]);
    assert.equal(fnc[backend](owner, 1n, 3n), 10n);
    assert.deepEqual(Array.from(owner), [2n, 10n, 5n, 7n, 11n]);

    const wrapping = fnc.createUInt64Buffer([(1n << 64n) - 1n, 1n]);
    assert.equal(fnc[backend](wrapping, 0n, 2n), 0n);
    assert.deepEqual(Array.from(wrapping), [0n, 1n]);

    const emptyOwner = empty.createUInt64Buffer([]);
    assert.equal(empty[backend](emptyOwner, 0n), 0n);

    const short = fnc.createUInt64Buffer([2n, 3n, 5n]);
    assert.throws(
      () => fnc[backend](short, 2n, 2n),
      /UInt64Buffer view is outside its buffer/,
    );
    assert.deepEqual(Array.from(short), [2n, 3n, 5n]);
  }
});

test("uint64 Int64Buffer indices retain correctly grouped bounds guards", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-u64-i64-index-"));
  const sourcePath = join(temporary, "uint64_int64_index.py");
  writeFileSync(sourcePath, uint64Int64IndexSource);
  try {
    const built = await compileKernel({ sourcePath, cacheDirectory: temporary });
    const core = readFileSync(built.coreSourcePath, "utf8");
    assert.match(
      core,
      /if \(!\([^\n]+ < \(uint64_t\) [^\n]+\.length\)\)/,
    );
    assert.doesNotMatch(
      core,
      /if \(![^\n(]+ < \(uint64_t\) [^\n]+\.length\)/,
    );

    const module = require(built.modulePath);
    for (const backend of ["javascript", "gmp", "tagged"]) {
      const get = module.signed_get;
      const set = module.signed_set;
      const values = get.createInt64Buffer([-5n, 8n, 13n]);
      assert.equal(get[backend](values, 1n), 8n);
      assert.equal(set[backend](values, 1n, -21n), -21n);
      assert.deepEqual(Array.from(values), [-5n, -21n, 13n]);
      assert.throws(
        () => get[backend](values, 3n),
        /Int64 buffer index out of range/,
      );
      assert.throws(
        () => set[backend](values, 3n, 34n),
        /Int64 buffer index out of range/,
      );
      assert.deepEqual(Array.from(values), [-5n, -21n, 13n]);
    }

    const fallback = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import sys",
          `sys.path.insert(0, ${JSON.stringify(join(__dirname, "../../../src/lib"))})`,
          `exec(open(${JSON.stringify(sourcePath)}).read())`,
        ].join("\n"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(fallback.status, 0, fallback.stderr);
    assert.match(fallback.stdout, /compiled=False/);
    assert.match(fallback.stdout, /UINT64_INT64_INDEX_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
