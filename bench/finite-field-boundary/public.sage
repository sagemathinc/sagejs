# This source is accepted unchanged by Sage.js and SageMath.  It isolates the
# complete public scalar path from construction and process startup.

import time


def add_loop(field, iterations):
    value = field(1)
    increment = field(6789)
    for _index in range(iterations):
        value = value + increment
    return value


def multiply_loop(field, iterations):
    value = field(1)
    multiplier = field(12345)
    for _index in range(iterations):
        value = value * multiplier
    return value


def multiply_add_loop(field, iterations):
    value = field(1)
    multiplier = field(12345)
    increment = field(6789)
    for _index in range(iterations):
        value = value * multiplier + increment
    return value


def measure(name, function, field, iterations):
    function(field, min(iterations, 20000))
    samples = []
    for _sample in range(9):
        started = time.time()
        checksum = function(field, iterations)
        samples.append(float(time.time() - started))
    samples.sort()
    print("RESULT", name, iterations, samples[len(samples) // 2], int(checksum))


F = GF(65521)
R = Zmod(65521)
measure("gf-add", add_loop, F, 1000000)
measure("gf-multiply", multiply_loop, F, 1000000)
measure("gf-multiply-add", multiply_add_loop, F, 1000000)
measure("zmod-multiply-add", multiply_add_loop, R, 1000000)
