#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function runSageJs(source, environment = {}, timeout = 180_000) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-public-sparse-random-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [resolve(root, "bin", "sagejs"), "--python", script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      timeout,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const semanticWitness = String.raw`
def snapshot(base):
    set_random_seed(123)
    value = random_matrix(base, 3, 4, density=0.4)
    return value.list(), random()


expected = [
    (ZZ, [0, 0, -1, 0, 0, 0, -4, 0, 5, 0, 0, 0]),
    (QQ, [0, 0, 1, 0, 0, 0, 0, QQ(1)/2, 0, 0, 0, 1]),
    (GF(2), [1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0]),
    (GF(7), [0, 0, 4, 0, 2, 0, 0, 0, 0, 0, 2, 0]),
]
for base, entries in expected:
    value, next_random = snapshot(base)
    assert value == [base(entry) for entry in entries], (base, value)
    assert 0 <= next_random < 1

# Two draws into three columns force collisions for this seed. These fixed
# witnesses distinguish ZZ's keep-first rule from QQ/GF(p)'s replacement rule
# and pin each rule's different random-stream consumption.
collision_expected = [
    (ZZ, [-13, 0, 0], 0.5214411122724414),
    (QQ, [2, 0, 0], 0.5072056364733726),
    (GF(7), [3, 0, 0], 0.4537145944777876),
]
for base, entries, next_random in collision_expected:
    set_random_seed(1)
    value = random_matrix(base, 1, 3, density=0.99)
    assert value.list() == [base(entry) for entry in entries]
    assert random() == next_random

for base in [ZZ, QQ, GF(7)]:
    assert random_matrix(base, 4, 10, density=-1).is_zero()
    assert random_matrix(base, 4, 10, density=0.09).is_zero()
    assert all(random_matrix(base, 8, density=2).list())
    set_random_seed(20260812)
    left = random_matrix(base, 20, 30, density=0.2)
    set_random_seed(20260812)
    right = random_matrix(base, 20, 30, density=0.2)
    assert left == right

assert random_matrix(GF(2), 4, 10, density=-1).is_zero()
assert all(random_matrix(GF(2), 8, density=2).list())
set_random_seed(20260812)
left = random_matrix(GF(2), 20, 30, density=0.2)
set_random_seed(20260812)
right = random_matrix(GF(2), 20, 30, density=0.2)
assert left == right

bounded = random_matrix(ZZ, 20, 30, density=0.2, x=-7, y=8)
assert all(-7 <= value < 8 for value in bounded.list())
rational = random_matrix(QQ, 20, 30, density=0.2, num_bound=5, den_bound=5)
assert any(value.denominator() > 1 for value in rational.list())
set_random_seed(7)
huge = random_matrix(QQ, 6, 8, density=0.5,
                     num_bound=2**80, den_bound=2**97)
assert any(value.denominator() > 2**64 for value in huge.list())
set_random_seed(7)
skewed = random_matrix(QQ, 6, 8, density=0.5,
                       num_bound=2**17, den_bound=2**521)
assert any(value.denominator() > 2**256 for value in skewed.list())
integral = random_matrix(QQ, 6, 8, density=0.5,
                         num_bound=2**80, den_bound=0)
assert all(value.denominator() == 1 for value in integral.list())
reciprocal = random_matrix(QQ, 20, 30, density=0.2, distribution="1/n")
assert any(value.denominator() > 1 for value in reciprocal.list())
# Sage accepts arbitrary non-'1/n' names as aliases for the default bounded
# rational distribution.
assert random_matrix(QQ, 3, density=0.2, distribution="uniform").base_ring() is QQ
assert random_matrix(QQ, 3, density=0.2, distribution="anything").base_ring() is QQ

# Sage's public constructor distinguishes an omitted/None density from an
# explicit numeric density. The former passes nonzero=False to full-density
# rational generation; the latter passes nonzero=True. These seeded witnesses
# pin both bounded and reciprocal-uniform behavior, including the next word.
set_random_seed(0)
bounded_allow_zero = random_matrix(QQ, 3, num_bound=2, den_bound=2)
assert bounded_allow_zero.list() == [
    QQ(1), QQ(0), QQ(1) / 2,
    QQ(0), QQ(0), QQ(-1),
    QQ(0), QQ(-1) / 2, QQ(1),
]
assert random() == 0.2723426336888224
set_random_seed(0)
bounded_nonzero = random_matrix(QQ, 3, density=1, num_bound=2, den_bound=2)
assert all(bounded_nonzero.list())
assert bounded_nonzero.list() == [
    QQ(1), QQ(1) / 2, QQ(-1),
    QQ(-1) / 2, QQ(1), QQ(-1),
    QQ(2), QQ(2), QQ(-1),
]
assert random() == 0.5716368802823126
set_random_seed(0)
reciprocal_allow_zero = random_matrix(QQ, 3, distribution="1/n")
assert reciprocal_allow_zero.list() == [
    QQ(-1) / 2, QQ(1) / 9, QQ(5),
    QQ(-1) / 3, QQ(0), QQ(0),
    QQ(-3) / 2, QQ(-1), QQ(-1) / 2,
]
assert random() == 0.2104770359583199

# Explicit density=None is identical to omission across every optimized exact
# domain, including random-stream publication.
for base in [ZZ, QQ, GF(2), GF(7)]:
    set_random_seed(31)
    omitted = random_matrix(base, 3)
    omitted_next = random()
    set_random_seed(31)
    explicit_none = random_matrix(base, 3, density=None)
    assert explicit_none == omitted
    assert random() == omitted_next

largest_word_prime = GF(4294967291)
word_prime = random_matrix(largest_word_prime, 4, 5, density=0.6)
assert word_prime.base_ring() is largest_word_prime
assert word_prime._has_nmod_matrix_resource()

set_random_seed(19)
nan_binary = random_matrix(GF(2), 2, 3, density=float("nan"))
assert nan_binary.is_zero()

binary = random_matrix(GF(2), 200, 200, density=0.1)
assert max(sum(1 for value in binary.row(row) if value) for row in range(200)) > 20

assert random_matrix(ZZ, 3, density=0.2)._has_fmpz_matrix_resource()
assert random_matrix(QQ, 3, density=0.2)._has_fmpq_matrix_resource()
assert random_matrix(GF(2), 3, density=0.2)._has_packed_prime_storage()

class BadDensity:
    def __float__(self):
        raise RuntimeError("density coerced")


for rows, columns in [(0, 0), (0, 5), (5, 0)]:
    value = random_matrix(GF(2), rows, columns, density=BadDensity())
    assert (value.nrows(), value.ncols(), len(value.list())) == (rows, columns, 0)

for base in [ZZ, QQ, GF(7)]:
    try:
        random_matrix(base, 0, 5, density=BadDensity())
    except RuntimeError as error:
        assert "density coerced" in str(error)
    else:
        raise AssertionError("row-draw density was not coerced")

class BadBound:
    def __add__(self, other):
        raise RuntimeError("bound coerced")


for density in [-1, 0]:
    random_matrix(QQ, 2, 3, density=density, num_bound=BadBound())
for rows, columns in [(0, 5), (5, 0), (2, 3)]:
    try:
        random_matrix(QQ, rows, columns, density=0.01, num_bound=BadBound())
    except RuntimeError as error:
        assert "bound coerced" in str(error)
    else:
        raise AssertionError("positive-density QQ bound was not coerced")

print("public-sparse-random-ok")
`;

assert.equal(runSageJs(semanticWitness), "public-sparse-random-ok");
assert.equal(
  runSageJs(semanticWitness, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-sparse-random-ok",
);

const parityWitness = String.raw`
def capture(base, seed, **kwds):
    set_random_seed(seed)
    value = random_matrix(base, 4, 6, **kwds)
    return value.list(), random()


cases = [
    capture(ZZ, 1, density=0.99),
    capture(QQ, 1, density=0.99),
    capture(GF(7), 1, density=0.99),
    capture(GF(4294967291), 7, density=0.5),
    capture(GF(2), 19, density=float("nan")),
    capture(QQ, 0, num_bound=2, den_bound=2),
    capture(QQ, 0, density=1, num_bound=2, den_bound=2),
    capture(QQ, 0, distribution="1/n"),
    capture(ZZ, 31, density=None),
    capture(QQ, 31, density=None),
    capture(GF(2), 31, density=None),
    capture(GF(7), 31, density=None),
]
for seed in [0, 1, 7, 31, 2**32 - 1]:
    cases.extend([
        capture(QQ, seed, density=0.5, num_bound=5, den_bound=5),
        capture(QQ, seed, density=0.5,
                num_bound=2**80, den_bound=2**97),
        capture(QQ, seed, density=0.5,
                num_bound=2**17, den_bound=2**521),
        capture(QQ, seed, density=0.5,
                num_bound=2**80, den_bound=0),
        capture(QQ, seed, density=0.99, distribution="1/n"),
        capture(QQ, seed, distribution="1/n"),
    ])
print(repr(cases))
`;
assert.equal(
  runSageJs(parityWitness),
  runSageJs(parityWitness, { SAGEJS_NATIVE_DISABLE: "1" }),
  "native and disabled-native sparse results and next RNG state differ",
);

// Variable-size FLINT entries must be allocated and destroyed by the same
// native addon.  This subprocess regression catches the allocator-domain bug
// that occurs if a generated resource is published directly and later mutated
// by the separately linked host addon. The kernel-private result is now copied
// into host-owned storage before publication, so a public assignment may grow
// its limbs and the host owner may deterministically close it. Explicit close
// is deliberately repeated to verify idempotent ownership cleanup.
assert.equal(
  runSageJs(String.raw`
set_random_seed(7)
value = random_matrix(
    QQ, 1, 1, density=1,
    num_bound=2**80, den_bound=2**97,
)
assert abs(value[0, 0].numerator()) > 2**64
assert value[0, 0].denominator() > 2**64
value[0, 0] = QQ(2**1009 + 123) / QQ(2**1217 + 321)
assert abs(value[0, 0].numerator()) > 2**1000
assert value[0, 0].denominator() > 2**1200
resource = value._rational_resource()
resource.close()
resource.close()
assert resource.closed
print("wide-entry-close-ok")
`),
  "wide-entry-close-ok",
);

// The kernel allocates before advancing its private LCG state, and the host
// publishes that state only after the host-owned copy succeeds. An allocation
// failure therefore leaves the next observable random word unchanged.
assert.equal(
  runSageJs(String.raw`
set_random_seed(123)
expected = random()
set_random_seed(123)
try:
    random_matrix(
        QQ, 2**63, 2, density=0.5,
        num_bound=5, den_bound=5,
    )
except OverflowError:
    pass
else:
    raise AssertionError("expected rational matrix allocation failure")
assert random() == expected
print("failed-allocation-rng-ok")
`),
  "failed-allocation-rng-ok",
);

// A successful private allocation is not enough to publish the RNG state:
// the host-owned deep copy must also succeed.  Replace that exact publication
// boundary with a deterministic failure and make several calls in one stream.
// Each public random word must match the untouched reference stream, proving
// that neither the private generator nor its cleanup commits hidden state.
assert.equal(
  runSageJs(String.raw`
import sagejs.ffi.flint as flint

set_random_seed(20260812)
expected = [random() for _index in range(6)]
set_random_seed(20260812)

original_copy = flint.fmpq_matrix_copy
copy_attempts = 0

def fail_copy(source):
    global copy_attempts
    copy_attempts += 1
    raise RuntimeError("injected host-copy failure")

flint.fmpq_matrix_copy = fail_copy
try:
    for expected_word in expected:
        try:
            random_matrix(
                QQ, 5, 7, density=0.4,
                num_bound=2**80, den_bound=2**97,
            )
        except RuntimeError as error:
            assert "injected host-copy failure" in str(error)
        else:
            raise AssertionError("expected host-copy failure")
        assert random() == expected_word
finally:
    flint.fmpq_matrix_copy = original_copy

assert copy_attempts == len(expected)
print("failed-host-copy-rng-ok")
`),
  "failed-host-copy-rng-ok",
);

// Run the same semantic distinction against Sage when the configured oracle
// is present. Exact entries intentionally differ because Sage.js has its own
// reproducible stream; zero admissibility and None/omission behavior do not.
const sage = process.env.SAGE || "/home/user/bin/sagelite";
if (existsSync(sage)) {
  const sageOracle = String.raw`
set_random_seed(0)
assert any(value == 0 for value in random_matrix(
    QQ, 3, num_bound=2, den_bound=2
).list())
set_random_seed(0)
assert all(random_matrix(
    QQ, 3, density=1, num_bound=2, den_bound=2
).list())
set_random_seed(0)
assert any(value == 0 for value in random_matrix(
    QQ, 3, distribution="1/n"
).list())
for base in [ZZ, QQ, GF(2), GF(7)]:
    set_random_seed(31)
    omitted = random_matrix(base, 3)
    set_random_seed(31)
    assert random_matrix(base, 3, density=None) == omitted
`;
  const oracle = spawnSync(sage, ["-c", sageOracle], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
  });
  if (oracle.error) throw oracle.error;
  assert.equal(oracle.status, 0, oracle.stderr || oracle.stdout);
}

const trace = runSageJs(
  String.raw`
random_matrix(ZZ, 4, density=0.25)
random_matrix(QQ, 4, density=0.25)
random_matrix(GF(2), 4, density=0.25)
random_matrix(GF(7), 4, density=0.25)
`,
  { SAGEJS_NATIVE_TRACE: "1" },
);
assert.match(
  trace,
  /Matrix\.random_matrix ZZ 4x4 -> typed-python-isolated-sparse/,
);
assert.match(
  trace,
  /Matrix\.random_matrix QQ 4x4 -> typed-python-isolated-sparse/,
);
assert.match(
  trace,
  /Matrix\.random_matrix GF\(2\) 4x4 -> typed-python-isolated-sparse/,
);
assert.match(
  trace,
  /Matrix\.random_matrix GF\(7\) 4x4 -> typed-python-isolated-sparse/,
);

// The contract test carries the full Sage oracle. Re-run it here when its
// configured Sage executable exists so this public dispatch cannot drift from
// the independently recorded domain policies.
const contract = join(root, "test", "linear-sparse-random.cjs");
if (existsSync(contract)) {
  const result = spawnSync(process.execPath, [contract], {
    cwd: root,
    encoding: "utf8",
    timeout: 240_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

console.log("public sparse random matrices passed");
