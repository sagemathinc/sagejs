# Python ordinary-attribute store cache

Base: `a50d76195` (`agent/python-keyword-binder-native`, stacked behind PR #301).

## Change

Compiler-emitted simple attribute assignments previously ran the complete
Python `setattr` protocol for every write, even after that protocol had proved
that a prototype/name pair was an ordinary instance-dictionary field. This is
particularly expensive during constructors that assign several fields.

The shared bootstrap now caches that proof after a successful full-protocol
store. A warm entry is valid only at the current global descriptor epoch and
only for instances without an exposed/replaced `__dict__` or an explicitly
assigned `__setattr__`. The fast store updates the same own-property and
instance-field representations as the authoritative slow path. Class
assignment or deletion advances the epoch, so adding/removing a data descriptor
or custom class hook returns the next write to full resolution. Changing
`__class__` changes the prototype key.

The compiler uses this helper only for simple dot assignments. Receiver and
right-hand expressions retain Python's existing exactly-once order; augmented,
dynamic, descriptor, native-receiver, and unproved writes retain their existing
paths. A focused Python/Sage oracle covers warm writes, descriptor installation
and deletion, class and explicit instance hooks, exposed and replaced
namespaces, class reassignment, and chained-assignment ordering.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten fresh
processes ran each checked standalone artifact, candidate/baseline order
alternated, and the first three samples were discarded. Compilation and startup
are outside the measured regions. Times are warm medians for 100,000 operations.

| Case | Keyword-binder base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 78.576 ms | 78.541 ms | flat | 8.563 ms | 9.2x |
| keyword function | 195.794 ms | 194.221 ms | 0.8% faster | 10.007 ms | 19.4x |
| immediate keyword method | 254.220 ms | 254.491 ms | flat | 10.356 ms | 24.6x |
| empty construction | 35.571 ms | 36.155 ms | 1.6% slower | 7.484 ms | 4.8x |
| no-op initializer | 59.818 ms | 59.738 ms | flat | 11.725 ms | 5.1x |
| positional construction and method | 629.838 ms | 440.260 ms | **30.1% faster** | 22.508 ms | 19.6x |
| keyword construction and method | 886.431 ms | 696.806 ms | **21.4% faster** | 37.057 ms | 18.8x |

The isolated empty-construction movement is small and unfavorable; no regression
or improvement is claimed without a narrower follow-up. Field-assigning
construction improves substantially, but remains roughly 19x CPython and is
still an open performance cliff.

The exact base standalone SHA-256 is
`2fc3d05a2c52155c0882198869b9ec0095e97599cb3e63cbde1ba86226afcff3`
(24,511,249 bytes). The candidate SHA-256 is
`e52c5cda2df28be4b4d93c4840c024cba09dd787a2eb42ab37e8e2ea16e262ab`
(24,514,605 bytes).

## Qualification

- The source-current build converged in two compiler passes and completed in
  7m 35s.
- All 225 portable files pass, including the new Python/Sage mutation oracle.
- Strict CPython syntax, Ruff 0.16.0 formatting, and Pyright pass for 404 modules.
- Focused namespace, descriptor, method-mutation, construction, compiler, and
  bootstrap tests pass.
- All six pinned traitlets integration checks pass, including the notification
  and failure transcript; the pinned `decorator` 5.2.1 and `attrs` 25.4.0
  workflows pass.
- Generated documentation is current. Core runtime is 902,699/903,000 bytes;
  no source, startup, or browser budget changed.

The branch is intentionally held behind the binder dependency rather than
opened as a mergeable stacked PR. Four-platform and production-browser
execution remain CI-owned qualification. No release is implied.
