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
| R2 relation/HNF loop | In progress | Exact relation witnesses are independently replayed on detached input; the live collector instead seals its already-proved field, factor base, relation rows, and principal generators, then the consumer rehashes and compares that complete transcript. General maximal-order small-norm plus deterministic continuation completes row 6's 1,130-dimensional rank with seven surplus rows and no answer-derived relations. A retained FLINT fraction-free factorization supplies the exact 306-bit square determinant and seven rational coordinates; seven-dimensional congruence intersections, a saturated dependency proof, and a packed GF(2) kernel replace the former dense HNF/Smith. The verifier checks every dependency, four exact 7-by-7 minors with gcd one, `D/K = 4`, the complete mod-2 map, and generator-order witnesses. Removing a duplicate scalar-GMP determinant and an accidental whole-matrix digest inside every generator-coordinate check reduced the coefficient-only row-6 path from about 120 s, then 86 s, to about 6.3--6.8 s on the development host. General continuation and broader degrees remain open. |
| R3 completion and maps | In progress | The typed public phase now integrates the row-6 small-surplus representation. It authenticates Rust-proved maximal-order and exact index-prime evidence, collector-sealed principal relations, a presentation-bound compact coordinate table, saturated dependencies, and order-two generator witnesses. Completion reuses that exact dependency basis, reconstructs rank-one or rank-two compact units with dual-precision stability, replays annihilation exactly, encloses the regulator with directed FLINT/Arb arithmetic (refining the Arb enclosure on an MPFR containment miss), and proves GRH-conditional class/unit index one plus BDF factor-base generation before constructing a sealed complete type. A generic HNF-plus-Smith path remains for modest and odd-order presentations. Both cubic signatures and groups `1`, `C2`, `C3`, `C2 x C2`, and `C6` succeed; the coefficient-only index-3 row-6 field now reaches the same sealed result and retained arbitrary-ideal map without an upstream maximality premise. Unconditional mode and unsupported large non-elementary-2 presentations remain explicit limitations. See `arbitrary-ideal-reduction/`, `public-cubic-e2e/`, and `unit-completeness-replay/results/row6-replay-receipt.json`. |
| R4 public polynomial input | In progress | The public imaginary-quadratic Rust boundary computes general reduced-form class groups, generators, maps, and coordinates; exhaustive comparison covers all 3,043 negative fundamental discriminants through absolute discriminant 10,000, with another 314 deterministic/random cases through 9,999,991. Public cubics have bounded polynomial-to-maximal-order preparation with complete local superlattice exhaustion, exact index-prime splitting, and replay. The coefficient-only executable reaches sealed GRH-conditional results for both signatures and groups `1`, `C2`, `C3`, `C2 x C2`, and `C6`; row 6 now enters only through its four coefficients and finishes with 1,137 authenticated relations, compact units, analytic certificates, and the retained class map. All 12 frozen open degree-three inputs, including equation-order indices 1, 2, 3, and 4, reach sealed results in fresh processes with a clean source closure. No prepared fixture, PARI value, relation transcript, or expected answer enters those calls. A separate restricted verifier opened the hash-bound private evidence only after Rust exited and independently matched all 108 available exact checks across those 12 cases without disclosing answer values. No held-out input was executed. The prepared representation is degree-generic, but hot field arithmetic and the class-group engine remain cubic-specific. Degrees 4 through 6, unconditional completion, the held-out corpus, and the production Sage.js adapter remain open. See `public-cubic-open-corpus/receipt.json` and `public-cubic-open-oracle/receipt.json`. |
| R5 product qualification | In progress; native row 6 and the quadratic tiny-field gate pass, while tiny cubic latency and broader product gates remain | The clean frozen cubic campaign at `1f4237449` records 15 exact alternating pairs per arm and field on logical CPU 0, a clean source closure, and byte-identical independent release builds. Row 6 completes from four public coefficients in 5.826 s versus PARI 2.17.4's 3.960 s, or 1.471x, passing the predeclared 2x native row-6 criterion. Its Rust stage medians are 58.2 ms preparation, 2.722 s collection, 2.081 s candidate authentication, and 966.8 ms completion. The two tiny cubics improved to 11.39 ms and 17.65 ms but remain failures at 5.50x and 7.00x PARI; relation collection plus generic unit/analytic completion now dominate. The two independently built unstripped release executables are byte-identical at 21,633,112 bytes. Separately, the clean imaginary-quadratic campaign passes its frozen tiny-field rule, with the three largest cases at 0.91x, 0.92x, and 1.66x PARI. The small Wasm candidate has correct three-browser lifecycle evidence, but complete row-6 Wasm execution, production packaging/adapters, platform qualification, and the broad degree/corpus gates remain open. See `public-cubic-e2e/benchmark/receipt.json` and `public-quadratic-boundary/benchmark/receipt.json`. |

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
- `public-cubic-e2e/`: the coefficient-only sealed cubic completion boundary,
  its open-panel regressions, and an alternating exact PARI benchmark harness.
- `public-cubic-open-corpus/`: the Rust-only runner and receipt for all 12
  frozen open degree-three inputs.
- `public-cubic-open-oracle/`: the restricted, hash-bound independent
  comparison of the open-cubic receipt against private qualification evidence.
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
