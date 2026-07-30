# Sage.js WebAssembly proof of concept

This package links CoWasm's WebAssembly builds of FLINT, GMP, and MPFR into a
small, browser-compatible Sage.js evaluator. It currently compiles and
evaluates Sage source and exposes integer factorization, primality testing,
and proven next-prime searches through a narrow C ABI. The factorization ABI
returns the same structured `{ sign, factors }` result as the
native Node-API add-on, so the ordinary Sage.js baselib constructs and
displays `IntegerFactorization` objects unchanged. A small exact JavaScript
backend supplies polynomial construction, arithmetic, powers, equality, and
representation over `ZZ`, `QQ`, and prime fields; advanced polynomial
algorithms still require future FLINT WASM bindings. The same portable backend
provides dense exact `ZZ` and `QQ` matrices with addition, multiplication,
determinant, rank, inverse, and linear solving. Its public contract matches
the native FLINT matrix backend, so Sage-facing matrix code and serialized
results do not depend on the host.

The JavaScript loader has no host Node.js dependency. Its browser bundle uses
CoWasm's `wasi-js` with `@cowasm/memfs`, so FLINT can create, seek, reopen, and
unlink temporary files entirely in memory. This matters for algorithms such as
the quadratic sieve; no browser filesystem access is required. The demo uses
two isolated realms:

1. An outer evaluator Web Worker owns the Sage runtime and all mathematical
   objects.
2. A nested compiler worker runs the self-hosted Sage.js compiler and returns
   generated JavaScript.

This mirrors the separate VM context used by the Node REPL and prevents the
compiler's compatibility runtime from colliding with the evaluated program.
The main page stays responsive and can interrupt either compilation or
mathematics reliably by terminating and replacing the outer worker.
Python `print()` output is streamed back to the page as it is produced, with
its exact `sep` and `end` text preserved independently of the final expression
representation. Sage-compatible graphics cross the same boundary as a
structured Plotly figure; the worker-owned `Graphics` object itself remains
inside the evaluator.

The build also packages Sage.js's precompiled Python standard library into a
browser manifest. Imports such as `import math` therefore use the same
compiler-version and source-signature-checked module cache as Node rather than
requiring filesystem access or recompiling library source in the browser.

The public `@sagemath/sagejs-flint-wasm/kernel` entry point packages this
architecture as an embeddable session:

```js
import { createSage } from "@sagemath/sagejs-flint-wasm/kernel";

const sage = await createSage();
sage.on("stdout", (text) => appendOutput(text));
const result = await sage.evaluate("factor(2026)");
await sage.close();
```

Rich graphics can be rendered with the separate adapter:

```js
import {
  renderSageDisplay,
} from "@sagemath/sagejs-flint-wasm/plotly-renderer";

const result = await sage.evaluate(
  "plot(lambda x: x*x, (-2, 2), title='Squares')",
);
if (result.display) {
  await renderSageDisplay(element, result.display, Plotly);
}
```

The adapter accepts an injected Plotly implementation, so applications may
choose the complete distribution or a smaller custom bundle. Plotly is not
loaded in the worker or mathematical runtime. The included demo copies a
local full bundle during its build and does not require a plotting CDN.

Definitions persist across evaluations. `interrupt()`, `reset()`, and
per-evaluation timeouts terminate and replace the outer worker, so even
arbitrary synchronous loops cannot freeze the embedding page. The demo is a
thin client of this API rather than a separate worker protocol.

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
The bundled WASI and in-memory filesystem host is about 0.55 MiB uncompressed.
The 23-module standard-library manifest is about 3.3 MiB uncompressed and
0.4 MiB with gzip. It includes both source signatures and precompiled output,
allowing the synchronous compiler import machinery to operate entirely from
worker memory.

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
The smoke test can take several minutes: it executes `factor(2026)`, verifies
persistent definitions, `QQ['x'].gen()`, rational polynomial arithmetic, and
Sage exponentiation across subsequent evaluations. It verifies a cached
`import math`, then checks streamed output from a loop that factors every
integer from 2025 through 2050. It also runs `factor(n^22 - 1)` over that range,
exercising FLINT's disk-oriented quadratic-sieve code against the in-memory
WASI filesystem. It finally starts an infinite Sage loop, interrupts it from
the page, and verifies that the replacement worker can evaluate another
factorization. The test also renders a sampled `plot()` result through local
Plotly and verifies its trace data in Chromium.

The current proof of concept evaluates generated JavaScript in the isolated
worker and therefore requires a Content Security Policy that permits dynamic
code generation there. Removing that restriction will require a different
generated-module/runtime boundary; it is not a WASM or FLINT limitation.

This direct ABI is intentionally a baseline. A Node-API compatibility layer
such as `napi-wasm` or `emnapi` could potentially reuse more of the existing
native add-on, but it would also ship and execute an additional emulation
layer. Once more FLINT operations are exposed, the two approaches can be
compared using identical functionality and payload measurements.
