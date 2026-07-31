# This source is intentionally accepted unchanged by Sage.js and SageMath.
# It measures work inside an already-started process, so startup is excluded.

import time


SAMPLES = 3
MODULUS = 65521


def report(operation, sample, start, answer):
    elapsed = float(time.time() - start)
    print("RESULT", operation, sample, elapsed, answer)


def measure_p1(level):
    P1List(1000)
    for sample in range(SAMPLES):
        start = time.time()
        projective_line = P1List(level)
        answer = len(projective_line)
        report("p1-" + str(level), sample, start, answer)


def sage_manin_dimension(level, modulus):
    projective_line = P1List(level)
    count = len(projective_line)
    action_s = [projective_line.apply_S(i) for i in range(count)]
    action_r = [projective_line.apply_T(i) for i in range(count)]
    rows = []
    for i in range(count):
        if action_s[i] >= i:
            row = [0] * count
            row[i] += 1
            row[action_s[i]] += 1
            rows.append(row)
    for i in range(count):
        r = action_r[i]
        rr = action_r[r]
        if i <= r and i <= rr:
            row = [0] * count
            row[i] += 1
            row[r] += 1
            row[rr] += 1
            rows.append(row)
    relations = matrix(GF(modulus), rows, sparse=True)
    return count - relations.rank()


def native_manin_dimension(level, modulus):
    relations = P1List(level).manin_relations(modulus)
    return relations.dimension()


def measure_manin(level):
    probe = P1List(1)
    native = hasattr(probe, "manin_relations")
    worker = native_manin_dimension if native else sage_manin_dimension
    worker(11, MODULUS)
    for sample in range(SAMPLES):
        start = time.time()
        answer = worker(level, MODULUS)
        report("manin-modp-" + str(level), sample, start, answer)


def measure_rational_modular_symbols(level):
    # Sage.js deliberately does not claim this operation yet: its current
    # vertical slice computes the relation quotient over a word-size field.
    if hasattr(P1List(1), "manin_relations"):
        print("SKIP", "modsym-qq-" + str(level), "not-implemented")
        return
    ModularSymbols(11, 2, use_cache=False).dimension()
    for sample in range(SAMPLES):
        start = time.time()
        answer = ModularSymbols(level, 2, use_cache=False).dimension()
        report("modsym-qq-" + str(level), sample, start, answer)


measure_p1(100000)
measure_p1(1000000)
measure_manin(389)
measure_manin(1000)
measure_rational_modular_symbols(389)
measure_rational_modular_symbols(1000)
