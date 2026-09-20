# R5 lifecycle and cancellation qualification

This directory tests the existing 218,491-byte fixed-width Wasm presentation
candidate without changing its mathematical implementation.  It is deliberately
a **failed product gate**, not a production claim.

The executable receipt establishes the following bounded facts:

- 1,000 repeated calls return the identical exact JSON result and linear memory
  stabilizes after warmup;
- invalid UTF-8, malformed JSON, missing, duplicate, wrong, unknown, and
  oracle-bearing fields, numeric coefficient counterfeits, invalid polynomial
  shape, a null range, and an oversized allocation fail without a Wasm trap,
  and a valid call still succeeds afterward; and
- the qualification host's `close` operation is idempotent and stale use is
  rejected before entering Wasm; and
- four independent workers return identical results; and
- terminating a worker after computation begins publishes no partial result.

An earlier audit discovered that the candidate extracted `polynomial` without
validating the surrounding request. The candidate now deserializes one closed,
three-field request shape and verifies the exact schema and proof-mode values.
Rust and JavaScript counterfeits cover unknown/oracle-bearing properties,
missing and duplicate fields, the wrong schema or proof value, and coefficients
with the wrong JSON representation. The input-validation gate is now green.

The termination property is only hard host termination.  The current ABI is
`alloc/run_json/dealloc`, and `run_json` is one synchronous monolithic call.
There is no resumable context, bounded step, cancellation flag, progress
operation, or generation-tagged handle.  Consequently cooperative cancellation,
stale guest-handle rejection, and double-drop rejection are not testable and the
receipt must remain red.  Raw double-free is undefined behavior in the current
ABI and is intentionally not invoked merely to manufacture a lifecycle test.

The required replacement ABI is recorded verbatim in `receipt.json`: create a
generation-tagged context, perform bounded steps, request cancellation, publish
only a completed result, and drop contexts idempotently with explicit stale
handle errors.  Long relation collection, HNF, unit, and certification loops
must check cancellation at documented bounded intervals.

Run the bounded qualification and its closed-schema tests with:

```bash
node bench/pari-class-group-rust/qualification/lifecycle/run.mjs
node --test bench/pari-class-group-rust/qualification/lifecycle/lifecycle.test.mjs
```

This evidence covers only the small candidate artifact named in the receipt. It
does not qualify row 6, full class/unit computation, browser process lifecycle,
native packaging, or production publication.

The plan also calls for 100 mixed medium calls, precision and arithmetic-capacity
failures, medium concurrent jobs, native leak sanitizers, and lifecycle checks in the
actual browsers. No frozen complete medium artifact exposes those contracts yet.
The receipt lists every one as missing rather than inferring them from the small
candidate.
