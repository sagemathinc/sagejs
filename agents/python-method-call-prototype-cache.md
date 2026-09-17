# Python immediate-method prototype cache

Base: `bbc39c3a2` (`origin/main`, 2026-09-17).

## Change

Immediate method calls previously reached a valid descriptor cache through two
lookups: receiver prototype to class owner, then class owner to its method-name
map. They also executed the Python-level cache checks and result construction on
every call. The shared bootstrap helper now indexes the existing descriptor map
directly by receiver prototype after the first owner lookup and performs the
non-observable warm path as JavaScript runtime operations.

The descriptor epoch is a shared mutable cell. This is required because the
bootstrap helper and `builtins` are separate generated module facades: copying a
numeric epoch left the helper permanently stale. Class namespace snapshots read
the cell's numeric value too. Assignment, deletion, class finalization, and
instance-dictionary installation still advance the same epoch, so a stale entry
always returns to full Python attribute resolution. Instance namespaces and own
properties are checked before using the cached method.

The checked workload `bench/python-method-resolution.py` covers four receiver
prototypes and periodic class-method replacement. The focused low-level test
also proves that a warm prototype hit avoids owner lookup, while epoch changes
and explicit receiver assignments take the full fallback.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Each
standalone artifact checked its result. Ten alternating isolated processes were
run per row and the first three samples were discarded. Compilation and startup
are outside the measured regions. Times are warm medians for 100,000 operations.

| Case | Previous | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| keyword function | 302.938 ms | 301.940 ms | 0.3% faster | 10.657 ms | 28.3x |
| immediate keyword method | 362.677 ms | 305.659 ms | 15.7% faster | 11.016 ms | 27.7x |
| empty construction | 41.872 ms | 37.410 ms | 10.7% faster | 8.135 ms | 4.6x |
| no-op initializer | 61.211 ms | 62.140 ms | 1.5% slower | 12.951 ms | 4.8x |
| positional construction and method | 708.283 ms | 655.838 ms | 7.4% faster | 24.103 ms | 27.2x |
| keyword construction and method | 1064.571 ms | 994.854 ms | 6.5% faster | 38.521 ms | 25.8x |

The no-op row is unchanged within ordinary run variance; no regression or
improvement is claimed. The remaining 25–27x call/construction gaps are still
performance cliffs.

Polymorphic calls improve from 376.351 to 322.267 ms (14.4%) versus CPython's
11.989 ms (26.9x). Mutation-heavy calls improve from 358.133 to 299.669 ms
(16.3%) versus CPython's 10.709 ms (28.0x). These rows exercise four receiver
shapes and repeated epoch invalidation rather than only a monomorphic cache hit.

The previous standalone SHA-256 is
`3b8e00597109eaa032a92afe3797e5134e8cbe0ca63925579a1fa004f01ac690`.
The candidate SHA-256 is
`f4725e1f21f19e90b96b7408d4784800c73486cb6e518c16c88bb03abf22efe6`.
The candidate standalone is 24,517,041 bytes, 194 bytes smaller than the
comparison artifact. Both artifacts were built from the exact parent/candidate
pair after PR #300 merged.

## Qualification

- The frozen source-current build completed in 7m 42s.
- All 37 focused method, mutation, descriptor, runtime, and traitlets checks pass.
- All 224 portable test files pass, including startup and browser-policy checks.
- Strict CPython syntax, Ruff 0.16.0 formatting, and Pyright pass for 404 modules.
- The package graph passes at 902,439 / 903,000 core-runtime bytes; no budget was
  changed.
- The pinned upstream traitlets import and notification/failure workflow passes.

Four-platform and production-browser execution remain CI-owned qualification.
No release is implied.
