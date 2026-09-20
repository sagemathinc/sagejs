# Rust class-group qualification evidence

This directory contains the executable contracts and receipts for the
[Rust class-group qualification campaign](../../../agents/rust-class-group-core-qualification-plan.md).
It is deliberately stricter than the historical Rust benchmark: a relation
matrix and its Smith factors are a candidate, not a completed public class
group.

## Current milestone state

| Milestone | State | Evidence and remaining work |
| --- | --- | --- |
| R0 contracts | Frozen for the campaign | The answer-free panel now contains 60 open and 60 held-out fields, exactly 12 per degree from 2 through 6. It was selected by the frozen deficit-greedy procedure from a private PARI 2.17.4 pool with 15 raw samples per candidate; all signature, timing, and trait quotas pass. Closed schemas, deterministic regeneration, content hashes, and 32 adversarial mutations protect the public panel and receipt. Private answers remain outside the repository. See `corpus/qualification-selection-receipt-v1.json`. |
| W0 exact-integer route | Passed on the development route | One Rust/GMP source pipeline gives an identical 3,300-byte result in native Rust, Node Wasm, Chromium, Firefox, WebKit, and an independent CPython oracle. See `wasm-arithmetic/receipt.json`. |
| W0 high-precision route | Passed on the development route | Direct Rust FFI to GMP/MPFR/MPC produces byte-identical directed enclosures in native Rust and all three actual browsers, with an independent high-precision oracle. See `wasm-enclosure/receipt.json`. |
| W0 release arithmetic choice | Passed for qualification; product host pending | The repaired repository toolchain (`37d8d819…66452c`) reproducibly rebuilds the exact-integer, high-precision enclosure, and first class-candidate artifacts. Their only extra imports are a documented empty-environment WASI shim; replacing or promoting that shim belongs to the product route. |
| W0 row-6 factor-base stage | Passed as a bounded development stage | The bounded-residue implementation constructs and HNF-canonicalizes all 1,130 maximal-order prime ideals with exact cross-target digests. Fifteen-sample medians improved from 216.7 to 111.6 ms native, 530.8 to 160.3 ms Chromium, 3,401 to 950 ms Firefox, and 419 to 163 ms WebKit. Memory ends at 33 pages. This is still a prepared factor-base stage, not a complete class group. See `wasm-prepared-factor-base/optimized-receipt.json`. |
| W0 row-6 relation prefix | Passed as a bounded development stage | The same optimization reduced the exact relation-prefix medians from 223.9 to 121.2 ms native, 526.4 to 201.2 ms Chromium, 3,724 to 1,297 ms Firefox, and 462 to 206 ms WebKit. The optimized route ends at 258 pages instead of the historical 3,357-page high-water. It remains deliberately bounded and does not establish full relation rank, completion, or public integration. See `wasm-prepared-relation-prefix/factor-pattern-optimized-receipt.json`. |
| W0 multifield prepared stages | Passed for bounded cubic stages, not full W0 | Exact factor-base and one-ideal/64-candidate relation-prefix results agree across native Rust, Chromium, Firefox, and WebKit for H1, an unseen index-3 real cubic, and a complex discriminant -23 cubic. The c4 artifact/source closure contains no production row-6 specialization. This evidence explicitly excludes a complete relation lattice, units, class group, public input, and the full W0/R5 gate. See `wasm-prepared-multifield/receipt.json`. |
| R1 prepared cubics | In progress | Neutral arbitrary-precision cubic preparation validates rational bases, index primes, multiplication tables, discriminants, signatures, irreducibility evidence, and precision state. The public Rust route now factors the cubic discriminant and exhausts every `p`-power superlattice through the exact discriminant-valuation bound, with a replayable transcript, exact preflighted resource counts, and no index-`p` fixed-point assumption. Both known direct-`p^2` counterexamples pass, and a pinned PARI 2.17.4 differential accepted 1,996 of 1,997 irreducible cubics from the frozen 2,000-input panel with zero wrong accepts and one explicit resource-limit refusal. This exhaustive route is a sound bounded qualification implementation; proof-carrying Round 2 remains the intended scalable implementation. The internal prepared-field representation accepts degrees 2 through 6, but hot arithmetic and all class-group algorithms remain cubic-only. Complete browser execution remains open. |
| R2 relation/HNF loop | In progress | Exact relation witnesses are independently replayed; fixed-width Smith retries from an untouched checkpoint with GMP, and arbitrary-precision HNF/SNF returns exact transformation witnesses. General maximal-order small-norm plus deterministic continuation completes row 6's 1,130-dimensional relation rank with seven surplus rows, without answer-derived relations. Feeding the modular rank cache's four unresolved pivots back into random ideal selection reduced collection from 71.15 s and 1,526 rows to 1,137 rows. Exact norm-capped valuations now avoid constructing one unnecessary ideal power per smooth candidate, reducing prime-valuation/cache time from 5.42 s to 0.52 s and complete collection to about 2.76--2.99 s. A small-surplus algorithm replaces the 45.8-second full HNF/Smith: one fraction-free LU supplies both the square determinant and seven rational coordinates. Successive congruence intersections remain seven-dimensional, taking about 0.004 s instead of building a 1,137-dimensional nullspace, and their saturated basis is reused as the exact unit kernel. A packed GF(2) kernel supplies the exact class map without a word-per-entry generic matrix. Mod-2 rank distinguishes `C2 x C2` from `C4`. Phase-lifetime storage now retains that exact fraction-free factorization through class-order and generator-witness construction, eliminating the duplicate 1,130-square reduction. The producer now exports the exact square determinant `D`, the seven dependency rows, and their projected determinant `K`; an independent compact verifier proves that the dependency lattice is primitive from four exact 7-by-7 minors with gcd one and checks `D/K = 4`. The complete exact-witness row-6 diagnostic takes about 8.14 s versus pristine PARI 2.17.4's 4.06 s; the retained generator-witness phase itself is about 0.31 s instead of about 3.80 s. General continuation, broader degrees, and public completion remain open. |
| R3 completion and maps | In progress | The fast row-6 completion obtains an exact compact map from the two-dimensional mod-2 character space. A generic HNF-plus-Smith fallback completes odd cyclic presentations. The authenticated map boundary now seals the exact factor base, presentation, maximal-order evidence state, and every replayed principal relation before issuing presentation-bound coordinates; production contexts reject external coordinate tables. The genuine qualification-only row-6 authority replays all 1,137 principal identities over the ordered 1,130-ideal catalog and yields the real `C2 x C2` map. Bounded arbitrary cubic ideals reduce with an independently replayed `(alpha) = I * product(P_j^e_j)` certificate and fail closed on resource exhaustion or oversized compressed exponents. The code-bound row-6 completion receipt additionally reconstructs all 1,137 principal ideals from integral-basis multiplication, independently rebuilds all 7,136 factor terms in canonical exact ideal arithmetic, verifies compact units, the 4,096-bit Arb regulator enclosure, and GRH-conditional class/unit index one, while rejecting 15 counterfeit classes. The retained row-6 maximality premise remains explicitly upstream-assumed. Public result construction, broader complex cases, honesty/factor-base extension policy, unconditional proof mode, and broad qualification remain open. See `arbitrary-ideal-reduction/` and `unit-completeness-replay/results/row6-replay-receipt.json`. |
| R4 public polynomial input | In progress | The public imaginary-quadratic Rust boundary computes general reduced-form class groups, generators, maps, and coordinates; exhaustive comparison covers all 3,043 negative fundamental discriminants through absolute discriminant 10,000, with another 314 deterministic/random cases through 9,999,991. Public form validation fails closed at signed-64-bit extremes. Public cubics now have sound bounded polynomial-to-maximal-order preparation with complete local superlattice exhaustion and replay, replacing the rejected index-`p` implementation. The prepared-field representation is degree-generic, but exact field operations, ideals, prime decomposition, numerical preparation, relation collection, and completion remain cubic-specific. Degrees 4 through 6, unconditional completion, and public Sage.js result construction remain open. |
| R5 product qualification | In progress; one native performance tail and broader product gates remain | The small Wasm candidate has generation-tagged resumable contexts with close/reset/cancel and transactional publication. Chromium, Firefox, and WebKit each completed 1,000 exact calls and 100 mixed lifecycle jobs at a stable 18 pages, with observed between-step cancellation maxima of 4.2, 5, and 8 ms. This does not yet make row-6 HNF/unit/certification resumable. A clean frozen-source imaginary-quadratic campaign at `809bc1cdb` records exact alternating Rust/PARI samples, reproducible twin binaries, and batch throughput. Six of seven fields pass the frozen tiny-field rule; the three formerly dominant cases now run in 4.68, 3.64, and 6.53 ms at 1.21x, 1.70x, and 3.13x PARI. The largest class-number case still fails the tiny rule, and no PARI 5--100 ms field exists in this panel, so the native aggregate gate remains unestablished. Full public-call performance, packaging, all platforms, and complete browser computation remain open. See `public-quadratic-boundary/benchmark/receipt.json`. |

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
- `wasm-prepared-relation-prefix/`: a resource-bounded real row-6 relation
  collection prefix in native Rust and all three browsers.
- `wasm-prepared-multifield/`: source-frozen native and three-browser evidence
  for bounded prepared stages on three distinct cubic fields.
- `public-quadratic-boundary/`: the general imaginary-quadratic public boundary,
  PARI differential evidence, and clean native performance campaign.
- `lifecycle/`: resumable small-candidate context, cancellation, repeated-call,
  stale-handle, and actual-browser memory evidence.
- `pari-control/`: authenticated PARI 2.17.4 control with distinct algorithm,
  prepared-field, and public-call timing boundaries.
- `candidate/`: independent compact-presentation certificate verifier for the
  complete row-6 relation lattice, class map, generator lifts, dependencies,
  and exact lattice index.
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
