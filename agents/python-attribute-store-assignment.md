# Python ordinary-store assignment fast path

Base: `d317a30b7` (`origin/main` after PR #314).

## Change

The mutation-safe ordinary-store cache still used `Object.defineProperty` for
every proven write. That operation is appropriate when storage is first
established or an exceptional host layout must be repaired, but it is much
more expensive than updating an ordinary writable data property.

The fast path now distinguishes three cases after the existing prototype/name,
descriptor-epoch, namespace, and `__setattr__` proof succeeds:

- a tracked own writable, enumerable, configurable data property is updated
  directly;
- a new extensible ordinary field is assigned directly and accepted only after
  its own data-property descriptor is observed; and
- `__proto__`, accessors, non-extensible receivers, and any unexpected layout
  retain `Object.defineProperty`.

The field registry is updated only after storage succeeds. The existing cache
still excludes native receivers and invalidates for class mutation, descriptor
changes, custom hooks, namespace exposure/replacement, and class reassignment.
Focused tests additionally prove exact property flags, `__proto__` isolation,
accessor replacement, and non-extensible failure behavior. In particular, a
tracked property that is later frozen retains the original `TypeError`, message,
and stored value; a configurable own accessor is replaced without invoking its
setter, matching the prior `Object.defineProperty` path. A writable but
non-configurable tracked property also retains the original redefinition error,
and an externally changed non-enumerable property is restored to the ordinary
enumerable layout rather than silently preserving that mutation.

Merging current main initially put the core runtime 179 bytes over its unchanged
budget. Compacting the existing private exact-integer-add JavaScript boundary,
without changing its classification or promotion logic, recovered that space.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each checked, source-current artifact; the first
three samples were discarded. Compilation and startup are outside the regions.

The local-variable store benchmark performs two warmed ordinary assignments per
iteration for one million iterations:

| Case | Fresh main | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| warmed stores | 556.658 ms | 255.291 ms | **54.1% faster** | 30.056 ms | 8.49x |

The shared 100,000-operation call/construction matrix shows that unrelated rows
remain flat while field-assigning construction also benefits:

| Case | Fresh main | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 19.308 ms | 19.457 ms | flat | 8.876 ms | 2.19x |
| keyword function | 133.290 ms | 133.945 ms | flat | 10.033 ms | 13.35x |
| immediate keyword method | 193.573 ms | 192.449 ms | flat | 10.438 ms | 18.44x |
| empty construction | 6.502 ms | 6.592 ms | flat | 7.591 ms | 0.87x |
| no-op initializer | 38.974 ms | 38.880 ms | flat | 11.903 ms | 3.27x |
| positional construction and method | 240.282 ms | 217.305 ms | **9.6% faster** | 22.915 ms | 9.48x |
| keyword construction and method | 477.201 ms | 450.262 ms | **5.7% faster** | 37.261 ms | 12.08x |

The call/construction main artifact SHA-256 is
`8ee745bc0e77e93b460d1493a0b2b704408706304a1c19d2cb333982c009d18c`
(24,387,520 bytes). The candidate is
`71459156101fe88167f1bb291214b881b4103393b7c2cfb0931a54126ef2020e`
(24,387,563 bytes), 43 bytes larger. The isolated store artifacts are
`8c1ffa69cc883e964c795e8d6777b013705d3f336d8de44fa7f59e1f4b47f551`
(24,350,946 bytes) for main and
`ca41a2914d4fb3f57f8b59dc6cb0aee048e75a85f49fae67105f64a7bdb77141`
(24,350,927 bytes) for the candidate, 19 bytes smaller.

Warmed stores are no longer a default 10x cliff under the project ratio rule,
but remain substantially slower than CPython. Construction and keyword calls
remain open cliffs; this result does not close M5.

## Qualification

- The reviewer-repaired, current-main build converged in two passes and
  completed in 7m 28s.
- All 225 portable files and 18 directly focused/runtime checks pass.
- The 508-case CPython 3.14.4 differential baseline matches: 505 passes and
  three reviewed intentional incompatibilities.
- The mutation fixture passes under CPython and Sage.js; all six traitlets
  checks and the pinned attrs 25.4.0/decorator 5.2.1 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules.
- Generated documentation and merge invariants pass. The current-main core
  runtime is 902,811/903,000 bytes. No source, startup, browser, or performance
  budget changed. The local host lacks the optional FLINT addon, so the broad
  compiler and integration commands stop only at their native-dependent
  fixtures; all reached non-native fixtures pass, and CI owns the native
  four-platform rerun.

The branch is integrated directly onto fresh main and is not a release action.
