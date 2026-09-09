// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

test("exact conditional-center oracle agrees with exhaustive cubic ellipsoids", () => {
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import importlib.util, itertools, math, random, sys
from fractions import Fraction as Q
spec = importlib.util.spec_from_file_location('fp', sys.argv[1])
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)
rng = random.Random(20260909)
for _ in range(500):
    center = Q(rng.randrange(-20, 21), rng.randrange(1, 8))
    radius = Q(rng.randrange(100), rng.randrange(1, 8))
    lo, hi = fp.interval(center, radius)
    expected = [x for x in range(-31, 32) if (x + center)**2 <= radius]
    assert list(range(lo, hi+1)) == expected
    ordered = list(fp.centered_order(lo, hi, center))
    assert sorted(ordered) == expected and len(set(ordered)) == len(ordered)
assert fp.interval(Q(1,2), Q(1,4)) == (-1,0)
assert fp.interval(Q(1,2), Q(1,4)-Q(1,2**300)) == (0,-1)
assert fp.interval(Q(1,2), -1) == (1,0)
assert list(fp.centered_order(-2, 2, Q(1,2))) == [0,1,-1,2,-2]
for k in [0,1,2,37,2**300+1]:
    for degree in [2,3]:
        for shift in [Q(0), Q(1,7), Q(-1,7)]:
            value = k**degree + shift
            if value < 0: continue
            root = fp.ceil_root(value, degree)
            assert root**degree >= value
            assert root == 0 or (root-1)**degree < value
grams = [(1,0,0,1,0,1), (1,2,-2,5,-3,6)]
for _ in range(80):
    u = [[rng.randrange(1,4), rng.randrange(-1,2), rng.randrange(-1,2)],
         [0,rng.randrange(1,4),rng.randrange(-1,2)], [0,0,rng.randrange(1,4)]]
    g = [[sum(u[k][i]*u[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    grams.append((g[0][0],g[0][1],g[0][2],g[1][1],g[1][2],g[2][2]))
for gram in grams:
    bound = rng.randrange(2,25)
    expected = set(fp.box_points(gram,bound))
    counters = {}
    found = list(fp.points(gram,bound,counters=counters))
    assert len(found) == len(set(found)) and set(found) == expected
    assert counters['primitive'] == len(found)
    integer_counters = {}
    assert list(fp.integer_points(gram,bound,counters=integer_counters)) == found
    assert integer_counters == counters
    # Shell decomposition and generator suspension preserve exact membership/order.
    half = bound // 2
    assert set(fp.points(gram,half)) | set(fp.points(gram,bound,lower=half)) == expected
    assert not (set(fp.points(gram,half)) & set(fp.points(gram,bound,lower=half)))
    assert list(fp.integer_points(gram,bound,lower=half)) == list(fp.points(gram,bound,lower=half))
    iterator = fp.points(gram,bound)
    prefix = list(itertools.islice(iterator,1)) + list(itertools.islice(iterator,4))
    assert prefix + list(iterator) == found
    large = 2**300 + 17
    assert list(fp.points(tuple(x*large for x in gram),bound*large)) == found
    assert list(fp.integer_points(tuple(x*large for x in gram),bound*large)) == found
for gram in [(0,0,0,1,0,1), (1,2,0,1,0,1), (1,0,0,1,0,-1)]:
    try: list(fp.points(gram,10))
    except ValueError: pass
    else: raise AssertionError('non-SPD input accepted')
    try: list(fp.integer_points(gram,10))
    except ValueError: pass
    else: raise AssertionError('integer traversal accepted non-SPD input')
for bound, lower in [(1,-1),(0,1)]:
    try: list(fp.points(grams[0],bound,lower))
    except ValueError: pass
    else: raise AssertionError('invalid shell accepted')
    try: list(fp.integer_points(grams[0],bound,lower))
    except ValueError: pass
    else: raise AssertionError('integer traversal accepted invalid shell')
try: list(fp.points(grams[0],10,node_limit=1))
except ValueError: pass
else: raise AssertionError('budget not enforced')
try: list(fp.integer_points(grams[0],10,node_limit=1))
except ValueError: pass
else: raise AssertionError('integer budget not enforced')
try: list(fp.box_points(grams[0],10,node_limit=1))
except ValueError: pass
else: raise AssertionError('box budget not enforced')
assert list(fp.integer_points(grams[0],0)) == list(fp.points(grams[0],0)) == []
assert fp.volume_bound((1,0,0,1,0,10**6),Q(2)) == 2  # 2D branch.
assert fp.volume_bound((1,0,0,1,0,1),Q(2)) == 2      # 3D branch.
print('500 exact intervals; 82 exhaustive SPD ellipsoids, shells, 300-bit scaling, guards passed')
`, resolve(__dirname, "../bench/class-unit-groups/diagnose-cubic-exact-fp.py")], {
    encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
});
