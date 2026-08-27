// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "Mestre T2 graph matches Sage's level-37 fixture exactly",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S = SupersingularModule(37)
points, point_index = S.supersingular_points()
T2 = S.T(2)
assert S.dimension() == 3
assert [str(j) for j in points] == ["8", "27*a + 23", "10*a + 20"]
assert [point_index[j] for j in points] == [0,1,2]
assert T2.is_sparse()
assert T2.nonzero_count() == 7
assert T2.row_sums() == (3,3,3)
assert T2.matrix() == matrix(ZZ, [[1,1,1],[1,0,2],[1,2,0]])
assert T2 * vector(ZZ, [1,1,1]) == vector(ZZ, [3,3,3])
assert S.isogeny_graph().degree() == 3
assert S.isogeny_graph().ramanujan_bound() == 2.0*sqrt(2.0)
[points, T2.matrix(), S.mass_pairing()]
`);
      assert.equal(
        result.repr,
        "[[8, 27*a + 23, 10*a + 20], " +
          "[1 1 1]\n[1 0 2]\n[1 2 0], " +
          "[1 0 0]\n[0 1 0]\n[0 0 1]]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "supersingular sparse operators preserve mass, bounds, and exact fallback failures",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
rows = []
for p in [5,7,11,13,17,19,23,29,31,37,41,43,47,67,389]:
    S = SupersingularModule(p, dense_entry_limit=1000)
    points, point_index = S.supersingular_points()
    T2 = S.T(2)
    assert len(points) == S.dimension()
    assert len(point_index) == S.dimension()
    assert T2.row_sums() == tuple(3 for _ in range(S.dimension()))
    assert T2 * S.eisenstein_vector() == 3*S.eisenstein_vector()
    weights = S.mass_weights()
    for i in range(S.dimension()):
        for j, multiplicity in T2.row(i):
            assert multiplicity*weights[i] == T2[j,i]*weights[j]
    rows.append((p,S.dimension(),T2.nonzero_count()))
try:
    SupersingularModule(37, level=2)
    assert False
except NotImplementedError:
    pass
try:
    SupersingularModule(37, dense_entry_limit=1).T(2).matrix()
    assert False
except MemoryError:
    pass
try:
    SupersingularModule(37).T(3)
    assert False
except NotImplementedError:
    pass
rows
`);
      assert.equal(
        result.repr,
        "[(5, 1, 1), (7, 1, 1), (11, 2, 3), (13, 1, 1), " +
          "(17, 2, 3), (19, 2, 4), (23, 3, 6), (29, 3, 5), " +
          "(31, 3, 7), (37, 3, 7), (41, 4, 7), (43, 4, 9), " +
          "(47, 5, 11), (67, 6, 15), (389, 33, 95)]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "level-37 Brandt cuspidal factor matches the independent modular-symbol oracle",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
B = SupersingularModule(37).T(2).matrix()
M = ModularSymbols(37, 2, 1).cuspidal_submodule().T(2).matrix()
brandt = B.charpoly().factor()
symbols = M.charpoly().factor()
[brandt, symbols]
`);
      assert.equal(result.repr, "[x * (x + 2) * (x - 3), x * (x + 2)]");
    } finally {
      await session.close();
    }
  },
);
