# This source is intentionally accepted unchanged by Sage.js and SageMath.
# It measures work inside an already-started process, so startup is excluded.

import time


SAMPLES = 3
PHASE_SAMPLES = 1
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
    native = hasattr(P1List(1), "manin_relations")
    if not native:
        ModularSymbols(11, 2, use_cache=False).dimension()
    for sample in range(SAMPLES):
        start = time.time()
        if native:
            answer = ModularSymbols(level, 2).dimension()
        else:
            answer = ModularSymbols(
                level, 2, use_cache=False).dimension()
        report("modsym-qq-" + str(level), sample, start, answer)


def fresh_space(level, sign=0):
    if hasattr(P1List(1), "manin_relations"):
        return ModularSymbols(level, 2, sign=sign)
    return ModularSymbols(
        level, 2, sign=sign, use_cache=False)


def measure_subspace_phases(level):
    for sample in range(PHASE_SAMPLES):
        start = time.time()
        full = fresh_space(level)
        report(
            "space-full-" + str(level), sample, start, full.dimension())

        full = fresh_space(level)
        start = time.time()
        cuspidal = full.cuspidal_subspace()
        report(
            "space-cuspidal-" + str(level),
            sample, start, cuspidal.dimension())

        start = time.time()
        plus = fresh_space(level, 1)
        report(
            "space-plus-" + str(level), sample, start, plus.dimension())

        plus = fresh_space(level, 1)
        start = time.time()
        plus_cuspidal = plus.cuspidal_subspace()
        report(
            "space-plus-cuspidal-" + str(level),
            sample, start, plus_cuspidal.dimension())

        start = time.time()
        signed_cuspidal_hecke = plus_cuspidal.hecke_matrix(2)
        report(
            "space-plus-cuspidal-t2-" + str(level),
            sample, start, signed_cuspidal_hecke.trace())

        start = time.time()
        characteristic_polynomial = signed_cuspidal_hecke.charpoly()
        fingerprint = (
            characteristic_polynomial(2).numerator() % 1000000007)
        report(
            "charpoly-t2-" + str(level),
            sample, start, fingerprint)


def measure_hecke(level, prime):
    native = hasattr(P1List(1), "hecke_matrix")
    if native:
        space = ModularSymbols(level, 2)
    else:
        space = ModularSymbols(level, 2, use_cache=False)
    space.T(prime).matrix()
    for sample in range(SAMPLES):
        if hasattr(space, "_hecke_matrices"):
            space._hecke_matrices.clear()
        operator = space.T(prime)
        matrix_cache = "_HeckeOperator__matrix"
        if hasattr(operator, matrix_cache):
            delattr(operator, matrix_cache)
        start = time.time()
        answer = operator.matrix().trace()
        report(
            "hecke-t" + str(prime) + "-" + str(level),
            sample,
            start,
            answer,
        )


measure_p1(100000)
measure_p1(1000000)
measure_manin(389)
measure_manin(1000)
measure_rational_modular_symbols(389)
measure_rational_modular_symbols(1000)
measure_subspace_phases(5077)
measure_hecke(389, 3)
measure_hecke(1000, 3)
measure_hecke(10000, 3)
measure_hecke(20011, 3)
