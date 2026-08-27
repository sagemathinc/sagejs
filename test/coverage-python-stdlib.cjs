// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = path.resolve(__dirname, "..");
const audit = JSON.parse(
  fs.readFileSync(path.join(root, "website/coverage/python-stdlib.json"), "utf8"),
);

test("published Python standard-library module coverage is reproducible", async () => {
  assert.equal(audit.metric.denominator, audit.referenceModules.length);
  assert.equal(audit.metric.numerator, audit.importableModules.length);
  assert.equal(
    audit.metric.percentage,
    Math.round((1000 * audit.metric.numerator) / audit.metric.denominator) / 10,
  );
  assert.deepEqual(audit.referenceModules, [...audit.referenceModules].sort());
  assert.deepEqual(audit.importableModules, [...audit.importableModules].sort());

  const source = audit.referenceModules
    .flatMap((name, index) => [
      "try:",
      `    import ${name} as _coverage_module_${index}`,
      `    print('OK ${name}')`,
      "except Exception:",
      "    pass",
    ])
    .join("\n");
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(source);
    const imported = result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3));
    assert.deepEqual(imported, audit.importableModules);
  } finally {
    await session.close();
  }
});
