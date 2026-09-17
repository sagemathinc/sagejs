# Exact primitive integer bitwise operations

Base: `18de35d58` (source-current PR #315 exact-power predecessor, including
merged exact binary and shift paths).

## Change

Exact `&`, `|`, and `^` previously repeated Python-level type classification,
safe-integer bounds checks, BigInt conversion, and normalization before object
dispatch. A dedicated shared primitive boundary now handles booleans, ordinary
signed 32-bit numbers, and wider exact integers. Boolean/boolean operations
remain booleans; mixed boolean/integer operations remain integers; wide and
negative values use BigInt's unbounded two's-complement semantics. Nonprimitive
values still follow `__and__`/`__rand__`, `__or__`/`__ror__`, and
`__xor__`/`__rxor__`; augmented operations still try their `__i*__` methods
before the existing fallback.

An initial implementation added bitwise cases to the arithmetic boundary. It
improved the target rows but reproducibly slowed exact power by 9.18% in a
20-pair overlap run. The accepted design uses a separate compact bitwise
boundary, leaving the already-qualified addition, subtraction, multiplication,
and power helper shapes unchanged.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes compared frozen identical-source artifacts. Each
process checked its result; the first three chronological rounds were excluded
before the predetermined seven-sample medians. Times are for one million
operations:

| operation | predecessor | candidate | change | candidate / CPython |
| --- | ---: | ---: | ---: | ---: |
| `12345 & 37` | 267.327 ms | 35.281 ms | -86.80% | 1.27x |
| `12345 \| 37` | 255.088 ms | 33.846 ms | -86.73% | 0.94x |
| `12345 ^ 37` | 264.580 ms | 34.151 ms | -87.09% | 0.94x |

No untouched addition, subtraction, multiplication, power, or augmented
operation regresses more than 1.23%; `+=` improves 3.94% and the other seven
controls remain within 1.30%.
This is a hot-loop result, not a universal operation cost: V8 may tier,
specialize, or deoptimize differently for polymorphic surrounding code.

The checked source is represented in `bench/python-exact-arithmetic.py`. The
compiled identical-source artifact shrinks by 2,883 bytes:

- benchmark source: 1,932 bytes,
  `4abb1d99b48f724934c48f9548c6cd1648996e0b6bbef77661fecbdad3583fca`;
- predecessor: 24,428,515 bytes,
  `3b298d91bc77fd98753dd83d5a7a3930b32ed11161c75ecd8c0b5677685fa3f7`;
- candidate: 24,425,632 bytes,
  `67039e9834197ddebd56dfd81e30b3b9fec355dec7b1a07806f96f3d188f4f51`.

The retained remote receipt directory is
`bench-1:/home/user/python-exact-bitwise-power-current.6spN5Q`.

## Qualification

- Commit `c9bf15cf3` completed all eight build stages in 7m 46s. Its v3 build
  receipt records Node 26.8.1,
  V8 14.6, and the frozen workspace identity.
- Focused primitive, boolean, wide/negative integer, augmented, and custom
  dispatch tests pass.
- All 225 portable files pass. The 508-case CPython 3.14.4 differential corpus
  matches its baseline: 505 passes and three reviewed intentional
  incompatibilities.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors. Generated documentation and merge invariants pass.
- The pinned pyparsing parse workflow and traitlets import,
  notification/failure workflow pass.
- Core runtime remains under the unchanged ceiling at 902,724 / 903,000 bytes.

Platform/browser qualification remains CI-owned, and missing optional native
addons are not counted as passes. No release is implied.
