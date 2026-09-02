# Production optimization corpus

This directory is the backend-neutral correctness, failure, differential, and
performance evidence for `sagejs.numerics.optimization`. It complements the
broader backend-selection study in `bench/numerical-optimization/`; it does not
replace that study or weaken its gates for future cminpack/NLopt backends.

The declarative `corpus.json` contains smooth, nonsmooth, tiny-scale, boundary,
active and fixed-bound, nonlinear-system, stationary-maximum, rank-deficient,
ill-conditioned, residual scales from `1e-200` through `1e200`, unresolved
variable scaling, fitting, nonfinite, malformed callback, allocation ceiling,
cancellation, solver/validation budget, false-derivative, method-envelope, and
unsupported-constraint cases. Acceptance fails closed when an expected value,
objective, residual, diagnostic, validation receipt, or exact method identity
is absent. `corpus.schema.json` keeps formulas and thresholds separate from the
ordinary-Python adapter in `run_portable.py`; `receipt.schema.json` covers the
checked-in correctness, oracle, and performance receipt families.

Run the portable fallback corpus with:

```sh
python3 bench/numerics/optimization/run_portable.py \
  --samples 3 --output /tmp/sagejs-optimization-corpus.json
```

Run the development-only SciPy 1.18 differential oracle with:

```sh
python3 bench/numerics/optimization/scipy_oracle.py \
  --output /tmp/sagejs-optimization-scipy.json
```

The oracle receipt labels exact method-family comparisons separately from
mathematical comparisons. In particular, SciPy L-BFGS-B is only a mathematical
oracle for Sage.js `projected-bfgs`; the two method identities are not treated
as interchangeable. Likewise, the portable damped Gauss-Newton method does not
claim MINPACK identity. Every oracle case independently checks the expected
Sage.js method name.

After `pnpm build`, collect matched CPython and Sage.js dynamic timings with:

```sh
node bench/numerics/optimization/performance.cjs \
  --samples 5 --output /tmp/sagejs-optimization-performance.json
```

The performance runner constructs problems outside timing, performs one
warmup, retains every sample, includes callbacks and independent validation,
disables native execution, and reports cold process time separately. It also
measures summary versus iteration tracing; summary is the production default
because bounded semantic trace materialization is intentionally not free.

The committed receipts are Linux x64 evidence only. They do not qualify a
browser, SEA, Linux ARM64, macOS ARM64, Windows x64, cminpack, NLopt, or
four-platform release claim.
