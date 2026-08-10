###########################################################
# pylang Standard Library
# Author: Alexander Tsepkov
# Copyright 2013 Pyjeon Software LLC
# License: Apache License    2.0
# This library is covered under Apache license, so that
# you can distribute it with your pylang applications.
###########################################################

# basic implementation of Python's 'random' library

# CPython's public seeded stream is part of the practical compatibility
# surface of ``random``: tests and reproducible mathematical experiments rely
# on it.  Keep the MT19937 state in JavaScript numbers, using ``Math.imul`` and
# explicit unsigned normalization for exact 32-bit arithmetic.

_WORD_MODULUS = 4294967296
_MT_SIZE = 624
_MT_PERIOD = 397
_MT_MATRIX_A = 2567483615
_MT_UPPER_MASK = 2147483648
_MT_LOWER_MASK = 2147483647


def _u32(value):
    return value % _WORD_MODULUS


def _urshift(value, bits):
    return Math.floor(value / (2**bits))


def _init_genrand(store, value):
    state = [0] * _MT_SIZE
    state[0] = _u32(value)
    for index in range(1, _MT_SIZE):
        previous = state[index - 1]
        mixed = previous ^ _urshift(previous, 30)
        state[index] = _u32(Math.imul(1812433253, mixed) + index)
    store.state = state
    store.index = _MT_SIZE


def _init_by_array(store, words):
    _init_genrand(store, 19650218)
    state = store.state
    i = 1
    j = 0
    count = max(_MT_SIZE, len(words))
    for _ in range(count):
        previous = state[i - 1]
        mixed = previous ^ _urshift(previous, 30)
        state[i] = _u32((state[i] ^ Math.imul(mixed, 1664525)) + words[j] + j)
        i += 1
        j += 1
        if i >= _MT_SIZE:
            state[0] = state[_MT_SIZE - 1]
            i = 1
        if j >= len(words):
            j = 0
    for _ in range(_MT_SIZE - 1):
        previous = state[i - 1]
        mixed = previous ^ _urshift(previous, 30)
        state[i] = _u32((state[i] ^ Math.imul(mixed, 1566083941)) - i)
        i += 1
        if i >= _MT_SIZE:
            state[0] = state[_MT_SIZE - 1]
            i = 1
    state[0] = _MT_UPPER_MASK
    store.index = _MT_SIZE


def _integer_seed_words(value):
    value = abs(int(value))
    words = []
    mask = BigInt(4294967295)
    base_bits = BigInt(32)
    remaining = BigInt(value)
    while remaining:
        words.append(Number(remaining & mask))
        remaining = remaining >> base_bits
    if not words:
        words.append(0)
    return words


def _seed_from_value(x):
    if x is None:
        x = Date().getTime()
    value_type = jstype(x)
    if value_type is "number" or value_type is "bigint":
        x = x.toString()
    elif value_type is not "string":
        x = str(x)
    value = 5381
    for i in range(x.length):
        value = (value * 33 + x.charCodeAt(i)) % 4294967296
    if value == 0:
        value = 1
    return value


def _seed_store(store, x=None, version=2):
    if x is None:
        value = _seed_from_value(Date().getTime())
        _init_by_array(store, _integer_seed_words(value))
    elif isinstance(x, int):
        _init_by_array(store, _integer_seed_words(x))
    else:
        # String/bytes version-2 SHA-512 seeding is a later compatibility
        # layer.  Preserve deterministic behavior for those accepted inputs.
        _init_by_array(store, _integer_seed_words(_seed_from_value(x)))
    return None


def _next_uint32(store):
    state = store.state
    if store.index >= _MT_SIZE:
        for index in range(_MT_SIZE):
            following = state[0] if index + 1 == _MT_SIZE else state[index + 1]
            combined = (state[index] & _MT_UPPER_MASK) | (following & _MT_LOWER_MASK)
            target = index + _MT_PERIOD
            if target >= _MT_SIZE:
                target -= _MT_SIZE
            value = state[target] ^ _urshift(combined, 1)
            if combined % 2:
                value = value ^ _MT_MATRIX_A
            state[index] = _u32(value)
        store.index = 0
    value = state[store.index]
    store.index += 1
    value = value ^ _urshift(value, 11)
    value = value ^ (_u32(value * (2**7)) & 2636928640)
    value = value ^ (_u32(value * (2**15)) & 4022730752)
    value = value ^ _urshift(value, 18)
    return _u32(value)


def _store_random(store):
    high = _urshift(_next_uint32(store), 5)
    low = _urshift(_next_uint32(store), 6)
    return (high * 67108864 + low) / 9007199254740992


def _store_getrandbits(store, k):
    k = _as_index(k)
    if k < 0:
        raise ValueError("number of bits must be non-negative")
    if k == 0:
        return 0
    answer = BigInt(0)
    offset = 0
    remaining = k
    while remaining > 0:
        word = _next_uint32(store)
        take = min(remaining, 32)
        if take < 32:
            word = _urshift(word, 32 - take)
        answer = answer | (BigInt(word) << BigInt(offset))
        offset += 32
        remaining -= take
    return int(answer)


def _store_randbelow(store, upper):
    bits = upper.bit_length()
    while True:
        candidate = _store_getrandbits(store, bits)
        if candidate < upper:
            return candidate


_seed_state = {"state": [], "index": _MT_SIZE}


def seed(x=None, version=2):
    return _seed_store(_seed_state, x, version)


seed()


def random():
    return _store_random(_seed_state)


_default_random = random


class Random:
    """Deterministic random-number generator with independent state.

    This implements the core CPython ``random.Random`` interface with the
    same MT19937 stream for integer seeds.
    """

    def __init__(self, x=None):
        self._state = {"state": [], "index": _MT_SIZE}
        self.seed(x)

    def seed(self, x=None, version=2):
        return _seed_store(self._state, x, version)

    def random(self):
        return _store_random(self._state)

    def getrandbits(self, k):
        return _store_getrandbits(self._state, k)

    def _randbelow(self, upper):
        return _store_randbelow(self._state, upper)

    def randrange(self, start, stop=None, step=1):
        start = _as_index(start)
        if stop is None:
            stop = start
            start = 0
        else:
            stop = _as_index(stop)
        step = _as_index(step)
        if step == 0:
            raise ValueError("zero step for randrange()")
        width = stop - start
        if step > 0:
            count = 0 if width <= 0 else (width + step - 1) // step
        else:
            count = 0 if width >= 0 else (width + step + 1) // step
        if count <= 0:
            raise ValueError("empty range for randrange()")
        return start + step * self._randbelow(count)

    def randint(self, a, b):
        return self.randrange(a, b + 1)

    def uniform(self, a, b):
        return self.random() * (b - a) + a

    def choice(self, seq):
        if len(seq) == 0:
            raise IndexError("Cannot choose from an empty sequence")
        return seq[self._randbelow(len(seq))]


def _type_name(value):
    value_type = jstype(value)
    if value_type is "number":
        return "float"
    if value_type is "bigint":
        return "int"
    name = type(value).__name__
    if name.startswith("ρσ_"):
        return name[3:]
    return name


def _as_index(value):
    if (
        value is True
        or value is False
        or isinstance(value, int)
        or jstype(value) is "bigint"
    ):
        return int(value)
    if jstype(value) is "number":
        raise TypeError(
            "'" + _type_name(value) + "' object cannot be interpreted as an integer"
        )
    if not hasattr(value, "__index__"):
        raise TypeError(
            "'" + _type_name(value) + "' object cannot be interpreted as an integer"
        )
    method = getattr(value, "__index__")
    answer = method()
    if not (answer is True or answer is False or isinstance(answer, int)):
        raise TypeError("__index__ returned non-int (type " + _type_name(answer) + ")")
    return int(answer)


def getrandbits(k):
    """Return a nonnegative integer with *k* random bits.

    The implementation composes words from this module's deterministic PRNG,
    so it works for arbitrarily large Python integers as CPython's API does.
    """
    return _store_getrandbits(_seed_state, k)


def _randbelow(upper):
    # Tests and applications sometimes replace the module-level ``random``
    # function.  Honor that hook; otherwise use CPython's getrandbits-based
    # rejection algorithm so seeded ``randrange`` streams are compatible.
    if random is not _default_random:
        return Math.floor(random() * float(upper))
    return _store_randbelow(_seed_state, upper)


def randrange(start, stop=None, step=1):
    start = _as_index(start)
    if stop is None:
        stop = start
        start = 0
    else:
        stop = _as_index(stop)
    step = _as_index(step)
    if step == 0:
        raise ValueError("zero step for randrange()")
    width = stop - start
    if step > 0:
        count = 0 if width <= 0 else (width + step - 1) // step
    else:
        count = 0 if width >= 0 else (width + step + 1) // step
    if count <= 0:
        raise ValueError("empty range for randrange()")
    return start + step * _randbelow(count)


def randint(a, b):
    return randrange(a, b + 1)


def uniform(a, b):
    return random() * (b - a) + a


def choice(seq):
    if len(seq) > 0:
        return seq[Math.floor(random() * len(seq))]
    else:
        raise IndexError("Cannot choose from an empty sequence")


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
            raise IndexError("list index out of range")
        return [
            population[Math.floor(random() * population_size)] for _ in range(count)
        ]
    if weights is not None and cum_weights is not None:
        raise TypeError("Cannot specify both weights and cumulative weights")
    if cum_weights is None:
        cumulative = []
        total = 0
        for weight in weights:
            total += weight
            cumulative.append(total)
    else:
        cumulative = list(cum_weights)
    if len(cumulative) != population_size:
        raise ValueError("The number of weights does not match the population")
    if population_size == 0:
        raise IndexError("list index out of range")
    total = float(cumulative[-1])
    if total <= 0:
        raise ValueError("Total of weights must be greater than zero")
    if total - total != 0:
        raise ValueError("Total of weights must be finite")
    high = population_size - 1
    return [
        population[_bisect_cumulative(cumulative, random() * total, high)]
        for _ in range(count)
    ]


# Uses Fisher--Yates in place, as CPython does.
def shuffle(x):
    if isinstance(x, tuple) or isinstance(x, str) or isinstance(x, range):
        raise TypeError(
            "'" + _type_name(x) + "' object does not support item assignment"
        )
    for i in range(len(x) - 1, 0, -1):
        j = Math.floor(random() * (i + 1))
        x[i], x[j] = x[j], x[i]
    return None


def sample(population, k, *, counts=None):
    if isinstance(population, dict) or isinstance(population, set):
        raise TypeError(
            "Population must be a sequence.  For dicts or sets, use sorted(d)."
        )
    count = _as_index(k)
    pool = list(population)
    if counts is not None:
        if len(counts) != len(pool):
            raise ValueError("The number of counts does not match the population")
        cumulative = []
        total = 0
        for item_count in counts:
            total += _as_index(item_count)
            cumulative.append(total)
        if total <= 0 or count < 0 or count > total:
            raise ValueError("Sample larger than population or is negative")
        selections = sample(range(total), count)
        return [
            pool[_bisect_cumulative(cumulative, selected, len(pool))]
            for selected in selections
        ]
    if count < 0 or count > len(pool):
        raise ValueError("Sample larger than population or is negative")
    answer = []
    for _ in range(count):
        selected = Math.floor(random() * len(pool))
        answer.append(pool.pop(selected))
    return answer
