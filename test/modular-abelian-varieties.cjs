// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "fixtures/modular-abelian-varieties-sage-magma.json",
    ),
    "utf8",
  ),
);

test("large Jacobians retain the exact Sage homology polynomials and factors", { timeout: 240_000 }, async (t) => {
  const oracle = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/modular-abelian-varieties-large-sage.json"), "utf8"));
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "import json",
    "answers=[]",
    "for N in [1009,2003]:",
    "    J=J0(N)",
    "    T=J.integral_homology().hecke_matrix(2)",
    "    D=J.decomposition()",
    "    assert all(A.lattice().rank()==2*A.dimension() for A in D)",
    "    answers.append({'level':N,'dimension':J.dimension(),'factors':sorted(A.dimension() for A in D),'hecke2_coefficients':[str(c) for c in T.charpoly().list()]})",
    "print(json.dumps(answers))",
  ].join("\n"));
  assert.deepEqual(JSON.parse(result.stdout), oracle.cases);
});

test("blocked exact matrix polynomials and denominator clearing", { timeout: 120_000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs.modular_abelian_varieties.abelian_variety import _polynomial_at_matrix, _clear_denominators, _integral_matrix",
    "R=PolynomialRing(QQ,'x'); x=R.gen()",
    "matrices=[matrix(QQ,[[1,2,0],[0,1,3],[0,0,1]]),matrix(QQ,[[1/2,2/3],[3/7,-2]])]",
    "for A in matrices:",
    "    for degree in [0,1,4,5,8,17,37,75]:",
    "        f=R([(-1)^i*(i+1)/3 for i in range(degree+1)])",
    "        assert _polynomial_at_matrix(f,A)==f(A)",
    "d=2^80+7",
    "A=matrix(QQ,[[1/d,1/(3*d)],[0,2/d]])",
    "B,den=_clear_denominators(A)",
    "assert den==3*d and B==matrix(ZZ,[[3,1],[0,6]])",
    "try:",
    "    _integral_matrix(A,'fractional input')",
    "    assert False",
    "except ArithmeticError:",
    "    pass",
    "print('exact matrix arithmetic verified')",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "exact matrix arithmetic verified");
});

test("cyclic newform coordinates certify full operators, not just one row", { timeout: 120_000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs.modular_abelian_varieties.abelian_variety import _polynomial_at_matrix",
    "for N in [23,43,101]:",
    "    for f in CuspForms(N,2).newforms():",
    "        d=f.defining_polynomial().degree()",
    "        assert f._cyclic_basis.nrows()==d and f._cyclic_basis.ncols()==d",
    "        for n in [1,2,3,5,7]:",
    "            T=f.hecke_constituent().hecke_matrix(n)",
    "            c=f._coordinates_for_operator(T)",
    "            polynomial=PolynomialRing(QQ,'x')(c.list())",
    "            assert _polynomial_at_matrix(polynomial,f._primitive_operator)==T",
    "        assert f.certificate().verify()",
    "        if d>1:",
    "            fake=matrix(QQ,d,d); fake[1,0]=1",
    "            assert fake.row(0)==vector(QQ,[0]*d)",
    "            try:",
    "                f._coordinates_for_operator(fake)",
    "                assert False",
    "            except ArithmeticError:",
    "                pass",
    "print('faithful cyclic representation verified')",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "faithful cyclic representation verified");
});

test("integral surjectivity uses the exact row lattice without Smith transforms", { timeout: 120_000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "from sagejs.modular_abelian_varieties.abelian_variety import _is_integrally_surjective",
    "examples=[(matrix(ZZ,[[2,0],[0,3],[1,1]]),True),(matrix(ZZ,[[2,0],[0,2]]),False),(matrix(ZZ,[[1,0]]),False),(matrix(ZZ,0,2),False),(matrix(ZZ,3,0),True)]",
    "for A,want in examples:",
    "    assert _is_integrally_surjective(A)==want",
    "a=2^80+7",
    "assert _is_integrally_surjective(matrix(ZZ,[[a,a+1],[a-1,a]]))",
    "cls=type(matrix(ZZ,1,1)); original=cls.smith_form",
    "def forbidden(*args,**kwds):",
    "    raise AssertionError('surjectivity must not compute Smith transforms')",
    "cls.smith_form=forbidden",
    "try:",
    "    f=max(CuspForms(43,2).newforms(),key=lambda g:g.defining_polynomial().degree())",
    "    Q=AbelianVariety(f); q=Q.quotient_map()",
    "    assert q.is_surjective() and q.verify()",
    "    assert not _is_integrally_surjective(2*q.matrix())",
    "finally:",
    "    cls.smith_form=original",
    "print('integral surjectivity verified')",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "integral surjectivity verified");
});

test("homology decomposition stops at certified sign multiplicity two", { timeout: 120_000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "J = J0(101)",
    "cls = type(J.modular_symbols())",
    "original_hecke = cls.hecke_matrix",
    "calls = []",
    "def checked_hecke(self, index):",
    "    calls.append(index)",
    "    assert index <= 3, ('unnecessary Hecke operator', index)",
    "    return original_hecke(self, index)",
    "cls.hecke_matrix = checked_hecke",
    "try:",
    "    D = J.decomposition()",
    "    assert [A.dimension() for A in D] == [1, 7]",
    "    assert all(A.lattice().rank() == 2*A.dimension() for A in D)",
    "    assert all(A.modular_symbols(1).dimension() == A.dimension() for A in D)",
    "    assert all(A.modular_symbols(-1).dimension() == A.dimension() for A in D)",
    "    assert all(A.inclusion_map().verify() for A in D)",
    "finally:",
    "    cls.hecke_matrix = original_hecke",
    "print(sorted(set(calls)))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "[2, 3]");
});

test("sign-aware homology decomposition preserves oldspace refinement", { timeout: 240_000 }, async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "for N in [33, 49, 121, 143, 169]:",
    "    J = J0(N)",
    "    reference = J.modular_symbols().decomposition(anemic=False)",
    "    D = J.decomposition()",
    "    assert sorted(A.dimension()*2 for A in D) == sorted(B.dimension() for B in reference)",
    "    spaces = [B.basis_matrix().row_space() for B in reference]",
    "    assert all(A.modular_symbols().basis_matrix().row_space() in spaces for A in D)",
    "    assert all(A.inclusion_map().verify() for A in D)",
    "print('exact oldspace agreement')",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "exact oldspace agreement");
});

test(
  "J0 exact homology and Hecke data match the Sage/Magma corpus",
  { timeout: 240_000 },
  async (t) => {
    const session = await createSage();
    t.after(() => session.close());
    const cases = JSON.stringify(fixture.cases);
    const result = await session.evaluate([
      `cases = ${cases}`,
      "receipt = []",
      "for case in cases:",
      "    J = J0(case['level'])",
      "    assert J.dimension() == case['dimension']",
      "    assert J.level() == case['level'] and J.base_field() is QQ",
      "    L = J.lattice()",
      "    assert L.rank() == 2*J.dimension() and L.is_saturated()",
      "    assert J.integral_homology().base_ring() is ZZ",
      "    assert J.rational_homology().base_ring() is QQ",
      "    for n, key in [(2, 'T2'), (3, 'T3')]:",
      "        p = J.hecke_polynomial(n)",
      "        assert str(p) == case[key], (case['level'], n, p, case[key])",
      "        H = J.integral_homology().hecke_matrix(n)",
      "        assert H.base_ring() is ZZ and H.charpoly('x') == p^2",
      "    dimensions = [A.dimension() for A in J.decomposition()]",
      "    assert dimensions == case['sagejs_hecke_isotypic_dimensions']",
      "    assert sum(dimensions) == J.dimension()",
      "    assert all(A.inclusion_map().is_injective() for A in J.decomposition())",
      "    assert all(A.inclusion_map().verify() for A in J.decomposition())",
      "    assert J.serialization_certificate().verify()",
      "    receipt.append((case['level'], J.dimension(), dimensions))",
      "print(receipt)",
    ].join("\n"));
    assert.equal(
      result.stdout.trim(),
      "[(11, 1, [1]), (33, 3, [1, 2]), (37, 2, [1, 1]), " +
        "(43, 3, [1, 2]), (67, 5, [1, 2, 2]), (97, 7, [3, 4])]",
    );
  },
);

test(
  "newforms define connected quotients distinct from embedded lattices",
  { timeout: 120_000 },
  async (t) => {
    const session = await createSage();
    t.after(() => session.close());
    const result = await session.evaluate([
      "forms = CuspForms(43, 2).newforms()",
      "f = [g for g in forms if g.defining_polynomial().degree() == 2][0]",
      "A = f.abelian_variety()",
      "q = A.quotient_map()",
      "B = A.embedded_subvariety()",
      "i = B.inclusion_map()",
      "print(A, A.dimension(), A.newform() is f)",
      "print(q.domain() is J0(43), q.codomain() is A)",
      "print(q.is_surjective(), q.verify(), q.kernel_lattice().is_saturated())",
      "print(q.kernel_lattice().rank(), 2*(J0(43).dimension()-A.dimension()))",
      "print(i.is_injective(), i.verify(), B.dimension())",
      "print(A.hecke_polynomial(2), B.hecke_polynomial(2))",
      "g = CuspForms(37, 2).newforms()[0]",
      "Q = AbelianVariety(g)",
      "print(Q.lattice() != Q.embedded_subvariety().lattice())",
      "from sagejs.modular_abelian_varieties import IntegralHomologyLattice",
      "L1 = IntegralHomologyLattice(matrix(QQ, [[1]]), 'one', True)",
      "L2 = IntegralHomologyLattice(matrix(QQ, [[2]]), 'two', False)",
      "print(L1 != L2, L1.basis_matrix().row_space() == L2.basis_matrix().row_space())",
      "print(Gamma0(37).jacobian() is J0(37))",
      "C = ModularSymbols(37, 2).cuspidal_submodule().decomposition()[0]",
      "print(C.abelian_variety().dimension(), AbelianVariety(C).inclusion_map().verify())",
    ].join("\n"));
    assert.equal(
      result.stdout.trim(),
      [
        "Newform quotient of dimension 2 of J0(43) 2 True",
        "True True",
        "True True True",
        "2 2",
        "True True 2",
        "x^2 - 2 x^2 - 2",
        "True",
        "True True",
        "True",
        "1 True",
      ].join("\n"),
    );
  },
);

test(
  "SagePack reconstructs and verifies varieties, homology, operators, and maps",
  { timeout: 120_000 },
  async (t) => {
    const session = await createSage();
    t.after(() => session.close());
    const result = await session.evaluate([
      "J = J0(37)",
      "A = CuspForms(37, 2).newforms()[0].abelian_variety()",
      "values = [J, A, J.integral_homology(), A.T(2), A.quotient_map(), A.serialization_certificate()]",
      "answer = loads(dumps(values))",
      "J2, A2, H2, T2, q2, c2 = answer",
      "print(J2 == J, A2 == A, H2.abelian_variety() is J2)",
      "print(H2.base_ring() is ZZ, T2.parent() is A2, T2.matrix() == A2.hecke_matrix(2))",
      "print(q2.domain() is J2, q2.codomain() is A2, q2.is_surjective(), q2.verify())",
      "print(c2.variety() is A2, c2.verify())",
    ].join("\n"));
    assert.equal(
      result.stdout.trim(),
      "True True True\nTrue True True\nTrue True True True\nTrue True",
    );
  },
);

test("the initial scope rejects unsupported defining data", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  const result = await session.evaluate([
    "checks = []",
    "for thunk in [",
    "    lambda: J0(0),",
    "    lambda: AbelianVariety(Gamma1(11)),",
    "    lambda: AbelianVariety(ModularSymbols(11, 2, 1).cuspidal_submodule()),",
    "    lambda: AbelianVariety(ModularSymbols(11, 4, 0).cuspidal_submodule()),",
    "]:",
    "    try:",
    "        thunk()",
    "        checks.append(False)",
    "    except (ArithmeticError, NotImplementedError, TypeError, ValueError):",
    "        checks.append(True)",
    "print(checks)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "[True, True, True, True]");
});

test("serialization never replaces a noncanonical homology map", async (t) => {
  const session = await createSage();
  t.after(() => session.close());
  await session.evaluate([
    "from sagejs.modular_abelian_varieties import ModularAbelianVarietyMap",
    "J = J0(37)",
    "A = CuspForms(37, 2).newforms()[0].abelian_variety()",
    "q = A.quotient_map()",
    "i = A.embedded_subvariety().inclusion_map()",
    "assert loads(dumps(i)).matrix() == i.matrix()",
    "assert loads(dumps(q)).matrix() == q.matrix()",
    "doubled = ModularAbelianVarietyMap(J, A, 2*q.matrix(), 'doubled quotient')",
  ].join("\n"));
  await assert.rejects(
    session.evaluate("dumps(doubled)"),
    /only canonical homology maps.*matrix differs/,
  );
  await session.evaluate([
    "wrong_target = ModularAbelianVarietyMap(J, J0(33), matrix(ZZ, 4, 6), 'wrong target')",
  ].join("\n"));
  await assert.rejects(
    session.evaluate("dumps(wrong_target)"),
    /only canonical homology maps.*codomain differs/,
  );
});
