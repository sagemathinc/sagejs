"""Public rectangular dense `GF(p)` solve benchmark.

Each case constructs a consistent system `A * X = B`, warms the selected
FFLAS/FLINT RREF and typed extraction path, then reports a wall-time median.
Run from the repository root with:

```sh
./bin/sagejs bench/dense-prime-rectangular-solve.sage
```
"""

import sagejs.runtime as runtime


def _median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _case(modulus, rows, columns, right_columns=4, samples=7):
    set_random_seed(modulus * 1000003 + rows * 1009 + columns)
    field = GF(modulus)
    left = random_matrix(field, rows, columns)
    witness = random_matrix(field, columns, right_columns)
    right = left * witness

    answer = left.solve_right(right)
    assert left * answer == right
    timings = []
    for _sample in range(samples):
        started = runtime.wall_time()
        answer = left.solve_right(right)
        timings.append((runtime.wall_time() - started) * 1000)
        assert left * answer == right
    print(
        f"GF({modulus}) {rows}x{columns} rhs={right_columns}",
        "median_ms",
        _median(timings),
        "solution_shape",
        answer.dimensions(),
    )


for _modulus in [2, 7, 97]:
    _case(_modulus, 120, 180)
    _case(_modulus, 180, 120)
