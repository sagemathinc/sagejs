# Analytic resumption and twelve-factor ideal ordering

Status: **experimental, not promoted**. This follows the
[volume-batch experiment](cubic-volume-batch-experiment.md). Production source,
acceptance inequalities, registry, and resource limits are unchanged. PR190
remains draft. These experiments improve our baseline, but do not beat PARI.

## What changed, and why resuming is legitimate

The first source-copy variant retains the earlier twelve-factor checkpoint
($n+6$ rows), exact volume-guided recovery shells, and retained ideal cursors.
It changes only the authorization to collect another batch after closure:

- A nonzero closure status never authorizes recovery.
- Phase 43/reason 434 retains the existing missing-unit recovery path.
- Phase 8 can resume only with a positive interval scale and an explicit
  insufficiency result from the existing analytic-index classifier.

The classifier checks interval ordering and the enclosure for $\log 2$.
An upper endpoint at least the lower endpoint for $\log 2$ is insufficient
to establish index one. A reversed interval, invalid logarithm bounds, or
the classifier's contradictory below-$\log 2$ cases do not authorize recovery.
Reasons 435/436 are not used to identify phase-8 insufficiency: they may
be markers left over from earlier unit materialization.

This is an authorization to **search**, not to accept. Its correctness
obligation is that another batch preserves authenticated discovery data and
that acceptance still requires the original certificate. The root refreshes
the relation presentation and Smith data after growth, and either establishes
the trivial quotient or invokes the unchanged exact closure. Fatal statuses,
rank failures, invalid growth, exhausted storage, and the existing three-batch
limit remain fail-closed. No new mathematical completeness bound or GRH
assumption is introduced. This is a written argument backed by tests, not a
Lean proof or a universal verification of native memory behavior.

The second variant additionally extends the existing PARI-style ideal-order
policy from at most eleven factors to at most twelve, at efforts 3 through 5.
The canonical-prefix eligibility at efforts 1 and 2 is unchanged. This is
not just reordering an identical list: enabling that policy also activates
the existing last-eight-position prefix selection (plus degree-two ideals).
The permutation and prefix algorithms themselves are unchanged. There are no
field-polynomial or expected-answer branches.

## Exact retained-state audit

An untimed native variant copies and compares every entry of the retained
workspace outside named HNF/map/row scratch, the full modular workspace,
ideal order/transforms/parameters, live relation and element prefixes,
online basis/support, relation presentation/HNF, and expanded plans/cursors,
immediately before and after each closure call. Comparisons are exact, not
hashes. Attempt-local scratch matrices and unused matrix tails are excluded.

On the target and all thirteen fields lost by the previous early-checkpoint
experiment, the plain variant audits **38 closure calls** and the permuted
variant **14**, with no retained entry changed. Some trivial-quotient results
need no further analytic closure. This audits selected native paths only;
it is not independent exact replay of the whole 1,012-field corpus.

The audit uses an extra external 32,768-entry, 4,096-bit-capacity buffer.
It is explicitly excluded from performance measurements and does not support
a production peak-memory claim. The first audit incorrectly assumed the
order matrix always had $n$ rows; disabled permutation uses a one-row
placeholder. Native bounds checks rejected that harness. The corrected audit
uses the actual `adjacent_order_rows`, without changing production code.

The traces explain the speed difference. On $x^3-x^2-8x-159$, plain ordering
first presents order 12 at 18 rows and certifies order 6 at 19 rows. Permuted
ordering certifies order 6 at the first 18-row attempt. On $x^3-x^2+22x-47$,
plain ordering retains an order-8 presentation through four attempts and
declines; permuted ordering certifies order 4 on its first attempt. On the
main target $x^3-x^2-7x+122$, permutation reduces four closure attempts to
three, ending at 22 rather than 26 rows in this audit.

## Paired development corpus

The frozen corpus contains 1,000 tuning fields and twelve previously used
controls. It is **not a new holdout**. At effort 5:

| Variant | Accept | Decline | Exceptions | Gains / losses vs baseline |
| --- | ---: | ---: | ---: | --- |
| Baseline | 961 | 51 | 0 | — |
| Analytic resumption | 962 | 50 | 0 | 2 / 1 |
| Resumption plus twelve-factor policy | 963 | 49 | 0 | 2 / 0 |

All accepted class numbers and invariants agree with the corpus. The gains
are `3.1.439628.6` and `3.1.1954455.1`. Plain resumption still loses
`3.1.83327.1`; the policy extension recovers it. Neither candidate has new
public authenticated-receipt, independent replay, or cross-platform
qualification. The earlier production replay does not qualify these copies.

## Controlled timings

Two serialized runs on `opt` reverse module load order. Each uses CPU 0,
20 warmups, seven alternating forward/reverse rounds, 64 native calls per
sample and 256 PARI calls per sample. Host: EPYC 7B13, Node v26.8.1,
PARI 2.17.4. The boundary is polynomial-to-native-result with preallocated
external buffers and the existing retry policy, versus fresh `bnfinit(f,0)`.
It is not public-API timing. Values below are median milliseconds, with
first and reverse-load runs separated by a slash.

| Polynomial | Baseline | Combined candidate | PARI |
| --- | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 4.259 / 4.308 | 4.067 / 4.041 | 1.535 / 1.539 |
| $x^3+9x-55$ | 1.856 / 1.811 | 1.837 / 1.805 | 1.188 / 1.184 |
| $x^3-x^2+3x-4$ | 1.290 / 1.310 | 1.319 / 1.308 | 1.012 / 1.008 |
| $x^3-x^2-11x-63$ | 2.226 / 2.234 | 2.285 / 2.213 | 1.227 / 1.230 |
| $x^3-x^2-8x-159$ | 3.451 / 3.517 | 2.337 / 2.362 | 1.395 / 1.406 |
| $x^3-x^2+22x-47$ | 3.585 / 3.607 | 2.962 / 2.948 | 1.758 / 1.758 |

The timing set includes all thirteen previously lost fields plus four
controls, not just the strongest improvements. Across those thirteen fields,
the combined candidate improves baseline by roughly 17–33% in both runs.
The target improves roughly 4.5–6.2%. Small control regressions in the first
run do not persist in reverse load order; this does not establish universal
non-regression. **PARI remains faster on every one of the seventeen fields.**
Plain resumption alone is slower: target 5.328 ms versus 4.264 ms baseline;
the remaining lost field costs 13.855 ms including retries versus 3.573 ms.

## Resources and reproducibility

Plain/permuted mathematical source sizes are 450,249 / 450,217 bytes. With
the 46,619-byte runtime companion they exceed the existing 485,000-byte limit
by 11,868 / 11,836 bytes. The limit was not changed. Native manifests record
zero host callbacks. Resident/temporary allowances remain 1 MiB / 3 MiB;
unchanged limits do not prove unchanged peak use.

For a pathname-neutral generated-code comparison, remove every occurrence
of the exact main source pathname from each core C file. Baseline then has
10,802,229 bytes, plain 11,088,330, permuted 11,087,968. Both candidate addons
are 20,456,208 bytes versus baseline 20,411,152. Thus this experiment adds
code; shorter diagnostic paths must not be advertised as code compression.

Reproduce with fresh directories under a project-specific scratch parent:

```sh
node bench/class-unit-groups/diagnose-cubic-analytic-resume-build.cjs "$PWD" /scratch/PROJECT/fresh-plain plain
node bench/class-unit-groups/diagnose-cubic-analytic-resume-build.cjs "$PWD" /scratch/PROJECT/fresh-permuted permuted
node bench/class-unit-groups/diagnose-cubic-analytic-resume-build.cjs "$PWD" /scratch/PROJECT/fresh-audit permuted-audit
node bench/class-unit-groups/diagnose-cubic-analytic-resume-audit.cjs /scratch/PROJECT/fresh-audit/builds.json build/cubic-next-evidence/volume-batch-corpus-early.json
node --test test/number-field-cubic-analytic-resume.cjs test/number-field-cubic-staged-driver.cjs test/number-field-cubic-volume-batch.cjs test/number-field-cubic-conditional-prefix.cjs test/number-field-cubic-exact-fp-oracle.cjs
```

Use the existing `package-cubic-conditional.cjs`, paired corpus runner, and
timing driver as described in the preceding experiment. Audit builds are
rejected by the timing packager. The current builder reproduces all four
saved mathematical source copies byte-for-byte. Earlier manifests recorded
the builder digest at completion; it is now captured at module load, so an
edit during compilation cannot misattribute that digest. This does not
retroactively claim identical historical builder files.

Source SHA-256:

- Baseline: `93a41e20e4c7916bb00957ae0322b5378bf16491c317f5eeea2ef3f011a29e2c`
- Plain: `cd000bbc948f453b548bc30cd05b4e5c9f47d7262465bb96700306a7d966f46c`
- Permuted: `1c237fca8684f581147e6310b02c4a14a48d1570f45d349175b233a35d302fbc`

Reports in `build/cubic-next-evidence/`, with SHA-256:

- `analytic-resume-corpus.json`: `d177a9b7ba827688fb7692b4ef7876c9a97ae48728cfa73b925c46175483bab0`
- `analytic-resume-corpus-permuted.json`: `c73cd2310521448ea418dba36163edb99d0660702134c646e5087e8b4fbcf481`
- `analytic-resume-audit-v2.json`: `ba85f1ae793bade2c3f9b45c6eb8f27d9eea8a488ad5ba2a5910351809b7a6de`
- `analytic-resume-audit-permuted.json`: `2c089a2f3ba0f324d7b7edffdb29e98607e154597413193dc9a58b29f5bef0d4`
- `analytic-resume-opt-timing.json`: `21b6f1be252612b6892b83a1ce6b0177aa0a2ad6f7e949e7c178064f4cd49fbb`
- `analytic-resume-opt-permuted.json`: `112fd1429e2b8d02367d6940c18f7ee97fe97246da6557e2d41b11ced6256eb1`
- `analytic-resume-opt-reverse.json`: `41eec880a4d4d5291f2a5e6cde8160c060a6586ffb3f5a34280739760ea39665`

Eight focused tests pass, including 450 guard cases, actual-root adversarial
execution, and 432 guard cases compared across CPython, JavaScript, GMP and
fmpz. Formatting and architecture checks pass. Inherited parallel metadata
still reports 395 live task records; it is not a count of running agents.
The complete local build and documentation check pass (8m29s); all eight
focused tests pass again against that rebuilt runtime with zero skips.
All 42 production kernel families were reused, with no experimental candidate
installed. Optional numerical Wasm reactors were skipped because their
reproducible toolchain is absent; this is not full platform qualification.

## Next structural experiment

Use useful volume-guided, per-ideal batches from the initial search, not
only shells appended after the cheap prefix. First audit the interaction
with planned ideal powers and smooth valuation limits. Initial per-ideal
quotas must not depend on already having full modular rank: the present
recovery scheduler requires that rank, so reusing it blindly would not
implement PARI's initial collection strategy. Keep this separate from the
ordering experiment and preserve the final certificate in every variant.

The initial source audit narrows the power-planning concern. In bounded mode,
`_cubic_plan_adjacent_ideal` prepares the reduced ellipsoid without exhaustive
norm preplanning. `_cubic_append_smooth_principal_relation` factors the actual
primitive element norm, lazily extends stored ideal powers when needed, and
checks lattice membership and the weighted norm valuation before admission.
Valuations above `_CUBIC_MAX_POWERS` are rejected, not accepted using a
truncated valuation. Thus a larger initial radius need not require an
exhaustive prepass for all new norms. It can still increase lazy power work
and rejected proposals; those effects need measurement and boundary tests.

There are two distinct stopping predicates to preserve. The global
certification checkpoint requires both enough rows and full modular rank;
an ideal visit's four-new-row quota must work even below full rank. Existing
admission deliberately retains dependent rows before full rank, so lowering
the global `relation_target` is not an implementation of the local quota.
A new visit limit must interrupt enumeration without discarding its cursor,
resetting cumulative candidate counts, or changing row authentication.
