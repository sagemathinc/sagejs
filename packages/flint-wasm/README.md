# Sage.js WebAssembly proof of concept

This package links CoWasm's WebAssembly builds of FLINT, GMP, and MPFR into a
small, browser-compatible Sage.js evaluator. It currently compiles and
evaluates Sage source and exposes integer factorization, primality testing,
proven next-prime searches, and a first modular-symbol core through a narrow C
ABI. The factorization ABI
returns the same structured `{ sign, factors }` result as the
native Node-API add-on, so the ordinary Sage.js baselib constructs and
displays `IntegerFactorization` objects unchanged. A small exact JavaScript
backend supplies polynomial construction, arithmetic, powers, equality, and
representation over `ZZ`, `QQ`, prime fields, and composite residue rings;
advanced polynomial algorithms still require future FLINT WASM bindings. The
same portable backend provides dense exact `ZZ`, `QQ`, `GF(p)`, and `Zmod(n)`
matrices with addition, multiplication, determinant, characteristic
polynomial, inverse, and linear solving. It computes rational RREF, integer
Hermite form, and composite-ring Howell forms and module kernels. Its public
contract matches
the native FLINT matrix backend, so Sage-facing matrix code and serialized
results do not depend on the host.

The native and WASM builds compile the same host-neutral `P1List` and
weight-2 `Gamma0(N)` Manin-presentation sources. The compact correctness and
introspection call remains useful:

```js
flint.modularSymbolsWeight2Info(389)
// { level: 389, p1Count: 390, dimension: 65, ... }
```

The P1 checksum is checked against the Node build at prime and composite
levels. The WASM adapter now also owns persistent, independently usable P1
objects and transfers exact matrices from linear memory in one batch. Thus
the ordinary Sage-facing `P1List(N)` and weight-2 `ModularSymbols(N)` APIs run
unchanged in the browser, including normalization and `S`, `R`, `I`, and
translation actions; minimal Manin presentations; rational path reduction;
boundary and cuspidal subspaces; signed star eigenspaces; and exact prime
Hecke matrices. The headless-browser suite exercises all of those layers
through the public evaluator instead of calling a private smoke-test ABI.

Dense rational matrices can remain generated, type-tagged FLINT resources in
Wasm linear memory. Construction, bulk import, copying, multiplication, RREF,
rank, determinant, formatting, and serialization use the same declarations
and host-neutral C ABI as Node. Variable-size results remain owned by FLINT;
only an explicitly requested serialization or formatted result is copied into
host-owned bytes. The generated wrapper validates handles, closes resources
deterministically, and supplies a tracing-GC finalizer fallback. Other exact
matrix families still use portable JavaScript matrix objects after crossing
the C ABI. Higher-weight and Dirichlet-character Manin presentations also
still require host-neutral core extraction from the Node adapter.

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
The compiler worker uses the same authoritative Tree-sitter Sage/Python
frontend and CST lowerer as Node. The three small parser WASM assets and a
browser bundle of the frontend are local package resources; the historical
stage-zero parser is not part of this path.

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

This direct ABI is intentionally a baseline. Host-neutral mathematical C lives
under `packages/flint/src`, while Node-API and WASM files are thin adapters.
A Node-API compatibility layer
such as `napi-wasm` or `emnapi` could potentially reuse more of the existing
native add-on, but it would also ship and execute an additional emulation
layer. Once more FLINT operations are exposed, the two approaches can be
compared using identical functionality and payload measurements.
