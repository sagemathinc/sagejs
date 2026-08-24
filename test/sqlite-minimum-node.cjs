// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("SQLite row configuration works at the minimum Node version", async () => {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(
      [
        "import sqlite3",
        "db = sqlite3.connect(':memory:')",
        "row = db.execute('select 9007199254740993 as value').fetchone()",
        "database = GraphDatabase()",
        "graphs = list(database.query(num_vertices=4, regular=True))",
        "answer = (row[0], [G.graph6_string() for G in graphs],",
        "          [G.order() for G in graphs])",
        "database.close()",
        "db.close()",
        "answer",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "(9007199254740993, ['C?', 'CK', 'C]', 'C~'], [4, 4, 4, 4])",
    );
  } finally {
    await session.close();
  }
});
