# P6 integration handoff

The P6 Python runtime owns the numerical semantics. TypeScript parser frontends
should only recognize natural source syntax and lower it to these runtime
entrypoints; they must not contain numerical algorithms.

## Shared files the integration lane must update

The multilingual lane intentionally does not claim these shared files. Apply
the following narrow changes after merging this branch.

### Strict-Python inventory

Add these fully migrated modules to `pyrightconfig.json`:

```text
src/lib/sagejs/numerics/frontends/operations.py
src/lib/sagejs/numerics/frontends/portable.py
```

Both modules pass direct Pyright and the repository strict-baselib suite.

### MATLAB parser mapping

In `tools/matlab/frontend.ts`, extend `SageLowerer.directFunctions` with the
following entries. The parser already lowers matrices, function handles, and
ordinary arguments into the forms consumed by these functions.

```ts
arrayfun: "_matlab.arrayfun",
conv: "_matlab.conv",
eig: "_matlab.eig",
fft: "_matlab.fft",
fitlm: "_matlab.fitlm",
fminbnd: "_matlab.fminbnd",
fminsearch: "_matlab.fminsearch",
fsolve: "_matlab.fsolve",
griddedInterpolant: "_matlab.gridded_interpolant",
integral: "_matlab.integral",
linsolve: "_matlab.linsolve",
lsqminnorm: "_matlab.lsqminnorm",
lsqnonlin: "_matlab.lsqnonlin",
ode45: "_matlab.ode45",
polyfit: "_matlab.polyfit",
sagejs_describe: "_matlab.sagejs_describe",
spline: "_matlab.spline",
svd: "_matlab.svd",
ttest: "_matlab.ttest",
ttest2: "_matlab.ttest2",
```

Do not add an `eig_symmetric` parser spelling: it is a Sage.js semantic alias,
not natural MATLAB syntax. MATLAB `eig` deliberately selects the general
eigenproblem contract unless the caller explicitly uses the generic intent API.
The existing backslash lowering to `_matlab.mldivide` remains unchanged.

Add parser/runtime tests beside the existing `fzero` frontend tests, including:

```js
frontend.lower("linsolve([3 1;1 2],[9;8])", true)
// contains: _matlab.linsolve

frontend.lower("conv([1 2],[3 4])", true)
// contains: _matlab.conv

frontend.lower("integral(@(x) x^2,0,1)", true)
// contains: _matlab.integral
```

Evaluate those lowered programs through a real session and assert respectively
the solution `[2, 3]`, convolution `[3, 10, 8]`, and an integral within the
reported tolerance of `1/3`. This catches parser-to-runtime disconnection, not
just generated text.

### Wolfram parser mapping

In `tools/wolfram/frontend.ts`, extend `SageLowerer.directHeads` only with heads
whose natural Wolfram argument form is already the runtime wrapper's argument
form:

```ts
LinearSolve: "_wolfram.LinearSolve",
LeastSquares: "_wolfram.LeastSquares",
Eigensystem: "_wolfram.Eigensystem",
GeneralEigensystem: "_wolfram.GeneralEigensystem",
SingularValueDecomposition: "_wolfram.SingularValueDecomposition",
Fourier: "_wolfram.Fourier",
ListConvolve: "_wolfram.ListConvolve",
SageJSDescribe: "_wolfram.SageJSDescribe",
OneSampleTTest: "_wolfram.OneSampleTTest",
TwoSampleTTest: "_wolfram.TwoSampleTTest",
LinearModelFitData: "_wolfram.LinearModelFitData",
Map: "_wolfram.Map",
```

Add checked parser/runtime cases for:

```text
LinearSolve[{{3,1},{1,2}},{9,8}]
Fourier[{1,2,3}]
SageJSDescribe[{1,2,3,4}]
```

The first must evaluate to `[2, 3]`; the other two should be compared against
the canonical runtime results, including complex-number normalization for the
Fourier result.

Do **not** direct-map `NIntegrate`, `FindMinimum`, `NDSolveValue`, or
`Interpolation`. Natural Wolfram syntax binds variables and equations and is
not the positional callback API exposed by the Python runtime. Implement these
as syntax-aware lowerers, following the existing `findRoot` pattern. The first
safe slices are:

```text
NIntegrate[expr, {x, a, b}]
  -> _wolfram.NIntegrate(lambda x: <lower expr>, a, b)

FindMinimum[expr, {x, x0}]
  -> _wolfram.FindMinimum(lambda point: (lambda x: <lower expr>)(point[0]), [x0])
```

Reject nonnumeric bounds, multiple/infinite regions, constrained minima,
symbolic parameters, differential-algebraic equations, events, and unpreserved
interpolation options with a parser diagnostic. Never fall through to an
unqualified Python function name: that turns an intentionally unsupported
translation into a misleading `NameError`.

For known numerical heads outside the qualified subset, the parser should
raise `WolframSyntaxError` with a message of the form:

```text
<Head> numerical syntax is not supported by the Sage.js Wolfram frontend
```

and the source span of the call. This is the TypeScript-side structured
unsupported result available before a Python intent exists. Once a call is
lowered into a canonical intent, target gaps use the Python
`UnsupportedFrontendError`/`FrontendDiagnostic` contract instead.

### Generated optimizer inventory

Adding strict mathematical source changes the optimizer input identity. After
all numerical lanes are merged and the normal build is current, run:

```sh
pnpm optimizer:opportunities
pnpm architecture:optimizer-opportunities
```

Commit the resulting shared `architecture/optimizer-opportunities.manifest.json`
and `docs/optimizer-opportunities.md` update in the integration lane. The P6
architecture run reaches this single expected stale-generated-artifact failure
after every preceding architecture check passes.

## Semantic boundary

Domain packages do not import MATLAB or Wolfram runtime modules. Each frontend
alias resolves through the canonical registry and executes a stable public
domain function. Generated source carries an integrity-checked semantic trailer,
so checked parsing accepts only the exact emitted body. Unsupported targets,
opaque callbacks, and unpreserved options produce stable diagnostics rather
than guessed translations.

Every future adapter must prove natural result conventions, canonical intent
equality, successful outward generation or an exact diagnostic, checked
round-tripping for the generated subset, and source-independent execution
through the owning domain result record.
