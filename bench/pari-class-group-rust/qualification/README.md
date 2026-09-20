# Rust class-group qualification evidence

This directory contains the executable contracts and receipts for the
[Rust class-group qualification campaign](../../../agents/rust-class-group-core-qualification-plan.md).
It is deliberately stricter than the historical Rust benchmark: a relation
matrix and its Smith factors are a candidate, not a completed public class
group.

## Current milestone state

| Milestone | State | Evidence and remaining work |
| --- | --- | --- |
| R0 contracts | In progress | Schemas, public-contract map, benchmark harness, independent relation verifier, and a provisional answer-free 60-open/60-held-out panel exist. The provisional panel has 12 inputs per degree from 2 through 6 and independent irreducibility evidence for all 360 candidates, but private PARI screening has not yet established the required signature, timing, and trait quotas; it therefore does not replace the frozen unselected qualification layout. |
| W0 exact-integer route | Passed on the development route | One Rust/GMP source pipeline gives an identical 3,300-byte result in native Rust, Node Wasm, Chromium, Firefox, WebKit, and an independent CPython oracle. See `wasm-arithmetic/receipt.json`. |
| W0 high-precision route | Passed on the development route | Direct Rust FFI to GMP/MPFR/MPC produces byte-identical directed enclosures in native Rust and all three actual browsers, with an independent high-precision oracle. See `wasm-enclosure/receipt.json`. |
| W0 release arithmetic choice | Passed for qualification; product host pending | The repaired repository toolchain (`37d8d819…66452c`) reproducibly rebuilds the exact-integer, high-precision enclosure, and first class-candidate artifacts. Their only extra imports are a documented empty-environment WASI shim; replacing or promoting that shim belongs to the product route. |
| W0 row-6 factor-base stage | Passed as a bounded development stage | A 484,212-byte Wasm artifact replay-validates the real answer-free row-6 prepared field, handles the index prime, constructs and HNF-canonicalizes all 1,130 maximal-order prime ideals, and returns one exact descriptor in native Rust and 15 repeated calls in Chromium, Firefox, and WebKit. Quiet medians are 216.7 ms native, 530.8 ms Chromium, 3,401 ms Firefox, and 419 ms WebKit; memory stabilizes at 33 pages. This does not include relation collection, completion, or public integration, and Firefox's 15.69x ratio is an explicit risk. |
| R1 prepared cubics | In progress | Neutral arbitrary-precision cubic preparation validates rational bases, index primes, multiplication tables, discriminants, signatures, irreducibility evidence, and precision state. The internal prepared-field validator now accepts degrees 2 through 6 and checks arbitrary-precision coefficients, Bareiss discriminants, Rabin irreducibility, Sturm signatures, represented-order basis index/containment, index-prime completeness, multiplication tables, and precision bookkeeping; it does not itself prove order maximality or rigorous embeddings. Hot arithmetic and all class-group algorithms remain cubic-only. The answer-free cubic JSON ingress replays the same facts before construction. One external prepared-field engine completes all nine initial open cubic cases without field-specific runtime answers. Browser execution of the full path remains open. |
| R2 relation/HNF loop | In progress | Exact relation witnesses are independently replayed; fixed-width Smith retries from an untouched checkpoint with GMP, and arbitrary-precision HNF/SNF returns exact transformation witnesses. General maximal-order small-norm plus deterministic continuation completes row 6's 1,130-dimensional relation rank with seven surplus rows, without answer-derived relations. Feeding the modular rank cache's four unresolved pivots back into random ideal selection reduced collection from 71.15 s and 1,526 rows to 1,137 rows. Exact norm-capped valuations now avoid constructing one unnecessary ideal power per smooth candidate, reducing prime-valuation/cache time from 5.42 s to 0.52 s and complete collection to about 2.76--2.99 s. A small-surplus algorithm replaces the 45.8-second full HNF/Smith: one fraction-free LU supplies both the square determinant and seven rational coordinates. Successive congruence intersections remain seven-dimensional, taking about 0.004 s instead of building a 1,137-dimensional nullspace, and their saturated basis is reused as the exact unit kernel. A packed GF(2) kernel supplies the exact class map without a word-per-entry generic matrix. Mod-2 rank distinguishes `C2 x C2` from `C4`. Phase-lifetime storage now retains that exact fraction-free factorization through class-order and generator-witness construction, eliminating the duplicate 1,130-square reduction. The complete exact-witness row-6 diagnostic takes about 8.14 s versus pristine PARI 2.17.4's 4.06 s; the retained generator-witness phase itself is about 0.31 s instead of about 3.80 s. General continuation, broader degrees, and public completion remain open. |
| R3 completion and maps | In progress | The fast row-6 completion obtains an exact compact map from the two-dimensional mod-2 character space. A generic HNF-plus-Smith fallback completes the odd cyclic `C3` row-1 map as well; every relation maps to zero and a concrete prime-ideal generator is retained. Rust emits exact factored principal relations for selected generator orders, including the prime-ideal factorization of every source relation. Sage.js independently reconstructs both `(p, alpha)` and HNF descriptions and proves every principal-ideal identity for all nontrivial open cases through row 1 (`C2`, `C3`, `C2 x C2`, `C6`, and the denominator-three cubic). Row 6 uses an exact eight-dimensional affine congruence solve rather than a 1,137-square HNF provenance transform. The target solve retains and reuses the class-order phase's fraction-free factorization, so both order-two generator witnesses are present in an 8.14-second answer-free run versus PARI 2.17.4's 4.06 seconds. Exact compact units, signature-dependent rank-one/rank-two reconstruction, 4,096-bit Arb regulator evaluation, and Belabas--Friedman/Arb class/unit index one complete the totally-real fixtures and the first complex cubic under the stated GRH hypotheses. See `row6-candidate/README.md`. Public result construction, arbitrary ideal maps, broader complex cases, honesty/factor-base extension policy, unconditional proof mode, and broad qualification remain open. |
| R4 public polynomial input | In progress | `prepare_cubic_for_rust` converts a public Sage.js cubic field into a certified, answer-free neutral input, including exact normalized integral-basis data. `verify_rust_class_generator_orders` independently replays generator-order evidence without trusting Rust coordinates. A new fail-closed adapter binds retained Rust candidates to a freshly prepared live field and the independent replay, but deliberately returns only `ClassUnitComputation(complete=False)` with six explicit evidence gaps; it cannot construct a public class or unit group. Rust-owned/general-degree preparation, arbitrary ideal maps, accepted class/unit completion evidence, unconditional mode, and the full corpus remain open. |
| R5 product qualification | Open | A quiet 90-sample prepared-field campaign has exact class-number/invariant fingerprints and no failures. Rust/PARI 2.17.4 medians are 249.94/8.98 ms (H1, 27.83x), 229.43/6.49 ms (index-3 row 1, 35.37x), and 7.933/3.925 s (row 6, 2.021x). This is conditional-GRH prepared-field evidence, not a public-call or fully cross-compared unit/map result. The tiny-field fixed-cost floor and row-6 determinant dominate their respective gaps. Packaging, lifecycle, cancellation, all platforms, full browser computation, the final corpus, and matched public-call timings remain open. |

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
- `wasm-prepared-factor-base/`: the real row-6 prepared maximal-order
  factor-base and ideal-HNF stage in native Rust and all three browsers.
- `pari-control/`: authenticated PARI 2.17.4 control with distinct algorithm,
  prepared-field, and public-call timing boundaries.
- `row6-candidate/`: bounded, answer-free maximal-order diagnostic on the
  required row-6 polynomial, retaining the earlier equation-order receipts as
  historical evidence.
- `browser/`: fail-closed class-group reactor ABI and actual-browser runner for
  the first real class-group Wasm artifact.
- `public-adapter/`: focused fail-closed tests for adapting an untrusted Rust
  candidate into the existing incomplete Sage.js result contract.

Each subdirectory documents its focused reproduction commands. Run the Rust
core tests from the repository root with:

```bash
cargo test --release --all-targets \
  --manifest-path bench/pari-class-group-rust/Cargo.toml
```
