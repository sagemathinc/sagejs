# Exact primitive integer bitwise operations

Base: `24c152e76` (source-current exact-power predecessor, including merged
`origin/main` through PR #311).

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
| `12345 & 37` | 265.694 ms | 36.480 ms | -86.27% | 1.37x |
| `12345 \| 37` | 253.132 ms | 33.403 ms | -86.80% | 0.95x |
| `12345 ^ 37` | 264.906 ms | 34.209 ms | -87.09% | 0.95x |

The eight untouched addition, subtraction, multiplication, power, and
augmented-operation controls move by at most 3.20%; six are within 1.37%.
This is a hot-loop result, not a universal operation cost: V8 may tier,
specialize, or deoptimize differently for polymorphic surrounding code.

The checked source is represented in `bench/python-exact-arithmetic.py`. The
compiled identical-source artifact shrinks by 2,883 bytes:

- benchmark source: 1,932 bytes,
  `4abb1d99b48f724934c48f9548c6cd1648996e0b6bbef77661fecbdad3583fca`;
- predecessor: 24,428,500 bytes,
  `06e998d0abb1d7c7956a8f0541b1e19a455e480280ed69b13c5510908ed106e1`;
- candidate: 24,425,617 bytes,
  `b0e98eb024a68b730987b24842f8e6c2de4d076b9543105e16c78981318d149d`.

The retained remote receipt directory is
`bench-1:/home/user/python-exact-bitwise-mainline.wH61yD`.

## Qualification

- Commit `10a046c291db78ec07bb8c787f06d072a60ae557` completed all
  eight build stages in 7m 46s. Its v3 build receipt records Node 26.8.1,
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
- Core runtime remains under the unchanged ceiling at 902,686 / 903,000 bytes.

Platform/browser qualification remains CI-owned, and missing optional native
addons are not counted as passes. No release is implied.
