# Experimental P3 callback-capable cminpack backend

This directory is a bounded feasibility prototype, not a public Sage.js
package and not a production capability claim. It answers one architectural
question: can a mature iterative solver retain control in a universal Wasm
reactor while safely evaluating arbitrary synchronous host callbacks?

The prototype exposes cminpack's exact `lmdif` and `lmder` identities. It has:

- one packed callback crossing for a residual vector or complete Jacobian;
- opaque callback handles and module-wide non-reentrancy;
- exception transport through negative C statuses so C allocations are freed
  before JavaScript rethrows;
- cancellation, evaluation, and elapsed-time checks at callback boundaries;
- finite callback-output and linear-memory range checks;
- bounded dimensions and a 64 MiB solver-workspace ceiling; and
- one content-locked cminpack source archive compiled with
  `-ffp-contract=off`.

It intentionally does **not** provide a public optimization API, claim that a
cminpack termination code is mathematical validation, run asynchronous
callbacks, or make a browser-main-thread callback interruptible while no
callback is in progress. Production integration belongs in a dedicated
numerical Wasm package and must add full MINPACK cross-checks, MGH oracles,
sanitizers/fuzzing, authenticated receipts, capability registration, and the
ordinary-Python dynamic fallback.

Build and run the focused tests from the repository root:

```sh
node packages/flint-wasm/experimental/numerical-p3-backends/build.cjs
node --test test/numerical-p3-backends/lm-wasm.test.mjs
node test/numerical-p3-backends/browser-lm.mjs
```
