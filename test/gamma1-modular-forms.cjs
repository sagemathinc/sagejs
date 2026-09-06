// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("Gamma1 bases and operators agree with pinned Sage oracles", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "M5 = ModularForms(Gamma1(5), 2, prec=8)",
    "print(M5, M5.character())",
    "print([(c.character().conrey_number(), c.field_degree(), c.dimension(), c.rational_dimension()) for c in M5.character_components()])",
    "print(M5.q_expansion_basis())",
    "print(M5.hecke_matrix(2))",
    "print(M5.diamond_bracket_matrix(2))",
    "M7 = ModularForms(Gamma1(7), 2, prec=10)",
    "print([(c.character().conrey_number(), c.character().order(), c.field_degree(), c.rational_dimension()) for c in M7.character_components()])",
    "print(M7.hecke_matrix(2))",
    "print(M7.diamond_bracket_matrix(3))",
    "print(M7.hecke_matrix(2)*M7.diamond_bracket_matrix(3) == M7.diamond_bracket_matrix(3)*M7.hecke_matrix(2))",
    "print(M7.diamond_bracket_matrix(2)*M7.diamond_bracket_matrix(3) == M7.diamond_bracket_matrix(6))",
    "M53 = ModularForms(Gamma1(5), 3, prec=9)",
    "print(M53.q_expansion_basis())",
    "print(M53.hecke_matrix(2))",
    "print(M53.diamond_bracket_matrix(2))",
    "print(M7.q_expansion_basis_certificate().verify())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "Modular Forms space of dimension 3 for Congruence Subgroup Gamma1(5) of weight 2 over Rational Field None",
      "[(4, 1, 2, 2), (1, 1, 1, 1)]",
      "[1 + 60*q^3 - 120*q^4 + 240*q^5 - 300*q^6 + 300*q^7 + O(q^8), q + 6*q^3 - 9*q^4 + 27*q^5 - 28*q^6 + 30*q^7 + O(q^8), q^2 - 4*q^3 + 12*q^4 - 22*q^5 + 30*q^6 - 24*q^7 + O(q^8)]",
      "[ -21    0 -240]\n[  -2    0  -23]\n[   2    1   24]",
      "[ -11  -60 -180]\n[  -1   -7  -18]\n[   1    6   17]",
      "[(4, 3, 2, 4), (1, 1, 1, 1)]",
      "[  -93     0  -168  -840 -1680]\n[  -26     0   -48  -234  -471]\n[    4     1     8    39    76]\n[    6     0    10    55   108]\n[    2     0     5    17    36]",
      "[  -59  -336  -840 -1260 -1680]\n[  -17   -97  -240  -365  -485]\n[    3    16    40    62    83]\n[    4    23    57    86   115]\n[    1     6    15    22    29]",
      "True",
      "True",
      "[1 + 210*q^4 - 600*q^5 + 1750*q^6 - 3600*q^7 + 5850*q^8 + O(q^9), q + 77*q^4 - 287*q^5 + 862*q^6 - 1710*q^7 + 2730*q^8 + O(q^9), q^2 - 2*q^4 + 24*q^5 - 60*q^6 + 136*q^7 - 195*q^8 + O(q^9), q^3 - 6*q^4 + 24*q^5 - 65*q^6 + 135*q^7 - 210*q^8 + O(q^9)]",
      "[ 109    0 1170 1750]\n[  52    0  529  862]\n[  -4    1  -34  -60]\n[  -4    0  -42  -65]",
      "[  27  240 1050 2800]\n[  13  113  490 1330]\n[  -1   -8  -35  -96]\n[  -1   -9  -39 -105]",
      "True",
    ].join("\n"),
  );
});

test("direct cyclotomic Hecke images equal full exact operators", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "e = DirichletGroup(13).0^2",
    "S = ModularSymbols(e, 2, sign=1).cuspidal_submodule()",
    "A = S.ambient_module()",
    "indices = list(range(1, 10))",
    "fast = A.p1list().character_hecke_images(A.weight(), A.sign(), A.character(), A.base_ring(), S.basis_matrix(), 0, 10)",
    "print(all(fast.column(n-1).list() == S.hecke_matrix(n).row(0).list() for n in indices), fast.ncols(), fast.nrows())",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "True 9 1");

  const higherDegree = await session.evaluate([
    "M = ModularForms(Gamma1(53), 2)",
    "F = M.character_components()[1].fixed_character_space()",
    "S = F.cuspidal_subspace()._modular_symbols_cusp_space()",
    "A = S.ambient_module()",
    "indices = list(range(1, 9))",
    "fast = A.p1list().character_hecke_images(A.weight(), A.sign(), A.character(), A.base_ring(), S.basis_matrix(), 0, 9)",
    "same = all(fast.column(n-1).list() == S.hecke_matrix(n).row(0).list() for n in indices)",
    "print(F.base_ring().degree(), same, fast.ncols(), fast.nrows(), fast[0,7])",
  ].join("\n"));
  assert.equal(
    higherDegree.stdout.trim(),
    "12 True 8 3 -2*zeta26^8 - zeta26^5 + zeta26^4",
  );
});

test("wide higher-degree cyclotomic row spaces stay short", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "K = CyclotomicField(25)",
    "z = K.gen()",
    "rows = []",
    "for i in range(8):",
    "    row = [K(0) for _ in range(1701)]",
    "    row[i] = K(1)",
    "    row[100 + 173*i] = z^(i+1)",
    "    rows.append(row)",
    "A = matrix(K, rows)",
    "B = A.row_space().basis_matrix()",
    "print(K.degree(), B.nrows(), B.ncols(), B == A, B == B.rref(), A.rank())",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "20 8 1701 True True 8");
});

test("rational rank profiles certify an existing wide basis", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "A = matrix(QQ, [[1/2,0,3,0,7,0,0,1], [0,2/3,5,0,0,11,0,1], [0,0,0,5/7,0,0,13,1]])",
    "P = A._full_row_rank_pivots()",
    "print(P, P == A.pivots(), A._full_row_rank_prime_cache > 10^9, A.matrix_from_columns(P).det() != 0)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "(0, 1, 3) True True True");
});

test("rank certification falls back exactly after unlucky primes", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "p = ZZ(10^9)",
    "product = ZZ(1)",
    "for i in range(32):",
    "    p = next_prime(p + 1)",
    "    product *= p",
    "for value in [product, 1/product]:",
    "    A = matrix(QQ, [[value]])",
    "    print(A._full_row_rank_pivots(), A._full_row_rank_prime_cache is None)",
    "for A in [matrix(QQ, [[1,2],[2,4]]), matrix(QQ, [[1],[2]])]:",
    "    try:",
    "        A._full_row_rank_pivots()",
    "        print('incorrect full rank')",
    "    except ArithmeticError:",
    "        print('rank deficient')",
  ].join("\n"));
  assert.equal(result.stdout.trim(),
    "(0,) True\n(0,) True\nrank deficient\nrank deficient");
});

test("rational matrix rows publish as exact series without host coefficients", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "A = matrix(QQ, [[0,1/2,-7/3,0], [5/11,0,13/17,-19]])",
    "R = PowerSeriesRing(QQ, 'q', default_prec=4)",
    "f = R._from_rational_matrix_row(A, 1, 4)",
    "print(f, f.padded_list(), f.prec())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "5/11 + 13/17*q^2 - 19*q^3 + O(q^4) [5/11, 0, 13/17, -19] 4",
  );
});

test("Gamma1 object arithmetic, coordinates, and serialization are exact", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "M = ModularForms(Gamma1(5), 2, prec=8)",
    "B = M.basis()",
    "f = B[0] + 2*B[1] - 3*B[2]",
    "print(M.coordinates(f), f in M, hash(f) == hash(M(f)))",
    "print(M(f.q_expansion(M.sturm_bound()+1)) == f)",
    "g = B[1]*B[2]",
    "print(g.parent())",
    "print(g.q_expansion(8))",
    "certificate = M.q_expansion_basis_certificate()",
    "data = dumps([M, M.cuspidal_subspace(), M.eisenstein_subspace(), f, M.T(2), M.diamond_bracket_operator(2), certificate])",
    "M2, S2, E2, f2, T2, D2, certificate2 = loads(data)",
    "print(M2.group(), S2.dimension(), E2.dimension(), f2 == f)",
    "print(T2.matrix() == M.hecke_matrix(2), D2.matrix() == M.diamond_bracket_matrix(2))",
    "print(certificate2.verify(), certificate2.basis_matrix() == certificate.basis_matrix())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "(1, 2, -3) True True",
      "True",
      "Modular Forms space of dimension 5 for Congruence Subgroup Gamma1(5) of weight 4 over Rational Field",
      "q^3 - 4*q^4 + 18*q^5 - 55*q^6 + 165*q^7 + O(q^8)",
      "Congruence Subgroup Gamma1(5) 0 3 True",
      "True True",
      "True True",
    ].join("\n"),
  );
});

test("Gamma1 old/new descent and normalized packets are complete", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "S = CuspForms(Gamma1(22), 2, prec=8)",
    "O = S.old_subspace()",
    "N = S.new_subspace()",
    "print(S.dimension(), O.dimension(), N.dimension())",
    "print(O.q_expansion_basis(8))",
    "print(N.q_expansion_basis(8))",
    "print(O.hecke_matrix(3))",
    "print(N.hecke_matrix(3).charpoly())",
    "print(O.q_expansion_basis_certificate().verify())",
    "P2 = S.new_subspace(2)",
    "P11 = S.new_subspace(11)",
    "print(P2.dimension(), P11.dimension(), P2.q_expansion_basis_certificate().verify())",
    "P2b = loads(dumps(P2))",
    "print(P2b.dimension(), P2b.q_expansion_basis(8) == P2.q_expansion_basis(8))",
    "F = Newforms(Gamma1(22), 2)",
    "print(len(F), [(f.character().conrey_number(), f.coefficient_field(), f.certificate().verify()) for f in F])",
    "h = loads(dumps(F[0]))",
    "print(h.character().conrey_number(), h.q_expansion(8) == F[0].q_expansion(8))",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "6 2 4",
      "[q - q^3 - 2*q^4 + q^5 - 2*q^7 + O(q^8), q^2 - 2*q^4 - q^6 + O(q^8)]",
      "[q - 4*q^5 - 2*q^6 + O(q^8), q^2 - 2*q^5 - 3*q^6 + O(q^8), q^3 - 2*q^5 - q^6 + O(q^8), q^4 - 2*q^6 - 2*q^7 + O(q^8)]",
      "[-1  0]\n[ 0 -1]",
      "x^4 + 4*x^3 + 6*x^2 - x + 1",
      "True",
      "4 6 True",
      "4 True",
      "1 [(9, Cyclotomic Field of order 10 and degree 4, True)]",
      "9 True",
    ].join("\n"),
  );
});

test("bounded Gamma1 public sweep certifies dimensions and operators", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "cases = [(5,2,3,0,3,0,0),(5,3,4,0,4,0,0),(7,2,5,0,5,0,0),(8,3,7,1,6,1,-2),(9,2,7,0,7,0,0),(11,2,10,1,9,1,-2),(13,2,13,2,11,2,-3),(14,2,12,1,11,1,-1),(16,2,15,2,13,2,-2),(22,2,25,6,19,4,-3),(25,2,39,12,27,12,-7)]",
    "for level, weight, mdim, sdim, edim, ndim, trace2 in cases:",
    "    M = ModularForms(Gamma1(level), weight, prec=6)",
    "    S = M.cuspidal_subspace()",
    "    E = M.eisenstein_subspace()",
    "    N = S.new_subspace()",
    "    component_dimension = sum(c.rational_dimension() for c in M.character_components())",
    "    assert (M.dimension(), S.dimension(), E.dimension(), N.dimension(), S.hecke_matrix(2).trace()) == (mdim, sdim, edim, ndim, trace2)",
    "    assert component_dimension == mdim == sdim + edim",
    "    assert len(M.basis()) == M.dimension()",
    "    assert len(S.basis()) == S.dimension()",
    "    assert len(E.basis()) == E.dimension()",
    "    assert M.hecke_matrix(2).nrows() == M.dimension()",
    "    unit = [a for a in range(2, level+1) if gcd(a,level)==1][0] if level > 2 else 1",
    "    assert M.diamond_bracket_matrix(unit).nrows() == M.dimension()",
    "print('gamma1-sage-oracle-sweep-ok', len(cases))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "gamma1-sage-oracle-sweep-ok 11");
});
