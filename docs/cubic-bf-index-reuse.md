# Reuse authenticated indices in the cubic analytic plan

This revisits the checked-index experiment recorded in
[the earlier checkpoint](cubic-next-regime-checkpoint.md#retained-diagnostics),
which was not integrated after roughly 1% gains and small losses on resumed
examples. It is not a newly discovered mechanism. The current experiment adds
an explicit old-search oracle, malformed-index tests, full-output differential
coverage on 1,012 fields, and current-source controlled timing. The historical
negative/mixed evidence remains relevant; the target measurement alone is not
grounds to claim a broad speedup.

## Change and correctness argument

`_cubic_prepare_bf_plan` already stores a deduplicated value index in column
four of every five-word prime-power term. Previously
`_cubic_bf_finite_bounds` ignored that column and linearly searched the values
matrix for the term's norm every time. The evaluator now checks
$0\le i<\text{value_count}$, converts the checked index to `uint64`, and
requires `values[i, 0] == norm` before reading its four endpoints.

For every valid plan, construction establishes that the stored index is in
the live prefix and identifies the first occurrence of that norm. Evaluation
copies the planner's value list unchanged into the values matrix and computes
the corresponding endpoint rows. Therefore the indexed lookup selects the
same exact endpoints as the previous search. All finite-sum arithmetic,
rounding, term order, tail bounds, analytic thresholds, precision, and final
index-one acceptance conditions are unchanged. There is no new GRH assumption.

Malformed negative, oversized, or norm-mismatched indices return the existing
invalid interval `(1, 0)` before endpoint access. In particular, conversion
of an arbitrarily large integer to a machine index occurs **after** the live
prefix check. The existing caller contracts for matrix dimensions and term
counts remain in force; this is not a verifier for arbitrary external matrices.

The lookup cost changes from $O(TV)$ to $O(T)$ for $T$ terms and $V$ values.
It does not change the planner's own deduplication search or accelerate the
other analytic work.

## Differential evidence

`test/number-field-cubic-bf-prefix.cjs` retains the previous linear-search
finite-sum evaluator as an oracle. Its exact-shaped evaluation agrees with
the production prefix evaluator through thresholds 997/1494/997/997, changed
class bounds, duplicate seed values, workspace growth/shrinkage, and poisoned
unused tails. JavaScript, GMP, and fmpz backends all pass. Additional cases
corrupt an index to `-1`, `0` (an in-range norm mismatch), `256` (outside the
live prefix), or $2^{130}$; all reject cleanly.

Two isolated whole-program builds, with initial threshold 997 unchanged,
were compared on the frozen 1,012-field corpus at fixed effort five. Both
accept 948 and decline 64, with no exceptions. **Every status and all 64 output
slots agree exactly**, not just class numbers and invariant factors. This
direct-kernel differential is not an adaptive public census or independent
replay of the entire corpus.

After a complete production rebuild, public `class_number(proof=False)`
checks for $x^3+9x-55$, $x^3-x^2+3x-4$, and the selected target return 5, 2,
and 3 respectively, with matching native receipts and independent exact
conditional-GRH replay. The rebuilt production index binds the candidate
source hash to cache key
`662521bf3591c9d09e3eb47494d2494dd42c30f5f2adc628604cfbbf6cc2dd68`;
the native pack SHA-256 is
`a71aa5289b98a213a6758c776fc2300b75c1f4b968bdaa5950bb68ae875f7fc6`.
These are three public correctness checks, not public timing measurements or
a new 1,000-field public qualification. Architecture checks and strict Python
checks pass; no safety/source allowance was relaxed. The broad `test:changed`
command was stopped after it started a redundant full build; its full suite
is not claimed to pass. A subsequent serial build and repeated public checks
passed.

## Controlled native diagnostic on opt, 2026-09-08

Same known target $x^3-x^2-11x-63$ with class group $C_3$; AMD EPYC 7B13,
Linux x64, Node 26.8.1, PARI 2.17.4. CPU-0 affinity and single-thread numerical
library limits; 100 native warmups followed by eleven alternating rounds of
256 calls per implementation. PARI warms 100 calls and measures 1,000
`bnfinit(f,0)` calls per round. Native external scratch is preallocated;
process startup is excluded. Every native timed call must accept, and the
detached output is compared with the baseline after each batch.

| Implementation | Median ms/call | Range of batch means |
| --- | ---: | ---: |
| Baseline linear search | 2.274638 | 2.256542–2.340960 |
| Checked stored index | 2.255537 | 2.222511–2.303759 |
| PARI polynomial-to-bnf | 1.234000 | 1.219000–1.250000 |

The ratio of native medians improves by approximately 0.84%; ten of eleven
paired rounds favor the candidate. This is a small diagnostic gain, not a
public performance qualification or a PARI win. It also demonstrates that
this apparent redundancy was not the principal bottleneck. Do not combine
this ratio with the separate cutoff experiment or apply it to earlier public
timings without measuring the combined implementation.

### Revisit the earlier fourteen-field regression set

The existing `bench/native-source-compression-cubic.cjs` driver compares the
same baseline/candidate on ten fixture fields plus the two reported headline
fields and two resumed-certification examples. It uses four warmup rounds,
fifteen retained alternating rounds, and ten calls per sample at effort five.
All statuses and detached outputs agree. This set is already exposed, not a
new holdout, and this comparison does not time PARI.

| Field | Baseline ms | Candidate ms | Median reduction |
| --- | ---: | ---: | ---: |
| `3.1.23.1` | 0.400224 | 0.401603 | −0.345% |
| `3.1.59.1` | 0.526023 | 0.524351 | 0.318% |
| `3.1.283.1` | 1.361477 | 1.340659 | 1.529% |
| `3.1.588.1` | 1.602464 | 1.582055 | 1.274% |
| `3.1.1083.1` | 1.630711 | 1.603203 | 1.687% |
| `3.1.1371.1` | 1.485661 | 1.467890 | 1.196% |
| `3.1.1563.1` | 1.516736 | 1.498422 | 1.207% |
| `3.1.2856.1` | 1.655586 | 1.630726 | 1.502% |
| `3.1.4027.2` | 1.705941 | 1.672469 | 1.962% |
| `3.1.5448.1` | 1.908663 | 1.879006 | 1.554% |
| Reported class-number-5 field | 1.852465 | 1.822841 | 1.599% |
| Reported class-number-2 field | 1.343940 | 1.316941 | 2.009% |
| Resumed class-number-3 field | 3.074267 | 3.060085 | 0.461% |
| Resumed class-number-5 field | 3.722021 | 3.694380 | 0.743% |

Thirteen of fourteen medians improve, including both resumed examples on
this current baseline. The approximately 1.4 microsecond loss on `3.1.23.1`
is retained rather than silently discarded; these samples do not establish
whether that small difference is reproducible. This evidence supports a
small cleanup, not universal speedup or competitive-frontier qualification.

## Reproduction and identities

Build isolated copies with the current source and the recorded baseline:

```sh
node bench/class-unit-groups/diagnose-cubic-bf-index-build.cjs "$PWD" /path/to/experiment 434481d5e
```

The same current compiler and imported modules compile both bodies. Copy the
resulting directory to a compatible Linux host, then run:

```sh
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 taskset -c 0 node bench/class-unit-groups/diagnose-cubic-bf-index-timing.cjs /path/to/experiment /path/to/gp
```

The corpus differential reuses `diagnose-cubic-cutoff-survey.cjs` with the
two `index.cjs` paths and the frozen corpus gzip. Besides its reported class
numbers/invariants and coverage, compare both complete `results` records for
every observation; that includes all 64 output slots for accepted and declined
calls.

Retained ignored evidence under `build/cubic-next-evidence/`:

- `bf-index-opt-timing.json`, SHA-256
  `08c0d77d13fa253885b8db37f8f2c06e96ca29c04862c914bd8278f3d458025c`.
- `bf-index-fixed-effort-survey.json`, SHA-256
  `937ad2eb18d0acd2d618ae6ccb035fe67b4e5f5e65e308e826482c7836ec2e93`.
- `bf-index-regression.json`, SHA-256
  `627db5c00eea5147befbab53414a1eafea3170fa9bd84d012388b9d2e23a23c3`.
- `bf-index-public-smoke-final.log`, SHA-256
  `caa24ed134c30d70c0af6aca8aafca12f0a101c7bb71d0b686d8983b343f2d38`.

Native baseline cache key:
`3bbd6af2f58c16ce7e4051c0606edcf65b7a76acbd2910cf986341121030af62`.
Candidate cache key:
`7d3190763bafc280b4fe1b988c5233fb6bbec042cd3fddb61b714cc12395510f`.
Candidate Python source SHA-256:
`9269e26eef7c15779ab13dec3e034f9c4d24d7efff78da19bea55d35291facc7`.
No resource allowance or native safety envelope is increased by this change.

The Python file grows from 437,221 to 437,513 bytes, mostly explicit guards
and their explanation. Replacing each experimental source path in generated
C with the same `<SOURCE>` marker gives 11,203,292 versus 11,206,679 bytes.
This normalization matters: otherwise different path lengths in thousands of
provenance directives misleadingly suggest a substantial source-size decrease.
Both standalone Linux addon files occupy 20,390,672 bytes; that is a file-size
observation, not a claim that their machine code or contents are identical.

## What this rules out; next compiler experiment

The small gain rules out the ignored index as the dominant source of the
remaining latency on this target. The previous instrumented cost ledger
attributes about 0.080 ms to 27 exact ceiling-square-root calls. Inspection
shows that `_cubic_ceil_sqrt` already uses Newton iteration, but first obtains
the bit length by repeated exact division by two and constructs its seed by
repeated multiplication by two. Replacing Newton iteration is not the
obvious next step; eliminating those setup loops is.

A direct `lowerSource` probe on this compiler rejects `value.bit_length()`
for an `int` argument with `native method call target is not a live exact
owner`. In contrast, `1 << shift` with a `uint64` shift is accepted by IR
lowering. Thus ordinary Python integer bit-length syntax is a confirmed
compiler obstruction, not merely a suspected missing optimization. No
generated-code or performance claim for a replacement follows from this probe.

A useful next compiler experiment is exact `int.bit_length()` support across
the dynamic and native integer backends, followed by a power-of-two Newton
seed in ordinary Python. It must preserve zero/negative semantics, large
integers, source provenance, and closed native calls. The 0.080 ms is an
upper bound on the phase cost available to reduce in that instrumented run,
not an expected saving and not enough by itself to close the PARI gap.
