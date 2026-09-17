# Exact primitive integer subtraction and multiplication

Base: `7e28dad6d` (exact addition plus the queued in-place-addition follow-up).

## Change

Exact subtraction and multiplication still routed safe JavaScript integers
through Python-level type discovery, overflow checks, and repeated fallback
branches. The shared exact-integer boundary now selects addition, subtraction,
or multiplication after classifying both operands once. Safe results stay
numbers; unsafe results are recomputed with `BigInt` before precision can be
lost. The existing addition path uses the same boundary without a measurable
regression.

The same boundary now handles exact `-=` and `*=` before generic in-place
dispatch. Objects still take `__isub__`/`__imul__` first and then the ordinary
binary fallback. Integral-valued floats remain boxed and therefore take the
float path; strings, unsafe foreign numbers, Sage elements, and arbitrary
objects retain their existing dispatch. Focused integration checks cover
overflow, booleans, floats, strings, custom in-place methods, and binary-method
fallback.

## Controlled measurements

Node 26.8.1 and CPython 3.14.4 ran ten alternating fresh processes per exact
artifact. Each process checked its result. The first three sorted samples were
discarded and the table reports medians for one million bounded primitive
operations. Compilation and startup are outside the measured regions.

| Case | Previous | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| `+` | 31.687 ms | 31.788 ms | flat (+0.3%) | 22.987 ms | 1.38x |
| `-` | 214.348 ms | 34.690 ms | 83.8% faster | 22.631 ms | 1.53x |
| `*` | 262.716 ms | 51.633 ms | 80.3% faster | 22.638 ms | 2.28x |
| `+=` | 31.930 ms | 32.205 ms | flat (+0.9%) | 26.791 ms | 1.20x |
| `-=` | 290.796 ms | 49.975 ms | 82.8% faster | 26.873 ms | 1.86x |
| `*=` | 281.986 ms | 32.067 ms | 88.6% faster | 27.388 ms | 1.17x |

The standalone shrinks from 24,424,908 to 24,423,768 bytes. Its previous and
candidate SHA-256 digests are respectively
`e40fcd29e900e116676a6525eaf0c8b7392fea5e0245d9d12990b03c2da5bd7d` and
`2ab79120a75b6286230ce7dfa20757110a059805be3559728badc0d539ef06a7`.
The checked workload is `bench/python-exact-arithmetic.py`.

These rows close the demonstrated subtraction and multiplication micro-cliffs;
they do not close keyword binding, initialized construction, cold compilation,
or arbitrary object arithmetic.

## Qualification

- The frozen source-current full build passed all eight stages in 7m 46s.
- All 225 portable files pass. The differential corpus matches its baseline:
  505 passes and three reviewed intentional incompatibilities across 508
  CPython 3.14.4 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors.
- The shared-bootstrap, runtime-intrinsic, and Python integration checks cover
  exact boundaries and dispatch fallbacks. Generated documentation and merge
  invariants are current.
- The package graph remains inside the unchanged core-runtime budget at
  902,660 / 903,000 bytes.
- Seventeen portable compiler fixtures pass. Fifteen native algebra fixtures
  cannot start on this host because the optional `packages/flint` addon is
  absent; this is a missing capability rather than a passing receipt.

Platform and browser qualification remain CI-owned. No release is implied.
