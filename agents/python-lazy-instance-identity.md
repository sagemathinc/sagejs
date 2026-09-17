# Lazy generated-instance identity

Base: `d39c7901f` (`origin/main`, after PR #304).

## Change

Every ordinary generated class constructor defined a non-enumerable
`rho-sigma_object_id` property (spelled `ρσ_object_id` in generated code), even
though the production `id()` implementation already owns stable identity in its
runtime map. Most objects never request `id`, identity hashing, or a synthetic
default repr, so the property definition was redundant allocation work on every
construction and was duplicated in every emitted class body.

Generated instances now acquire identity lazily through the existing `id()`
map. The legacy synthetic repr asks `id(this)` instead of reading the removed
slot. Low-level subscription fallback recognizes a Python instance through its
inherited, non-writable `__bases__` class marker rather than a writable
`constructor` alias or the deleted identity slot. Tests cover repeated identity,
identity after `Object.freeze`, default repr, unsubscriptable instances,
constructor spoofing, namespace authority, and native list subclasses.

## Controlled measurement

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes compared exact base and candidate artifacts; the
first three samples were discarded. Each row contains 100,000 checked
operations.

| Case | Fresh main | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 80.148 ms | 79.762 ms | flat | 8.696 ms | 9.17x |
| keyword function | 200.161 ms | 197.381 ms | flat | 10.096 ms | 19.55x |
| immediate keyword method | 258.369 ms | 258.373 ms | flat | 10.380 ms | 24.89x |
| empty construction | 36.659 ms | 15.906 ms | **56.6% faster** | 7.762 ms | **2.05x** |
| no-op initializer | 61.181 ms | 37.599 ms | **38.5% faster** | 11.973 ms | **3.14x** |
| positional construction and method | 311.138 ms | 288.676 ms | **7.2% faster** | 22.812 ms | 12.65x |
| keyword construction and method | 571.288 ms | 522.742 ms | **8.5% faster** | 37.034 ms | 14.12x |

The exact fresh-main artifact is
`6a1da785b2bb4e99b1a693a7b48891e9a1f336709b4780fdac0f725b34691e01`
(24,442,633 bytes). The source-current candidate is
`968263eecddf3240d0d042284e3467cb4afaf2d54547dd624f7a01930a16d8e7`
(24,386,965 bytes), 55,668 bytes smaller. Empty construction is now close to
the same order of magnitude as CPython, but initialized construction and all
common call paths remain open performance cliffs.

## Qualification

- The source-current compiler converged in two passes and the full build
  completed in 7m 38s.
- All 225 portable files and the 508-case CPython differential corpus pass
  (505 passing and the same three intentional incompatibilities).
- The focused Python/Sage namespace and identity checks pass, including frozen
  instances, spoofed host constructors, and native-backed subclasses.
- All six pinned traitlets checks and the pinned attrs 25.4.0 and decorator
  5.2.1 workflows pass with checked outputs.
- Strict CPython syntax, Ruff 0.16.0, Pyright for 404 modules, documentation,
  merge invariants, and the complete architecture check pass.
- Core runtime is 902,888/903,000 bytes. No source, startup, browser, or
  performance budget was changed. The local startup check is not a passing
  receipt: 417.9 ms normalized exceeds the unchanged 400.0 ms budget. The
  source-current artifact is smaller, and merge-owned CI must supply the
  authoritative startup/browser and four-platform receipts. No release is
  implied.
