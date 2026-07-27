# The same source is run by Sage.js and Sagelite.  Timings deliberately
# exclude process startup and include language-level dispatch and wrappers.

import time


def timed(label, warmup, operation):
    warmup()
    start = time.time()
    answer = operation()
    elapsed = float(time.time() - start)
    print(label + ':', elapsed, 'seconds;', answer)


def rational_warmup():
    rational_roundtrip(2000)


def rational_benchmark():
    return rational_roundtrip(100000)


def rational_roundtrip(iterations):
    value = 1/3
    step = 123456789012345678901/987654321098765432109
    for _ in range(iterations):
        value = value + step
        value = value - step
        value = value * step
        value = value / step
    return value


R = PolynomialRing(ZZ, 'x')
x = R.gen()
f = (x + 1)^64
h = (x - 1)^64


def polynomial_add_warmup():
    polynomial_add_roundtrip(200)


def polynomial_add_benchmark():
    return polynomial_add_roundtrip(10000)


def polynomial_add_roundtrip(iterations):
    value = f
    for _ in range(iterations):
        value = value + h
        value = value - h
    return value == f


def polynomial_multiply_warmup():
    polynomial_multiply(100)


def polynomial_multiply_benchmark():
    return polynomial_multiply(5000)


def polynomial_multiply(iterations):
    value = f
    for _ in range(iterations):
        value = f * h
    return value == f * h


def mixed_coercion_warmup():
    mixed_coercion(100)


def mixed_coercion_benchmark():
    return mixed_coercion(5000)


def mixed_coercion(iterations):
    value = f
    for _ in range(iterations):
        value = f + 1/3
    return parent(value)


timed('100000 rational add/sub/mul/div roundtrips',
      rational_warmup, rational_benchmark)
timed('10000 degree-64 polynomial add/sub roundtrips',
      polynomial_add_warmup, polynomial_add_benchmark)
timed('5000 degree-64 polynomial products',
      polynomial_multiply_warmup, polynomial_multiply_benchmark)
timed('5000 ZZ[x] plus QQ coercions',
      mixed_coercion_warmup, mixed_coercion_benchmark)
