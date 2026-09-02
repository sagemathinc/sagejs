# Qualified NLopt Wasm method

This internal package builds a callback-capable WebAssembly reactor from NLopt
revision `6e6593f131ba3a38bc9edbed0a357bc01526e54b`. It exposes one exact,
explicit-only method identity:

- `nlopt-nelder-mead` (`NLOPT_LN_NELDERMEAD`).

The method is never selected automatically. NLopt's positive return status is
execution evidence, not proof of an optimum. Public success has the
`heuristic` truth level and requires independent objective finiteness, box
feasibility, empirical projected-stationarity consistency, complete resource
accounting, and a bounded coordinate-scaled probe set that found no
representably lower feasible sample. The result always states that neither a
local nor a global optimum was certified. Any contradiction or incomplete
required check fails closed.

`nlopt-cobyla` is deliberately absent. Source-bound UBSAN qualification found
the formal one-based pointer-provenance undefined behavior tracked by upstream
NLopt issue #611 in the selected f2c COBYLA implementation. Correcting that
would require a broad index normalization across `cobyla`, `cobylb`, and
`trstlp`, not a narrow host-adapter patch. Sage.js therefore defers nonlinear
constraints and records the modern PRIMA implementation as the intended future
integration route.

The handwritten C file is a bounded foreign-library adapter: it owns packed
memory, callbacks, force-stop propagation, allocation accounting, status
copying, and cleanup. The Nelder–Mead algorithm remains unmodified upstream
NLopt C. Derivative buffers remain part of the ABI for future methods, but the
qualified method must not request gradients.

## License and source closure

NLopt's broad target enables LGPL Luksan methods by default. This package does
not compile that target. Its source lock records `NLOPT_LUKSAN=OFF`, and the
build allowlist contains only upstream Nelder–Mead and its utility dependencies.
It rejects source paths containing `luksan`, `esch`, or `ags`, verifies the
distributed MIT license, and hashes the complete selected source closure.
Disallowed or deferred algorithms never enter compilation.

## Reproduce

```sh
node src/lib/sagejs/numerics/optimization/backends/nlopt/scripts/build.cjs
node --test test/numerical-p3-nlopt/backend.test.mjs
node --test test/numerical-p3-nlopt/abi-fuzz.test.mjs
node test/numerical-p3-nlopt/browser.mjs
```

The release verifier intentionally fails while
`release/production-manifest.json` says
`pending_source_current_requalification`. Source-current sanitizer, corpus,
browser, and four-platform receipts are regenerated only after independent
review of the narrowed source.
