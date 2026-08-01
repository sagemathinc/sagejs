"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("level one and Gamma0(11) modular-symbol Hecke models", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(1, 12)",
            "[M.basis(), M.T(2).matrix(), M.T(2).charpoly(), " +
              "M.T(11).charpoly().factor()]",
          ].join("\n"),
        )
      ).repr,
      "[([X^8*Y^2,(0,0)], [X^9*Y,(0,0)], [X^10,(0,0)]), " +
        "[ -24    0    0]\n[   0  -24    0]\n[4860    0 2049], " +
        "x^3 - 2001*x^2 - 97776*x - 1180224, " +
        "(x - 285311670612) * (x - 534612)^2]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(11)",
            "[M.basis(), M.weight(), M.sign(), " +
              "[M.T(p).matrix() for p in [2,3,5]]]",
          ].join("\n"),
        )
      ).repr,
      "[((1,0), (1,8), (1,9)), 2, 0, " +
        "[[ 3  0 -1]\n[ 0 -2  0]\n[ 0  0 -2], " +
        "[ 4  0 -1]\n[ 0 -1  0]\n[ 0  0 -1], " +
        "[ 6  0 -1]\n[ 0  1  0]\n[ 0  0  1]]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(11)",
            "[M.T(7).matrix(), " +
              "M.T(6).matrix() == M.T(2).matrix()*M.T(3).matrix()]",
          ].join("\n"),
        )
      ).repr,
      "[[ 8  0 -2]\n[ 0 -2  0]\n[ 0  0 -2], True]",
    );
  } finally {
    await session.close();
  }
});

test("Gamma1 and character cuspidal modular-symbol models", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(Gamma1(11), 2)",
            "S = M.cuspidal_submodule()",
            "[M.dimension(), M.T(2).charpoly().factor(), " +
              "S.T(2).matrix(), S.q_expansion_basis(10)]",
          ].join("\n"),
        )
      ).repr,
      "[11, (x - 3) * (x + 2)^2 * " +
        "(x^4 - 7*x^3 + 19*x^2 - 23*x + 11) * " +
        "(x^4 - 2*x^3 + 4*x^2 + 2*x + 11), " +
        "[-2  0]\n[ 0 -2], " +
        "[q - 2*q^2 - q^3 + 2*q^4 + q^5 + 2*q^6 - 2*q^7 " +
        "- 2*q^9 + O(q^10)]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "e = DirichletGroup(13).0^2",
            "S = ModularSymbols(e, 2).cuspidal_submodule()",
            "[S.dimension(), S.T(2).charpoly().factor(), " +
              "S.q_expansion_basis(10)]",
          ].join("\n"),
        )
      ).repr,
      "[2, (x + zeta6 + 1)^2, " +
        "[q + (-zeta6 - 1)*q^2 + (2*zeta6 - 2)*q^3 + zeta6*q^4 " +
        "+ (-2*zeta6 + 1)*q^5 + (-2*zeta6 + 4)*q^6 " +
        "+ (2*zeta6 - 1)*q^8 - zeta6*q^9 + O(q^10)]]",
    );
  } finally {
    await session.close();
  }
});

test("higher-weight Gamma0 Manin symbols, signs, and Hecke", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "data = []",
            "for N,k in [(3,6),(11,4),(12,4),(37,4)]:",
            "    for sign in [0,1,-1]:",
            "        M = ModularSymbols(N,k,sign=sign)",
            "        data.append((N,k,sign,M.dimension(), " +
              "M.hecke_matrix(2).charpoly().factor()))",
            "data",
          ].join("\n"),
        )
      ).repr,
      "[(3, 6, 0, 4, (x + 6)^2 * (x - 33)^2), " +
        "(3, 6, 1, 3, (x + 6) * (x - 33)^2), " +
        "(3, 6, -1, 1, x + 6), " +
        "(11, 4, 0, 6, (x - 9)^2 * (x^2 - 2*x - 2)^2), " +
        "(11, 4, 1, 4, (x - 9)^2 * (x^2 - 2*x - 2)), " +
        "(11, 4, -1, 2, x^2 - 2*x - 2), " +
        "(12, 4, 0, 12, x^6 * (x + 2)^2 * (x - 1)^2 * " +
          "(x - 8)^2), " +
        "(12, 4, 1, 9, x^4 * (x + 2) * (x - 1)^2 * " +
          "(x - 8)^2), " +
        "(12, 4, -1, 3, x^2 * (x + 2)), " +
        "(37, 4, 0, 20, (x - 9)^2 * " +
          "(x^4 + 6*x^3 - x^2 - 16*x + 6)^2 * " +
          "(x^5 - 4*x^4 - 21*x^3 + 74*x^2 + 102*x - 296)^2), " +
        "(37, 4, 1, 11, (x - 9)^2 * " +
          "(x^4 + 6*x^3 - x^2 - 16*x + 6) * " +
          "(x^5 - 4*x^4 - 21*x^3 + 74*x^2 + 102*x - 296)), " +
        "(37, 4, -1, 9, " +
          "(x^4 + 6*x^3 - x^2 - 16*x + 6) * " +
          "(x^5 - 4*x^4 - 21*x^3 + 74*x^2 + 102*x - 296))]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "P = ModularSymbols(37,4,sign=1)",
            "N = ModularSymbols(37,4,sign=-1)",
            "[len(P.basis()), P.basis()[0], " +
              "P.star_involution().matrix() == identity_matrix(QQ,11), " +
              "N.star_involution().matrix() == -identity_matrix(QQ,9)]",
          ].join("\n"),
        )
      ).repr,
      "[11, [X^2,(0,1)], True, True]",
    );
    assert.equal(
      (
        await session.evaluate(
          "[ModularSymbols(100,4,sign=s).dimension() " +
            "for s in [0,1,-1]]",
        )
      ).repr,
      "[90, 48, 42]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(11,4,sign=1)",
            "T2 = M.hecke_matrix(2)",
            "[M.hecke_matrix(3).charpoly().factor(), " +
              "M.hecke_matrix(4) == T2*T2 - identity_matrix(QQ,4)*8, " +
              "M.hecke_matrix(6) == T2*M.hecke_matrix(3)]",
          ].join("\n"),
        )
      ).repr,
      "[(x - 28)^2 * (x^2 + 2*x - 47), True, True]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "data = []",
            "for N,sign in [(12,0),(12,1),(12,-1)," +
              "(100,0),(100,1),(100,-1)]:",
            "    M = ModularSymbols(N,4,sign=sign)",
            "    C = M.cuspidal_subspace()",
            "    data.append((N,sign,M.boundary_map().matrix().rank()," +
              "C.dimension()))",
            "data",
          ].join("\n"),
        )
      ).repr,
      "[(12, 0, 6, 6), (12, 1, 6, 3), (12, -1, 0, 3), " +
        "(100, 0, 18, 72), (100, 1, 12, 36), " +
        "(100, -1, 6, 36)]",
    );
  } finally {
    await session.close();
  }
});

test("native P1List representatives, normalization, and actions", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "P = P1List(12)",
            "[len(P), P[:8], P[-1], P.normalize(7,15), " +
              "P.normalize_with_scalar(7,15), P.index(2,3)]",
          ].join("\n"),
        )
      ).repr,
        "[24, [(0, 1), (1, 0), (1, 1), (1, 2), (1, 3), (1, 4), " +
        "(1, 5), (1, 6)], (6, 1), (1, 9), (1, 9, 7), 14]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "[all(P.apply_I(P.apply_I(i)) == i for i in range(len(P))), " +
              "all(P.apply_S(P.apply_S(i)) == i for i in range(len(P))), " +
              "all(P.apply_R(P.apply_R(P.apply_R(i))) == i " +
              "for i in range(len(P))), " +
              "all(P.apply_T(i) == P.apply_R(i) for i in range(len(P)))]",
          ].join("\n"),
        )
      ).repr,
      "[True, True, True, True]",
    );
  } finally {
    await session.close();
  }
});

test("native sparse weight-2 Gamma0 Manin relations", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "P = P1List(389).manin_presentation()",
            "[P.level(), P.projective_cosets(), P.cusps(), " +
              "P.interior_paths(), P.e1(), P.e2(), P.torsion2(), " +
              "P.torsion3(), P.ngens(), P.nrelations(), " +
              "P.dimension()]",
          ].join("\n"),
        )
      ).repr,
      "[389, 390, 131, 258, 65, 65, 2, 0, 67, 3, 65]",
    );
    assert.equal(
      (
        await session.evaluate(
          "P1List(1000).manin_relations(65521).dimension()",
        )
      ).repr,
      "301",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "R = P1List(11).manin_relations(65521)",
            "[R.level(), R.modulus(), R.nrows(), R.ncols(), R.nnz(), " +
              "R.s_relations(), R.r_relations(), R.rank(), " +
              "R.dimension(), R.row(0)]",
          ].join("\n"),
        )
      ).repr,
      "[11, 65521, 10, 12, 24, 6, 4, 9, 3, ((0, 1), (1, 1))]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "[(N, len(ModularSymbols(N).p1list()), " +
              "ModularSymbols(N).manin_relations().dimension(), " +
              "ModularSymbols(N).dimension()) " +
              "for N in [1,2,3,5,11,37,389]]",
          ].join("\n"),
        )
      ).repr,
      "[(1, 1, 0, 0), (2, 3, 1, 1), (3, 4, 1, 1), " +
        "(5, 6, 1, 1), (11, 12, 3, 3), (37, 38, 5, 5), " +
        "(389, 390, 65, 65)]",
    );
  } finally {
    await session.close();
  }
});

test("native exact weight-2 Hecke matrices", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (await session.evaluate("P1List(11).hecke_matrix(2)")).repr,
      "[ 3  0  0]\n[ 1 -2  0]\n[ 1  0 -2]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(389)",
            "T = M.hecke_matrix(3)",
            "[T.nrows(), T.ncols(), T.base_ring(), T.trace(), " +
              "(T*T).trace(), (T*T*T).trace()]",
          ].join("\n"),
        )
      ).repr,
      "[65, 65, Rational Field, 4, 264, 88]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(1000)",
            "T = M.T(3).matrix()",
            "[T.nrows(), T.trace(), (T*T).trace(), (T*T*T).trace()]",
          ].join("\n"),
        )
      ).repr,
      "[301, 20, 1280, 416]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(1000)",
            "[(n, M.T(n).matrix().trace()) " +
              "for n in [1, 4, 6, 9, 10, 25]]",
          ].join("\n"),
        )
      ).repr,
      "[(1, 301), (4, 10), (6, 60), (9, 377), " +
        "(10, 8), (25, 85)]",
    );
  } finally {
    await session.close();
  }
});

test("boundary maps, cuspidal spaces, star eigenspaces, and elements", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(11)",
            "C = M.cuspidal_submodule()",
            "[M.boundary_map().matrix(), M.star_involution().matrix(), " +
              "C.basis_matrix(), C.T(2).matrix(), " +
              "M.plus_submodule().basis_matrix(), " +
              "M.minus_submodule().basis_matrix()]",
          ].join("\n"),
        )
      ).repr,
      "[[ 1 -1]\n[ 0  0]\n[ 0  0], " +
        "[ 1  0  0]\n[ 0 -1  1]\n[ 0  0  1], " +
        "[0 1 0]\n[0 0 1], [-2  0]\n[ 0 -2], " +
        "[1 0 0]\n[0 0 1], [   0    1 -1/2]]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "M = ModularSymbols(11)",
            "x = M.modular_symbol((1,0), (0,1))",
            "[x.vector(), x.boundary().vector(), " +
              "M.gen(1).boundary(), M.gen(1).star().vector(), " +
              "M.T(2)(M.gen(1)).vector(), " +
              "(M.gen(1)+M.gen(1)).vector(), " +
              "(3*M.gen(1)-M.gen(1)).vector()]",
          ].join("\n"),
        )
      ).repr,
      "[(1, 0, -2/5), (1, -1), 0, (0, -1, 1), " +
        "(0, -2, 0), (0, 2, 0), (0, 2, 0)]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "[(N, ModularSymbols(N).boundary_space().dimension(), " +
              "ModularSymbols(N).boundary_map().matrix().rank(), " +
              "ModularSymbols(N).cuspidal_submodule().dimension(), " +
              "ModularSymbols(N).plus_submodule().dimension(), " +
              "ModularSymbols(N).minus_submodule().dimension()) " +
              "for N in [11,37,100,389,5077]]",
            "",
          ].join("\n"),
        )
      ).repr,
      "[(11, 2, 1, 2, 2, 1), (37, 2, 1, 4, 3, 2), " +
        "(100, 18, 17, 14, 18, 13), (389, 2, 1, 64, 33, 32), " +
        "(5077, 2, 1, 844, 423, 422)]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "P = ModularSymbols(100, sign=1)",
            "N = ModularSymbols(100, sign=-1)",
            "C = ModularSymbols(100).cuspidal_submodule()",
            "[P.dimension(), N.dimension(), " +
              "P.star_involution().matrix() == identity_matrix(QQ, 18), " +
              "N.star_involution().matrix() == -identity_matrix(QQ, 13), " +
              "C.gen(0).star().parent() is C, " +
              "C.gen(0).hecke(2).parent() is C]",
          ].join("\n"),
        )
      ).repr,
      "[18, 13, True, True, True, True]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "S = ModularSymbols(5077, 2, sign=1).cuspidal_subspace()",
            "T = S.hecke_matrix(2)",
            "[S.dimension(), T.nrows(), T.ncols(), T.trace()]",
          ].join("\n"),
        )
      ).repr,
      "[422, 422, 422, -2]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "data = []",
            "for sign in [-1, 1]:",
            "    M = ModularSymbols(1000, 2, sign=sign)",
            "    S = M.cuspidal_subspace()",
            "    T = S.hecke_matrix(2)",
            "    data.append((sign, M.dimension(), S.dimension(), " +
              "T.trace(), (T*T).trace()))",
            "data",
          ].join("\n"),
        )
      ).repr,
      "[(-1, 147, 131, 0, 2), (1, 154, 131, 0, 2)]",
    );
    assert.equal(
      (
        await session.evaluate(
          [
            "P = ModularSymbols(389, 2, sign=1)",
            "A = P.ambient_module()",
            "S = P.cuspidal_subspace()",
            "[S.dimension(), A.p1list()._cuspidal_basis_cache is None]",
          ].join("\n"),
        )
      ).repr,
      "[32, True]",
    );
  } finally {
    await session.close();
  }
});
