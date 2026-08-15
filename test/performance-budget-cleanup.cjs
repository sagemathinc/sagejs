"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const { join } = require("node:path");

const root = join(__dirname, "..");
const budgetScripts = [
  {
    path: "scripts/check-finite-matrix-budget.cjs",
    cacheVariable: "nativeCache",
  },
  {
    path: "scripts/check-integer-matrix-budget.cjs",
    cacheVariable: "cache",
  },
  {
    path: "scripts/check-rational-matrix-budget.cjs",
    cacheVariable: "cache",
  },
  {
    path: "scripts/check-polynomial-budget.cjs",
    cacheVariable: "cache",
  },
];

test("performance budgets await session shutdown before removing native caches", () => {
  for (const { path, cacheVariable } of budgetScripts) {
    const source = readFileSync(join(root, path), "utf8");
    const awaitedClose = source.lastIndexOf("await session.close();");
    const cacheRemoval = source.lastIndexOf(`rmSync(${cacheVariable},`);

    assert.notEqual(awaitedClose, -1, `${path} must await session.close()`);
    assert.notEqual(cacheRemoval, -1, `${path} must remove its native cache`);
    assert.ok(
      awaitedClose < cacheRemoval,
      `${path} must finish session shutdown before native cache removal`,
    );
    assert.doesNotMatch(
      source,
      /(?<!await )session\.close\(\);/,
      `${path} must not leave session shutdown running in the background`,
    );
  }
});

test("awaited session shutdown settles before cache removal", async () => {
  const events = [];
  const session = {
    async close() {
      events.push("close-started");
      await new Promise((resolve) => setImmediate(resolve));
      events.push("close-finished");
    },
  };

  try {
    try {
      events.push("budget-finished");
    } finally {
      await session.close();
    }
  } finally {
    events.push("cache-removed");
  }

  assert.deepEqual(events, [
    "budget-finished",
    "close-started",
    "close-finished",
    "cache-removed",
  ]);
});
