# Exact primitive integer bitwise operations

Base: `cae527105` (queued exact-power stack).

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
20-pair overlap run. The accepted design uses a separate bitwise boundary;
the final overlap run leaves power and the other untouched rows within 0.27%
to 1.90% of the predecessor.

## Controlled measurements

Node 26.8.1 and CPython 3.14.4 ran ten alternating fresh processes per frozen,
identical-source artifact. Each process checked its result; the first three
sorted samples were discarded. Times are medians for one million operations:

| operation | predecessor | candidate | change | candidate / CPython |
| --- | ---: | ---: | ---: | ---: |
| `12345 & 37` | 262.285 ms | 27.766 ms | -89.41% | 1.48x |
| `12345 \| 37` | 272.047 ms | 40.439 ms | -85.14% | 1.64x |
| `12345 ^ 37` | 256.332 ms | 25.702 ms | -89.97% | 1.00x |

The checked source is represented in `bench/python-exact-arithmetic.py`. The
compiled identical-source artifact shrinks by 2,061 bytes:

- predecessor: 24,348,692 bytes,
  `0e2c96edbc5057204d737639dcfcfde83d10f5abd8bed52d423a857e73e592a6`;
- candidate: 24,346,631 bytes,
  `8ec34c8679afe077b9bffc137d3e4f682b6f73c8b675b489ece197f4255c5278`.

## Qualification

- The final frozen source completed all eight build stages in 7m 55s.
- Focused primitive, boolean, wide/negative integer, augmented, and custom
  dispatch tests pass.
- All 225 portable files pass. The 508-case CPython 3.14.4 differential corpus
  matches its baseline: 505 passes and three reviewed intentional
  incompatibilities.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors. Generated documentation and merge invariants pass.
- The pinned pyparsing parse workflow and traitlets import,
  notification/failure workflow pass.
- Core runtime remains under the unchanged ceiling at 902,960 / 903,000 bytes.

Platform/browser qualification remains CI-owned, and missing optional native
addons are not counted as passes. No release is implied.
