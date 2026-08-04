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


def _type_name(value):
    value_type = jstype(value)
    if value_type is 'number':
        return 'float'
    if value_type is 'bigint':
        return 'int'
    name = type(value).__name__
    if name.startswith('ρσ_'):
        return name[3:]
    return name


def _as_index(value):
    if value is True or value is False or isinstance(value, int):
        return int(value)
    if jstype(value) is 'number':
        raise TypeError(
            "'" + _type_name(value)
            + "' object cannot be interpreted as an integer")
    if not hasattr(value, '__index__'):
        raise TypeError(
            "'" + _type_name(value)
            + "' object cannot be interpreted as an integer")
    method = getattr(value, '__index__')
    answer = method()
    if not (answer is True or answer is False or isinstance(answer, int)):
        raise TypeError(
            '__index__ returned non-int (type '
            + _type_name(answer) + ')')
    return int(answer)


def randrange(start, stop=None, step=1):
    start = _as_index(start)
    if stop is None:
        stop = start
        start = 0
    else:
        stop = _as_index(stop)
    step = _as_index(step)
    if step == 0:
        raise ValueError('zero step for randrange()')
    values = range(start, stop, step)
    count = len(values)
    if count == 0:
        raise ValueError('empty range for randrange()')
    return values[Math.floor(random() * count)]


def randint(a, b):
    return randrange(a, b + 1)


def uniform(a, b):
    return random() * (b - a) + a


def choice(seq):
    if len(seq) > 0:
        return seq[Math.floor(random() * len(seq))]
    else:
        raise IndexError('Cannot choose from an empty sequence')


def _bisect_cumulative(cumulative, value, high):
    low = 0
    while low < high:
        middle = (low + high) // 2
        if value < cumulative[middle]:
            high = middle
        else:
            low = middle + 1
    return low


def choices(population, weights=None, *, cum_weights=None, k=1):
    count = _as_index(k)
    population_size = len(population)
    if weights is None and cum_weights is None:
        if population_size == 0 and count > 0:
            raise IndexError('list index out of range')
        return [
            population[Math.floor(random() * population_size)]
            for _ in range(count)
        ]
    if weights is not None and cum_weights is not None:
        raise TypeError(
            'Cannot specify both weights and cumulative weights')
    if cum_weights is None:
        cumulative = []
        total = 0
        for weight in weights:
            total += weight
            cumulative.append(total)
    else:
        cumulative = list(cum_weights)
    if len(cumulative) != population_size:
        raise ValueError(
            'The number of weights does not match the population')
    if population_size == 0:
        raise IndexError('list index out of range')
    total = float(cumulative[-1])
    if total <= 0:
        raise ValueError('Total of weights must be greater than zero')
    if total - total != 0:
        raise ValueError('Total of weights must be finite')
    high = population_size - 1
    return [
        population[_bisect_cumulative(
            cumulative, random() * total, high)]
        for _ in range(count)
    ]


# Uses Fisher--Yates in place, as CPython does.
def shuffle(x):
    if isinstance(x, tuple) or isinstance(x, str) or isinstance(x, range):
        raise TypeError(
            "'" + _type_name(x)
            + "' object does not support item assignment")
    for i in range(len(x) - 1, 0, -1):
        j = Math.floor(random() * (i + 1))
        x[i], x[j] = x[j], x[i]
    return None


def sample(population, k, *, counts=None):
    if isinstance(population, dict) or isinstance(population, set):
        raise TypeError(
            'Population must be a sequence.  For dicts or sets, use sorted(d).')
    count = _as_index(k)
    pool = list(population)
    if counts is not None:
        if len(counts) != len(pool):
            raise ValueError(
                'The number of counts does not match the population')
        cumulative = []
        total = 0
        for item_count in counts:
            total += _as_index(item_count)
            cumulative.append(total)
        if total <= 0 or count < 0 or count > total:
            raise ValueError(
                'Sample larger than population or is negative')
        selections = sample(range(total), count)
        return [
            pool[_bisect_cumulative(cumulative, selected, len(pool))]
            for selected in selections
        ]
    if count < 0 or count > len(pool):
        raise ValueError('Sample larger than population or is negative')
    answer = []
    for _ in range(count):
        selected = Math.floor(random() * len(pool))
        answer.append(pool.pop(selected))
    return answer
