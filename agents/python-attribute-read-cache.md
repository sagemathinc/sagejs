# Python ordinary-attribute read cache

Base: `b5bcd022e` (`agent/python-setattr-cache`, stacked behind the keyword
binder and PR #301).

## Change

Every ordinary `obj.field` expression previously entered the complete Python
attribute protocol. Construction benchmarks therefore paid heavily again when
a method read fields that the initializer had just stored.

The existing ordinary-store proof now also certifies reads, but only when full
class resolution shows that `__getattribute__` is absent or is exactly
`object.__getattribute__`. Compiler-emitted reads and writes share one compact
bootstrap primitive and one prototype/name/descriptor-epoch record. Warm reads
also require a current epoch, an own property, and no exposed/replaced instance
namespace. Custom lookup at class creation never publishes a proof; installing
or deleting a hook/descriptor invalidates one; deleting the own field misses the
own-property guard; and `__class__` replacement changes the prototype key.

Native receivers and every unproved read retain full lookup. Method calls keep
their separately qualified prepared-call protocol. Tests cover custom
`__getattribute__` installation/deletion after a warm read, descriptors,
namespace exposure/replacement, field deletion, class reassignment, chained
evaluation order, attribute constructors, and direct epoch invalidation.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each result-checking standalone artifact; the
first three samples were discarded. Compilation and startup are outside the
regions. Times are warm medians for 100,000 operations.

| Case | Store-cache base | Read-cache candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 80.432 ms | 79.970 ms | flat | 8.656 ms | 9.2x |
| keyword function | 198.961 ms | 196.700 ms | 1.1% faster | 10.043 ms | 19.6x |
| immediate keyword method | 260.042 ms | 259.302 ms | flat | 10.411 ms | 24.9x |
| empty construction | 37.575 ms | 37.102 ms | flat | 7.617 ms | 4.9x |
| no-op initializer | 61.508 ms | 60.720 ms | flat | 11.870 ms | 5.1x |
| positional construction and method | 451.167 ms | 310.634 ms | **31.2% faster** | 22.472 ms | 13.8x |
| keyword construction and method | 719.502 ms | 562.726 ms | **21.8% faster** | 37.045 ms | 15.2x |

The checked decomposition in `bench/python-attribute-access.py` measures two
warmed field reads at 77.179 ms versus CPython's 6.141 ms (12.6x), two stores at
56.500 versus 2.900 ms (19.5x), and a direct two-store function body at 65.273
versus 5.660 ms (11.5x). One-, two-, and four-field construction remains
10.5–13.1x CPython. Attribute access and call binding remain open cliffs.

The base artifact SHA-256 is
`e52c5cda2df28be4b4d93c4840c024cba09dd787a2eb42ab37e8e2ea16e262ab`
(24,514,605 bytes). The candidate SHA-256 is
`6a1da785b2bb4e99b1a693a7b48891e9a1f336709b4780fdac0f725b34691e01`
(24,442,633 bytes), 71,972 bytes smaller because common reads have a shorter
emitted form.

## Qualification

- The corrected source-current build converged in two passes and completed in
  7m 30s.
- All 225 portable files pass; focused compiler, namespace, descriptor,
  custom-lookup, method, and shared-bootstrap tests pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules.
- All six traitlets checks and pinned attrs 25.4.0/decorator 5.2.1 workflows
  pass.
- Documentation and merge invariants are current. Core runtime is
  902,665/903,000 bytes; no source, startup, or browser budget changed.

The branch is intentionally held behind its prerequisites instead of being
opened as a mergeable stacked PR. Four-platform and production-browser runs
remain CI-owned. No release is implied.
