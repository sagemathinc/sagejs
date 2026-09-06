# Exact coordinate-row validation shortcut

Development evidence only; N3's public-call target remains unmet.

The independent product validator proves zero or coordinate rows from actual
immutable finite entries, never from a backend's permutation claim. Such rows
need no general dot product. Positive zero normalization preserves `math.fsum`
semantics, including signed-zero inputs. General rows still use the original
separately rounded products and `math.fsum`; callback order and counts remain
unchanged.

`local.json` records paired public LU calls with preconstructed inputs,
factorization, independent validation and result construction included. The
baseline substitutes only the generic validator body from `2a7728109`. Each
runtime uses three warmups and seven alternating paired samples. All factors,
validation records, statuses and counters agree, including across CPython and
ordinary Sage.js. Sage.js forbids loading the exact native backend.

| Matrix | CPython generic / shortcut (ms) | Sage.js generic / shortcut (ms) |
| --- | ---: | ---: |
| 8 × 8 | 0.852 / 0.810 | 49.762 / 44.609 |
| 16 × 16 | 2.938 / 2.611 | 175.435 / 127.989 |
| 32 × 32 | 14.252 / 11.686 | 964.205 / 631.953 |

This is one local Linux x64 development run, not a confidence interval or a
cross-platform claim. Input construction, serialization, startup, peak memory,
SciPy comparisons and native/browser/SEA qualification are excluded. No public
compiled selection or new dependency is introduced.

Focused source tests cover every coordinate position, duplicate ones, near-one
and subnormal coefficients, negative and signed zeros, overflow, empty shapes,
and cancellation at every callback of a rectangular selection product. The
source-level public linear-algebra corpus, strict Python (377 modules), and
architecture checks pass. The focused tests also pass on Node 22.22.2.

The lazy bundle rebuilt from current source (411 modules, eight dynamic
programs). `browsers.json` retains source/pack fingerprints for all twelve
disabled/floating/stale/missing routes in Chromium, Firefox and WebKit. Each
route passes the coordinate-row, cancellation, overflow and prepared-evaluator
tests. Its timings concern the existing root workload, not dense LU. This is
source browser integration, not a fresh complete product build, npm/SEA or
four-platform qualification; those remain open.

Reproduce without overwriting prior evidence:

```sh
node bench/numerics/performance/permutation-validation.cjs NEW_RECEIPT.json
```

## Where the remaining time goes

`phase-profile.json` retains a separate instrumented ordinary-Sage.js run after
the bundle build finished. It wraps the existing operation phases, checks the
same values/validation/status against an uninstrumented call, and excludes
input construction. Seven measured calls follow three warmups. The 32-square
phase medians are 51.1 ms factorization, 436.8 ms independent validation,
115.8 ms result construction, and 28.7 ms other public overhead. Total-call
median is 634.1 ms; phase medians need not sum to that median.

These are local diagnostic timings, not a qualified speed comparison.
Reconstruction and result materialization need attention before private LU
kernel gains can deliver the public target. In particular, result construction
currently calls `factorization.to_dict()` twice; removing redundant work must
preserve detached result ownership, validation and content identities.

```sh
node bench/numerics/performance/dense-phase-profile.cjs NEW_RECEIPT.json
```
