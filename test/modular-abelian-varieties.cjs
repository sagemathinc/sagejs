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
