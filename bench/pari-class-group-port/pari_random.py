# sagejs: native-bitwise
"""PARI 2.17.4 `random.c` XORGEN4096 and word rejection sampling.

Derived from PARI (GPL-2.0-or-later), originally adapted from Richard P.
Brent's GPL xorgens 3.04 by Randall Rathbun. No warranty.
Resident state is 64 unsigned words, the Weyl word, and circular index.
Callers own an initialized, disjoint state; extra storage remains untouched.
The exported word semantics are PARI's 64-bit platform semantics.
"""

from sagejs.native import IntegerBuffer, checked_uint64, native, uint64


@native
def _random_add(a: uint64, b: uint64) -> uint64:
    maximum = checked_uint64(18446744073709551615)
    room = maximum - b
    if a > room:
        return a - room - checked_uint64(1)
    return a + b


@native
def _random_mix(v: uint64) -> uint64:
    v = v ^ ((v & checked_uint64(18014398509481983)) << checked_uint64(10))
    v = v ^ (v >> checked_uint64(15))
    v = v ^ ((v & checked_uint64(1152921504606846975)) << checked_uint64(4))
    return v ^ (v >> checked_uint64(13))


@native
def _random_block(state: IntegerBuffer) -> uint64:
    i = (state[65] + 1) & 63
    state[65] = i
    t = checked_uint64(state[i])
    v = checked_uint64(state[(i + 11) & 63])
    t = t ^ ((t & checked_uint64(2147483647)) << checked_uint64(33))
    t = t ^ (t >> checked_uint64(26))
    v = v ^ ((v & checked_uint64(137438953471)) << checked_uint64(27))
    v = v ^ (v >> checked_uint64(29))
    w = t ^ v
    state[i] = int(w)
    return w


@native
def pari_random_seed(state: IntegerBuffer, seed: int) -> int:
    """Initialize from a positive one-word seed, including 256 discarded blocks."""
    if len(state) < 66:
        raise ValueError("short random state")
    if seed <= 0 or seed > 18446744073709551615:
        raise ValueError("random seed outside positive uint64")
    v = checked_uint64(seed)
    k = 0
    while k < 64:
        v = _random_mix(v)
        k += 1
    w = v
    k = 0
    while k < 64:
        v = _random_mix(v)
        w = _random_add(w, checked_uint64(7046029254386353131))
        state[k] = int(_random_add(v, w))
        k += 1
    state[64] = int(w)
    state[65] = 63
    k = 0
    while k < 256:
        _random_block(state)
        k += 1
    return 0


@native
def pari_random_word(state: IntegerBuffer) -> int:
    """Consume one `rand64` draw from caller-owned initialized state."""
    if len(state) < 66:
        raise ValueError("short random state")
    if state[65] < 0 or state[65] > 63:
        raise ValueError("invalid random state index")
    v = _random_block(state)
    w = _random_add(checked_uint64(state[64]), checked_uint64(7046029254386353131))
    state[64] = int(w)
    return int(_random_add(v, w ^ (w >> checked_uint64(27))))


@native
def pari_random_fl(state: IntegerBuffer, n: int) -> int:
    """Translate `random_Fl`: no draw for 1; otherwise high-bit rejection."""
    if len(state) < 66:
        raise ValueError("short random state")
    if n <= 0 or n > 18446744073709551615:
        raise ValueError("random bound outside positive uint64")
    if n == 1:
        return 0
    shift = 64 - n.bit_length()
    if (n & (n - 1)) == 0:
        return pari_random_word(state) >> (shift + 1)
    while True:
        d = pari_random_word(state) >> shift
        if d < n:
            return d
