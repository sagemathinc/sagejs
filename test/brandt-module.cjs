// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const oracle = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "brandt-general-magma-2.18-5.json"), "utf8"),
);

test("general Brandt modules match the pinned Magma D,N oracle", async () => {
  const session = await createSage();
  try {
    for (const record of oracle.records) {
      const result = await session.evaluate(
        [
          "import json",
          `B = BrandtModule(${record.D}, ${record.N})`,
          `ells = ${JSON.stringify(Object.keys(record.atkin_lehner).map(Number))}`,
          `json.dumps([B.dimension(), str(B.T(${record.hecke_index}).charpoly()), ` +
            `{q:str(B.W(q).charpoly()) for q in ells}, ` +
            `all(B.W(q).matrix()^2 == identity_matrix(QQ,B.dimension()) for q in ells)])`,
        ].join("\n"),
      );
      const normalized = JSON.parse(result.repr.slice(1, -1));
      assert.equal(normalized[0], record.dimension, `dimension at (${record.D},${record.N})`);
      assert.equal(normalized[1], record.hecke_charpoly, `T at (${record.D},${record.N})`);
      assert.deepEqual(
        normalized[2],
        record.atkin_lehner,
        `Atkin-Lehner at (${record.D},${record.N})`,
      );
      assert.equal(normalized[3], true);
    }
  } finally {
    await session.close();
  }
});

test("canonical and Jacquet-Langlands realizations expose honest boundaries", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "B = BrandtModule(11)",
            "[B is BrandtModule(11), B.realization(), B.canonical_ideal_basis_available(),",
            " B.T(2).is_sparse(), B.T(2).matrix(), B.monodromy_weights(),",
            " B.eisenstein_subspace().dimension(), B.cuspidal_subspace().dimension()]",
          ].join("\n"),
        )
      ).repr,
      "[True, 'supersingular-ideal-classes', True, True, [0 3]\n[2 1], (3, 2), 1, 1]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "B = BrandtModule(11,5)",
            "[B.realization(), B.canonical_ideal_basis_available(), B.T(2).is_sparse(),",
            " B.T(6).matrix() == B.T(2).matrix()*B.T(3).matrix(),",
            " B.new_subspace().dimension(),",
            " [A.dimension() for A in B.decomposition(bound=3,anemic=False)]]",
          ].join("\n"),
        )
      ).repr,
      "['jacquet-langlands-symbols', False, False, True, 3, [1, 1, 2, 2]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "C = BrandtModule(11,use_cache=False,dense_entry_limit=0)",
            "S = C.T(2)",
            "[S.is_sparse(),S.nonzero_count(),S(C.0)]",
          ].join("\n"),
        )
      ).repr,
      "[True, 3, (0, 3)]",
    );
    await assert.rejects(
      session.evaluate("S.matrix()"),
      /dense materialization needs 4 entries/,
    );
    await assert.rejects(
      session.evaluate("BrandtModule(11,5).right_ideals()"),
      /general Eichler ideal enumeration is not yet the basis backend/,
    );
    await assert.rejects(
      session.evaluate("BrandtModule(11,5).monodromy_weights()"),
      /canonical quaternion ideal-class basis/,
    );
  } finally {
    await session.close();
  }
});

test("Brandt elements, subspaces, imports, and input validation are exact", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "from sage.modular.quatalg.brandt import BrandtModule as BM",
            "B = BM(3,5)",
            "x = B.0 + 2*B.1",
            "[x, x.hecke(2), x*B.T(2), x.atkin_lehner(3), B.is_cuspidal(), B.is_cuspidal(B.1),",
            " B.is_cuspidal(B.0), B.cuspidal_subspace().contains(B.1)]",
          ].join("\n"),
        )
      ).repr,
      "[(1, 2), (3, -2), (3, -2), (-1, 2), False, True, False, True]",
    );
    for (const [source, pattern] of [
      ["BrandtModule(1)", /squarefree and > 1/],
      ["BrandtModule(6)", /odd number of finite primes/],
      ["BrandtModule(12)", /squarefree and > 1/],
      ["BrandtModule(11,22)", /must be coprime/],
      ["BrandtModule(11,weight=4)", /weight 2/],
      ["BrandtModule(3,5,base_ring=ZZ)", /currently over QQ/],
      ["BrandtModule(11).T(11)", /requires n coprime/],
      ["BrandtModule(11,5).W(5)", /only for divisors of D/],
    ]) {
      await assert.rejects(session.evaluate(source), pattern);
    }
  } finally {
    await session.close();
  }
});
