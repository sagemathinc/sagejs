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
| keyword function | 280.073 ms | 279.593 ms | 0.2% faster | 10.657 ms | 26.2x |
| immediate keyword method | 346.293 ms | 286.310 ms | 17.3% faster | 11.016 ms | 26.0x |
| empty construction | 42.201 ms | 37.417 ms | 11.3% faster | 8.135 ms | 4.6x |
| no-op initializer | 61.319 ms | 61.773 ms | 0.7% slower | 12.951 ms | 4.8x |
| positional construction and method | 710.800 ms | 660.384 ms | 7.1% faster | 24.103 ms | 27.4x |
| keyword construction and method | 1046.434 ms | 985.151 ms | 5.9% faster | 38.521 ms | 25.6x |

The no-op row is unchanged within ordinary run variance; no regression or
improvement is claimed. The remaining 25–27x call/construction gaps are still
performance cliffs.

Source-current polymorphic and mutation-heavy medians are 302.384 ms versus
12.197 ms for CPython (24.8x), and 275.392 ms versus 10.692 ms (25.8x),
respectively. These rows qualify cache invalidation and changing receiver shapes;
they are not a before/after speedup claim.

The previous standalone SHA-256 is
`27fbbd48cdab5abc8e1e62beae40300f5e58ab8c7a77a03c37e50feaa7908f5e`.
The candidate SHA-256 is
`2a02571af77a41b134b51e4591ff4a3511b53a3345cab488fd8eac43ca3e25e8`.
The candidate standalone is 24,517,644 bytes, 121 bytes larger than the
comparison artifact.

## Qualification

- The frozen source-current build completed in 7m 56s.
- All 37 focused method, mutation, descriptor, runtime, and traitlets checks pass.
- All 224 portable test files pass, including startup and browser-policy checks.
- Strict CPython syntax, Ruff 0.16.0 formatting, and Pyright pass for 404 modules.
- The package graph passes at 902,866 / 903,000 core-runtime bytes; no budget was
  changed.
- The pinned upstream traitlets import and notification/failure workflow passes.

Four-platform and production-browser execution remain CI-owned qualification.
No release is implied.
