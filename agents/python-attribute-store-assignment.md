# Python ordinary-store assignment fast path

Base: `3fa9d4eb3` (`agent/python-attribute-read-cache`, queued behind PR #303).

## Change

The mutation-safe ordinary-store cache still used `Object.defineProperty` for
every proven write. That operation is appropriate when storage is first
established or an exceptional host layout must be repaired, but it is much
more expensive than updating an ordinary writable data property.

The fast path now distinguishes three cases after the existing prototype/name,
descriptor-epoch, namespace, and `__setattr__` proof succeeds:

- a tracked own data property is updated directly;
- a new extensible ordinary field is assigned directly and accepted only after
  its own data-property descriptor is observed; and
- `__proto__`, accessors, non-extensible receivers, and any unexpected layout
  retain `Object.defineProperty`.

The field registry is updated only after storage succeeds. The existing cache
still excludes native receivers and invalidates for class mutation, descriptor
changes, custom hooks, namespace exposure/replacement, and class reassignment.
Focused tests additionally prove exact property flags, `__proto__` isolation,
accessor replacement, and non-extensible failure behavior.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each checked artifact; the first three samples
were discarded. Compilation and startup are outside the regions.

The local-variable store benchmark performs two warmed ordinary assignments per
iteration for one million iterations:

| Case | Read-cache base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| warmed stores | 551.212 ms | 256.924 ms | **53.4% faster** | 30.087 ms | 8.5x |

The shared 100,000-operation call/construction matrix shows that unrelated rows
remain flat while field-assigning construction also benefits:

| Case | Read-cache base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 80.261 ms | 80.421 ms | flat | 8.670 ms | 9.3x |
| keyword function | 200.246 ms | 200.453 ms | flat | 9.874 ms | 20.3x |
| immediate keyword method | 258.338 ms | 258.112 ms | flat | 10.301 ms | 25.1x |
| empty construction | 36.738 ms | 36.739 ms | flat | 7.592 ms | 4.8x |
| no-op initializer | 61.432 ms | 60.556 ms | flat | 11.748 ms | 5.2x |
| positional construction and method | 314.040 ms | 284.696 ms | **9.3% faster** | 22.623 ms | 12.6x |
| keyword construction and method | 563.263 ms | 532.505 ms | **5.5% faster** | 37.275 ms | 14.3x |

The common base artifact SHA-256 is
`6a1da785b2bb4e99b1a693a7b48891e9a1f336709b4780fdac0f725b34691e01`
(24,442,633 bytes). The candidate is
`2470c310864ee70e986b72cfdf67d28113334c048db1bc535075c44878487f0a`
(24,442,916 bytes), 283 bytes larger. The isolated benchmark artifacts are
`7d0e7e216e4b79f15c47edb649d5fca9f40ffd739c4f677af17e73422fd77243`
and `55534d2b7520aef89f656c30f36608e29ac2806c72bcddf11e96c86659ffcff0a`.

Warmed stores are no longer a default 10x cliff under the project ratio rule,
but remain substantially slower than CPython. Construction and keyword calls
remain open cliffs; this result does not close M5.

## Qualification

- The final exact-source build converged in two passes and completed in 7m 53s.
- All 225 portable files and 87 focused compiler/runtime checks pass.
- The mutation fixture passes under CPython and Sage.js; all six traitlets
  checks and the pinned attrs 25.4.0/decorator 5.2.1 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules.
- Generated documentation and merge invariants pass. Core runtime is
  902,948/903,000 bytes. No source, startup, browser, or performance budget
  changed.

The branch remains queued behind the read-cache integration and is not a
release action.
