"""Compare the one-prime full-rank certificate with exact integer rank."""

from time import perf_counter


def milliseconds(function):
    started = perf_counter()
    answer = function()
    return answer, (perf_counter() - started) * 1000


set_random_seed(20260812)
matrix = random_matrix(ZZ, 200, 300, x=-1000, y=1001)
deficient = matrix.matrix_from_rows(range(199)).stack(matrix.row(0))

for label, source, algorithm in (
    ("full modular certificate", matrix, None),
    ("full exact FLINT", matrix, "flint"),
    ("deficient certificate plus exact fallback", deficient, None),
):
    rank, elapsed = milliseconds(
        lambda source=source, algorithm=algorithm: source.__copy__().rank(
            algorithm=algorithm
        )
    )
    print(f"{label}: rank={rank}, wall={elapsed:.3f}ms")
