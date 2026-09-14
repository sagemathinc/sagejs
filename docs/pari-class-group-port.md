# Faithful PARI class-group language experiment

## Approved continuation block

The user explicitly approved eight additional aggregate active-agent hours and
one additional CPU-hour of newly metered diagnostics after the checkpoint
below. The root goal counter at resumption is 57,120 seconds; the incremental
active-time ceiling is therefore 85,920 root seconds if no subagents are used.
Any subagent time in this block must be deducted from that allowance. The
historical accounting gaps are not erased by this new, separate allowance.
Execution checks in this block will record child user and system CPU time;
compilation included in such checks is conservatively charged too.

The user subsequently requested subagent help. One read-only reviewer reported
approximately 360 active seconds, without an initial clock timestamp. Reserve
its full 15-minute task allowance conservatively: the root ceiling is now
85,020 seconds. The review ran
no builds or benchmarks and did not share the timing workload.

A second read-only reviewer examined word arithmetic for approximately five
active minutes. Reserve its complete ten-minute allowance: the root ceiling
is now 84,420 seconds. It ran no tests/builds and made no edits.

The first priorities are connecting the distinguished-ideal relation path and
obtaining a qualified work-matched comparison. The full prepared-field
class-group objective, frozen inputs, PARI 2.17.4 pin, safety limits and
acceptance criteria remain unchanged. The following checkpoint is historical,
not a statement that continuation is still awaiting approval.

### Integral element-power dependency

`integral_power.py` connects the previously checked column binary powering to
`base3.c:nfpow`'s nonnegative integral branch: scalar detection, reverse-order
integer content extraction with early gcd-one exit, primitive-column powering,
and content restoration. It preserves the scalar/column return tag even though
the packed output always has basis coordinates. Scalar powers retain the
64-bit `trans1.c:upowuu` cutoff/addition-chain shortcuts and the binary branch
of `powiu_sign`; the bounded recursive word tail is flattened into a helper.
The `trans1.c` SHA-256 is
`287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835`.

The differential check covers 3,304 word-power controls (including cutoff
neighbors), 576 signed scalar powers including 65/130-bit inputs, and 768
field powers over the same four tuning fields. It checks scalar/column tags,
column square/multiply counts and order, input preservation, and output
canaries in CPython, JavaScript and native GMP. Zero exponent and scalar paths
are exercised with empty unused workspaces. Negative exponents and exponents
at least 512 are rejected; rational/factored inputs remain outside this entry.
The first native compile rejected fixed slices on `IntegerBuffer` (supported
only on `NativeIntegerVector`); a three-entry reset loop uses the existing API.

Trace SHA-256:
`3bcac2204404543892f8d3db31729452816801eb4f3e5012d42468b0b2a3bd30`.
Generated core size is 1,868,262 bytes. The existing fixed 1,024-word allocation
per entry covers the declared field input bound; no capacity check was relaxed.
These are correctness checks, not qualified timings or completed prime powers.

Reproduce with `SAGEJS_FLINT_PREFIX` set to the prepared FLINT prefix:

```sh
python3 bench/pari-class-group-port/meter_command.py \
  node bench/pari-class-group-port/check_integral_power.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

Continuation CPU ledger, conservatively including compilation (seconds):

| Execution | User | System | Outcome |
| --- | ---: | ---: | --- |
| Initial power check | 1.330843 | 0.330455 | Unsupported slice rejected |
| Power check after reset loop | 6.192158 | 0.671522 | Pass |
| Python formatter | 10.010311 | 0.475146 | Pass; zero files changed |
| Expanded power check with receipt | 2.464804 | 0.548225 | Pass |
| Strict Python | 76.378037 | 3.097788 | Pass: 403 modules, 975 formatted files |
| Architecture | 11.136233 | 2.290708 | Existing stale optimizer manifest failure |
| Changed-file gate against f329b3d7a | 142.826122 | 29.444484 | Merge gate passes; known module-cache `Any` failure; 233 unit files not started; docs not reached |
| Separate generated-doc check | 2.282498 | 0.189955 | Pass |

Subtotal: 289.669289 CPU seconds. Subsequent executions must be appended before
claiming a complete block total. The meter reports aggregate reaped child
usage, including descendants; it is not a machine-wide resource limiter or a
qualified benchmark timer. Prior-block missing accounting remains missing.

### Distinguished-prime power connected to the resident collector

`prime_ideal_power.py` follows the positive `idealpowprime`, `idealsqrprime`
and prime `idealpow_aux` branches: first-power and square shortcuts, ramified
content, element powers, residue reduction, two-element HNF and content
restoration. The existing multiplication-table construction is extracted into
a shared source helper. `zk_scalar_or_multable`'s scalar-column recognition
is preserved before HNF, without changing the retained two-element result tag.

Mode 2 of `pari_collect_unreduced_ideals` constructs the distinguished ideal
power once, multiplies it by each visited prime, and passes its HNF and norm
through reduction, enumeration and relation admission in the same native
closure. Its descriptor and exponent are still supplied: the new connected
test uses `e0=2`, not upstream `logint0` selection. Factor-base preparation,
`L_jid` discovery, unported numerical/factorization paths and the whole class
group driver are still outside. This is not a completed `small_norm` port.

The expanded prime-power oracle checks 580 cases over 58 prime ideals in the
same four tuning fields, including 100 ramified and 30 inert cases. Exponents
are 1, 2, 3, 4, 7, 12, 31, 255, 256 and 511. All two-element outputs match
PARI/CPython/JS/GMP; 390 HNFs match and 190 explicitly reject the existing
word-modulus limit. These rejects are not successes. Fixed 1,024-word buffers
also hold metadata for large exponents; input-height assertions justify the
declared capacity without loosening compiler or HNF safety limits. The oracle
includes pinned upstream `base4.c` to expose its static routine, not a C
reimplementation. Trace:
`0b239079a72515d913cf9c97ee8b1c6ad1369c4c532cfcb68aeae7dd64521990`.

All 16 connected distinguished scenarios match relation/generator records,
counters and terminal state across PARI, CPython, JavaScript and GMP. CPython
instrumentation checks one power construction and one preparation per actually
visited ideal; upstream trivial-relation skips and terminal idempotence are
retained. A short residue-degree descriptor buffer now fails before mutation.
Trace: `9634c8078e5b442b0c6182f3028c77a57602829a5fcec53bf244fba3ef34e2eb`.
Original constructed-prime and supplied-HNF modes retain their prior
`517bae7177fcc6c56ee1a6c504e11669a7d189da3b73311dd9962e7eb1c13eeb` trace.

An independent read-only source review found no in-domain arithmetic defect;
its descriptor-validation and upper-exponent coverage recommendations were
implemented and checked. These are local correctness results, not qualified
timings or whole-engine parity. The earlier connected build before the final
descriptor guard emitted 24,541,528 core-C bytes and a 3,898,048-byte addon;
this size observation is not a fresh artifact pin for later source changes.

Additional conservative CPU ledger (seconds, including compilation):

| Execution | User | System | Outcome |
| --- | ---: | ---: | --- |
| Initial prime powers | 17.015336 | 1.192084 | 406 cases pass within stated limits |
| Formatter | 9.916654 | 0.560554 | Pass |
| Shared prime-HNF helper regression | 4.637964 | 0.611563 | 178 cases pass |
| First connected distinguished run | 102.084661 | 3.283211 | Pass; precedes scalar-column review fix |
| Formatter | 9.891866 | 0.543401 | Pass |
| Prime powers after scalar recognition | 17.562151 | 1.348090 | Pass |
| Connected with one-power instrumentation | 102.864648 | 3.341205 | Pass |
| Constructed-prime old mode | 32.833193 | 2.038133 | Pass |
| Prime-power invalid-exponent guards | 6.232166 | 0.941967 | Pass |
| Supplied-HNF old mode | 32.465909 | 1.788212 | Pass |
| Strict Python | 75.711609 | 3.176388 | Pass |
| Expanded boundary exponents | 7.112425 | 0.855876 | 580 cases within stated limits |
| Connected with descriptor guard | 101.282520 | 3.382847 | Pass |
| Changed-file gate against de4164d04 | 140.311763 | 27.826874 | Merge gate passes; known module-cache `Any` failure; 233 unit files not started |
| Architecture | 10.794052 | 2.316982 | Known stale optimizer manifest failure |
| Separate generated-doc check | 2.204257 | 0.196330 | Pass |

Combined continuation subtotal through these runs: 1,015.994180 CPU seconds.
Later qualification/setup runs must be added to this subtotal.

### Connected timing harness smoke check

`measure_collector_core.cjs --unreduced --small-norm --distinguished
--prepare-only` builds a standalone generated-core adapter and a pinned-source
PARI control. Both clocks include the distinguished power and two-visit
collection, excluding input preparation and fresh-state reset. Three warmups
are excluded. The emitted manifest hashes fixtures, core, module and binaries;
`check_small_norm_timing.cjs MANIFEST` checks all 16 output states in PARI,
standalone core, JavaScript and packed native execution. PARI's additional
`repetitions` output is checked as timing metadata, not mathematical state.

The smoke check passes. It is not a paired, quiet-host benchmark, and its short
samples cannot qualify a performance ratio. CPython timing and longer paired
samples remain to be implemented. The full class-group path remains absent.
`compileSeconds` measures standalone-core compilation only, not all setup;
the CPU meter charges the complete setup including compilation.

| Additional execution | User CPU | System CPU | Outcome |
| --- | ---: | ---: | --- |
| Prepare connected timing adapters | 59.854111 | 2.367977 | Pass |
| Initial ad hoc smoke | 0.604476 | 0.453344 | Harness rejected extra PARI timing metadata |
| Reusable four-backend smoke | 6.771462 | 0.966594 | All 16 cases pass |

Continuation subtotal: **1,087.012144 CPU seconds**. The prepared fixture cases
hash is `e27012f7e9ef90b5d3ca0bb2f1ef6cf64bfaa6363bc7f625328ae723bdd3d174`;
generated core hash is
`f1411502c80a1ea29505fec7270555e9e3aa0f55ad93c82181a0fc419dd4266d`.

The follow-up CPython driver uses the same fresh inputs, three warmups and
entry-only clock, and checks every output outside timing. It preloads stdlib
`decimal` before adding the Sage.js library path: otherwise CPython 3.14's
large-integer conversion sees the Sage.js module of that name. This was a
harness import failure, not an arithmetic mismatch. All five smoke paths now
agree (including standalone and packed native as distinct boundaries).

| Follow-up execution | User CPU | System CPU | Outcome |
| --- | ---: | ---: | --- |
| Initial CPython timing smoke | 0.664278 | 0.522807 | Stdlib module shadowing failure |
| Five-path smoke after preload | 7.344026 | 0.971959 | Pass |
| Ten-repetition pilot | 3.449787 | 0.537735 | Pass; pilot timings discarded |

Subtotal before longer paired execution: **1,100.502736 CPU seconds**.
The pilot selected a fixed 640 repetitions for three alternating rounds of
PARI / standalone native core / CPython on CPU 15. A one-second preflight
observed about 99% idle there; it is not an exclusive-host reservation.
`pair_small_norm.cjs` records CPU counters and load before/after each process,
enforces 4 GiB address space and 600 CPU seconds per process, and preserves
short samples without changing repetition counts. This measures only the
declared two-visit segment, not `bnfinit` or the complete frozen panel.

The three rounds completed with exact output agreement. Each aggregate sample
exceeded one second; no repetition count was changed after the pilot. CPU 15
counters show no steal or I/O-wait ticks during any process. The shared host
was not exclusively reserved, so these are reproducible local segment timings,
not a cross-host qualification or pure-language causal claim.

| Round | PARI entry seconds | Generated core | CPython | Core / PARI |
| --- | ---: | ---: | ---: | ---: |
| 0 | 1.209833 | 36.697930 | 47.468638 | 30.33 |
| 1, reverse order | 1.189375 | 36.790655 | 47.257486 | 30.93 |
| 2 | 1.194466 | 36.967642 | 47.363665 | 30.95 |

Each entry total covers 640 fresh repetitions of all 16 scenarios. These are
not seconds-scale number fields: repetition makes a tiny segment measurable.
Full process wall times were 1.22–1.25 seconds for PARI, 59.64–61.00 for the
core, and 89.92–90.68 for CPython. Input conversion, fresh buffer resets and
output checks account for boundary work excluded from entry clocks. Generated
JavaScript and packed-host execution have smoke checks, not paired timings.

Raw counters, per-case times, host metadata and artifact hashes are retained in
`bench/pari-class-group-port/paired-small-norm-640.json` (about 64 KiB). Its
temporary paths identify this run; regenerate adapters for reproduction:

```sh
node bench/pari-class-group-port/pair_small_norm.cjs MANIFEST CPU 640 3 NEW_OUTPUT
```

The paired run charged 455.385842 user + 0.820177 system CPU seconds. Subsequent
formatting charged 9.901293 + 0.488353 seconds and changed no files. Updated
continuation total: **1,567.098401 CPU seconds**.

The generated core is only about 1.29 times faster than CPython here. The next
diagnostic should quantify packed-buffer import/export, whole-slot zeroing,
temporary initialization and exact-to-machine index conversion before adding
more driver code. This does not establish that any one of them explains the
30-times gap; retained arithmetic-backend substitutions still confound a pure
compiler comparison. The complete class-group objective remains unimplemented.

### Profile and rejected slot-clearing hypothesis

The connected `--profile` run covers 100 repetitions plus three warmups for
each of 16 cases (1,648 collector calls), with matching output states. It
records 19,558,464 packed GMP reads, 8,002,894 writes and 32,007,971
`mpz_to_int64` calls. Sampled self-time includes GMP set (12.06%), add (8.99%),
limb copy (8.33%), size-in-base (6.58%) and export (4.82%). These samples are
diagnostic, not a causal allocation of the PARI gap: profiling changes timing,
dynamic-library calls lack complete call-graph attribution, and setup is also
present in the process. Profile SHA-256:
`59c389cd2ced38f846bdf1af09a7e1846794813e55a01605af0e489332ceb326`.
The checked-in `connected-small-norm-gprof.txt` removes trailing spaces from
two header lines; the hash above identifies the raw profiler output.

`probe_buffer_clear.cjs MANIFEST CPU` copies the pinned generated core and
removes only the full-slot `memset` from its GMP buffer writer. It does not
change mathematical code or the production compiler. The existing int64
writer already documents spare limbs as unspecified; signed sizes govern
reads. This makes the change a representation control, but not a replacement
for compiler-wide regression tests. The adapter checks exact collector outputs.

Three alternating 64-repetition comparisons gave baseline/variant entry times:
3.7369/3.6983, 3.6912/3.6954, and 3.7097/3.7118 seconds. All outputs match.
**There is no consistent improvement.** Do not promote this into a claimed
performance fix or use it to explain the 30-times gap. Raw small evidence is in
`bench/pari-class-group-port/buffer-clear-evidence.json`.

The higher-value next target is word-oriented real arithmetic and its generated
representation: the profile includes 759,110 short products and 394,799 positive
real sums, whose Python bodies perform word extraction and metadata arithmetic
using exact integers. Measure an identical-operand leaf against upstream, then
inspect its generated code before selecting a compiler or representation fix.

The profile charged 70.857683 user + 2.869708 system CPU seconds; the slot-clear
control (including compilation) charged 67.555866 + 3.160458. Continuation total
is now **1,711.542116 CPU seconds**. The full objective and limits are unchanged.

### Short-product leaf and an exact-mask compiler obstruction

`measure_short_product.cjs` reuses the existing 228 PARI multiplication
fixtures. All cases are checked; only the first 32 prepared-embedding cases
are timed, each repeated 1,000 times. PARI reconstructs the same signed
mantissas, precisions and exponents before timing. The generated core accepts
those exact integers directly. Conversion and output checking are excluded;
PARI stack reset and native temporary ownership remain in their entry costs.
These deliberately short leaf diagnostics have no warmups and do not meet the
one-second qualification threshold.

The baseline native totals are 0.1246–0.1260 seconds, versus PARI
0.00082–0.00086 seconds. The gap is substantial even without buffer ingress,
but this is still a representation comparison: Python expresses PARI limb
products/carries using arbitrary-precision integers.

Replacing word extraction modulo `2**64` with `& ((1 << 64) - 1)` preserves
the exact selected bits and per-term truncation order. CPython passed all 228
cases, but the compiler rejected exact-integer `&` as uint64-only. The compiler
prerequisite now implements exact `&` and `&=` in GMP, JavaScript, tagged and
machine-word execution, preserving existing uint64 operations. Focused tests
cover negative/infinite-two's-complement behavior, large masks, mixed operand
order and aliasing. Independent source review identified this narrow omission
and separately flagged redundant boxing of machine shift counts.

With the new compiler, all 228 multiplication cases match in CPython,
JavaScript and native execution. Native diagnostic totals become
0.0995–0.1100 seconds. This is encouraging but not a qualified before/after
claim; the two runs have distinct compiler pins and short samples. Raw reports
are `short-product-cost-baseline.json` and `short-product-cost-mask.json` in the
benchmark directory. The complete collector needs regression and remeasurement
after integrating this compiler prerequisite.

| Additional execution | User CPU | System CPU | Outcome |
| --- | ---: | ---: | --- |
| Baseline leaf diagnostic | 7.059579 | 0.529213 | 228 cases pass |
| Initial mask compile | 1.024671 | 0.196990 | Exact AND rejected; CPython passes |
| Initial compiler mask/shift tests | 2.412100 | 0.641612 | Pass |
| Client with new compiler | 8.950524 | 0.607276 | 228 cases pass |
| Mask leaf diagnostic | 6.954267 | 0.506823 | Pass |
| Expanded automatic-dispatch tests | 2.445807 | 0.664968 | Pass |
| Compiler architecture gate | 10.819680 | 2.398425 | Known stale optimizer manifest failure |

The compiler changed-file gate passed merge checks, compiler convergence and
module precompilation, then failed at installed-adapter reconciliation because
the compiler worktree lacks FFLAS `libgivaro.a`. Later gates were not reached.
That run charged 472.673766 user + 9.260700 system CPU seconds.
The post-build compiler test receipt passed (2.411303 user + 0.677185 system
CPU seconds). Formatting changed no files (10.272381 + 0.502711 seconds).
Subtotal: **2,252.552097 CPU seconds**; later gate runs remain to be added.

Compiler prerequisite `d1e398266f63237b6a2ce27d96b9e7556f0178cf` is integrated
by merge `8e05ea9c3`. The port task's dependency baseline is advanced to that
compiler commit, not to the port merge: all mathematical experiment changes
remain visible against their claims. The first claim check after merging
reported the newly inherited compiler files until this baseline was updated.

The integrated collector passes all 16 scenarios with the unchanged trace
`9634c8078e5b442b0c6182f3028c77a57602829a5fcec53bf244fba3ef34e2eb`.
Strict Python also passes (403 modules, 977 formatted files, zero errors).
The new native core hash is
`00f16cca79fd37f5323b5fd9eecaba3240a1f3d5b042e652c821ff85bff98be6`.

`compare_small_norm_cores.cjs OLD_MANIFEST NEW_MANIFEST CPU NEW_OUTPUT`
checks identical input/fixture hashes and compares 64 fresh repetitions per
scenario in three alternating rounds. Baseline/mask entry seconds are
3.7186/3.7395, 3.7556/3.6976, and 3.7086/3.6888. All outputs match and all
aggregate samples exceed one second. **There is no material connected speedup
established here**; the small changes are within about 1.6%. Retain the
compiler feature for correct ordinary Python support, not as a claim to have
closed the collector gap. Raw evidence is `small-norm-mask-comparison.json`.

| Integrated execution | User CPU | System CPU | Outcome |
| --- | ---: | ---: | --- |
| Connected collector | 103.632430 | 3.137575 | Unchanged trace |
| Strict Python | 80.554735 | 3.190818 | Pass |
| New timing adapters | 62.221548 | 2.491336 | Pass |
| Local native before/after | 40.408600 | 2.707019 | Equal outputs; no material speedup |

Continuation total: **2,550.896158 CPU seconds**. The next profile should
distinguish actual operand sizes and zero/short branches from aggregate call
counts, and test the demonstrated machine-shift-count boxing independently.

### Machine shift counts and observed real operands

Compiler prerequisite `281edb0d8223a37252e0bcf9a077571fe5faf62c` preserves
unsigned machine counts in exact shift IR. GMP no longer boxes such counts
only to decode them; tagged execution keeps its small-count path. Focused
tests retain signed-floor right shifts, huge-count saturation, augmented
assignment and the existing allocation limit. All 228 leaf oracle cases pass.
Short leaf timings (0.0998–0.1010 seconds) are essentially unchanged from the
mask-only version; this is not a workload speedup claim.

The prerequisite is merged by `5fc538933`, and the task baseline follows that
compiler commit. The integrated 16-scenario regression passes with the same
`9634c8078e5b442b0c6182f3028c77a57602829a5fcec53bf244fba3ef34e2eb` trace.

`profile_real_operands.py MANIFEST [NEW_OUTPUT]` uses CPython's profiling hook
to observe same-source calls while the existing driver checks every output.
It counts 64 collector calls (16 scenarios, three warmups plus one each), not
timings. `real-operand-profile.json` records 29,480 short products, 7,848 squares,
15,332 positive sums and 24,340 signed sums. Scaling by 103/4 recovers the
earlier 100-plus-three-warmup native profile call counts exactly.

Among short products, only 208 have a zero operand. Equal 64-, 128-, and
256-bit pairs contribute 9,464, 7,640 and 8,216 calls respectively; equal
192-bit pairs contribute 1,096. Therefore zero shortcuts do not explain away
the arithmetic cost, and the next diagnostic should sample this actual size
mix. Do not equate the earlier prepared-product timing with the full live mix.

| Additional execution | User CPU | System CPU | Outcome |
| --- | ---: | ---: | --- |
| Initial typed-shift tests | 2.682137 | 0.690309 | Pass |
| Leaf with typed counts | 14.898362 | 0.952499 | 228 cases pass |
| Compiler test receipt | 2.716959 | 0.672833 | Pass |
| Architecture | 11.115048 | 2.402445 | Known stale manifest failure |
| Initial operand profile | 0.983435 | 0.030013 | Pass |
| Archived operand profile | 0.970988 | 0.040999 | Pass |
| Integrated collector | 102.855973 | 3.185746 | Unchanged trace |
| Formatter | 10.042712 | 0.488288 | One new diagnostic formatted |

Continuation total: **2,705.624904 CPU seconds**. Broader build limitations
remain as documented; no full class-group result or performance parity is
established. The raw leaf result is `short-product-cost-word-count.json`.

## Bounded checkpoint assessment: the full objective is not achieved

Audit of implementation commit `6bb89f177` against the original experiment:

| Requirement | Current authoritative evidence / gap |
| --- | --- |
| Pinned PARI 2.17.4, attribution, upstream-assumed mathematics | Archive and pristine `buch2.c` hashes reverified; translated modules carry source correspondence and PARI/GPL notices. Instrumented fixture builds remain separately identified. |
| Prepared `nf` through computed class invariants | **Not implemented.** There is no translated `Buchall_param`/`bnfinit` driver or class-group result. Metadata in the panel is not a computed answer. |
| Substantial connected source-transparent segment | Prime descriptors and the prepared field table through HNF construction, rank/LLL, embeddings/QR, enumeration, norm/valuation/admission and resident relation caches work in the declared `j0 = 0` subset. |
| Internal discovery from the planned preparation boundary | Incomplete: catalogs, prime decomposition, schedule/factor-base state and analytic constants still enter at explicit prepared boundaries. New HNF/product/power segments are not all connected to the collector. |
| Both target degrees and the full frozen panel | The connected collector has 16 scenarios over four tuning fields, not 16 distinct fields. The 24-field panel and 16/8 split are unchanged; complex/quintic transfer and reserve checks remain unperformed. Historical seconds-scale metadata is not a current expensive-workload baseline. |
| Matched work and qualified performance | Exact traces and local branch/counter checks exist. No full-engine work trace, qualified three-pair/one-second timing panel, or demonstrated 2x target exists. The earlier short collector diagnostics show substantial cost gaps, not parity. |
| Portable source and reviewed delivery | CPython/JS/Linux GMP focused tests pass for the reported subsets. Windows/Wasm performance is unqualified. Broader gates still fail; PRs 282 and 283 remain draft, not review-ready. |

The longest connected collector was rerun during this audit and all 16
distinct two-visit, prime-construction scenarios still pass with trace
`517bae7177fcc6c56ee1a6c504e11669a7d189da3b73311dd9962e7eb1c13eeb`.
The command is the constructed-prime check documented below. A Python
`resource.getrusage(RUSAGE_CHILDREN)` wrapper records 27.066 wall seconds,
29.897240 user plus 1.594625 system CPU seconds, and 559,992 KiB peak child RSS.
Charge all 31.491865 child CPU seconds conservatively, including compilation;
this is validation accounting, not a qualified timing sample.

The current executable boundary explicitly rejects distinguished-ideal
construction when `jid0 != 0` or `e0 != 0`. Completing that connection requires
the outer element-power content/type handling and `idealpowprime` branches;
the new binary arithmetic kernel alone does not do it. Other remaining gaps
include general factorization tails, unresolved rank/LLL and precision paths,
automorphism images, random relation generation, coupled relation linear
algebra, regulator/precision/stopping logic, and final class-group output.
These are substantial missing algorithms and integration, not merely packaging.

The experiment answers **part** of the feasibility question: sizeable faithful
segments can be expressed in ordinary Python and compiled to closed native
computations, and concrete compiler/representation costs can be isolated.
It does **not** establish that the current language/runtime matches PARI's
cost. Conversion, copying and arithmetic representation are demonstrated
diagnostic targets; tagged storage was not a general win in the measured
probes. Backend substitutions such as Euclidean multiword Bézout must remain
separate from any language-only conclusion. Completing the driver and doing
work-matched measurements are both still necessary.

At this audit, goal accounting reports 56,109 root active seconds, plus the
previously disclosed approximately 12 subagent minutes: about 15.79 aggregate
hours against the 16-hour limit. There is no automatic extension. The frozen
panel SHA-256 remains
`7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5`.
The 152 tracked experiment/report files occupy 1,010,598 bytes before this
audit text; that count excludes reproducible caches and is not a census of
all temporary storage. Historical CPU-accounting gaps remain disclosed and
cannot be treated as zero or as proof of cumulative budget compliance.

Recommended next authorized block: eight additional aggregate active-agent
hours, focused on finishing the distinguished-ideal small-relation path and
obtaining one qualified work-matched connected-segment comparison before
further micro-optimization. Keep the full class-group objective, frozen panel,
source-fidelity rules and safety limits unchanged. This is a proposal, **not
authorization or a claim that eight hours will finish the whole engine**.
Any continuation needs an explicit resource decision; CPU work must be metered
from the outset without erasing the earlier accounting gap.

## Integer-basis arithmetic and binary element powers

`integral_field_arithmetic.py` translates `base3.c:_mulii, nfmuli_ZC,
nfsqri_ZC` and connects them through the `bb_group.c:gen_powu_i` left-right
binary branch for positive exponents below 512. It retains coefficient order,
zero/plus-or-minus-one shortcuts, triangular squaring, and the distinction
between an absent partial sum and a present sum whose value happens to be zero.
The `bb_group.c` source/archive SHA-256 is
`30ceda3cedce14d61e646021fe7c59e057beb8694002ee09b8532eaa32ea27c3`.

```sh
node bench/pari-class-group-port/check_integral_field_arithmetic.cjs PARI_DIRECTORY PARI_ARCHIVE
```

The check covers 96 vector pairs (24 on each of the same four tuning fields),
192 products/squares and 288 powers at exponents 1, 2, 3, 7, 31 and 511.
PARI, CPython, generated JS and native GMP agree on coordinates, untouched
inputs and output canaries. The powering control calls PARI's actual
`gen_powu_i` with counting wrappers around its field arithmetic, independently
checks its answer against `nfpow`, and compares both operation counts and the
base-four square/multiply trace with the translation. This is a connected
arithmetic segment, not the outer `nfpow` content/scalar/denominator wrapper
or prime-ideal powering. Negative exponents, zero and the sliding-window
branch reject explicitly; invalid-domain guards are checked before mutation.

Storage differences remain explicit: a bounded bit scan replaces C's leading
zero/word-normalization operations, and packed scratch/output copies replace
GEN aliases and freshly allocated columns. No equal-cost claim follows from
matching arithmetic operations. The original eight-word array-adapter scratch
failed on exponent-511 growth. That failure is retained as a test in both JS
and GMP. Successful tests allocate a fixed 1,024 words per output/scratch
entry through the existing packed-buffer API, without changing its checks or
any global limit. This is at most 80 KiB of limb storage per power invocation.
It is not sized from the oracle answer: the test asserts input height below
2^8 and table height below 2^64, so for degree at most four,
`H(x^e) <= H(x)^e * (n*n*H(table))^(e-1)` remains below 65,536 bits for
`e <= 511`. Multiword product/square controls additionally shift inputs by
96 and 192 bits, but those larger inputs are not included in the power panel.

Current trace SHA-256:
`8749c17f12dfed362a903b91a0433c4a3117e4b8e6d9760b7c10e70150f8a0e7`.
The generated arithmetic/power core is 803,555 C bytes. No qualified timing,
new field coverage or complete class-group output is claimed.

Strict Python passes (403 modules; 973 formatted files). The change-set gate
against `aae3870b9`, with the explicit FLINT prefix, passes merge invariants
and then stops at the existing `test/module-cache.cjs` undefined-`Any`
initialization failure; later units and docs are not qualified. Architecture
validation again stops at the stale optimizer manifest. No safety limit,
production dispatch or PR draft status is changed.

## Integral product content and scalar-generator update

`pari_integral_ideal_mul_two` completes the integral matrix/prime product
wrapper around the previous matrix-generator HNF kernel. It follows
`base4.c:idealmul_aux`'s `id_PRIME`/matrix branch: remove rational content
(integral inputs here), apply `idealHNF_mul_two`, and restore content. An
explicit scalar-generator tag selects the upstream gcd shortcut without
constructing an HNF matrix. Prepared generator multiplication tables or scalar
tags remain outer inputs; prime powering and descriptor-to-product integration
are not supplied by this wrapper.

The content recurrence follows `polarit2.c:Q_content_safe/Q_content_v`'s
reverse-column, reverse-entry order. The pinned file SHA-256 is
`fe797d71a778939e24989d174be23e37b4fad2d0e37a24ad472c84bb96473c2a`.
The packed-storage implementation copies a content-one input to its explicit
primitive workspace where PARI can reuse the original object; this is a
representation difference, not an assertion of equal copying cost. Division
by one and final multiplication by one are avoided.

```sh
node bench/pari-class-group-port/check_integral_ideal_product.cjs PARI_DIRECTORY PARI_ARCHIVE
```

All 192 cases match pinned PARI, CPython, JS and GMP: 48 matrix-generator
products and 144 scalar-generator controls, using the same four tuning fields,
powers 1..4 prepared by PARI and scales 1, 2 and 6. Scalar controls use 0, -3
and 1 with first generator 3. They test the two-element shortcut, not 144
additional prime descriptors. Tests check primitive matrices, removed content,
unchanged inputs, product generator matrices and final HNF. Scalar cases pass
empty matrix scratch buffers, checking that the shortcut actually bypasses
the matrix machinery. Invalid tags and zero-ideal inputs reject before output
or primitive workspace mutation in all three translated backends.
Trace SHA-256:
`785a999cfa19ce4272562c7dab935c15b41f2b7babd31385790a8d03093fc793`.
The enlarged combined product/HNF closure has 2,772,708 generated C bytes.
This is correctness/dependency evidence, not qualified timing or class-group
output; the preceding multiword arithmetic substitution remains in force.

Strict Python passes (403 modules). The change-set gate against `3dff64d2a`
passes merge invariants but stops in units at the known undefined `Any` in
`RealNumberBuffer` initialization (`test/module-cache.cjs`); 233 remaining
files are not scheduled and docs are not reached. An initial invocation
without `SAGEJS_FLINT_PREFIX` instead stopped at missing `flint/nmod_mat.h`.
The GF(2) test passes all five checks with the declared prefix; the corrected
change-set invocation exposes the separate `Any` failure above. Architecture
validation still stops at the stale optimizer manifest. The previous full
build remains valid evidence for its recorded revision, not a passing claim
for these unrun suites. Both PRs remain draft.

## Multiword Bézout dependency update

The 50 composite-HNF rejections described in the previous checkpoint below
are now removed: all **208** original cases agree with PARI in CPython,
generated JavaScript and GMP native execution. The original oracle trace
hash is unchanged. This still includes only 16 actual ideal products across
the same four tuning fields; no additional fields or complete class groups
are claimed.

`hnf_bezout.py` retains the literal word-sized PARI path and adapts signed,
ordered multiword arguments to ordinary extended Euclid. The recurrence is
the one already used by Sage.js's `_cubic_extended_gcd`, written locally
because importing the cubic module in CPython pulls in unavailable FFI runtime
modules. The failed direct-import attempt is retained here as a dependency
finding, not worked around by injecting a fake runtime.

**This is an explicit arithmetic-backend substitution for GMP `mpn_gcdext`,
not a translation of that optimized primitive or a language-only cost claim.**
The HNF algorithm, column order and reductions are unchanged. Exact Bézout
coefficient agreement is tested, not inferred from the gcd identity alone.
The extended arithmetic check covers 2,363 cases, including signed 65-, 128-,
256- and 1,024-bit operands, zeros, equal/divisible operands and Fibonacci
neighbors. It preserves all 1,177 original word/inverse-generator controls.
Its output SHA-256 is
`c70f3ad40c73d7877fc39307f2e4895e80e49e8f398750c124a3a76f09533cf5`.

```sh
node bench/pari-class-group-port/check_hnf_word_arithmetic.cjs PARI_DIRECTORY PARI_ARCHIVE --multiword
node bench/pari-class-group-port/check_composite_ideal_hnf.cjs PARI_DIRECTORY PARI_ARCHIVE
```

The generated HNF/product core is 2,498,153 C bytes, up from 2,381,810;
no source/resource allowance is changed. No qualified timing has been run
for this arithmetic substitution. Word-sized modulus and shape limits remain.
Prime powering, content handling and the distinguished-ideal collector
connection are still incomplete, as are the subsequent full-engine stages.

Validation: strict Python passes (403 modules; 972 formatted files). The
changed-file gate passes merge invariants and a full build in 7m31s, then stops
at the known stale optimizer manifest in architecture validation. Unit,
compiler, integration, docs and CLI stages are not reached by this invocation.
Optional FLINT production kernels and Wasm numerical reactors are explicitly
skipped by the build, not qualified. Both PRs remain draft.

## Composite-modulus HNF and two-element ideal products: prior checkpoint

`composite_ideal_hnf.py` translates the scalar-modulus `hnf_MODID` branch of
`hnf_snf.c:ZM_hnfmodall_i`, including its moving pivot, inserted columns,
`optimal_D`, diagonal accumulator and final integer reductions. It also
connects `base4.c:idealHNF_mul_two`'s matrix-generator branch: form
`alpha * I | a * I`, then reduce modulo `a * I[0,0]`. Original ideal and alpha
multiplication table are supplied; the product HNF is computed, not supplied.
Scalar-alpha handling, prime powering, outer content removal and the
distinguished-ideal collector connection are still dependencies.

The prototype handles 3/4 rows, 1..2*n columns and positive moduli below 2^64.
It fails explicitly if a Bézout pivot needs more than one word. This can occur
even with a word modulus, so this is not a complete word-modulus HNF API.
It does not replace that dependency with another HNF algorithm.

```sh
node bench/pari-class-group-port/check_hnf_word_arithmetic.cjs PARI_DIRECTORY PARI_ARCHIVE
node bench/pari-class-group-port/check_composite_ideal_hnf.cjs PARI_DIRECTORY PARI_ARCHIVE
```

The word arithmetic check matches 1,177 exact PARI/CPython/JS/GMP choices,
including signs, equal/zero operands, word boundaries and noninvertible
composite pivots. It ports the word Bézout recurrence and `Fp_invgen`'s
word branch, including the unit correction. A fidelity regression matters:
`Fp_invgen(12,18)` returns gcd 6 and multiplier 11, not the equivalent
multiplier 5 from a canonical CRT rewrite. Preserve `Fl_sub`/`Fl_add`'s
single corrections and unsigned wrap, even when the intermediate is not
canonical modulo the smaller CRT modulus. Exact Python reductions modulo
2^64 express wrap; an initial `& mask` expression exposed mixed uint64/exact
typing rejection in the native compiler. No compiler semantics were weakened.
Arithmetic trace SHA-256:
`0a0c8b2837185fe7b79780c8c4eb00da2cfc787f00eaa1cf262fa1593661fa51`.

Of 208 HNF cases, 158 match exactly in all three translated backends and 50
explicitly reject the unported multiword Bézout dependency. These counts are
asserted, not inferred as acceptable from whichever cases happen to pass.
All 16 actual ideal products (four tuning fields, powers 1..4 of the first
prime over 2, multiplied by the first prime over 3) pass, including construction
of the rectangular generator matrix. PARI constructs the ideal powers outside
the translated boundary. The other controls include deficient rank, inserted
pivots, modulus one, negative entries, large moduli and multiword inputs.
Unsupported paths leave the result buffer unpublished; input matrices remain
unchanged. HNF trace SHA-256:
`4e3c86bf7e9ee030a0da79951fc3f65910aa6560372ef7d32bc7a0e89ee914f6`.
These are final-state and arithmetic-choice comparisons, not a full internal
branch trace, timing qualification, or complete class-group output.
The combined HNF/product closure has seven IR functions, 2,381,810 generated
C bytes and a 596,576-byte Linux addon. Strict baselib checks pass (403 modules,
971 formatted Python files). The changed-file gate passes merge invariants,
then stops at the existing `test/module-cache.cjs` undefined-`Any` failure;
remaining units and docs are not qualified by that run. Architecture checks
again stop at the stale optimizer manifest. These failures and the 50
unsupported mathematical paths remain visible; neither PR is review-ready.

## Prime descriptors through resident collection

`unreduced_small_norm.py` now has an explicit prime-construction mode for
`small_norm`'s `j0 = 0` branch. Before each visit it builds `pr_hnf` from the
prepared field basis table and prime generator, and computes `pr_norm = p^f`.
Rank, LLL, embeddings, QR, enumeration, admission and cache updates remain
inside the same compiled closure. The supplied-HNF mode is retained as an
explicit test/scaffolding boundary, not an automatic alternate algorithm.
Distinguished-ideal powers/products are rejected in construction mode until
ported; they are not silently replaced by unmultiplied prime ideals.

```sh
node bench/pari-class-group-port/check_prepared_small_norm.cjs PARI_DIRECTORY PARI_ARCHIVE --unreduced --distinct --construct-primes
```

The constructed-mode test supplies empty HNF and norm packets. It joins
prime-descriptor fixtures to the existing four-field collector fixtures and
checks that their oracle HNFs agree outside execution. The translated call
receives only descriptors/table, never those oracle HNFs. This remains an
explicit supplied schedule and factor base, not the complete prepared-`nf`
class-group engine. The selected prime above 3 in one quartic has residue
degree two; the other selected prime norms have residue degree one.
The initial connected run passes all 16 distinct-ideal scenarios in PARI,
CPython, generated JS and GMP with the unchanged relation trace
`517bae7177fcc6c56ee1a6c504e11669a7d189da3b73311dd9962e7eb1c13eeb`.
The generated closure has 128 IR functions, occupies 19,555,592 C bytes and its Linux addon
3,295,936 bytes; this is not a timing or RSS result.
The new guard test rejects distinguished-ideal construction before changing
any resident buffer, in CPython, JS and GMP.

The current changed-file gate selects merge invariants and docs checks; both
pass, including a full eight-stage build in 7m22s. Five optional native addons
are absent; the production native pack and numerical Wasm reactors are
explicitly skipped, not qualified. Strict baselib checks pass (403 modules).
Architecture checks still stop at the stale optimizer manifest. Initial
focused receipt attempts overlapped the rebuild and failed on missing or
partially regenerated compiler files; those failures remain in the ledger.
After the build terminates, all three focused modes pass: distinct constructed
primes (16 scenarios), distinct supplied HNFs (16, including sticky preparation
failures), and repeated constructed primes (16). The repeated-prime trace
remains `c7584ba55c17364224aecd400d70bdb45e7e9d87c173efcd6196d91e95f6cd38`.
These share four tuning fields, not 48 distinct fields. The current changed-file
gate does not run the full unit suite, so it does not supersede the earlier
unit failure recorded below.

A demonstrated compiler obstruction is dynamic integer exponentiation:
`prime ** residue_degree` fails lowering because exponents must currently be
constants from 0 through 64. This degree-three/four prototype uses explicit
constant powers for residue degrees 1 through 4 and rejects invalid degrees.
This preserves `pr_norm` but substitutes exact backend powering for PARI's
word-power fast path (`trans1.c:powiu_sign`); equal arithmetic cost is not
claimed. General variable-exponent native support remains a compiler item,
not a reason to alter the mathematical bound or supply a precomputed norm.

The next construction frontier is `base4.c:idealpows -> idealpow ->
idealpowprime` for the distinguished prime, then `idealmul_aux ->
idealHNF_mul_two` for its product with each selected prime. The latter forms
the columns of `alpha * I` and `p * I`, followed by `ZM_hnfmodid` with modulus
`p * I[0,0]`. That modulus need not be prime: reusing `ZM_hnfmodprime` here
would not implement the upstream operation. Prime-power special cases,
content factors and field-element powering are also part of this dependency,
not permission to replace it by a fixed number of prime-ideal visits.

## Prime-ideal construction dependency

`prime_ideal_hnf.py` translates `base4.c:pr_hnf`, the integral multiplication
table path in `base3.c:zk_multable/zk_ei_mul`, and
`hnf_snf.c:ZM_hnfmodprime/FpM_echelon/FpM_hnfend`. The basis multiplication
table and prime descriptor come from prepared field/prime decomposition
scaffolding, not a supplied ideal HNF. Row-major workspaces replace GEN column
pointers. The backward pivot choice, normalization and final integer column
reductions retain upstream order. Modular rank is an extra diagnostic output.
This entry currently supports square degree-three/four matrices and primes
below 2^64; it does not claim the arbitrary-prime general PARI interface.

```sh
node bench/pari-class-group-port/check_prime_ideal_hnf.cjs PARI_DIRECTORY PARI_ARCHIVE
```

The pinned-source oracle agrees with CPython, generated JS and GMP on 120
synthetic matrices plus 58 prime ideals above 2 through 19 in the four tuning
fields. Controls include zero/full/deficient rank, negative and multiword
entries, characteristic two and the prime 2^64-59. Actual ideals also check
the constructed multiplication matrix, inert handling and unchanged input
buffers. Trace SHA-256:
`c946fd7b6a4481133c65937ff9d8eee794524b7c6759d23e434b6e05a90a256d`.
No timing qualification is claimed. The test pins all three upstream source
files against the archive and local build source. At this initial checkpoint,
the construction entry was not yet wired into the multi-ideal collector (the
later connection is recorded above); distinguished-ideal
powers/products, prime decomposition and the full class/unit driver remain
dependencies. Existing whole-engine limitations are unchanged.
The generated core is 1,191,081 bytes and the Linux addon is 424,544 bytes;
core callback rejection is checked. These sizes are not peak-memory estimates.
Strict baselib validation passes (403 modules, 969 formatted Python files).
The changed-file gate passes merge invariants, then fails in
`test/module-cache.cjs` with `$ρσ$py$Any is not defined` while initializing
`RealNumberBuffer`; remaining unit tests and docs checks are not qualified.
Architecture validation stops at the same stale optimizer manifest recorded
below. No unrelated manifest or generated module was changed to hide a failure.

## Multiple original ideals through one resident collector

`unreduced_small_norm.py` connects the existing reverse ideal schedule to the
unreduced-ideal collector. Each packet now supplies only its original ideal
HNF and norm: rank, LLL transformation, reduced embeddings, final QR and
enumeration preparation are computed inside the same native closure for each
visit. Relations, generators, factor-list state and aggregate small/factored
counters survive between visits. Per-ideal preparation and cursor state reset
only when the scheduler selects another ideal. An unsupported preparation
stops the schedule with its sticky dependency status; it is not skipped.

This section describes the supplied-HNF mode, **not full `small_norm` or `bnfinit`**.
Prime-ideal HNF construction is outside this mode (the constructed-prime mode
above removes that dependency). Distinguished-ideal products/norms, construction
of `L_jid`, automorphism images and the outer class/unit driver remain outside
both modes. The two-visit control deliberately supplies its schedule rather
than claiming it is PARI's complete factor-base traversal. No new timing or
seconds-scale coverage is claimed.

```sh
node bench/pari-class-group-port/check_prepared_small_norm.cjs PARI_DIRECTORY PARI_ARCHIVE --unreduced
node bench/pari-class-group-port/check_prepared_small_norm.cjs PARI_DIRECTORY PARI_ARCHIVE --unreduced --distinct
```

Both modes pass 16 scenarios across the same four tuning fields in CPython,
generated JS and GMP native. One repeats the same ideal; the other visits the
first prime ideals over 2 and 3. The C control retains pristine PARI 2.17.4
`Fincke_Pohst_ideal` preparation for each visit. Comparisons cover published
relation bases/records/hashes/exact generators, accumulated `Nsmall`/`Nfact`,
factor-list length, quotas and final statuses. They require new relations after
the first visit on at least one scenario. CPython instrumentation checks one
final enumeration preparation per visited ideal. Zero and deliberately
unresolved-rank packets test sticky -11/-17 stops in all three backends;
terminal re-entry must leave every supplied buffer unchanged.
The distinct-ideal control also lets the first ideal publish a relation before
making the second original ideal zero. All three backends stop at -11 and
preserve the first ideal's relation basis, records and exact generators against
the single-ideal PARI reference; another call is inert.

Repeated-ideal trace SHA-256:
`c7584ba55c17364224aecd400d70bdb45e7e9d87c173efcd6196d91e95f6cd38`.
Distinct-ideal trace SHA-256:
`517bae7177fcc6c56ee1a6c504e11669a7d189da3b73311dd9962e7eb1c13eeb`.
Only signature-selected fields enter the translated test call; prepared
transformation/QR packets from older fixture formats are excluded.
The closure has 126 IR functions, 18,560,239 generated C bytes and a
3,185,344-byte Linux addon. No resource allowance or mathematical bound changed;
these are artifact sizes, not RSS or performance measurements.

The strict baselib gate passes (403 modules). Architecture checks reach the
existing stale optimizer manifest failure; the manifest was not refreshed.
The latest broad changed-file run's terminal output was lost with its process
handle, so it is not counted as a passing gate. Focused differential receipts
are retained separately. This prototype remains draft and is not release-ready.

## Representation probe: tagged arithmetic is not automatically faster

`probe_arithmetic_backends.cjs PARI_DIRECTORY FLINT_PREFIX` compares the exact
same translated short-product body in generated GMP and tagged C. Add
`--signed-addition` for signed real sums, `--precision-192` for records where
both operand precisions are 192 bits, and `--compiler-root=PATH` to test a
compiler prerequisite without merging it first. The generated-core adapter
also accepts `--core=PATH` instead of a compiler selection to inspect an
already generated core; every report includes its SHA-256. The adapter
preloads operands and validates the last result of every repeated
case against pinned PARI oracle records. It contains no arithmetic algorithm.
One warmup is discarded; three alternating pairs use 200 repetitions per
record. These short, unpinned diagnostics are **not qualified performance**.
Tagged arguments can be promoted by a callee without changing their values.
The current probe resets their representation outside every call timer and
reuses output storage; each call has its own timer. The initial measurements
in the next two paragraphs reused argument representation and are retained
only as historical diagnostics, not fresh-state comparisons.

With compiler 68fbe4029, all 228 products and 1,344 signed sums agree, but tagged
execution is slower: products take 209–212 ms versus GMP's 139 ms, and signed
sums 431–433 ms versus GMP's 264–266 ms. The three product records with both
precisions 192 also show no tagged advantage (1.47–1.50 ms versus 0.80–0.94 ms);
that small subset is not a representative collector workload. This changes the
next action: do not assume adding mixed Float64/tagged support will close the
collector gap.

Inspection found the tagged shift helper promoted even small read-only counts
to GMP. A compiler-lane candidate keeps those counts small and handles small
results directly, with unchanged Python semantics and allocation caps. The
same product/sum probe then passes with tagged totals 193–195 ms / 383 ms,
still slower than GMP's 135–136 ms / 258–263 ms. Baseline core identity is
`448a57cf09bd0c0affe395cbab3878dd575dec344eb5d7da9c0b6455bcddc17a`;
candidate identity is
`5f8423d30f31f5a49f43ed44dd05b7fa221c0b3c079beb75adce531748f75e86`.
No collector speedup follows while its mixed entry still selects GMP. Ordinary
word arithmetic versus multiprecision limb arithmetic remains a representation
difference to diagnose rather than attribute entirely to the source language.
With fresh argument representation, the baseline product totals are 199–201 ms
tagged versus 139 ms GMP; signed sums are 386–393 ms versus 259–262 ms. The
negative finding therefore survives the measurement correction. With the same
corrected boundary, the candidate takes 187.6–187.9 ms for tagged products and
364.6–370.1 ms for tagged sums (GMP: 136.5–137.4 ms and 260.4–262.4 ms).
Candidate core SHA-256:
`9a4d9cfcd1fbd8a44b22234bc45b9d7739065881e28a4dea38de4fc8707033d2`.
These before/after runs were separate and the host was not quiet/pinned;
the defensible finding is a narrow promising correction with a remaining gap,
not a qualified percentage improvement. All records still match.
The probe's changed-file gate passes merge invariants and then fails in
`test/algebraic-geometry.cjs`; later unit work and docs checks are not qualified.
The compiler correction separately passes focused differential/UBSan checks,
but its full build stops at the known missing FFLAS `libgivaro.a` dependency.

## Connected unreduced-ideal collector checkpoint

`unreduced_ideal_collector.py` now connects ideal preparation and resident
relation collection in one ordinary typed-Python entry. Its inputs include
prepared nf embeddings, the original ideal and the factor base, but **not** a
rank answer, LLL transformation, reduced ideal, QR answer or accepted relation.
The 124-function generated closure computes the currently supported modular
rank, FLATTER/fast/DPE LLL path, transformed ideal and embeddings, final QR and
enumeration bound, and then resumes candidate collection and relation admission.
This remains a segment, not `bnfinit`: the full dependency frontier below is
still open, including class/unit linear algebra and whole-engine termination.

The resident preparation state is separate from the enumeration cursor.
`state[4]` records a prepared positive root degree while `state[2]` remains at
the initial candidate; thus the first candidate is neither skipped nor preceded
by duplicate final QR preparation. Preparation dependencies return sticky
statuses -11 through -17, without entering collection. These are explicit
unsupported branches, not mathematical rejection or permission to change bounds.
The caller must retain disjoint workspaces and unchanged configuration across
resumptions. The current prototype has a flat 128-parameter ABI.

Reproduce with `SAGEJS_FLINT_PREFIX` set to the shared native prefix:

```sh
node bench/pari-class-group-port/check_compiled_ideal_collector.cjs PARI_DIRECTORY --unreduced
node bench/pari-class-group-port/check_compiled_ideal_collector.cjs PARI_DIRECTORY --unreduced --initialized-cache
node bench/pari-class-group-port/check_collector_c_control.cjs PARI_DIRECTORY PARI_ARCHIVE --unreduced
node bench/pari-class-group-port/measure_collector_core.cjs PARI_DIRECTORY --unreduced
node bench/pari-class-group-port/measure_collector_core.cjs PARI_DIRECTORY --unreduced --profile
node bench/pari-class-group-port/measure_collector_calls.cjs PARI_DIRECTORY PARI_ARCHIVE 1 --unreduced
```

Sixteen scenarios from the same four tuning fields agree in CPython, generated
JS and GMP-native execution, both with empty and initialized relation caches.
Checks cover final ideal/embedding data, relations and exact generators,
modular basis, hashes, counters, quotas, terminal state and inert resumption.
Zero ideals and the product-of-two-rank-primes obstruction check sticky
preparation failures in all three backends. CPython instrumentation checks
exactly one final enumeration preparation, including across batch resumptions;
this does not exclude the QR work required inside LLL. The old prepared entry
and all 24 enumeration prefixes at three batch sizes also still agree.
Empty-cache unreduced trace SHA-256:
`f7164a5d4ec4e403a6bee7914b098950b2b2d1b4a1af6e72ef3f9d8ba3c72b41`.
Initialized-cache trace SHA-256:
`d7f63a2757ac16b2d9566c30549c28da03a00465b57c5ea01b5c74a349924463`.

The separate C control retains the full pristine `Fincke_Pohst_ideal` LLL and
embedding prefix and agrees on all 16 states with one and two fresh repetitions.
It still uses the declared factor-base/scale scaffolding and omits automorphism
images. Its extracted control source hash is
`d969652bd95d67ccc9083d0dd2eb9f5e52939acce1c865fdb296a9d3830c104d`.
Fixture generation uses the separately disclosed instrumented source hash
`d8b09a54e51399c83f2faa92ccc3f1f70f41d660b1cb279738bc207ff553f87a`;
these are not interchangeable comparator attestations.

### Diagnostic cost and remaining representation question

These are **unqualified diagnostics**, not the plan's three paired, pinned,
one-second samples. A one-repetition run over the 16 scenarios reported:

| Boundary | Total seconds |
| --- | ---: |
| Pristine-source PARI collector control | 0.001727 |
| CPython translated entry | 0.059797 |
| Generated JS entry | 0.210131 |
| GMP ordinary-array host entry | 0.908044 |
| GMP packed host entry | 0.054767 |
| Standalone generated core, separate run | 0.046725 |

The standalone control restores packed buffers outside its entry timer and
checks every final output. It compiled in 22.56 seconds outside measurement.
The core has 18,163,387 source bytes (including alternate integer backends),
and its Linux addon has 3,132,096 bytes. Packed integer capacity is explicitly
64 words for this diagnostic, matching the preparation tests; this is an ABI
allocation choice, not a changed mathematical bound. Sizes are not peak RSS.
The host was AMD EPYC 7B13 with Node 26.8.1; C controls use
`-O2 -ffp-contract=off`. No Windows/Wasm performance qualification is implied.

A subsequent instrumented run covered 1,600 fresh collector calls and 4.922
seconds inside the generated entry timers. `gprof` recorded 13,758,500 packed
integer reads, 5,130,600 writes, and 23,277,400 exact-to-int64 conversions.
There were exactly 1,600 final enumeration preparations and 9,600 prepared-QR
calls including the retained LLL work. GMP copying, sizing, small arithmetic,
import/export and allocation dominate flat samples. Sampling covers the whole
process, including fixture resets; uninstrumented GMP callees do not provide a
reliable inclusive phase breakdown. Profile counts are evidence to isolate
representation costs, not proof that every cost is avoidable.
The reporting-enabled rerun reproduced all five published helper counts,
with 4.955 seconds in entry timers and 8.984 seconds for the child process;
its profile SHA-256 is
`dbc2b07f4feef142c807fc5f119465c018ea8cf6ac73c1a09b689c66231fc79d`.

The earlier one-word packed-read probe below already showed that optimizing
that helper alone is insufficient. The next bounded investigation should
distinguish small exact bookkeeping from genuine large mantissa arithmetic,
and test mixed Float64/tagged-integer lowering or resident integer storage on
identical operations before changing the collector. No language-parity claim
or completed class-group result follows from this checkpoint.

Strict Python passed 403 modules; Python formatting passed 967 files. The
architecture rerun passed earlier native/FFI/resource checks and failed at the
same stale optimizer-opportunity manifest recorded below. Broad gates are not
green; neither draft PR is ready for automatic merging.
The current changed-file rerun passes merge invariants, then fails in the
hyperelliptic public-scalar unit tests because the worktree lacks the optional
`sagejs_flint.node` addon (four files passed, 234 not started). Docs checks were
not reached. An earlier attempt without the shared FLINT prefix failed on
missing `flint/nmod_mat.h`; supplying the prefix fixed that setup issue but
does not install the optional public addon. No broad gate is inferred from
the successful isolated collector compilations.

At resumption, goal accounting reported 48,310 root active seconds (13.42 hours),
plus the previously disclosed approximately 12 subagent minutes. The 16-hour
aggregate timebox remains in force. Recent diagnostic wall-time receipts do
not repair historical CPU-accounting gaps, and no qualified timing campaign
has begun.

## Connected ideal reduction to enumeration-bound preparation

`ideal_ranked_preparation.py` connects `Fincke_Pohst_ideal`'s `G0*I`,
the translated ranked LLL path, `I*U`, `G*ideal`, Householder/Gauss reduction,
binary64 coefficient conversion and the initial enumeration bound in **one
source-transparent native call**. QR workspaces are reused only after LLL has
finished. The input contains prepared nf embeddings and a candidate ideal,
not PARI's transformation matrix. Rank is now computed by the translated initial
modular path; untranslated rank/precision branches remain explicit dependency
statuses.
This is preparation for candidate collection, not a complete relation collector
or class-group engine.

`ideal_enumeration_preparation.py` retains the post-LLL boundary as a separate
differential check. Generic embedding multiplication follows
`RgMrow_RgC_mul_i`: evaluate the first product, then skip only exact integer-zero
matrix entries. Real-zero precision metadata is preserved. Mixed integer/real
arithmetic retains the explicitly limited single-word integer capability;
larger operands are not silently approximated.

Reproduction (with the existing shared FLINT prefix for native compilation):

```sh
node bench/pari-class-group-port/check_ideal_enumeration_preparation.cjs PARI_DIRECTORY PARI_ARCHIVE
node bench/pari-class-group-port/check_ideal_enumeration_preparation.cjs PARI_DIRECTORY PARI_ARCHIVE --connected
```

Both modes check **96 cases: 32 ideals from the same four tuning fields, each
at three declared bound scales**. nf preparation uses 192 bits, not 192 PARI
words. The oracle extracts and hashes pristine 2.17.4 `buch2.c` from the pinned
archive. CPython, generated JS and GMP-native execution match the exact ideal,
every embedding and reduction mantissa/precision/exponent, final transformation,
skipfirst, bound root degree, and binary64 q/v/bound. The connected mode also
checks that rank-deficient input stops before ideal publication. Trace SHA-256:
`4531d8ab7d53ebe7a2fd0cffd2dbf4cd0b31c596efa4c3f1fec2af6c33a0fd85`.
The standalone mode supplies U explicitly; the connected mode computes it.
No reserved-field or seconds-scale coverage is inferred from these cases.

Generated resource spot check after rank integration: the connected core has
84 IR functions and 11,972,866 C-source bytes; its Linux Node addon is
2,116,288 bytes. The core
contains multiple integer-backend variants, so source size is not a direct
measurement of executed instructions. Native execution passes, and the core
has no interpreter callback sites. These sizes are not RSS, allocation counts,
or qualified timing evidence. Strict Python passes all 403 registered modules;
the bench sources also execute under CPython. The architecture rerun still
fails on the previously recorded stale optimizer-opportunity manifest after
its earlier checks pass. No source/resource safety allowance was raised.
The changed-file gate for the three new bench sources passes merge checks,
then the portable tier fails `test/module-cache.cjs` with the known generated
`$ρσ$py$Any is not defined` error. Five files passed before fail-fast cancellation;
213 files were not started. This is not a green broad gate.

### Initial modular rank, without an external rank answer

`lll_rank.py` follows `ZM_pivots`'s initial modular phase and
`Flm_gauss_pivot` for square dimensions through four. It counts zero columns,
uses the first two primes from pinned 64-bit `init_modular_small`, and stops
at upstream's maximal-rank exit. All-zero matrices return zero directly.
If neither prime establishes maximal rank, status -1 hands off to the still
unported rational verification phase; the integrated preparation reports
dependency status 7. It does not return the likely modular rank as exact.
The fixed two primes are verified against PARI's actual iterator by the test,
not selected from the inputs. Modular residue products use exact Python
integers rather than PARI's word primitives, an unqualified backend cost.

`check_lll_rank.cjs PARI_DIRECTORY PARI_ARCHIVE` matches **48** cases across
CPython, JS and GMP: the 32 prepared matrices plus 16 controls covering zero
columns, all-zero input, dependent columns, negative/large entries, row swaps,
second-prime recovery, and unresolved dubious rank. It compares reduced modular
storage, pivot choices, rank/dependency status and prime/trial counters; every
resolved oracle rank is also compared with normal `ZM_rank`. Trace SHA-256:
`c8b01df7c135424fbf6cd0c1ba74f9f1603d381933656561fa4edcbafba0dcdf`.
All 32 prepared ideals resolve on the first prime. The 96-case connected
preparation rerun verifies that work counter as well as the unchanged outputs.

The existing source translation of `Fl_inv/xgcduu` is now parameterized by
modulus; the relation-cache wrapper retains modulus 27449 and the same unsigned
word wrapping. The 192-transition relation-cache and 192-transition fact-insert
checks both pass in PARI, CPython, JS and GMP, including their existing expected
noninvertible-pivot cases. No relation-cache acceptance policy changed.
After rank integration, the changed-file gate again passes merge checks and
fails `test/module-cache.cjs` in the unit tier with the same generated `Any`
reference error. Five unit files pass; 233 are not started and the later docs
stage does not run. The architecture failure remains the stale optimizer
manifest; strict Python remains green. These are disclosed baseline failures,
not permission to call the experiment review-ready.

## Connected rank-supplied LLL preparation

`lll_ranked_basis.py` now executes the selector, FLATTER when selected,
`fplll_fast`, and the mandatory `fplll_dpe` pass in one source-transparent
native call. It preserves the selector's initial low-precision QR, the
full-rank FLATTER iterations and stopping decisions, and the subsequent
`U*T`/`B*T` products before LLL. The row-major QR/FLATTER and column-major
LLL representations cross an explicit in-core copy, not a host callback.

`check_lll_ranked_basis.cjs PARI_DIRECTORY PARI_ARCHIVE` matches normal PARI's
transformation and stage decisions for **32 prepared ideals from four tuning
fields**, in CPython, generated JS and GMP-native execution. Each reduced
basis is checked against the original times U. All 32 select FLATTER, then
complete fast and DPE passes; the preceding low-precision QR fails as upstream
does. Rank is still supplied externally: this is not a complete `ZM_lll`
implementation or a changed claim about the nfinit preparation boundary.
Unported rank handling, the existing 512-bit FLATTER QR capability boundary,
and required heuristic/proved fallbacks have distinct unresolved statuses,
not false mathematical rejection or silently skipped stages. Whole class
groups, seconds-scale coverage and qualified runtime comparisons remain open.

`lll_selection.py` separately matches **116** upstream selector cases, including
64 prepared-ideal/keepfirst combinations, upper/lower knapsack and general
triangular thresholds at one below/equal/one above, and successful small QR
controls. Thresholds are the actual pinned cubic/quartic table values; this
does not replace them by stronger proved bounds. Selector trace SHA-256:
`549af4d78e49b9216956a83f398424b6c9514c1db4d11a88a9da5a2b23643d54`.

The first connected compilation aborted inside Tree-sitter. A bounded lowering
probe revealed 251 import-lowering requests for only 23 distinct pairs before
its cap (48.27s). Compiler prerequisite `68fbe4029` caches shared selected-entry
IR within one compilation, checking transitive source hashes and isolating
caller copies. The same source now finishes lowering with 47 requests for 47
unique pairs, yielding 55 functions (6.69s diagnostic). This is a compiler
scalability improvement, not a mathematical runtime-speed measurement. Twelve
focused compiler tests pass, one Wasm test skips for missing tooling; the stale
optimizer manifest still prevents a green broad architecture gate.

A subsequent `pnpm test:changed -- --base HEAD` run passed merge checks and
started the unit suite, but its terminal output was not recovered after the
session boundary. Its final result is unknown and is not counted as a pass.
The focused selector and connected-entry checks have separate recorded runs.

## DPE Babai and outer-loop checkpoint

`lll_babai_dpe.py` translates the complete `Babai_dpe` loop: extended-exponent
GSO, upstream exponent-history stagnation, the +/-1, word-size and shifted
word-size reductions, exact Gram updates, and final squared-norm recurrence.
The integer backend uses signed exact products rather than PARI's specialized
add/submul entry points; that representation cost is not yet qualified.
Multiplication normalization precedes the large-exponent shift, including
zero metadata, and the Gram diagonal uses the old cross term before mutation.

`check_lll_babai_dpe.cjs PARI_DIRECTORY PARI_ARCHIVE` checks 288 constructed
calls across dimensions 3/4, signs, nine shifts through 2098, two reduction
positions, and all four optional-B/U combinations. Its `--actual` mode captures
80 calls from the normal `ZM_lll_norms(...,.99,LLL_IM,NULL)` path on 32 prepared
ideals. All captured state agrees in CPython, generated JS and native execution.
Of these 80 calls, 37 have nonzero incoming mu, none changes the already reduced
basis, and none reaches stagnation. The constructed cases exercise reductions;
the actual replay alone does not. Capture initializes otherwise unused DPE
slots for defined diagnostic reads and checks final U against uninstrumented
PARI. Actual trace SHA-256:
`b84f0c8e293da0f2b5e374c1d5a6c0ff3e5f0a5bed39e87953ca3247bb664d88`.

`lll_dpe_pass.py` connects this to the DPE outer loop, including supplied versus
incremental Gram construction, Lovasz decisions, insertion, alpha updates,
rotations, and zero-column handling. Its 168-case differential harness passes
in PARI, CPython, JS and native execution with no reference censoring: 32
prepared ideals and ten identity/zero/dependent/dense-column controls, each
with keepfirst off/on and supplied/incremental Gram. It compares status, exact
basis, U, Gram, and every bit/exponent of the r diagonal. Upstream also checks
the exact transformation and Gram identities. Trace SHA-256:
`76dbc2ce116cb8daf0b1d0a253f1e534f0b6e11a05e7d0886ca995b0737751b1`.
Norm outputs are
resident DPE pairs, not published PARI real objects. Neither this pass nor the
fast pass replaces the full upstream selector and precision-fallback driver.
There are still no whole class-group invariants or qualified engine timings.

Generated-core spot check (IR 43): the DPE Babai core is 429,919 bytes and the
outer-pass core 993,196 bytes. Both retain source/IR provenance and contain no
`napi_`, `PyObject`, or `v8::` symbols. The outer entry and Babai call use native
borrowed buffers, but dimensions/indices currently remain GMP integers. These
are generated-source sizes, not machine-code size or resident-memory measures;
no speed or allocation conclusion is inferred from the text size alone.
The broad architecture rerun again reaches the stale optimizer-opportunity
manifest failure after passing its earlier native/FFI/Wasm checks. Strict
Python passes all 403 registered modules; the new bench modules additionally
run under CPython in their differential harnesses.
The changed-file gate passes merge invariants and the complete eight-stage
build (7m41s), then stops at that same architecture-manifest failure. Its later
unit/compiler/integration/docs/CLI stages therefore did not run. The build
explicitly skips absent optional native adapters, production kernels and Wasm
numerical reactors; a successful build does not qualify those capabilities.

At this checkpoint goal accounting reports 43,734 root active seconds (12.15
hours), plus the previously disclosed roughly 12 minutes of subagent work.
The 16-hour aggregate timebox is unchanged. Recent short DPE diagnostics were
not individually CPU-metered, so their wall-time receipts do not repair the
historical CPU-accounting gaps. No qualified timing campaign has begun.
The next integration boundary is `Fincke_Pohst_ideal`'s
`ZM_lll(G0 * I, .99, LLL_IM)` call: retain its selector, FLATTER, fast and DPE
work, explicitly expose missing heuristic/arbitrary-precision fallbacks, then
connect the resulting `I * U` to the existing QR/enumeration preparation.

## Extended-exponent arithmetic for the mandatory DPE pass

`lll_dpe.py` starts the pinned DPE dependency chain: integer conversion,
normalization, addition, subtraction, multiplication, division, comparison and
the connected multiply-then-subtract operation. A significand/exponent tuple
lowers to scalar native outputs, keeping ordinary Python as the same source.
The zero sentinel is explicitly the pinned 64-bit PARI `-LONG_MAX`, not the
host C `long` width. Integer conversion retains `affidpe`'s distinct zero
metadata and its two rounding steps. Addition/subtraction preserve the strict
greater-than-53 exponent-gap cutoff and upstream operation order.

`check_lll_dpe.cjs PARI_DIRECTORY PARI_ARCHIVE` compares **1,100 operand pairs**
formed from ten signed integer inputs (through 1025 bits) and eleven exponent
gaps from -2000 to 2000, including 52/53/54 boundaries. PARI, CPython, JS and
native agree on every significand bit and exact exponent, and on the actual
comparison return value (which can be +/-2). Chained subtract-product checks
exercise reuse of normalized zero metadata. DPE division by zero is explicitly
excluded from this arithmetic check: unlike binary64 division alone, its
exponent arithmetic can exceed the pinned C-long domain. No overflow semantics
are inferred from undefined upstream signed overflow.

This arithmetic check alone is **not the DPE Babai/LLL pass**. Separate loop
work is recorded above; the full driver fallback sequence remains required.
No DPE or whole-class-group timing result is claimed.

## Fast outer-loop work in progress

Current checkpoint: the explicit `pari_lll_divide` helper now reproduces C's
zero-divisor infinity/NaN policy without changing Python `/`. It uses native
`copysign` from compiler prerequisite `946b35071` (IR 43), preserving signed
zero divisors. **All 83 completed reference cases now match status, basis and
transformation in CPython, JS and native execution.** The declared 84-case set
still records the case-81 reference timeout; additional censoring is rejected.
The historical Python failure below is resolved, not removed from the corpus.
`check_lll_scaling.cjs` adds 225 C-division differential cases, including signed
zeros and nonfinite values, alongside its 3,814 scaling controls. NaN payload
identity and floating exception flags are not part of the port contract.

`lll_fast.py` currently connects Babai to the upstream initialization, Lovasz
decision, insertion-index search, alpha updates and triangular Gram rotation.
Flat column rotations copy entries rather than rotating PARI pointers; this is
a declared representation cost, not yet benchmarked. The prototype compiles.

The new `check_lll_fast.cjs` declares 84 cases: 32 prepared ideals with keepfirst
off/on (64), and 20 identity/zero/dependent/dense-column controls. Its initial
run was **failing, not qualified**. CPython matched the first 71 completed cases,
including all 64 prepared-ideal cases, then reaches the explicit untranslated
zero-GSO-divisor boundary on case 71: columns `(1,0,0)`, `(0,1,0)`, `(1,0,0)`
with keepfirst enabled. The initial full harness stopped at that disagreement.
An explicit `--prepared-only` diagnostic mode separately checks all 64 prepared
ideal runs in CPython, JS and GMP-native, and **all 64 match status, reduced
basis and transformation with no reference censoring**. This focused success
did not replace the failing 84-case gate or remove its controls.

The initial aggregate reference run timed out after 60 seconds. Isolating
cases in separate processes with a declared two-second diagnostic cap identifies
case 81 (the analogous 4x4 dependent-column, keepfirst control) as reference
censored. The other 83 reference cases complete. The corpus is not reduced:
the censored case remains listed, and the harness reports its index/cap. This
does not establish that PARI never terminates, nor authorize altering its LLL
stopping rules. The zero-divisor policy and native rerun are now covered above.
These are fast-pass checks, not a replacement
for the complete FLATTER/fast/DPE path.

## Connected Babai iteration prototype

The `--actual` mode now captures **80 calls** made by PARI's normal
`ZM_lll_norms(..., .99, LLL_IM, NULL)` path on 32 prepared ideals: the existing
four tuning polynomials at primes 2, 3, 5, 7, 11, 13, 17 and 19, using
`nfinit(P, nbits2prec(192))` and `roundG * idealhnf(prime)` as input. This does
not bypass the upstream FLATTER/fast/DPE selection. The instrumentation also
compares its final transformation with uninstrumented PARI for every ideal.
Each captured Babai input is replayed separately in CPython, JS and native
execution, with full mutable-state agreement. **26 calls change the basis,
37 have nonzero incoming mu, and none takes the stagnation return.**
The serialized trace hash is
`688721a36b613872f2724ca796a0e8d5f5c8d09149b6362d8bb4a36651aa50dc`.

For defined diagnostic output, the instrumented double-vector allocator zeros
all slots before upstream initialization; otherwise printing unused GSO slots
would read uninitialized storage. No normal algorithm control or arithmetic is
changed, and the uninstrumented final-transform comparison is an additional
check, not a proof of identical unused state. Trace collection is capped at 512
calls and excluded from timing. This is still replay scaffolding, not an
independent whole LLL execution or a new performance result. The original 28
synthetic cases remain a separate passing mode.

`lll_babai.py` translates `lll.c:Babai_fast`, including GSO updates, descending
size reduction, exact basis/transformation updates, column renormalization,
Gram refresh and the three-generation exponent stagnation test. Indices are
zero-based in independent flat resident buffers. The `zeros` count and exclusive
Gram bound are documented at the boundary. PARI's specialized signed small-word
multiply/add operations currently use exact Python multiplication and shifting;
this preserves values but is a storage/allocation substitution to measure.

The compiler prerequisites through `098dfdf46` remove mixed absolute-value,
range-transfer, rounding, conversion and borrowed-float-helper obstructions.
`check_lll_babai.cjs PARI_DIRECTORY PARI_ARCHIVE` checks 28 synthetic complete
Babai calls in dimensions 3 and 4 with both signs and shifts up to 2098 bits.
The pinned source oracle, CPython, generated JS and GMP-native agree on basis,
transformation, GSO/Gram/approximation buffers, exponents, scratch `s` and return
status. Native test buffers predeclare 64 words per integer, since the default
eight-word transformation capacity is insufficient for these large outputs.
The first native run hit that capacity; this was not an upstream stopping rule.

This is not full LLL. The initial zero-GSO-divisor boundary has subsequently
been translated by the explicit C-policy helper described above. The synthetic
inputs use orthogonal preceding columns and do not cover every reduction or
stagnation branch. The fast outer-loop checkpoint is above; the mandatory DPE
pass remains open.
No speed or whole-engine correctness claim follows from this checkpoint.

## Babai's C scaling policy

`pari_lll_scale` translates the overflow policy at `Babai_fast`'s C `ldexp`
calls, where the pinned source explicitly allows infinity. It checks the exact
combined exponent after `frexp`, returns signed infinity on finite overflow,
and otherwise delegates to Python's correctly rounded `ldexp`. Signed zeros
and nonfinite values pass through. This leaves the language intrinsic's
`OverflowError` behavior unchanged. The upstream caller does not inspect errno
or floating exception flags; these are not part of the translated interface.

`node bench/pari-class-group-port/check_lll_scaling.cjs` compares **3,814** cases
against the host C `ldexp` used by PARI, CPython execution of the translated
helper, generated JS and GMP-native execution. Cases include both C-int
exponent extremes, every positive power of two in binary64's range, randomized
bit patterns, overflow, odd subnormal ties, NaN, infinities and signed zero.
Finite results agree bit-for-bit; NaN payload identity is not required. The C
control is a libc-policy oracle, not a run of `Babai_fast`. This removes one
semantic dependency of that routine; the routine itself remains untranslated.
Ordinary Sage.js `math.py` still needs the separate correction documented below.

## Connected binary64 column preparation

Compiler prerequisite `493a74af6` adds native `math.frexp`/`math.ldexp`, exact
integer exponent handling and mixed float/integer tuple outputs (IR 40). It
is integrated on this branch, together with follow-up `1927840fc` fixing
the call scan's interaction with synthetic workspace AST nodes. The separate
ordinary `math.py` correction is
still open; the historical 14-disagreement runtime probe below is not claimed
resolved by native lowering alone.

`lll_float_preparation.py:pari_lll_set_line` now connects integer normalization
to the upstream second-pass column scaling. It retains the maximum-exponent
floor of zero, zero-entry exponent metadata, and the order of all conversions
before scaling. Independent caller-owned buffers keep scratch resident.

`check_lll_set_line.cjs PARI_DIRECTORY PARI_ARCHIVE` checks **141 columns**:
112 actual `roundG * I` columns from the four tuning fields at primes
2, 3, 5, 7, 11, 13, 17 and 19, plus 29 zero/wide-exponent controls. PARI,
CPython, generated JS and GMP-native agree on the maximum exponent, every
entry's pre-scaling exponent and every output double bit. This exercises the
compiler primitive in actual LLL preparation, but is not a completed
`fplll_fast` pass or a speed measurement. Babai's infinity-tolerant C scaling
policy is now represented by the helper above; the general Python `ldexp`
primitive correctly continues to raise on finite overflow.

The integrated focused check passes in 4.816 seconds (test/oracle wall time,
not a benchmark). The changed-file gate now passes the production graph check
that exposed the workspace AST regression, then stops in
`test/foreign-languages.cjs` because the local FLINT addon is absent; 234 unit
files remain unstarted. This is not a green broad gate. The preceding strict
check passed all 403 modules. The compiler prerequisite's separate build and
architecture failures remain documented in `mixed-exact-float-sidecar.md`.

## Binary64 LLL scaling dependency audit

The next untranslated `fplll_fast` pass uses `itodbl_exp`/`set_line`
(`lll.c`, around lines 699–742) and `Babai_fast`'s `ldexp`/`frexp` calls.
The pinned source normalizes integer columns before Gram products and uses
scaled floating coefficients to choose exact size reductions. Substituting
`x * pow(2, e)` is not generally equivalent, even with finite input/output.

Run `node bench/pari-class-group-port/probe_binary64_scaling.cjs` to compare
121 boundary cases in CPython and ordinary dynamic Sage.js and probe native
lowering. At the original audit revision, **14 dynamic disagreements** occurred
and both native imports were rejected with `unsupported call to ldexp/frexp`.
After the compiler integration, the same 14 dynamic disagreements remain,
but both imports lower successfully. This probe does not execute native code;
the focused compiler and column checks above do. This is a
diagnostic finding, **not a passing differential qualification**. Examples:

- `ldexp(5e-324, 1074)` should be `1.0`, but raises overflow dynamically.
- `ldexp(1.7976931348623157e308, -1075)` should be
  `4.4408920985006257e-16`, but returns zero dynamically.
- Scaling signed zero by exponent 1074 returns NaN instead of signed zero.
- `frexp(1.7976931348623157e308)` should give
  `(0.9999999999999999, 1024)`, but gives `(0.0, 1025)` dynamically.

The probe hashes `src/lib/math.py`, uses the actual CLI rather than a
reimplementation of its formulas, and checks signed-zero equality. The first
ad hoc native probe omitted `@native` and was rejected for its module shape;
that was not evidence about the operation. The committed probe fixes this and
requires the operation-specific rejection (or records accepted lowering without
claiming execution). Its successful process exit means evidence collection
worked, not that the operations agree. The initial full probe took about
0.79 seconds wall time including CLI startup; this is not a kernel benchmark
or CPU-resource measurement.

Next investment: correct binary64 decomposition/scaling in the dynamic runtime
and source-transparent native lowering, with CPython boundary oracles, before
using them in `set_line` and `Babai_fast`. General `math.ldexp` must retain
Python's overflow exception; PARI's C call can instead produce infinity in
Babai, so that upstream policy needs an explicit source-level boundary, not a
silent weakening of Python semantics. This audit does not establish that the
14 edge cases arise in the four tuning fields, and does not establish an LLL
performance regression. No production runtime was changed by this probe.

`lll_float_preparation.py:pari_lll_integer_to_double` now translates the
preceding `itodbl_exp` step using the already tested real-conversion leaves.
`check_lll_float_preparation.cjs PARI_DIRECTORY PARI_ARCHIVE` extracts the
pinned `lll.c` oracle and checks **319 signed integer inputs**, up to 2049 bits,
against CPython, generated JS and GMP-native execution. Both the returned
exponent and all 64 double bits agree. Cases include zero's exponent metadata
(-64), mantissa carries, and values that demonstrably differ from a direct
integer-to-double conversion. This is one dependency of `set_line`, not a
completed column-scaling or LLL pass. Existing arithmetic construction of real
values remains a documented representation substitution; no speed claim is
made for this helper.

Validation for this increment: format and strict checks pass (403 strict
modules); the full build completes in 7m31s, with the optional native FLINT
adapter and numerical Wasm reactors absent/skipped. The 121-case probe still
finds the same 14 disagreements after that rebuild. An initial changed-file
unit run overlapped the documentation-triggered rebuild and failed because
`dist/` artifacts disappeared; this orchestration error is not a mathematical
regression or a valid unit-suite result. The post-build rerun passes five unit
files (including the previously interrupted public-super checks), then fails
in `test/foreign-languages.cjs` because `sagejs_flint.node` is absent; 233 files
remain unstarted. Architecture again stops at the existing optimizer manifest
mismatch. Neither broad gate is green. The focused normalization receipt takes
3.75 seconds wall time including oracle compilation and all three executions;
it is not a performance qualification. Windows/Wasm execution remains untested.

## Connected prepared-ideal collector

`ideal_collector.py` now connects numerical preparation, enumeration, factor
admission, normalization, owned generator storage and cache insertion in one
source-transparent native call graph. The no-automorphism-image boundary is
explicit. It retains the updated factor-list length, counts `Nfact` after
normalization but before insertion, and preserves the difference between an
appended record and a positive `add_rel_i` return.

The collector implements the upstream first-smooth probe (`Nrelid == 0`),
cache-target completion, per-ideal quota and exhaustion branches. Cache-target
completion precedes the `relid` increment; quota termination returns zero,
unlike cache-target completion. Negative numerical/search statuses and explicit
unresolved-factorization status remain distinct. Terminal calls are idempotent.

Sixteen oracle scenarios use the four existing tuning fields, prepared prime-2
ideals, 192-bit preparation, scale 4 and prime decompositions through 101.
Each starts from an explicitly empty cache, with dependent allowance 2, and
tests `(Nrelid, target)` values `(0,100)`, `(1,100)`, `(8,2)` and `(8,100)`.
The oracle uses the extracted PARI cursor, actual `factorgen`, normalization
and `add_rel_i`. All scenarios agree in CPython, dynamic JS and GMP-native
execution: return status, trial/factor counts, `relid`, `Nfact`, missing rank,
allowance, complete modular basis, stored relations/hashes and exact generators.
Repeated terminal calls preserve all buffers. The 576 insertion controls also
pass after adding the diagnostic-counter connection.

The metered collector rerun used 78.458 user + 2.366 system CPU seconds,
72.378 seconds elapsed and 699,916 KiB peak child RSS, including oracle/native
compilation and all dynamic/native comparisons. These are validation resources,
not comparative collector timings. Strict Python (403 modules) and parallel
checks pass; architecture validation still fails at the known optimizer
manifest mismatch.
The selected changed-file merge/docs gate passed; its build completed in
7m 19s. Optional native adapters, the production kernel pack and numerical
Wasm reactors were absent/skipped, not validated by that build.

This is a prepared-ideal segment, not `bnfinit`. External preparation still
supplies ideal/LLL, embeddings, factor-base data and the trial scale. Testing
an empty cache does not replace the initial rational relations in the full
engine. Automorphism images, actual factor-base scheduling, `small_norm` and
`rnd_rel`, unit/regulator recovery, relation linear algebra and final stopping
remain outside this entry. No whole-engine or seconds-scale speed claim follows.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_ideal_collector.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

### Preparing a work-matched collector comparison

The checker accepts `--export-fixtures` after the PARI source directory. This
executes only the diagnostic C oracle and emits schema
`pari-prepared-ideal-collector-v1`, with the actual `buch2.c` hash, 83 named
parameter types and 16 cases. Each case separates fresh `input` buffers from
`expected` output state. It does not compile or run the translated collector.
The initial progress, generator bank and cache occupancy are zero; computed
relations are never supplied as inputs. The export is approximately 4.33 MB
and should be generated once, not archived per timing iteration.

This is benchmark scaffolding, **not yet a timing comparator**. The existing
oracle cannot be timed directly against the native entry:

- Its QR and enumeration bound are prepared before `trace`, whereas the
  translated collector computes both inside its entry. Include them in both
  timed paths.
- It prints candidate diagnostics and separately recomputes the rounded norm
  before `factorgen`. Neither belongs in the timed C collector.
- It creates the relation cache internally; the native entry receives empty
  allocated buffers. Align the reset/allocation boundary and separately report
  host marshalling and allocation rather than attributing these to the language.
- Both segment paths omit ideal LLL/preparation and automorphism images. The
  full upstream `Fincke_Pohst_ideal` is therefore a different workload.

Use the pristine pinned source archive for the timing control; the diagnostic
tree's tracing instrumentation is not a qualified baseline. Preserve the same
quota/target cases, trial counts, factor attempts, cache transitions and exact
generator outputs before collecting paired samples. No collector speed ratio
has been established by this export or by the correctness harness.

`collector_c_control.cjs` now constructs a separate control from the
hash-checked pristine 2.17.4 `buch2.c` archive member. Exact, single-occurrence
replacements move only ideal LLL/matrix preparation outside the extracted
routine, rename its entry, and expose diagnostic counters without debug I/O.
QR/bound preparation, candidate search, `factorgen`, normalization, `add_rel`
and quota/target decisions remain in that routine. An empty automorphism list
selects the same no-image boundary. The upstream copyright/license text is
retained in the generated comparison source; this is not a Sage.js backend.

`check_collector_c_control.cjs` checks all 16 complete output states against
the fixture oracle with both one and two fresh calls per case, including
relations, modular bases and exact generators. It rejects a modified source
hash. These checks pass. The control measures its entry with a monotonic clock,
excluding initial cache/workspace allocation, cleanup and output serialization;
PARI stack temporaries and relation cloning during the call remain included.
The port's marshalling/allocation boundary and paired sample runner still need
implementation before these measurements support a comparison. Repetition
counts 1 and 2 are correctness tests, not qualified performance samples.
The metered control check (including C compilation and fixture generation)
used 7.212 seconds elapsed, 6.822 user + 0.428 system CPU seconds and
155,136 KiB peak child RSS. Documentation, syntax and parallel checks pass.

```sh
node bench/pari-class-group-port/check_collector_c_control.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

### First call-boundary diagnostic (not a performance qualification)

`measure_collector_calls.cjs` runs the C control, CPython, dynamic JavaScript,
GMP with ordinary arrays, and GMP with prepacked integer/int64/float64 buffers.
Every measured port call starts with fresh state, follows an unmeasured warmup,
and checks the full expected collector output after timing. Buffer construction
and explicit result decoding occur outside timing. The ordinary-array GMP
adapter still converts/copies within the measured call; prepacking moves that
work outside. The packed path still uses the host adapter, not a standalone
core benchmark. C currently has no equivalent warmup and system order is fixed.

A single-repetition diagnostic on Linux x64/AMD EPYC 7B13, Node 26.8.1 gave
these **totals across the sixteen segment cases**, not whole-field timings:

| Boundary | Total seconds |
| --- | ---: |
| PARI prepared entry | 0.001183 |
| CPython call | 0.039749 |
| Dynamic JS host call | 0.149835 |
| GMP ordinary-array host call | 0.859747 |
| GMP prepacked host call | 0.040509 |

All output checks passed, including the packed path. This is strong motivation
to retain resident packed state, but the short, unpaired, unpinned samples do
not qualify a speed ratio. They do not isolate compiler overhead from arithmetic
representation costs. The generated C core was 12,079,183 bytes; compiler/cache
preparation took 30.846 seconds outside measurements. Next measure the standalone
generated core, then use properly budgeted paired batches to locate the remaining
cost. Do not infer full-engine performance from this small prepared-ideal segment.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/measure_collector_calls.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

### Standalone generated-core diagnostic

`measure_collector_core.cjs` builds a standalone executable around the emitted
core header and source. The handwritten driver only reads/allocates packed
buffers, calls the declared core ABI, serializes outputs and frees storage;
it implements no mathematical operation. Expected answers are never sent to
that executable. All 16 complete output states are checked against the
diagnostic fixtures after timing, including modular bases and exact generators.

The first successful run totaled **0.034761 seconds** across the 16 cases;
the standalone C compilation took 16.868 seconds. The generated core itself
is unchanged from the host-call diagnostic. This is again an unpaired,
single-call diagnostic, without warmup, not a qualified speed ratio. Its
similarity to the 0.040509-second packed-host total suggests that bypassing
the host alone will not explain most of the residual cost. Profile inside
the generated core next: distinguish integer temporary/indexing and buffer
representation overhead from the translated numerical/arithmetic routines.
Do not classify all residual cost as a compiler defect without that evidence.

The first harness build failed because `<stdio.h>` followed GMP's header and
timer variables collided with workspace names; fixing those adapter issues
required no compiler or mathematical changes. This standalone check does not
qualify Windows or Wasm.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/measure_collector_core.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

### Generated-core profile

Passing `--profile` to `measure_collector_core.cjs` compiles with `-pg`, runs
100 calls per case, restores every buffer from an initial snapshot before
each call, and saves a `gprof.txt` beside the temporary executable. Resetting,
parsing and output validation are outside the entry timers, but **gprof samples
the whole process**, including those driver operations. Instrumented times are
not benchmark results. All 16 final complete states still match the oracle.

The first profile covered 1,600 calls (3.603 seconds in the instrumented entry
timers; 17.633 seconds standalone compilation). Instrumented helper counts:

| Helper | Calls |
| --- | ---: |
| `mpz_to_int64` | 16,050,600 |
| `sagejs_mpz_shift` | 10,758,500 |
| `sagejs_integer_buffer_get_mpz` | 9,160,900 |
| `sagejs_integer_buffer_set_mpz` | 2,509,400 |
| `native_pari_short_product` | 286,800 |
| `native_pari_prepared_embedding_row` | 261,600 |

The flat samples are dominated by GMP size, copy, subtraction/addition,
comparison, reallocation and arithmetic routines. Uninstrumented GMP entries
have no reliable call counts or caller attribution in this profile. Avoid
interpreting gprof's propagated inclusive times as an exact phase breakdown.

Source inspection connects two concrete paths to these observations: generic
shifts repeatedly validate/convert an arbitrary-precision count and inspect
operand bit length; packed buffer reads use `mpz_import`, while writes compute
bit length and export limbs. These are candidates for controlled diagnosis,
not permission to weaken shift limits, signed Python semantics or buffer bounds.
Next isolate a justified representation/compiler correction on identical
operands, then recheck the collector. The profile does not establish that all
remaining cost is avoidable or that the complete class-group engine is close.

### One-word read probe: useful but not the main gap

`probe_buffer_word_read.cjs` extracts the current generated packed-read helper
and compares it with an isolated candidate using `mpz_set_ui` for one-word
magnitudes when `ULONG_MAX == UINT64_MAX`. The compiler is **not changed**.
Multiword values retain import; signed values retain negation; a forced-import
build checks the fallback even on this 64-bit host. Controls include zero,
positive/negative one- and two-word values, maximum limbs, stale unused limbs,
and a previously large destination. All comparisons and checksums pass.

Three short alternating samples of two million reads plus checksum additions
took 26.17–26.30 ms for the existing helper and 20.46–20.51 ms for the candidate.
These are diagnostic microbenchmarks, not a qualified collector improvement.
The absolute saving is only a few nanoseconds per read on this workload; the
observed read count does not make it a convincing explanation for most of
the residual collector gap. Do not adopt a runtime change merely because it
wins this small probe. Next examine fixed-precision bookkeeping and shift/count
arithmetic currently represented as arbitrary-precision integers, separating
unnecessary bookkeeping cost from necessary mantissa arithmetic.

### Machine-sized short-product bookkeeping

`pari_short_product` now uses checked machine word counts and offsets after
its existing 64–2,048-bit validation. Thus `nx` and `ny` are in `[1,32]`.
For `i < nx` and `j < min(nx-i+1,ny)`, both operand extraction offsets are
nonnegative. The old test `64*(nx-1-i-j) >= 0` is exactly `i+j < nx`; the
nonnegative subtraction is now evaluated only in that branch. The other
branch still discards each product's low half separately, exactly as before.
Mantissas, accumulated products, exponents, rounding and bounds are unchanged.
Zero operands retain their original early-return semantics.

All 228 product records match PARI in CPython, generated JS and forced native
execution, and all 16 standalone collector states still match. Formatting and
strict Python pass (403 modules). Architecture checks again reach only the
known unrelated stale optimizer manifest failure.

Inspection of the generated GMP product body shows initialized `mpz_t`
temporaries decreasing from 27 to 10, with machine declarations replacing
bookkeeping. Three short alternating standalone comparisons, validating both
executables against the same fresh inputs, gave:

| Pair | Before total seconds | After total seconds |
| --- | ---: | ---: |
| 1 | 0.034453 | 0.029479 |
| 2 | 0.035082 | 0.030041 |
| 3 | 0.034607 | 0.029697 |

`compare_collector_cores.cjs PARI_DIRECTORY BEFORE_EXECUTABLE AFTER_EXECUTABLE`
repeats this diagnostic using executables emitted by the standalone runner.
The core cache identities were `e58e9d56da4269eb...` before and
`2399cd2bc8352cca...` after. These sub-second, unpinned comparisons are
encouraging but remain **unqualified**, not the plan's performance gate.
They support extending this bounded representation diagnosis; they do not
establish parity with PARI or a complete class-group implementation.

## Initial rational relations with owned generators

`pari_initialize_owned_relations` connects the existing upstream initial-cache
translation to the generator bank used by `pari_insert_smooth_relation`.
Initialization still makes exactly PARI's rational-prime relations and cache
decisions. Afterwards each rational generator `p` is stored as coordinates
`(p,0,...,0)` and its metadata becomes the one-based owned row ID. This assumes
the prepared integral basis starts with 1, as specified by the nf interchange;
it is not a conversion for an arbitrary reordered basis.

Twenty-four actual PARI factor-base/cache initializations (the existing four
fields, three bounds and two dependent allowances) match in CPython, JS and GMP.
Tests check complete bases, relations, hashes, cache state, row IDs and exact
coordinate generators, untouched unused generator slots, and rejection of an
undersized bank before cache mutation. Existing scalar-prime initialization
remains available for its original correspondence tests.
The 576 existing normalization/insertion controls also pass. Formatting and
strict Python pass (403 modules); architecture validation still stops at the
previously recorded optimizer manifest mismatch, not at a new native violation.

This resolves a representation mismatch between initialization and collection.
The collector now has a connected populated-cache test:
`check_compiled_ideal_collector.cjs PARI_DIRECTORY --initialized-cache`.
It seeds rational relations for the same prepared complete prime groups before
running the original sixteen collector scenarios. The C oracle uses upstream
`add_rel_i`; the translated paths use the owned initializer. Integer C
generators are decoded as coordinate vectors only when comparing outputs.
All sixteen populated-cache cases match in PARI, CPython, JS and GMP, including
full bases, relations, owned generators, counts, quotas/targets and idempotent
terminal state. This validates initialization-to-collection compatibility,
not upstream factor-base selection or the surrounding ideal-search schedule.

The populated mode intentionally rejects `--export-fixtures`: the existing
empty-cache timing schema and controls must not silently acquire a different
starting state. These are correctness runs, not initialized-field timing or
a complete `bnfinit` result.
The original sixteen empty-cache cases also pass after the harness extension;
documentation, syntax and parallel checks pass.

## Prepared small-norm scheduling boundary

`ideal_schedule.py` translates the reverse `L_jid` traversal and
distinguished-prime trivial-relation skip from `small_norm`. It selects the
next ideal ID; it does **not** construct/multiply ideals, perform LLL, or call
the collector itself. Its persistent schedule stops on collector success,
unresolved factorization or numerical failure; the explicit factor-attempt
exhaustion code advances like PARI's ordinary zero return.

At a new ideal, only per-ideal cursor, attempt/quota and terminal flags reset.
The current factor-list length survives; aggregate `Nsmall`/`Nfact` counters
are initialized once per schedule and retained between ideals. Relation and
generator buffers are not passed to the scheduler and cannot be reset by it.
Calling it while a collector is active fails instead of abandoning that search.

`check_ideal_schedule.cjs` checks 192 synthetic control combinations in CPython,
JS and GMP: two degrees, distinguished ideals/powers, ordinary and capped
exhaustion, success, unresolved work and numerical failures. It checks order,
the skip condition, preserved counters, active-call rejection and terminal
idempotence. This is a source-derived control test, not an actual PARI
multi-ideal trace or a complete `small_norm` translation. The control is now
connected to the packet collector below; upstream packet preparation remains
an external dependency.
Formatting, strict Python (403 modules), documentation and parallel checks
pass; architecture validation retains the known optimizer manifest failure.

## Closed prepared-packet schedule

`prepared_small_norm.py` connects the scheduler and collector in one native
call. Packet tables provide externally prepared reduced ideals, original
ideals, `G*ideal` matrices, norms and skip-first flags. The selected packet is
copied into resident working buffers before each visit. The relation cache,
owned generators, factor list and aggregate counters remain resident across
visits. This is still explicitly short of upstream ideal construction, LLL,
automorphism images and the full class-group stopping engine.

`check_prepared_small_norm.cjs` compares sixteen two-visit controls against
the pristine PARI prepared collector, CPython, JS and GMP. The same ideal is
deliberately visited twice to force duplicate handling and continuation after
a per-ideal quota. This is not a claim that PARI constructs duplicate `L_jid`
entries. Complete resulting bases, relations, exact generators, factor-list
lengths, diagnostic counts and final state match. The test requires a case
where the second visit adds relations beyond the first quota, and checks
terminal idempotence.

With `--distinct`, that checker now visits the prepared prime-2 ideal followed
by the prime-3 ideal in each of the same four fields. Both packets are prepared
independently by PARI; the test asserts equality of their shared field,
embedding and factor-base data before combining them. The pristine C control
constructs the same two ideals and retains its cache/factor list across calls.
All sixteen distinct-packet scenarios match in CPython, JS and GMP, including
complete final states and terminal idempotence. A case must gain relations on
the second visit. This tests packet switching and cross-ideal state, not PARI's
full `L_jid` selection or the distinguished-prime-power preparation branch.

The fixture exporter supports `--packet-prime=3` for this diagnostic and records
the chosen prime in provenance. Its default remains prime 2; nondefault primes
are export-only, and the populated-cache export restriction remains in place.

Formatting and strict Python pass (403 modules); architecture checks again
stop at the known stale optimizer manifest. These are correctness results,
not multi-ideal timing qualification.

## Normalization, insertion and exact generator ownership

`relation_insertion.py` connects smooth-relation assembly/content normalization
to the resident `add_rel_i` translation, for the no-automorphism-image boundary.
Each appended relation gets an owned copy of its normalized integral-basis
coordinates in preallocated generator storage. Its metadata token is the
one-based record index; preexisting rows must follow the same convention.
Reusing the mutable candidate buffer cannot change a stored generator.
The entry returns both PARI's `k` and the appended flag: a zero-return append
is retained but must not advance the ideal-search acceptance counter.

The 576 prepared transitions vary distinguished ideals, content, absent versus
present extra-factor vectors, dependent-relation allowance and duplicate
insertion. They match PARI, CPython, dynamic JS and GMP-native execution in
normalized candidates, factor lists, relation vectors, modular cache basis,
missing rank, allowance, stored records and exact generators. Tests explicitly
exercise positive acceptance, duplicate rejection and zero-return appends,
mutate candidate storage after insertion and check unused generator slots.
These are synthetic transition controls, not additional field coverage.

The metered rerun cost 4.367 user + 0.350 system CPU seconds, 4.289 seconds
elapsed and 251,812 KiB peak child RSS, including oracle compilation and cached
native loading. This is validation cost, not a comparative timing. Strict
Python (403 modules) and parallel checks pass. The search/admission entry does
not yet invoke this entry: that connection must preserve updated factor-list
length, `Nfact`, `relid`, cache-target stopping and per-ideal quota stopping.
Automorphism images, full relation loops and the class/unit engine remain
unimplemented at this boundary.
Architecture checking reaches the same stale optimizer-manifest failure.
Changed-file merge checks passed; at that commit the selected documentation
gate was still rebuilding the conservatively fingerprinted benchmark tree.
No completed documentation-gate receipt was claimed then. The gate subsequently
passed after a 7m30s build, with the same absent optional native-pack and Wasm
dependencies skipped.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_relation_insertion.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected search and smooth factor admission

`candidate_admission.py` now joins QR/bound preparation, resident enumeration,
candidate filtering/multiplication, numerical norm rounding and prepared
`factorgen` in one native call graph. Rejected admissions continue inside the
same call until a smooth candidate or the upstream search limit is reached.
The current factor-list length is resident, preserving partial-write behavior
on rejection. An unported factorization returns explicit status 2 and retains
the unresolved candidate; repeated calls cannot silently skip it. Successful
output is still before relation normalization and cache insertion.

The connected oracle uses actual prepared ideals and embeddings from the four
existing rank-two tuning fields, prime 2, a diagnostic scale of 4, 192-bit
preparation and prime decompositions through 101. It executes the extracted
PARI cursor and actual `factorgen`, recording all factor attempts. The port
receives prepared matrices and prime data, not candidates or factor answers.
It reproduces 18 smooth candidates from 356 factor attempts across those four searches in CPython,
dynamic JavaScript and GMP-native execution, comparing candidate order,
coordinates, trial/attempt counters, rounded norms, error exponents and ideal
factor lists. No unresolved factorization occurs in these four controls.
These are connected correctness tests, not seconds-scale or paired timings.
Terminal states are checked for no further mutation; a seeded unresolved flag
tests the sticky-resume guard separately from natural factorization coverage.
Strict Python (403 modules) and parallel checks pass. Architecture validation
still fails at the recorded stale optimizer manifest.
The changed-file gate selected merge and documentation checks; both passed.
Its required build completed in 7m25s, skipping absent optional native-pack
and Wasm dependencies. This does not establish portable/native-pack execution.
An overlapping focused-test attempt observed a missing compiler AST constructor
during the rebuild; subsequent validation is serialized after build completion.
The serialized final-state rerun passes all 356 attempts and 18 successes,
including the last partial factor list at exhaustion and idempotent terminal
calls. It cost 39.406 user + 1.596 system CPU seconds, 33.826 seconds elapsed
and 598,904 KiB peak child RSS. These figures include validation setup and are
not paired kernel timings.

One passing metered run cost 40.137 user + 1.196 system CPU seconds,
33.749 seconds elapsed and 610,864 KiB peak child RSS, including oracle/build
work. A preceding failed Python harness run cost another 41.919 CPU seconds;
its import setup shadowed CPython's `decimal` while decoding large prime
products, fixed by importing the standard module before changing `sys.path`.
Earlier unmetered setup attempts remain part of the disclosed accounting gap.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_candidate_admission.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Eight-active-hour coverage checkpoint

Goal accounting now reports 28,475 root active seconds (7.91 hours), plus the
previously recorded 12 panel-agent minutes: approximately 8.11 aggregate active
hours of the 16-hour timebox. No extension is assumed. The current executable
frontier is prepared ideal/embedding matrices through QR, bound selection and
resumable factor candidates. Separate translated components cover numerical
norm admission, partial factorization/valuations, relation normalization and
resident relation-cache insertion, but those components are not yet a complete
connected collector. Neither rank-two degree has a translated `bnfinit` result.

Still missing from the connected path are ideal/LLL preparation, factor
admission and its unresolved factorization cases, exact generator ownership,
automorphisms, the small/random relation loops, unit/regulator recovery,
relation linear algebra and upstream stopping/retry logic. The eight reserved
panel fields remain unused. There are no qualified seconds-scale or full-path
speed comparisons. Component agreement cannot answer the language-parity
question yet. The next integration target is candidate-to-relation collection;
new scalar translations should be driven by that path's concrete dependencies.

Compiler follow-up `4d658f3fa` fixes the production-inventory relative-import
failure described below: production's logical root name is now explicitly
registered against the authenticated physical source. The minimal regression
fails before the fix and passes after it, as does the graph-production
inventory integration test (six focused passes, one unavailable-Wasm skip).
The fix is integrated here without changing the translated mathematical source.
All 72 connected search controls pass again after integration, with the same
3 exhaustions, 48 factor-limit exits and 21 capped prefixes.

## Connected search through the factor-admission boundary

`candidate_search.py` now connects prepared QR/bound computation, the resident
enumeration cursor, primitive/scalar rejection, exact ideal multiplication and
the factor-attempt limit in one compiled call graph. It yields the next input
to `factorgen`, skipping rejected vectors inside the native call. Resuming
keeps QR data and the cursor resident. Exhaustion and the 501st nonscalar
attempt are distinct terminal statuses; repeated terminal calls leave all
buffers unchanged. The latter is a resumable-interface convention for PARI's
loop exit, not an additional mathematical stopping rule.

The 72 connected controls use the same four tuning fields, three primes and
two scales as the raw-cursor test, with initial factor counters 0/499/500.
They match PARI in CPython, dynamic JS and GMP-native execution: 3 exhaustions,
48 factor-limit exits and 21 prefixes capped at 32 factor candidates. Tests
compare candidate coordinates/order, cumulative trials, factor counters and
the final exact element. A scratch sentinel checks that QR is not rebuilt;
terminal calls are checked for no further mutation. The oracle executes the
extracted upstream cursor and uses PARI content/matrix operations. Its retained
diagnostic element is explicitly cloned across PARI stack resets; an initial
test-oracle dangling pointer was fixed before the passing run.

The passing run used 56.546 user + 2.264 system CPU seconds, 50.982 seconds
elapsed and 619,116 KiB peak child RSS, including oracle and native compilation.
The failed oracle attempt used another 3.288 CPU seconds. These are validation
costs, not paired performance measurements. Strict Python and parallel checks
pass; the known optimizer manifest failure remains visible in the architecture
gate. This still does not factor or insert a relation: `factorgen`, generator
storage, relation insertion and the surrounding collector must be connected
next. Ideal/LLL preparation and the trial scale remain external inputs.

`pnpm test:changed -- --base HEAD` selected merge and portable checks for the
new benchmark files. Merge checks passed. Portable execution failed in
`test/wasm-graph-components.cjs` while inventorying production kernels:
`native kernel: unknown relative import source` from `native-imports.cjs`,
via `wasm-production-pack.cjs`. It cancelled siblings and did not start 218
remaining files. This is an unresolved broader gate failure, not a passing
portable qualification; its preexistence has not been established here.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_candidate_search.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Candidate filtering before factor admission

`candidate_element.py` translates the block after the enumeration cursor:
test coordinate content, multiply the reduced ideal basis by the primitive
coordinate vector, reject a scalar element, and increment/check `try_factor`
before `factorgen`. It preserves the 500-attempt limit and optional diagnostic
`Nsmall` update. A nonprimitive input leaves the element buffer untouched;
a scalar input leaves the computed element but not an incremented counter;
the 501st nonscalar attempt increments the attempt counter and stops without
incrementing `Nsmall` or invoking factorization.

The 768 oracle controls use actual reduced ideal bases from the four tuning
fields and primes 2/3/7, plus explicitly scaled bases to exercise element
coordinates larger than machine integers. They vary primitive, nonprimitive,
zero and scalar candidates, enabled/disabled diagnostics and counters at
499/500. All returned statuses, element buffers and counters match PARI,
CPython, dynamic JS, GMP-native and tagged-native execution. This helper is
now wired through `candidate_search.py`; it does not call
`factorgen` or establish complete collector termination.

The repeated, metered check used 0.748 user + 0.170 system CPU seconds,
0.707 seconds elapsed and 145,340 KiB peak child RSS, including the oracle
build and cached native load. This is a validation cost, not a performance
comparison. Strict Python (403 modules) and parallel checks pass; architecture
validation still fails at the previously recorded stale optimizer manifest.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_candidate_element.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Prepared matrix to resumable candidate batches

`enumeration_batch.py` connects QR/bound preparation to the existing translated
`Fincke_Pohst_ideal` cursor in one native call graph. The first batch computes
preparation; subsequent batches keep its resident coefficients and bound and
resume at the upstream outer-loop increment. Output records contain the
cumulative trial counter and coordinates, not accepted relations. The cursor's
fixed million-trial limit is unchanged.

The oracle extracts the enumeration block directly from the pinned `buch2.c`
and executes it using PARI-computed QR/bounds. It compares up to 32 candidate
records on each of 24 prepared ideal matrices/scales, across batch sizes 1,
7 and 32. The same four tuning fields and primes 2/3/7 are retained; scales
4 and 1e6 are diagnostic inputs. The port receives the prepared embedding
matrix, not the oracle's coefficients, bound or candidate list. A scratch
sentinel checks that resumed batches do not execute QR preparation again.

The 24 prefixes and their cumulative trial counters match PARI in CPython,
dynamic JavaScript and GMP-native execution at all three batch sizes. Three
cases exhaust before the 32-candidate cap and match that exhaustion status;
the remaining cases establish prefix agreement only. Strict-Python and
parallel checks pass. The known stale optimizer manifest still prevents a
green full architecture gate.

This boundary is still scaffolding: PARI supplies ideal/LLL preparation,
`skipfirst` is supplied from the ideal's first column, and the trial scale is
prepared. Primitive/scalar rejection, candidate multiplication, factor admission
and relation insertion are not performed by this batch entry. Prefix agreement
does not establish the full collector's stopping behavior or class-group
performance. All buffers remain distinct and caller-owned; changing field or
preparation parameters requires a fresh state.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_enumeration_batch.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected QR and enumeration-bound preparation

`enumeration_preparation.py` connects the translated Householder QR to the
`Fincke_Pohst_ideal` coefficient conversions and `Fincke_Pohst_bound`.
It constructs `dbltor(T*T)`, accumulates diagonal products in source order,
computes the required higher roots, preserves the comparison against the next
diagonal, and selects the maximum with twice the second-vector norm. The
result is the one-based binary64 `q`/`v` layout consumed by the existing cursor
and its bound, computed from a prepared embedding matrix in one native call.

The first QR diagonal can remain an exact integer (observed in the actual
field cases); that integer is retained through generic multiplication. Later
comparison diagonals must be positive reals at this prepared boundary.
Coefficient-conversion rejection returns 0 and QR precision failure returns
-1; success returns the final root degree as a diagnostic work counter.
All buffers are distinct and caller-owned. No internal mathematical limit is
silently clamped.

The 180 oracle cases use four existing tuning fields, three input precisions,
three rational primes and five trial scales. The original scales 0.125/4/256
all stopped at degree two; additional diagnostic scales 1e6/1e12 exercise
continuation through degrees three and four. These large scales are branch
controls, not claimed production tuning parameters. PARI still prepares the
LLL-reduced ideal-embedding input and the supplied trial scale stands for
`4 * maxtry_FACT / ballvol`. Neither QR coefficients nor root/bound results
are supplied to the port. The independent oracle calls the actual upstream
bound routine and compares the binary64 coefficients, final bound and stopping
degree. This is not yet a complete ideal search or a class-group computation.

All 180 cases pass CPython, dynamic JS and GMP-native checks, with stop
degrees two, three and four all represented. Strict-Python and parallel checks
pass; the full architecture gate still reaches the same stale optimizer
manifest failure. No performance qualification is inferred from these tests.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_enumeration_preparation.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Higher-root iteration

`real_root.py` connects the translated `logr_abs` initializer, division by the
root degree and `mpexp` to PARI's `sqrtnr_abs` iteration. It preserves the
64-bit early return, truncation-toward-zero exponent reduction, ternary
precision mask, ordered binary powering, cubic Newton correction and final
conditional precision reduction. Intermediate roots/logarithms are computed
inside the native graph, not supplied as fixtures.

The current boundary is a nonzero real, degree 1–10 and precision 64–384 bits;
working precision remains within the existing 512-bit square leaf. Degree
one and two follow their upstream dispatch. These are explicit prototype
limits, not clamps or global safety-limit increases. The declared reciprocal,
integer-division and integer-square-root substitutions still apply.

The focused oracle has 1,600 signed-input controls at four precisions and
degrees 1–10, including endpoint mantissas, exact one, random mantissas and
both exponent signs. It compares actual PARI stored triples. The remaining
next connection is `Fincke_Pohst_bound` itself, then the QR/bound output to
the resident enumeration cursor. No completed collector or class-group result
is claimed here.

All 1,600 cases pass in CPython, dynamic JavaScript and GMP-native execution.
Repository strict-Python checks pass; the full architecture gate still fails
at the previously recorded stale optimizer-opportunity manifest.

This connection exposed a native JavaScript emitter defect: a
legal Python local named `new` was emitted literally in a JavaScript `let`
declaration, causing `SyntaxError: Unexpected token 'new'`. The root routine
now uses the more descriptive `next_accuracy`; this does not fix the general
identifier-escaping defect. The failing generated module was
`ee79cec3821098a6de1b4633c3552c5f89c5f1627bb13d887a314af7008e90d2/index.cjs`.
This was a compiler obstruction, not a PARI algorithm discrepancy. Compiler
commit `ea2e85191`, now merged into this branch, fixes reserved parameter/local
bindings in a backend-private IR copy and preserves buffer write-effect lookup
under the source names. Its regression checks the `new` failure, tuple calls,
loops, branching, replacement-name collisions and exact/Float64 copy-back.
The descriptive root local remains; no source-level workaround is required
for this reserved-binding case now. Public function-name collisions and general
runtime-helper shadowing are outside the focused correction.
After merging the correction, the connected 24-case candidate-batch oracle
still passes CPython/JS/GMP with three batch sizes and three matching
exhaustions. Compiler-focused call/import checks pass (one unavailable-Wasm
skip), while the known architecture-manifest failure remains visible.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_root.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Real logarithm used by higher-root initialization

`real_logarithm.py` translates the 64-bit entry of `logr_abs` used explicitly
by `sqrtnr_abs` to initialize its Newton iteration. It chooses the same
normalization around one, square-root count, internal working precision and
`logr_aux` odd-power series schedule. The existing source-transparent log(2)
computation supplies a resident cache; no host logarithm supplies the answer.
The scheduling estimate uses the upstream binary64 logarithm of a leading
word, separately from the arbitrary-precision result computation.

The current entry accepts only a full one-word nonzero mantissa, matching that
initializer boundary, not arbitrary-precision public `log`. Internal arithmetic
retains extra words. The higher-root iteration and its connection to the
enumeration bound are still pending. Previously declared integer quotient and
square-root substitutions remain in the dependency graph.

The 2,304 oracle controls include powers of two, tiny mantissa perturbations,
upper-endpoint tails, random mantissas, both input signs and nine exponents
from -1000 to 1000. They compare stored PARI `logr_abs` triples, not rounded
decimal printouts. This remains component correspondence, not whole-engine
performance evidence.

All controls pass CPython, dynamic JS and GMP-native execution. Mixed floating
arithmetic still lacks the tagged backend capability, so no tagged qualification
is claimed. Formatting, strict-Python and parallel checks pass; the architecture
gate retains the known stale optimizer manifest failure.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_logarithm.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Real division for the pending enumeration-bound connection

`real_division.py` implements the real quotient value operation required by
PARI's logarithm and higher-root iterations. It preserves the separate
one-word divisor path, operand-word windows, normalization and leading-word
remainder rounding. The pinned 64-bit GMP crossover is 256 bits; below it,
the small loop retains at most one extra numerator word. Exact backend integer
division replaces the upstream quotient loop explicitly. This is an arithmetic
leaf substitution, not a claim that a different division cost is a compiler
defect. Current tests establish correspondence on these controls, not a formal
proof of all limb-boundary cases.

The 6,272 controls compare seven numerator and denominator precisions in every
pairing, signed/zero numerators, signed denominators, random mantissas and
shared-leading-word/low-tail endpoint patterns against actual PARI `divrr`.
Stored outputs match CPython, dynamic JS, GMP-native and tagged-native. The
1920-bit input ceiling keeps intermediates within existing storage limits.

The numerical dependency inspection found that `Fincke_Pohst_bound` needs
`sqrtnr`, including its `logr_abs`/exponential initialization and higher-precision
iteration. Those connections are still missing; using binary64 `pow` in their
place would not preserve the requested experiment.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_division.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Householder QR connected to reduction-matrix output

`householder.py` translates `QR_init`, `FindApplyQ`, `ApplyAllQ`/`ApplyQ`, and
`gaussred_from_QR` from PARI 2.17.4 `src/basemath/bibli1.c`. It starts from an
integer/real matrix and computes the reduction matrix in one native call,
preserving the order of scalar operations, reflector applications, sign
selection and `no_prec_pb` check. It does not accept a precomputed QR result.
Integer entries remain exact until the corresponding upstream conversion.
The `mpmul` integer-zero branch is distinct from generic `gmul`: its result
is a real zero with PARI's precision-dependent exponent.

All buffers are caller-owned and must be distinct; matrix slots are row-major
triples with precision -1 denoting an integer. Requested precision is locally
limited to 512 bits by the existing square leaf, and unsupported multiword
integer/real operations still raise explicit errors. The reciprocal and integer
square-root leaf substitutions remain declared, so this is not yet a pure
language-cost comparison. Precision failure returns 0; incomplete scratch
contents on failure are not a public result.

The oracle covers 36 actual `G * (I * ZM_lll(roundG * I))` matrices from the
four tuning fields, primes 2/3/7 and requested precisions 128/192/256. PARI
still supplies these input matrices: ideal construction, LLL and embedding
multiplication are **outside** this connected QR boundary. Another 30 controls
cover dimensions 1–5, integer/real/mixed entries, zero matrices, negative
diagonals and low-precision failure. All 57 successful output matrices and
the same nine upstream failures agree across PARI, CPython, dynamic JS,
GMP-native and tagged-native execution; input buffers remain unchanged.
Formatting, repository strict-Python and parallel checks pass. The known
optimizer manifest failure still prevents a green full architecture gate.
The full collector and class-group path
remain incomplete; no new timing claim is made.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_householder.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Real square root (preceding QR checkpoint)

`real_square_root.py` translates the two exponent-parity branches of PARI
2.17.4 `src/kernel/gmp/mp.c:sqrtr_abs`, including the extra root-word rounding
in the even-exponent branch. The representation remains a signed mantissa,
whole-word precision and exponent; this absolute-value routine requires a
nonzero input. Generic `gsqrt` dispatch and its integer/zero cases are not yet
implemented. The local precision ceiling is 1920 bits to keep intermediates
within existing 64-word storage, not an increased global limit.

The underlying `mpn_sqrtrem` is explicitly replaced by an exact integer Newton
loop in ordinary Python. This is an arithmetic-leaf substitution: measurements
must distinguish its cost from compiler overhead before interpreting any gap.
It does not establish comparable square-root or collector performance.

The focused oracle compares 1,120 results against the actual PARI GMP routine
and CPython, dynamic JavaScript, GMP-native and tagged-native execution of the
same Python source. Controls cover both exponent parities, negative exponents,
both input signs, seven precisions from 64 through 1920 bits, endpoint mantissas
and seeded random mantissas. Integer-root identity/remainder controls and
explicit unsupported-input checks supplement these comparisons. QR was still
unfinished at this checkpoint; its subsequent connection is described above.
The connected collector remains unfinished.

At this checkpoint Python formatting, repository strict-Python checks and the
parallel contract check pass. `architecture:check` still stops at the previously
recorded stale optimizer-opportunity manifest; preceding architecture audits
pass. No Windows/Wasm or timing qualification is claimed.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_square_root.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Post-factorization candidate normalization

`smooth_relation.py` connects the post-`factorgen` block of
`Fincke_Pohst_ideal`: add the search ideal and optional base-ideal powers,
assemble the relation, compute candidate content, divide coordinates by it,
and subtract ramification-weighted rational-prime valuations from the
relation. Extra subfactor ideals already present in the factor list are
skipped in the second adjustment pass. The original `nz` hint is retained.

The 96-case oracle executes this block using PARI's actual `add_to_fact`,
`set_fact`, `Z_content`, `Q_div_to_int`, and `fact_update`, comparing all
mutated factors, coordinates and relation entries with CPython/JS/GMP.
It varies the search/base ideal coincidence, content 1/2/6/30 and optional
signed subfactor powers. The prime-ideal records here are synthetic prepared
prime/ramification metadata; these are block-correspondence controls, not
claims that the supplied candidate factorizations are genuine relations.

The remaining collector boundary is substantial: preparation of each search
ideal, the LLL transform, arbitrary-precision QR/Cholesky and search-bound
selection, then connecting enumeration, actual factor admission, normalized
generator storage and cache insertion. Returning prepared candidates or
passing factorgen output across an outer boundary does not complete that path.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_smooth_relation.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Factor assembly connected to cache insertion

`pari_prepared_set_fact` preserves upstream overwrite semantics for repeated
factor entries, adds optional subfactor-base powers in order, and retains the
minimum touched index even when cancellation makes that coefficient zero.
The hint is not silently recomputed. `pari_prepared_insert_fact` connects that
construction to cache insertion in a single native call; factor entries and
optional powers are inputs, not an assembled relation vector.

The `--fact` oracle exercises 192 sequential synthetic transitions, including
repeated indices, signed powers, NULL extras and cancellation. It compares
the assembled vector and hint as well as all previously checked cache state.
There are 174 normal returns and 18 matching upstream inverse failures:
PARI's unsigned pivot conversion can violate Fl_inv's documented input range
on these synthetic vectors. Exact failure identities are asserted and the
post-failure cache state is compared. They are correspondence tests, not
successful computations or proof these inputs occur in genuine collection.
CPython, JS and GMP agree with the pinned upstream outcomes.

General generator ownership, automorphism images and actual relation search
remain incomplete; this does not establish full collector performance.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_relation_cache.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 --fact
```

## Connected fresh relation-cache initialization

`pari_prepared_initialize_relations` now connects fresh basis/cache setup to
`init_rel`'s complete-prime-group loop and the translated insertion routine.
It constructs `(p) = product(P^e)` from active prime-group offsets, counts,
completeness flags and ramification indices. Relation vectors are not inputs.
For these initial integer generators, the stored generator slot contains p
itself. General field-element ownership remains a separate boundary.

The allocation rule `10*(KC+additional)+50`, missing-rank count, dependent
allowance, checkpoint and target offsets follow PARI. Caller-owned buffers
must already have that capacity; no global resource limit is raised. The
wrapper also zeroes the fresh modular basis, corresponding to the driver
operation preceding `init_rel`, and routes each relation through `add_rel_i`.
The outer automorphism branch is inactive for these integer generators.

All 24 cases (four tuning fields, three factor-base bounds, two additional
relation allowances) match actual PARI/CPython/JS/GMP for every basis entry,
relation vector, hash, generator and state offset. Inputs are prepared active
decompositions, not a completed bnf or previously known relations. This is
still not a full relation collector or class-group timing result.

At this checkpoint goal accounting reports 23,908 root active seconds
(6.64 hours), plus the previously recorded 12 panel-agent minutes. The
16-hour aggregate experiment boundary has not been reached. The frozen panel
and reserves are unchanged; full-path dependency and performance work remain.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_relation_initialization.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Resident relation-cache insertion

`relation_cache.py` translates `already_known` and `add_rel_i` over resident
buffers: backward duplicate search, modular basis reduction/insertion/cleanup,
missing-rank count, dependent-relation allowance, zero-relation bypass, and
record append decisions. The upstream strict upper-cleanup bound excluding
the last column is preserved. Generator objects remain caller-owned IDs;
field-element cloning/evaluation and the outer automorphism expansion in
`add_rel` are not implemented by this boundary. Cache storage is preallocated;
an otherwise-overrunning zero append raises explicitly.

The signed-vector oracle exposed why generic modular inversion was not a
faithful substitute. A negative signed pivot is cast to an unsigned word and
passed to `Fl_inv`; its documented `x < p` precondition is not met by those
synthetic inputs. The port reproduces `xgcduu(f=1)`'s subtract/divide schedule,
64-bit wrapping and output selection, rather than normalizing the pivot first.
Unsigned wrap in the basis update expressions is also explicit. This records
observed routine behavior, not a claim that arbitrary synthetic relations
occur in the final production path or that the filter proves exact rank.

Across 192 sequential insertions (dimensions 2/3/5/8 and two dependent-relation
allowances), status, append occurrence, every basis entry, counts, hashes and
stored vectors match actual PARI, CPython, generated JS and GMP. Tests assert
coverage of duplicate rejection, rejection without append, zero-status append
and positive status. No full collector or performance comparison is claimed.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_relation_cache.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Subfactor-base change transition

`pari_prepared_subfactor_change` now implements `subFB_change`'s preferred
ideal pass, continuation through the existing permutation, exclusion flags,
unchanged-versus-assigned distinction and dependency limits. Importantly, the
fallback pass continues at the preferred pass's index rather than restarting
at the beginning. Failure preserves the current subfactor base and change
flag; success clears that flag. A null preferred list and a present empty
list have distinct explicit input representations.

The 48-case oracle compares status, assignment occurrence, current ideals,
change flag and both limits against actual PARI/CPython/JS/GMP. It includes
four failed increases after exhausting eligible ideals, unchanged successes,
and changed selections over four tuning fields and six preferred-list states.
Historical list allocation is not represented: callers must retain previous
snapshots if needed. This remains a prepared transition, not a completed
resident relation-collection context or a performance result.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_subfactor_change.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Subfactor-base selection toward relation collection

`subfactor_base.py` translates `subFBgen`'s norm ordering, exclusion/selection
loop, yes/no permutation assembly and 16/10 dependency-trial limits. The
index sort preserves `bibli2.c:gen_sortspec`'s recursive split tree, two/three
element comparison cases and left-first tie rule, using explicit DFS frames
and resident scratch instead of recursive GEN allocation.

This boundary takes active-ideal norms in LP order and `bad_subFB` flags as
prepared inputs. It does not yet construct automorphism permutations, retain
historical subfactor bases, or implement `subFB_change`; it is not the full
factor-base context. Norm conversion is explicitly limited to positive
integers at most 2^53, rather than silently substituting exact conversion for
PARI's rounding signed-long cast outside that range.

Across the four tuning fields, four bounds, three minimum sizes and two
product targets, 96 selections, complete permutations and trial limits match
actual PARI `subFBgen`, CPython, generated JS and native GMP. The oracle uses
empty automorphism lists for this selection-only boundary. An additional 387
reverse/tied/permuted index-sort controls exercise sizes 0 through 128 and
match stable order in JS/GMP. No performance qualification is claimed.

Two compiler representation constraints were encountered: fixed slices reject
`IntegerBuffer` (they currently require native-vector storage), and a loop
variable cannot be reused with machine and arbitrary-integer range types.
A source-level three-store helper and distinct loop locals keep the code
readable without changing those compiler interfaces in this checkpoint.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_subfactor_base.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Resolved tiny-exponential guard growth

The former precision-growth failures are now resolved by an explicit, narrow
representation accommodation. An extracted upstream `exp1r_abs` diagnostic
shows `L=64` but initial `l1=128`: `setprec(X,l1)` makes `divru` consume the
adjacent `y` object's header as another mantissa word. This is not retained
precision belonging to X. We do not reproduce adjacent-object reads.

For the admitted case (`n=2`, `m=0`, X precision 64, temporary precision 128,
X exponent at most -48), that extra word cannot affect the result:

- Division is by two, an exact exponent shift preserving the leading word.
- After the schedule clamps `l1` to 64, `addrr_sign` adds the quotient to a
  64-bit one. Their exponent gap is at least 49. If the gap is at least 64,
  the upstream `l <= 2` branch returns one; otherwise its `lx = l` branch
  retains only the quotient's first mantissa word before the shift. Neither
  branch observes the extra word.
- There is only one Horner iteration. Final multiplication restores the
  original 64-bit X, so the extra word is never used subsequently.

The port therefore supplies an allocated zero guard for precisely that case,
without changing the schedule or relaxing generic truncation checks. The
diagnostic covers 160 inputs over exponents -63 through -48 and ten mantissa
patterns: all 480 comparisons (original layout, zero guard, all-ones guard)
agree. It is diagnostic C extracted from the pinned source, not a runtime
mathematical implementation or replacement backend.

After this change all 540 `exp1r_abs` and 646 connected exponential controls
match PARI/CPython/JS/GMP, with no failures. Native GMP now matches all 52
connected inverse-residue stored results exactly. JS matches 50 and retains
the two documented logarithm-driven divergences. Earlier sections below
record the prior checkpoint failures; this section supersedes their counts.
This does not establish whole-class-group completion or performance.

```sh
node bench/pari-class-group-port/probe_exponential_precision.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Binary64 ingress and connected inverse residue

`pari_float_to_real` constructs PARI `dbltor`'s exact stored triple, including
subnormal normalization, signed-zero collapse and nonfinite rejection.
The current representation substitution finds the exponent by a bounded
binary search over exact powers of two rather than C-union bit access. It
therefore has a different conversion cost, explicitly excluded from a claim
that only the language changed. All 12,392 bit-pattern controls agree with
PARI/CPython/generated JS/GMP: every exponent encoding with zero, minimal and
maximal fraction fields, both signs, and every single-bit subnormal.

`pari_prepared_inverse_residue` now connects the accumulated logarithm,
binary64 ingress, and the real exponential in one native call. Prime
decompositions and cached logarithms remain prepared inputs. It returns the
processed count and complete stored result; hR normalization is still absent.
On the existing 52 controls, native GMP has 49 exact PARI results and three
explicit precision-growth failures (field 0/bound 5, fields 2 and 3/bound 3).
Generated JS has 49 exact results, two divergent stored results and one
failure. The two divergences are the already observed bound-3 logarithm/work
differences; separately labeled CPython logarithm replay matches the JS path.
All failures and divergence identities are asserted, so a new failure cannot
silently become a passing test. This is incomplete connected coverage, not
successful qualification of the whole residue routine or class-group engine.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_float_ingress.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_residue.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected prepared-real exponential

`exponential_entry.py` connects `modlog2` and the `mpexp` base case:
upstream binary64 quotient selection, computed cached log(2), real subtraction,
`exp1r_abs`, addition of one, reciprocal for negative remainders, exponent
shift and conditional precision reduction. Zero inputs retain `mpexp0`'s
precision convention. The input remains a prepared real triple, not yet the
binary64 ingress used by the residue computation. Caller-owned scratch stays
resident. Inputs above 1920 bits are explicitly outside this base-case port.

The checker compares 646 inputs (321 sixteenth steps from -10 to 10, 202
signed powers of two, and 123 eighth steps at 128/192/512-bit precision).
Of these, 642 produce identical stored result triples
in PARI 2.17.4, CPython, generated JavaScript and GMP native execution. Four
inputs, precision 64 and exponent -60 or -50, explicitly fail at the existing
`exp1r_abs` truncating-precision growth boundary. They are recorded failures,
not omitted cases or successful computations. No timing claim follows.
The reciprocal's previously documented integer-division substitution remains.

Compiler prerequisite `97858eab0` permits the actual diamond imports of shared
real-arithmetic helpers. The focused import regressions pass; the architecture
gate still fails at the previously recorded stale optimizer manifest.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_exponential_entry.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## PARI real-to-binary64 conversion

`float_conversion.py` preserves the 64-bit `rtodbl` path: rounding from the
leading mantissa word alone, carry into the exponent, positive-zero early
underflow, the special exponent -1023 bit construction, and overflow at
exponent 1023. It constructs the same binary64 value arithmetically rather
than aliasing a C union. This is intentionally not a generic correctly-rounded
real conversion with a full subnormal range.

The oracle compares 528 conversions bit-for-bit in PARI/CPython/JS/GMP,
covering both signs, four input precisions, guard-bit neighbors, exponent
boundaries, signed zero and overflow. Low mantissa words are deliberately
present in the multiword cases. Range reduction still needs to call this
conversion and the computed logarithm constant; the full exponential remains
unconnected.

Compiler prerequisite `f31caa9f9` supports explicit OverflowError and fixes
Float64 result publication from mixed exact kernels. Its regressions retain
the rejection of buffer-bearing Float64-returning helpers pending effect
qualification; this port uses scalar inputs only.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_float_conversion.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Computed logarithm-of-two constant and resident cache

`logarithm_constant.py` connects PARI's three `atanhuu` calls, their exact
18/-2/8 combination order, one-word guard precision, `affrr` rounding and
`mplog2` result copying. A caller-owned three-entry cache replaces PARI's
global clone; it retains higher precision across smaller requests. No table
or host logarithm substitutes for computing the constant.

Twelve increasing/decreasing precision requests through 1984 bits match
actual PARI in CPython, JS and GMP, including both result triples and full
cache state. Warm calls also succeed with no series scratch, checking cache
reuse. Caller-owned buffers use explicit limb capacity; global limits stay
unchanged. Cache/input buffers are private resident state, not external proof
objects. The final range reduction and exponential entry are still pending.

Compiler prerequisite `a01b73d63` propagates mixed Float64 requirements through
native dependencies: an integer-only wrapper now uses GMP when a callee needs
Float64, instead of attempting an unsupported tagged call. Tagged mixed
execution remains explicitly unavailable, not silently redirected.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_log2_constant.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Resident binary splitting and connected atanhuu

`binary_splitting.py` translates `abpq_sum`, including the distinct one-,
two- and three-term formulas and the original midpoint splits. An explicit
depth-first stack replaces recursive stack frames, retaining multiplication
association and the four unreduced P,Q,B,T results. Input arrays are not
mutated. Scratch must be separate from inputs; the 4096-term experimental
boundary uses a conservative 91-entry stack allocation.

The oracle compares 256 intervals against actual PARI, CPython, JS, GMP and
tagged execution, covering small cases, odd/even splits and nonzero starts.
An all-one 4096-term control and exhausted-storage checks exercise the depth
boundary. This is not a binary-splitting performance claim.

`pari_atanhuu` connects PARI's binary64 term selection, coefficient setup,
splitting and rational-to-real conversion. Twenty outputs match actual PARI,
CPython, JS and GMP: five precisions through 512 bits and arguments 1/26,
1/4801, 1/8749 and 2/3. The first three are the actual log(2) construction
arguments. Its input integers are explicitly restricted to exact binary64
conversion and it rejects more than 4096 terms. Tests supply 64-word entries
for large intermediate scratch values; the default per-entry capacity and
global safety limits are unchanged. Mixed Float64 tagged execution remains
unavailable. The log(2) combination/cache is connected in the checkpoint
above; range reduction remains pending.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_binary_splitting.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Rational conversion for logarithm-of-two construction

`real_conversion.py` follows `affir` and `rdiviiz`'s branch selection: a
single-word denominator uses `divru`, oversized integers use `divri`, and
the remaining case uses a scaled exact quotient before real conversion.
Signs and guard-bit rounding are retained. The direct word-division helper
now accepts the full unsigned 64-bit range; `divri` still routes its high-bit
integer operands to its existing big-integer branch, as upstream does.

The test compares 1,248 rational conversions against actual PARI and
CPython/JS/GMP/tagged execution, spanning zero, signs, 63/64/65-bit boundaries,
and numerator/denominator sizes on both sides of the branch thresholds.
Integer arithmetic uses the existing backend; no new language-only timing
claim follows. PARI's binary-split `atanhuu` sums are connected in the
checkpoint above, along with cached `constlog2` construction. No
constant table substitutes for their computation.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_conversion.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Reciprocal dependency

`pari_real_reciprocal` represents `invr_basecase`'s result, retaining the
separate one-word case, leading-remainder-word rounding and exponent/sign
normalization. **Exact integer division substitutes for PARI's quotient-word
loop.** This is a disclosed arithmetic leaf substitution, not evidence of
language-only performance equivalence or a line-for-line division port.

The oracle invokes actual `invr` on 560 controls: precisions 64, 128, 192,
256, 512, 1024 and 2048; both signs; leading-one, adjacent and all-one
mantissas plus deterministic random mantissas. CPython/JS/GMP/tagged outputs
agree exactly with PARI, including stored precision and exponent. This spans
the pinned 256-bit GMP division crossover but does not prove equivalence on
every possible quotient/remainder. Zero is explicitly rejected. The chosen
precision ceiling remains below the upstream inverse-Newton path.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_reciprocal.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected exponential series (not yet the exponential entry)

`pari_exp1r_abs` translates `trans1.c:exp1r_abs`: binary64 term/scale selection,
precision-changing Horner evaluation, repeated doubling, and final `affrr`.
It retains the original full X mantissa while temporarily reducing precision.
It uses the translated real arithmetic, not MPFR exp or a replacement series.
The compiler prerequisites include direct imported `math.log2` and sharing
identical helper definitions reached through multiple entries of one module.

Across 540 predeclared synthetic controls (five precisions, 18 exponents,
three mantissas, both signs), 534 outputs match actual PARI 2.17.4 exactly in
CPython, JS and GMP, including stored precision and exponent. Six controls
at 64-bit precision and exponent -63 fail explicitly in every port path:
upstream selects initial `l1=128` with `L=64` and changes X's header beyond
the retained value precision. The current representation cannot reproduce
that operation; it does not silently pad or claim equivalence. The test
freezes these six failures and rejects new failures or output disagreements.
This observation is not yet an upstream memory-safety diagnosis.

`modlog2` and the full `mpexp` entry remain dependencies; the constant is now
connected above. These series checks are not a complete residue
calculation, class-group computation, or performance qualification.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_expm1.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Exponential precision primitives

`exponential.py` begins the direct base-case port with `rtor`/`affrr` and
shrinking `setprec` value operations. The former pads on growth and rounds
away from zero on a set leading guard bit when shortening, including carry
renormalization. The latter truncates without rounding. A zero passed through
`affrr` retains the smaller of its previous exponent and minus target precision.

The test compares 460 controls against actual PARI, CPython, JS, GMP and tagged
execution, including signs, halfway mantissas, all-one carries, precision growth
and zero-exponent changes. Growing `setprec` is not modeled as a value operation:
upstream restores still-retained allocation words, so the future series port
must retain its complete X separately. Zero value triples do not represent
allocation length. These are explicit representation boundaries, not permission
to discard precision restoration in the exponential.

Eight invalid precision/mantissa requests are also rejected by CPython and
all three execution backends. Strict Python validation passes (403 modules).
The architecture check passes its native/FFI/Wasm audits but still fails the
existing stale optimizer-opportunity manifest; that unrelated manifest has
not been regenerated to hide the failure.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_real_resize.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Final exponential dependency: MPFR is not bit-identical

`check_residue_exponential.py` observes the actual `mpexp` input/output from
52 existing residue controls and 523 synthetic binary64 inputs. It compares
against MPFR 4.2.2 via gmpy2 2.3.1 at the PARI output's stored precision.
This is an arithmetic interchangeability diagnostic, not a port, benchmark,
or proof that a discrepancy changes a class-group stopping decision.

On this run, 29/52 residue outputs differ in exact stored value; seven still
differ after rounding PARI's output to 64 bits and comparing with a 64-bit
MPFR exponential. Overall 49/575 differ at stored precision and 11/575 after
64-bit rounding. PARI sometimes returns increased storage precision (128 bits
for several residue cases, higher for tiny synthetic inputs); this must not
be confused with a guarantee of correctly rounded accuracy at that precision.
Representative residue relative differences are around 1e-22 to 1e-21.

Consequently, silently replacing this leaf by MPFR exp would not preserve the
current exact-representation contract. The direct path to investigate is
`mpexp_basecase` → `modlog2` and `exp1r_abs`, reusing translated real arithmetic
and preserving precision changes. A later explicit primitive substitution
would need its own divergence account; this diagnostic does not authorize one.
The full class-group path remains incomplete.

```sh
python3 bench/pari-class-group-port/check_residue_exponential.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected residue-bound selection

`residue_bound.py` translates `tailresback`, `tailres` and `primeneeded`.
The pinned source passes several analytic coefficients into integer-typed
parameters of `tailresback` in a surprising order. This port deliberately
retains that order and truncation; it does not repair upstream mathematics
while claiming work equivalence. The 31 constants are copied from the pinned
table and loaded into caller-owned scratch once per search. That initialization
differs from C static storage and is not hidden in a language-only speed claim.

The standalone oracle calls actual upstream routines on 238 degree/signature/
log-discriminant parameter controls (degrees 2–10), checking 7,616 tail values,
including the table-to-zero transition at index 31. CPython, JavaScript and
GMP agree on selected bounds and threshold decisions; these synthetic parameter
controls are not new number-field corpus entries or general performance data.

`pari_prepared_residue_front` now selects the bound and runs the accumulation
in one native call. Four existing tuning fields match PARI/CPython/JS/GMP on
the selected bounds, processed-prime counts and logarithmic results. Only
decompositions and LOGD remain prepared inputs; cached logarithms and tail
coefficients are computed inside this connected front. The prior bound-3
mixed-library replay divergence remains reported in the separate controls.
The final PARI-real exponential and hR normalization are still unported.

Compiler prerequisite `58bafbf92` permits ignored scalar results of known
source-native calls, supporting ordinary scratch-initialization statements
without fake assignments. Unknown callbacks and tuple/resource-result disposal
remain rejected; mutation and error propagation are checked against CPython.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_residue_bound.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Inverse-residue accumulation and a numerical work divergence

`residue.py` translates the binary64 accumulation in `compute_invres`, up to
but not including `mpexp(dbltor(loginvres))`. The final exponential must retain
PARI-real precision semantics; binary64 `exp` is not a substitute. The residue
bound and cached decompositions/logarithms remain prepared inputs in this
standalone test. The bound selector is now connected above; the final
exponential remains a dependency, not omitted work in a claimed
whole-engine timing. The explicit experimental bound range keeps integer p*p
exactly convertible to binary64; unsupported ranges fail rather than clamp.

The oracle includes the actual pinned `buch2.c` and observes the input to
`mpexp` with a wrapper that still calls the original exponential. On four
existing tuning fields and 13 bounds (2 through 10,000), all 52 native GMP
accumulations match PARI and CPython within the documented numeric tolerance,
with exact agreement on the number of processed rational primes.

**JavaScript does not perform identical work on four of these controls.** At
bound 3, `Math.log(3)` rounds below the cached PARI `log(3)`. Truncating their
ratio gives zero instead of one, so the fallback visits one rather than two
primes. The test reports these divergences and compares fallback arithmetic
against a separately labeled CPython replay using the JavaScript bound-log
value. This replay is a diagnostic, not work-matched performance evidence.
The mathematical source is unchanged and no comparison threshold is adjusted
to hide the branch difference. It illustrates why matching final values alone
does not establish matching upstream work.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_residue.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Connected initial factor-base selection

`initial_base.py` connects initialization constants and logarithms, GRH bound
search, the `nthideal` lower limit, the initial relation/checking-bound
adjustment and `FBgen` selection in one isolated Python-source computation.
The prepared boundary supplies LOGD and cached decompositions, not selected
bounds or factor-base answers. The output includes both bounds, all selection
counts, the active prime product and indices of the selected prepared ideals.

`nthideal` retains upstream reverse residue-degree traversal and forward
in-place norm insertion, including the unusual prefix writes. Its scratch
array uses upstream one-based entries; index zero is scratch, not a GEN header.
The `upowuu` leaf uses exact multiplication with the upstream unsigned-64-bit
overflow-to-zero convention; this is a disclosed leaf substitution, not a
language-only cost comparison. Missing prime coverage fails explicitly.

The expanded GRH driver checks 32 `nthideal` controls against actual PARI,
CPython, JS, GMP and tagged execution. The factor-base driver's `--initial`
mode checks the combined path on four existing fields with cbach 0, 0.3 and
13 (including upstream clamping to 12 and raising cbach2). The full prime
selection metadata is compared, not just the class-number-independent counts.
Large oracle prime products use a bounded 20,000-digit CPython serialization
allowance; no native memory or arithmetic limit is raised.

This is still **partial initialization**: prime decomposition/cache growth,
inverse-residue computation, ball volume, sub-factor-base preparation,
automorphism state and retries remain outside this connected segment. In
particular, skipping the intervening inverse-residue work is explicit
scaffolding, not equivalent whole-initialization timing. Mixed tagged execution
is still unavailable and no whole-field speed conclusion follows.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_factor_base.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 --initial
```

## GRH checking and initial bound-search checkpoint

`grh_bound.py` translates `buch2.c:GRHchk`, `GRHok`, and the initial
`Buchall` doubling/bisection/final-clamp loop. Upstream mathematical assumptions
remain provisional. Prepared inputs include the distinct residue degrees and
multiplicities, cached prime logarithms, `init_GRHcheck`'s cD/cN, and the initial
and maximum limits; they are not completed bounds or class-group answers.
Prime-decomposition cache construction is still external scaffolding.

The bound-one case preserves C's positive-infinity comparison without causing
a Python zero-division exception. Catalog exhaustion and unsupported bounds
raise explicit errors, not mathematical rejection. Exact norm multiplication
replaces the small `upowuu` leaf, with admitted bounds limited to the exact
binary64 integer range; no timing equivalence is asserted for that leaf.
The two upstream `pow` expressions retain their order and are not replaced by
an exponentiation recurrence. Compiler prerequisite `6ae5b81fe` adds imported
binary64 `log`/`pow`; the existing source-transparent sqrt helper is called
inside the isolated computation.

Four existing tuning fields give 1,200 checks (bounds 1 through 300) and 24
searches (six initial limits), matching actual PARI 2.17.4 `GRHchk`, CPython,
JS and GMP. The C search oracle reproduces the short upstream control loop
around the actual checker. These controls establish decision agreement on
those inputs, not bitwise logarithm/power equality across platforms. The full
initialization and discovery engine remain incomplete; this does not qualify
whole-field performance or open the reserved fields.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_grh.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Factor-base selection loop

`factor_base.py` translates the selection loop of `buch2.c:FBgen`, retaining
the distinction between relation bound C1 and checking bound C2, inert-prime
exclusion, residue-degree truncation, the complete-prime-group flag, zero-based
offsets for one-based factor indices, KC/KCZ/KCZ2/KC2, and the active
rational-prime product.
It returns indices into prepared prime decompositions rather than constructing
new ideals. The source preserves the upstream `KC == 0` sentinel behavior
instead of replacing it with a generic crossed-bound flag.

The actual `FBgen` oracle checks 64 combinations of the four existing fields,
eight bounds and equal/split relation bounds. Selected prime-ideal identities
are compared against the full prepared decompositions, not just their degrees.
CPython, generated JS and GMP agree on all selection metadata, including
partially included prime groups and different active/checking sizes.

This declared-bound selection-loop test is **not complete factor-base setup**;
the new connected initial-selection driver is described above.
The decomposition cache, `log(C2+0.5)` and cached prime logarithms are explicit
PARI-prepared inputs; the division and integer conversion of that logarithmic
ratio run in the port. Auxiliary setup such as the ball-volume scalar and
sub-factor-base preparation is still outside this loop. These controls use
declared bounds, not a claim to have reproduced `Buchall`'s chosen bounds.

This reveals a compiler capability gap relevant to connecting the engine:
mixed exact/Float64 functions currently have JS and GMP execution but no tagged
native backend. The test explicitly asserts the capability rejection on valid
inputs; it does not count tagged execution as passing or silently substitute
another target. No timing conclusion is inferred from that missing capability.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_factor_base.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Prepared factorgen through prime-ideal admission

`ideal_admission.py` connects the numerical front through rational norm
factorization and the `divide_p_elt/id/quo` valuation logic. Supported prepared
`factorgen` calls now run from embedding matrix and element coordinates to
prime-ideal factor-base indices/exponents in one isolated native call. The
caller still prepares the field and factor base. There is no relation search,
relation-lattice update, unit recovery or class-group termination loop yet.

Status zero is upstream rejection, one upstream admission success, and two
an explicitly unported factorization path. **Status two is not rejection** and
must not let a future collector skip a candidate as though PARI rejected it.
Smooth multiword norms remain unfinished. The flat prime-group offset added to
the valuation helper permits borrowing the complete prepared table without
copying a separate group before every rational-prime dispatch.

`check_compiled_can_factor.cjs` includes the pinned `buch2.c` in its test
oracle and calls the actual static upstream functions, not a recreated control
loop. Four existing fields, all rational primes through 101, three truncation
patterns, three element/ideal/quotient modes, and six scaling exponents give:

- 216 `can_factor` controls: 78 successes, 117 rejections, 21 explicit
  unresolved factorizations;
- 144 `factorgen` controls (element and quotient modes): 26 successes,
  100 rejections, 18 explicit unresolved factorizations;
- eight rejection controls in each set preserve nonempty partial factor lists.

Six `factorgen` rejections occur at the numerical gate on valid large-coordinate
inputs and retain the incoming factor count/list. These are distinguished from
the eight partial-write rejections after entering `can_factor`. Scaling exponents
are 0, 1, 2, 3, 20 and 60; the original one-prime and numerical-front tests
remain unchanged and pass after this connection.

All supported outcomes agree with PARI, CPython, JS, GMP and tagged execution,
including counts, one-based indices, exponents and the numerical norm/error
pair. The unresolved cases are reported separately rather than compared as
successful completed outputs. Full and truncated prime-ideal tables exercise
the same admission routine; these **control factor bases are not PARI's
selected production factor bases**. This is correctness coverage across the
two rank-two degrees, not a whole-field or expensive-workload timing result.
The earlier 574 one-prime controls remain passing after the offset refactor.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_can_factor.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_can_factor.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 --factorgen
```

## Connected admission-front checkpoint

Compiler prerequisite `039a18502` supports explicit relative imports in regular
Python packages. `bench/pari-class-group-port/admission.py` now connects the
prepared matrix/embedding norm, ideal-norm division, rounding gate, `Z_ppo`
smoothness check and word-factorization stages inside **one native call**.
Numerical and factorization source remains in separate ordinary Python files,
with imported source provenance and hashes retained by the compiler. No helper
calls back through Python or JavaScript inside that native invocation.

The return includes an explicit stage, not a class-group or relation-success
flag: numerical rejection, nonsmooth rejection, unresolved factorization, or
completed *rational norm* factorization. Prime-ideal division and relation
storage remain to connect. Multiword norms stop explicitly after smoothness;
they do not enter a substituted trial-factor algorithm. Numerical rejection
retains the incoming count, matching the fact that `factorgen` has not reached
`can_factor`'s reset yet. Factor outputs here are rational primes, not indices
of prime ideals in the factor base.

The 344 connected controls use the original four prepared fields and two fixed
support products: one, and twice the largest prepared odd-prime trial product.
These supports test the stage boundary; they are **not** claimed to be PARI's
selected field factor bases. An initial all-rejection test exposed the missing
factor two in the fixture support, which was corrected before counting this as
factorization coverage. Twelve additional controls use the second integral
basis vector scaled by 1, 2 and `2^20`, with ideal norm one. The existing 160
rounding controls are retained unchanged.

Results against direct PARI numerical/smoothness/factorization stage oracles,
CPython, generated JS, GMP and tagged execution:

- 118 numerical rejections;
- 151 nonsmooth rejections;
- eight complete rational norm factorizations, spanning degrees three and four;
- three explicitly unresolved smooth multiword norms;
- 64 expected input errors: the old deliberately oversized ideal-norm controls
  round to zero and are outside `can_factor`'s nonzero-norm precondition.

The test asserts that every category occurs. It does not call a completed PARI
class-group engine, claim matching candidate discovery or qualify performance.
This is a connected dependency checkpoint, not completion of `factorgen`.

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_admission.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Boundary diagnostic (not qualified performance evidence)

Follow-up compiler `1c97354a8` removes unconditional promotion at small GCDs.
With the same diagnostic inputs, tagged batched samples are now 0.05626,
0.05666, 0.05576s (previously about 0.101s); GMP stays 0.20486, 0.20339,
0.20385s. Direct PARI samples were 0.01843, 0.01831, 0.01829s. All 574 cases
and partial writes still agree. The compiler's focused GCD/shift/bit-length/
exception tests pass, including Linux ASan/UBSan signed-boundary and aliasing
checks. These remain short diagnostic samples, not a qualified slowdown ratio.

`check_compiled_divide_prime.cjs --diagnostic` compares the same 574 checked
cases, 20 fresh logical calls each, with prepared read-only inputs and reset
factor counts. Packed scratch is reused; the batch helper performs those 20
calls inside one native invocation. Three short samples on local CPU 0 gave:

| Execution | Seconds for 11,480 logical calls |
| --- | --- |
| Direct PARI C helpers | 0.01873, 0.01857, 0.01829 |
| JS, public call each | 0.7481, 0.6382, 0.6259 |
| JS, batch of 20 | 0.5348, 0.5334, 0.5396 |
| GMP, public call each | 0.4344, 0.4383, 0.4266 |
| GMP, batch of 20 | 0.2040, 0.2045, 0.2044 |
| Tagged, public call each | 0.3066, 0.3137, 0.3049 |
| Tagged, batch of 20 | 0.1009, 0.1009, 0.1004 |

These are diagnostic observations: short/nonalternating samples, diagnostic
PARI build, no matched plain-C GMP control, and no expensive full-field path.
They **do not** qualify the plan's performance threshold. They do demonstrate
that removing most host crossings does not remove the entire observed gap.
Generated core size for the batch version was 1,578,760 bytes. A temporary
machine-sized-degree annotation control gave approximately 0.185s GMP/0.096s
tagged batched and a larger core (1,630,782 bytes); it was not retained on this
limited evidence.

The small-GCD promotion issue identified by this diagnostic is fixed above.
Packed large-value reads/writes still import/export GMP limbs. Tagged storage
already has a direct small-integer path, so conversion
cannot be assumed to explain the entire small-case gap. Profile or isolate
these costs before attributing them to the language or changing mathematics.

## Word-factorization front checkpoint

`bench/pari-class-group-port/factorization.py` translates the initial
`ifactor1.c:factoru_sign` stages: stripping powers of two, prepared prime-table
membership, the exact `tridiv_boundu` cutoffs, product-GCD extraction with a
recursive fast-disabled call, and ordinary `u_lvalrem_stop` trial steps.
The prepared prime catalog and cumulative products are input-independent
arithmetic constants obtained from the pinned PARI build, not supplied input
factorizations. Binary search, scalar power-of-two stripping, and the corrected
rounded square-root leaf are explicitly substituted arithmetic implementations;
this is not evidence of matching arithmetic-leaf performance.

The checkpoint returns `(count, unresolved_cofactor)`. A residual other than
one means **incomplete**, not a prime or an accepted relation. It stops before
the second prime-iterator pass, generation beyond the prepared catalog,
and later factor-search paths. Multiword factorization also remains
unported. It is not yet connected to `can_factor`.

`check_compiled_factor_front.cjs` checks 138 inputs with both fast settings,
including prime powers around trial boundaries and an existing output prefix.
All 276 cases agree across CPython, generated JS, GMP and tagged execution:
274 complete factorizations agree with PARI `factoru`; two retain explicitly
unresolved cofactors. Every extracted prime/exponent is checked against PARI,
and extracted powers times residual reconstruct the original input. The test
does not claim upstream intermediate-trace equality or performance qualification.
The CPython oracle preloads the standard `decimal` module before adding the
Sage.js source path (which contains its own `decimal` module); a bounded 100,000
decimal-digit conversion allowance applies only to this test's prepared prime
products. No native arithmetic safety limit is raised.

The connected word primality decisions retain `prime.c:_uisprime`'s three
Miller–Rabin threshold/base sets and its larger-word base-two/Lucas branch.
The port follows `get_disc`, `u_LucasMod_pre`, `uislucaspsp_pre`, and
`arith1.c:krouu_s`, including the 65th discriminant attempt's square check,
the `2^64-1` rejection, and the Lucas sequence's ordered updates. The caller
passes actual `maxprimelim`, preserving its distinction from the final stored
prime. The prime-673 shortcut and terminal `oldi != i` check are now connected
to factorization. A complete factor result still does not mean the remaining
factor-search algorithms are implemented.

`check_compiled_word_prime.cjs` checks 616 ordinary/no-small-prime decisions
against actual PARI `uisprime`/`uisprime_661`, CPython, JS, GMP and tagged
execution. Inputs cover all threshold neighborhoods, strong pseudoprimes,
large squares, unsigned-word boundaries and 128 deterministic extra odd words.
Another 259 direct Lucas controls exercise this branch even when the preceding
Miller–Rabin test would reject, including the discriminant square escape.
The no-small-prime entry is tested only with its upstream precondition.
The modular-power leaf currently uses exact binary powering, and modular
products use exact multiply/remainder rather than PARI's precomputed word
reduction. These declared leaf substitutions prevent a language-only timing
claim; no such performance claim is made here.

Two additional compiler restrictions were encountered without requiring a
compiler change in this checkpoint: exact-integer bitwise AND is unsupported
(the same bit predicates are expressed using small remainders), and `break`
inside a range loop is unsupported (the prime iterator uses a while loop).

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_factor_front.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_compiled_word_prime.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

## Prime-group admission loop checkpoint

`pari_prepared_divide_prime` connects the element and HNF valuations through
`buch2.c:divide_p_elt`, `divide_p_id` and `divide_p_quo`. It retains prime order,
one-based factor indices, early success when the remaining norm valuation is
zero, and partially appended factor entries on failure. The quotient branch
retains the upstream zero-element-valuation skip before calling idealval.

574 controls match the **actual static upstream helpers**, compiled into an
untimed driver by including the pinned local `buch2.c`; the oracle does not
reimplement their admission loops. It exercises complete and truncated prime
groups, three modes, and an existing factor entry before appending. CPython,
generated JS, GMP and tagged outputs agree, including failure-side writes.
The prepared group and norm's rational-prime valuation remain supplied inputs.

Integer factorization is still a dependency: `absZ_factor` enters PARI's
word/multiword factoring systems, including fast product-GCD trial division,
primality tests and subsequent factor algorithms. Sage.js's existing FLINT
integer-factorization entry is a host callback, not a declared isolated-core
call. Neither opaque host factorization nor trial division is silently inserted
into this path. This checkpoint does not complete `can_factor` or `factorgen`.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_divide_prime.cjs <pari-2.17.4-source>
```

## Integral-HNF ideal valuation checkpoint

`pari_prepared_hnf_valuation` now follows `idealval`'s integral matrix branch:
remove content, handle inert primes, compute Zval/Nval bounds, and execute
`idealHNF_val` with per-column primitive parts and shrinking prime-power
moduli. Signed remainders follow PARI's truncation convention rather than
Python's nonnegative remainder. The caller supplies disjoint packed scratch.
Scalar p-valuations currently use repeated division and initial prime powers
use repeated multiplication; these are explicit arithmetic-cost differences,
not evidence of language-only overhead.

406 HNF controls agree with PARI in CPython, JS, GMP and tagged execution. They
include powers through exponent 257, multiplication by another prime above the
same rational prime, and scalar content. The 406 element-valuation controls
remain green. Nonintegral ideal conversion and the other `idealtyp` dispatch
branches remain outside this entry, and prime decomposition is still supplied
by PARI preparation. No full relation or class-group computation is claimed.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_valuation.cjs <pari-2.17.4-source> --hnf
```

## Prepared prime-ideal valuation checkpoint

`valuation.py` translates `base3.c:ZC_nfval`'s no-remainder path from prepared
`pr_get_tau` multiplication matrices, including inert primes, ordered exact
row products, periodic rational-prime stripping and ramification weighting.
`gen_pvalrem_DC` uses an explicit caller-owned stack with the same descending
division/squaring and unwinding order, rather than recursive allocations.
This does not compute prime decompositions or ideal valuations of general
nonprincipal ideals; those remain preparation/dependency boundaries.

406 controls use prime ideals over 2,3,5,7,11,13,17,19 in the same four tuning
fields and candidate scales through `p**257`. They include inert and ramified
primes, signed and zero coordinates, and high-valuation stripping. Results
match direct PARI `ZC_nfval` in CPython, generated JS, GMP and tagged execution.
Scratch is explicit disjoint packed storage (64 words per slot, 32 stack slots
in this control); the default 8-word scratch capacity correctly rejected the
larger cases. No internal limit was relaxed.

The `p=2` scalar valuation leaf currently uses exact repeated halving instead
of PARI's trailing-zero primitive. This is a declared representation/cost gap,
not equivalent instruction counts or a compiler-only slowdown claim. None of
these controls is a timed full relation-collection or class-group computation.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_valuation.cjs <pari-2.17.4-source>
```

## Smoothness precheck checkpoint

Compiler prerequisite `62cdc3d74` adds explicitly imported two-argument
`math.gcd` lowering to the isolated GMP core, with exact JS fallback and guarded
tagged resumption. This enables direct translation of `base4.c:Z_ppo` and
`can_factor`'s initial smoothness gate. The port preserves the progressively
shrinking GCD operand and exact-division sequence. GMP GCD is an arithmetic
backend substitution; its cost must be separated from compiler overhead.

168 signed inputs, including prime powers above 1000 bits and nonsmooth
cofactors, agree with direct PARI `Z_ppo` in CPython, JS, GMP and tagged
execution. Zero norm and nonpositive factor products are explicitly outside
the prime-to-part entry's contract; upstream can_factor assumes nonzero norm.
This smoothness precheck remains separate from the connected numerical entry
at this checkpoint. Integer factorization and prime-ideal valuations are next;
passing the precheck alone is not relation admission.

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_smoothness.cjs <pari-2.17.4-source>
```

## Connected numerical gate checkpoint

`pari_prepared_factorgen_numerical` now connects the prepared embedding matrix,
integer coordinates, embedding norm, optional ideal-norm division and `grndtoi`
through `factorgen`'s `e > -32` rejection in one source-transparent native call.
The rounding function moved into the same compilation unit rather than keeping
duplicate bodies. Both small and large `divri` routes are translated; the large
route preserves divisor truncation and PARI's leading-word remainder comparison,
not a substitute correctly-rounded quotient.

The 32 existing matrix/vector controls are each exercised with absent NI, NI=1,
3, `2**63`, and `2**160+7`: 160 cases agree in CPython, generated JS, forced GMP
and tagged execution, including intermediate embedding rows. There are 101
numerical passes and 59 rejections. These NI values are synthetic arithmetic
controls, not a claim that each is the norm of an ideal containing its candidate.
A pass means proceed to `can_factor`, **not** accepted relation or certification.
The arithmetic control additionally checks 3,496 operations, including 1,824
divisions with seeded multiword divisors longer than the real mantissa.

Reproduce the connected check:

```text
SAGEJS_FLINT_PREFIX=<prefix> node bench/pari-class-group-port/check_compiled_gate.cjs <pari-2.17.4-source>
```

Remaining boundaries: smoothness/factorization, prime-ideal valuations, relation
state and collection, unit/regulator work, linear algebra, and stopping. This
is still an untimed prototype, not an expensive connected-segment qualification
or an independent class-group implementation. The earlier small-divisor-only
restriction below is superseded at the general entry; the private word helper
still rejects that separate route. No production behavior changes.

Validation after this connection: 75 original rounding controls, 3,496 arithmetic
controls and 160 connected gates pass after formatting. The full build completed
in 7m23s, explicitly skipping unavailable optional FLINT production kernels and
Wasm numerical reactors. `test:changed` did not finish its later suites: its
audit saw a concurrently removed tracked rounding file. Rerunning architecture
checks after the deletion was committed passes native/FFI/Wasm ownership checks
and stops at the same pre-existing stale optimizer manifest. This is not an
all-suite green receipt or Windows/Wasm execution qualification.

## Ideal-norm division checkpoint

The prepared-real prototype now translates `divri`'s small-integer route
through `src/kernel/none/mp_indep.c:divru`. It preserves stored zero exponents,
power-of-two shifts, guard-bit rounding, and divisor sign. The entry explicitly
rejects zero and divisors with magnitude at least `2**63`: GMP PARI's
`is_bigint` includes a one-limb integer with its high bit set, not just
multiword integers. A seeded differential case caught this dispatch distinction
(a one-bit quotient discrepancy) before restricting the entry accordingly.
The `divri_with_gmp` route is still missing, not silently approximated.

The integer/real control now checks 2,328 operations, including 656 divisions,
against PARI 2.17.4 in CPython, generated JS, forced GMP and tagged execution.
The additional deterministic cases cover 64–512-bit mantissas and signed
divisors. Explicit unsupported-divisor errors are checked separately.
Full-integer division replaces PARI's word loop in this prototype; no
language-only performance inference follows from these untimed checks.
Division still needs joining to the matrix/norm and rounding entry, followed
by smoothness and ideal valuation work. No class-group completion is claimed.

Checkpoint validation: arithmetic controls and the 32 connected matrix/norm
controls pass after compiler convergence; strict Python passes all 403 modules,
formatting is current, and parallel ownership checks pass. Architecture checks
stop at the already-recorded stale optimizer opportunity manifest, not a new
native-boundary violation. A test launched during compiler regeneration failed
on an incomplete generated AST interface; rerunning after convergence passes.

## Current connected boundary: prepared matrix to norm

The prototype now computes `RgM_RgC_mul` real/imaginary component rows and
`embed_norm` inside one source-transparent native call. PARI supplies only the
prepared `nf_M` matrix and the oracle outputs for these tests, not intermediate
matrix products at execution time. The 32 previously used candidate vectors
across two real cubics and two mixed quartics agree in CPython, generated JS,
forced GMP and tagged execution, including every intermediate embedding's
mantissa, precision/type and exponent as well as the final norm.

This removes one scaffolding boundary, not the class-group engine dependency.
The next missing `factorgen` stages are ideal-norm division, connecting the
existing rounding block, smoothness testing/factorization, and ideal valuations.
No timing or expensive-segment qualification is claimed for these small norm
checks. Final-reserve fields remain unused.

Additional differential checks cover 1,344 signed-addition/cancellation pairs,
648 integer/real operations (including zero and unsigned-word boundary values),
and 162 component rows including coordinate unit vectors. Exact integer entries
use precision tag -1 in this narrow prepared interchange. Generic multiplication
by exact zero returns integer zero, unlike direct `mulir(0, real)`; preserving
that distinction is necessary to reproduce precision decisions. The row loop
retains the upstream exact-integer-zero matrix-entry guard and operation order.

Remaining prototype restrictions are explicit failures: multiword coordinate
integers, larger arithmetic branches, and integer-only components at the norm
entry. Unit-vector rows are tested, but the 32 matrix-to-norm controls retain
the original eight nonscalar vectors per field. This is not a claim of complete
coverage for arbitrary prepared matrices or all candidates.

Reproduce with the existing diagnostic prefix in `SAGEJS_FLINT_PREFIX`:

```text
node bench/pari-class-group-port/check_compiled_matrix.cjs <pari-source>
node bench/pari-class-group-port/check_compiled_matrix.cjs <pari-source> --matrix-norm
node bench/pari-class-group-port/check_compiled_integer_real.cjs <pari-source>
node bench/pari-class-group-port/check_short_product.cjs <pari-source> <prefix> --signed-addition
```

Earlier checkpoints below are historical where their scaffolding frontier differs.

Status: ownership approved; mixed-buffer prerequisite integrated experimentally.
The user subsequently approved additional reasonably justified compiler changes
on this experimental branch. The original one-correction count is superseded;
the experiment's time/compute budgets and faithful-work criteria are unchanged.
Prepared scalar/array ingress and independent loop counts are integrated at
`a306e2974`; later historical
references to awaiting permission or rejecting scalar inputs are resolved.
The uniform MPFR ingress remains insufficient; a separate prepared-mantissa
prototype now preserves heterogeneous precision for the all-real norm loop.

### Short-product and real-norm checkpoint

The extended multiplication control has 228 operand pairs. Two constructed
64-by-192-bit near-midpoint products disagree with both MPFR nearest-even and
nearest-away: PARI's shortened product omits low-word carries. Rounded integers
agree, but `grndtoi` reports error exponent **-32 in PARI and -31 in MPFR**.
Thus substituting correctly rounded MPFR arithmetic can change the `factorgen`
error gate, not just insignificant printed digits. These are synthetic boundary
cases, not observed failures in the frozen fields. They are not claims that
PARI's documented arithmetic accuracy or class-group results are incorrect.

`short_product.py` translates the short-product word sum and final rounding
into ordinary Python integers, deliberately discarding each omitted low half
before summation. It matches all 228 cases in CPython, generated JS and forced
native execution, including full result mantissa, precision and exponent.
The supported prototype has 64-bit words and at most 2,048 input bits. A
separate square wrapper uses the common short word sum only through 512 bits,
below the pinned square crossover; larger squares and the upstream
large-product crossover remain unsupported.

The same file's all-real `embed_norm` product loop now runs with resident
integer buffers and source-transparent helper calls. Sixteen prepared vectors
from the two already-used tuning real cubics match PARI in CPython, generated
JS, forced GMP and tagged execution. PARI still supplies the embedding
matrix-vector product. Sixteen mixed-quartic prepared vectors also match,
using the translated positive-addition precision policy and bounded square
wrapper. No matrix multiplication, factorization, ideal valuation, or
class-group stopping path is claimed here.

This is a representation prototype: Python/GMP integers express PARI's word
products and carries. Their cost is not PARI's machine-word cost. Before a
language-performance conclusion it needs a same-representation control and
measurement; no speedup or parity is claimed. It is not a generic GEN runtime,
a replacement arithmetic library, or a production default.

The separate positive-addition MPFR control compares 16 squared-embedding pairs
and 1,197 exponent/precision boundary pairs. With PARI supplying the output
precision as scaffolding, MPFR truncation matches all; nearest-even matches
only 9/16 and 475/1,197. The Python prototype now implements the nonnegative
precision decision itself and matches all 1,213 pairs plus 16 stored-zero
precision cases in CPython, generated JS and native execution. Signed
subtraction/cancellation is not implemented.

Reproduce with `SAGEJS_FLINT_PREFIX` set to the existing diagnostic prefix:
`node bench/pari-class-group-port/check_short_product.cjs <pari-source> <prefix>`
and `node bench/pari-class-group-port/check_short_norm.cjs <pari-source> <prefix>`.
Both accept an optional compiler-worktree argument for prerequisite testing.
Add `--addition` to the first command for positive sums and `--mixed` to the
second for mixed norms. These remain untimed component checks.

### Compiled rounding checkpoint

The prerequisite through `84218a22d` adds exact `int.bit_length()` and checked
integer shifts. The attributed `rounding.py` block is now `@native` compiled;
75 prepared PARI real values agree in CPython, generated JS, public dispatch,
and forced native execution, including the integer result and error exponent.
Run `check_compiled_rounding.cjs <pari-2.17.4-source>` in this directory's
benchmark folder (or supply its full relative path from the worktree root).
The checker obtains oracle values by calling PARI `grndtoi`; it does not use
the translated formula as its expected result. All runs are untimed.

Left-shift allocation is explicitly limited to 1,048,576 result bits by the
experimental native backend. Exceeding the cap fails, never truncates. These
inputs fit comfortably. An expression-level conditional was written as an
ordinary `if/else` because that exact-integer lowering does not support the
conditional expression; the rounding branches and operations are unchanged.
This is only a rounding block, not the norm computation or a class-group result.

### First actual embedding-norm ingress finding

The uniform-precision borrowed-array API is implemented and tested, but it is
not sufficient for PARI's actual prepared embeddings. `embedding_norm.py`
expresses the real-only and mixed nonempty product blocks, with separate loop
counts and no inserted multiply-by-one. The untimed `check_embedding_norm.cjs`
uses PARI's prepared matrix-vector product as input scaffolding and compares
against `embed_norm`. It currently **fails before norm arithmetic**, intentionally
refusing precision coercion:

```text
field=0 candidate=1 first_bits=256
nonuniform prepared precision: input=320 target=256
```

Field zero is the frozen tuning polynomial `x^3-20018*x+20034`; candidate one
has integral-basis coordinates `[1,-3,3]`. `nfinit` was requested at 192 bits.
The first attempted fixed-192-bit ingress had already rejected a 256-bit entry.
The follow-up preserved the first entry's precision and exposed the 320-bit
entry. No input was rounded to make the comparison pass. The fourth field was
changed from an initially drafted synthetic control to the second frozen
quartic; execution never reached that field in either attempt.

Reproduce with the integrated compiler:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_embedding_norm.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

This is a failing capability diagnostic, not a norm or performance result.
Per-entry precision and arithmetic result-precision rules are the next required
representation/lowering work. Uniformizing all entries to the requested field
precision or the maximum observed precision is not assumed equivalent to PARI.

### Per-operation arithmetic control

`check_multiply_precision.py` exports operands without rounding and compares
PARI `mulrr` with direct MPFR multiplication at the shorter operand precision.
For the first two real embeddings of eight candidates on each of the four
declared tuning fields, all **32 products** match exactly, including their
subsequent rounded integer and error exponent. Input precision patterns are
`(256,320)` and `(320,256)`, both producing 256-bit PARI results.

Two constructed signed halfway products at 64 bits disagree with MPFR's default
nearest-even mode. MPFR's `mpfr_round_nearest_away` control matches both, as well
as all 32 prepared pairs. This supports a concrete arithmetic mapping, not a
claim that every PARI real operation is now covered. Pinned `mulrr` chooses the
shorter precision; its guard-bit rounding increments magnitude at a tie.
`addrr_sign` additionally has exponent-alignment, word-extension, cancellation
and zero-exponent branches. A generic minimum-precision policy for all operators
is therefore not justified by the multiplication result.

Run the untimed control with:

```sh
python3 bench/pari-class-group-port/check_multiply_precision.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /home/user/sagejs/packages/flint/.native/prefix
```

The initial diagnostic incorrectly used PARI's unsigned decimal `strtoi` on
negative strings exported by GMP. Explicit sign handling fixed the bridge;
the same bridge fix was applied to the norm diagnostic. Those initial mismatches
were not arithmetic evidence. The control now includes both signed tie cases.
No class-group result, norm-chain equivalence or performance follows from these
34 primitive comparisons alone.

### Rounding contract identified before implementation

Pinned `gen3.c:round_i` (line 2429) computes `floor(x + 1/2)`, not
ties-to-even or ties-away-from-zero. Given the full signed mantissa `m` and
its denominator exponent `e` (`x = m / 2^e`), an integral value with `e <= 0`
returns error exponent `-e`. For `e > 0`, an exact represented integer returns
`-e`, while a half-integer returns `-1`. Nonzero residuals use their binary
exponent minus `e`. Thus simply measuring an MPFR subtraction from the rounded
integer loses a precision-dependent case, and normalizing away trailing zero
mantissa bits is not interchangeable with PARI's stored precision.

`grndtoi` (line 2544) additionally handles zero and values of exponent below
`-1` directly using the stored real exponent. `factorgen` rejects an error
exponent greater than `-32`. The planned interchange must therefore preserve
precision and the zero exponent as well as numerical value. These source
observations define tests to implement, not a completed rounding primitive.

`bench/pari-class-group-port/rounding.py` now directly translates this prepared
real rounding branch in ordinary Python. `check_rounding.py` compares its
integer and error exponent to the pinned library's `grndtoi`, exporting actual
mantissas with `mantissa_real`. All 75 cases agree (25 values at three requested
decimal precisions): signed ties, exact integers, small exponents, and values
around the `-32` rejection boundary. Run:

```sh
python3 bench/pari-class-group-port/check_rounding.py \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4
```

This is an untimed Python differential, not native rounding qualification or
an embedding-norm implementation. The driver uses the existing instrumented
library only as an oracle, never as a timed comparator. Its initial setup
failed because `setrealprecision` requires a non-null output pointer; the
driver was corrected without changing the translated rounding algorithm.
No class-group or performance result is claimed. Earlier obstruction evidence
below is retained as history, not the current ownership state.

## Ownership takeover checkpoint

The user approved takeover of `mixed-exact-float-sidecar`. Its original changes
were preserved, integrated with this experiment's base, and reviewed for index
conversion, float operators, and Python assignment evaluation order. Prerequisite
draft PR #283 is integrated here at `7fac97ebf`; this experiment remains draft.

The actual enumeration scaffold now runs in CPython, generated JS and native
code with matching candidate order on 24 synthetic cases (184 vectors). Run
`SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix node test/pari-class-group-port.cjs`.
This uses an explicitly identified existing diagnostic prefix, not a new
matched performance baseline. The prototype admits exact-double integer
coordinates only through ±2^53 and declines larger ones; this narrower
representation envelope is not PARI's full machine-integer range.

Compiler qualification still has visible gaps: standalone Wasm SDK absent,
full build blocked by optional FFLAS installation, and generated optimizer
manifest awaiting integration review. Strict Python and focused compiler tests
pass. None of these checks establishes a complete class-group port.

Next: extend the upstream small-relation trace through candidate/admission
state, and extend the connected segment through norm/factorization and relation
admission. Prepared-field and full-path timings remain unmeasured. The original
scope and acceptance criteria are unchanged.

This executes `agents/pari-class-group-language-experiment.md` with the user's
explicit override to **PARI 2.17.4**. The old release identifiers in that plan
are historical and do not govern this experiment. Mathematical choices remain
**upstream-assumed**; this work changes no production default or proof state.

## Reproducible source identity

- Sage.js base: `938ccd425f0a322bafb1375968d5e24b38d5cde5`.
- Official archive: <https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-2.17.4.tar.gz>.
- Archive SHA-256: `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
- `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
- Source archive downloaded and both hashes checked on 2026-09-13.
- Upstream attribution: PARI group, `buch2.c` copyright 2000, GPL version 2
  or later. Translated files must retain that attribution and license notice.

## Resource ledger

The formatted connected-batch validation/build used 49.432 wall seconds,
54.755 user plus 2.037 system child CPU seconds and peak child RSS
576,380 KiB. Charge 56.792 CPU seconds conservatively. This includes oracle
construction and three execution modes, not a paired performance sample.

The successful 180-case connected QR/bound validation used 32.748 wall
seconds, 38.269 user plus 1.263 system child CPU seconds and peak child RSS
582,264 KiB. Charge 39.532 CPU seconds including compilation. The preceding
branch-coverage assertion run used another 3.316 CPU seconds; it revealed
that the original 108 controls all stopped at degree two.

The successful higher-root validation/build used 30.841 wall seconds,
33.733 user plus 1.557 system child CPU seconds, and peak child RSS
504,832 KiB. Charge all 35.290 CPU seconds conservatively. Earlier failed
compiler attempts in this checkpoint were not individually metered; they
remain part of the previously disclosed cumulative-accounting gap.

The cached-build logarithm validation used 10.189 wall seconds, 11.829 user
plus 0.611 system child CPU seconds, and peak child RSS 403,656 KiB. Charge
12.440 CPU seconds conservatively, including the small oracle build; this is
a validation receipt, not a logarithm timing comparison.

At the QR checkpoint, goal accounting reported 25,247 root active seconds
(7.01 hours), plus the previously recorded 12 panel-agent minutes. The
post-division combined square-root/QR/division validation used 6.515 wall
seconds, 7.371 user plus 0.789 system child CPU seconds and peak child RSS
361,116 KiB, recorded through `resource.getrusage(RUSAGE_CHILDREN)`. Charge
all 8.160 CPU seconds, including the oracle builds. This is not a reconstructed
cumulative CPU ledger: earlier unmetered diagnostic attempts remain explicitly
unaccounted. No near-budget execution may assume those costs were zero.

Execution began at approximately 2026-09-13 21:32 UTC. Limits remain 16 aggregate
active-agent hours, six aggregate execution CPU-hours, 256 MiB archived evidence,
600 seconds and 4 GiB per field. At most two agents run concurrently. The panel
agent performs selection only. Builds are local, not on the M0 timing host;
no reservation or action on `opt` is authorized by this experiment.

This initial checkpoint used approximately 11 root active minutes plus 12 panel
agent minutes, well below either audit/selection timebox. No benchmark CPU
budget was spent; checks and the single PARI smoke were small diagnostic runs.
Compilation is excluded from the execution CPU budget, not from active time.

At the matrix-to-norm checkpoint, active goal accounting reports 8,598 root
seconds (2.39 hours), in addition to the initially recorded 12 panel-agent
minutes. This phase used no subagents and no timing VM. The two-hour coverage
checkpoint is therefore: enumeration prefixes, bounded real arithmetic, and
prepared-matrix-to-norm controls execute; the class-group path and performance
comparison remain incomplete. Earlier diagnostic CPU usage was not collected
as a precise cumulative receipt; subsequent validation records process CPU and
peak RSS explicitly. No near-budget execution is authorized based on an
unmeasured remainder.

The post-format matrix checkpoint validation (rows, matrix-to-norm, integer/real
arithmetic, signed addition, rounding, and enumeration checks) passed in 13.569
wall seconds, using 13.351 user plus 1.872 system CPU seconds and peak child RSS
217,664 KiB. Python `resource.getrusage(RUSAGE_CHILDREN)` recorded these totals;
`/usr/bin/time` is absent on this host. Charge all 15.223 CPU seconds
conservatively, including any compilation in the run. These are validation
resource figures, not arithmetic or class-group performance measurements.

## Connected FLATTER compression loop

`flatter.py` connects adaptive QR, recursive 1D/2D block reduction, cross-block
size reduction, exact block assembly and transformation accumulation into
one source-transparent native `ZM_flatter`-equivalent call for dimensions three
and four, with `LLL_IM` and no keep-first flag. The `drop` and `potential`
values are taken from the same intermediate QR factor as upstream, before
the middle-block transformation. A computed compression step is **not**
committed when PARI's termination test discards it. No new iteration stopping
bound replaces PARI's decisions.

`check_flatter.cjs` compares 32 actual rounded-embedding ideal bases and eight
badly ordered signed diagonal bases. All forty match pinned PARI, CPython,
generated JavaScript and GMP in the current basis, accumulated integer
transform, attempted/accepted step counts, last drop and observed stop reason.
All eight diagonal controls require accepted steps (at most three attempted
steps), so the test cannot pass solely
by returning identity on already easy inputs. The oracle also verifies
`input * transform == current` exactly. These controls terminate with zero
drop; plateau and post-20-step deterioration branches are retained in source
but are not exercised by this corpus.

An upstream precision request beyond the current QR capability returns
unresolved status 2, with a dedicated stop reason and no falsely accepted
step. This boundary is tested in all three translated execution modes.
Independent caller-owned buffers retain all work inside the native call.
General dimensions, keep-first behavior, and recursive quadratic-form inputs
beyond their existing capability guard are not covered by this implementation.

Native lowering rejected fixed slice stores on `IntegerBuffer` (it currently
admits them only for `NativeIntegerVector`). A small ordinary-Python four-slot
store helper expresses the repeated operation without introducing a hidden
backend; the demonstrated compiler limitation remains open.

This provides a connected FLATTER preparation segment for the selected
dimensions, **not** PARI's `ZM_lll` dispatcher: binary64 LLL and its
extended-exponent verification must still run afterwards. Selector integration,
ideal-to-collector connection, and the class/unit engine remain incomplete.
No whole-engine or qualified performance result follows from these controls.
Formatting, strict Python (403 modules) and focused checks pass. Architecture
retains the stale optimizer manifest failure; the changed-file portable gate
stops at the module-cache `Any` reference error after four passing files,
leaving 214 files unstarted.
The final focused run has a passing parallel receipt (53.73 seconds wall,
including oracle setup, CPython/JS/native checks and compiler/cache loading;
this is not a FLATTER kernel timing).

## Cross-block size reduction

`lll_sizered.py` translates `lll.c:sizered` for the 1x1 and 2x2 left blocks
needed by the selected cubic/quartic experiment. It retains the upstream
sequence: upper-triangular inverse, multiply by `R2`, multiply by `T3`, multiply
by the exact inverse of `T1`, round, then multiply by `-T1`. It does not replace
that sequence by a numerically different direct solve. Real arithmetic reuses
the translated reciprocal, division and product leaves. Generic multiplication
preserves integer-zero products and the left-entry integer-zero dot-product
skip, which differ from the lower-level `mpmul` convention used inside QR.

`check_lll_sizered.cjs` compares 32 actual block inputs from the four tuning
fields and eight primes, plus 32 variants with changed unimodular transforms.
All 64 match pinned PARI, CPython, generated JS and GMP. It checks every stored
triple in all three real matrix products, as well as the final exact integer
size-reduction matrix. Negative-determinant and shear transforms are included;
an invalid non-unimodular transform fails without changing output.

Independent caller-owned scratch retains intermediates without interpreter
callbacks. Blocks larger than two are explicitly unsupported here, and existing
real-arithmetic capability limits still apply. This is not a general LLL API.
Full FLATTER block assembly, repeated compression and the later outer LLL
passes remain unconnected; whole-engine and performance qualification remain
open.

The final focused check has a passing parallel receipt. Formatting, strict
Python (403 modules), documentation and contract checks pass. Architecture
still fails at the stale optimizer manifest. The changed-file unit gate passes
four files, then its hyperelliptic public-scalar check hits the missing FLINT
adapter; 234 files are not started. No broad-gate pass is claimed.

## Connected real-block rescaling and binary reduction

`lll_rescale.py` translates the integer/real branch of
`polarit2.c:RgM_rescale_to_int`: scan the least real mantissa bit (or the
integer exponent), retain wholly exact input unchanged, rescale, and round
mixed integer entries using PARI's ties-toward-positive-infinity convention.
It connects directly to the translated two-dimensional shortcut in one
`pari_lll_binary_block` native call. Rational entries and an entirely
inexact-zero matrix remain explicitly outside this boundary.

`check_lll_binary.cjs PARI_DIRECTORY PARI_ARCHIVE --real-blocks` verifies 76
combined calls in PARI, CPython, generated JavaScript and GMP: twenty actual
FLATTER QR blocks plus 56 signed, scaled, exact and mixed controls. Both the
rescaled integer matrix and final transformation match. Invalid triples and
the excluded all-inexact-zero case fail before output mutation. The original
1,471 binary reduction comparisons still pass. The final focused run has a
passing parallel receipt (6.00 seconds wall).

A fresh native build without `SAGEJS_FLINT_PREFIX` failed the compiler's MPC
dependency preflight. Inspecting `compiler.cjs` shows this is currently a
blanket requirement outside matrix-only and float-only roots, even for this
integer-only code. Removing an unnecessary QR storage-helper import does not
remove that preflight. Validation uses the already available
`/home/user/sagejs/packages/flint/.native/prefix`; no new dependencies were
installed and no compiler-performance conclusion follows from this failure.

FLATTER's block transformations and cross-block size reduction are still
missing. PARI still supplies the full QR factor in these combined block tests;
the adaptive QR implementation is tested separately. This is a reduction of
the external dependency boundary, not a full connected FLATTER implementation.

Formatting, strict Python (403 modules), documentation and contract checks pass.
Architecture retains the stale optimizer-manifest failure. The changed-file
unit gate passes four files before the missing FLINT adapter stops the
algebraic-geometry test; 234 files are not started. These broad validation
failures remain open.

## Two-dimensional recursive LLL branch

`lll_binary.py` translates `ZM2_lll_norms`' positive-definite integer-basis
shortcut through `Qfb.c:qfbredsl2_imag_basecase`. FLATTER uses this branch for
its two-dimensional recursive blocks even when `LLL_NOCERTIFY` is set; replacing
it with the general floating LLL loop would not preserve the upstream path.
The port retains sign/swap decisions, the `-a < r <= a` remainder convention,
and exact reconstruction of the second transformation row. The rounded
division is expressed as its equivalent integer-floor formula.

`check_lll_binary.cjs` checks 1,451 small positive-definite forms (including
negative coefficients and equality boundaries) and twenty integer-rescaled
blocks from actual FLATTER Gram-Schmidt preparations across the four tuning
fields and primes 2 and 3. All 1,471 exact outputs match PARI, CPython, generated
JavaScript and GMP native execution. Every transformation has determinant one;
the form controls also replay all three transformed coefficients exactly.
The oracle pins `lll.c` and `Qfb.c`; the latter has SHA-256
`861f61aecae22771bd1a9679b6913bafc6325e89ee3147b8d1516ed5cee535d6`.

The upstream `QFBRED_LIMIT=9000` branch condition is retained. Inputs requiring
the unported recursive quadratic-form algorithm are explicitly rejected, as
are singular/non-positive-definite forms. Those failure paths are tested.
The actual-block test still supplies rescaling through PARI: this is a leaf
correspondence result, not complete FLATTER recursion or class-group coverage.
Recursive block assembly, size reduction, real-to-integer rescaling and the
remaining LLL passes still need to be connected. No timing parity is claimed.

The focused test has a passing parallel receipt (3.07 seconds wall, including
its cached native load and oracle compilation). Formatting, strict Python,
documentation and contract checks pass. Architecture again stops at the stale
optimizer manifest. The changed-file unit gate and direct algebraic-geometry
rerun fail on the missing `sagejs_flint.node` adapter; this remains a failed
broad gate, not a complete validation receipt.

## Adaptive Gram-Schmidt preparation for FLATTER

`lll_preparation.py` translates `condition_bound`, `spread`, `GS_extraprec`,
`gramschmidt_upper` and `gramschmidt_dynprec` for square nonsingular integer
bases of degree at most ten. It preserves the initial `n+31` requested bits,
64-bit precision rounding, failed-QR doubling, and subsequent
`max(4*requested//3, minimum+extra)` rule. The output is the unnormalized upper
QR factor required by FLATTER, not the collector's normalized quadratic form.
The existing Householder source now exposes that intermediate factor through
`pari_prepared_qr`; the original collector entry still applies precisely its
original normalization after the shared QR call.

`check_lll_preparation.cjs` compares 32 actual rounded-embedding ideal bases
from the preceding probe and ten upper-triangular controls with pinned PARI
source. All 42 agree in CPython, generated JavaScript and GMP native execution,
including every stored integer/real triple and the final attempt count,
requested precision and rounded precision. At least one actual basis requires
a retry. The original 66 Householder controls, including nine upstream failure
cases, still match PARI in CPython, JS, GMP and tagged execution.

The existing QR primitive supports at most 512 bits. A larger upstream request
returns status 2 (unresolved) before attempting it, rather than increasing a
safety cap or falsely succeeding. A 640-bit request is tested in all three
execution modes and leaves the output untouched. This remains an experimental
capability boundary; it is not a replacement for upstream precision escalation.
Input and workspace buffers must not alias. The exponent sentinel follows
the pinned 64-bit PARI representation, independently of the host's C `long`.

The first oracle draft used PARI's unsigned-digit `strtoi` reader on signed
matrix literals; exact comparison exposed the resulting wrong input. The
oracle now uses `gp_read_str` on regex-checked integer literals. The compiler
also rejected two-argument `max` calls in the exact kernel, so the translation
uses explicit comparison branches without changing the arithmetic or policy.
No compiler change or new handwritten mathematical backend was added.

The focused adaptive test has a passing parallel receipt. Formatting and strict
Python pass (403 strict library modules; the experimental benchmark modules
also execute directly in CPython). Architecture validation retains the known
stale optimizer-manifest failure. All sixteen connected collector controls
also pass after extracting the shared raw-QR function. The changed-file gate
passes merge checks, then fails in `test/module-cache.cjs` with
`ReferenceError: $ρσ$py$Any is not defined` in its generated shadow module;
214 portable files were not started. The broad gate is not qualified, and
this checkpoint does not modify that module/import subsystem.
FLATTER recursion, exact transformations,
binary64 LLL and extended-exponent verification remain unimplemented; this
preparation function is not yet wired into the collector's packet producer.
No new performance or whole-engine completion claim is made.

## LLL preparation dependency probe

`probe_lll_preparation.cjs PARI_DIRECTORY PARI_ARCHIVE` inspects the next
untranslated dependency of `Fincke_Pohst_ideal`: the actual
`ZM_lll_norms(G0 * I, .99, LLL_IM, NULL)` path. It extracts pristine 2.17.4
`lll.c` (SHA-256
`ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b`),
adds branch/return counters, and retains upstream notices. This is C diagnostic
scaffolding, not a new mathematical backend or translated LLL implementation.
Counters describe the outer dispatcher, not recursive LLL calls inside FLATTER.
The instrumented entry has a separate name and hidden symbols; a dynamic-symbol
check prevents it from interposing on shared-library `nfinit` preparation.
Each resulting transformation is compared with the original library entry,
checked unimodular, and accompanied by its exact integer input matrix.

For the existing four tuning fields, using the first prime ideal over each of
2, 3, 5, 7, 11, 13, 17 and 19, all 32 preparations execute:

1. FLATTER preparation;
2. `fplll_fast` (binary64), returning zero kernel dimension;
3. `fplll_dpe` (extended exponent), also returning zero kernel dimension.

None enter the heuristic or arbitrary-precision fallback. In every sample the
low-precision QR used for choosing FLATTER returns failure, so the selector
enters FLATTER without comparing the size threshold. This is upstream control
flow, not a failure of the subsequent higher-precision collector QR.
The selector uses rounded-up `3*n+30` bits (64 here); the relevant
`bibli1.c:no_prec_pb` guard rejects sufficiently large exponents at
`DEFAULTPREC`. These preliminary failure and retry decisions must survive a
faithful port.

A separate direct `fplll_fast` call on the original matrix happens to yield
the same final transform in all 32 samples. That agreement is **not** permission
to remove FLATTER or the extended-exponent pass: doing so would omit upstream
work, and no general equivalence has been established. The probe also checks
that this direct fast pass's basis equals the input times its transformation.

This changes the next implementation boundary: translating only the binary64
LLL loop is insufficient. The prepared-ideal boundary must retain the selector,
FLATTER and verification passes, with heuristic/precision fallbacks explicitly
unresolved until implemented. Existing QR/real arithmetic can be reused, but
FLATTER's recursive compression and exact basis transformations remain new
dependencies. These 32 controls use only four tuning fields; they neither
exercise the reserved fields nor establish seconds-scale or whole-engine
coverage. No timing qualification is claimed.

The final metered diagnostic before adding the dynamic-symbol assertion used
2.617 wall seconds, 2.458 user plus 0.160 system CPU seconds, with peak child RSS
123,192 KiB, including C compilation. Earlier short probe iterations were not
individually metered; that accounting gap remains disclosed. No production
Python/compiler code changes in this checkpoint.

The final probe (including the dynamic-symbol check) passes with a recorded
parallel receipt, as do syntax, whitespace, documentation and contract checks.
`pnpm test:changed -- --base HEAD` passes merge checks but fails the unit gate:
`test/algebraic-geometry.cjs` cannot load
`packages/flint/build/Release/sagejs_flint.node`. Direct rerun reproduces that
missing-adapter failure; 238 remaining unit files were not started by the gate.
This is not a passing full-runtime validation, and this diagnostic-only change
does not repair or rebuild the unrelated optional adapter.

## Initial full-path dependency frontier

All source locations below refer to the pinned `src/basemath/buch2.c`.
These are audit findings, not claims of translated coverage.

| Entry / stage | Source | State and dependencies to preserve |
| --- | --- | --- |
| Public dispatch | `bnfinit0`, 3468; `Buchall_param`, 3729 | Prepared `nf`, requested flag/precision; flag zero still requires unit work. |
| Bounds and analytic estimate | `Buchall_param`, 3772–3841 | Roots of unity, automorphisms, cached prime decomposition, `GRHchk`, inverse residue and precision. |
| Factor base / retries | `FBgen`, `subFBgen`, driver `START` | Ordered prime ideals, permutations, subfactor bases, saved relations, changing bounds. |
| Small relations | `small_norm`, 2574; `Fincke_Pohst_ideal`, 2448 | Ideal products; rounded-embedding integer LLL; arbitrary-precision QR; binary64 enumeration; norm rounding; prime-ideal valuations; relation admission. |
| Random relations | `get_random_ideal`, 2631; `rnd_rel` | PARI RNG draw schedule, subfactor-base products and reductions; same relation cache. |
| Coupled linear algebra | driver, 3994 onward | `hnfspec_i` / `hnfadd_i`, exact relation matrices, floating embeddings and transformation history. |
| Regulator / stopping | driver, 4090 onward | `compute_multiple_of_R`, `compute_R`, precision restart and new relations, optional `be_honest`. |
| Final output | driver, 4140 onward | Unit lattice reduction, `getfu`, archimedean cleanup, `class_group_gen`, complete `buchall_end` state. |

The existing exact cubic certification program is not a faithful replacement
for this path: it uses different norm, analytic, and termination policies.
Likewise, replacing PARI's rounded embedding norm in `factorgen` by an exact
determinant would change the work and possibly relation acceptance. Such a
replacement cannot silently be called language-only overhead.

The candidate first connected segment is small-ideal relation discovery,
including enumeration and admission, with any unavailable preparation or
valuation dependencies explicitly separated. Its exact entry/exit boundary
and measured cost still need to be established; an enumeration helper alone
does not fulfill the substantial-segment checkpoint.

## Concrete compiler obstruction and ownership boundary

`bench/pari-class-group-port/mixed_buffer_probe.py` reduces the failure to a
single floating-buffer comparison followed by a signed-buffer read. Calling
`lowerSource` on current base produces:

```text
native indexing currently requires a local constant sequence
```

`tools/native-kernel/float64-ir.cjs:isFloat64Signature` admits only a Float64
return and Float64/uint64/Float64Buffer parameters. A signature containing
Int64Buffer is routed to `lowerIntegerFunction`, which does not lower this
Float64Buffer indexing. The same error occurs on the actual enumeration
prototype. This is a demonstrated language capability gap, not a speed result.

The existing worktree `/home/user/sagejs-worktrees/mixed-exact-float-sidecar`
has an **active native-compiler contract and uncommitted edits** to exactly
these lowering/backends/runtime files. Its recorded architecture/native gates
fail. We inspected that state read-only; none of its edits were copied, changed,
committed or assumed correct. Taking over that prerequisite requires an explicit
ownership decision. Creating another overlapping compiler implementation would
violate the parallel-development contract.

A read-only follow-up ran the new probe through that unfinished worktree's
existing `lowerSource`: the minimal mixed-buffer probe lowers successfully,
but the enumeration prototype stops at its `ValueError` guard (`native raise
currently supports ZeroDivisionError`). This confirms that the proposed work
addresses the first obstruction, but its older compiler is not a drop-in
replacement for the current base. No code was copied or guards removed, and
successful IR lowering alone does not validate generated native execution.

Encoding integer state as doubles is not adopted as a workaround: it changes
the admitted integer range and still leaves conversion/helper-call dependencies.
Calling the interpreter inside the native search is prohibited. Replacing the
search by the existing certified cubic algorithm changes the experiment.

## Initial executable evidence (before prerequisite integration)

- Unmodified official PARI source builds locally with GCC 15.2.0, GMP 6.3.0,
  single-thread engine, `-O3 -Wall -fno-strict-aliasing`, no readline or graphics.
- `gp -fq` reports `[2,17,4]`; `bnfinit(nfinit(x^3-3*x+1),0)` returns class
  number 1 and empty invariant factors. This is a smoke test, not timing evidence.
- Local comparator `gp-dyn` SHA-256:
  `5ccd82c860757ecdfaa26c3bd75fbba1a5d17d580388e2ed9a993c67a1b1891e`;
  linked `libpari-gmp.so.2.17.4` SHA-256:
  `e0c227a09f01827f58917f2c8f48947792876ef5234e48920a558b17110e4ab6`.
- `bench/pari-class-group-port/enumeration.py` is an attributed ordinary-Python
  translation of `step` and the inner enumeration block only. It retains the
  one-million trial limit and upstream ordering; an explicit resumable boundary
  replaces the outer candidate processing. This is scaffolding, **not** a
  completed expensive connected segment.
- `node test/pari-class-group-port.cjs` checks 24 CPython lattice enumerations
  against exhaustive finite sets (184 vectors) and reproduces both compiler
  failures. These tests do not establish agreement with a PARI execution trace,
  JS/native correctness, class invariants or regulator correctness.
- The frozen 24-field development panel meets all requested historical strata;
  see `bench/pari-class-group-port/panel-notes.md`. It is not a new baseline.
- Root build passes in 7m21s, with absent optional native adapters/production
  pack and unprepared numerical Wasm reactors explicitly skipped. Formatting,
  parallel scope and architecture gates pass; strict Python passes 403 existing
  modules. The new bench prototype is not a migrated production module.
- `pnpm test:changed -- --base 938ccd425` passes merge invariants, then stops
  in `test/algebraic-geometry.cjs` because the optional generated
  `sagejs_flint.node` addon is absent. Remaining selected docs/CLI tests were
  not reached. Full native qualification has not run; the lowering failure
  itself must be resolved first. These limitations keep the PR draft.

At that initial checkpoint there were no paired measurements or generated core for this prototype,
and no experiment claim against the 2x target. Dependencies such as rounded
archimedean norm, prime-ideal valuations, rank admission and unit recovery remain
untranslated. The next investment is to finish/integrate the mixed-buffer
compiler prerequisite, then resume the connected small-relation path; this
checkpoint is explicitly inconclusive about whole-engine parity.

## Upstream enumeration trace checkpoint

The translated enumeration now matches native PARI 2.17.4 candidate prefixes
and trial counters on four predeclared tuning fields, in both generated JS and
compiled native execution. This does **not** test primitive/scalar rejection,
relation admission, stopping equivalence, or class-group output from Sage.js.

| Tuning field ID prefix | Enumeration calls | Comparisons, both backends | PARI output |
| --- | ---: | ---: | --- |
| `0e970fdb` | 16 | 2,558 | `1 []` |
| `dec56e7e` | 12 | 1,766 | `3 [3]` |
| `0857fab7` | 44 | 11,920 | `1 []` |
| `98479377` | 301 | 112,738 | `4 [2, 2]` |

There are 64,491 recorded vectors checked against each backend, not 128,982
independent vectors. Records are limited to the first 200 trial counts per
enumeration call. No final-reserve field was opened. Each GP invocation has a
30-second timeout and 4 MiB output cap. These diagnostic runs are not timings.

Apply `bench/pari-class-group-port/pari-trace.patch` to the pinned pristine
archive, rebuild GP, then run:

```sh
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  node bench/pari-class-group-port/check_pari_trace.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4/gp
```

The patch activates only under `SAGEJS_TRACE_FP`; the runner sets it. The
instrumented binary must not serve as an unmodified timing comparator, even
with the environment flag unset. The source/build directory used for the
initial smoke has now been instrumented: its current `buch2.c` SHA-256 is
`d8b09a54e51399c83f2faa92ccc3f1f70f41d660b1cb279738bc207ff553f87a`,
and its `libpari-gmp.so.2.17.4` SHA-256 is
`c1a41ed3a65f65762bd9ee718397b439592185c3f1d3f52fb9d19f8bb980064a`.
The earlier binary hashes above describe the earlier unmodified build only.

Parsed-trace SHA-256 values, in table order:

```text
3bbddcb2fc4241c8066b319fee7c006258a5f96a487f14ef1644f06affde40a1
8dcf442b9a4f0895e67843e86f24f092625e4926736b76c30e055ee5b299da96
24eb70f035e1eb439356a5b3e55db1baba24c6cfc01af25d3e952e07f79f372f
c9bf7233c137a9275dcf2951a86a7017efa823124adea937fe79084a12ef1fde
```

Diagnostic failures retained: initial parsing lost records when other PARI
diagnostics lacked a terminating newline; parsing now locates the explicit
marker. Enabling all BNF debug output exceeded the unchanged 4 MiB cap on the
first quartic, so the patch uses a dedicated flag instead. PARI's real-number
formatter can separate an exponent with whitespace (`2.04 e-38`); the parser
now consumes the complete real value, with a focused regression assertion.
Neither apparent ordering mismatch required changing the translated algorithm.

## Next boundary: prepared arbitrary-precision embeddings

`prepared_real_probe.py` demonstrates a second capability gap, distinct from
mixed binary64/integer workspaces. Lowering a function that multiplies two
supplied `RealNumber` arguments fails with:

```text
native kernel: unsupported native argument type RealNumber
```

The legacy field lowering in `tools/native-kernel/ir.cjs` accepts parent fields,
integers and unsigned iteration counts, but not prepared real/complex values
as arguments. It has scalar MPFR/MPC arithmetic for values constructed inside
the kernel; that is not resident access to a prepared embedding matrix.
The four current FFI declarations (FLINT, M4RI, igraph, FFLAS) provide no
MPFR/MPC owned resource alternative. This is evidence about current interfaces,
not a claim that implementing the capability is impossible or slow.

The next upstream operation needing it is `factorgen` (`buch2.c`): multiply
the prepared embedding matrix by the exact candidate coordinates, compute
`embed_norm` (`base1.c`), divide by the ideal norm when supplied, and apply
`grndtoi` with its `e > -32` rejection. `embed_norm` multiplies real embeddings
in order and multiplies squared complex absolute values separately before
combining them. PARI's precision and rounding behavior must be investigated
and preserved at the relevant acceptance branches; merely choosing MPFR's
default rounding is not an equivalence argument.

Potential exits have different meanings:

- Add resident arbitrary-precision scalar/container ingress and the required
  rounding operations: a second compiler/runtime or representation capability,
  needing explicit reassessment of the one-correction budget and ownership.
- Let PARI supply norm/factorization/admission outputs at an outer boundary:
  permitted diagnostic scaffolding, but not a translated connected discovery
  segment or evidence for whole-engine speed.
- Replace the norm by binary64 or exact determinants: different arithmetic and
  potentially different accepted relations; excluded from a language-only claim.

The existing one general correction is the mixed integer/binary64 workspace
support. No second correction has been started. The experiment remains
incomplete and inconclusive about whole-engine parity. The minimal probe and
its rejection are now regression-tested; no production API or proof state is
changed.
