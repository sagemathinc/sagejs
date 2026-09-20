# R5 lifecycle and cancellation qualification

This directory tests the fixed-width Wasm presentation candidate's resumable
context ABI. It is deliberately bounded small-candidate evidence, not a
production or full class-group claim.

The executable receipt establishes the following bounded facts:

- 1,000 repeated calls return the identical exact JSON result and linear memory
  stabilizes after warmup;
- invalid UTF-8, malformed JSON, missing, duplicate, wrong, unknown, and
  oracle-bearing fields, numeric coefficient counterfeits, invalid polynomial
  shape, a null range, and an oversized allocation fail without a Wasm trap,
  and a valid call still succeeds afterward; and
- generation-tagged guest handles reject stale step/cancel/result/reset/close,
  failed reset leaves the original context live, and successful reset advances
  the generation;
- browser contexts have explicit close and candidate-wide close with a live
  context in all three measured engines;
- result publication fails closed before completion and after cancellation;
- four independent workers return identical results;
- terminating a worker after computation begins publishes no partial result.

An earlier audit discovered that the candidate extracted `polynomial` without
validating the surrounding request. The candidate now deserializes one closed,
three-field request shape and verifies the exact schema and proof-mode values.
Rust and JavaScript counterfeits cover unknown/oracle-bearing properties,
missing and duplicate fields, the wrong schema or proof value, and coefficients
with the wrong JSON representation. The input-validation gate is now green.

The context ABI is `create_json`, `step`, `cancel`, `result_json`, `reset_json`,
and `close`. Relation enumeration is a bounded state machine, while the legacy
`run_json` entry point drives that same state machine synchronously. The browser
host yields to the event loop between steps. `browser-context-receipt.json`
records 1,000 repeated calls and 100 mixed complete/reset/cancel jobs in each of
Chromium, Firefox, and WebKit. Cancellation latency stayed at or below 8 ms in that
run and all engines remained at 18 Wasm pages throughout those 100 mixed jobs.
The receipt records memory after every mixed job and binds the exact Wasm artifact, Rust source inputs, browser
host inputs, candidate receipt, and lifecycle receipt by byte count and SHA-256.

`FinalizationRegistry` was available in every measured browser and the bound
loader source registers contexts with it. The campaign does not claim to have
observed a finalizer callback: finalization is nondeterministic and there is no
deterministic hook. Explicit context/candidate close is authoritative.

The separate hard-worker-termination result remains a last-resort isolation
check. Raw double-free is still undefined behavior and is intentionally not
invoked; lifecycle callers use generation-tagged contexts instead.

Run the bounded qualification and its closed-schema tests with:

```bash
node bench/pari-class-group-rust/qualification/lifecycle/run.mjs
node bench/pari-class-group-rust/qualification/lifecycle/run-browser-context.mjs
node --test bench/pari-class-group-rust/qualification/lifecycle/lifecycle.test.mjs
```

This evidence covers only the small candidate artifact named in the receipt. It
does not qualify row 6, full class/unit computation, native packaging, or
production publication. Cancellation is cooperative only between completed
`step` calls after control returns to the host event loop. Context creation and
input preparation, each individual point's norm/factorization/valuation work,
and the candidate's final Smith reduction are synchronous and noninterruptible.
Row-6 HNF, unit reconstruction, and certification have not been converted into
bounded steps.

The plan also calls for 100 mixed medium calls, precision and arithmetic-capacity
failures, medium concurrent jobs, and native leak sanitizers. No frozen complete
medium artifact exposes those contracts yet. The receipt lists every one as
missing rather than inferring them from the small candidate.
