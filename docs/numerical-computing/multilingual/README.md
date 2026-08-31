# Multilingual numerical intent

`sagejs.numerics.frontends` is the language boundary of the numerical
laboratory. Sage, Python/SciPy, MATLAB, and Wolfram spellings lower to one
versioned, source-independent request before a numerical package selects an
algorithm or backend. Frontends never contain a second solver.

The foundational catalog contains 22 operations:

- scalar roots;
- dense solve and minimum-norm least squares;
- symmetric and general eigensystems, reduced SVD, one-dimensional FFT, and
  convolution;
- interpolation, cubic splines, and definite quadrature;
- bounded scalar and unconstrained multivariate minimization, nonlinear
  systems, nonlinear least squares, and linear fitting;
- explicit nonstiff initial-value problems;
- descriptive statistics, one- and two-sample t inference, and linear
  regression; and
- deterministic parameter sweeps.

Every registered source alias can execute through its package's structured
result. Emitted code is deliberately narrower: it is available only where the
target's default convention is qualified. An unavailable target raises
`UnsupportedFrontendError` with `unsupported_target`; it never prints
plausible-looking code with changed normalization, orientation, resource, or
callback semantics.

## One canonical request

```python
from sagejs.numerics.frontends import create_frontend_registry

frontends = create_frontend_registry()
matlab = frontends.lower("matlab", "linsolve", [[3, 1], [1, 2]], [9, 8])
wolfram = frontends.lower("wolfram", "LinearSolve", [[3, 1], [1, 2]], [9, 8])

assert matlab.digest == wolfram.digest
answer = frontends.execute(matlab)
assert answer.value == [2.0, 3.0]
assert answer.numerical_result.validation.passed
```

`FrontendExecutionResult` retains both the canonical frontend intent and the
complete domain result. `.value` is only the natural short view; validation,
diagnostics, provenance, trace, and resource measurements remain on
`.numerical_result`.

Callbacks execute as live bindings. Tooling may additionally record a checked
scalar-expression subset so the request is replayable:

```python
intent = frontends.lower(
    "matlab",
    "fminbnd",
    lambda x: (x - 2) ** 2,
    0,
    4,
    expression="(x-2)^2",
)
python_source = frontends.emit(intent, "python-scipy")
assert frontends.parse(
    python_source, "python-scipy", intent.operation_ref
).digest == intent.digest
```

The expression subset contains finite real literals, symbols, parentheses,
comparisons, arithmetic, powers, and common elementary functions. Vector
callbacks use a list of expressions. Opaque callbacks execute but emission
returns `non_replayable_intent`.

## Support ledger

The machine-readable ledger is
[`support-matrix.json`](support-matrix.json). "runtime" means a source alias
lowers and executes the canonical Sage.js operation. "emit" means the adapter
also emits target-native source and accepts an exact checked round trip.

Important boundaries:

- general eigensystems and reduced SVD do not emit Wolfram code until
  eigenvector orientation and near-defective behavior are qualified;
- interpolation emits only Sage and SciPy; MATLAB and Wolfram interpolant
  defaults do not preserve the current method-selection contract;
- convolution does not emit Wolfram code until padding and origin conventions
  have a differential fixture;
- nonstiff IVP code does not emit Wolfram code until state/event conventions
  are qualified; and
- sweeps emit only Sage and Python because MATLAB `arrayfun` and Wolfram `Map`
  do not preserve deterministic seed, quota, cancellation, and item-evidence
  contracts.

Code generation currently rejects nondefault options. Runtime calls accept the
documented package options, but target option dictionaries have not all been
proven equivalent. This is an intentional `unsupported_option`, not a partial
translation.

## Natural runtime surfaces

`matlab.py` and `wolfram.py` provide the runtime views used by their parsers.
Representative names include MATLAB `linsolve`, `lsqminnorm`, `eig`, `svd`,
`fft`, `conv`, `integral`, `fminbnd`, `fminsearch`, `fsolve`, `lsqnonlin`,
`polyfit` (degree one), `ode45`, `ttest`, `ttest2`, and `fitlm`; and Wolfram
`LinearSolve`, `LeastSquares`, `Eigensystem`, `Fourier`, `NIntegrate`,
`FindMinimum`, `NDSolveValue`, and the explicitly Sage.js-named statistics
helpers.

Natural short return values do not erase evidence. Functions with meaningful
structured state have a `*_result` helper or retain the result in a wrapper.
MATLAB `polyfit` explicitly rejects degrees other than one because only the
validated linear-fit operation exists.

## Checked emitted source

Generated code contains executable target-native source plus a canonical
semantic envelope and a SHA-256 of the exact body. Parsing verifies the body,
operation, operands, options, and outputs. Editing the body produces
`semantic_mismatch`; source without a valid envelope produces `parse_failure`.
This parser recognizes Sage.js-generated source. It is not a claim to parse
arbitrary SciPy, MATLAB, or Wolfram programs.

Frontend diagnostics have stable codes:

- `unsupported_operation`: no source alias is registered;
- `unsupported_target`: a target convention is not qualified;
- `unsupported_option`: an option cannot be preserved by outward code;
- `invalid_frontend_arguments`: natural syntax cannot form a valid request;
- `non_replayable_intent`: a live value lacks portable expression provenance;
- `parse_failure`: source is outside the checked generated subset; and
- `semantic_mismatch`: a claimed generated round trip changed semantics.

## Evidence

The corpus under `test/numerics/multilingual/` executes every catalog domain,
checks equivalent aliases, verifies every claimed emitted-source round trip,
exercises unsupported boundaries, and invokes representative MATLAB and
Wolfram runtime entrypoints. Offline fixtures record the public API facts used
without copying or executing proprietary vendor output.

`bench/numerics/multilingual/intent-codegen.cjs` measures representation and
checked-round-trip overhead. It is not a solver-performance claim.
