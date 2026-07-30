"use strict";

const test = require("node:test");
const { basename, join } = require("node:path");

const root = join(__dirname, "..");
const {
  createCompilerTestHarness,
} = require("../dist/tools/test.js");

const harness = createCompilerTestHarness(
  root,
  join(root, "src"),
  join(root, "dist", "compiler"),
);

for (const filename of harness.files()) {
  test(`compiler/${basename(filename)}`, { timeout: 30_000 }, (context) => {
    const result = harness.run(filename);
    if (result.skipped) {
      context.skip("disabled by an in-file marker");
      return;
    }
    context.diagnostic(`${result.durationMs} ms`);
  });
}
