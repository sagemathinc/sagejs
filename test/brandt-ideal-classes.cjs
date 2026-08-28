// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const oracle = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "brandt-ideal-classes-sage-10.9.json"),
    "utf8",
  ),
);

function classIsometry(actual, expected) {
  const size = expected.weights.length;
  if (actual.weights.length !== size) return null;
  const permutation = Array(size).fill(-1);
  const used = Array(size).fill(false);
  const rowSignature = (matrix, index) =>
    JSON.stringify(matrix[index].slice().sort((left, right) => left - right));
  const expectedSignatures = expected.T.map((_, index) =>
    rowSignature(expected.T, index),
  );
  const actualSignatures = actual.T.map((_, index) =>
    rowSignature(actual.T, index),
  );

  function search(position) {
    if (position === size) return true;
    for (let candidate = 0; candidate < size; candidate += 1) {
      if (
        used[candidate] ||
        expected.weights[position] !== actual.weights[candidate] ||
        expectedSignatures[position] !== actualSignatures[candidate] ||
        expected.T[position][position] !== actual.T[candidate][candidate]
      ) {
        continue;
      }
      let compatible = true;
      for (let prior = 0; prior < position; prior += 1) {
        const mapped = permutation[prior];
        if (
          expected.T[position][prior] !== actual.T[candidate][mapped] ||
          expected.T[prior][position] !== actual.T[mapped][candidate]
        ) {
          compatible = false;
          break;
        }
      }
      if (!compatible) continue;
      permutation[position] = candidate;
      used[candidate] = true;
      if (search(position + 1)) return true;
      used[candidate] = false;
      permutation[position] = -1;
    }
    return false;
  }
  return search(0) ? permutation : null;
}

test("ideal-class Brandt matrices match Sage up to an explicit class isometry", async () => {
  const session = await createSage();
  try {
    for (const expected of oracle.records) {
      const result = await session.evaluate(
        [
          "import json",
          `B=BrandtModule(${expected.D},${expected.N},realization='ideal-classes',use_cache=False)`,
          `T=B.hecke_matrix(${expected.ell})`,
          "json.dumps({'weights':[str(w) for w in B.monodromy_weights()],",
          " 'theta':[[str(a) for a in I.theta_series_vector(12)] for I in B.right_ideals()],",
          " 'T':[[str(a) for a in r] for r in T.rows()], 'mass':str(B.mass()),",
          " 'verified':B.mass_certificate().verify(),",
          " 'new_dimension':B.new_subspace().dimension(),",
          " 'new_charpoly':str(B.new_subspace().hecke_matrix(3).charpoly())})",
        ].join("\n"),
      );
      const actual = JSON.parse(result.repr.slice(1, -1));
      actual.weights = actual.weights.map(Number);
      actual.theta = actual.theta.map((row) => row.map(Number));
      actual.T = actual.T.map((row) => row.map(Number));
      assert.equal(actual.verified, true);
      assert.ok(classIsometry(actual, expected), `class isometry at (${expected.D},${expected.N})`);
      const newOracle = new Map([
        ["11:1", [1, "x + 1"]],
        ["11:2", [0, "1"]],
        ["37:2", [4, "x^4 - 2*x^3 - 5*x^2 + 2*x + 1"]],
      ]).get(`${expected.D}:${expected.N}`);
      assert.deepEqual(
        [actual.new_dimension, actual.new_charpoly],
        newOracle,
        `newspace at (${expected.D},${expected.N})`,
      );
    }
  } finally {
    await session.close();
  }
});

test("quaternion orders, equivalence witnesses, and component groups are exact", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.quaternion_algebras import QuaternionAlgebra",
        "from sagejs.modular_forms import brandt_component_group",
        "orders=[(D,N,QuaternionAlgebra(D).order_with_level(N).discriminant()) for D,N in [(11,2),(37,2),(30,7),(66,5)]]",
        "O=QuaternionAlgebra(11).maximal_order(); I=O.unit_ideal(); J=I.cyclic_right_subideals(3)[0]",
        "equiv,alpha=I.is_equivalent(J,certificate=True)",
        "B=BrandtModule(37,2,realization='ideal-classes',use_cache=False)",
        "X=B.degree_zero_submodule(); C=brandt_component_group(B)",
        "[orders,equiv,J.scale(alpha,left=True)==I,X.rank(),X.invariant_factors(),C.invariant_factors(),C.order(),B.W(37).matrix()^2==identity_matrix(QQ,9),C.frobenius_matrix()^2==identity_matrix(QQ,8),C.certificate().verify()]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[[(11, 2, 22), (37, 2, 74), (30, 7, 210), (66, 5, 330)], True, True, 8, (9,), (9,), 9, True, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("composite discriminants produce genuine mass-complete ideal classes", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "rows=[]",
        "for D,N,ell in [(30,7,11),(66,5,7)]:",
        "    B=BrandtModule(D,N,realization='ideal-classes',use_cache=False)",
        "    rows.append((D,N,B.dimension(),B.mass(),tuple(sorted(B.monodromy_weights())),B.T(ell).charpoly(),B.mass_certificate().verify()))",
        "rows",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[(30, 7, 8, 16/3, (1, 1, 1, 1, 3, 3, 3, 3), x^8 - 8*x^7 - 64*x^6 + 128*x^5 + 768*x^4, True), (66, 5, 12, 10, (1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2), x^12 - 72*x^10 - 128*x^9 + 1296*x^8 + 3072*x^7 - 7168*x^6 - 18432*x^5 + 12288*x^4 + 32768*x^3, True)]",
    );
  } finally {
    await session.close();
  }
});

test("invalid quaternion and ideal-class boundaries fail closed", async () => {
  const session = await createSage();
  try {
    await session.evaluate(
      "from sagejs.quaternion_algebras import QuaternionAlgebra",
    );
    await session.evaluate(
      "from sagejs.quaternion_algebras import EichlerIdealClassSet, IdealClassMassCertificate",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "B=BrandtModule(11,2,realization='ideal-classes',use_cache=False)",
            "raw=[list(row) for row in B.eichler_order().basis_matrix().rows()]",
            "copy=B.quaternion_algebra().order(raw)",
            "raw[0][0]=raw[0][0]+1000",
            "I=B.right_ideals()[0]",
            "duplicate=I.scale(2)",
            "C=IdealClassMassCertificate(11,2,B.monodromy_weights(),B.class_fingerprints(),(3,),(I,duplicate,B.right_ideals()[2]))",
            "[copy==B.eichler_order(),I.is_locally_principal(),not C.verify(),B.new_subspace().dimension()]",
          ].join("\n"),
        )
      ).repr,
      "[True, True, True, 0]",
    );
    for (const [source, pattern] of [
      ["QuaternionAlgebra(6)", /odd finite ramification parity/],
      ["QuaternionAlgebra(12)", /squarefree/],
      [
        "QuaternionAlgebra(11).order([(1,0,0,0),(0,1\/2,0,0),(0,0,1,0),(0,0,0,1)])",
        /not closed/,
      ],
      ["QuaternionAlgebra(11).order_with_level(11)", /coprime to D/],
      [
        "IdealClassMassCertificate(11,1,(6,4),('a','b'),())",
        /mass is incomplete/,
      ],
      [
        "EichlerIdealClassSet(37,2,max_neighbor_primes=0)",
        /did not reach the exact Eichler mass/,
      ],
      ["BrandtModule(11,realization='mystery')", /realization must be/],
      [
        "BrandtModule(11,5,realization='jacquet-langlands').degree_zero_submodule()",
        /needs the ideal-class realization/,
      ],
    ]) {
      await assert.rejects(session.evaluate(source), pattern);
    }
  } finally {
    await session.close();
  }
});
