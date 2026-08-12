#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const modulePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "linear_algebra",
  "sparse_random.py",
);

function run(command, args, source, timeout = 180_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return result.stdout.trim();
}

function runSageJs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sparse-random-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    return run(resolve(root, "bin", "sagejs"), ["--python", script], "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const witness = String.raw`
class DrawSequence:
    def __init__(self, values):
        self.values = list(values)
        self.index = 0

    def next_value(self):
        value = self.values[self.index]
        self.index += 1
        return value

    def next_index(self, bound):
        value = self.next_value()
        assert 0 <= value < bound
        return value


def raises(exception, fragment, function):
    try:
        function()
    except exception as error:
        assert fragment in str(error), (fragment, str(error))
        return
    raise AssertionError("expected " + exception.__name__)


# ZZ, QQ, and small GF(p) make floor(density*ncols) draws in each row.
replace_spec = sparse.sage_row_sparse_random_spec(2, 5, 0.6)
assert replace_spec == (2, 5, "row-with-replacement", 0.6, 3, "replace")

# QQ and small GF(p) consume and publish a value on every draw, including a
# repeated column.  The final writes are canonical row-major unique positions.
indices = DrawSequence([1, 1, 3, 4, 4, 0])
replacement_values = DrawSequence([10, 11, 12, 13, 14, 15])
replacement = sparse.sample_sparse_random_spec(
    replace_spec,
    draw_index=indices.next_index,
    draw_nonzero=replacement_values.next_value,
)
assert replacement == (2, 5, (1, 3, 5, 9), (11, 12, 15, 14))
assert indices.index == replacement_values.index == 6

# Sage's dense ZZ implementation only asks for a value while the selected
# entry is still zero.  A collision therefore advances the column stream but
# not the nonzero-value distribution.
keep_spec = sparse.sage_row_sparse_random_spec(
    2, 5, 0.6, collision="keep-first"
)
indices = DrawSequence([1, 1, 3, 4, 4, 0])
first_values = DrawSequence([20, 21, 22, 23])
keep_first = sparse.sample_sparse_random_spec(
    keep_spec,
    draw_index=indices.next_index,
    draw_nonzero=first_values.next_value,
)
assert keep_first == (2, 5, (1, 3, 5, 9), (20, 21, 23, 22))
assert indices.index == 6
assert first_values.index == 4

# A positive density can round down to no row draws.  Neither the position
# stream nor the domain-specific distribution is touched.
unused_indices = DrawSequence([0])
unused_values = DrawSequence([1])
tiny_spec = sparse.sage_row_sparse_random_spec(3, 10, 0.09)
assert tiny_spec == (3, 10, "row-with-replacement", 0.09, 0, "replace")
assert sparse.sample_sparse_random_spec(
    tiny_spec,
    draw_index=unused_indices.next_index,
    draw_nonzero=unused_values.next_value,
) == (3, 10, (), ())
assert sparse.sample_sparse_random_spec(
    sparse.sage_row_sparse_random_spec(3, 10, -1),
    draw_index=unused_indices.next_index,
    draw_nonzero=unused_values.next_value,
) == (3, 10, (), ())
assert unused_indices.index == unused_values.index == 0

# Density is clamped above one.  Full row density is deterministic row-major,
# consumes exactly one domain draw per entry, and consumes no index draws.
full_values = DrawSequence(range(1, 7))
full = sparse.sample_sparse_random_spec(
    sparse.sage_row_sparse_random_spec(2, 3, 2),
    draw_index=unused_indices.next_index,
    draw_nonzero=full_values.next_value,
)
assert full == (2, 3, (0, 1, 2, 3, 4, 5), (1, 2, 3, 4, 5, 6))
assert unused_indices.index == 0
assert full_values.index == 6

# GF(2) instead makes one inclusive Bernoulli trial at every entry.  Full
# density still consumes the complete random stream, as Sage's M4RI path does.
binary_draws = DrawSequence([0.0, 0.25, 0.250001, 0.9, 0.1, 0.8])
binary = sparse.sample_sparse_random_spec(
    sparse.sage_binary_sparse_random_spec(2, 3, 0.25),
    draw_unit=binary_draws.next_value,
    one="one",
)
assert binary == (2, 3, (0, 1, 4), ("one", "one", "one"))
assert binary_draws.index == 6

all_binary_draws = DrawSequence([0.9] * 6)
assert sparse.sample_sparse_random_spec(
    sparse.sage_binary_sparse_random_spec(2, 3, 4),
    draw_unit=all_binary_draws.next_value,
) == (2, 3, (0, 1, 2, 3, 4, 5), (1, 1, 1, 1, 1, 1))
assert all_binary_draws.index == 6

no_binary_draws = DrawSequence([0.5])
assert sparse.sample_sparse_random_spec(
    sparse.sage_binary_sparse_random_spec(4, 4, 0),
    draw_unit=no_binary_draws.next_value,
) == (4, 4, (), ())
assert no_binary_draws.index == 0

# The M4RI implementation returns on an empty axis before coercing density;
# row-draw implementations coerce it first.
class BadDensity:
    def __float__(self):
        raise RuntimeError("density coerced")


assert sparse.sage_binary_sparse_random_spec(0, 7, BadDensity()) == (
    0, 7, "entry-bernoulli", 0.0, 0, "set-one"
)
assert sparse.sage_binary_sparse_random_spec(7, 0, BadDensity()) == (
    7, 0, "entry-bernoulli", 0.0, 0, "set-one"
)
raises(
    RuntimeError,
    "density coerced",
    lambda: sparse.sage_row_sparse_random_spec(0, 7, BadDensity()),
)

# A specification crosses the integration boundary once.  The storage adapter
# receives no materialized positions and owns all random draws and allocation.
constructor_calls = []


def constructor(rows, columns, sampling, density, draws_per_row, collision):
    constructor_calls.append(
        (rows, columns, sampling, density, draws_per_row, collision)
    )
    return [rows, columns, draws_per_row]


assert sparse.construct_from_sparse_random_spec(replace_spec, constructor) == [2, 5, 3]
assert constructor_calls == [replace_spec]
assert sparse.materialize_sparse_random_writes(replacement, 0) == [
    0, 11, 0, 12, 0,
    15, 0, 0, 0, 14,
]

# Reusing a seeded stream reproduces both selection and domain distribution.
def seeded_generator(seed):
    state = [seed]

    def next_word():
        state[0] = (1664525 * state[0] + 1013904223) % 4294967296
        return state[0]

    return next_word


def seeded_sample(seed):
    word = seeded_generator(seed)

    def draw_index(bound):
        return word() % bound

    def draw_rational():
        return (word() % 11 + 1, word() % 7 + 1)

    return sparse.sample_sparse_random_spec(
        sparse.sage_row_sparse_random_spec(8, 13, 0.4),
        draw_index=draw_index,
        draw_nonzero=draw_rational,
    )


assert seeded_sample(20260812) == seeded_sample(20260812)
assert seeded_sample(20260812) != seeded_sample(20260813)

# Invalid specifications and callback values fail before publishing storage.
raises(
    ValueError,
    "nonnegative",
    lambda: sparse.sage_row_sparse_random_spec(-1, 2, 0.5),
)
for invalid_dimension in [True, 1.5, "2"]:
    raises(
        TypeError,
        "dimensions must be integers",
        lambda invalid_dimension=invalid_dimension: sparse.sage_row_sparse_random_spec(
            invalid_dimension, 2, 0.5
        ),
    )

class IndexDimension:
    def __index__(self):
        return 3

class BadIndexDimension:
    def __index__(self):
        return "3"

class InstanceOnlyIndex:
    def __init__(self):
        self.__index__ = lambda: 3

assert sparse.sage_row_sparse_random_spec(
    IndexDimension(), 2, 0.5
)[:2] == (3, 2)
for invalid_dimension in [BadIndexDimension(), InstanceOnlyIndex()]:
    raises(
        TypeError,
        "dimensions must be integers",
        lambda invalid_dimension=invalid_dimension: sparse.sage_row_sparse_random_spec(
            invalid_dimension, 2, 0.5
        ),
    )
raises(
    ValueError,
    "collision",
    lambda: sparse.sage_row_sparse_random_spec(1, 2, 0.5, collision="unknown"),
)
raises(
    ValueError,
    "does not agree",
    lambda: sparse.construct_from_sparse_random_spec(
        (1, 10, "row-with-replacement", 0.2, 1, "replace"), constructor
    ),
)
raises(
    ValueError,
    "outside the matrix",
    lambda: sparse.sample_sparse_random_spec(
        sparse.sage_row_sparse_random_spec(1, 2, 0.5),
        draw_index=lambda bound: bound,
        draw_nonzero=lambda: 1,
    ),
)
for invalid_column in [True, 0.5, "0"]:
    raises(
        TypeError,
        "noninteger column",
        lambda invalid_column=invalid_column: sparse.sample_sparse_random_spec(
            sparse.sage_row_sparse_random_spec(1, 2, 0.5),
            draw_index=lambda bound, invalid_column=invalid_column: invalid_column,
            draw_nonzero=lambda: 1,
        ),
    )
raises(
    ValueError,
    "returned zero",
    lambda: sparse.sample_sparse_random_spec(
        sparse.sage_row_sparse_random_spec(1, 2, 0.5),
        draw_index=lambda bound: 0,
        draw_nonzero=lambda: 0,
    ),
)
raises(
    ValueError,
    "outside [0, 1]",
    lambda: sparse.sample_sparse_random_spec(
        sparse.sage_binary_sparse_random_spec(1, 1, 0.5),
        draw_unit=lambda: 2,
    ),
)
`;

const cpythonSource = String.raw`
import importlib.util

spec = importlib.util.spec_from_file_location("sparse_random_contract", ${JSON.stringify(modulePath)})
assert spec is not None and spec.loader is not None
sparse = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sparse)

${witness}
print("cpython-sparse-random-contract-ok")
`;

assert.equal(
  run(process.platform === "win32" ? "python" : "python3", ["-c", cpythonSource], ""),
  "cpython-sparse-random-contract-ok",
);

const sagejsSource = String.raw`
import sagejs.linear_algebra.sparse_random as sparse

${witness}
print("sagejs-sparse-random-contract-ok")
`;

assert.equal(runSageJs(sagejsSource), "sagejs-sparse-random-contract-ok");

// Sage is the behavioral oracle for the representation-specific policies.
const sage = process.env.SAGE || "/home/user/bin/sagelite";
if (existsSync(sage)) {
  const sageOracle = String.raw`
for base in [ZZ, QQ, GF(7)]:
    assert random_matrix(base, 4, 10, density=-1).is_zero()
    assert random_matrix(base, 4, 10, density=0.09).is_zero()
    assert all(random_matrix(base, 8, density=2).list())
    sparse = random_matrix(base, 40, 50, density=0.2)
    assert all(
        sum(1 for value in sparse.row(row) if value != 0) <= 10
        for row in range(40)
    )
    set_random_seed(20260812)
    left = random_matrix(base, 20, 30, density=0.2)
    set_random_seed(20260812)
    right = random_matrix(base, 20, 30, density=0.2)
    assert left == right

bounded = random_matrix(ZZ, 20, 30, density=0.2, x=-7, y=8)
assert all(-7 <= value < 8 for value in bounded.list())
rational = random_matrix(QQ, 20, 30, density=0.2, num_bound=5, den_bound=5)
assert any(value.denominator() > 1 for value in rational.list())

for density in [-1, 0]:
    assert random_matrix(GF(2), 20, 30, density=density).is_zero()
for density in [1, 2]:
    assert all(random_matrix(GF(2), 8, density=density).list())
set_random_seed(17)
binary = random_matrix(GF(2), 200, 200, density=0.1)
# Per-entry Bernoulli sampling can exceed floor(density*ncols) in a row.
assert max(sum(1 for value in binary.row(row) if value) for row in range(200)) > 20
set_random_seed(20260812)
left = random_matrix(GF(2), 20, 30, density=0.2)
set_random_seed(20260812)
right = random_matrix(GF(2), 20, 30, density=0.2)
assert left == right

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

print("sage-sparse-random-oracle-ok")
`;
  assert.equal(
    run(sage, ["-c", sageOracle], "", 180_000),
    "sage-sparse-random-oracle-ok",
  );
}

console.log("linear sparse random contract passed");
