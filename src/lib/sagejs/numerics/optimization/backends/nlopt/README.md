# Qualified NLopt Wasm methods

This internal package builds a single callback-capable WebAssembly reactor from
NLopt revision `6e6593f131ba3a38bc9edbed0a357bc01526e54b`. It exposes two exact,
separately qualified outward method identities:

- `nlopt-nelder-mead` (`NLOPT_LN_NELDERMEAD`); and
- `nlopt-cobyla` (`NLOPT_LN_COBYLA`).

It is deliberately not registered in automatic numerical planning. An explicit
request either runs the named NLopt method inside its qualified envelope or
fails with a structured capability error. Public optimization integration must
independently validate objective finiteness, bounds, feasibility, and any
claimed local optimality; NLopt's return status is only backend evidence.

The adapter accepts up to 128 variables and 512 scalar constraints, but this is
not the public validated-minimum envelope. The public router limits both exact
methods to 32 variables and limits `nlopt-cobyla` to 64 constraints so it can
construct a dense independent tangent-space curvature model. Active bounds and
inequalities require strict complementarity; nonlinear equality Jacobians must
be full rank and locally retractable. Non-strict active sets, rank or retraction
ambiguity, and ill-scaled finite-difference geometry fail closed as
`indeterminate` rather than inheriting a positive NLopt status.

The mathematical algorithms are unmodified upstream NLopt C. The handwritten C
file is a bounded foreign-library adapter: it owns packed memory, callbacks,
force-stop propagation, allocation accounting, status copying, and cleanup.
One objective value or a complete constraint vector crosses each callback.
Derivative buffers are part of the ABI for future methods, but these two
derivative-free methods are qualified only when they request neither objective
gradients nor constraint Jacobians.

## License closure

NLopt's top-level build enables LGPL Luksan methods by default. This package
does not compile the broad target. Its source lock records `NLOPT_LUKSAN=OFF`,
and the build has a fail-closed allowlist containing only the two selected
permissive algorithms and their utility dependencies. It rejects every source
path containing `luksan`, `esch`, or `ags`, hashes the complete selected source
closure, verifies the distributed upstream `COPYING`, and records the final
artifact imports/exports. Dead-code elimination is not used as the license
boundary: disallowed sources never enter the compilation.

## Reproduce

```sh
node src/lib/sagejs/numerics/optimization/backends/nlopt/scripts/build.cjs
node src/lib/sagejs/numerics/optimization/backends/nlopt/scripts/verify-release.cjs
node --test test/numerical-p3-nlopt/backend.test.mjs
node --test test/numerical-p3-nlopt/abi-fuzz.test.mjs
node test/numerical-p3-nlopt/browser.mjs
python3 bench/numerical-p3-nlopt/scipy_oracle.py
node src/lib/sagejs/numerics/optimization/backends/nlopt/qualification/run.mjs
```

Generated archives, source trees, objects, Wasm, and receipts remain under
ignored `build/`. The reviewed
[`release/production-manifest.json`](release/production-manifest.json) binds
the source closure, toolchain, ABI, host adapter, JavaScript host, and final
artifact used for qualification.
