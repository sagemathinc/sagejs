# Cubic certification profiling and exact BF lookup

Status: source-copy experiment, not promoted. This continues the
[initial-volume experiment](cubic-initial-volume-experiment.md). Production
mathematical source, acceptance rules, and resource allowances are unchanged.

## What the samples establish

The remaining cost is distributed across relation collection, certification,
and exact-integer operations. Two software CPU-clock profiles of the target
$x^3-x^2-7x+122$, at 1,999 and 997 Hz with different jitter seeds, attribute
2.35% and 2.33% of all samples directly to `_cubic_prepare_bf_plan`.
Its inclusive fractions are 6.92% and 7.27%. `fmpz_set` alone accounts for
5.17% and 5.27% of all samples, across callers.

These are attribution clues, **not an additive phase-cost ledger**. The
denominator includes Node initialization, output checks, and seeded 0–1 ms
busy waits between calls. Inclusive samples overlap; frame-pointer unwinding
does not recover every library stack. Each run performs 100 warmups and
10,000 checked calls. The sampling driver checks source, wrapper, and addon
hashes, acceptance, and class number; it does not authenticate a public
receipt or independently replay a mathematical certificate.

The original timing addon is stripped. A separate `profileSymbols:true`
build retains symbols for the **same mathematical source**. Its `.text`
differs from the timing addon, so these profiles cannot be claimed as
instruction-identical measurements of the timing binary. Both sampling
frequencies use that same symbol-bearing build. Timing evidence must instead
come from fresh runs of the ordinary uninstrumented candidates.

## Exact lookup invariant

The Belabas–Friedman planner stores five special values first:

$$
T,\quad \lfloor T/9\rfloor,\quad 3T,\quad |D_K|,\quad h_{\mathrm{upper}}.
$$

These values need not be ordered or distinct. Subsequent values are appended
while visiting integer norms $n=2,3,\ldots,T-1$ in increasing order. A value
is appended only when absent from the entire table. Consequently, the tail
after the first five entries is strictly increasing and contains no header
value. Repeated exponents at a fixed norm cannot add another copy.

The second scale visits only $n<\lfloor T/9\rfloor$. Its coefficient is the
negative of the unchanged first-scale coefficient. A nonzero second-scale
coefficient was therefore nonzero on the first scale, where exponent one
already inserted or found that norm. Thus the second scale adds no values.
If the first scale exhausts capacity, it returns before the second begins.

The replacement searches the five header entries in order, then performs
lower-bound binary search on the sorted tail. It returns exactly the original
linear search's first matching index, or the original sentinel `value_count`
when absent. Header collisions still select the earliest entry. The tail
search maintains the usual half-open interval $[\ell,r)$ containing the
first possible matching index and strictly shrinks it until $\ell=r$.

Only the lookup is replaced, at its original position inside the exponent
loop. In particular, it is **not hoisted ahead of the term-capacity check**.
Term order, multiplicities, value indices, log/square-root inputs, interval
arithmetic, and early-failure partial workspaces are preserved. No new
workspace or certificate assumption is introduced. This is an implementation
equivalence argument, not a Lean proof of the BF theorem or its application.

## Generated-code finding for the next experiment

The new helper's generated fmpz code computes
`_CUBIC_ANALYTIC_VALUE_OFFSET + index` with `fmpz_set_si`, `fmpz_set_ui`,
and `fmpz_add`, then calls the arbitrary-precision-index vector getter.
The offset is 3,414 and this table is capped at 256 entries, but the ordinary
integer constant causes promotion of the expression containing a `uint64`
index. The backend already has a distinct unsigned-index lowering.

This suggests a separate, testable opportunity: retain checked machine-word
index arithmetic where the source or compiler can establish its range.
Do not globally reinterpret Python integers as unsigned words or remove
overflow/bounds checks. The current experiment does not change the compiler
or claim a measured benefit from this prospective optimization.

A frontend-only probe confirms that `values[OFFSET + index]` lowers with
`indexType: Integer` for `OFFSET = 3414` and `index: uint64`, while introducing
`offset: uint64 = OFFSET` and indexing `values[offset + index]` selects
`indexType: uint64`. This establishes available lowering, not equivalence for
arbitrary machine-word inputs: the caller must establish a non-overflowing
range. A static walk of this candidate's IR finds 327 exact-index and 106
unsigned-index vector operations, including 31 versus two in the BF planner.
Those are source-operation counts, not dynamic frequencies or proof that all
327 sites can safely change. The next experiment should isolate safe bounded
indexing before proposing compiler-wide range propagation.

An attempted module-level `OFFSET: uint64 = 3414` currently fails lowering
with `unknown native value OFFSET`. The constant collector in
`tools/native-kernel/ir.cjs` recognizes plain assignments, not this annotated
assignment. Therefore simply annotating module constants is **not yet an
available cleanup**. A compiler improvement would need typed constant
collection, provenance, range validation, and preservation of the documented
arithmetic semantics; the successful local-alias probe alone does not supply
those guarantees.

Inspection also exposed a pre-existing correctness defect in that collector:
it uses truncating JavaScript BigInt division/remainder when folding Python
module constants. Frontend reproducers lower `-3 // 2` and `-3 % 2` to `-1`
and `-1`, rather than `-2` and `1`; opposite-sign-divisor cases fail too.
This was [reported to the compiler/integration lane](https://github.com/sagemathinc/sagejs/discussions/104#discussioncomment-18363322),
not fixed in this experiment. An AST audit finds 55 evaluable integer module
assignments in this candidate and no module-constant floor/modulo expression;
this specific counterexample does not explain the cubic timing results.
That narrow audit is not a general compiler-correctness claim.

## Focused tests

`test/number-field-cubic-bf-lookup.cjs` compares 100,000 lookups against a
first-match oracle, including duplicate headers and 300-bit header values.
It also executes the actual old and new planner term-building suffixes on
750 synthetic coefficient/capacity combinations, comparing the entire
workspace and return value, including capacity-failure partial states.
An AST check permits changes only to the planner plus the new helper relative
to the preceding initial-volume candidate.

The complete frozen development corpus (1,000 tuning fields plus twelve known
controls) accepts 963/1,012 for both BF lookup and initial-volume lean, versus
961 for production baseline, with zero exceptions. All 1,012 complete output
buffers and acceptance flags match the preceding lean candidate exactly.
Accepted class numbers and invariants agree with the corpus oracle.
Post-build fmpz, GMP, and JavaScript execution of the new source also agree on
all 1,012 fields, including complete buffers on declined inputs. These are
same-source differential tests, not independent certificate replay or a new
holdout qualification. The two coverage gains over production predate this
lookup change.

The profiling-driver test checks malformed options, wrong answers, and
artifact tampering using explicitly synthetic kernels. Those fixtures are
driver tests, not mathematical or performance evidence.

## Controlled timing

Two direct comparisons use opposite module load orders on `opt` (AMD EPYC
7B13, Node 26.8.1), pinned to CPU 0, with no simultaneous builds or corpus
runs on that VM. Each has twenty warmups, seven alternating-order rounds,
64 native computations per sample, and 256 fresh PARI 2.17.4 `bnfinit(f,0)`
computations per sample. Native timing includes the existing effort retry
policy and excludes external scratch allocation. It is not public API timing.
Results and invariants are checked; certificate assumptions are unchanged.

Selected medians in milliseconds, first / second direct comparison:

| Polynomial | Production baseline | Initial-volume lean | BF lookup | PARI |
| --- | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 4.318 / 4.274 | 2.547 / 2.579 | 2.506 / 2.509 | 1.547 / 1.555 |
| $x^3+9x-55$ | 1.828 / 1.805 | 1.812 / 1.814 | 1.778 / 1.797 | 1.188 / 1.195 |
| $x^3-x^2+3x-4$ | 1.307 / 1.336 | 1.317 / 1.335 | 1.256 / 1.259 | 1.016 / 1.012 |
| $x^3-x^2-8x-159$ | 3.508 / 3.493 | 2.734 / 2.684 | 2.679 / 2.689 | 1.406 / 1.398 |
| $x^3+180x-1484$ | 2.249 / 2.221 | 1.607 / 1.603 | 1.607 / 1.619 | 1.645 / 1.645 |

Across the same seventeen development fields, geometric means of per-field
BF/lean median ratios are 0.98485 and 0.98750: approximately **1.5% and 1.25%
less runtime**. Target improvements are 1.61% and 2.73%; the class-number-two
control improves by 4.59% and 5.64%. This is a modest improvement, not the
elimination of the whole profiled BF cost. Some comparisons change sign:
the class-number-six field is 2.02% faster in the first run but 0.21% slower
in the second; the class-number-one field is 0.03% / 1.00% slower than lean.
Do not claim uniform non-regression or statistical significance for tiny
differences. The target remains about 1.6 times PARI's runtime. Most of its
gain over production comes from the preceding initial-volume experiment.

An earlier baseline/BF-only run measured 2.517 ms on the target. It is
retained as exploratory evidence, not one of the direct comparisons above:
preparation/transfer of the paired bundle overlapped its opening interval.
None of these seventeen fields is a new holdout.

## Resources and reproduction

The ordinary candidate has 478,347 bytes of mathematical source, compared
with 477,613 for initial-volume lean. Adding the unchanged 46,619-byte runtime
companion exceeds the unchanged 485,000-byte allowance by 39,966 bytes.
Generated cores after removing their exact main source pathnames are
11,597,811 versus 11,582,823 bytes; addons are 20,525,840 versus 20,521,744
bytes. This is still an unpromoted diagnostic copy requiring source
consolidation. Unchanged 1 MiB resident / 3 MiB temporary limits do not prove
unchanged peak allocation. No new Windows or Wasm qualification is claimed.

From the campaign worktree, choose a fresh project-scoped scratch parent,
then use a nonexistent child directory for each builder/package command:

```sh
node bench/class-unit-groups/diagnose-cubic-bf-lookup-build.cjs "$PWD" "$candidate"
node bench/class-unit-groups/package-cubic-conditional.cjs "$baseline_cache" "$candidate/builds.json" "$bundle"
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs "$bundle/source-builds.json" "$corpus_gz"
node bench/class-unit-groups/build-cubic-profile-symbols.cjs "$lean_builds_json" "$symbol_directory"
node --test test/number-field-cubic-bf-lookup.cjs test/number-field-cubic-profile-driver.cjs
```

Run timing serially on `opt`, pinned to CPU 0, using the existing
`diagnose-cubic-ablation-timing.cjs` driver and the same seventeen development
fields as the initial-volume experiment. Do not run builds or corpus work on
the timing VM. Sampling uses `perf record -e cpu-clock:u -F 997 --call-graph fp`
(and separately 1,999 Hz), with the hash-checked `profile-cubic-ablation.cjs`
driver. Keep sampling and timing separate; use `perf report --no-inline` for
bounded report generation on symbol-bearing Node binaries.

## Evidence identity and validation

Ordinary source SHA-256:
`7ac63c0b183ded8a54a699e6f8e41b10f1a44ee258d6f7300b0a9640b28ccb1c`.
Native cache key:
`8fc0aad72d44c6581395f2af6ca4b31918c63284afd6439fa8b72dbcb6b61163`.
The profile source is the preceding lean source
`d1115e646d40006022f509a88932639f1c7abd4cff7d89cb24207c46ae3a0bfe`,
with symbol-build key
`dcc990647b8ff466dc0a111b61b1aa6785682391b2c16cda8d5a774b1f36c6bb`.

Reports under `build/cubic-next-evidence/` (generated, not committed):

| Report | SHA-256 |
| --- | --- |
| `bf-lookup-corpus.json` | `25bb9a2a0cbd920a2672d1513776c2c24e8aa513a8f645bd166aaa89b62953a3` |
| `bf-lookup-backends.json` | `0587181b54cc94a818668b86ab3093e1efdd739a7b7bf9e6eb12a4250598f4ef` |
| `bf-lookup-paired-timing.json` | `f3965e534e9418178d776b5c197a921927a64f48f94bf7ce8a1d5f4c93acc82f` |
| `bf-lookup-forward-timing.json` | `2bdc19613d4785f007d5705104ea654e58379d0de2309ca251e5300cd5733583` |
| `target-flat.txt` | `79c616a0ada2c6559cec2a43b2a2c322d7f03297900394d989001233869b38d6` |
| `target-inclusive.txt` | `23524de8f0d24ef6304620f111c49cb0486d1bbc4520c005137f751fbeb6c59b` |
| `target997-flat.txt` | `089018787a246b75a370e1ab325bfeb8a65fc75f19fde5129895193f106651bf` |
| `target997-inclusive.txt` | `20700fa68a332f029db35305f5d345f67a12931e86bb0891828f785295be0cef` |

Formatting, architecture, merge inventories, full local build/docs, and twelve
post-build focused tests pass. The build takes 8m 28s and reuses all 42
production kernel families. Optional numerical Wasm reactors remain absent
because their reproducible toolchain is not prepared. `parallel:check` still
fails on 395 inherited live task records; these are metadata records, not
running agents. No unrelated task metadata was altered.

`test:changed -- --base HEAD` passes its merge/docs stages but fails the full
575-file CLI suite at `test/fflas-dense-prime.cjs`: explicitly requested FFLAS
RREF reports an unavailable backend in both normal and disabled-native tests.
The runner records 99 preceding file passes, cancels active siblings, and
does not start 474 remaining files. A standalone rerun reproduces the same
two failures. `packages/fflas/.native` is absent in this worktree; this change
does not edit the matrix implementation or FFLAS package. No broad-suite pass
or fresh-baseline comparison of that failure is claimed. See
`bf-lookup-changed.log` and `bf-lookup-fflas-recheck.log`.

PR190 remains draft. Public receipt and
independent replay, unseen holdout, source-budget consolidation, peak-resource
review, and cross-platform qualification remain open.
