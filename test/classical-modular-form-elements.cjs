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

test("low display precision truncates a Sturm-certified canonical basis", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "M = ModularForms(37, 4)",
    "B = M.basis()",
    "Q = M.q_expansion_basis()",
    "print(M.dimension(), len(B), len(Q), M.precision())",
    "print(all(f.parent() is M for f in B))",
    "print(all(f.q_expansion().precision_absolute() == M.precision() for f in B))",
    "print(B[7].q_expansion())",
    "print(M.coordinates(B[10]))",
    "print(len(M.basis(3)), M.basis(3)[7].q_expansion())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "11 11 11 6\nTrue\nTrue\nO(q^6)\n(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1)\n11 O(q^3)",
  );
});

test("bounded Gamma0/QQ public API sweep", { timeout: 120_000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "def standard_vector(dimension, index):",
    "    values = [QQ(0) for _position in range(dimension)]",
    "    values[index] = QQ(1)",
    "    return vector(QQ, values)",
    "",
    "def check_space(space, precision, label):",
    "    dimension = space.dimension()",
    "    basis = space.basis()",
    "    expansions = space.q_expansion_basis()",
    "    assert len(basis) == dimension, (label, 'parented basis', len(basis), dimension)",
    "    assert len(expansions) == dimension, (label, 'q-expansion basis', len(expansions), dimension)",
    "    assert all(form.parent() is space for form in basis), (label, 'parent')",
    "    assert all(form.q_expansion().precision_absolute() == precision for form in basis), (label, 'element precision')",
    "    assert all(form.precision_absolute() == precision for form in expansions), (label, 'basis precision')",
    "    for index in range(dimension):",
    "        displayed = basis[index].q_expansion()",
    "        assert all(QQ(expansions[index][exponent]) == QQ(displayed[exponent]) for exponent in range(precision)), (label, 'canonical expansions', index)",
    "    for index in range(dimension):",
    "        assert space.coordinates(basis[index]) == standard_vector(dimension, index), (label, 'coordinates', index)",
    "    proof_precision = space.sturm_bound() + 1",
    "    if dimension > 0:",
    "        selected = [0] if dimension == 1 else [0, dimension - 1]",
    "        for index in selected:",
    "            expansion = basis[index].q_expansion(proof_precision)",
    "            assert space(expansion) == basis[index], (label, 'recovery', index)",
    "            assert basis[index] in space, (label, 'membership', index)",
    "    return basis",
    "",
    "def check_hecke(space, index, label):",
    "    operator = space.T(index)",
    "    action = operator.matrix()",
    "    dimension = space.dimension()",
    "    assert operator.domain() is space and operator.codomain() is space, (label, 'domain')",
    "    assert action.nrows() == dimension and action.ncols() == dimension, (label, 'matrix shape')",
    "    assert action == space.hecke_matrix(index), (label, 'matrix cache')",
    "    assert operator.charpoly().degree() == dimension, (label, 'charpoly')",
    "    if dimension > 0:",
    "        basis = space.basis()",
    "        selected = [0] if dimension == 1 else [0, dimension - 1]",
    "        for position in selected:",
    "            image = operator(basis[position])",
    "            assert image.parent() is space, (label, 'image parent', position)",
    "            assert image.vector() == basis[position].vector() * action, (label, 'row action', position)",
    "",
    "ambient_cases = [",
    "    (1, 4, 1, 1, 0, 1),",
    "    (1, 12, 1, 2, 1, 1),",
    "    (1, 24, 3, 3, 2, 1),",
    "    (5, 2, 1, 1, 0, 1),",
    "    (11, 2, 1, 2, 1, 1),",
    "    (11, 4, 3, 4, 2, 2),",
    "    (23, 2, 2, 3, 2, 1),",
    "    (37, 2, 3, 3, 2, 1),",
    "    (37, 4, 6, 11, 9, 2),",
    "]",
    "ambient_receipt = []",
    "for level, weight, precision, expected, expected_cusp, expected_eis in ambient_cases:",
    "    ambient = ModularForms(level, weight, prec=precision)",
    "    cusp = ambient.cuspidal_subspace()",
    "    eisenstein = ambient.eisenstein_subspace()",
    "    assert ambient.dimension() == expected",
    "    assert cusp.dimension() == expected_cusp",
    "    assert eisenstein.dimension() == expected_eis",
    "    assert expected == expected_cusp + expected_eis",
    "    ambient_basis = check_space(ambient, precision, ('M', level, weight, precision))",
    "    cusp_basis = check_space(cusp, precision, ('S', level, weight, precision))",
    "    eisenstein_basis = check_space(eisenstein, precision, ('E', level, weight, precision))",
    "    if expected_cusp > 0:",
    "        assert ambient(cusp_basis[-1]).parent() is ambient",
    "        assert cusp_basis[-1] in ambient",
    "    if expected_eis > 0:",
    "        assert ambient(eisenstein_basis[-1]).parent() is ambient",
    "        assert eisenstein_basis[-1] in ambient",
    "    check_hecke(ambient, 2, ('M', level, weight, 'T2'))",
    "    if level in [11, 37] and expected_cusp > 0:",
    "        check_hecke(cusp, level, ('S', level, weight, 'bad'))",
    "    ambient_receipt.append((level, weight, precision, expected, expected_cusp, expected_eis))",
    "",
    "decomposition_cases = [",
    "    (22, 2, 1, 2, 2, 0, 3, 2),",
    "    (26, 2, 2, 2, 0, 2, 3, 2),",
    "    (33, 2, 2, 3, 2, 1, 2, 3),",
    "    (44, 2, 3, 4, 3, 1, 3, 2),",
    "    (50, 4, 4, 17, 12, 5, 3, 2),",
    "]",
    "decomposition_receipt = []",
    "for level, weight, precision, expected, expected_old, expected_new, good, bad in decomposition_cases:",
    "    cusp = CuspForms(level, weight, prec=precision)",
    "    old = cusp.old_subspace()",
    "    new = cusp.new_subspace()",
    "    assert cusp.dimension() == expected",
    "    assert old.dimension() == expected_old",
    "    assert new.dimension() == expected_new",
    "    assert expected_old + expected_new == expected",
    "    cusp_basis = check_space(cusp, precision, ('S', level, weight, precision))",
    "    old_basis = check_space(old, precision, ('O', level, weight, precision))",
    "    new_basis = check_space(new, precision, ('N', level, weight, precision))",
    "    if expected_old > 0:",
    "        assert cusp(old_basis[-1]).parent() is cusp",
    "        assert old_basis[-1] in cusp",
    "    if expected_new > 0:",
    "        assert cusp(new_basis[-1]).parent() is cusp",
    "        assert new_basis[-1] in cusp",
    "    for space, kind in [(cusp, 'S'), (old, 'O'), (new, 'N')]:",
    "        check_hecke(space, good, (kind, level, weight, 'good'))",
    "        check_hecke(space, bad, (kind, level, weight, 'bad'))",
    "    decomposition_receipt.append((level, weight, precision, expected, expected_old, expected_new))",
    "",
    "print(ambient_receipt)",
    "print(decomposition_receipt)",
    "print('checked 42 spaces and 43 exact Hecke actions')",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "[(1, 4, 1, 1, 0, 1), (1, 12, 1, 2, 1, 1), (1, 24, 3, 3, 2, 1), (5, 2, 1, 1, 0, 1), (11, 2, 1, 2, 1, 1), (11, 4, 3, 4, 2, 2), (23, 2, 2, 3, 2, 1), (37, 2, 3, 3, 2, 1), (37, 4, 6, 11, 9, 2)]",
      "[(22, 2, 1, 2, 2, 0), (26, 2, 2, 2, 0, 2), (33, 2, 2, 3, 2, 1), (44, 2, 3, 4, 3, 1), (50, 4, 4, 17, 12, 5)]",
      "checked 42 spaces and 43 exact Hecke actions",
    ].join("\n"),
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
