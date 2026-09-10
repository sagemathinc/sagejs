// sagejs-test-tier: specialized
// Requires CPython with SymPy; independent research oracle, not production.
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

test("compact-unit replay checks exact ideal identities without dependency powers", () => {
  const script = String.raw`
import importlib.util
from fractions import Fraction
from itertools import product
from pathlib import Path
import random

p = Path("bench/class-unit-groups/cubic-compact-unit.py")
spec = importlib.util.spec_from_file_location("compact", p)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
f = [-1, -1, 0, 1]
E = 2**260 + 17
def coords(n, d=1):
    return [[n, d], [0, 1], [0, 1]]
def ideal(n, e=1):
    return [[n, 0, 0], [0, n, 0], [0, 0, n], e]
def rejected(fn, reason=None):
    try:
        fn()
    except ValueError as error:
        if reason is not None:
            assert reason in str(error), str(error)
        return
    raise AssertionError("invalid witness was accepted")

good = [[coords(2), E, [ideal(2)]], [coords(3), E, [ideal(3)]],
        [coords(6), -E, [ideal(2), ideal(3)]]]
result = m.replay(f, good)
assert result["unit_membership_proven"]
assert not result["fundamentality_proven"] and not result["class_group_proven"]
assert result["expanded_dependency_powers"] == 0
assert result["maximum_exponent_bits"] == 261
assert m.replay(f, [[[[0, 1], [1, 1], [0, 1]], E, []]])["unit_membership_proven"]
assert m.replay(f, [[coords(1, 2), E, [ideal(2, -1)]],
                    [coords(2), E, [ideal(2)]]])["unit_membership_proven"]
bad = [[coords(2), E + 1, [ideal(2)]]] + good[1:]
rejected(lambda: m.replay(f, bad))
rejected(lambda: m.replay(f, [[coords(3), E, [ideal(2)]]] + good[1:]))
rejected(lambda: m.replay(f, good[:-1]))
rejected(lambda: m.replay(f, [[coords(0), 0, []]]))
rejected(lambda: m.replay([0, -1, 0, 1], good))
rejected(lambda: m.replay(f, [[coords(2), True, [ideal(2)]]]))
rejected(lambda: m.CubicIdealReplay(f).ideal([[2, 0, 0], [0, 1, 0], [0, 0, 1]]))
# In the nonmaximal order ZZ[2*a], this is a noninvertible ideal.
rejected(lambda: m.CubicIdealReplay([-8, -4, 0, 1]).ideal(
    [[2, 0, 0], [0, 1, 0], [0, 0, 1]]), "ideal is not invertible")
rejected(lambda: m.kernel_residual([E], [[(1, 2)]], 1))
rejected(lambda: m.kernel_residual([E], [], 1))
rejected(lambda: m.signed_log_interval([1], [(2, 1)]))
rejected(lambda: m.signed_log_interval([1], []))
rejected(lambda: m.positive_log_bounds(0))
rejected(lambda: m.positive_log_bounds(-1))
rejected(lambda: m.positive_log_bounds(1, 8))
assert m.kernel_residual([E, -E], [[(0, 1), (0, 2)], [(0, 3)]], 1) == [0]

# The proved unit gap upgrades only sufficiently narrow zero-containing
# intervals. Strictly nonzero intervals inside the gap contradict unit
# membership; a numerical near-zero observation alone is not a certificate.
for scale in [1, 5, 10, 2**128, 2**521]:
    edge = scale // 5
    assert m.classify_unit_log_interval(-edge, edge, scale) == "torsion"
    assert m.classify_unit_log_interval(0, 0, scale) == "torsion"
    assert m.classify_unit_log_interval(-edge-1, edge, scale) == "inconclusive"
    assert m.classify_unit_log_interval(-edge, edge+1, scale) == "inconclusive"
    assert m.classify_unit_log_interval(edge+1, edge+2, scale) == "nontorsion"
    assert m.classify_unit_log_interval(-edge-2, -edge-1, scale) == "nontorsion"
    if edge:
        rejected(lambda: m.classify_unit_log_interval(1, edge, scale), "unit gap")
        rejected(lambda: m.classify_unit_log_interval(-edge, -1, scale), "unit gap")
for args in [(0,0,0), (0,0,-1), (1,0,5), (False,0,5),
             (0,True,5), (0,0,True), (0.0,0,5), (0,0,Fraction(5))]:
    rejected(lambda: m.classify_unit_log_interval(*args))

# Non-power order basis: theta=2*a, with 1,a,a^2 as rational columns.
from sympy import Matrix
g = [-8, -4, 0, 1]
def rational_columns(B):
    return [[[int(B[i,j].p), int(B[i,j].q)] for i in range(3)] for j in range(3)]
B = Matrix.diag(1, Fraction(1,2), Fraction(1,4))
maximal_basis = rational_columns(B)
oracle = m.CubicIdealReplay(g, maximal_basis)
assert oracle.identity == [1,0,0]
assert oracle.multiply([0,1,0], [0,0,1]) == [1,1,0]
assert m.replay(g, good, maximal_basis)["unit_membership_proven"]
assert m.replay(g, [[[[0,1],[1,1],[0,1]], E, []]], maximal_basis)["unit_membership_proven"]
# Stable under theta is insufficient for stability under this larger order.
theta_order_lattice = [[1,0,0],[0,2,0],[0,0,4]]
rejected(lambda: oracle.ideal(theta_order_lattice), "not an ideal")
rejected(lambda: m.CubicIdealReplay(g, rational_columns(Matrix.diag(2,1,1))), "identity")
rejected(lambda: m.CubicIdealReplay(g, rational_columns(Matrix.diag(1,Fraction(1,3),1))), "closed")
rejected(lambda: m.CubicIdealReplay(g, rational_columns(Matrix.zeros(3))), "singular")
rejected(lambda: m.CubicIdealReplay(g, [[[1,0]]*3]*3), "rational basis")

# Exact basis-equivariance, including bases in which 1 is not a basis vector.
basis_rng = random.Random(271828)
for _ in range(30):
    U = Matrix.eye(3)
    for __ in range(6):
        i,j = basis_rng.sample(range(3),2)
        U[:,i] = U[:,i] + basis_rng.randrange(-3,4)*U[:,j]
    inverse = U.inv()
    changed = m.CubicIdealReplay(g, rational_columns(B*U))
    assert Matrix(changed.identity) == inverse*Matrix([1,0,0])
    for i in range(3):
        for j in range(3):
            v,w = Matrix.eye(3)[:,i],Matrix.eye(3)[:,j]
            assert Matrix(changed.multiply(v,w)) == inverse*Matrix(oracle.multiply(U*v,U*w))
    alpha = inverse*Matrix([0,1,0])
    witness = [[[[int(v),1] for v in alpha],E,[]]]
    assert m.replay(g,witness,rational_columns(B*U))["unit_membership_proven"]

# High-precision independent numerical oracle for the rational interval
# implementation. Numerical comparisons are tests, not its proof argument.
import mpmath as mp
mp.mp.dps = 180
log_rng = random.Random(161803)
values = [Fraction(1),Fraction(2),Fraction(1,2),Fraction(2**160+1,2**160),
          Fraction(2**160-1,2**160)]
for _ in range(60):
    e = log_rng.randrange(-5000,5001)
    v = Fraction(log_rng.randrange(1,10**9),log_rng.randrange(1,10**9))
    values.append(v*2**e if e>=0 else v/Fraction(2**-e))
for bits in [16,32,64,128]:
    for value in values:
        lo,hi = m.positive_log_bounds(value,bits)
        reference = mp.log(mp.mpf(value.numerator)/value.denominator)*2**bits
        assert lo <= reference <= hi, (bits,value,lo,reference,hi)
        assert hi-lo <= 4*(bits+1)*(abs(value.numerator.bit_length()-value.denominator.bit_length())+2)
# A second, exact rational-series enclosure fits inside the fixed-point
# enclosure. This checks rounding against rigorous bounds, not just numerics.
for bits in [16,32,64]:
    for value in [Fraction(1),Fraction(101,100),Fraction(3,2),Fraction(2)]:
        y = (value-1)/(value+1)
        lower = 2*sum(y**(2*j+1)/(2*j+1) for j in range(bits))
        upper = lower + 2*y**(2*bits+1)/((2*bits+1)*(1-y*y))
        lo,hi = m.positive_log_bounds(value,bits)
        assert Fraction(lo,2**bits) <= lower <= upper <= Fraction(hi,2**bits)
root = mp.findroot(lambda x: x**3-x-1,1.3)
for bits in [32,64,128]:
    lo,hi = m.compact_real_log_bounds(oracle,[[[0,1],[1,1],[0,1]]],[E],bits)
    reference = E*mp.log(root)*2**bits
    assert 0 < lo <= reference <= hi
    zero = m.compact_real_log_bounds(oracle,[[[0,1],[1,1],[0,1]]]*2,[E,-E],bits)
    assert zero[0] <= 0 <= zero[1]
    inverse_log = m.compact_real_log_bounds(oracle,[[[0,1],[1,1],[0,1]]],[-E],bits)
    assert inverse_log == (-hi,-lo)
# Authenticate the compact product before applying the torsion classifier.
# Moderate cancellation permits a narrow rigorous enclosure at these scales.
for bits in [32,64,128]:
    coordinates = [[[0,1],[1,1],[0,1]]]*2
    assert m.replay(g, [[coordinates[0],17,[]], [coordinates[1],-17,[]]],
                    maximal_basis)["unit_membership_proven"]
    lo,hi = m.compact_real_log_bounds(oracle,coordinates,[17,-17],bits)
    assert m.classify_unit_log_interval(lo,hi,2**bits) == "torsion"
    lo,hi = m.compact_real_log_bounds(oracle,coordinates[:1],[1],bits)
    assert m.classify_unit_log_interval(lo,hi,2**bits) == "nontorsion"
rejected(lambda: m.compact_real_log_bounds(oracle,[coords(0)],[1]), "zero")
rejected(lambda: m.compact_real_log_bounds(oracle,[coords(1)],[]), "dimension")

rng = random.Random(314159)
for _ in range(100):
    exponents = [rng.randrange(-1000, 1001) for _ in range(6)]
    intervals = []
    for i in range(6):
        left = Fraction(rng.randrange(-100, 100), 37)
        intervals.append((left, left + Fraction(rng.randrange(10), 101)))
    lo, hi = m.signed_log_interval(exponents, intervals)
    vertices = [sum(e * v for e, v in zip(exponents, values))
                for values in product(*intervals)]
    assert (lo, hi) == (min(vertices), max(vertices))
print("compact unit: exact rational/invertible-ideal replay, mutations, huge exponents, 100 interval vertex oracles pass")
`;
  const run = spawnSync("python3", ["-c", script], {
    cwd: resolve(__dirname, ".."), encoding: "utf8", timeout: 60000,
  });
  assert.equal(run.status, 0, `${run.error || ""}\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /100 interval vertex oracles pass/);
});
