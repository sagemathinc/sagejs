// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");

const genus2Row = {
  label: "277.a.277.1",
  class: "277.a",
  cond: 277,
  abs_disc: 277,
  eqn: "[[0,-1,-1],[1,1,1,1]]",
  analytic_rank: 0,
  analytic_rank_proved: true,
  mw_rank: 0,
  mw_rank_proved: true,
  locally_solvable: true,
  globally_solvable: 1,
  torsion_order: 15,
  torsion_subgroup: "[15]",
};

const numberFieldRow = {
  label: "3.1.23.1",
  degree: 3,
  coeffs: ["1", "0", "-1", "1"],
  r2: 1,
  disc_sign: -1,
  disc_abs: "23",
  index: 1,
  monogenic: 1,
  galt: "3T2",
  class_number: "1",
  class_group: [],
  regulator: "0.281199574323",
  torsion_order: 2,
  used_grh: false,
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("LMFDB bundled records query and construct exact objects", async () => {
  const session = await createSage({ mode: "python" });
  try {
    const answer = await session.evaluate(
      [
        "from sage.databases.lmfdb import LMFDB, between",
        "db = LMFDB(source='bundled')",
        "g = db.genus2_curves['277.a.277.1']",
        "C = g.curve()",
        "f, h = C.hyperelliptic_polynomials()",
        "n = db.number_fields['3.1.23.1']",
        "K = n.field('a')",
        "rows = list(db.genus2_curves.search(conductor=between(160, 250), sort=('conductor', 'label'), limit=None))",
        "raw = g.raw_data()",
        "raw['cond'] = -1",
        "normalized = g.to_dict()",
        "normalized['conductor'] = -1",
        "immutable = False",
        "try:",
        "    g.label = 'forged'",
        "except TypeError:",
        "    immutable = True",
        "(g.label, f.list(), h.list(), C.genus(),",
        " n.label, K.defining_polynomial().list(), K.degree(), K.signature(), K.discriminant(),",
        " [r.label for r in rows], g.conductor, immutable,",
        " g.metadata_status('analytic_rank'), n.metadata_status('class_number'),",
        " db.capabilities(), db.genus2_curves.coverage()['complete'],",
        " len(g.record_sha256))",
      ].join("\n"),
    );
    assert.equal(
      answer.repr,
      "('277.a.277.1', [0, -1, -1], [1, 1, 1, 1], 2, " +
        "'3.1.23.1', [1, 0, -1, 1], 3, (1, 1), -23, " +
        "['169.a.169.1', '196.a.21952.1'], 277, True, 'proved', " +
        "'reported-unconditional', {'network': False, 'offline': True, " +
        "'snapshot': True}, False, 64)",
    );
  } finally {
    await session.close();
  }
});

test("LMFDB snapshots are exact, offline, and tamper checked", async () => {
  const sandbox = mkdtempSync(join(tmpdir(), "sagejs-lmfdb-"));
  const snapshot = join(sandbox, "curves.sqlite3");
  const session = await createSage({ mode: "python" });
  try {
    const answer = await session.evaluate(
      [
        "from sage.databases.lmfdb import LMFDB, between",
        `path = ${JSON.stringify(snapshot)}`,
        "original = LMFDB(source='bundled')",
        "query = original.genus2_curves.search(discriminant_abs=between(160, 300), sort=('discriminant_abs', 'label'), limit=2)",
        "saved = query.snapshot(path)",
        "copy = LMFDB.open(saved)",
        "records = list(copy.genus2_curves.search(sort=('discriminant_abs', 'label'), limit=None))",
        "answer = (saved == path, [r.label for r in records],",
        " records[0] == original.genus2_curves[records[0].label],",
        " records[1].curve().genus(), records[0].source,",
        " records[0].provenance()['upstream_provider'],",
        " copy._provider._database.execute('pragma query_only').fetchone()[0],",
        " copy.capabilities())",
        "copy.close()",
        "answer",
      ].join("\n"),
    );
    assert.equal(
      answer.repr,
      "(True, ['169.a.169.1', '277.a.277.1'], True, 2, 'snapshot', " +
        "'bundled', 1, " +
        "{'network': False, 'offline': True, 'snapshot': True})",
    );

    assert.equal(
      (
        await session.evaluate(
          [
            "import sqlite3",
            `tamper = sqlite3.connect(${JSON.stringify(snapshot)})`,
            "tamper.execute(\"update records set record_sha256='0' where label='277.a.277.1'\")",
            "tamper.commit()",
            "tamper.close()",
            "failed = False",
            "try:",
            `    LMFDB.open(${JSON.stringify(snapshot)})`,
            "except Exception:",
            "    failed = True",
            "failed",
          ].join("\n"),
        )
      ).repr,
      "True",
    );
  } finally {
    await session.close();
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("LMFDB online provider is explicit, bounded, encoded, and same-origin", async () => {
  const requests = [];
  let maliciousNext = false;
  let malformedEquation = false;
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    const url = new URL(request.url, "http://127.0.0.1");
    assert.equal(url.searchParams.get("_format"), "json");
    const isNumberField = url.pathname === "/api/nf_fields/";
    assert.ok(isNumberField || url.pathname === "/api/g2c_curves/");
    if (isNumberField) {
      assert.match(url.searchParams.get("_fields"), /coeffs/);
      assert.equal(url.searchParams.get("_sort"), "degree,disc_abs,label");
      assert.equal(url.searchParams.get("degree"), "i3");
      assert.equal(
        url.searchParams.get("disc_abs"),
        "py{'$gte': 1, '$lte': 100}",
      );
    } else {
      assert.match(url.searchParams.get("_fields"), /eqn/);
      assert.equal(url.searchParams.get("_sort"), "cond,label");
      assert.equal(url.searchParams.get("cond"), "py{'$gte': 200, '$lte': 300}");
    }
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        table: isNumberField ? "nf_fields" : "g2c_curves",
        timestamp: "2026-08-27T12:00:00Z",
        data: isNumberField
          ? [numberFieldRow]
          : [
              malformedEquation
                ? { ...genus2Row, eqn: "__import__('os').system('false')" }
                : genus2Row,
            ],
        next: maliciousNext ? "https://example.com/api/g2c_curves/?_offset=100" : null,
      }),
    );
  });
  const port = await listen(server);
  const session = await createSage({ mode: "python" });
  try {
    const base = `http://127.0.0.1:${port}/api/`;
    const answer = await session.evaluate(
      [
        "from sage.databases.lmfdb import LMFDB, between, LMFDBQueryError, LMFDBNetworkError",
        `db = LMFDB(source='online', base_url=${JSON.stringify(base)}, timeout=5)`,
        "query = db.genus2_curves.search(conductor=between(200, 300), sort=('conductor', 'label'), limit=2)",
        "before = len(query.explain()['request_url']) > 0",
        "rows = list(query)",
        "bundled_record = LMFDB(source='bundled').genus2_curves['277.a.277.1']",
        "fields = list(db.number_fields.search(degree=3, discriminant_abs=between(1, 100), sort=('degree', 'discriminant_abs', 'label'), limit=2))",
        "bundled_field = LMFDB(source='bundled').number_fields['3.1.23.1']",
        "unbounded = False",
        "try:",
        "    db.genus2_curves.search(limit=None)",
        "except LMFDBQueryError:",
        "    unbounded = True",
        "(before, [r.label for r in rows], rows[0].curve().genus(),",
        " rows[0].source, rows[0].source_release, rows[0] == bundled_record,",
        " fields[0].label, fields[0].field().signature(), fields[0] == bundled_field, unbounded)",
      ].join("\n"),
    );
    assert.equal(
      answer.repr,
      "(True, ['277.a.277.1'], 2, 'online', '2026-08-27T12:00:00Z', True, " +
        "'3.1.23.1', (1, 1), True, True)",
    );
    assert.equal(requests.length, 2);

    assert.equal(
      (
        await session.evaluate(
          [
            "offline = LMFDB(source='auto', base_url='not a URL')",
            "rejected = False",
            "try:",
            "    offline.genus2_curves.search(unknown_field=1)",
            "except LMFDBQueryError:",
            "    rejected = True",
            "huge = 10**30",
            "encoded = str(huge) in db.genus2_curves.search(conductor=huge, limit=1).explain()['request_url']",
            "(offline.capabilities()['network'], rejected, encoded)",
          ].join("\n"),
        )
      ).repr,
      "(False, True, True)",
    );
    assert.equal(requests.length, 2);

    maliciousNext = true;
    assert.equal(
      (
        await session.evaluate(
          [
            "blocked = False",
            "try:",
            "    list(db.genus2_curves.search(conductor=between(200, 300), sort=('conductor', 'label'), limit=2))",
            "except LMFDBNetworkError:",
            "    blocked = True",
            "blocked",
          ].join("\n"),
        )
      ).repr,
      "True",
    );

    maliciousNext = false;
    malformedEquation = true;
    assert.equal(
      (
        await session.evaluate(
          [
            "malformed = False",
            "try:",
            "    list(db.genus2_curves.search(conductor=between(200, 300), sort=('conductor', 'label'), limit=2))",
            "except Exception as error:",
            "    malformed = error.__class__.__name__ == 'LMFDBSchemaError'",
            "malformed",
          ].join("\n"),
        )
      ).repr,
      "True",
    );
  } finally {
    await session.close();
    server.closeAllConnections();
    await close(server);
  }
});

test(
  "optional live LMFDB canary",
  { skip: process.env.SAGEJS_LMFDB_LIVE !== "1" },
  async () => {
    const session = await createSage({ mode: "python" });
    try {
      assert.equal(
        (
          await session.evaluate(
            [
              "from sage.databases.lmfdb import LMFDB",
              "record = LMFDB(source='online').genus2_curves['277.a.277.1']",
              "(record.label, record.curve().genus())",
            ].join("\n"),
          )
        ).repr,
        "('277.a.277.1', 2)",
      );
    } finally {
      await session.close();
    }
  },
);
