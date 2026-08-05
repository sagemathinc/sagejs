"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = path.resolve(__dirname, "..");
const audit = JSON.parse(
  fs.readFileSync(path.join(root, "website/coverage/graphics-3d.json"), "utf8"),
);

test("published SageMath 3D export coverage is reproducible", async () => {
  assert.equal(audit.metric.denominator, audit.exports.length);
  assert.equal(
    audit.metric.numerator,
    audit.exports.filter((entry) => entry.status === "supported").length,
  );
  assert.equal(
    audit.metric.percentage,
    Math.round((1000 * audit.metric.numerator) / audit.metric.denominator) / 10,
  );
  assert.equal(new Set(audit.exports.map((entry) => entry.name)).size, audit.exports.length);
  assert.ok(audit.facets.some((facet) => facet.status === "partial"));

  const names = audit.exports.map((entry) => entry.name);
  for (const name of names) assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/);
  const session = await createSage();
  try {
    const result = await session.evaluate(`[${names.map((name) => `callable(${name})`).join(", ")}]`);
    assert.equal(result.repr, `[${names.map(() => "True").join(", ")}]`);
  } finally {
    await session.close();
  }
});
