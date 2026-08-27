// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = path.resolve(__dirname, "..");
const magmaFixture = JSON.parse(
  readFileSync(
    path.join(root, "test/fixtures/mestre-brandt-magma-2.18-5.json"),
    "utf8",
  ),
);
const lmfdbFixture = JSON.parse(
  readFileSync(
    path.join(root, "test/fixtures/mestre-lmfdb-level-37.json"),
    "utf8",
  ),
);

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
  "pinned Magma modes and LMFDB newforms are exact independent oracles",
  { timeout: 120_000 },
  async () => {
    assert.equal(magmaFixture.generated_with, "Magma V2.18-5");
    assert.deepEqual(magmaFixture.modes, ["gram-theta", "neighboring-ideals"]);
    assert.equal(magmaFixture.modes_exactly_equal, true);
    const magmaSource = readFileSync(path.join(root, magmaFixture.script));
    assert.equal(
      createHash("sha256").update(magmaSource).digest("hex"),
      magmaFixture.script_sha256,
    );
    assert.equal(lmfdbFixture.query_contract.record_count, 2);
    assert.deepEqual(
      lmfdbFixture.newforms.map((row) => row.related_objects[0]),
      ["EllipticCurve/Q/37/a", "EllipticCurve/Q/37/b"],
    );

    const session = await createSage();
    try {
      const result = await session.evaluate(`
import json
rows = []
for p in [11,37,67]:
    S = SupersingularModule(p)
    for ell in [2,3,5]:
        if ell != p:
            T = S.T(ell)
            rows.append({
                "prime": p,
                "index": ell,
                "matrix": [list(T.matrix().row(i)) for i in range(T.nrows())]
                    if p in [11,37] else None,
                "charpoly": list(T.matrix().charpoly().coefficients()),
            })
json.dumps(rows, sort_keys=True)
`);
      const observed = JSON.parse(result.repr.slice(1, -1));
      const expected = magmaFixture.cases.flatMap((record) =>
        record.operators.map((operator) => ({
          prime: record.prime,
          index: operator.index,
          matrix: record.prime === 67 ? null : operator.matrix,
          charpoly: operator.charpoly,
        })),
      );
      assert.deepEqual(observed, expected);

      const level37 = magmaFixture.cases.find((row) => row.prime === 37);
      for (const operator of level37.operators) {
        const eigenvalues = lmfdbFixture.newforms.map(
          (form) => form.hecke_eigenvalues[String(operator.index)],
        );
        let polynomial = [1];
        for (const rootValue of [operator.index + 1, ...eigenvalues]) {
          const next = Array(polynomial.length + 1).fill(0);
          for (let index = 0; index < polynomial.length; index += 1) {
            next[index] -= rootValue * polynomial[index];
            next[index + 1] += polynomial[index];
          }
          polynomial = next;
        }
        assert.deepEqual(operator.charpoly, polynomial);
      }
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
    SupersingularModule(37).T(4)
    assert False
except NotImplementedError:
    pass
try:
    SupersingularModule(37).T(37)
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
  "portable modular polynomials and general good Hecke operators match Magma",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
mp = __import__(
    "sagejs.modular_forms.modular_polynomial",
    fromlist=["classical_modular_polynomial"],
)
phi2 = mp.classical_modular_polynomial(2)
phi3 = mp.classical_modular_polynomial(3)
phi5 = mp.classical_modular_polynomial(5)
assert phi2.terms() == (
    (0,0,-157464000000000), (0,1,8748000000), (0,2,-162000),
    (0,3,1), (1,1,40773375), (1,2,1488), (2,2,-1),
)
assert phi3.coefficient(0,4) == 1
assert phi3.coefficient(3,3) == -1
assert phi3.coefficient(1,1) == -770845966336000000
assert phi5.coefficient(0,0) == 141359947154721358697753474691071362751004672000
assert phi5.coefficient(5,5) == -1
S37 = SupersingularModule(37)
assert S37.T(3).matrix() == matrix(ZZ, [[2,1,1],[1,0,3],[1,3,0]])
assert S37.T(5).matrix() == matrix(ZZ, [[2,2,2],[2,1,3],[2,3,1]])
assert S37.T(3).commutes_with(S37.T(5))
S67 = SupersingularModule(67)
assert S67.T(3).matrix().charpoly().coefficients() == [8,34,31,-14,-15,0,1]
assert S67.T(5).matrix().charpoly().coefficients() == [-108,-432,135,110,-20,-6,1]
try:
    mp.classical_modular_polynomial(19, max_unknowns=1)
    assert False
except MemoryError:
    pass
[phi3, phi5, S37.T(3).matrix(), S37.T(5).matrix()]
`);
      assert.equal(
        result.repr,
        "[Classical modular polynomial Phi_3 of bidegree 4, " +
          "Classical modular polynomial Phi_5 of bidegree 6, " +
          "[2 1 1]\n[1 0 3]\n[1 3 0], " +
          "[2 2 2]\n[2 1 3]\n[2 3 1]]",
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
