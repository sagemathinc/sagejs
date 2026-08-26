"""Decompose Sage.js small-residue scalar cost on the real public classes."""

import time


def public_multiply_add(field, iterations):
    value = field(1)
    multiplier = field(12345)
    increment = field(6789)
    for _index in range(iterations):
        value = value * multiplier + increment
    return value


def direct_method_multiply_add(field, iterations):
    value = field(1)
    multiplier = field(12345)
    increment = field(6789)
    for _index in range(iterations):
        value = value._mul_(multiplier)._add_(increment)
    return value


def raw_residue_multiply_add(field, iterations):
    value = field(1)._value
    multiplier = field(12345)._value
    increment = field(6789)._value
    modulus = field._residueModulus
    for _index in range(iterations):
        value = (value * multiplier) % modulus
        value += increment
        if value >= modulus:
            value -= modulus
    return field._from_reduced(value)


def allocate_reduced(field, iterations):
    value = field(1)
    for index in range(iterations):
        value = value._new_reduced(index % field._residueModulus)
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
measure("public-multiply-add", public_multiply_add, F, 1000000)
measure("direct-method-multiply-add", direct_method_multiply_add, F, 100000)
measure("raw-residue-multiply-add", raw_residue_multiply_add, F, 1000000)
measure("allocate-reduced", allocate_reduced, F, 1000000)
