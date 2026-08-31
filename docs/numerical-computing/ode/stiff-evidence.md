# Rosenbrock4 stiff qualification record

Qualification date: 2026-08-31. This record applies only to the ordinary-Python
Kaps–Rentrop Rosenbrock4 implementation with real binary64 vectors and dense
Jacobians. It does not qualify another implicit method family or runtime.

## Algorithm evidence

Kaps and Rentrop describe fourth-order semi-implicit Runge–Kutta methods with an
embedded third-order step estimate, one Jacobian, and one linear-system
factorization per step. The implementation uses the coefficient and stage set
independently published in Boost.Odeint, then checks fixed-step convergence on
`y'=y`: halving steps from `0.1` to `0.05` reduces endpoint error by more than
12, consistent with fourth-order convergence.

- [Kaps–Rentrop 1979 paper](https://doi.org/10.1007/BF01396495)
- [Boost.Odeint Rosenbrock4 source](https://github.com/boostorg/odeint/blob/master/include/boost/numeric/odeint/stepper/rosenbrock4.hpp)
- [Boost.Odeint method/controller classification](https://www.boost.org/doc/libs/latest/libs/numeric/odeint/doc/html/boost_numeric_odeint/odeint_in_detail/steppers.html)

Every stage solve uses the same partial-pivoted dense LU factorization. The
normalized residual is independently recomputed against the unfactored matrix
and RHS. A singular pivot, nonfinite solution, or residual above `1e-10` rejects
the attempt. There is no Newton loop because Rosenbrock4 is linearly implicit;
Newton convergence is therefore not a capability claim.

## Differential and residual evidence

The frozen SciPy 1.18 fixture and optional live check run Radau and BDF with
supplied Jacobians. Sage.js Rosenbrock4 uses `rtol=1e-6` and is compared with
both independent endpoints. The checked relative/absolute envelope uses
`max(1, abs(reference))` scaling.

| Case | Interval | Rosenbrock4 endpoint | Maximum oracle envelope |
|---|---:|---|---:|
| Robertson | `[0,100]` | `[0.6172348405, 6.153590258e-6, 0.3827590059]` | `5e-7` |
| HIRES | `[0,321.8122]` | first/last `[7.371312659e-4, 2.850001427e-3]` | `2e-8` |
| Van der Pol, `mu=1000` | `[0,3000]` | `[-1.510606673, 1.178380513e-3]` | `2e-6` |

Robertson total mass differs from one by at most `2e-12`; HIRES `y7+y8`
differs from `0.0057` by at most `2e-12`. Observed maximum normalized linear
residuals remain below `2e-16` in these runs. The Van der Pol relaxation
transition is intentionally retained because it exposed an inadequate first
dense-output prototype.

The shipped cubic Hermite interpolant is checked online at its midpoint. After
the solve, deterministic midpoint samples form the independent defect
`P'-f(t,P)`, solve `(I-hJ) delta = h*defect`, verify that solve's residual, and
gate the weighted RMS correction at `128` requested-tolerance units. Observed
maximum validation metrics were approximately `2.22` for Robertson, `0.179`
for HIRES, and `57.6` for Van der Pol. This is a quantitative sampled residual
gate, not a global forward-error bound.

## Failure and resource evidence

The cross-runtime stiff witness checks all of the following:

- supplied and forward finite-difference Jacobians on Robertson;
- a terminal stiff-decay event at `log(2)/1000`, including direction and event
  residual;
- a deliberately singular Rosenbrock stage matrix and the bounded
  `max_linear_solve_failures` termination;
- logical dense-Jacobian/LU workspace rejection before the first callback;
- finite-difference RHS calls exhausting `max_evaluations`;
- cancellation requested inside a Jacobian callback; and
- elapsed-time exhaustion inside a Jacobian callback, with exact
  `maximum_elapsed_time` after shared status integration.

Existing ODE tests continue to cover output-point, dense-segment, event-record,
validation-callback, trace-event, trace-byte, and event-location budgets.

## Runtime boundary

The compact witness passes in CPython Linux x64 and Sage.js on Node Linux x64.
The heavy three-problem SciPy differential corpus is executed in CPython. The
ordinary-Python source is structurally browser-capable, but no browser/Wasm,
SEA, Linux ARM64, macOS ARM64, or Windows x64 qualification receipt exists in
this lane. None is claimed.

`method="auto"` stays on RK45. There is no independently qualified stiffness
detector. Sparse matrices, iterative linear solvers, mass matrices, DAEs,
complex states, and SUNDIALS lifecycle/payload qualification
remain outside this record.

## Reproduction

```sh
node --test test/numerics/ode/stiff-laboratory.cjs
python test/numerics/ode/check_scipy_oracle.py \
  --fixture test/numerics/ode/scipy-oracles.json --live-scipy
python bench/numerics/ode/stiff.py
```

The benchmark command emits one complete-solve timing and numerical-evidence
record per standard problem. It is an observation harness, not a performance
budget.
