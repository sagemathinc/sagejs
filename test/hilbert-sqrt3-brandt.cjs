// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = path.resolve(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    path.join(
      root,
      "test/fixtures/mestre-hilbert-sqrt3-magma-2.18-5.json",
    ),
    "utf8",
  ),
);

test("the Q(sqrt(3)) Magma packet has pinned source provenance", () => {
  assert.equal(fixture.generated_with, "Magma V2.18-5");
  const source = readFileSync(path.join(root, fixture.script));
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    fixture.script_sha256,
  );
  for (const operator of fixture.operators) {
    assert.deepEqual(
      operator.magma_ambient[0].map((_, column) =>
        operator.magma_ambient.map((row) => row[column]),
      ),
      operator.sagejs_adjacency,
    );
  }
});

test(
  "Q(sqrt(3)) reconstructs the two-component Magma Brandt operators",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import HilbertModularFormsQsqrt3, finite_hecke_set

H = HilbertModularFormsQsqrt3()
F = finite_hecke_set(H)
fixture = ${JSON.stringify(fixture)}
assert H.base_field() == 'Q(sqrt(3))'
assert H.level().basis() == ((13,0),(4,1))
assert H.weight() == (2,2)
assert H.dimension() == 4
assert H.cuspidal_dimension() == 2
assert F.component_count() == 2
assert tuple(C.cardinality() for C in H.ideal_class_components()) == (2,2)
assert tuple(C.orbit_sizes() for C in H.ideal_class_components()) == ((12,2),(6,8))
assert H.mass_weights() == (QQ(1)/2,QQ(1)/12,QQ(1)/4,QQ(1)/3)

expected = {row['label']:matrix(ZZ,row['sagejs_adjacency']) for row in fixture['operators']}
charpolys = {row['label']:row['cuspidal_charpoly'] for row in fixture['operators']}
operators = []
for label in ['2','3','11a','11b']:
    T = H.T(label)
    assert T.matrix() == expected[label]
    assert T.row_sums() == tuple(T.hecke_index().norm()+1 for _ in range(4))
    assert list(H.cuspidal_matrix(label).charpoly().coefficients()) == charpolys[label]
    operators.append(T)
for i in range(len(operators)):
    for j in range(i):
        assert operators[i].commutes_with(operators[j])

e1,e2 = H.eisenstein_basis()
assert H.T(2)*e1 == 3*e2
assert H.T(2)*e2 == 3*e1
assert H.is_cuspidal(vector(QQ,[1,-6,0,0]))
assert H.is_cuspidal(vector(QQ,[0,0,1,-QQ(3)/4]))
(H.dimension(),H.cuspidal_dimension(),tuple(H.mass_weights()))
`);
      assert.equal(result.repr, "(4, 2, (1/2, 1/12, 1/4, 1/3))");
    } finally {
      await session.close();
    }
  },
);

test(
  "quaternion component packets reject singular and incomplete arithmetic",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import (
    QuaternionComponentHeckeSet,
    QuaternionHeckeCorrespondence,
    QuaternionIdealComponent,
)

out=[]
try:
    QuaternionIdealComponent('bad',13,[(1,0,0,0)])
    out.append('singular-accepted')
except ValueError:
    out.append('singular-rejected')

C = QuaternionIdealComponent('trivial',13,[(1,0,0,1)])
try:
    QuaternionComponentHeckeSet(
        [C,C],
        [QuaternionHeckeCorrespondence('2',2,[(0,1,[(1,0,0,1)]),(1,0,[(1,0,0,1)])])],
    )
    out.append('degree-accepted')
except ArithmeticError:
    out.append('degree-rejected')
out
`);
      assert.equal(result.repr, "['singular-rejected', 'degree-rejected']");
    } finally {
      await session.close();
    }
  },
);
