# Exact primitive integer subtraction and multiplication

Base: `74e6e4c09` (the qualified PR #311 exact in-place-addition head).

## Change

Exact subtraction and multiplication still routed safe JavaScript integers
through Python-level type discovery, overflow checks, and repeated fallback
branches. A compact shared boundary now classifies both operands once for
subtraction or multiplication. Safe results stay numbers; unsafe results are
recomputed with `BigInt` before precision can be lost.

The same boundary handles exact `-=` and `*=` before generic in-place dispatch.
Objects still take `__isub__`/`__imul__` first and then the ordinary binary
fallback. Integral-valued floats remain boxed and therefore take the float
path; strings, unsafe foreign numbers, Sage elements, and arbitrary objects
retain their existing dispatch. Focused integration checks cover overflow,
booleans, floats, strings, custom in-place methods, and binary-method fallback.

An initially unified add/subtract/multiply boundary was rejected: controlled
measurements found reproducible 5.15% `+` and 4.22% `+=` regressions. The final
design leaves the already-qualified exact-addition helper unchanged and uses a
separate compact subtraction/multiplication boundary. This preserves addition
throughput while remaining 300 bytes inside the unchanged core budget.

## Controlled measurements

An idle `bench-1` host ran Node 26.5.1 and CPython 3.12.3 in ten alternating
fresh processes per exact artifact. Each process checked its result. The first
three samples were discarded and the table reports medians for one million
bounded primitive operations. Compilation and startup are outside the measured
regions.

| Case | Previous | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| `+` | 30.745 ms | 31.112 ms | flat (+1.19%) | 30.009 ms | 1.04x |
| `-` | 209.612 ms | 30.034 ms | 85.67% faster | 30.004 ms | 1.00x |
| `*` | 247.667 ms | 46.892 ms | 81.07% faster | 30.437 ms | 1.54x |
| `+=` | 31.274 ms | 31.114 ms | flat (-0.51%) | 34.022 ms | 0.91x |
| `-=` | 281.122 ms | 45.251 ms | 83.90% faster | 34.306 ms | 1.32x |
| `*=` | 266.672 ms | 28.395 ms | 89.35% faster | 35.018 ms | 0.81x |

The standalone shrinks from 24,425,109 to 24,424,751 bytes. Its previous and
candidate SHA-256 digests are respectively
`11046649bbff04a86428df6f0b3857a76a3e4c7eeca55aebb48a76c4b1ac2538` and
`e3918a24ab10924a21eee11b2528826bbc7e9eb7f4017f479f4ea87a6320882b`.
The checked workload is `bench/python-exact-arithmetic.py`.

These rows close the demonstrated subtraction and multiplication micro-cliffs;
they do not close keyword binding, initialized construction, cold compilation,
or arbitrary object arithmetic.

## Qualification

- The frozen source-current candidate and baseline builds passed all eight
  stages in 8m 03s and 7m 58s respectively.
- All 225 portable files pass. The differential corpus matches its baseline:
  505 passes and three reviewed intentional incompatibilities across 508 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors.
- The shared-bootstrap, runtime-intrinsic, and Python integration checks cover
  exact boundaries and dispatch fallbacks. Generated documentation and merge
  invariants are current.
- Pinned traitlets notification/failure and pyparsing workflows pass through
  the production loader.
- The package graph remains inside the unchanged core-runtime budget at
  902,700 / 903,000 bytes. The candidate standalone is 358 bytes smaller.

Platform and browser qualification remain CI-owned. PR #311 is a prerequisite;
this follow-up must not be presented as independently mergeable until that
qualified head reaches `origin/main`. No release is implied.
