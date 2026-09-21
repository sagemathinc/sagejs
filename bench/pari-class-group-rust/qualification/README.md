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
| R2 relation/HNF loop | In progress | Exact relation witnesses are independently replayed on detached input; the live collector instead seals its already-proved field, factor base, relation rows, and principal generators, then the consumer rehashes and compares that complete transcript. General maximal-order small-norm plus deterministic continuation completes row 6's 1,130-dimensional rank with seven surplus rows and no answer-derived relations. A retained FLINT fraction-free factorization supplies the exact 306-bit square determinant and seven rational coordinates; seven-dimensional congruence intersections, a saturated dependency proof, and a packed GF(2) kernel replace the former dense HNF/Smith. The verifier checks every dependency, four exact 7-by-7 minors with gcd one, `D/K = 4`, the complete mod-2 map, and generator-order witnesses. The collector now retains its relation cache, enumeration cursor, random state, factor-attempt count, generators, and cumulative resource counters across an answer-free supplementary-relation schedule; staged 7-to-8-to-9 collection is byte- and counter-identical to a direct target of 9. Removing a duplicate scalar-GMP determinant and an accidental whole-matrix digest inside every generator-coordinate check reduced the coefficient-only row-6 path from about 120 s, then 86 s, to about 6.3--6.8 s on the development host. Broader degrees remain open. |
| R3 completion and maps | In progress | The typed public phase now integrates the row-6 small-surplus representation. It authenticates Rust-proved maximal-order and exact index-prime evidence, collector-sealed principal relations, a presentation-bound compact coordinate table, saturated dependencies, and generator-order witnesses. The compact route now handles mixed invariant factors with a full modular map and canonical preimages; Rust independently verifies relation annihilation, divisibility, joint right inverses, order witnesses, storage bounds, and exact-work bounds, while retaining the elementary-2 fast path. Completion reuses the authenticated dependency lattice, applies an exactly certified row-HNF basis only after unstable reconstruction, compares the reconstructed unit sublattice canonically across requested precisions, replays annihilation exactly, encloses the regulator with directed FLINT/Arb arithmetic, and proves GRH-conditional class/unit index one plus BDF factor-base generation before constructing a sealed complete type. The opened d3-0019 precision case now seals at its original frozen 4096/2048 request rather than silently escalating. Failed analytic isolation retains the final exact enclosure as a redacted internal diagnostic without promoting it to completion authority. Both cubic signatures and groups `1`, `C2`, `C3`, `C2 x C2`, and `C6` succeed; the coefficient-only index-3 row-6 field reaches the same sealed result and retained arbitrary-ideal map without an upstream maximality premise. Unconditional mode and presentations beyond the explicit compact resource limits remain limitations. See `arbitrary-ideal-reduction/`, `public-cubic-e2e/`, and `unit-completeness-replay/results/row6-replay-receipt.json`. |
| R4 public polynomial input | In progress; held-out cubic remediation is implemented but not yet credited | The public imaginary-quadratic Rust boundary computes general reduced-form class groups, generators, maps, and coordinates; exhaustive comparison covers all 3,043 negative fundamental discriminants through absolute discriminant 10,000, with another 314 deterministic/random cases through 9,999,991. Public cubics have bounded polynomial-to-maximal-order preparation with complete local superlattice exhaustion, exact index-prime splitting, and replay. The coefficient-only executable reaches sealed GRH-conditional results for both signatures and groups `1`, `C2`, `C3`, `C2 x C2`, and `C6`; row 6 now enters only through its four coefficients and finishes with 1,137 authenticated relations, compact units, analytic certificates, and the retained class map. All 12 frozen open degree-three inputs reach sealed results in fresh processes, and a separate restricted verifier independently matched all 108 available exact checks. The first answer-free held-out degree-three campaign attempted all 12 frozen cases in fresh processes: three reached self-sealed results and passed all 27 independent exact comparisons, while nine failed closed before comparison (four in candidate authentication and five in unit/analytic completion). There were no wrong completed answers, timeouts, crashes, preparation failures, or relation-collection failures. The initial campaign was blind but not preregistered: its policy existed only in the uncommitted worktree. After observing those failures, a separate answer-free 12-case confirmation manifest was committed before any failure-motivated core fix and remains untouched and unexecuted. The original nine failures remain permanent regressions. Their general remediation now includes bounded mixed-invariant compact Smith maps, exact dependency-basis reduction, and a single stateful answer-free continuation schedule for analytic isolation. A receipt-only Sage.js adapter independently replays bounded exact evidence and deliberately exposes only an incomplete factor-base quotient view; it cannot set `complete=True` or dispatch production class groups. None of these changes is credited as held-out success until the original regression panel is rerun and the untouched confirmation protocol is subsequently executed. The historical 3/12 result therefore still fails the admitted-cubic gate. The prepared representation is degree-generic, but hot field arithmetic and the class-group engine remain cubic-specific. Degrees 4 through 6, unconditional completion, held-out confirmation after fixes, and the live product Sage.js backend remain open. See `public-cubic-open-corpus/receipt.json`, `public-cubic-open-oracle/receipt.json`, `public-cubic-heldout-corpus/receipt.json`, and `public-cubic-heldout-oracle/receipt.json`. |
| R5 product qualification | In progress; native row 6 and the quadratic tiny-field gate pass, and full row 6 now runs in three browser engines, while product and browser-performance gates remain | The clean frozen cubic campaign at `1f4237449` records 15 exact alternating pairs per arm and field on logical CPU 0, a clean source closure, and byte-identical independent release builds. Row 6 completes from four public coefficients in 5.826 s versus PARI 2.17.4's 3.960 s, or 1.471x, passing the predeclared 2x native row-6 criterion. Its Rust stage medians are 58.2 ms preparation, 2.722 s collection, 2.081 s candidate authentication, and 966.8 ms completion. The two tiny cubics improved to 11.39 ms and 17.65 ms but remain failures at 5.50x and 7.00x PARI; relation collection plus generic unit/analytic completion now dominate. The two independently built unstripped release executables are byte-identical at 21,633,112 bytes. Separately, the clean imaginary-quadratic campaign passes its frozen tiny-field rule, with the three largest cases at 0.91x, 0.92x, and 1.66x PARI. A 5,679,772-byte qualification Wasm artifact (2,290,695 bytes gzip) now completes exact sealed row 6 from coefficients in Node, Chromium, Firefox, and WebKit with identical stable projections and 116.56 MiB final linear memory. Call times are 22.03 s, 22.68 s, 161.52 s, and 23.13 s respectively. This is a decisive browser-feasibility result, but Firefox and all three browsers fail or have not yet established the frozen performance/product gates; the route is a synchronous qualification harness, not the Sage.js Web Worker API, and it has no cancellation, lifecycle, persistent map, cold-start, or packaging qualification. Platform qualification and broad degree/corpus gates also remain open. See `public-cubic-e2e/benchmark/receipt.json`, `public-quadratic-boundary/benchmark/receipt.json`, and `wasm-public-cubic-e2e/`. |

No file in this directory authorizes production dispatch. Candidate and
upstream-assumed outputs must remain visibly distinct from publicly complete
results.

### Cubic held-out remediation checkpoint

The stale R4 table row above records the historical 3/12 blind campaign. The
general remediation has now crossed both required post-fix correctness gates:
the original twelve frozen cubics reran 12/12 to self-sealed conditional-GRH
results and matched every available private exact check, and the separate
untouched confirmation set then ran 12/12 and passed all 108 private exact
comparisons. After moving the dense/compact crossover to its measured range,
reusing exact analytic plans, and binding a versioned compact-64 resource
profile, the committed confirmation executor recorded 1.373 seconds total at
source `5a09f7407`; see
`public-cubic-heldout-confirmation/execution-receipt.json` and
`public-cubic-heldout-confirmation/comparison-receipt.json`.

This qualifies the current native cubic correctness boundary, not R4 as a
degree-2-through-6 product milestone. The engine remains cubic-specific,
conditional-GRH only, and outside the live Sage.js dispatch path. It also does
not pass the frozen performance target. After starting answer-blind
continuation at fourteen surplus rows when the caller's budget permits it, the
replacement clean 15-sample alternating campaign on the original twelve
regressions matched every exact result and measured summed per-field medians of
2.728 seconds for Rust and 0.585 seconds for PARI 2.17.4: 4.66x weighted, 6.15x
by geometric mean, 9.47x at p90, and 14.16x maximum. Precision-specific
relation logarithms are reused only after an exact generator-prefix check.
Checked fixed-width relation replay restarts in GMP on any overflow. Rust's
summed stage medians are 1.053 seconds relation collection, 0.849 seconds
candidate authentication, 0.693 seconds unit and analytic completion,
and 0.077 seconds public preparation. See
`public-cubic-heldout-performance/receipt.json`. The fresh confirmation set
remains correctness-only; its contextual diagnostic timings are not a formal
comparative receipt.

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
- `public-cubic-heldout-corpus/`: the answer-free executor and redacted receipt
  for the first frozen held-out degree-three campaign.
- `public-cubic-heldout-performance/`: the redacted 15-sample alternating
  Rust/PARI performance receipt for those twelve remediated regressions.
- `public-cubic-heldout-oracle/`: the post-execution restricted comparison of
  completed held-out results and the frozen fresh-confirmation policy.
- `wasm-public-cubic-e2e/`: the qualification-only full row-6 Wasm build and
  exact Node, Chromium, Firefox, and WebKit receipts. This is not the product
  worker route and does not satisfy the browser performance or lifecycle gates.
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
