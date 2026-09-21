# Plan: qualify a Rust mathematical core through class groups

Status: active qualification campaign. The Rust backend remains experimental;
implementation milestones and receipts do not change the production default
until every applicable promotion gate in this plan passes.

## Objective and decision

Establish whether a maintainable Rust mathematical core can deliver complete,
competitive class-group computations through Sage.js on native platforms and
in browsers. The deliverable is a working public mathematical capability with
reproducible evidence, including correctness, speed, memory, build cost, package
size, portability, and ease of extending the implementation.

Rust is the assumed implementation language for this trial. Ordinary Python
remains appropriate for public mathematical interfaces and reference code;
existing compiler improvements remain valuable. Further compiler development
is not a prerequisite for this campaign.

No finite benchmark proves competitive performance on all number fields. This
plan qualifies an explicit domain and publishes failures and limits. It must
not conclude general success from H1, from successful compilation, or from
Smith invariants of an unverified relation lattice.

The live milestone ledger and reproduction entry points are in the
[qualification evidence directory](../bench/pari-class-group-rust/qualification/README.md).

Current checkpoint: the native coefficient-only cubic boundary now completes
and independently matches all twelve original held-out regressions and all
twelve inputs in the untouched post-fix confirmation set. This establishes the
current conditional-GRH cubic correctness boundary, including the formerly
pathological compact-HNF presentations. It does not complete this plan: degrees
4--6, unconditional completion, product dispatch, platform qualification, and
the frozen native/browser performance gates remain open. Moving the
dense/compact authentication crossover to its measured range and using a
geometric answer-free continuation schedule and reusing exact analytic plans
reduced the untouched confirmation campaign from 3.046 to 1.373 seconds. A
separately versioned qualification profile now admits the compact
route through 64 surplus rows while preserving its independent storage, exact
work, saturation, and coefficient ceilings. Per-attempt telemetry showed that
failed exact authentication/completion at the minimum seven-row surplus cost
far more than collecting seven more rows. The answer-blind schedule therefore
starts at fourteen when the caller's budget permits and doubles between
attempts, while retaining seven for tighter explicit budgets. Completion also
reuses precision-specific logarithms only after authenticating the complete
exact principal-generator prefix. The replacement
clean 15-sample alternating campaign on the original twelve cubic regressions
records exact agreement in every measured pair. The modular HNF's unit pivots
are now eliminated by exact back substitution before Smith, reducing Smith to
the residual nonunit presentation and lifting its independently verified map
back to the full factor base. Relation refinement now also retains a bounded,
lazy cache of exact factor-base ideal powers. On its profiled field this reduced
repeated ideal multiplications from 1,384 to 74 while preserving all 15,619
exact valuation calls. At source `f18561329`, summed per-field medians are
1.607 seconds for Rust and 0.585 seconds for PARI 2.17.4: a 2.748x weighted gap,
with a 3.935x geometric mean, 6.63x p90, and 7.42x maximum. Batching the
independent exact dependency replay across every relation column first reduced
Rust's absolute sum from 2.129 to 2.045 seconds. Exact answer-free continuation
now also retains the FLINT fraction-free factorization only for an identical
selected square block and exact surplus prefix, while recomputing and replaying
all enlarged-presentation evidence. That reduced the Rust sum to 2.013 seconds
and candidate authentication from 0.593 to 0.571 seconds; the retry-heavy field
0012 fell from 406.1 to 390.2 ms. Minting the immutable class-map binding once
after complete constructor verification then reduced summed authentication
from 0.571 to 0.548 seconds and the Rust total from 2.013 to 1.995 seconds;
field 0012 fell again to 169.7 ms authentication and 379.9 ms total.
The Arb regulator boundary now loads exact unit exponents before evaluating a
compact principal generator and skips the generator only when it has zero
support across every unit. This preserves the same independently enclosed
regulator while reducing summed unit/analytic completion from 0.693 to 0.625
seconds and the Rust total from 1.995 to 1.915 seconds; field 0012 fell to
366.0 ms total.
Borrowing the authenticated high-precision relation-log cache through unit
reconstruction and independent replay removes a complete arbitrary-precision
matrix clone per attempt. Summed completion fell another 3.4 ms to 0.621
seconds, while the 1.918-second Rust total was 3.3 ms above the preceding run
because relation collection varied upward by 5.2 ms.
The bounded precision driver now retains ownership of the prepared field and
authenticated presentation across retries, cloning them only for a nonfinal
attempt and moving the existing evidence into the final permitted attempt.
This preserves failure atomicity while removing the common full relation
matrix, generator, dependency, and class-map copy; summed completion fell from
0.621 to 0.588 seconds and the Rust total from 1.918 to 1.887 seconds.
Completion now also borrows the presentation-owned dependency lattice and
allocates a copy only when exact basis reduction is actually required. The
sealed result exposes that single authenticated owner rather than storing the
lattice twice. Its 2.6 ms whole-run change and 3.3 ms upward completion-stage
change are below campaign noise; this is currently a storage/ownership result,
not a claimed stage-speed gain.
The analytic continuation boundary now rejects an unchanged incomplete
candidate as soon as a rigorous Belabas--Friedman enclosure has tail below
`1/4` and places the entire positive-integer index strictly above one. This
cannot accept a candidate and leaves the unique-positive-one publication test
unchanged; it only avoids larger Euler prefixes before exact relation
continuation. A CPU-pinned 31-pair before/after diagnostic reduced the
retrying 27-column field from 56.08 to 41.71 ms and its completion stage from
29.50 to 15.02 ms. The retry-heavy 187-column field moved from 372.87 to
362.02 ms, with completion moving from 111.50 to 102.21 ms. The clean full
alternating campaign matched all 180 exact pairs and reduced the former 12.13x
maximum to 8.65x. Whole-panel Rust time varied upward by 29 ms while PARI
varied upward by 25 ms, so this is a tail improvement rather than a claim that
the absolute aggregate fell.
Simultaneous PARI variation on the smallest fields keeps the geometric and tail
ratios noisy.
The exact-authentication route selector is now calibrated against alternating
CPU-pinned measurements rather than the former conservative one-million-work
cutoff. Compact small-surplus authentication was faster at 25,382 estimated
verification multiply-adds (0.76 to 0.61 ms), whereas forcing it at 11,926
was slower (0.41 to 0.47 ms and 16.68 to 18.20 ms end to end). The selector
therefore keeps dense Smith through 20,000 and uses the independently verified
compact route above that boundary whenever its explicit shape and resource
contract fits. Intermediate measurements also reduced authentication from
1.54 to 0.88 ms at 57,952 work and from 15.79 to 4.85 ms on the formerly
worst tiny held-out continuation case. The subsequent clean 180-pair campaign
reduced summed authentication from 0.569 to 0.547 seconds and Rust's summed
median from 1.914 to 1.898 seconds; simultaneous PARI time moved from 0.610 to
0.609 seconds. The maximum ratio fell from 8.65x to 6.86x.
Exact dependency replay now proves one absolute `i128` bound for a complete
dependency row before accumulating every relation column without per-operation
overflow branches. A row whose bound is not proved restarts from the beginning
in GMP. Reusing this exact primitive in both candidate authentication and final
completion reduced the next clean Rust sum from 1.898 to 1.834 seconds,
authentication from 0.547 to 0.514 seconds, and completion from 0.581 to 0.552
seconds. The retry-heavy field 0012 fell from 364.76 to 337.28 ms. PARI's
simultaneous sum fell from 0.609 to 0.601 seconds; tiny-field variation moved
the maximum ratio upward despite Rust's lower absolute time.
The class-map, compact-presentation, and principal-witness boundaries now
verify retained relation columns in place rather than cloning a full GMP vector
for every column. Compact quotient verification accumulates only one exact
value per invariant factor and tests exact divisibility; generic diagonal
presentations retain the original materialized fallback. Every one of the
twelve Rust field medians fell in the subsequent clean campaign. Summed
authentication dropped from 0.514 to 0.428 seconds, total Rust time from 1.834
to 1.749 seconds, and field 0012 from 337.28 to 314.29 ms. PARI simultaneously
varied from 0.601 to 0.606 seconds, taking the weighted ratio below 3x for the
first time.
Final sealed-evidence verification now sends both presentation dependencies and
fundamental-unit relations through the same exact bounded batch primitive. A
complete absolute-sum proof admits a row to branch-free `i128` accumulation;
an unproved row restarts from the beginning in GMP. The next clean campaign
reduced summed Rust time from 1.749 to 1.621 seconds, authentication from 0.428
to 0.411 seconds, completion from 0.552 to 0.501 seconds, and field 0012 from
314.29 to 276.34 ms. PARI simultaneously varied from 0.606 to 0.585 seconds,
so the weighted gap fell from 2.89x to 2.77x while the few-millisecond tail
remained noisy.
The compact continuation cache now retains a previously verified quotient map
as producer data. It can avoid regenerating the map only after matching the
exact relation prefix and independently recomputing the same class order; all
current relations, inverse identities, dependencies, saturation evidence, and
new generator-order witnesses are still authenticated. The subsequent clean
campaign reduced authentication from 0.411 to 0.392 seconds, total Rust time
from 1.621 to 1.597 seconds, and field 0012 from 276.34 to 261.63 ms. PARI
simultaneously varied from 0.585 to 0.582 seconds, taking the weighted gap from
2.77x to 2.75x.
The cache now also retains exact generator-order witnesses only as producer
data when that quotient map and independently recomputed class order remain
unchanged. It appends zero coefficients for new relations and replays every
complete nonzero target equation against the enlarged matrix, using `i128`
only after a whole-row absolute-sum proof and otherwise restarting exactly in
GMP. A CPU-pinned 31-pair field-0012 A/B reduced authentication by 4.96 ms and
the complete call by 5.49 ms. The clean campaign retained a 3.96 ms
authentication and 3.03 ms total reduction on that field. Across all twelve
fields, unrelated relation and completion variation raised Rust's sum by 9.82
ms and PARI varied upward by 3.12 ms, leaving the weighted ratio statistically
unchanged at 2.748x versus 2.746x. This is a localized exact-replay gain, not an
aggregate-speed claim.
The immutable class-map binding now uses a versioned injective binary encoding
instead of decimal formatting every exact coordinate. A CPU-pinned 31-pair
field-0012 comparison reduced authentication by 5.56 ms and the complete call
by 4.99 ms; a twelve-field diagnostic reduced summed authentication by 22.59
ms. Callgrind independently records a reduction from 2.978 to 2.884 billion
instructions on field 0012, with the former binding hotspot absent. The next
clean 180-pair campaign still matched every exact result. It measured 1.623
seconds for Rust and 0.601 seconds for PARI, a 2.699x weighted gap, 3.839x
geometric mean, 6.33x p90, and 7.18x maximum. Rust authentication fell another
6.83 ms, but variation in the other stages raised the Rust sum by 16.17 ms
while PARI rose by 16.56 ms; the aggregate ratio movement is not attributed to
the encoding change.
The collector factor-base authority, collected relation/principal-generator
transcript, and final principal-witness binding now use the same binary exact-
integer encoding under independently bumped domains. The compact consumer
still hashes every live value before accepting collector provenance. A
CPU-pinned 31-pair field-0012 comparison reduced authentication by 1.26 ms and
the complete call by 1.62 ms; Callgrind fell another 23.81 million instructions
to 2.861 billion. The clean campaign matched all 180 pairs and measured 1.579
seconds for Rust versus 0.591 seconds for PARI, a 2.673x weighted gap, 3.832x
geometric mean, 6.42x p90, and 7.17x maximum. Summed authentication fell 19.31
ms. Other Rust stages and PARI also varied downward, so only the focused and
instruction-count reductions are attributed to the encoding.
The collector-owned factor base and relation/principal-generator transcript are
now externally read-only Rust storage. Safe callers receive immutable accessors,
while detached or supplied evidence retains full exact replay. This lets the
private collector-to-authenticator call graph propagate a field-bound origin
capability without hashing the same protected storage at both boundaries. A
CPU-pinned 31-pair field-0012 A/B reduced relation collection by 1.37 ms,
authentication by 0.68 ms, and the complete call by 2.30 ms. The subsequent
clean campaign still matched all 180 pairs and measured 1.600 seconds for Rust
versus 0.603 seconds for PARI, a 2.653x weighted gap, 3.771x geometric mean,
6.25x p90, and 7.04x maximum. Rust's absolute panel sum rose by 21.62 ms and
every aggregate stage varied upward, so the clean ratio change is not claimed
as an absolute Rust speedup; the focused alternating A/B is the optimization
evidence.
Conditional completion no longer performs a second full dependency and unit-
relation replay immediately before constructing its private immutable result.
The same exact equations are already proved on the only construction path;
the inexpensive precision transcript check remains there, and the public
`verify_sealed_evidence` replay remains available and is still exercised by
the qualification boundary after construction. A CPU-pinned 31-pair field-0012
A/B reduced completion from 75.55 to 74.39 ms and the complete qualification
call from 259.72 to 257.55 ms, with all 62 results and independent replays
agreeing. The first clean 180-pair panel at source `e45994e5d` reduced summed
completion from 0.511 to 0.501 seconds and total Rust time from 1.600 to 1.578
seconds. PARI simultaneously varied from 0.603 to 0.595 seconds, leaving the
weighted ratio statistically unchanged at 2.653x; only the focused paired
result and removal of the deterministic duplicate work are attributed to this
change.
This remains substantially ahead of the earlier pre-power-cache receipt at
4.20x weighted and 5.72x geometric mean, but still fails the frozen native
performance gate. Rust's summed stage
medians are 0.619 seconds relation collection, 0.373 seconds candidate
authentication, 0.511 seconds unit and analytic completion, and 0.080 seconds
public preparation. Relation collection fell from 1.063 seconds before the
exact ideal-power cache; the three principal mathematical phases are now
nearly balanced.

The current shared source also completes row 6 from coefficients through the
qualification Wasm reactor in Node, Chromium, Firefox, and WebKit with the same
sealed projection. The 5,776,914-byte artifact is 2,326,379 bytes gzip and
finishes with 2,166 linear-memory pages (135.38 MiB), inside the plan's 256-MiB
worker ceiling. One-shot calls are 31.91, 32.25, 238.61, and 33.12 seconds,
respectively. The receipts bind the current 1,144-relation mixed-invariant
presentation and explicitly expose the failed 4,096/2,048-bit attempt followed
by the successful 8,192/4,096-bit attempt. This passes current-source browser
feasibility and memory, not the browser performance or product gates: the route
is still a synchronous qualification harness rather than the Sage.js worker
API, and Firefox remains the dominant target-specific performance failure.
The compatibility adapter now declares the shared Rust source directory as a
Cargo rebuild input. A clean build produced the current artifact, and touching
a shared core module forced all three adapter crates to rebuild, closing the
previous stale-generated-source risk.
The fail-closed Sage.js receipt adapter now accepts this current
mixed-invariant result and validates its complete precision-attempt transcript
against the caller's resource request. It still returns an explicitly
incomplete Sage.js computation and cannot dispatch or claim a public proof;
replayable maps, units, regulator, saturation, request binding, and artifact
identity remain required before promotion.

## Evidence we actually have

Starting evidence is commit `e88f6ee00` on
`agent/pari-class-group-e2e-integration`, especially
[the Rust overview](../bench/pari-class-group-rust/README.md) and
[the corpus receipt](../bench/pari-class-group-rust/cubic-corpus-development-receipt.json).
Rebase or integrate against the current project head before implementation;
preserve these receipts as historical observations, not current qualification.

| Observation | What it establishes | What remains unproved |
| --- | --- | --- |
| H1 Rust collector and Smith: 9.31 ms | A substantial Rust algorithm can run in the PARI time regime | Full public class group, units, completeness, general preparation |
| PARI prepared H1: 10.70 ms | Useful same-field context | A matched-work Rust/PARI ratio; PARI did additional work |
| Six small Rust examples: 3.6–4.2 ms; PARI: 0.5–1.0 ms | Trivial, cyclic and noncyclic invariant factors agree on these examples | General correctness or competitive tiny-field latency |
| Simple H1 box collector: 119.72 ms | Algorithm choice matters substantially within Rust | That a language change alone closes other gaps |
| Release executable: 1.48 MB; stripped: 1.28 MB; build: 11 s | The small experiment is compact and practical to build | Full-engine size or clean dependency-build cost |
| Direct `gmp-mpfr-sys` Wasm build rejected | The chosen crate/build configuration is insufficient | That GMP or Rust cannot work in Sage.js Wasm |

The fast numerical preparation contains fixed H1 embedding data and a
three-dimensional implementation. The generic box collector assumes a
unimodular maximal-order basis and stops at full rank plus extra relations.
Neither constitutes a general completion test. Checked `i128` overflow must
become a supported promotion/retry path. The experiment also exposed a norm
polarization bug only when the field corpus expanded: broad independent
validation is essential.

## 1. Freeze the scope and contracts first

The first release candidate covers irreducible monic integral polynomials of
degrees 2 through 6, with all possible signatures represented, including
nontrivial integral-basis denominators, ramification and index divisors. Inputs
and outputs use arbitrary-precision integers. Explicit resource limits may
terminate work; unsupported cases and exhausted limits must be reported.
There is no unconditional promise that every input of these degrees finishes.
Degrees 7 and 8 form a separately reported extension panel.

Freeze three timing boundaries and never substitute one for another:

1. **Algorithm stage:** neutral input to a specified stage, with equivalent
   output work. Useful for diagnosis and source correspondence.
2. **Prepared field:** validated maximal order, embeddings and multiplication
   data through a completed class-group computation and retained map state.
   Preparation may come from an independent oracle only in this experiment.
3. **Public call:** polynomial construction through Sage.js class-group result,
   including maximal-order preparation, validation, marshalling, completion
   checks and result construction. No PARI data producer or invocation is
   allowed in the Rust product path. Report fresh-field, fresh-process and
   warmed-code/fresh-field timings separately from cached-result lookup.

The public result provides class number, normalized invariant factors,
generator ideals, and the state needed for ideal-to-class and principality
maps. Test the maps separately and charge their construction or first-use cost
to the matching benchmark. Compute units, logarithms, regulator and saturation
information whenever necessary to establish completeness. Compact factored
units are acceptable; eager expansion is a separate, explicit operation.

There are three distinct statuses:

- Candidate: relations and invariant factors of the collected lattice.
- Upstream-assumed correspondence: PARI's algorithm and acceptance policy
  reproduced under the original experiment's assumptions.
- Publicly complete: all evidence required by Sage.js's existing class-group
  and class/unit contracts has been produced and verified.

Keep GRH-conditional and unconditional proof modes distinct. Preserve the
documented meaning of `proof` in Sage.js. An unsupported requested proof mode
must use a correct available fallback or report its limitation; it must not
silently become heuristic. A PARI match, rank test, small regulator residual,
or fixed surplus of relations cannot by itself set `complete=True`.

Reuse existing result and certificate contracts, including relevant
`ClassUnitComputation`, `UnitGroupComputation`, regulator enclosure and
saturation records. Record precisely which public class-group operations
require which evidence. The complete unit-group API is only claimed when its
own stronger contract is met. Porting every PARI BNF operation is not required.

## 2. Make the architectural choice explicit

Before production promotion, write an architecture decision for a Rust
mathematical backend and update the corresponding policies and checks.
[ARCHITECTURE.md](../ARCHITECTURE.md) currently prioritizes ordinary Python and
source-transparent compilation; a handwritten Rust algorithm is a new explicit
backend, not a source-transparent compilation of a Python body.

Preserve Sage/Python semantics and existing public types. Use declared,
inspectable boundaries through `sagejs.runtime` and the FFI machinery, extending
that machinery generically where necessary. Expose backend/capability and
proof status in diagnostics. Do not dispatch to a hidden Rust implementation
by recognizing a Python function name.

Structure the implementation as a host-independent Rust library plus thin
native and Wasm adapters. Keep number-field arithmetic, ideal arithmetic,
relation collection, linear algebra, numerical preparation and completion
logic in understandable modules with explicit ownership and error types.
The complete hot computation stays within Rust and declared arithmetic
libraries. No scalar-by-scalar JS/Python calls or serializing every phase.

Prefer safe Rust with explicit reusable workspaces and compact data. Confine
`unsafe` to reviewed FFI, representation and measured optimization boundaries;
document invariants and add targeted tests. Do not use unchecked arithmetic
or indexing simply to match a timing. Keep a small set of concrete arithmetic
implementations; avoid a large generic framework or uncontrolled monomorphization.

Retain existing Python code as reference/fallback where it is correct for the
same domain. Fallback availability and limits are capability data, not a claim
that an incomplete implementation is complete. A packaged portable Wasm backend
may provide a correct fallback on a host without the native addon. Browser
performance must qualify on that actual route.

Classify Rust mathematical sources, FFI boundaries and any C/C++ adapters in
the architecture inventories. Preserve PARI 2.17.4 source provenance, notices,
GPL attribution and dependency source/license obligations. A translation to
Rust does not change the source's license obligations.

## 3. Clear the arithmetic and browser risk early

Do this before expanding the full algorithm beyond the first general cubic.

### Preferred trial: reuse Sage.js's arithmetic libraries

Investigate Rust linkage to the repository's pinned GMP/MPFR and, where useful,
FLINT builds using `packages/wasm-toolchain` and the existing Wasm resource
adapters. Try a supported external-library configuration of the current Rust
wrapper; if insufficient, evaluate a small reviewed binding to those builds.
Do not turn an unsupported cross-build flag into a presumed compatibility fix.

Use a single compatible linker/target/sysroot and allocator contract. Verify
integer widths, limb layout, alignment, calling conventions and memory ownership
with executable ABI probes. Prefer one arithmetic-library instance per module;
do not pass allocated objects between separately linked allocator domains.
If separate modules are needed, transfer canonical values and include copy costs.

Rust's `wasm32-wasip1` target explicitly supports C interoperability; using it
in a browser also requires the imports supplied by the host. The existing
Sage.js browser loader is the first integration candidate. The bare
`wasm32-unknown-unknown` target is an alternative, but compatibility with the
existing C libraries must be demonstrated, not assumed. See the
[Rust WASIp1 documentation](https://doc.rust-lang.org/rustc/platform-support/wasm32-wasip1.html)
and [bare Wasm target documentation](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html).

### Arithmetic alternatives and selection

Compare bounded `i64`/`i128`, reusable arbitrary-precision storage, and an
existing pure-Rust big-integer backend only on representative kernels. A
pure-Rust integer library is not a substitute for the required high-precision
real/complex and rigorous enclosure operations. Specify those separately.
Do not build a new general big-number library as a prerequisite.

Run exact division, gcd, multiply-add, modular arithmetic, norm evaluation,
ideal multiplication/reduction, HNF/SNF and precision escalation. Include large
intermediates, negative values and aliasing. Native `i128` speed does not predict
Wasm multiplication/division speed; measure its actual lowering and compare
bounded-plus-promotion and arbitrary-precision variants in browsers.

Bounded arithmetic must check overflow in release builds, promoting or retrying
from a valid checkpoint without partial publication. Test forced overflow and
precision restarts. Preserve Python floor/modulo semantics where translation
depends on them; encode upstream truncation explicitly where PARI requires it.

**Gate W0:** the same nontrivial arithmetic pipeline runs with identical exact
results in native Rust and the actual Sage.js browser loader in Chromium,
Firefox and WebKit. Produce memory, size and throughput measurements. A
`cargo check`, Wasmtime run or Node-only Wasm test does not pass this gate.
Choose and document the arithmetic route from the evidence. If no route can
meet the later browser gates, the experiment remains unqualified regardless
of native speed.

## 4. Build an independent correctness and benchmark corpus

Pin PARI 2.17.4 source, toolchain and build configuration as the primary
correspondence reference. Keep another mathematical check where practical:
small exact enumeration, independent certificates or another CAS. Two wrappers
around the same PARI routine are not independent mathematical oracles.

Predeclare a minimum 120-field qualification panel, with 60 open development
cases and 60 held-out cases, balanced across degrees 2–6. Retain all existing
small examples, H1, the denominator/index-3 cubic `x^3-20010*x+20018`, and row-6
`x^3-2000000000010*x+2000000000018`. Cover signatures, trivial/noncyclic groups,
large class numbers, ramification, index primes, awkward bases, large exact
intermediates, nontrivial units, numerical precision increases and continuation.

Stratify timing cases by PARI public time: below 5 ms, 5–100 ms, 0.1–2 s and
2–30 s. Use separate stress/resource-limit cases beyond that range. Freeze
selection procedure, seeds, expected validation criteria and manifest hashes
before tuning. Supplement with at least 1,000 reproducible bounded random
fields and small exhaustive ranges. Fixes discovered on held-out cases require
fresh held-out confirmation; do not silently remove difficult cases.

Expected outputs and traces belong only to test processes. The runtime receives
polynomials or allowlisted neutral prepared data, never relation rows, successful
retry schedules, class numbers or field-specific answers. Generate new runtime
input values during validation to expose hidden fixed-field assumptions.

Check exact ideal arithmetic, relation valuations, basis transformations,
HNF/SNF identities and unimodularity, generator-order principal witnesses,
class-map homomorphism and principal-ideal maps. Verify torsion, unit norms,
unit independence, regulator enclosures and completion/saturation evidence as
required by the selected mode. Round-trip canonical result serialization.
Different valid generators and numerical search orders require mathematical
equivalence checks, not byte equality. Use exact trace equality only for
stages where order and arithmetic choices are deliberately matched.

## 5. Close the actual algorithm in dependency order

| Milestone | Work | Required exit evidence |
| --- | --- | --- |
| R1: general prepared cubics | Remove H1 embeddings and fixed dimensions from the admitted path; rational integral bases, index primes, embeddings and precision state; faithful small-norm collection | H1 and an unseen nontrivial cubic run from neutral data on native and browser targets |
| R2: relation/linear-algebra loop | Ideal products and powers, sparse/dense HNF with transforms, incremental updates, random relations, rank and unit-rank deficits, factor-base growth, precision retries | Row-6 and forced continuation cases finish without frozen schedules; exact invariants hold at every restart |
| R3: completion and usable groups | Unit lattice and compact reconstruction, regulator/analytic checks, honesty extension, saturation, Smith transforms, generator ideals and principality/class-map state | Complete prepared-field contract, independently replayable evidence and correct proof status |
| R4: public input and broader degree | Polynomial validation, maximal-order/discriminant computation and neutral preparation through Rust or declared mature libraries; all signatures and degrees 2–6 | Public polynomial-to-result runs without PARI at runtime; full correctness panel |
| R5: product qualification | Native and browser adapters, packaging, fallback/error contracts, memory/cancellation, optimization and release evidence | All performance and integration gates below on a frozen candidate |

Reuse trustworthy Python translations and PARI source maps as specifications.
Do not assume their fixed-field shortcuts generalize. Generalize data structures
before duplicating the whole collector per degree. Libraries may supply mature
preparation or linear algebra; disclose exactly which work they perform.
Calling PARI for the class-group engine cannot establish this trial's thesis.

Match algorithmic work before tuning allocations and bounds checks. For each
regression identify time in preparation, factor base, relation search, exact
valuations, incremental HNF, numerical/logarithmic work, completion, Smith and
generators, and public conversion. Nested timers must reconcile with total time.
Retain counter profiles (candidates, accepted relations, retries, bit sizes,
allocations and peak live bytes) to distinguish a slower algorithmic path from
a slower implementation of the same work.

Use function/microkernel benchmarks only to choose an optimization. Accept it
based on complete held-out workloads, correctness and memory behavior. Reuse
storage, batch arithmetic, exploit sparsity and call mature kernels when those
choices improve the measured complete computation. Keep a simple diagnostic
implementation of subtle optimized operations.

## 6. Define competitive performance before tuning

The following are proposed campaign acceptance thresholds, not existing project
policy or claims about today's code. Freeze them with the corpus at milestone
R0 (scope and harness). Do not relax them retroactively to label a result green.
Report failures by field, signature, degree, size stratum and browser engine.

| Metric | Initial acceptance target |
| --- | --- |
| Native warmed-code, fresh-field public time | Geometric-mean Rust/PARI ratio at most 1.5; 90th percentile at most 2; no field above 3x for reference times at least 5 ms |
| Native tiny fields, PARI below 5 ms | Median at most `max(2 * PARI time, PARI time + 2 ms)` per field; report batch throughput too |
| Required row-6 result | At most 2x PARI for the complete matching public contract, including required completion work |
| Browser warmed-code, fresh-field public time | Per-engine geometric mean at most 2.5x native Rust; 90th percentile at most 4x; separately report ratio to native PARI |
| Browser tiny fields | Added browser cost at most 5 ms over native Rust per field; no scalar host round trips |
| Browser same-target control | If an equivalent PARI Wasm control can be built, target geometric mean at most 1.5x and 90th percentile at most 2x for matching work; otherwise mark this comparison unavailable |
| Memory | Native peak at most 2x PARI plus 32 MiB; standard browser panel within a 256 MiB per-worker budget; larger admitted jobs have explicit limits |
| Browser download | Added compressed class-group payload at most 5 MiB; also report total closure and duplicated GMP/MPFR bytes |
| Browser cold start | Warm-cache module initialization at most 250 ms on the reference desktop; additional simulated 20 Mbit/s transfer plus initialization at most 2.5 s; report first answer separately |
| Developer build loop | Warm dependency cache: clean core release build at most 60 s, single-module incremental build at most 10 s on the fixed development host |

All performance targets refer to medians over repeated independent runs;
percentiles across fields are separate from run-to-run percentiles. Collect at
least 15 alternating native samples per field, batch tiny calls without reusing
their computed results, and use multiple seeds for randomized paths. Estimate
uncertainty and require additional samples if a gate is within measurement
noise. Include timeouts and failures rather than deleting them from aggregates.

Run timing on a quiet machine with fixed thread count, CPU/power policy and
documented toolchains, arithmetic libraries and portable/CPU-native flags. Use
comparable optimization intent across Rust and C; disclose every difference.
No instrumented run supplies headline timings. Record machine context and
raw samples; rerun the previous baseline with every serious performance claim.

Match proof policy and lazy/eager output behavior. Prefer a matched PARI public
API workload; if Rust's richer certificates need extra work, charge the same
verification contract to both sides or publish the extra cost separately while
retaining the full Rust public latency. Never use an omitted correctness stage
as a performance advantage. A PARI BNF call with extra unit work is contextual
evidence until those boundaries match.

The 11-second existing Rust build did not establish a fresh dependency install
budget. Measure Rust-only rebuilds, dependency builds, Wasm link/optimization,
CI cache hits, peak compiler RAM and compressed artifacts separately.

## 7. Browser and native product integration

Run the released browser module in a Web Worker through Sage.js's public API.
The default path must work without SharedArrayBuffer, special cross-origin
isolation, threads, a server, a native helper or runtime compilation. Optional
threaded/SIMD paths need capability tests and a correct baseline.

Keep one resident computation state with explicit close/reset, bounded resource
growth and transactional result publication. Use coarse resumable computation
steps to return to the worker event loop for cancellation; a posted message
cannot interrupt a synchronous Wasm call that never yields. Shared-memory
cancellation is optional. Worker termination/recreation is a tested last-resort
stop. Meet the repository's current interruption ceiling and report cancellation
latency inside long HNF and foreign-library calls.

Validate every offset, dimension and length once at entry; avoid references to
Wasm memory surviving growth. Use canonical integer serialization across
modules; keep internal GMP/Rust representations private. Test malformed data,
stale handles, double close, cancellation, precision failure, capacity failure,
and concurrent independent jobs. A Rust panic, Wasm trap, or foreign allocator
abort must not publish a partial answer. Use fallible allocation where available
and worker/process isolation where dependencies cannot recover from OOM.

Run repeated workloads with explicit closure and finalizer fallback. Linear
memory need not shrink, but live allocations must stabilize and storage must
be reused. Include 1,000 repeated small calls and at least 100 mixed medium
calls, with leak/sanitizer checks on supported native configurations and browser
memory-growth measurements.

Qualify Linux x64, Linux ARM64, macOS ARM64 and native Windows x64, following
[RELEASE.md](../RELEASE.md) and [DISTRIBUTION.md](../DISTRIBUTION.md). The Windows
user path must require neither WSL nor MSYS2/MinGW. If the native dependency
chain is unavailable, an explicitly declared, tested portable route is required;
report its speed honestly and do not claim native Windows parity. Packaged
consumers need neither Cargo nor a C compiler.

Extend existing capability, boundary and workload inventories and trusted route
telemetry. Follow [the Wasm workload policy](../architecture/wasm-workload-policy.json):
Chromium, Firefox and WebKit must exercise the actual public route and exact
candidate artifact. Test npm/SEA/browser packages, lazy loading, offline reuse,
cache invalidation and minimum supported Node. Keep the mathematical core out
of bootstrap payloads until first use.

## 8. Execution, machines and agent handoffs

Milestone R0 produces the architecture proposal, frozen scope/corpus, neutral
input schema, output/evidence contracts and a runnable measurement harness.
Then W0 and R1 can overlap, followed by R2/R3 and R4, then R5. Browser arithmetic
is on the critical path from the beginning. Do not spend months completing
Linux-only code before learning whether its arithmetic backend is viable in
the browser.

Potential independent lanes, activated only when execution is authorized:

1. Integration and shared ABI/architecture ownership.
2. Corpus, PARI controls and benchmark harness.
3. Independent correctness/certificate verification.
4. Rust exact arithmetic and storage/promotion.
5. Wasm linkage, allocator and browser host integration.
6. Neutral field preparation and maximal orders.
7. Prime ideals, index primes and ideal arithmetic.
8. Numerical preparation and precision escalation.
9. Relation enumeration and collection.
10. Incremental HNF, transformations and Smith.
11. Units, regulator and completion checks.
12. Class generators and maps.
13. Native/public Sage.js adapter and semantics.
14. Platform packaging and Windows qualification.
15. Memory, cancellation, unsafe review and fuzzing.
16. Independent performance and artifact-size qualification.

These are file/API ownership boundaries, not a requirement to run sixteen
compilations simultaneously. Use narrow parallel-task contracts and worktrees;
only integration changes shared interfaces and inventories. Each handoff
contains scope, contract, source correspondence, focused tests, known limits,
one reproduction command and exact source/artifact identities. Document enough
that a new agent can reproduce a failure without reading the chat history.

Use the existing four persistent platform hosts when available. A quiet Linux
x64 timing host with 8–16 vCPUs and 32 GiB RAM is sufficient initially; use a
separate development/build worker if agent compilation interferes with timing.
Run Chromium/Firefox there and WebKit plus Safari smoke testing on the macOS
host. No GPU or special large-memory VM is initially required. A resource-heavy
stress lane may justify more RAM only after measurements. This plan does not
provision machines or authorize new spending.

Keep one validated build per active backend/profile, share only compatible
content-addressed dependency caches, and cap compiler concurrency by RAM.
Record artifact sizes before deleting obsolete generated code and build trees.
Keep source, manifests, scripts and compact receipts; rebuild disposable
products. Do not duplicate multi-gigabyte dependency caches per agent.

## 9. Acceptance and the next decision

A frozen candidate passes only when all of the following hold:

- The full admitted public contract works for every qualification case; an
  explicitly designated resource-limit test returns its documented outcome.
- Independent checks establish exact relations, maps and the completeness
  evidence required by each claimed proof mode; every correction has held-out
  confirmation. No numerical residual substitutes for missing proof authority.
- Native and all required browser engines meet the frozen speed, memory,
  lifecycle, size and loading gates. Native success alone is partial success.
- The supported platform packages reproduce those results, and declarations,
  notices, source provenance, route telemetry and architecture checks agree.
- A second agent/reviewer can build, test, diagnose a seeded failure and extend
  one small arithmetic operation from repository documentation alone. Record
  actual setup/build/debug friction as part of the maintainability evaluation.

Deliver a report separating complete matched public timings, stage diagnostics,
assumption-dependent results, certification cost, and unsupported cases. Include
raw samples, toolchains, corpus hashes, reproducible commands, artifact sizes,
build times, peak memory, browser traces and a small list of remaining limits.

Possible outcomes are: qualified Rust class-group backend; native-qualified
backend with unresolved browser or platform work; or an unqualified experiment
with a demonstrated limiting stage. Do not require the report to be positive.
An expensive dependency strategy or missing numerical algorithm is a specific
engineering finding, not automatically a verdict on Rust itself.

Only after this trial qualifies should we promote Rust for additional domains
such as Galois groups or elliptic curves, reusing the arithmetic, ownership,
testing and packaging foundation. The reusable asset is an effective way to
build mathematical software, with clear contracts and fast feedback for both
humans and agents.
