# ODE performance, startup, and memory evidence

The checked records are measurements, not release budgets:

- [`cpython-linux-x64.json`](../../../bench/numerics/ode/results/cpython-linux-x64.json)
- [`sagejs-linux-x64.json`](../../../bench/numerics/ode/results/sagejs-linux-x64.json)

They were recorded on 2026-08-31 on a Linux x64 KVM host exposing 16 AMD EPYC
7B13 virtual CPUs. Timing is single-process wall time. Workloads use the same
ordinary Python solver source, but CPython 3.14.4 and Sage.js on Node 26.7.0 are
different runtimes and are not treated as interchangeable benchmark samples.

## Workloads

`instant_classroom` solves `y'=y` on `[0,1]` with RK45, `rtol=1e-7`,
`atol=1e-10`, analytic-reference checking, dense output, result serialization,
and summary tracing. It takes 8 accepted steps and 50 RHS evaluations.

`interactive_exploration` solves 20 oscillator periods with invariant checking,
`max_step=0.25`, dense output, result serialization, and summary tracing. It
takes 981 accepted and 116 rejected steps with 6,584 RHS evaluations.

`substantial_local` is a 32-component coupled diffusion/forcing chain on
`[0,50]`, with `max_step=0.2`, dense output, validation, and serialization. It
takes 251 accepted steps and 1,508 RHS evaluations. This workload is measured
in CPython only in the current record.

## Observations

On CPython, the median complete-solve times were approximately 0.95 ms, 65.3
ms, and 129.6 ms for the three workloads. Fresh-process import median was 34.9
ms. Tracemalloc peak deltas were about 24 KiB, 2.09 MiB, and 3.89 MiB. The large
32-component serialized result was 1.22 MiB; dense coefficients dominate its
durable evidence payload.

On Sage.js, session construction took 315 ms. Warm median complete-solve times
were about 74.7 ms for the classroom problem and 3.49 s for the 20-period
oscillator. The complete evaluation wall time, including lazy module loading,
warmups, ten timed solves, validation, and serialization, was 17.6 s. Node RSS
snapshots rose from 54.6 MiB before session creation to 162 MiB after startup
and 322 MiB after the benchmark. Those snapshots include the complete runtime,
compiler/module caches, and retained process allocations; they are not a peak
or per-result attribution.

SciPy 1.18 completed the matching classroom RK45 equation/tolerances in a 0.41
ms median with the same 50 RHS evaluations. This is an oracle/runtime context,
not evidence that a NumPy/SciPy dependency would have the same browser cost.

The evidence is honest about a current performance risk: the ordinary dynamic
Sage.js path is acceptable for small classroom examples but the 6,584-callback
interactive workload is not yet comfortably interactive. The architecture
still prefers this correct fallback before acceleration. A later optimization
lane should profile vector arithmetic, callback dispatch, trace/result
materialization, and dense coefficient storage before choosing guarded JS,
source-transparent compilation, or a mature Wasm backend.

## Reproduction

```sh
python bench/numerics/ode/run.py --repetitions 7 --cold-repetitions 5
node bench/numerics/ode/run-sagejs.mjs
```

Both tools print JSON. The CPython harness performs one warmup per workload and
reports median and p90 timing, tracemalloc deltas, result size, steps, and RHS
evaluations. The Sage.js harness constructs one session, performs one warmup per
workload, reports warm medians, and records Node memory snapshots before
startup, after startup, and after evaluation.

The separate stiff observation harness runs the complete Robertson, HIRES, and
`mu=1000` Van der Pol Rosenbrock4 cases once and reports steps, callbacks,
Jacobians, linear residuals, dense-validation metrics, and wall time:

```sh
python bench/numerics/ode/stiff.py
```

Its measurements are not mixed with the older explicit-workload result files;
doing so would imply those records covered the new method. The numerical
qualification and SciPy differential values are documented in
[the stiff evidence record](stiff-evidence.md).
