# Rust class-group browser qualification route

This directory is the initial browser route for gate W0 in
[`agents/rust-class-group-core-qualification-plan.md`](../../../../agents/rust-class-group-core-qualification-plan.md).
It does not contain, generate, or substitute for the Rust Wasm artifact. The
runner exits unsuccessfully and writes a failure receipt when the candidate is
missing, has the wrong ABI, cannot load through Sage.js's browser host, returns
the wrong mathematics, or is unavailable in a required browser engine.

The route deliberately reuses Sage.js's existing infrastructure:

- `packages/flint-wasm/test/browser-wasm-support.mjs` supplies the HTTP server,
  security headers, and Chromium/Firefox/WebKit executable discovery;
- `packages/flint-wasm/src/wasi-runtime.mjs` supplies the bounded first-party
  WASI Preview 1 host when the candidate imports `wasi_snapshot_preview1`;
- `playwright-core` drives the actual browser engines.

The baseline runner disables cross-origin isolation. A passing receipt must
therefore record `cross_origin_isolated: false` and
`shared_array_buffer: false`. Threaded or SIMD variants can be measured later,
but cannot stand in for the portable baseline required by the plan.

## Candidate ABI

The first candidate must be a Wasm32 reactor with no imports, or only imports
from `wasi_snapshot_preview1`. The qualification loader explicitly allowlists
the imports implemented by Sage.js's bounded host. It additionally supplies
`environ_get` and `environ_sizes_get` as a deterministic empty-environment
shim when a Rust `wasm32-wasip1` standard-library reactor requests them. Every
such import remains visible in the receipt. This qualification-only shim is
not evidence that the unmodified production WASI host can load the artifact.
The candidate must export:

| Export | Type | Meaning |
| --- | --- | --- |
| `memory` | `WebAssembly.Memory` | Guest linear memory |
| `sagejs_class_group_abi_version()` | `() -> i32` | Must return `1` |
| `sagejs_class_group_alloc(length)` | `(i32) -> i32` | Allocate an input buffer |
| `sagejs_class_group_dealloc(pointer, length)` | `(i32, i32) -> ()` | Release an input or result buffer |
| `sagejs_class_group_run_json(pointer, length)` | `(i32, i32) -> i64` | Run one request and return a packed result slice |

The low 32 bits of the `i64` result are the unsigned result pointer and the
high 32 bits are its unsigned byte length. Input and output are UTF-8 JSON. The
output must be a JSON object, including structured errors; traps and malformed
JSON fail the route. Input and output allocations must be distinct and remain
valid until the host copies them. The loader caps either transfer at 16 MiB and
validates every range against the current memory buffer.

The candidate may export `_initialize`; the loader invokes it through the
first-party WASI host. A command-style `_start` export is rejected. This ABI is
intentionally small enough to replace after the arithmetic trial, but precise
enough to prevent a benchmark-only browser shim from being counted as the
product route.

## Running the actual route

Build `packages/flint-wasm` first so its authenticated WASI host is available.
Then run one engine:

```bash
node bench/pari-class-group-rust/qualification/browser/run-browser.mjs \
  --engines chromium \
  --artifact bench/pari-class-group-rust/target/wasm32-wasip1/release/sagejs_class_group.wasm \
  --vector bench/pari-class-group-rust/qualification/browser/class-number-6.vector.json \
  --output build/class-group-wasm-chromium.json
```

Use `--engines firefox` or `--engines webkit` for the other engines. The W0
qualification command requests all three and fails if any is unavailable:

```bash
node bench/pari-class-group-rust/qualification/browser/run-browser.mjs \
  --engines chromium,firefox,webkit \
  --artifact PATH/TO/EXACT/CANDIDATE.wasm \
  --vector bench/pari-class-group-rust/qualification/browser/class-number-6.vector.json \
  --output build/class-group-wasm-w0.json
```

Paths may be absolute or relative to the repository, but the candidate and
vector must be inside the repository root so the hardened test server can serve
them. The runner records the artifact SHA-256 and byte size, browser versions,
actual artifact request count, compile/instantiate timings, 15 repeated exact
call samples and their median, memory pages,
isolation capabilities, raw request/result, and all failures. It never emits
`pass` unless every requested engine executes the exact candidate and returns
the expected result.

The checked-in vector exercises a nontrivial class group. It is a route
contract, not evidence that a candidate exists or passes. Extend its request
only by versioning the request schema; do not put relations, retry schedules,
or precomputed field preparation into the runtime input.

## Receipt contract

Receipts use `sagejs.rust-class-group-browser-route/v1` and are validated by
[`receipt.schema.json`](receipt.schema.json). A missing artifact produces a
receipt with `status: "fail"`, no engine observations, and a `preflight`
failure. A route is only W0 evidence when:

1. `status` is `pass`;
2. all three engine records pass;
3. every record selected `rust-class-group-wasm-artifact`;
4. `artifact_request_count` is positive;
5. the receipt artifact hash is the released candidate's hash; and
6. the mathematical result matches the independently frozen vector.

Run the harness contract tests without a candidate:

```bash
node --test bench/pari-class-group-rust/qualification/browser/browser-route.test.mjs
```
