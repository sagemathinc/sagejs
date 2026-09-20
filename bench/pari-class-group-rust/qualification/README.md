# Rust class-group qualification evidence

This directory contains the executable contracts and receipts for the
[Rust class-group qualification campaign](../../../agents/rust-class-group-core-qualification-plan.md).
It is deliberately stricter than the historical Rust benchmark: a relation
matrix and its Smith factors are a candidate, not a completed public class
group.

## Current milestone state

| Milestone | State | Evidence and remaining work |
| --- | --- | --- |
| R0 contracts | In progress | Schemas, public-contract map, benchmark harness, independent relation verifier, and the deterministic 120-slot corpus layout exist. Only nine open cubic cases are populated; the balanced 60 open plus 60 held-out corpus is not complete. |
| W0 exact-integer route | Passed on the development route | One Rust/GMP source pipeline gives an identical 3,300-byte result in native Rust, Node Wasm, Chromium, Firefox, WebKit, and an independent CPython oracle. See `wasm-arithmetic/receipt.json`. |
| W0 high-precision route | Passed on the development route | Direct Rust FFI to GMP/MPFR/MPC produces byte-identical directed enclosures in native Rust and all three actual browsers, with an independent high-precision oracle. See `wasm-enclosure/receipt.json`. |
| W0 release arithmetic choice | Passed for qualification; product host pending | The repaired repository toolchain (`37d8d819…66452c`) reproducibly rebuilds the exact-integer, high-precision enclosure, and first class-candidate artifacts. Their only extra imports are a documented empty-environment WASI shim; replacing or promoting that shim belongs to the product route. |
| R1 prepared cubics | In progress | Neutral arbitrary-precision cubic preparation now validates rational bases, index primes, multiplication tables, discriminants, signatures, irreducibility evidence, and precision state. The fast PARI-style relation route is still authenticated only for H1. |
| R2 relation/HNF loop | In progress | Exact relation witnesses are independently replayed; fixed-width Smith retries from an untouched checkpoint with GMP, and arbitrary-precision HNF/SNF returns exact transformation witnesses. A bounded row-6 diagnostic now isolates the unfinished general collector rather than claiming a result. |
| R3 completion and maps | In progress | Verified Smith transforms now produce exact maps for the supplied relation presentation and reconstruct relation-combination witnesses. Units, principal elements, regulator/completion proof, saturation, generator ideals, and proof that the presentation is the full class group remain unimplemented. |
| R4 public polynomial input | Open | No Rust maximal-order/general preparation path or public Sage.js adapter exists. |
| R5 product qualification | Open | Packaging, lifecycle, cancellation, all platforms, the full corpus, and matched public PARI timings remain future gates. |

No file in this directory authorizes production dispatch. Candidate and
upstream-assumed outputs must remain visibly distinct from publicly complete
results.

## Layout

- `schemas/`: closed JSON contracts for neutral inputs, evidence, benchmarks,
  corpora, and capability status.
- `corpus/`: deterministic selection rules, 120-slot layout, and initial open
  development cases.
- `verify/`: independent PARI-backed replay of emitted ideals and relation
  witnesses. PARI is a test oracle and is not linked into the Rust product.
- `benchmark/`: alternating, raw-sample benchmark runner with explicit timing
  boundaries and exact result fingerprints.
- `wasm-arithmetic/`: direct linkage to Sage.js's pinned GMP Wasm build and
  cross-runtime arithmetic receipt.
- `wasm-enclosure/`: directed MPFR real/complex enclosures and MPC consistency
  checks across native and browser routes.
- `wasm-class-group-candidate/`: first answer-free polynomial-to-presentation
  candidate in all three browsers; it is not a completed public class group.
- `pari-control/`: authenticated PARI 2.17.4 control with distinct algorithm,
  prepared-field, and public-call timing boundaries.
- `row6-candidate/`: bounded, answer-free diagnostic of the current provisional
  equation-order collector on the required row-6 polynomial.
- `browser/`: fail-closed class-group reactor ABI and actual-browser runner for
  the first real class-group Wasm artifact.

Each subdirectory documents its focused reproduction commands. Run the Rust
core tests from the repository root with:

```bash
cargo test --release --all-targets \
  --manifest-path bench/pari-class-group-rust/Cargo.toml
```
