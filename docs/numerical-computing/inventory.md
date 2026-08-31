# Numerical surface inventory

This inventory is the P0 baseline for the agent-first numerical laboratory. It
describes what exists, what is an oracle rather than a runtime dependency, and
where compatibility syntax ends and canonical Sage.js semantics begin. The
machine-readable claim ledger is [`surface.json`](surface.json).

## Existing Sage.js runtime

| Area | Existing implementation | Laboratory decision |
| --- | --- | --- |
| Scalar roots | `Expression.find_root`, top-level `find_root`, and the P1 `sagejs.numerics` engine | Implemented through one structured problem/plan/result path; the legacy scalar return is only a Sage-facing view. |
| Integration | `numerical_integral` in `src/baselib/symbolic.py`, including a portable Gauss–Kronrod path and bounded Wasm resource routes | Treat as prior implementation evidence, not automatically as the structured P2 API. Revalidate algorithms, error claims, budgets, and frontend semantics. |
| Exact and approximate matrices | Sage-compatible `matrix` objects, exact kernels, portable approximate eigensystems, and a broad `numpy.linalg` facade backed by `numpy-ts` | Reuse public matrix/vector conversion contracts. Structured numerical algorithms must independently check residuals, conditioning, and factorization identities. |
| NumPy compatibility | `src/lib/numpy.py` exposes dense arrays, ufuncs, reductions, statistics, linear algebra, FFT, and random operations through `numpy-ts` | Useful browser substrate and compatibility surface, but not the evidence authority for `sagejs.numerics`. Unsupported NumPy protocols remain explicit. |
| Arbitrary precision | Vendored `mpmath` | Use as a dynamic fallback or differential oracle where appropriate; do not imply rigorous enclosures from ordinary `mpmath` results. |
| Interpolation graphics | The Sage-compatible graphics `spline` constructor | Preserve plotting compatibility, but build numerical spline construction and diagnostics as a renderer-neutral approximation operation. |
| Plotting | Versioned `PlotSpec`, `PlotAnimation`, Plotly lowering, browser rendering, static export, and resource limits | Numerical kernels emit semantic traces and renderer-neutral specifications. They never call Plotly directly. |

## Language frontends

| Frontend | Existing numerical reach | Contract |
| --- | --- | --- |
| Sage | Broad mathematical syntax; P1 structured `numerical_root` and scalar `find_root` views | Familiar names and parents over canonical operations; intentional differences are classified and tested. |
| Python | Ordinary CPython-parseable library source plus Sage.js runtime facilities; NumPy compatibility but no SciPy runtime | The primary structured API. Source must remain usable by CPython for contract and algorithm tests. |
| MATLAB | Parser, workspace semantics, anonymous function handles, plotting translations, and P1 `fzero` | Preserve one-based/indexing and result conventions at the frontend. Supported constructs lower to canonical operations; unsupported constructs diagnose explicitly. |
| Wolfram | Parser, symbolic expressions/rules, plotting translations, and P1 `FindRoot` | Preserve rule-shaped results and option semantics at the frontend while retaining canonical evidence underneath. |

## External reference systems

NumPy, SciPy, LAPACK-class implementations, MATLAB, Wolfram Language, SageMath,
and R are differential or fixture oracles. They are not automatically selected
runtime dependencies and their success flags are never accepted as Sage.js
validation. Oracle fixtures record versions, inputs, tolerances, method
identity, and platform when these affect the comparison.

SciPy is especially important as the modern baseline for breadth and expected
behavior, but Sage.js is not attempting to reproduce its module tree. The
laboratory provides a smaller, coherent agent-readable surface with stronger
planning, evidence, explanation, and portability contracts.

## Compatibility meaning

Every claimed operation is exactly one of:

- **faithful**: documented external semantics are intentionally reproduced;
- **translated**: natural frontend syntax maps to canonical Sage.js semantics
  and any material difference is recorded;
- **extension**: a Sage.js-native structured capability; or
- **unsupported**: rejected with an explicit diagnostic rather than a vague or
  silently degraded result.

An implementation is not promoted from `unsupported` merely because a backend
contains a similarly named function. Promotion requires the domain corpus,
independent mathematical validation, failure semantics, portability evidence,
and budgets defined in `evidence-policy.json`.
