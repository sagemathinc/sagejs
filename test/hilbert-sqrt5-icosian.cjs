// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const psageFixture = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/mestre-hilbert-sqrt5-psage.json"),
    "utf8",
  ),
);

test("the Q(sqrt(5)) psage fixture has pinned source provenance", () => {
  assert.equal(psageFixture.schema, "sagejs.mestre-hilbert-sqrt5-psage/v1");
  assert.equal(
    psageFixture.source.commit,
    "5adc61d280c949343b4ef661654611f01d8dcb19",
  );
  assert.deepEqual(
    psageFixture.levels.map((record) => record.dimension),
    [2, 7, 14, 35],
  );
});

test(
  "Q(sqrt(5)) icosian module reproduces psage's norm-31 operators",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import (
    HilbertModularFormsQsqrt5,
    Qsqrt5PrimeIdeal,
    sqrt5_prime_ideals,
)

ideals31 = sqrt5_prime_ideals(31)
assert tuple(P.omega_residue() for P in ideals31) == (13,19)
N31 = Qsqrt5PrimeIdeal.from_generator(31, -2, 5)
assert N31.omega_residue() == 19
assert N31.conjugate().omega_residue() == 13
assert N31.contains(-2, 5)

M = HilbertModularFormsQsqrt5(N31)
assert M.dimension() == 2
assert M.weight() == (2,2)
assert M.orbit_representatives() == ((0,1),(1,1))
assert M.orbit_sizes() == (12,20)
assert M.stabilizer_orders() == (10,6)
assert M.mass_weights() == (QQ(1)/10, QQ(1)/6)
assert M.T(2).matrix() == matrix(ZZ, [[0,5],[3,2]])
assert M.T(3).matrix() == matrix(ZZ, [[5,5],[3,7]])
assert M.T(5).matrix() == matrix(ZZ, [[1,5],[3,3]])

P11a = Qsqrt5PrimeIdeal.from_generator(11, 3, 1)
P11b = Qsqrt5PrimeIdeal.from_generator(11, 3, 2)
assert M.T(P11a).matrix() == matrix(ZZ, [[7,5],[3,9]])
assert M.T(P11b).matrix() == matrix(ZZ, [[2,10],[6,6]])
assert M.T(2).commutes_with(M.T(3))
assert M.T(5).commutes_with(M.T(P11a))
assert M.T(P11a).commutes_with(M.T(P11b))
assert M.T(2).row(0) == M.hecke_row(2, 0) == ((1,5),)
assert M.T(2) * vector(ZZ,[1,1]) == vector(ZZ,[5,5])
assert M.is_cuspidal([5,-3])
[M, M.T(2).matrix(), M.T(P11a).matrix()]
`);
      assert.equal(
        result.repr,
        "[Hilbert modular forms of parallel weight (2,2) over Q(sqrt(5)), " +
          "level norm 31, dimension 2, [0 5]\n[3 2], [7 5]\n[3 9]]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "icosian sparse T2 matches the degree-seven psage fixture and scales",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import HilbertModularFormsQsqrt5, Qsqrt5PrimeIdeal

N389 = Qsqrt5PrimeIdeal.from_generator(389, -5, 18)
M = HilbertModularFormsQsqrt5(N389)
T2 = M.T(2)
expected = matrix(ZZ, [
    [0,3,0,1,1,0,0],
    [3,0,0,0,1,0,1],
    [0,0,2,1,0,1,1],
    [1,0,1,0,1,0,2],
    [1,1,0,1,0,1,1],
    [0,0,2,0,2,1,0],
    [0,1,1,2,1,0,0],
])
assert M.dimension() == 7
assert T2.is_sparse() and T2.nonzero_count() == 26
assert T2.matrix() == expected
R = PolynomialRing(ZZ, 'x')
x = R.gen()
assert T2.matrix().charpoly() == (x-5)*(x*x+5*x+5)*(x**4-3*x**3-3*x*x+10*x-4)
assert M.T(3).matrix().charpoly() == (x-10)*(x*x+3*x-9)*(x**4-5*x**3+3*x*x+6*x-4)
assert M.T(5).matrix().charpoly() == (x-6)*(x*x+4*x-1)*(x*x-x-4)**2
assert M.T('11a').matrix().charpoly() == (x-12)*(x+3)**2*(x**4-17*x*x+68)
assert M.T('11b').matrix().charpoly() == (x-12)*(x*x+5*x+5)*(x**4-x**3-23*x*x+18*x+52)
assert all(M.T(a).commutes_with(M.T(b)) for a in [2,3,5,'11a','11b'] for b in [2,3,5,'11a','11b'])

dims = []
for p, a, b, expected_dimension in [(809,-7,26,14),(2011,-11,41,35)]:
    H = HilbertModularFormsQsqrt5(Qsqrt5PrimeIdeal.from_generator(p,a,b))
    assert H.dimension() == expected_dimension
    assert H.T(2).row_sums() == tuple(5 for _ in range(expected_dimension))
    dims.append(H.dimension())
(T2.matrix().charpoly(), tuple(dims))
`);
      assert.equal(
        result.repr,
        "(x^7 - 3*x^6 - 23*x^5 + 45*x^4 + 131*x^3 - 125*x^2 - 170*x + 100, (14, 35))",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "icosian public boundary rejects invalid ideals, bad indices, and bad rows",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import HilbertModularFormsQsqrt5, Qsqrt5PrimeIdeal

failures = []
for thunk in [
    lambda: Qsqrt5PrimeIdeal(31, 7),
    lambda: Qsqrt5PrimeIdeal(2, 0),
    lambda: HilbertModularFormsQsqrt5((31,19)).T(7),
    lambda: HilbertModularFormsQsqrt5((31,19)).hecke_row(2, 2),
]:
    try:
        thunk()
        failures.append('accepted')
    except (ValueError, TypeError, IndexError, NotImplementedError):
        failures.append('rejected')
failures
`);
      assert.equal(result.repr, "['rejected', 'rejected', 'rejected', 'rejected']");
    } finally {
      await session.close();
    }
  },
);
