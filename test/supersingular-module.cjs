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
  "Mestre T2 graph has a canonical portable level-37 basis",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S = SupersingularModule(37)
points, point_index = S.supersingular_points()
T2 = S.T(2)
assert S.dimension() == 3
assert [str(j) for j in points] == ["8", "10*a + 20", "27*a + 23"]
assert S.point_coordinates() == ((8,0),(20,10),(23,27))
assert S.basis_digest() == 'ab0d3799fc12661e698c973647320a3b2b0c023bfcdec50c1857625f1caf083d'
assert S.operator_digest(2) == '40aed650ea445b6ddee3393ad87e1c18791688b093df6cba1df9251e81ad86ec'
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
        "[[8, 10*a + 20, 27*a + 23], " +
          "[1 1 1]\n[1 0 2]\n[1 2 0], " +
          "[1 0 0]\n[0 1 0]\n[0 0 1]]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "mass-orthogonal cuspidal coordinates and normalized spectra are exact",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
S11 = SupersingularModule(11)
assert S11.point_coordinates() == ((0,0),(1,0))
assert S11.automorphism_weights() == (3,2)
assert S11.mass_weights() == (QQ(1)/3, QQ(1)/2)
assert S11.mass_inner_product([3,-2], S11.eisenstein_vector()) == 0
assert S11.is_cuspidal([3,-2])
assert S11.cuspidal_basis_matrix() == matrix(QQ, [[1,-QQ(2)/3]])
C11 = S11.cuspidal_operator(2)
assert C11.is_sparse()
assert C11.dimension() == 1
assert C11.matrix() == matrix(QQ, [[-2]])
assert C11.coordinates(C11.lift([7])) == vector(QQ, [7])
assert C11 * vector(QQ, [7]) == vector(QQ, [-14])

G11 = S11.isogeny_graph(2)
N11 = G11.normalized_adjacency_operator()
M11 = N11.matrix()
assert abs(float(M11[0,1] - M11[1,0])) < 1e-12
assert G11.spectrum() == (-2.0, 3.0)
assert G11.verify_ramanujan()

S37 = SupersingularModule(37)
projection = S37.cuspidal_projection([1,2,8])
assert S37.is_cuspidal(projection)
assert projection == vector(QQ, [-QQ(8)/3, -QQ(5)/3, QQ(13)/3])
assert S37.cuspidal_operator(2).matrix() == matrix(QQ, [[0,0],[-1,-2]])
(C11.matrix(), G11.spectrum(), projection)
`);
      assert.equal(
        result.repr,
        "([-2], (-2.0, 3.0), (-8/3, -5/3, 13/3))",
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
      for (const prime of [11, 37]) {
        const actualOperators = observed.filter((row) => row.prime === prime);
        const expectedOperators = expected.filter((row) => row.prime === prime);
        const degree = actualOperators[0].matrix.length;
        const permutations = (values) => {
          if (values.length === 0) return [[]];
          return values.flatMap((value, index) =>
            permutations(values.slice(0, index).concat(values.slice(index + 1))).map(
              (tail) => [value, ...tail],
            ),
          );
        };
        const ordering = permutations([...Array(degree).keys()]).find((order) =>
          actualOperators.every((actual, operatorIndex) => {
            const source = expectedOperators[operatorIndex];
            const conjugated = order.map((row) =>
              order.map((column) => source.matrix[row][column]),
            );
            return JSON.stringify(conjugated) === JSON.stringify(actual.matrix);
          }),
        );
        assert.ok(ordering, `no common basis permutation matches Magma at ${prime}`);
      }
      for (let index = 0; index < observed.length; index += 1) {
        assert.deepEqual(observed[index].charpoly, expected[index].charpoly);
      }

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
  "portable supersingular caches are bound and fail closed",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
import hashlib
import json

def clone(value):
    return json.loads(json.dumps(value,sort_keys=True))

def resign(record):
    body=dict(record)
    del body['content_sha256']
    encoded=json.dumps(body,sort_keys=True,separators=(',',':'))
    record['content_sha256']=hashlib.sha256(encoded.encode('utf-8')).hexdigest()

source=SupersingularModule(37)
record=source.operator_cache_record(2)
assert record['content_sha256']=='fca05138554f1af7338b9ec4dadde87b53601d7c3ac5d9cc668f64a75a4da0fd'
loaded=SupersingularModule(37)
loaded.load_operator_cache(clone(record))
assert loaded.basis_digest()==source.basis_digest()
assert loaded.operator_digest(2)==source.operator_digest(2)

tampered=clone(record)
tampered['rows'][1]=[[0,1],[1,2]]
try:
    SupersingularModule(37).load_operator_cache(tampered)
    assert False
except ValueError:
    pass
resign(tampered)
victim=SupersingularModule(37)
try:
    victim.load_operator_cache(tampered)
    assert False
except ArithmeticError:
    pass
assert victim.T(2).matrix()==source.T(2).matrix()

wrong_source=clone(record)
wrong_source['modular_polynomial_sha256']='0'*64
resign(wrong_source)
try:
    SupersingularModule(37).load_operator_cache(wrong_source)
    assert False
except ValueError:
    pass
(loaded.basis_digest(),loaded.operator_digest(2))
`);
      assert.equal(
        result.repr,
        "('ab0d3799fc12661e698c973647320a3b2b0c023bfcdec50c1857625f1caf083d', " +
          "'40aed650ea445b6ddee3393ad87e1c18791688b093df6cba1df9251e81ad86ec')",
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
