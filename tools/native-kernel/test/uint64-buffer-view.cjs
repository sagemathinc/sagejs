"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const witness = join(__dirname, "uint64_buffer_view_witness.py");

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
