# Genus-3 radius-6 height acceptance — Linux x64

Source commit: `cc61779bb7c8a8c609d5c6aa724830e0486110f2`

Host: `cocalc-vm-51c5044ca6d3406d983e0f10` (AMD EPYC 7B13)

Node: `v22.22.2`

The Sage.js rows all return the complete public canonical height with the exact
finite plan replayed.  The result is refinement-stable but nonrigorous:
`theta_refinement_stable=true`, `finite_exact=true`, and
`rigorous=false`.  “Prepared first” excludes construction of the explicitly
verified period object but still includes the full exact finite plan and the
first Abel/theta preparation.  “Warm” is arithmetic with bounded plan/lift
cache reuse, never a cached canonical-height result.

| Workload | Median wall ms | MAD ms | Samples | Contract |
|---|---:|---:|---:|---|
| Sage.js process cold | 55797.37 | 0.00 | 1 | startup through public answer |
| Sage.js object cold | 52260.63 | 19.69 | 3 | new curve/divisor; caches cleared |
| Sage.js prepared first | 52167.40 | 0.97 | 3 | verified period supplied; Abel/theta cold |
| Sage.js warm | 22117.96 | 24.22 | 5 | prepared arithmetic; no result-cache hit |
| Historical direct process cold | 406497.25 | 0.00 | 1 | exact 302bf8ccb3e3 checkout |
| Magma process cold | 1894.71 | 0.00 | 1 | descriptive/non-gating |
| Magma object cold | 730.00 | 10.00 | 3 | descriptive/non-gating |
| Magma warm | 760.00 | 0.00 | 5 | descriptive/non-gating |

The same-host process-cold speedup is **7.29x**
(406497.25 ms direct versus
55797.37 ms prepared).  The Phase-8 5x
gate therefore passes.

Sage.js gives
`2.1403441482740588613424112263975497470400277828299`; the pinned Magma oracle gives
`2.140344148274058861323964793585361420925496626366201001308229370095855452111046427960090404459654664891147583303833777382034516531210481375968121563629849298547`.  The Sage.js absolute error is
`1.84464328121883261145311564637e-20`.

Magma timings are deliberately descriptive and non-gating.  Its transported
model `Y^2 = 1 + 4*f(x)` computes the same canonical-height scalar and the
21-decimal-digit row matches the requested 64-bit accuracy, but Magma 2.18-5
does not expose an exact finite-plan certificate or Sage.js's radius-refinement
witness.  Neither backend is labeled rigorous.
