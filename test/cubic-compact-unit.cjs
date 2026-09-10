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
assert m.kernel_residual([E, -E], [[(0, 1), (0, 2)], [(0, 3)]], 1) == [0]

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
