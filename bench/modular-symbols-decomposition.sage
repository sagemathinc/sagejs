# This source is intentionally accepted unchanged by Sage.js and SageMath.
# It isolates the newspace/decomposition pipeline from the much larger
# historical Hecke benchmark grid.

import time


def report(operation, start, answer):
    elapsed = float(time.time() - start)
    print("RESULT", operation, 0, elapsed, answer)


def fresh_space(level):
    if hasattr(P1List(1), "manin_relations"):
        return ModularSymbols(level, 2, sign=1)
    return ModularSymbols(level, 2, sign=1, use_cache=False)


def decomposition_fingerprint(spaces):
    dimensions = [space.dimension() for space in spaces]
    dimensions.sort()
    answer = 0
    for dimension in dimensions:
        answer = 100 * answer + dimension
    return answer


space = fresh_space(389)
start = time.time()
factors = space.decomposition()
report("decomp-389", start, decomposition_fingerprint(factors))

space = fresh_space(1000)
start = time.time()
new_space = space.new_submodule()
report("new-1000", start, new_space.dimension())
start = time.time()
factors = new_space.decomposition()
report("new-decomp-1000", start, decomposition_fingerprint(factors))
