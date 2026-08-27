// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join } = require("node:path");
const test = require("node:test");

const {
  createCompilerTestHarness,
} = require("../dist/tools/test.js");

const root = join(__dirname, "..");

test("compiler harness preserves Python kwargs for source-imported modules", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-compiler-source-"));
  const filename = join(directory, `typing-source-${process.pid}.py`);
  const generated = join(tmpdir(), `${basename(filename)}.js`);
  writeFileSync(
    filename,
    [
      "import typing",
      'T = typing.TypeVar("T", covariant=True)',
      "assert T.__covariant__ is True",
      "",
    ].join("\n"),
  );

  try {
    const harness = await createCompilerTestHarness(
      root,
      join(root, "src"),
      join(root, "dist", "compiler"),
    );
    const result = harness.run(filename);
    assert.equal(result.skipped, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(generated, { force: true });
  }
});
