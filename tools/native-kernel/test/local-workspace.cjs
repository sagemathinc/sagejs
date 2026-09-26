"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

const source = String.raw`
from sagejs.native import Float64Buffer, IntegerBuffer, Int64Buffer, float64_workspace, integer_workspace, int64_workspace, native


def private_leaf(exact: IntegerBuffer, signed: Int64Buffer, real: Float64Buffer, value: int) -> int:
    exact[48] = value * value
    signed[1] = value
    real[0] = float(value)
    real[1] = real[0] * 0.5
    return exact[48] + signed[1] + int(real[1])


@native
def local_workspace_root(value: int) -> int:
    exact: IntegerBuffer = integer_workspace(49, 3)
    signed: Int64Buffer = int64_workspace(3)
    real: Float64Buffer = float64_workspace(2)
    return private_leaf(exact, signed, real, value)


@native
def local_workspace_overflow(value: int) -> int:
    exact: IntegerBuffer = integer_workspace(1, 1)
    exact[0] = value
    return exact[0]
`;

test("fixed local workspaces lower to bounded automatic storage", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-local-workspace-"));
  try {
    const sourcePath = join(temporary, "local_workspace.py");
    writeFileSync(sourcePath, source);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
      functions: ["local_workspace_root", "local_workspace_overflow"],
    });
    const root = compiled.ir.functions.find(
      (fn) => fn.name === "local_workspace_root",
    );
    assert(root);
    const allocations = root.body.filter((operation) =>
      operation.kind.endsWith(".workspace.allocate")
    );
    assert.deepEqual(allocations.map((operation) => operation.kind), [
      "integer.workspace.allocate",
      "int64.workspace.allocate",
      "float64.workspace.allocate",
    ]);
    assert.deepEqual(
      allocations.map((operation) => operation.storage),
      Array(3).fill("fixed-automatic-zeroed"),
    );

    const generated = readFileSync(compiled.coreSourcePath, "utf8");
    assert.match(generated, /int32_t \w*sagejs_native_tmp_\d+_sizes\[49\] = \{0\};/u);
    assert.match(generated, /uint64_t \w*sagejs_native_tmp_\d+_limbs\[147\] = \{0\};/u);
    assert.match(generated, /int64_t \w*sagejs_native_tmp_\d+_data\[3\] = \{0\};/u);
    assert.match(generated, /double \w*sagejs_native_tmp_\d+_data\[2\] = \{0\};/u);
    const allocationLines = generated.split("\n").filter((line) =>
      line.includes("sagejs_native_tmp_") &&
      (line.includes("_sizes[") || line.includes("_limbs[") ||
        line.includes("_data["))
    );
    assert(allocationLines.length >= 4);
    assert(!allocationLines.some((line) => /malloc|calloc|realloc/u.test(line)));

    const fn = require(compiled.modulePath).local_workspace_root;
    const value = (1n << 40n) + 7n;
    const expected = value * value + value + value / 2n;
    assert.equal(fn.gmp(value), expected);
    assert.equal(fn.javascript(value), expected);
    const overflow = require(compiled.modulePath).local_workspace_overflow;
    const tooWide = 1n << 80n;
    assert.throws(() => overflow.gmp(tooWide), /word capacity exceeded/u);
    assert.equal(overflow.javascript(tooWide), tooWide);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("fixed local workspaces fail closed outside their bounded form", async () => {
  const cases = [
    [
      "dynamic shape",
      `from sagejs.native import IntegerBuffer, integer_workspace, native\n@native\ndef bad(n: int) -> int:\n    a: IntegerBuffer = integer_workspace(n, 2)\n    return 0\n`,
      /length must be a nonnegative integer literal/u,
    ],
    [
      "missing exact capacity",
      `from sagejs.native import IntegerBuffer, integer_workspace, native\n@native\ndef bad() -> int:\n    a: IntegerBuffer = integer_workspace(4, 0)\n    return 0\n`,
      /word capacity must be a positive integer literal/u,
    ],
    [
      "stack budget",
      `from sagejs.native import Int64Buffer, int64_workspace, native\n@native\ndef bad() -> int:\n    a: Int64Buffer = int64_workspace(131073)\n    return 0\n`,
      /exceed the 1 MiB native stack budget/u,
    ],
    [
      "loop allocation",
      `from sagejs.native import Int64Buffer, int64_workspace, native\n@native\ndef bad() -> int:\n    for i in range(2):\n        a: Int64Buffer = int64_workspace(4)\n    return 0\n`,
      /only allowed in the top-level native function block/u,
    ],
    [
      "workspace escape",
      `from sagejs.native import IntegerBuffer, integer_workspace, native\n@native\ndef bad() -> IntegerBuffer:\n    a: IntegerBuffer = integer_workspace(4, 2)\n    return a\n`,
      /borrowed buffer values cannot be returned/u,
    ],
  ];
  for (const [label, program, pattern] of cases) {
    await assert.rejects(lowerSource(program, `${label}.py`), pattern);
  }
});
