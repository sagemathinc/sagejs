// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("Gamma0/QQ parents construct one common exact element type", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "M = ModularForms(11, 2, prec=10)",
    "S = M.cuspidal_subspace()",
    "E = M.eisenstein_subspace()",
    "f = S.gen()",
    "e = E.gen()",
    "g = e + f",
    "print(f._kind, e._kind, g._kind)",
    "print(f.parent() is S, e.parent() is E, g.parent() is M)",
    "print(all(b.parent() is M for b in M.basis()))",
    "print(f in S, f in M, e not in S)",
    "print(S(f.q_expansion(S.sturm_bound() + 1)) == f)",
    "print(M(f).ambient_coordinates() == f.ambient_coordinates())",
    "print(M.coordinates(g) == vector(QQ, [1, 1]))",
    "print(f.vector().is_immutable(), hash(f) == hash(S(f)))",
    "print(M.zero().is_zero(), S.zero().is_cuspidal())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "ClassicalModularFormElement ClassicalModularFormElement ClassicalModularFormElement",
      "True True True",
      "True",
      "True True True",
      "True",
      "True",
      "True",
      "True True",
      "True True",
    ].join("\n"),
  );
  await assert.rejects(
    session.evaluate("S=CuspForms(11,2); f=S.gen(); f.vector()[0]=7"),
    /immutable/,
  );
});

test("coordinate recovery uses the full supplied Sturm-certified prefix", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "S = CuspForms(11, 2, prec=12)",
    "f = S.gen()",
    "B = S.sturm_bound()",
    "long = f.q_expansion(B + 4)",
    "R = long.parent()",
    "bad = long + R.gen()^(B + 2)",
    "print(S(long) == f, S.contains(long), not S.contains(bad))",
    "print(S.coordinates(f) == vector(QQ, [1]))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "True True True\nTrue");
  await assert.rejects(
    session.evaluate([
      "S = CuspForms(11, 2)",
      "f = S.gen()",
      "S(f.q_expansion(S.sturm_bound()))",
    ].join("\n")),
    /below the required Sturm precision/,
  );
});

test("good and bad Hecke operators act on parented elements", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "S = CuspForms(11, 2, prec=12)",
    "f = S.gen()",
    "T2 = S.T(2)",
    "U11 = S.T(11)",
    "print(T2.domain() is S, T2.codomain() is S)",
    "print(T2(f) == -2*f, f.hecke(2) == -2*f)",
    "print(U11(f) == f, f.hecke(11) == f)",
    "print(T2.matrix() == matrix(QQ, [[-2]]))",
    "print(U11.matrix() == matrix(QQ, [[1]]))",
    "print(T2.charpoly())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "True True\nTrue True\nTrue True\nTrue\nTrue\nx + 2",
  );
});

test("Hecke-dual transport agrees with coefficient reconstruction", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs.modular_forms.object_layer import _basis_matrix, _hecke_image_matrix",
    "import sagejs.runtime as runtime",
    "checks = []",
    "S = CuspForms(37, 2)",
    "P = S.sturm_bound() + 1",
    "X = S._modular_symbols_cusp_space()",
    "for n in [2, 4, 37]:",
    "    fast = S.hecke_matrix(n)",
    "    B = _basis_matrix(S, P)",
    "    image = _hecke_image_matrix(S, n, P)",
    "    checks.append(fast * B == image)",
    "checks.append(X._q_expansion_data_cache.get(5 * (P - 1) + 1) is runtime.undefined)",
    "N = CuspForms(33, 2).new_subspace()",
    "P = N.sturm_bound() + 1",
    "fast = N.hecke_matrix(3)",
    "checks.append(fast * _basis_matrix(N, P) == _hecke_image_matrix(N, 3, P))",
    "print(checks)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "[True, True, True, True, True]");
});

test("old and new subspaces share the exact element contract", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "S = CuspForms(33, 2, prec=10)",
    "O = S.old_subspace()",
    "N = S.new_subspace()",
    "o = O.gen()",
    "n = N.gen()",
    "print(S.dimension(), O.dimension(), N.dimension())",
    "print(o.parent() is O, n.parent() is N)",
    "print(S(o).parent() is S, S(n).parent() is S)",
    "print(o in S, n in S, n not in O, o not in N)",
    "print(CuspForms(33, 2)(o) == o, CuspForms(33, 2)(n) == n)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "3 2 1\nTrue True\nTrue True\nTrue True True True\nTrue True",
  );
});

test("level-one products preserve exact parent semantics", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "E4 = EisensteinForms(1, 4, prec=8).gen()",
    "E6 = EisensteinForms(1, 6, prec=8).gen()",
    "D = (E4^3 - E6^2)/1728",
    "M12 = ModularForms(1, 12, prec=8)",
    "print(D._kind, D.weight(), D.level(), D.base_ring())",
    "print(D == M12.delta(), D.is_cuspidal(), D.valuation())",
    "print(E4^2 == EisensteinForms(1, 8).gen())",
    "print(E4*E6 == EisensteinForms(1, 10).gen())",
    "print((E4/2).q_expansion(5))",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "ClassicalModularFormElement 12 1 Rational Field",
      "True True 1",
      "True",
      "True",
      "1/2 + 120*q + 1080*q^2 + 3360*q^3 + 8760*q^4 + O(q^5)",
    ].join("\n"),
  );
});

test("parented elements and operators round trip through SagePack", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs_serialization import dumps, loads",
    "S = CuspForms(33, 2, prec=9)",
    "O = S.old_subspace()",
    "o = O.gen()",
    "T = O.T(2)",
    "answer = loads(dumps([S, O, o, T]))",
    "S2, O2, o2, T2 = answer",
    "print(S2.dimension() == S.dimension(), O2.dimension() == O.dimension())",
    "print(o2.parent() is O2, o2 == o, o2.q_expansion(12) == o.q_expansion(12))",
    "print(T2.domain() is O2, T2.matrix() == T.matrix(), T2(o2) == O2(T(o)))",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "True True\nTrue True True\nTrue True True",
  );
});
