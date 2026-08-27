// sagejs-test-tier: specialized
"use strict";

const test = require("node:test");
const { basename, join } = require("node:path");

const root = join(__dirname, "..");
const {
  createCompilerTestHarness,
} = require("../dist/tools/test.js");

(async () => {
const harness = await createCompilerTestHarness(
  root,
  join(root, "src"),
  join(root, "dist", "compiler"),
);

for (const filename of harness.files()) {
  const timeout = basename(filename) === "algebra.py" ? 60_000 : 30_000;
  test(`compiler/${basename(filename)}`, { timeout }, (context) => {
    const result = harness.run(filename);
    if (result.skipped) {
      context.skip(
        result.skipReason === "stage-zero-only"
          ? "historical non-Python stage-zero fixture"
          : "disabled by an in-file marker",
      );
      return;
    }
    context.diagnostic(`${result.durationMs} ms`);
  });
}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
