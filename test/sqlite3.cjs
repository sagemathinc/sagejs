// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("sqlite3 provides the everyday Python DB-API surface", async () => {
  const session = await createSage({ mode: "python" });
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "import sqlite3",
            "db = sqlite3.connect(':memory:')",
            "db.execute('create table items(id integer primary key, name text)')",
            "cursor = db.executemany(",
            "    'insert into items(name) values (?)',",
            "    [('alpha',), ('beta',), ('gamma',)])",
            "rows = db.execute(",
            "    'select id, name from items where id >= ? order by id',",
            "    (2,)).fetchall()",
            "(sqlite3.apilevel, sqlite3.paramstyle, cursor.rowcount, rows,",
            " db.total_changes, db.in_transaction)",
          ].join("\n"),
        )
      ).repr,
      "('2.0', 'qmark', 3, [(2, 'beta'), (3, 'gamma')], 3, True)",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "db.commit()",
            "db.row_factory = sqlite3.Row",
            "row = db.execute(",
            "    'select name, 9007199254740993 as big from items '",
            "    'where id=:id', {'id': 1}).fetchone()",
            "answer = (row[0], row['NAME'], row['big'], row.keys(),",
            "          db.in_transaction)",
            "db.close()",
            "answer",
          ].join("\n"),
        )
      ).repr,
      "('alpha', 'alpha', 9007199254740993, ['name', 'big'], False)",
    );
  } finally {
    await session.close();
  }
});

test("sqlite3 transactions roll back and scripts execute", async () => {
  const session = await createSage({ mode: "python" });
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "import sqlite3",
            "db = sqlite3.connect(':memory:')",
            "db.executescript('create table t(x); insert into t values (1);')",
            "db.execute('insert into t values (?)', (2,))",
            "db.rollback()",
            "values = [row[0] for row in db.execute('select x from t')]",
            "db.close()",
            "values",
          ].join("\n"),
        )
      ).repr,
      "[1]",
    );
  } finally {
    await session.close();
  }
});
