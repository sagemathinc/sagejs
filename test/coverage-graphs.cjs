"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = path.resolve(__dirname, "..");
const audit = JSON.parse(
  fs.readFileSync(path.join(root, "website/coverage/graphs.json"), "utf8"),
);

function implementedPublicMethodCount() {
  const source = fs.readFileSync(
    path.join(root, "src/baselib/graphs.py"),
    "utf8",
  );
  const classes = new Set([
    "GraphAutomorphism",
    "GraphAutomorphismGroup",
    "GraphPlot",
    "GenericGraph",
    "DiGraph",
    "GraphGenerators",
    "DigraphGenerators",
    "GraphQuery",
    "GraphDatabase",
  ]);
  const methods = new Set();
  let currentClass;
  for (const line of source.split("\n")) {
    const classMatch = line.match(/^class ([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (classMatch) {
      currentClass = classes.has(classMatch[1]) ? classMatch[1] : undefined;
      continue;
    }
    if (!currentClass) continue;
    if (line && !/^\s/.test(line)) {
      currentClass = undefined;
      continue;
    }
    const methodMatch = line.match(/^    def ([A-Za-z][A-Za-z0-9_]*)\s*\(/);
    if (methodMatch) {
      methods.add(`${currentClass}.${methodMatch[1]}`);
      continue;
    }
    const aliasMatch = line.match(
      /^    ([A-Za-z][A-Za-z0-9_]*)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\s*$/,
    );
    if (aliasMatch && aliasMatch[1] !== "toString") {
      methods.add(`${currentClass}.${aliasMatch[1]}`);
    }
  }
  return methods.size;
}

test("published SageMath graph coverage is reproducible", async () => {
  assert.equal(audit.metric.numerator, audit.supportedSageMethods.length);
  assert.equal(
    audit.metric.percentage,
    Math.round((1000 * audit.metric.numerator) / audit.metric.denominator) / 10,
  );
  assert.equal(
    new Set(audit.supportedSageMethods).size,
    audit.supportedSageMethods.length,
  );
  assert.equal(
    audit.internalMethodCoverage.denominator,
    implementedPublicMethodCount(),
  );
  assert.equal(
    audit.internalMethodCoverage.numerator,
    audit.internalMethodCoverage.denominator,
  );
  assert.ok(audit.facets.some((facet) => facet.status === "planned"));

  const session = await createSage();
  try {
    const names = JSON.stringify(audit.supportedSageMethods);
    const result = await session.evaluate(
      `g=Graph(); names=${names}; ` +
        "all([callable(getattr(g, name, None)) for name in names])",
    );
    assert.equal(result.repr, "True");
  } finally {
    await session.close();
  }
});
