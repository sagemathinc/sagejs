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
| R1 prepared cubics | In progress | Neutral arbitrary-precision cubic preparation validates rational bases, index primes, multiplication tables, discriminants, signatures, irreducibility evidence, and precision state. Exact GMP ideal lattices now carry row 6's denominator-three maximal order through a derived 1,130-ideal factor base and local valuations. The fast PARI-style relation route remains authenticated only for H1. |
| R2 relation/HNF loop | In progress | Exact relation witnesses are independently replayed; fixed-width Smith retries from an untouched checkpoint with GMP, and arbitrary-precision HNF/SNF returns exact transformation witnesses. General maximal-order small-norm plus deterministic continuation completes row 6's 1,130-dimensional relation rank with seven surplus rows, without answer-derived relations. Feeding the modular rank cache's four unresolved pivots back into random ideal selection reduces collection from 71.15 s and 1,526 rows to about 7.7 s and 1,137 rows. A new exact small-surplus algorithm replaces the 45.8-second full HNF/Smith in the completion path: it computes the square determinant, solves the seven surplus rows in rational coordinates, and obtains their exact subgroup order from a saturated nullity-seven congruence kernel; mod-2 rank distinguishes `C2 x C2` from `C4`. The complete certified prepared-field diagnostic is now 18.06 s. The separately retained staged provenance pass still provides order-relation coefficients; integrating maps/witnesses without duplicating reduction remains open. |
| R3 completion and maps | In progress | Verified Smith transforms produce exact maps on small supplied presentations. Row 6 has a compact map assigning all 1,130 factor-base generators coordinates in `C2 x C2`; all 1,137 relations map to zero, and exact order-two principal witnesses replay for both invariant coordinates. The saturated relation kernel yields seven exact compact units and a rank-two unit lattice. Direct 4,096-bit Arb evaluation rigorously encloses its regulator. A new exact maximal-order splitting stream and Belabas--Friedman/Arb computation enclose the positive integral product of the candidate class and unit indices with unique value one (conditional on GRH), proving both indices one. Thus the prepared row-6 class-and-unit result is mathematically complete in that proof mode. Honesty/factor-base extension policy, ergonomic generator ideals and maps, public result construction, unconditional proof mode, and broader-field qualification remain open. |
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
- `row6-candidate/`: bounded, answer-free maximal-order diagnostic on the
  required row-6 polynomial, retaining the earlier equation-order receipts as
  historical evidence.
- `browser/`: fail-closed class-group reactor ABI and actual-browser runner for
  the first real class-group Wasm artifact.

Each subdirectory documents its focused reproduction commands. Run the Rust
core tests from the repository root with:

```bash
cargo test --release --all-targets \
  --manifest-path bench/pari-class-group-rust/Cargo.toml
```
