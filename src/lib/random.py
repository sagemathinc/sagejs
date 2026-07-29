###########################################################
# pylang Standard Library
# Author: Alexander Tsepkov
# Copyright 2013 Pyjeon Software LLC
# License: Apache License    2.0
# This library is covered under Apache license, so that
# you can distribute it with your pylang applications.
###########################################################

# basic implementation of Python's 'random' library

# JavaScript's Math.random() cannot be seeded.  A 32-bit numerical-recipes
# linear congruential generator gives this compatibility module deterministic
# state without the eight Python-level calls per sample used by its historical
# RC4 implementation.  This is a simulation PRNG, not a cryptographic API.

_seed_state = {'value': 1}


def seed(x=Date().getTime()):
    if jstype(x) is 'number':
        x = x.toString()
    elif jstype(x) is not 'string':
        raise TypeError("unhashable type: '" + jstype(x) + "'")
    value = 5381
    for i in range(x.length):
        value = (value * 33 + x.charCodeAt(i)) % 4294967296
    if value == 0:
        value = 1
    _seed_state.value = value


seed()


def random():
    value = (
        1664525 * _seed_state.value + 1013904223
    ) % 4294967296
    _seed_state.value = value
    return value / 4294967296


# unlike the python version, this DOES build a range object, feel free to reimplement
def randrange():
    return choice(range.apply(this, arguments))


def randint(a, b):
    return int(random() * (b - a + 1) + a)


def uniform(a, b):
    return random() * (b - a) + a


def choice(seq):
    if len(seq) > 0:
        return seq[Math.floor(random() * len(seq))]
    else:
        raise IndexError()


# uses Fisher-Yates algorithm to shuffle an array
def shuffle(x, random_f=random):
    x = list(x)
    for i in range(len(x)):
        j = Math.floor(random_f() * (i + 1))
        x[i], x[j] = x[j], x[i]
    return x


# similar to shuffle, but only shuffles a subset and creates a copy
def sample(population, k):
    x = list(population)[:]
    for i in range(len(population) - 1, len(population) - k - 1, -1):
        j = Math.floor(random() * (i + 1))
        x[i], x[j] = x[j], x[i]
    return x[-k:]
