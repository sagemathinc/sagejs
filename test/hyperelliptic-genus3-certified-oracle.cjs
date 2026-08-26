// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const corpus = require("./data/hyperelliptic-rforest/genus3-certified-oracle.json");

function expectedTail(p, coefficients) {
  return [
    p * coefficients[2],
    p * p * coefficients[1],
    p * p * p,
  ];
}

test("certified genus-3 oracle corpus is internally exact", () => {
  assert.equal(corpus.schema, "sagejs.hyperelliptic-genus3-certified-oracle.v1");
  assert.equal(corpus.records.length, 20);
  assert.deepEqual(
    new Set(corpus.records.map((record) => record.curve)),
    new Set(["odd_sparse", "generalized_user", "even_monic", "dense"]),
  );
  assert.ok(corpus.records.some((record) => record.p === 10007));

  for (const record of corpus.records) {
    const { p, lpolynomial: polynomial } = record;
    assert.equal(polynomial.length, 7);
    assert.equal(polynomial[0], 1);
    assert.deepEqual(polynomial.slice(4), expectedTail(p, polynomial));
    assert.deepEqual(
      polynomial.slice(1, 4).map((value) => ((value % p) + p) % p),
      record.residues,
    );
    assert.equal(
      polynomial.reduce((sum, coefficient) => sum + coefficient, 0),
      record.jacobian_order,
    );
    assert.equal(
      polynomial.reduce(
        (sum, coefficient, degree) =>
          sum + (degree % 2 === 0 ? coefficient : -coefficient),
        0,
      ),
      record.twist_order,
    );
    assert.equal(record.curve_cardinality, p + 1 + polynomial[1]);
    assert.ok(record.oracles.includes("sage-pari"));
    assert.equal(record.oracles.includes("magma"), p <= 101);
  }
});

test("rforest rows agree with every checked exact local factor", async () => {
  const session = await createSage();
  try {
    const value = await session.evaluate(
      [
        "R=PolynomialRing(QQ,'x')",
        "from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows",
        `models=${JSON.stringify(corpus.curves)}`,
        `records=${JSON.stringify(corpus.records)}`,
        "curves={name:HyperellipticCurve(R(data['f']),R(data['h'])) for name,data in models.items()}",
        "rows_by_curve={}",
        "for name,C in curves.items():",
        "    rows=rforest_hasse_witt_rows(C,2,10007)['rows']",
        "    rows_by_curve[name]={row['prime']:row for row in rows}",
        "checks=[]",
        "for record in records:",
        "    row=rows_by_curve[record['curve']][record['p']]",
        "    checks.append((row['available'],row['residues']==tuple(record['residues'])))",
        "(len(checks),all(a and b for a,b in checks))",
      ].join("\n"),
      { timeout: 300_000 },
    );
    assert.equal(value.repr, "(20, True)");
  } finally {
    await session.close();
  }
});

test("exact candidate completion recovers all cross-CAS small-prime factors", async () => {
  const records = corpus.records.filter((record) => record.p <= 101);
  const session = await createSage();
  try {
    const value = await session.evaluate(
      [
        "from sagejs.hyperelliptic_curves.genus3_completion import complete_genus3_lpolynomial",
        `records=${JSON.stringify(records)}`,
        "answers=[]",
        "for record in records:",
        "    answer=complete_genus3_lpolynomial(record['p'],record['residues'],jacobian_order=record['jacobian_order'],twist_order=record['twist_order'])",
        "    answers.append((answer['status'],answer['lpolynomial']==tuple(record['lpolynomial']),answer['initial_candidate_count']>=answer['remaining_candidate_count']>=1))",
        "(len(answers),all(a=='unique' and b and c for a,b,c in answers))",
      ].join("\n"),
      { timeout: 300_000 },
    );
    assert.equal(value.repr, `(${records.length}, True)`);
  } finally {
    await session.close();
  }
});
