# FLINT WebAssembly proof of concept

This package links CoWasm's WebAssembly builds of FLINT, GMP, and MPFR into a
small, browser-compatible Sage.js kernel. It currently exposes integer
factorization through a narrow C ABI and returns the same structured
`{ sign, factors }` result as the native Node-API add-on.

The JavaScript loader has no Node.js dependencies. The demo runs the kernel in
a Web Worker, so the main page remains responsive and can interrupt an
expensive factorization by terminating and replacing the worker.

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
compression and about 2 MiB with gzip in the current build.

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

This direct ABI is intentionally a baseline. A Node-API compatibility layer
such as `napi-wasm` or `emnapi` could potentially reuse more of the existing
native add-on, but it would also ship and execute an additional emulation
layer. Once more FLINT operations are exposed, the two approaches can be
compared using identical functionality and payload measurements.
