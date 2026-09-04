// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("quadratic-character parents have exact bases, coordinates, and Hecke action", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "def conrey_character(level, number):",
    "    return [e for e in DirichletGroup(level) if e.conrey_number() == number][0]",
    "",
    "chi4 = conrey_character(4, 3)",
    "M4 = ModularForms(chi4, 3, prec=6)",
    "print(M4)",
    "print(M4.base_ring(), M4.character() == chi4, [M4.dimension(), CuspForms(chi4,3).dimension(), EisensteinForms(chi4,3).dimension()])",
    "print(M4.q_expansion_basis())",
    "",
    "chi12 = conrey_character(12, 7)",
    "M = ModularForms(chi12, 3, prec=10)",
    "S = M.cuspidal_subspace()",
    "E = M.eisenstein_subspace()",
    "B = S.basis()",
    "print([M.dimension(), S.dimension(), E.dimension()], M.base_ring())",
    "print(S.q_expansion_basis(10))",
    "print(E.q_expansion_basis(10))",
    "print(S.hecke_matrix(2))",
    "print(S.hecke_matrix(4))",
    "print(S.hecke_matrix(6))",
    "print([S.coordinates(f) for f in B])",
    "print([E.coordinates(f) for f in E.basis()])",
    "print(M.coordinates(M.gen()))",
    "print(all(f.parent() is S and f.character() == chi12 for f in B))",
    "print(S(B[0].q_expansion(S.sturm_bound()+1)) == B[0])",
    "chi_other = conrey_character(12, 11)",
    "print(B[0] not in CuspForms(chi_other, 3))",
    "Z = ModularForms(chi12, 2)",
    "print(Z, Z.dimension(), Z.basis())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "Modular Forms space of dimension 2, character [-1] and weight 3 over Rational Field",
      "Rational Field True [2, 0, 2]",
      "[1 + 12*q^2 + 64*q^3 + 60*q^4 + O(q^6), q + 4*q^2 + 8*q^3 + 16*q^4 + 26*q^5 + O(q^6)]",
      "[6, 2, 4] Rational Field",
      "[q - q^3 - 4*q^4 - 2*q^5 + 4*q^6 + 4*q^7 + 8*q^8 - 3*q^9 + O(q^10), q^2 - q^3 - 2*q^4 + q^6 + 4*q^7 + O(q^10)]",
      "[1 + 12*q^6 + 64*q^9 + O(q^10), q - 4*q^4 + 26*q^5 + 36*q^6 - 80*q^7 - 20*q^8 + 201*q^9 + O(q^10), q^2 + 5*q^4 - 9*q^6 + 32*q^7 + 21*q^8 - 48*q^9 + O(q^10), q^3 + 4*q^6 + 8*q^9 + O(q^10)]",
      "[ 0 -4]",
      "[ 1 -2]",
      "[-4  8]",
      "[-2  0]",
      "[ 4 -4]",
      "[ 1  2]",
      "[(1, 0), (0, 1)]",
      "[(1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)]",
      "(1, 0, 0, 0, 0, 0)",
      "True",
      "True",
      "True",
      "Modular Forms space of dimension 0, character [-1, 1] and weight 2 over Rational Field 0 []",
    ].join("\n"),
  );
});

test("higher-order characters use exact cyclotomic scalars and exact eigenpackets", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "def conrey_character(level, number):",
    "    return [e for e in DirichletGroup(level) if e.conrey_number() == number][0]",
    "",
    "chi13 = conrey_character(13, 4)",
    "M = ModularForms(chi13, 2, prec=7)",
    "S = M.cuspidal_subspace()",
    "E = M.eisenstein_subspace()",
    "print(M)",
    "print([M.dimension(), S.dimension(), E.dimension()], M.base_ring())",
    "print(S.q_expansion_basis(7))",
    "print(E.q_expansion_basis(7))",
    "print(S.hecke_matrix(2))",
    "f13 = S.newforms()[0]",
    "print(f13.coefficient_field(), f13.hecke_eigenvalue(2), f13.certificate().verify())",
    "top13 = Newforms(chi13, 2)[0]",
    "print(top13.q_expansion(7) == f13.q_expansion(7), top13.character() == chi13, top13.parent()._subspace_kind)",
    "",
    "chi9 = conrey_character(9, 4)",
    "S9 = CuspForms(chi9, 4, prec=12)",
    "f9 = S9.newforms()[0]",
    "print(S9.hecke_matrix(2))",
    "print(f9.coefficient_field(), f9.defining_polynomial())",
    "print(f9[2].minpoly())",
    "print(f9[3].minpoly())",
    "eps2 = QQbar._from_native(chi9(2)._native)",
    "print(f9[4] == f9[2]^2 - eps2*8, f9[6] == f9[2]*f9[3], f9[9] == f9[3]^2)",
    "print(f9.certificate().verify())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "Modular Forms space of dimension 3, character [zeta6] and weight 2 over Cyclotomic Field of order 6 and degree 2",
      "[3, 1, 2] Cyclotomic Field of order 6 and degree 2",
      "[q + (-zeta6 - 1)*q^2 + (2*zeta6 - 2)*q^3 + zeta6*q^4 + (-2*zeta6 + 1)*q^5 + (-2*zeta6 + 4)*q^6 + O(q^7)]",
      "[1 + (-18/19*zeta6 + 11/19)*q^2 + (8/19*zeta6 + 50/19)*q^3 + (-75/19*zeta6 + 87/19)*q^4 + (-56/19*zeta6 + 144/19)*q^5 + (77/19*zeta6 + 49/19)*q^6 + O(q^7), q + (zeta6 + 2)*q^2 + (-zeta6 + 3)*q^3 + (3*zeta6 + 3)*q^4 + 4*q^5 + 7*q^6 + O(q^7)]",
      "[-zeta6 - 1]",
      "Cyclotomic Field of order 6 and degree 2 -zeta6 - 1 True",
      "True True New",
      "[          0 6*zeta6 - 6]",
      "[          1    -3*zeta6]",
      "Algebraic Field x^2 + 3*zeta6*x - (6*zeta6 - 6)",
      "x^4 + 3*x^3 + 15*x^2 - 18*x + 36",
      "x^4 + 3*x^3 - 18*x^2 + 81*x + 729",
      "True True True",
      "True",
    ].join("\n"),
  );
});

test("degree-eight character q-expansions use certified direct Hecke images", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "chi = DirichletGroup(17).gen(0)",
    "C = ModularSymbols(chi, 3, sign=1).cuspidal_submodule()",
    "A = C.ambient_module()",
    "H = A.p1list().character_hecke_images(A.weight(), A.sign(), A.character(), A.base_ring(), C.basis_matrix(), 0, 10)",
    "print(chi.order(), C.base_ring().degree(), C.dimension(), H.dimensions())",
    "print(all(H.column(n-1).list() == C.hecke_matrix(n).row(0).list() for n in range(1,10)))",
    "S = CuspForms(chi, 3, prec=10)",
    "B = S.q_expansion_basis(10)",
    "print(B[0][4])",
    "print(B[1][2])",
    "print(S.hecke_matrix(2).charpoly())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "16 8 2 (2, 9)",
      "True",
      "zeta16^6 + zeta16^4 - zeta16^3 + zeta16 - 1",
      "1",
      "x^2 + (-zeta16^6 + zeta16^5 - zeta16 + 1)*x + 3*zeta16^6 - zeta16^4 + zeta16^3 - zeta16 + 1",
    ].join("\n"),
  );
});

test("imprimitive characters have a Sturm-certified old/new direct sum", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "chi = [e for e in DirichletGroup(20) if e.conrey_number() == 9][0]",
    "S = CuspForms(chi, 4, prec=10)",
    "O = S.old_subspace()",
    "N = S.new_subspace()",
    "print(S.dimension(), O.dimension(), N.dimension())",
    "print(N.q_expansion_basis(10))",
    "print(N.hecke_matrix(3))",
    "C = O.q_expansion_basis_certificate()",
    "print(C, C.verify())",
    "print(all(f in S for f in O.basis()+N.basis()))",
    "S2, O2, N2, o2, n2, T2 = loads(dumps([S,O,N,O.gen(),N.gen(),N.T(3)]))",
    "print(S2.character().conrey_number(), O2.dimension(), N2.dimension(), o2 in S2, n2 in S2, T2.matrix() == N.hecke_matrix(3))",
    "f = N.newforms()[0]",
    "g = loads(dumps(f))",
    "print(g.defining_polynomial(), str(g.q_expansion(10)) == str(f.q_expansion(10)), dumps(g) == dumps(f))",
    "chi9 = [e for e in DirichletGroup(9) if e.conrey_number() == 4][0]",
    "h = CuspForms(chi9,4,prec=10).newforms()[0]",
    "h2 = loads(dumps(h))",
    "print(h2.defining_polynomial() == h.defining_polynomial(), h2.q_expansion(10) == h.q_expansion(10), h2.certificate().verify())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "6 4 2",
      "[q + 7*q^5 - 49*q^9 + O(q^10), q^3 - q^5 - q^7 + O(q^10)]",
      "[  0 -76]",
      "[  1   0]",
      "Sturm-certified old/new decomposition of dimensions 4 + 2 = 6 True",
      "True",
      "9 4 2 True True True",
      "x^2 + 76 True True",
      "True True True",
    ].join("\n"),
  );
});

test("character products and the pinned Sage/Magma quadratic oracle agree", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "def conrey_character(level, number):",
    "    return [e for e in DirichletGroup(level) if e.conrey_number() == number][0]",
    "",
    "chi = conrey_character(5, 2)",
    "quadratic = conrey_character(5, 4)",
    "f = EisensteinForms(chi, 3, prec=12).gen()",
    "g = EisensteinForms(quadratic, 4, prec=12).gen()",
    "h = f*g",
    "K = h.base_ring()",
    "print(h.level(), h.weight(), h.character().conrey_number(), K)",
    "print(all(h[n] == sum(K(f[j])*K(g[n-j]) for j in range(n+1)) for n in range(12)))",
    "print(h in ModularForms(h.character(), 7, prec=12))",
    "",
    "# SageMath 10.9.post1 and Magma V2.18-5 independently give this",
    "# quadratic level-5 basis. Magma gives T_2 = [[-7,-14],[0,7]].",
    "E = EisensteinForms(quadratic, 4, prec=12)",
    "print(E.q_expansion_basis(12))",
    "print(E.hecke_matrix(2))",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "5 7 3 Cyclotomic Field of order 4 and degree 2",
      "True",
      "True",
      "[1 - 14*q^2 - 52*q^3 - 124*q^5 - 684*q^7 - 910*q^8 - 882*q^10 + O(q^12), q + 7*q^2 + 26*q^3 + 57*q^4 + 125*q^5 + 182*q^6 + 342*q^7 + 455*q^8 + 703*q^9 + 875*q^10 + 1332*q^11 + O(q^12)]",
      "[ -7 -14]",
      "[  0   7]",
    ].join("\n"),
  );
});

test("character constructor failures are explicit", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  await assert.rejects(
    session.evaluate("chi=[e for e in DirichletGroup(5) if e.conrey_number()==2][0]; ModularForms(chi,3,QQ)"),
    /character values do not lie in Rational Field/,
  );
  await assert.rejects(
    session.evaluate("chi=[e for e in DirichletGroup(5) if e.conrey_number()==2][0]; ModularForms(chi,1)"),
    /require weight at least 2/,
  );
});
