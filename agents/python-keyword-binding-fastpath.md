# Validated keyword binding fast path

Base: `origin/main` at `8289d06a238362f92ebe970861b20a34043c36ce`,
including merged PRs #296 and #297.

## Change

Generated Python functions already consume defaulted and keyword-only values
from the marked keyword packet. The shared binder nevertheless used to allocate
a second argument array, copy every positional and keyword value into it,
delete consumed keys, and then invoke a generated prologue which inspected the
packet again.

The binder now validates packet keys in source order and passes the original
argument vector directly when every positional keyword names a defaulted
parameter. Required-name keywords retain the general binding path. That path
now reuses the ephemeral argument vector and appends the residual packet rather
than allocating and copying another array. Positional-only collisions,
keyword-only arguments, `*args`, `**kwargs`, missing arguments, duplicate
values, and unexpected keywords retain their generated-function validation.
Error selection follows CPython's keyword insertion order when an unexpected
name and a duplicate are both present.

Signature and default metadata are read live on every call. No cache is added,
so runtime mutation of defaults and callable metadata continues to take effect.
The callable, receiver, descriptor, and evaluation-order machinery is unchanged.

## Controlled measurements

The idle `bench-1` host ran Node 26.5.1. The source-current main and candidate artifacts
were alternated for ten isolated process samples per case; the first three were
discarded. Each sample performs 100,000 checked operations, excluding compiler
and process startup.

| Case | Main | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| keyword function | 313.14 ms | 283.20 ms | 9.6% faster | 8.02 ms | 35.3x |
| immediate keyword method | 375.34 ms | 343.33 ms | 8.5% faster | 8.24 ms | 41.7x |
| keyword construction and method | 1081.44 ms | 1049.67 ms | 2.9% faster | 29.59 ms | 35.5x |

These remain substantial CPython-relative cliffs. The result removes redundant
binding work; it does not claim that keyword calls or construction are close to
CPython.

The source-current main artifact SHA-256 is
`dfcdcd90c1500e9c066c2350a473ba800fbdcd695555d8d855051f6fcca83eed`.
The measured candidate artifact SHA-256 is
`27fbbd48cdab5abc8e1e62beae40300f5e58ab8c7a77a03c37e50feaa7908f5e`.
It is 148 bytes larger than the 24,517,375-byte source-current main standalone
artifact.

## Qualification

- Focused Python/Sage keyword, method, callable-instance, and construction
  regressions pass, including a CPython oracle.
- The final source-current build completes in 7m 29s after converging in two
  compiler passes.
- All 224 portable test files pass.
- Strict CPython syntax, Ruff 0.16.0 formatting, and Pyright pass for 404
  modules with zero errors.
- All six traitlets integration checks and the pinned decorator 5.2.1 workflow
  pass.
- Generated documentation is current. The shared core is 902,912 / 903,000
  source bytes, and startup/browser budgets remain unchanged.
- Browser and four-platform CI remain merge-owned qualification.

No release is implied.
