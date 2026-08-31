# Numerical optimization strategy for Sage.js

**Status:** architecture recommendation, supported by a checked-in correctness
and benchmark corpus

**Date:** 2026-08-31

**Sage.js source:** `5aaf6360a2a3a3213318bf6bc9723a17f58746b3`
(`origin/main` when this investigation began)

**Sage reference:**
[`8bed9c3744bfeaf3a443ad428dbcfe300b1a1b75`](https://github.com/sagemath/sage/blob/8bed9c3744bfeaf3a443ad428dbcfe300b1a1b75/src/sage/numerical/optimize.py)

## Decision

Sage.js should not choose one general-purpose numerical-optimization library,
and it should not make a large new pure-Python solver suite its production
foundation.

The best architecture is a **method-specific portfolio behind one
Sage-compatible ordinary-Python API and one small, synchronous,
callback-capable WebAssembly pack**:

1. Preserve the Sage/SciPy method selected by each public API. Do not silently
   replace one named algorithm with a vaguely similar algorithm from another
   library.
2. Keep the small one-dimensional Brent algorithms as readable Python with a
   correct dynamic path. They are already sub-millisecond and are not the
   source of an important performance problem.
3. Use cminpack's `lmdif`/`lmder` through the common Wasm callback ABI for
   `find_fit`, after its complete MINPACK differential suite passes inside the
   Wasm build. This is the closest implementation match to Sage's current
   SciPy `leastsq` contract.
4. Evaluate the permissive subset of NLopt as the first compiled implementation
   for Nelder-Mead and COBYLA. Promote each algorithm separately only after it
   passes the expanded corpus and method-specific Sage/SciPy or PRIMA oracles.
5. Treat CppNumericalSolvers' L-BFGS-B as a promising comparator, not an
   accepted backend. Its BFGS implementation failed a 20-dimensional
   Rosenbrock case and therefore must not back Sage.js BFGS.
6. Keep BFGS, CG, Newton-CG, Powell, L-BFGS-B, and TNC on correct dynamic
   implementations until the exact method has a defensible compiled backend.
   A slow correct fallback is preferable to an unannounced algorithm change.
7. Defer global optimization until after the present Sage compatibility
   surface. If added, expose explicit algorithm names. NLopt CRS2-LM is not
   differential evolution.
8. Validate the returned point and constraints independently of a solver's
   success flag. The NLopt probe reported success for the deliberately
   infeasible corpus case, demonstrating why this cannot be optional.

This is a portfolio of implementation cores, not a portfolio of user APIs.
Users should see stable Sage-compatible functions and results. The internal
capability registry records the exact backend, algorithm, version, limits, and
fallback for each method.

The default compiled artifact should initially be the same Wasm module on
browser, Node/SEA, Linux, macOS, and Windows. Native variants should be added
only when a matched benchmark proves a material gain. This reduces build and
release complexity and, more importantly, makes floating-point behavior more
uniform. The cminpack native ARM64 result below shows that this is a correctness
advantage, not merely packaging convenience.

## What compatibility means

The relevant Sage surface is much smaller and more precise than “provide an
optimization library.” The pinned Sage source delegates as follows:

| Sage operation | Current delegated method | Initial Sage.js contract |
| --- | --- | --- |
| `find_root` | SciPy `brentq` | Bracketed binary64 root, matching errors and tolerances |
| `find_local_minimum` / `find_local_maximum` | SciPy `fminbound` | Bounded Brent scalar minimization |
| `minimize`, default callable | SciPy Nelder-Mead | Nelder-Mead, not any derivative-free local method |
| `minimize`, symbolic gradient | SciPy BFGS | BFGS with compatible finite/symbolic gradient handling |
| `minimize(..., algorithm=...)` | simplex, Powell, BFGS, CG, or Newton-CG | Preserve the requested algorithm |
| `minimize_constrained`, interval bounds | TNC by default; L-BFGS-B if requested | Preserve bound semantics and method identity |
| `minimize_constrained`, callable constraints | COBYLA | Feasibility-aware COBYLA |
| `find_fit` | SciPy `leastsq` | MINPACK `lmdif`/`lmder` Levenberg-Marquardt behavior |

The [Sage numerical optimization documentation](https://doc.sagemath.org/html/en/reference/numerical/sage/numerical/optimize.html)
also makes clear that `find_root` and these optimization functions operate in
fixed machine precision. Arbitrary-precision optimization, global
optimization, mixed-integer programming, and general convex modeling are
separate projects. They should not enlarge or block this implementation.

“Compatible” does not mean byte-identical iteration histories. Floating-point
solvers can follow different valid paths after a one-ULP perturbation. It does
mean:

- the public function chooses the documented algorithm;
- tolerances, bounds, constraints, exceptions, and callback failures have
  compatible semantics;
- the mathematical answer meets an independently checked residual,
  stationarity, objective, distance, or feasibility condition;
- stochastic methods meet a success-rate contract over pinned seeds;
- statuses and evaluation counts are retained for diagnosis; and
- a backend is never considered correct merely because it returns “success.”

SciPy is therefore the development compatibility oracle, not a runtime
dependency. PRIMA and original MINPACK tests add algorithm-specific evidence.

## Checked-in evaluation corpus

The new [`bench/numerical-optimization/`](../bench/numerical-optimization/README.md)
corpus contains 25 backend-neutral cases and JSON schemas for reproducible
receipts. It covers:

- bracketed root finding, including a flat root, endpoint root, scaling, and an
  invalid bracket;
- bounded scalar minimization at interior and boundary optima;
- Nelder-Mead on Rosenbrock, Beale, and a nonsmooth absolute-value objective;
- BFGS on two- and twenty-dimensional Rosenbrock problems and an
  ill-conditioned quadratic;
- L-BFGS-B with 50 active bounds and a fixed coordinate;
- Levenberg-Marquardt on a 30-residual linear fit, Rosenbrock residuals, a
  rank-deficient problem, and exponential decay;
- COBYLA at a linear boundary, a curved boundary, and an infeasible problem;
  and
- seeded six-hump-camel, five-dimensional Rastrigin, and five-dimensional
  Ackley global problems.

Acceptance uses mathematical quantities: root residual, objective gap,
distance to a known solution, gradient or projected-gradient norm, residual
norm, constraint violation, and success rate. The runner constructs problems
outside the timer, warms benchmark cases, times the solver and all callbacks,
and retains every sample. Cold startup, import time, payload, and peak memory
are deliberately separate measurements.

This is a useful first gate, not a complete numerical test suite. Before a
production backend is selected, expand it with:

- the standard Moré-Garbow-Hillstrom least-squares problems at multiple
  starting scales;
- CUTEst subsets for unconstrained, bounded, and constrained methods;
- dimensions that cross dense/limited-memory regimes;
- finite-difference and supplied-gradient/Jacobian variants;
- NaN, infinity, callback exception, cancellation, iteration-budget, and
  timeout cases;
- nearly active, redundant, inconsistent, and badly scaled constraints;
- reproducibility under repeated runs and all four supported hosts; and
- cold-start, resident-memory, and compressed/uncompressed payload receipts.

The corpus must stay independent of backend return messages and private
iteration details. Each production method needs a smaller deterministic subset
in routine CI and the expanded oracle suite before a release.

## Baseline results

The checked-in Linux x64 receipts were produced with CPython 3.14.4 on an
otherwise-idle Ubuntu host. SciPy 1.18.0 is the oracle. The historical
pure-Python stack is included only as an empirical implementation baseline; it
is not the proposed architecture. Values are warm medians in milliseconds and
include objective callbacks.

| Representative case | SciPy 1.18 | Historical pure Python | NLopt MIT subset |
| --- | ---: | ---: | ---: |
| Brent root, `cos(x)-x` | 0.0167 | 0.0107 | — |
| Bounded scalar, smooth interior | 0.0730 | 0.0122 | 0.0534 (failed strict accuracy gate) |
| Nelder-Mead, Rosenbrock 2 | 2.751 | 0.766 | 0.317 |
| BFGS, Rosenbrock 20 | 20.670 | 165.247 | — |
| L-BFGS-B, active box 50 | 0.323 | 0.195 | — |
| LM, linear 30 | 0.158 | 0.176 | — |
| COBYLA, circle boundary | 57.440 | 1.743 (small accuracy miss) | 0.162 |
| Global, Rastrigin 5 | 577.460 | 401.147 | 114.183 (CRS2-LM, not DE) |

Overall:

- SciPy accepted 24/25. Differential evolution met the exact optimum on the
  timed Rastrigin seed but only 10/20 pinned seeds, below the 0.8 success-rate
  gate. This is evidence that a corpus can appropriately fail its oracle on a
  deliberately demanding stochastic contract.
- The historical pure-Python stack accepted 24/25 under CPython. Its COBYLA
  circle objective gap was `7.37e-5`, above the `5e-5` gate.
- The NLopt development adapter supports 11 of the 25 cases and accepted 9.
  Its bounded-scalar result narrowly missed the strict distance and objective
  gates, and its COBYLA returned a successful termination status on the
  infeasible case. Independent post-validation caught both.

The apparently good CPython timings do not settle the Sage.js question. In an
earlier matched run of the same pure-Python implementations through Sage.js's
dynamic runtime, representative slowdowns versus SciPy ranged from roughly
5x for COBYLA to 20x for scalar root finding, 58x for Nelder-Mead, 231x for LM,
and 406x for 20-dimensional BFGS. Those exploratory numbers are not checked-in
receipts and should not be used as release gates, but they identify the central
architectural problem: an iterative control loop that repeatedly manipulates
dynamic Python lists in translated JavaScript is often the wrong execution
tier. Merely polishing that Python stack does not address it.

## Is a Wasm callback boundary fast enough?

Yes. The checked-in microbenchmark performs one million calls per sample:

| Operation | Linux x64 median |
| --- | ---: |
| Direct JavaScript call | 1.10 ns/call |
| Internal Wasm function call | 1.25 ns/call |
| Wasm to imported JavaScript callback | 11.97 ns/call |

The imported callback is about 11 ns more expensive than a direct JavaScript
call. That is measurable but far below the cost of a normal mathematical
objective, array conversion, finite differencing, or a poorly chosen solver.
It does not justify keeping iterative solver control in JavaScript.

Three temporary end-to-end prototypes provided stronger evidence:

| Core | Linked Wasm | Case | Linux x64 warm median | macOS ARM64 warm median |
| --- | ---: | --- | ---: | ---: |
| NLopt 2.11 MIT-only | 459 KiB | Nelder-Mead Rosenbrock 2 | 0.092 ms | 0.143 ms |
| cminpack | 15 KiB | LM linear fit, 30 residuals | 0.042 ms | 0.036 ms |
| CppNumericalSolvers + Eigen | 400 KiB | L-BFGS-B active box 50 | 0.028 ms | 0.055 ms |

The identical Wasm binaries produced the same results on the two tested hosts.
The NLopt prototype converged to objective `4.06e-13` in 210 objective calls.
The cminpack prototype recovered `[2.5, -0.75]` to floating-point precision in
210 scalar residual calls. The L-BFGS-B prototype reached the exact active-box
answer in three packed objective/gradient calls.

These prototypes were feasibility experiments, not production code or durable
benchmark receipts. They demonstrate that synchronous imported callbacks work
and that useful linked payloads are small. The production ABI must improve on
their scalar callbacks by packing vectors in linear memory.

## Four-platform portability evidence

The upstream native test suites were built on the user-facing platform set:

| Candidate | Linux x64 | Linux ARM64 | macOS ARM64 | Windows x64 |
| --- | ---: | ---: | ---: | ---: |
| NLopt 2.11, `NLOPT_LUKSAN=OFF` | 36/36 | 36/36 | 36/36 | 36/36 |
| cminpack | 44/44 | **40/44** | 44/44 | 43/43 |

The Windows cminpack build configures 43 tests, so 43/43 is its complete suite,
not a skipped failure. On Linux ARM64, four cross-checks failed:
`crosscheck_hyjdrvc`, `crosscheck_hyjdrv_`, `crosscheck_hybdrvc`, and
`crosscheck_hybdrv_`. In the hard problem 8/40, the pure-C residual was about
128 while the committed Fortran reference reached approximately `1e-13`.
The upstream cminpack documentation itself explains that FMA contraction can
change trust-region decisions in hard cases. Regardless of cause, 40/44 blocks
an unqualified ARM64-native cminpack backend.

Both libraries also compiled without source changes to static WASI archives:

| Candidate | Native static archive | WASI static archive |
| --- | ---: | ---: |
| NLopt MIT-only | 708 KiB | 333 KiB |
| cminpack | 221 KiB | 81 KiB |

This motivates using the validated universal Wasm artifact even inside Node
and SEA initially. It avoids four native floating-point/compiler variants and
one already observed divergent configuration. Before cminpack is accepted,
its full upstream cross-check—not just the simple fit prototype—must execute in
the Wasm build on Linux x64, Linux ARM64, macOS ARM64, Windows x64, and a real
browser.

## Candidate evaluation

Source sizes below are approximate tracked source lines, not package sizes.
They help expose maintenance surface but are not a quality ranking.

| Candidate | Pinned revision | Approx. code | Dependency shape | Disposition |
| --- | --- | ---: | --- | --- |
| NLopt | `6e6593f` (2.11 development) | 40,452 | C/C++, optional LGPL solvers | Broad provisional Wasm core, method by method |
| cminpack | `32d343a` | 35,418 | C, no BLAS required | Best `find_fit` match after Wasm cross-check |
| CppNumericalSolvers | `a675d14` | 10,286 | C++17 + Eigen | Comparator; possible L-BFGS-B, reject BFGS now |
| PRIMA | `1d76fb3` | 157,832 | Modern Fortran + C wrapper | Powell-method oracle, not first runtime core |
| LBFGS++ | `1695839` | 4,108 | C++ + Eigen | Narrow L-BFGS/L-BFGS-B comparator |
| libLBFGS | `5ad02fb` | 3,183 | C | Mature but too narrow; no bounds |
| OptimLib | `5453f48` | 11,488 | C++ + Eigen/Armadillo | Reject: upstream says Windows unsupported |
| ensmallen | `f65354c` | 77,755 | C++ + Armadillo + BLAS/LAPACK | Too heavy for the initial browser pack |
| argmin | `b300285` | 83,340 | Rust ecosystem | No demonstrated benefit worth a new toolchain |
| fmin | `6b155c9` | 2,254 | JavaScript | Too narrow; upstream test packaging failed |
| ml-levenberg-marquardt | `c28e20f` | 1,521 | JavaScript | Good curve-fit comparator, not MINPACK semantics |

### NLopt

NLopt has the broadest mature C API in the survey: local/global,
derivative/derivative-free, bounded, and constrained methods. Its callback API
maps naturally to Wasm imports. The default combined distribution is LGPL
because it includes Ladislav Luksan's code, but [NLopt documents a fully
permissive build](https://nlopt.readthedocs.io/en/stable/NLopt_Installation/)
with `NLOPT_LUKSAN=OFF`; the remaining source has permissive licenses. This
removes the L-BFGS, TNEWTON, and VAR families, so it does not solve every Sage
method.

Advantages:

- all 36 enabled upstream tests passed natively on all supported hosts;
- the MIT-only build compiles to WASI without patches;
- the C API, cancellation support, stopping criteria, and opaque callback data
  are appropriate for a compact host adapter; and
- Nelder-Mead and COBYLA performed well on the initial corpus.

Risks:

- an NLopt method with the same family name is not automatically
  Sage/SciPy-compatible;
- the scalar bounded result missed the strict corpus accuracy contract with the
  provisional stopping setup;
- COBYLA claimed success for an infeasible problem; and
- disabling Luksan is a build invariant that license and symbol checks must
  enforce.

Verdict: vendor a pinned MIT-only source snapshot only after license inventory,
algorithm-symbol allowlisting, and method-level corpus gates. It is the leading
broad core, not a blanket replacement.

### cminpack

cminpack is a C rewrite of MINPACK. This is the strongest semantic fit in the
survey because SciPy `leastsq`, and therefore Sage `find_fit`, already wraps
MINPACK `lmdif`/`lmder`; the [SciPy least-squares documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html)
states that relationship explicitly.

Its small WASI archive and fast callback prototype are excellent. The Linux
ARM64 failures are nevertheless a release blocker for a native build. A single
Wasm compilation may give more consistent arithmetic, but that is a hypothesis
until the entire cminpack/Fortran differential suite passes from the production
Wasm artifact on every host.

Verdict: best candidate for the LM/`find_fit` slice; use Wasm everywhere first,
with the complete upstream cross-check promoted into Sage.js evidence.

### CppNumericalSolvers and Eigen

This MIT, header-only C++17 library is easy to compile with Eigen and offers
BFGS, L-BFGS, L-BFGS-B, Nelder-Mead, conjugate-gradient, Newton, and augmented
Lagrangian solvers. The Wasm L-BFGS-B prototype was very fast and correct on
the active-box case.

But the generic 20-dimensional BFGS prototype stopped at the well-known wrong
Rosenbrock stationary point (`f = 3.986623856`, first coordinate approximately
`-0.993`) after 229 objective/gradient callbacks. SciPy BFGS reaches the global
minimum from the same input. The benchmark repository linked by the upstream
project was also unavailable during this audit, so its broad performance claim
was not independently reproduced.

Verdict: never select the whole library based on its header-only convenience.
Keep L-BFGS-B as a candidate for expanded testing; reject its BFGS for the
current contract.

### PRIMA

PRIMA is the modern reference implementation of Powell's COBYLA, UOBYQA,
NEWUOA, BOBYQA, and LINCOA methods, with extensive CUTEst, stress, and fuzz
evidence. [SciPy 1.18's COBYLA is the pure-Python PRIMA
implementation](https://docs.scipy.org/doc/scipy/reference/optimize.minimize-cobyla.html),
making PRIMA the best external correctness oracle for that family.

The reference runtime is modern Fortran with a C wrapper. Sage.js does not
currently have a clean, supported modern-Fortran-to-WASI and native-Windows
distribution route. Adding one solely for these solvers would work against the
small, portable release goal.

Verdict: pin PRIMA as the oracle and corpus source. Revisit runtime adoption
only if its C implementation/distribution path matures or another existing
dependency supplies it cleanly.

### Narrow C/C++ candidates

- **LBFGS++** is a small MIT Eigen-based L-BFGS/L-BFGS-B comparator. It deserves
  the same expanded bounded corpus as CppNumericalSolvers but does not address
  the rest of Sage's surface.
- **libLBFGS** is small, MIT, C, and mature, but provides L-BFGS/OWL-QN without
  box bounds. It is not enough to justify another runtime core unless a future
  unbounded L-BFGS API specifically needs it.
- **OptimLib** has a broad Apache-2 C++ API but explicitly lists Windows as
  unsupported. That violates a first-class Sage.js platform requirement.
- **ensmallen** is broad and BSD-3, but requires Armadillo and a BLAS/LAPACK
  stack. Its own [requirements list](https://github.com/mlpack/ensmallen)
  confirms the extra dependency surface. That is a poor trade for the initial
  browser pack when the exact Sage method fit is still unproved.

### JavaScript candidates

Pure JavaScript avoids FFI and can be attractive for tiny methods. The surveyed
packages do not form a credible complete foundation:

- `fmin` provides only Nelder-Mead, gradient descent, and conjugate gradient.
  Its checked-out upstream tests could not start because its Vitest config
  imported undeclared `vite`, and its built UMD package exposed no usable
  exports under its own module setting in a direct Node ESM probe.
- `ml-levenberg-marquardt` passed all 32 upstream tests. On the two corpus-like
  fits it took 0.291 ms (linear) and 0.230 ms (exponential), with correct
  answers. It is a curve-fitting API rather than the general residual/Jacobian
  and status contract of MINPACK `leastsq`.

These remain useful comparators and possible fallback components. Selecting
them merely because they are JavaScript would sacrifice Sage semantics without
solving the broader surface.

### Other ecosystems

- **SciPy/Pyodide** would provide the closest existing implementation, but
  shipping CPython, NumPy, and SciPy as the optimization substrate conflicts
  with Sage.js's lightweight runtime, startup, and distribution goals. SciPy
  remains the indispensable oracle.
- **GSL** is a broad, mature C library under the GPL. It adds a large second
  numerical library while matching Sage's current algorithm choices less
  directly than cminpack/PRIMA/SciPy. It is not the first integration target.
- **Ceres Solver** and **dlib** bring substantial C++ dependency and payload
  surfaces. They target larger modeling/vision use cases rather than this
  compatibility layer.
- **Rust argmin** is broad and permissively licensed but would add a Rust
  toolchain, a new ABI layer, and ecosystem dependencies without a demonstrated
  compatibility or payload win.
- **Julia Optim/NLSolvers** has good algorithmic design, but adopting a Julia
  runtime or translating that implementation is a larger architecture project,
  not a portable Sage.js backend.

## Production architecture

### Public layer

Implement Sage-compatible wrappers in ordinary CPython-parseable Python. The
wrapper owns:

- input conversion and validation;
- symbolic objective/gradient/Jacobian preparation;
- method selection and default tolerances;
- result normalization and documented exceptions;
- independent mathematical post-validation; and
- dynamic fallback selection.

It must not contain embedded JavaScript. The low-level boundary belongs in
`sagejs.runtime`.

### Capability registry

Selection should be data-driven and inspectable, conceptually:

```text
operation: minimize
method: nelder-mead
backend: numerical-wasm/nlopt-nelder-mead
source_revision: <pinned source hash>
numeric_type: binary64
supports: bounds=false, callback=true, cancellation=true
validated_envelope: <corpus and resource limits>
fallback: dynamic-sage-compatible-nelder-mead
```

The registry should reject missing methods or out-of-envelope dimensions. It
must never route “differential evolution” to CRS2-LM or “BFGS” to an unrelated
quasi-Newton method because both happen to minimize a scalar objective.

### Wasm callback ABI

Use one synchronous reactor with one copy of the support runtime and multiple
small solver cores. The proof-of-concept module imported one scalar callback;
the production ABI should be batched:

```c
int objective(context, n, x_offset, value_offset);
int objective_gradient(context, n, x_offset, value_offset, gradient_offset);
int residual_jacobian(context, m, n, x_offset,
                      residual_offset, jacobian_offset, flags);
int constraints(context, count, n, x_offset,
                values_offset, jacobian_offset, flags);
```

The exact ABI can differ, but it needs these properties:

- one boundary crossing per vector objective/gradient/residual batch, not per
  scalar component;
- caller-owned packed `Float64Array` views in Wasm memory;
- opaque context handles with no global callback state;
- an exception slot that safely transports a thrown user exception out of the
  solver;
- force-stop for cancellation, time/evaluation budgets, and browser abort;
- no reentrant solve on the same context unless explicitly supported;
- deterministic counters for objective, gradient, Jacobian, constraint, and
  iteration calls;
- explicit finite/NaN checking and no partial output on failure;
- fixed-width status codes with backend-specific status retained separately;
- dimension/allocation ceilings with checked arithmetic; and
- lifecycle counters and corruption tests like other Sage.js resources.

This callback-capable reactor is an explicit host-adapter/compiler-limitation
exception under `ARCHITECTURE.md`: the mathematics stays in a mature solver
core and ordinary Python public wrapper. The ABI itself is not a handwritten
mathematical algorithm.

For source-transparent objectives, a later optimization can compile the
objective and solver loop into the same module or provide a fused batch
evaluator. Arbitrary Python/Sage callbacks must continue to work, so that is an
acceleration, not a prerequisite.

### Distribution

Start with one numerical Wasm pack across every runtime. The observed linked
prototypes total comfortably below a megabyte before compression even when
Eigen is present. Dead-code elimination and a shared adapter should make a
portfolio cheaper than separate per-method addons.

The pack must ship:

- a machine-readable source and license inventory;
- reproducible pinned upstream archives and patches;
- an allowlist proving excluded LGPL NLopt symbols are absent;
- exact build flags, including floating-point contraction policy;
- an exported capability/version record; and
- the corpus/source hash used to qualify each enabled method.

Native acceleration is a second-stage option. Require a meaningful end-to-end
gain—including callback conversion and startup—before accepting another
platform artifact and cross-platform numerical surface.

## Method-by-method implementation plan

| Priority | Method/API | First implementation | Gate before automatic use |
| ---: | --- | --- | --- |
| 1 | `find_root` / Brent | Owned readable Python, source-transparent compile if useful | Sage/SciPy differential bracket, tolerance, and error corpus |
| 1 | bounded scalar / Brent | Owned readable Python, source-transparent compile if useful | Boundary, flat, scaled, and max-evaluation corpus |
| 1 | `find_fit` / LM | cminpack Wasm `lmdif`/`lmder` | Full upstream MINPACK cross-check inside Wasm on four hosts/browser; expanded MGH corpus |
| 1 | Nelder-Mead | NLopt MIT Wasm candidate | SciPy trajectories need not match, but complete simplex semantics, budgets, and corpus must |
| 1 | COBYLA | NLopt MIT Wasm candidate; PRIMA oracle | Curved/redundant/infeasible/scaled constraints; never trust status alone |
| 2 | BFGS | Correct dynamic implementation while evaluating compiled exact algorithm | Expanded smooth/nonconvex/ill-conditioned suite; reject current Cpp implementation |
| 2 | L-BFGS-B | Compare CppNumericalSolvers, LBFGS++, and original method | Active/free/fixed bounds, projected gradients, large dimensions, callback errors |
| 2 | CG / Newton-CG | Correct dynamic implementation first | Supplied/finite-difference derivative contracts and Hessian-vector cases |
| 2 | Powell | Dynamic implementation; PRIMA family only if API semantics match | Direction-set and bound behavior, not merely derivative-free convergence |
| 2 | TNC | Exact TNC candidate or dynamic implementation | Do not substitute L-BFGS-B for Sage's default TNC |
| 3 | Global methods | Explicitly named algorithms | Pinned multi-seed success, evaluation budget, deterministic seeding, no family substitution |

## Delivery phases

### Phase 0: make the evidence durable

- Keep the 25-case corpus and schemas in-tree.
- Add a `scipy-oracle` development command and compare receipts by corpus hash.
- Add MGH, CUTEst subsets, exceptions/cancellation, and memory/payload probes.
- Run the corpus on persistent Linux x64, Linux ARM64, macOS ARM64, and Windows
  x64 hosts before using GitHub release CI.

Exit: every selected method has an explicit compatibility contract and no
backend can pass solely on its status flag.

### Phase 1: callback-capable numerical Wasm pack

- Implement and fuzz the generic packed callback ABI without a solver.
- Add cancellation, exception, reentrancy, allocation, and corruption tests.
- Vendor cminpack and NLopt MIT-only as separate internal cores in one pack.
- Record source/license manifests and verify no disallowed NLopt object or
  symbol is linked.
- Run the exact same Wasm artifact on all supported hosts and browser engines.

Exit: the ABI is stable internally, lifecycle-clean, sanitizer-clean where
applicable, and its overhead remains immaterial on representative objectives.

### Phase 2: first Sage compatibility surface

- Land Brent root/scalar wrappers and fallbacks.
- Enable cminpack LM only after the full Wasm cross-check passes.
- Enable NLopt Nelder-Mead and COBYLA separately after their gates pass.
- Publish backend and evaluation-count diagnostics without exposing an
  accidental stable internal ABI.

Exit: focused Sage examples and corpus cases agree mathematically with Sage,
SciPy, MINPACK, or PRIMA as appropriate in browser, Node, and SEA.

### Phase 3: gradient and bounded multivariate methods

- Evaluate original or mature BFGS, CG, Newton-CG, L-BFGS-B, and TNC cores using
  the expanded corpus.
- Prefer compiled source-transparent control loops when that preserves the
  exact algorithm and avoids another dependency.
- Add one method at a time; keep correct dynamic fallback for unqualified
  inputs.

Exit: all algorithms accepted by Sage's public `algorithm=` parameters have
honest identity and cross-platform evidence.

### Phase 4: optional global and native acceleration

- Define an explicit global-optimization API rather than overloading Sage
  local minimization.
- Evaluate seeded algorithms under fixed evaluation budgets.
- Consider native builds only where a measured application workload justifies
  the distribution and numerical-divergence cost.

## Release and CI gates

Routine CI should be small and fail fast:

- schemas and source/license inventory;
- one success, one boundary/degenerate case, and one failure per enabled
  method;
- callback exception, cancellation, and lifecycle checks;
- browser and Node execution of the same Wasm pack; and
- a generous regression ceiling for gross callback/performance mistakes, not
  fragile microsecond assertions.

Release qualification should additionally run:

- the complete 25-case corpus and its expansions on all four persistent hosts;
- SciPy/Sage differentials with pinned versions;
- full cminpack/MINPACK, PRIMA/CUTEst, and method-specific upstream oracles;
- sanitizer, fuzz, allocation-failure, corruption, and repeated-lifecycle
  campaigns;
- deterministic-seed global trials;
- cold and warm timing, RSS, and payload receipts; and
- relocation tests for browser, npm, and SEA packaging.

Performance is a selection gate only after correctness. Compare on the same
host, runtime, objective, initial point, tolerance, derivative policy, and
evaluation budget. Report callback counts alongside elapsed time. Separate
cold startup and payload from warm solving. A backend that changes the method,
stops at a different tolerance, or omits validation has not won a benchmark.

## What not to do

- Do not merge thousands of lines of newly translated solvers merely because
  their CPython microbenchmarks look good.
- Do not use one backend's “success” bit as the correctness contract.
- Do not substitute methods silently to fill a capability table.
- Do not make BLAS/LAPACK, a Fortran toolchain, Rust, Julia, or a Python runtime
  release dependencies without a demonstrated application-level benefit.
- Do not ship four native numerical variants before the universal Wasm build is
  shown insufficient.
- Do not treat a fast Rosenbrock-2 result as evidence for high-dimensional or
  constrained reliability.
- Do not let optional global optimization delay Sage's existing local
  optimization and fitting surface.

## Reproduction

The corpus and the exact checked-in receipts are under
[`bench/numerical-optimization/`](../bench/numerical-optimization/README.md).
The primary commands are:

```sh
python3 bench/numerical-optimization/run.py --list

python3 bench/numerical-optimization/run.py \
  --backend scipy --samples 7 \
  --output /tmp/scipy-numerical-optimization.json

node bench/numerical-optimization/callback-boundary.mjs \
  --count 1000000 --samples 9 \
  --output /tmp/sagejs-numerical-callback.json
```

Receipts identify the backend, source subject, Sage.js revision, runtime,
platform, protocol, every timing sample, mathematical metrics, normalized
result, status, evaluation counts, acceptance reasons, and stochastic trials.
Validate `corpus.json` against `corpus.schema.json` and each solver receipt
against `results.schema.json` before comparing or publishing it.

## Bottom line

The right foundation is **Sage-compatible Python semantics plus small vetted
solver cores behind a universal callback-capable Wasm ABI**. cminpack is the
best technical match for LM fitting, subject to its full Wasm cross-check.
NLopt's permissive subset is the best broad first core, subject to
method-by-method qualification and independent result validation. No surveyed
library presently justifies owning every method, and the evidence directly
rejects at least one tempting whole-library choice.

This design gets performance from compiled iterative loops, keeps arbitrary
browser callbacks, reduces cross-platform variation, avoids a heavyweight
scientific runtime, and preserves the most important property: when Sage.js
says it ran a Sage algorithm, that claim is inspectable and true.
