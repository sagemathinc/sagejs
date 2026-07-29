# Sage.js WebAssembly proof of concept

This package links CoWasm's WebAssembly builds of FLINT, GMP, and MPFR into a
small, browser-compatible Sage.js evaluator. It currently compiles and
evaluates Sage source and exposes integer factorization through a narrow C
ABI. The ABI returns the same structured `{ sign, factors }` result as the
native Node-API add-on, so the ordinary Sage.js baselib constructs and
displays `IntegerFactorization` objects unchanged.

The JavaScript loader has no Node.js dependencies. The demo uses two isolated
realms:

1. An outer evaluator Web Worker owns the Sage runtime and all mathematical
   objects.
2. A nested compiler worker runs the self-hosted Sage.js compiler and returns
   generated JavaScript.

This mirrors the separate VM context used by the Node REPL and prevents the
compiler's compatibility runtime from colliding with the evaluated program.
The main page stays responsive and can interrupt either compilation or
mathematics reliably by terminating and replacing the outer worker.

## Build

First build the FLINT stack in a sibling
[CoWasm](https://github.com/sagemathinc/cowasm) checkout. If the checkout is
elsewhere, set `SAGEJS_COWASM_ROOT`:

```sh
git clone https://github.com/sagemathinc/cowasm.git ../cowasm
(cd ../cowasm && pnpm install && make -C sagemath/flint test-wasi-sdk-standalone)
pnpm build:wasm
pnpm test:wasm
```

For a checkout outside the sibling path, build with
`SAGEJS_COWASM_ROOT=/path/to/cowasm pnpm build:wasm`.

The build uses CoWasm's WASI SDK and static `libflint`, `libmpfr`, and `libgmp`
archives. The resulting `dist/flint-factor.wasm` is about 4.7 MiB before HTTP
compression and about 2 MiB with gzip in the current build. The self-hosted
compiler and baselib add about 3.8 MiB uncompressed or 0.45 MiB with gzip.

## Browser demo

After building, serve the repository over HTTP:

```sh
python3 -m http.server 8000
```

Then open
`http://localhost:8000/packages/flint-wasm/demo/`.

For a real headless-Chromium smoke test of the Web Worker path:

```sh
pnpm test:wasm:browser
```

Set `SAGEJS_CHROMIUM` if Chromium is not installed at a standard Linux path.
The smoke test executes `factor(2026)`, then verifies persistent definitions
and Sage exponentiation across subsequent evaluations. It finally starts an
infinite Sage loop, interrupts it from the page, and verifies that the
replacement worker can evaluate another factorization.

The current proof of concept evaluates generated JavaScript in the isolated
worker and therefore requires a Content Security Policy that permits dynamic
code generation there. Removing that restriction will require a different
generated-module/runtime boundary; it is not a WASM or FLINT limitation.

This direct ABI is intentionally a baseline. A Node-API compatibility layer
such as `napi-wasm` or `emnapi` could potentially reuse more of the existing
native add-on, but it would also ship and execute an additional emulation
layer. Once more FLINT operations are exposed, the two approaches can be
compared using identical functionality and payload measurements.
