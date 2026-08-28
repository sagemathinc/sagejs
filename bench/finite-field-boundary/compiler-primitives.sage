"""Check that closed-parent guards do not penalize primitive integer loops."""

import time


def integer_add_loop(iterations):
    value = 0
    for _index in range(iterations):
        value += 1
        if value >= 65521:
            value -= 65521
    return value


def integer_multiply_add_loop(iterations):
    value = 1
    for _index in range(iterations):
        value = (value * 12345 + 6789) % 65521
    return value


def measure(name, function, iterations):
    function(min(iterations, 50000))
    samples = []
    for _sample in range(7):
        started = time.time()
        checksum = function(iterations)
        samples.append(float(time.time() - started))
    samples.sort()
    print("RESULT", name, iterations, samples[len(samples) // 2], checksum)


measure("integer-add", integer_add_loop, 1000000)
measure("integer-multiply-add", integer_multiply_add_loop, 1000000)
