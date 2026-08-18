# OM auto-selector calibration: vector429

The production selector should continue to auto-select OM only at `p=7` for
the measured `deep-index-shallow-types-v1` region.  No complete end-to-end OM
crossover was observed at `p=2`, `p=3`, or `p=5` under a 30-second hard bound.

| Prime | compiled OM | native resource | compact Round 4 | decision |
| ---: | ---: | ---: | ---: | --- |
| 2 | censored >30.678 s | 22.529 s complete | censored | native fallback |
| 3 | censored >30.612 s | 6.396 s complete | censored >29.939 s | native fallback |
| 5 | censored >30.617 s | 2.401 s complete | censored >29.942 s | native fallback |
| 7 | 2.889 s complete | 5.569 s complete | not needed | OM, 1.93x local speedup |

The isolated OM/native matrix was measured at `13d23342`; neither
`om_maxmin.py` nor `order_resource.py` changed through `dc753f5a`.  Compact
Round-4 and current selector reruns were made at `dc753f5a`.  Those reruns
overlapped another sustained project profiler, so their censored samples are
recorded as lower bounds only and do not support crossover claims.

Run the full bounded matrix with:

```console
SAGEJS_OM_AUTO_CALIBRATION=1 \
  SAGEJS_OM_AUTO_TIMEOUT_MS=30000 \
  pnpm bench:number-field-om-auto-selector
```

Every algorithm/prime pair runs in a fresh process with its own timeout.  The
focused test independently proves that selected `p=7` equals forced OM and the
frozen external local lattice, rejects one-unit external corruption, and that
unavailable proof kernels or unmeasured small characteristics fail closed
before OM work begins.

The remaining public batch tail is therefore not removable by truthfully
expanding the current OM selector.  The next useful optimization target is the
compiled `p=2` OM type/proof pipeline itself; it must first beat the complete
native boundary before `p=2` can become eligible.
