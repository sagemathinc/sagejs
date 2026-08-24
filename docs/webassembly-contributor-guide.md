---
title: "Contributing portable WebAssembly mathematics"
---

# Contributing portable WebAssembly mathematics

Portable Sage.js code has one mathematical implementation and thin host
adapters. Start with ordinary CPython-parseable Python, preserve the dynamic
fallback, and move only measured work across a declared boundary. Do not port
Node-API conversion code to WebAssembly and do not copy an algorithm into a
browser-only module.

Read [the mathematical architecture](../ARCHITECTURE.md), [FFI
declarations](../FFI.md), and the [packed ABI rules](webassembly-packed-abi.md)
before changing a compiled path.

## Choose the narrowest architecture

Use this order:

1. Ordinary strict Python with the same public semantics on every host.
2. A source-transparent `@native` kernel compiled from its canonical emitted
   core for Node and Wasm.
3. A mature-library operation declared once in `.ffi.py`, with generated Node
   and Wasm adapters.
4. A compact host-neutral shared C core around FLINT, Arb, Acb, or another
   mature library.
5. A host adapter that validates, copies, invokes the core, and translates its
   bounded status.

Handwritten mathematical C needs the architecture exception required by
[`architecture/native-code.json`](../architecture/native-code.json). Node-API
and WebView code are host adapters, never the source of mathematical policy.

## Adding a source-transparent kernel

Keep the typed Python function and dynamic fallback authoritative. The native
compiler emits host-independent `kernel_core.c` and `kernel_core.h`; compile
that exact core into the production Wasm pack. Its identity includes source,
core ABI, FFI declaration, generator, and oracle hashes.

Required evidence includes:

- same-source fallback versus compiled-Wasm differential tests;
- inspectable core/IR/target output;
- a representative benchmark when performance motivates compilation;
- a production capability receipt;
- explicit behavior when the pack is unavailable.

Registering a production kernel without a Wasm disposition fails
`pnpm architecture:wasm`.

## Adding declared FFI

Put ownership, effects, errors, targets, and native ABI in the ordinary
CPython-parseable declaration. Prefer a complete batch with one packed ingress
and one packed egress over scalar calls in a loop. The production closure is
selected from declarations and public consumers; it is not a handwritten list
of convenient C symbols.

Generated Wasm adapters must:

- validate complete offset/length ranges before creating a view;
- copy output before memory growth, mutation, or close unless a reviewed
  borrowed-view contract says otherwise;
- keep allocation and destruction inside one module ownership domain;
- use generation-tagged handles and deterministic idempotent close;
- reject stale, wrong-type, cross-module, and closed handles;
- translate a bounded status only after the core returns.

Run the focused FFI generator tests and `pnpm architecture:check`. Unknown
types, ownership, effects, targets, or error policies fail closed.

## Extracting a shared core

Separate three layers:

```text
ordinary Sage/Python materialization
            |
host adapter: validate, pack, copy, translate status
            |
shared core: host-neutral mathematics and mature-library calls
```

The core may include fixed-width types and library headers, but not
`napi_value`, `napi_env`, V8, JavaScript callbacks, or public host objects.
Node and Wasm wrappers must call the same core. If the core returns a variable
result, use a bounded size/query-and-copy protocol or an owned resource rather
than manufacturing JavaScript dictionaries in C.

Classify every new native file and record the dynamic oracle. A source name
such as `*_core.c` is not evidence that the implementation is portable; the
architecture checks inspect the classified boundary.

## Public materialization and dispatch

Construct factors, ideals, matrices, complex values, diagnostics, and public
exceptions above the ABI in ordinary Sage.js. Keep a capability miss separate
from bad input or mathematical failure. Dispatch must be observable before
expensive work begins and choose one of:

- production Wasm accelerator;
- tested ordinary implementation;
- explicit unavailable capability.

Update the reviewed manifest entry and its public explanation. Mark a
capability `available` only when the tracked production closure and release
receipt contain its exact ID. See [WebAssembly capability
manifest](../architecture/WASM-CAPABILITIES.md).

## Vertical-slice test checklist

A complete public slice tests:

- the identical Sage program in Node and Chromium;
- release parity in Chromium, Firefox, and WebKit;
- exact digests or precision-aware numerical tolerances;
- fallback differentials and malformed inputs;
- resource limits, memory growth, stale views, close, and reset;
- SagePack Node-to-browser and browser-to-Node;
- interruption of JavaScript and native Wasm loops;
- cold/warm latency, peak memory, copy volume, and artifact size;
- Windows native behavior or an explicit tested fallback.

Add a case to
[`test/browser-wasm-parity-corpus.json`](../test/browser-wasm-parity-corpus.json)
instead of writing separate Node and browser programs. Documentation examples
can name a corpus case with `browser-parity=CASE`; the focused documentation
test rejects drift. See [portable examples](webassembly-examples.md).

## Contributor loop

For a narrow parallel lane, claim only the Python source, shared core or FFI
declaration, focused tests, and documentation it owns. Shared package,
capability registry, CI, and release changes belong to the integration lane.

```sh
pnpm parallel:check
pnpm test:changed
pnpm architecture:check
```

Use the [clean reproducible build guide](webassembly-reproducible-builds.md)
when the linked closure, toolchain, or production assets change. A local
ambient compiler or mathematical-library prefix is not release evidence.
