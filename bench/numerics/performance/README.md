# Numerical performance corpus

This is the incremental corpus for the
[performance program](../../../agents/numerical-computing-performance-plan.md).
The initial tranche measures warm **public** numerical calls and isolated
semantic trace collection. It is not a release qualification, a SciPy comparison,
or a claim that milestone N0 is complete.

Use a clean committed candidate and its current build. Run timings serially,
without concurrent builds, on a quiet host:

```sh
pnpm build:check
node bench/numerics/performance/run.cjs --runtime sagejs --levels none,summary,iterations --output build/numerical-performance/sagejs.json
node bench/numerics/performance/run.cjs --runtime cpython --levels none,summary,iterations --output build/numerical-performance/cpython.json
```

`--cases root-brent,nelder-mead-2,ode-oscillator` narrows a run. Defaults are
three warmups and seven retained measurements per workload/trace-policy pair;
`--warmups 0 --samples 1` is a smoke test, never performance qualification.
`--timeout` bounds each workload batch in milliseconds. `PYTHON` selects the
CPython executable. `--root` selects another checkout while retaining this
collector and workload definition, useful for a baseline/candidate comparison.
The chosen checkout must also be clean and, for Sage.js, have a current build.

The same Python source, input data, method, tolerances and independent witnesses
run on both runtimes. Solver validation and structured-result construction stay
inside the timed call. Benchmark-only assertions and trace serialization stay
outside. No solver result is accepted solely because its backend says success.
The initial cases cover scalar roots/minimization, Rosenbrock optimization,
nonlinear fitting, two ODEs, descriptive statistics, a dense solve, integration,
interpolation construction, FFT and trace scaling. They deliberately do not
replace the larger correctness/failure corpora of those domains.

Reports retain all samples, a separately measured first call and preparation,
actual method/backend, evaluation and iteration counts, independent errors,
retained trace sizes, source/workload/collector hashes, built-artifact identity,
host/runtime identity and load. Preparation includes an import when needed; it
is **not** a process-cold import measurement because earlier cases may already
have loaded a dependency. Likewise session startup is measured separately from
the workload batches, not inferred from their total process wall time.

This tranche explicitly forces the same-source dynamic route. It does not
measure the unchanged public automatic route, cminpack/NLopt or future `@native`
implementations. Node process memory snapshots are not worker peak RSS. Missing
phase profiles, isolated startup/memory/payload measurements, matched SciPy
oracles, backend variants and browser/four-platform evidence remain explicitly
listed in each report. A completed file means collection finished, **not** that
the program or performance targets passed. Partial files retain `complete: false`.

Before calling a speedup confirmed, collect paired/interleaved before/after runs
and an independent repeat on a quiet persistent host, inspect distributions and
check that methods, work counts and answers still match. For small operations,
add clock/loop controls and checksum-checked batches before interpreting ratios.
Do not average unrelated workloads into a product speed score.
