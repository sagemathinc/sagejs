# Numerical surface inventory

This inventory is the P0 baseline for the agent-first numerical laboratory. It
describes what exists, what is an oracle rather than a runtime dependency, and
where compatibility syntax ends and canonical Sage.js semantics begin. The
machine-readable implemented-surface ledger is
[`surface.json`](surface.json). It currently contains 49 implemented
capabilities and 22 implemented frontend operations.

The ledger is generated from the live public capability and frontend
registries. `pnpm architecture:numerics` fails when an implemented capability
or adapter is added, removed, renamed, reclassified, or changes its
method/language surface without regenerating and reviewing the ledger. There
is no independent hardcoded “required operations” list that can quietly drift
behind the callable API.

`surface.json` is not a roadmap or a product-wide unsupported-operation ledger:
the live registries contain callable implemented operations, so the generator
does not manufacture rows for unavailable APIs. Unsupported methods and
translation targets are classified in their reviewed domain support matrices
and in [`multilingual/support-matrix.json`](multilingual/support-matrix.json).
The qualification corpus and capability specifications provide executable
product evidence, but there is not yet a checked one-to-one
surface-row-to-test-case index. Do not claim that every ledger row is
individually receipt-qualified unless a final candidate's authenticated P8
artifacts establish that fact.

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

The current explicitly deferred product areas include fixed-point iteration,
nullspace and pseudoinverse APIs, multidimensional quadrature, nonlinear
constraints, complex-state and DAE ODEs, multidimensional FFTs, advanced sparse
eigensystems, rigorous enclosures, arbitrary precision, and GPU execution.
Their absence from `surface.json` is not an implementation claim.

Implementation targets and receipt qualification are different claims. The
former records intended platforms and runtimes. The latter is empty unless
exact retained receipt digests authenticate those platform/runtime rows.
