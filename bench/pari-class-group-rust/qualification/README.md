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
| R1 prepared cubics | In progress | Neutral arbitrary-precision cubic preparation validates rational bases, index primes, multiplication tables, discriminants, signatures, irreducibility evidence, and precision state. The answer-free JSON ingress replays those facts before construction. One external prepared-field engine now completes all nine initial open cubic cases, covering trivial, `C2`, `C3`, `C2 x C2`, and `C6` groups, signatures `(3,0)` and `(1,1)`, and basis denominators one and three without field-specific runtime answers. The replay also exposed four incorrect signature labels in the frozen development panel; an explicit correction overlay preserves that discovery. Browser execution of this full path remains open. |
| R2 relation/HNF loop | In progress | Exact relation witnesses are independently replayed; fixed-width Smith retries from an untouched checkpoint with GMP, and arbitrary-precision HNF/SNF returns exact transformation witnesses. General maximal-order small-norm plus deterministic continuation completes row 6's 1,130-dimensional relation rank with seven surplus rows, without answer-derived relations. Feeding the modular rank cache's four unresolved pivots back into random ideal selection reduced collection from 71.15 s and 1,526 rows to 1,137 rows. Exact norm-capped valuations now avoid constructing one unnecessary ideal power per smooth candidate, reducing prime-valuation/cache time from 5.42 s to 0.52 s and complete collection to about 2.76 s. A small-surplus algorithm replaces the 45.8-second full HNF/Smith: one fraction-free LU supplies both the square determinant and seven rational coordinates. Successive congruence intersections remain seven-dimensional, taking about 0.004 s instead of building a 1,137-dimensional nullspace, and their saturated basis is reused as the exact unit kernel. A packed GF(2) kernel supplies the exact class map without a word-per-entry generic matrix. Mod-2 rank distinguishes `C2 x C2` from `C4`. The complete certified prepared-field diagnostic has a 7.6025 s three-run median, 1.9561x pristine PARI. The separately retained staged provenance pass still provides order-relation coefficients; integrating witnesses without duplicating reduction remains open. |
| R3 completion and maps | In progress | The fast row-6 completion obtains an exact compact map from the two-dimensional mod-2 character space. A generic HNF-plus-Smith fallback completes the odd cyclic `C3` row-1 map as well; every relation maps to zero and a concrete prime-ideal generator is retained. Rust emits exact factored principal relations for selected generator orders, including the prime-ideal factorization of every source relation. Sage.js independently reconstructs both `(p, alpha)` and HNF descriptions and proves every principal-ideal identity for all nontrivial open cases through row 1 (`C2`, `C3`, `C2 x C2`, `C6`, and the denominator-three cubic). Row 6 now uses an exact eight-dimensional affine congruence solve rather than a 1,137-square HNF provenance transform: both order-two generator witnesses are present, the complete answer-free run is about 11.6 seconds versus PARI 2.17.4's 4.1 seconds, and one remaining duplicated determinant solve accounts for about 3.4 seconds. Exact compact units, signature-dependent rank-one/rank-two reconstruction, 4,096-bit Arb regulator evaluation, and Belabas--Friedman/Arb class/unit index one complete the totally-real fixtures and the first complex cubic under the stated GRH hypotheses. See `row6-candidate/README.md`. Public result construction, arbitrary ideal maps, broader complex cases, honesty/factor-base extension policy, unconditional proof mode, and broad qualification remain open. |
| R4 public polynomial input | In progress | `prepare_cubic_for_rust` now converts a public Sage.js cubic field into a certified, answer-free neutral input. It certifies the maximal order, normalizes its basis exactly and unimodularly so `1` is first, exports the transformed multiplication table, discriminant, signature, index support and irreducibility witness, and hashes the canonical authority payload. `verify_rust_class_generator_orders` is the independent Sage.js result-side boundary for generator-order evidence; it never trusts Rust's coordinate replay. Fresh documents for all nine initial open cubics replay through the Rust engine to complete GRH-conditional class-and-unit candidates. Every nontrivial case, now including row 6, has independently verified generator-order ideals and principal relations; the normalized certificate stores factor-base and prime-power lattices once instead of repeating them for every source factor. See `row6-candidate/results/sagejs-open-cubic-public-boundary-replay.json` and its executable harness. A public Rust result adapter, Rust-owned/general degree preparation, unconditional mode and the complete corpus remain open. |
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
