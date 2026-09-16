# Validated keyword binding fast path

Base: merged PR #297 (`e39667e49acfef1dcec77c18cdf96f35c26493c6`).

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

The idle `bench-1` host ran Node 26.5.1. The merged-#297 and candidate artifacts
were alternated for ten isolated process samples per case; the first three were
discarded. Each sample performs 100,000 checked operations, excluding compiler
and process startup.

| Case | Merged #297 | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| keyword function | 315.64 ms | 279.87 ms | 11.3% faster | 8.02 ms | 34.9x |
| immediate keyword method | 378.62 ms | 345.16 ms | 8.8% faster | 8.24 ms | 41.9x |
| keyword construction and method | 1094.40 ms | 1048.30 ms | 4.2% faster | 29.59 ms | 35.4x |

These remain substantial CPython-relative cliffs. The result removes redundant
binding work; it does not claim that keyword calls or construction are close to
CPython.

The merged-#297 artifact SHA-256 is
`4d14a79d3ec37759c4ec16149e0a4678a78baf3ac5f8f3f4b103f63f3a610ce5`.
The measured candidate artifact SHA-256 is
`b07224678cd44caa6ef7982eb1c4e1e75fae5de64b7c48ff2adccb61e2174b33`.
It is 148 bytes larger than the 24,516,818-byte merged-#297 standalone
artifact.

## Qualification

- Focused Python/Sage keyword, method, callable-instance, and construction
  regressions pass, including a CPython oracle.
- The final source-current build completes in 7m 26s after converging in two
  compiler passes.
- All 224 portable test files pass.
- Strict CPython syntax, Ruff 0.16.0 formatting, and Pyright pass for 404
  modules with zero errors.
- All six traitlets integration checks and the pinned decorator 5.2.1 workflow
  pass.
- Generated documentation is current. The shared core is 902,978 / 903,000
  source bytes, and startup/browser budgets remain unchanged.
- Browser and four-platform CI remain merge-owned qualification.

No release is implied.
