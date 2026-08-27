# Embedding Sage.js

Sage.js provides persistent, interruptible evaluation sessions for embedding
mathematics in applications. A session owns an isolated worker, so arbitrary
synchronous code cannot block the application's main event loop. Interrupting
or resetting a session terminates that worker and starts a clean replacement.

## Node.js

```js
const { createSage } = require("@sagemath/sagejs");

const sage = await createSage();

sage.on("stdout", (text) => process.stdout.write(text));

const result = await sage.evaluate(`
sum(n^2 for n in [1..100])
`);

console.log(result.repr);
await sage.close();
```

The public npm package automatically installs a platform package on Linux x64,
Linux arm64, Apple Silicon macOS, and Windows x64. `createSage()` starts that
package's native Sage.js runtime as an isolated child process and keeps one
session alive across evaluations. Native addons and mathematical objects stay
inside that process; the application receives clone-safe results and streamed
text. No unpublished `@sagemath/sagejs-flint` package is required.

Definitions persist between evaluations:

```js
await sage.evaluate("R.<x> = QQ[]");
const result = await sage.evaluate("(x - 1)^5");
```

Use `{ mode: "python" }` to disable Sage syntax:

```js
const python = await createSage({ mode: "python" });
```

On Node, an individual evaluation can select any bundled language frontend
without changing sessions:

```js
await sage.evaluate("A = [1 2; 3 4];", { language: "matlab" });
await sage.evaluate("A[0, 0] = 9", { language: "sage" });
const result = await sage.evaluate("A(1,1)", { language: "matlab" });
```

The supported values are `sage`, `python`, `magma`, `matlab`, `maple`, and
`wolfram`. Every frontend targets the same evaluator namespace, so compatible
objects are shared directly rather than serialized between language
processes.

## Browser and WebAssembly

Sage.js already runs as a fully local WebAssembly application at
[app.sagejs.org](https://app.sagejs.org/). The browser kernel is also an
embeddable ES module. During this early alpha, build and self-host its
receipt-verified static package as described in
[`packages/flint-wasm/README.md`](packages/flint-wasm/README.md), then import
the copied browser implementation from your own origin:

```js
import { createSage } from "./vendor/sagejs-wasm/kernel.mjs";

const sage = await createSage();
const result = await sage.evaluate("factor(2026)");
console.log(result.repr);
```

The browser session owns an outer evaluator Web Worker. That worker owns all
mathematical objects and the FLINT WebAssembly instance; a nested worker owns
the self-hosted compiler. The browser main thread only receives structured,
clone-safe evaluation results and output events.

The browser distribution includes the same precompiled standard-library
modules used by Node, loaded into the compiler worker from a versioned
manifest. Ordinary imports such as `import math` therefore work without a
browser filesystem.

## Output and results

`evaluate()` and its `eval()` alias return:

```ts
interface SageEvaluationResult {
  repr: string;
  stdout: string;
  durationMs: number;
  display?: {
    mime: string;
    data: unknown;
  };
}
```

`repr` is the Sage/Python representation of the final expression. It is empty
when there is no final value. `stdout` contains all Python `print()` output
from that evaluation. Applications can render output incrementally as well:

```js
const result = await sage.evaluate(source, {
  onOutput(text) {
    appendToOutput(text);
  },
});
```

The session also emits `stdout` and `stderr` events. Native and WebAssembly
mathematical objects remain opaque and worker-owned. Values with a
`_rich_repr_()` method may additionally return clone-safe structured display
data. Plotting v0 uses `application/vnd.plotly.v1+json`:

```js
import {
  renderSageDisplay,
} from "./vendor/sagejs-wasm/plotly-renderer.mjs";

const result = await sage.evaluate(`
plot(sin(x^2), (x, 0, 2*pi))
`);

if (result.display) {
  await renderSageDisplay(container, result.display, Plotly);
}
```

The renderer is separate from the kernel and receives Plotly explicitly. A
Node application can preserve or transform the same figure payload without
loading a browser plotting library. See [`PLOTTING.md`](PLOTTING.md) for the
supported Sage API and current limits.

Browser hosts can also implement Sage's `Graphics.save()` operation:

```js
import {
  downloadSageDisplay,
} from "./vendor/sagejs-wasm/plotly-renderer.mjs";

const sage = await createSage({
  onGraphicsSave(request) {
    return downloadSageDisplay(
      request.display,
      request.filename,
      request.options,
      Plotly,
    );
  },
});

await sage.evaluate(`
g = plot(prime_pi, 1, 100)
g.save('prime-counting.png')
`);
```

The evaluator waits for `onGraphicsSave` before resolving `evaluate()`. A
browser embedding which does not install this capability receives an explicit
export error instead of silently discarding the requested file.

## Documentation records

An embedding can inspect the exact API installed in its worker:

```js
const catalog = await sage.documentation();
const finiteFields = catalog.entries.filter((entry) =>
  entry.tags.includes("finite fields")
);
```

This returns structured-clone-safe [DocSpec v1](DOCSPEC.md) entries containing
the retained docstring and signature together with Sage compatibility,
backends, limitations, provenance, and references. Live mathematical objects
do not cross the worker boundary.

## Interruption, timeouts, and reset

```js
await sage.interrupt();

await sage.evaluate("factor(2^521 - 1)", {
  timeout: 10_000,
});

await sage.reset();
```

On Node, evaluations run in an interruptible VM context. Normal interruption
therefore raises `KeyboardInterrupt` inside the evaluator and preserves
definitions, just as an interactive Python user expects. This applies to tight
generated loops and `time.sleep()`, and user code may catch the exception.

An uncooperative native call may not return control to the VM promptly. If a
computation does not respond during the short interruption grace period,
Sage.js terminates and replaces the worker as a last resort. That reliably
stops the computation, but definitions from that session are then discarded.
Evaluation timeouts and `reset()` deliberately retain the clean-state
replacement behavior.

Call `close()` when the embedding is finished. Evaluations submitted after
closing reject with `SageSessionClosedError`.

## Embedding contract

Embeddable Kernel v1 establishes these invariants:

- evaluations in one session are ordered and share a namespace;
- separate sessions are isolated;
- output is associated with its evaluation;
- VM interruption preserves state, with worker replacement as a reliable
  fallback;
- Node and browser sessions expose the same lifecycle, text, and rich-result
  shape;
- worker-owned mathematical objects never cross the transport accidentally.

This API is the common foundation for the browser demo, calculator widgets,
notebook kernels, agent tools, and visualization output.
