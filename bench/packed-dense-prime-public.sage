"""Public-API timing for canonical packed dense matrices over ``GF(p)``.

Run from the repository root with:

    ./bin/sagejs bench/packed-dense-prime-public.sage

Set ``SAGEJS_NATIVE_TRACE=1`` to verify the selected isolated/FFI route.
"""

import sagejs.runtime as runtime


def median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def milliseconds(function):
    start = runtime.wall_time()
    result = function()
    return ((runtime.wall_time() - start) * 1000, result)


def benchmark(size, samples=9):
    construction = []
    elimination = []
    for sample in range(samples):
        set_random_seed(1000 + sample)
        elapsed, source = milliseconds(
            lambda: random_matrix(GF(97), size))
        construction.append(elapsed)
        elapsed, result = milliseconds(source.rref)
        elimination.append(elapsed)
        if hasattr(source, '_native_handle'):
            raise RuntimeError('source unexpectedly owns an N-API matrix')
        if hasattr(result, '_native_handle'):
            raise RuntimeError('RREF result unexpectedly owns an N-API matrix')
    print(
        size,
        'random_matrix median ms', median(construction),
        'rref median ms', median(elimination),
    )


# Load and warm both trusted artifacts outside the reported samples.
random_matrix(GF(97), 8).rref()
benchmark(200)
benchmark(500)
