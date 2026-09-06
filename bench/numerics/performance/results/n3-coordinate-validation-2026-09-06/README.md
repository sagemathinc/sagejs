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
architecture checks pass. Browser packaging and four-platform qualification of
this change remain pending.

Reproduce without overwriting prior evidence:

```sh
node bench/numerics/performance/permutation-validation.cjs NEW_RECEIPT.json
```
