"""Deterministic, splittable pseudo-randomness for global optimization.

Global optimizers are stochastic: Differential Evolution mutates by combining
randomly chosen population members, Simulated Annealing perturbs by a random
displacement, and multistart methods scatter random starting points. Wolfram
`NMinimize` exposes a `"RandomSeed"` option (default `0`) so that such a run
reproduces. This module provides the same guarantee, and a stronger one:

> A seeded run produces a bit-identical result no matter how many parallel
> workers execute it, including none at all.

That stronger property is the entire reason this module exists instead of a
call to the `random` module. Sage.js parallel workers are separate V8 isolates
(`tools/multiprocessing-worker.ts`) with no shared address space, so a single
global generator consumed in completion order would make every result depend
on worker scheduling. Instead, each unit of work derives its **own** stream
from the pair `(seed, stream_index)`:

```python
stream = derive_stream(seed, member_index)
```

`derive_stream(s, i)` is a pure function of `(s, i)`. It never reads the
clock, a process id, an iteration counter, or any other ambient state, and
there is no module-level mutable state for two streams to contend over. Two
streams built from the same pair emit the same sequence in any process, on any
platform, forever; work can therefore be sharded, re-sharded, retried, or run
serially without moving a single bit of the answer.

## Algorithms

Two public-domain reference algorithms are used, both transliterated from
their canonical C sources rather than re-derived:

* **SplitMix64** — Steele, Lea and Flood, *Fast Splittable Pseudorandom
  Number Generators*, OOPSLA 2014, in the compact form published by Vigna as
  `splitmix64.c` (<https://prng.di.unimi.it/splitmix64.c>). Used only for
  seeding and index mixing, never as the output generator: it is a bijective
  counter mixer, so it fills a state from a small key without the correlation
  a linearly-derived seed would leave behind.
* **xoshiro256\\*\\*** — Blackman and Vigna, *Scrambled Linear Pseudorandom
  Number Generators*, ACM TOMS 47(4), 2021, reference C at
  <https://prng.di.unimi.it/xoshiro256starstar.c>. Used as the output
  generator: 256 bits of state, a period of `2**256 - 1`, all-purpose quality
  (it passes BigCrush), and a very short critical path.

Every value is a Python `int` masked to 64 bits with `& 0xFFFFFFFFFFFFFFFF`.
Python integers are arbitrary precision, so unlike the C originals nothing
wraps on its own: the mask is applied after *every* shift, multiplication and
addition, and omitting one would silently grow the state instead of failing.

Uniform doubles use the standard 53-bit construction — the top 53 bits of a
64-bit word scaled by `2**-53` — which yields every representable multiple of
`2**-53` in `[0, 1)` with equal probability and never returns exactly `1.0`.
"""

from __future__ import annotations

import math

_MASK64 = 0xFFFFFFFFFFFFFFFF
"""Bit mask emulating C's `uint64_t` wraparound on arbitrary-precision ints."""

_TWO64 = 0x10000000000000000
"""`2**64`: the size of the range `next_uint64` draws from."""

_SPLITMIX_GAMMA = 0x9E3779B97F4A7C15
"""SplitMix64's additive step, the odd 64-bit integer nearest `2**64 / phi`."""

_SPLITMIX_MIX_A = 0xBF58476D1CE4E5B9
"""First multiplier of SplitMix64's finalizing avalanche."""

_SPLITMIX_MIX_B = 0x94D049BB133111EB
"""Second multiplier of SplitMix64's finalizing avalanche."""

_STREAM_SALT = 0xD1B54A32D192ED03
"""An arbitrary odd constant separating index mixing from seed mixing.

Any odd 64-bit constant works; it exists so that mixing a stream index and
mixing a seed of the same numeric value do not follow identical paths.
"""

_FALLBACK_STATE = (
    0x2545F4914F6CDD1D,
    0x123456789ABCDEF0,
    0x0FEDCBA987654321,
    0x853C49E6748FEA9B,
)
"""A fixed nonzero state substituted for the (unreachable) all-zero seeding.

xoshiro256\\*\\* is a linear generator over `GF(2)`: the all-zero state is a
fixed point that emits nothing but zeros. SplitMix64 is a bijection, so four
consecutive outputs can only all be zero for one specific key out of `2**64`
per word position, which no realistic seed reaches — but the failure would be
silent, so it is handled explicitly rather than assumed away.
"""

_UNIT_SCALE = 1.0 / 9007199254740992.0
"""`2**-53`, the spacing of the uniform doubles produced by `uniform`."""


def _rotl(value: int, count: int) -> int:
    """Rotate the 64-bit `value` left by `count` bits.

    C's `rotl` in the reference sources; `count` is always a literal in the
    range `1..63`, so the degenerate `count == 0` shift is not handled.
    """
    return ((value << count) | (value >> (64 - count))) & _MASK64


def _mix64(value: int) -> int:
    """Apply SplitMix64's finalizing avalanche to `value`.

    This is the body of `splitmix64.c`'s `next()` after the counter step: two
    xor-shift-multiply rounds followed by a final xor-shift. It is a bijection
    on 64-bit words with strong avalanche, so inputs differing in one bit
    produce outputs differing in about half their bits.
    """
    z = value & _MASK64
    z = ((z ^ (z >> 30)) * _SPLITMIX_MIX_A) & _MASK64
    z = ((z ^ (z >> 27)) * _SPLITMIX_MIX_B) & _MASK64
    return z ^ (z >> 31)


def _splitmix64(state: int) -> tuple[int, int]:
    """Advance a SplitMix64 `state` once, returning `(next_state, output)`.

    The state is a plain counter stepped by `_SPLITMIX_GAMMA`; all of the
    quality lives in `_mix64`. Returning the successor state instead of
    mutating anything keeps this a pure function.
    """
    next_state = (state + _SPLITMIX_GAMMA) & _MASK64
    return next_state, _mix64(next_state)


def _seed_words(seed: int, stream: int) -> list[int]:
    """Expand `(seed, stream)` into the four 64-bit words of a xoshiro state.

    The stream index is folded **through** `_mix64` before it meets the seed,
    rather than merely added to it. Adding would make stream `i` and stream
    `i + 1` neighbours in the seeding key, and since the key is expanded by a
    counter-based mixer the two states would then be related in a way a
    correlation test can see. Mixing first scatters consecutive indices across
    the whole 64-bit key space, so `derive_stream(s, 0)` and
    `derive_stream(s, 1)` are as unrelated as two independently chosen seeds.

    Negative `seed` or `stream` values are accepted: masking a negative Python
    integer yields its two's-complement 64-bit pattern, so `-1` and
    `2**64 - 1` name the same stream.
    """
    key = _mix64((seed & _MASK64) ^ _mix64((stream & _MASK64) ^ _STREAM_SALT))

    words: list[int] = []
    state = key
    for _ in range(4):
        state, output = _splitmix64(state)
        words.append(output)

    if (words[0] | words[1] | words[2] | words[3]) == 0:
        return list(_FALLBACK_STATE)
    return words


class RandomStream:
    """One independent xoshiro256\\*\\* stream identified by `(seed, stream)`.

    A `RandomStream` is the unit of reproducibility: it owns its 256-bit state
    and shares nothing, so drawing from one stream cannot perturb another and
    the order in which streams are created or consumed is irrelevant. Give
    every parallel unit of work its own stream index and the run reproduces
    bit-for-bit at any degree of parallelism, including none.

    Instances are mutable by nature (drawing advances the state) and are not
    safe to hand to two consumers at once — that would reintroduce exactly the
    ordering dependence this module removes. Derive a second stream instead.

    ```python
    stream = derive_stream(20260822, 7)
    stream.uniform()          # a double in [0, 1)
    stream.randint(0, 10)     # an int in 0..9
    stream.normal()           # a standard normal deviate
    ```
    """

    def __init__(self, seed: int, stream: int = 0) -> None:
        """Build the stream identified by `seed` and the index `stream`.

        Both arguments are arbitrary integers, taken modulo `2**64`. The four
        state words come from SplitMix64 applied to a key that mixes both (see
        `_seed_words`), which is the seeding procedure the xoshiro reference
        source recommends.
        """
        words = _seed_words(seed, stream)
        self._s0: int = words[0]
        self._s1: int = words[1]
        self._s2: int = words[2]
        self._s3: int = words[3]

    def next_uint64(self) -> int:
        """Draw the next 64-bit word, advancing the state.

        A transliteration of `xoshiro256starstar.c`'s `next()`: the returned
        value is the `**` scrambler applied to `s[1]`, computed *before* the
        linear state update so that the cheap scrambling and the state
        transition are independent.
        """
        result = (_rotl((self._s1 * 5) & _MASK64, 7) * 9) & _MASK64

        t = (self._s1 << 17) & _MASK64
        self._s2 ^= self._s0
        self._s3 ^= self._s1
        self._s1 ^= self._s2
        self._s0 ^= self._s3
        self._s2 ^= t
        self._s3 = _rotl(self._s3, 45)

        return result

    def uniform(self) -> float:
        """Draw a double uniformly from `[0, 1)`, consuming one 64-bit word.

        The standard 53-bit construction: the low 11 bits are discarded and
        the remaining 53 — exactly the significand width of an IEEE double —
        are scaled by `2**-53`. Every outcome is therefore representable
        without rounding, `0.0` is attainable, and `1.0` is not.
        """
        return (self.next_uint64() >> 11) * _UNIT_SCALE

    def uniform_range(self, low: float, high: float) -> float:
        """Draw a double uniformly from `[low, high)`, consuming one word.

        No ordering check is made: `low > high` simply produces values in
        `(high, low]`, and `low == high` returns `low`. The affine map can
        round to `high` for extremely wide ranges, so treat the upper endpoint
        as exclusive only up to floating-point rounding.
        """
        return low + (high - low) * self.uniform()

    def randint(self, low: int, high: int) -> int:
        """Draw an integer uniformly from `low` (inclusive) to `high` (exclusive).

        Unbiased by rejection, not by a bare modulo: `2**64` is generally not
        a multiple of the span, so words at or above the largest multiple of
        the span are discarded and redrawn. The number of words consumed is
        therefore not fixed, but it is a deterministic function of the state,
        which is all reproducibility requires.

        Raises `ValueError` if `high <= low`, or if the span exceeds `2**64`
        and so cannot be covered by one 64-bit draw.
        """
        span = high - low
        if span <= 0:
            raise ValueError("high must be greater than low (%s <= %s)" % (high, low))
        if span > _TWO64:
            raise ValueError("high - low must be at most 2**64 (got %s)" % span)

        limit = _TWO64 - (_TWO64 % span)
        while True:
            value = self.next_uint64()
            if value < limit:
                return low + value % span

    def sample_distinct(
        self, count: int, upper: int, exclude: int | None = None
    ) -> list[int]:
        """Draw `count` distinct indices from `range(upper)`, omitting `exclude`.

        This is the primitive Differential Evolution needs: picking three
        mutually distinct population members that are also distinct from the
        current one. `exclude` is ignored when it is `None` or already outside
        `range(upper)`, so a caller need not special-case the boundary.

        The result is in draw order, not sorted, and is uniform over ordered
        selections. Two strategies are used, chosen by a threshold on `count`
        rather than by chance, so the choice is itself deterministic:

        * **Rejection** when fewer than half the available indices are wanted
          — the common case, where redraws are rare and no `O(upper)` scratch
          list is built.
        * **Partial Fisher-Yates** otherwise, which terminates in exactly
          `count` draws. Rejection degenerates into the coupon-collector
          problem as `count` approaches the number of available indices, so
          the near-exhaustive case gets the algorithm with a hard bound.

        Raises `ValueError` if `count` is negative or exceeds the number of
        available indices — the error a too-small population produces, and the
        reason it names both numbers.
        """
        if count < 0:
            raise ValueError("count must not be negative (got %s)" % count)

        excluded = exclude is not None and 0 <= exclude < upper
        available = upper - 1 if excluded else upper
        if available < 0:
            available = 0
        if count > available:
            raise ValueError(
                "cannot draw %s distinct indices from %s available "
                "(upper=%s, exclude=%s)" % (count, available, upper, exclude)
            )
        if count == 0:
            return []

        omitted = exclude if excluded else None
        if 2 * count > available:
            return self._sample_by_shuffle(count, upper, omitted)
        return self._sample_by_rejection(count, upper, omitted)

    def _sample_by_rejection(
        self, count: int, upper: int, omitted: int | None
    ) -> list[int]:
        """Draw distinct indices by redrawing whenever an index repeats.

        `omitted` is seeded into the `seen` set, so an excluded index is
        rejected by the same test that rejects a duplicate. Only membership in
        `seen` is consulted, never its iteration order, so the result depends
        solely on the draw sequence.
        """
        chosen: list[int] = []
        seen: set[int] = set()
        if omitted is not None:
            seen.add(omitted)

        while len(chosen) < count:
            candidate = self.randint(0, upper)
            if candidate in seen:
                continue
            seen.add(candidate)
            chosen.append(candidate)
        return chosen

    def _sample_by_shuffle(
        self, count: int, upper: int, omitted: int | None
    ) -> list[int]:
        """Draw distinct indices by a partial Fisher-Yates shuffle.

        The candidate list holds every index except `omitted`. Each round
        picks a position uniformly from the unconsumed prefix, takes that
        index, and backfills the hole with the last unconsumed entry — the
        standard in-place selection sample, which needs exactly one `randint`
        per index drawn.
        """
        candidates = [index for index in range(upper) if index != omitted]
        remaining = len(candidates)

        chosen: list[int] = []
        for _ in range(count):
            position = self.randint(0, remaining)
            chosen.append(candidates[position])
            remaining -= 1
            candidates[position] = candidates[remaining]
        return chosen

    def normal(self) -> float:
        """Draw a standard normal deviate (mean `0`, variance `1`).

        The Box-Muller transform, used by the Simulated Annealing
        perturbation. The radius is drawn from `1 - uniform()` rather than
        `uniform()` so that the argument of `log` lies in `(0, 1]` and can
        never be `0`; `uniform` itself can return exactly `0.0`.

        Box-Muller produces two independent deviates per pair of uniforms, but
        only the cosine one is returned and the sine one is dropped rather than
        cached for the next call. That costs one extra pair of words per two
        deviates and buys an invariant worth more than the words: every call
        consumes exactly two 64-bit words, so the state after `n` calls depends
        on `n` alone and not on whether some earlier call left a spare behind.
        """
        radius = math.sqrt(-2.0 * math.log(1.0 - self.uniform()))
        angle = 2.0 * math.pi * self.uniform()
        return radius * math.cos(angle)


def derive_stream(seed: int, stream: int) -> RandomStream:
    """Return the stream identified by `seed` and the index `stream`.

    The named entry point for the splitting discipline: a worker, a population
    member, a restart, or a generation asks for its own stream by index and
    gets a generator no other unit of work shares.

    ```python
    seed = 0
    members = [derive_stream(seed, index) for index in range(population_size)]
    ```

    The returned stream depends only on `(seed, stream)`. Calling this twice
    with the same pair — in one process, in a worker isolate, in a later run —
    yields two generators that emit identical sequences.
    """
    return RandomStream(seed, stream)
