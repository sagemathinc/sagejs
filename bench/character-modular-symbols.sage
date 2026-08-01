# This source is prepended with BENCH_LEVELS and accepted unchanged by
# Sage.js and SageMath. Startup and character construction are excluded.

import time


FINGERPRINT_MODULUS = 1000000007


def report(operation, elapsed, answer):
    print("RESULT", operation, 0, float(elapsed), answer)


def character_of_order(level, order):
    group = DirichletGroup(level)
    return group.gen() ** ((level - 1) // order)


def fresh_space(character):
    if hasattr(P1List(1), "character_presentation"):
        return ModularSymbols(character, 2, sign=1)
    return ModularSymbols(
        character, 2, sign=1, use_cache=False)


def trace_fingerprint(operator_matrix, order):
    value = operator_matrix.trace()
    if order == 2:
        return ZZ(value.numerator()) % FINGERPRINT_MODULUS
    polynomial = value.minpoly()
    return ZZ(polynomial(2)) % FINGERPRINT_MODULUS


def measure_character(level, order, label):
    character = character_of_order(level, order)
    prefix = "character-" + label + "-"

    start = time.time()
    space = fresh_space(character)
    elapsed = time.time() - start
    report(prefix + "space-" + str(level), elapsed, space.dimension())

    start = time.time()
    cuspidal = space.cuspidal_subspace()
    elapsed = time.time() - start
    report(prefix + "cusp-" + str(level), elapsed, cuspidal.dimension())

    start = time.time()
    operator_matrix = cuspidal.hecke_matrix(2)
    elapsed = time.time() - start
    fingerprint = trace_fingerprint(operator_matrix, order)
    report(prefix + "t2-" + str(level), elapsed, fingerprint)


for benchmark_level in BENCH_LEVELS:
    measure_character(benchmark_level, 2, "quadratic")
    measure_character(benchmark_level, 5, "order5")
