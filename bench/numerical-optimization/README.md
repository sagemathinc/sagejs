# Numerical optimization evaluation corpus

This directory defines a backend-neutral corpus for deciding how Sage.js
should implement numerical optimization. It is an evaluation tool, not yet a
routine CI gate and not a promise that every listed operation belongs in the
first public API.

The corpus covers scalar root finding and minimization, unconstrained and
bounded multivariate minimization, nonlinear least squares, constrained local
optimization, and seeded global optimization. It includes smooth,
nonsmooth, ill-conditioned, rank-deficient, boundary, infeasible, and
stochastic cases.

## Correctness policy

Numerical solvers often have nonunique answers and stochastic solvers have no
single correct trajectory. Therefore the acceptance contract is mathematical:

- root residual and distance to a known root;
- objective gap and, where meaningful, distance to a known minimizer;
- gradient or projected-gradient norm;
- least-squares residual norm and cost gap;
- constraint violation, including an explicit infeasible case; and
- success rate over a pinned seed set for global optimization.

Reported solver status, iterations, function evaluations, exceptions, and the
full result are retained in the JSON receipt. A candidate must not be accepted
merely because it reaches a nearby point, but exact status-message text and
iteration counts are not cross-backend invariants.

`corpus.json` is declarative and validated structurally by
`corpus.schema.json`; generated receipts follow `results.schema.json`.
Problem formulas and backend adapters live in `run.py`. Adding a backend
should not alter formulas, inputs, or acceptance thresholds.

## Running the corpus

The SciPy adapter is the current compatibility oracle:

```sh
python3 bench/numerical-optimization/run.py \
  --backend scipy \
  --samples 7 \
  --output /tmp/scipy-numerical-optimization.json
```

Useful selectors are `--case ID`, `--operation NAME`, `--benchmark-only`, and
`--list`. The optional historical pull-request adapter is deliberately kept
out of the Sage.js package; run it only from a checkout containing those
modules by making that checkout's `sagejs` package importable.

For development comparisons, a locally built NLopt shared library can run the
bounded-scalar, Nelder-Mead, COBYLA, and global cases through a Python `ctypes`
callback:

```sh
python3 bench/numerical-optimization/run.py \
  --backend nlopt-ctypes \
  --nlopt-library /path/to/libnlopt.so \
  --operation constrained-minimize
```

NLopt does not implement differential evolution, so the global adapter clearly
labels its population-based CRS2-LM comparison. Unsupported methods raise
`NotImplementedError`; use operation or case selectors rather than treating
those as algorithm failures. This adapter is evidence about algorithms and a
foreign callback boundary, not the proposed production binding.

The runner performs problem construction outside the timer, one warmup for
marked benchmark cases by default, and records every measured duration plus
the median. The timed region includes the solver and all objective callbacks.
Compare backends only on the same otherwise-idle host, runtime, corpus
revision, and sample policy. Cold import/startup and peak memory require
separate measurements.

Global cases execute the complete pinned seed set in addition to the selected
timing seed. Their success-rate gate is part of correctness; a fast lucky seed
does not establish a viable global optimizer.

## Callback-boundary probe

Most mature native optimizers call a user-supplied objective. For browser
Sage.js that means crossing from Wasm into JavaScript. Measure that irreducible
transition independently of any solver with:

```sh
node bench/numerical-optimization/callback-boundary.mjs \
  --count 1000000 \
  --samples 9 \
  --output /tmp/sagejs-numerical-callback.json
```

The probe compiles a tiny module with Sage.js's pinned WASI SDK and compares a
direct JavaScript loop, internal Wasm calls, and Wasm-to-JavaScript imported
function calls. It is a microbenchmark: it quantifies boundary cost but does
not predict solver convergence or end-to-end application time.

## Extending the corpus

Before changing an implementation based on performance, add a representative
case here and keep its mathematical acceptance independent of the backend.
The next useful expansions are standard Moré-Garbow-Hillstrom nonlinear
least-squares problems, scalable dimensions, noisy objectives, callback
exceptions/cancellation, finite-difference accounting, and memory receipts.
Large external suites such as CUTEst are development oracles rather than
runtime dependencies and must be pinned by version and license when added.
