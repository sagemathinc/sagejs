# Cubic residue scales: exact audit and scheduling experiment

This is a correctness correction and a diagnostic experiment, not a new
performance or release qualification. Historical timing reports at $X=997$
remain historical measurements, not evidence that their analytic enclosure
satisfied the theorem contract.

Subsequent audit also leaves the **experimental Corollary-8 variants
unqualified**: the printed specialization constants require an explanation
not supplied by direct substitution into Theorem 7. See the specialization
audit below. The production Theorem-1/BF-999 correction is unchanged.

## Formula contract

[Belabas--Friedman, Theorem 1](https://www.math.u-bordeaux.fr/~kbelabas/research/residue-arxiv.pdf)
uses the **real** scale $X/9$ in

$$
f_K(X)=\frac{3(B_K(X)-B_K(X/9))}{2\sqrt X\log(3X)}.
$$

The native planner seeded its logarithm/square-root batch with `X // 9`.
At the former initial cutoff $997$, that is $110$, not $997/9$. The
finite-expression evaluator used those endpoints as continuous weights;
this was not merely an integer bound on a prime-power enumeration.
The tail evaluator also used $\log(110)$, increasing its error allowance,
but that increase does not in general absorb the finite-expression change.

The correction uses $X=999$ initially, retains refinement at $1494$, and
rejects a nonmultiple of nine before touching the BF workspace. Both allowed
cutoffs have exact integer ninth scales. The strict index-one test, GRH
hypotheses, resource capacities, and source allowance are unchanged.
This restriction is an implementation contract, not a restriction of the
theorem, which permits real $X\geq69$.

## Exact witness, not a wrong-class-number example

Use $K=\mathbb Q[a]$ with $a^3-a^2+26a-146=0$. Local PARI 2.17.4 reports
irreducibility, polynomial and field discriminant $-577416$, and class group
$C_6$. Equality of these discriminants establishes maximality of the defining
order, so polynomial factor degrees determine the required residue degrees,
including ramified primes.

The standalone audit is ordinary CPython with no PARI or Sage.js dependency:

```sh
python3 bench/class-unit-groups/cubic-bf-scale-audit.py '-146,26,-1,1' -577416 997
python3 bench/class-unit-groups/cubic-bf-scale-audit.py '-146,26,-1,1' -577416 999
```

The caller must establish maximality separately; the script does not certify
an arbitrary input order. For this witness the independent PARI check is:

```gp
f=x^3-x^2+26*x-146;
[polisirreducible(f),poldisc(f),nfdisc(f),bnfinit(f,0).clgp]
```

Put $Y=X/9$ and $q=\lfloor Y\rfloor$. Subtracting the two finite sums gives

$$
B_K(Y)-B_K(q)=
\bigl(\sqrt Y\log Y-\sqrt q\log q\bigr)
\sum_{N\mathfrak p^m\leq q}^{K-\mathbb Q}
\frac{1}{mN\mathfrak p^m}.
$$

There is no integer norm power strictly between $q$ and $Y<q+1$; at the
boundary $N\mathfrak p^m=q$, the original $B_K(q)$ summand vanishes. This
explains the inclusive boundary in the audit's rational coefficient sum.

Every decision uses `Fraction` intervals. Square roots use integer square
roots at 160-bit dyadic precision. Logarithms use power-of-two reduction and
96 terms of the positive atanh series, with a geometric remainder bound.
The printed floating-point numbers are display only.

At $997$, the exact intervals prove that the magnitude of the finite shift
exceeds $0.002$, whereas the extra tail allowance is less than $0.0004$.
Approximate values are $0.002169710252129252$ and
$0.00036170658950233616$, respectively. Thus the old interval need not contain
the theorem-stated interval. This does **not** prove the actual zeta residue
is outside the old interval, and no wrong class number has been observed.
At $999$ both discrepancies vanish; the audit's interval enclosures contain
zero with width below $10^{-35}$.

The regression additionally executes the actual production planner's leading
guard. The BF prefix test exercises rejection of $997,998,1000$ and valid
grow/shrink reuse at $999,1494$ in JavaScript, GMP, and fmpz execution.
These checks are not a Lean formalization or a proof of the entire algorithm.

## Frozen development-corpus diagnostic

The frozen corpus has 1,000 development fields plus 12 controls; its
uncompressed SHA-256 is
`81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd`.
All rows use effort five and the same 1 MiB/3 MiB arena limits. Accepted class
numbers and invariant factors are compared exactly with the frozen oracle.
Declines are retained, not dropped. This is neither the unseen holdout nor
authenticated public receipts or independent exact replay.

Two different sources were checked; their coverage must not be conflated:

| Source | Cutoff | Accepted / 1,012 | Initial analytic closure | Refinement to 1494 |
|---|---:|---:|---:|---:|
| Production baseline | 997 (old contract) | 940 | 754 | 0 |
| Corrected production | 999 | 940 | 754 | 0 |
| Experimental BF lookup | 997 (old contract) | 963 | 771 | 0 |
| Experimental BF lookup | 513 | 963 | 10 | 761 |
| Experimental BF lookup | 765 | 963 | 481 | 290 |
| Experimental BF lookup | 999 | 963 | 771 | 0 |

The production rows contain 186 nonanalytic acceptances; the experimental
rows contain 192. Every
comparison has zero accepted-answer mismatches and zero caught errors, with
no gained or lost acceptances. Smaller cutoffs incur more refinements; these
untimed observations do not establish a speedup. In particular, blindly
choosing the smallest initial cutoff is not justified.

## Provenance and reproduction

The diagnostic builder accepts the historical experimental source and changes
only its initial-cutoff declaration. It rejects new nonmultiple-of-nine
experiments. Its implicit $997$ baseline is explicitly unqualified. Earlier
$512/768$ builds were abandoned before timing or corpus evaluation.

```sh
node bench/class-unit-groups/cubic-analytic-schedule.cjs build COMPILER_ROOT SOURCE FRESH_DEST 513 765 999
node bench/class-unit-groups/cubic-analytic-schedule.cjs summarize CORPUS_REPORT
node --test test/cubic-analytic-schedule.cjs
```

The compiled experiments used the stable compiler worktree at
`07e61837cdbd4f967f537a1762369d59e35d4cc5` while this lane built separately.
The experimental baseline source hash is
`7ac63c0b183ded8a54a699e6f8e41b10f1a44ee258d6f7300b0a9640b28ccb1c`;
the corrected production source hash is
`d49e706a66f783e0562fd18cc375d77070c702046470ef5ff844400e76636585`.
Experimental corpus report hash:
`b06452cceb09c18f46e31b1189b5276f483eeceecf98745944b4aa0b0212d0a7`.
Production before/after report hash:
`d3dd711b83efe54ebec212505d1128430bd9fef8a39c6cd25f7335009ee65090`.
Its old-source control uses the previously compiled baseline artifact
`322c02bd9db816c54352de38f2436b3f88d197901df38b3a25f77bb1038c7524`
from the constant-index campaign's baseline compiler snapshot; this is an
untimed correctness comparison, not a controlled compiler-speed comparison.
Build manifests bind each copied source, generated module/cache identity,
and builder. Reports and manifests are retained in the lane's ignored
`build/cubic-analytic-schedule-evidence` directory; scratch working copies
are not the durable record.

Release candidate `efccac48073504c59ca0c00f283521862491928c` has
byte-identical planner, finite evaluator, and combined evaluator bodies to
this lane's uncorrected baseline. The same formula discrepancy applies.

## Next performance question

First qualify the corrected formula through public receipt/replay and platform
gates. Then measure an adaptive schedule on the dedicated timing host, keeping
all declines and retry costs. The observed refinement distribution is useful
for choosing candidate schedules but is not itself an acceptance rule.
Separately investigate sharper residue bounds and reconstruct PARI's actual
smoothed-prime computation: matching a numeric cutoff alone does not make two
different analytic formulas equivalent. Do not weaken certification to obtain
a favorable timing comparison.

One concrete lead is the same paper's Corollary 8. For signature $(1,1)$,
dropping its nonpositive prime sum and using $\beta\leq1$ at $X\geq69$
gives the simpler upper bound

$$
\frac{4.65}{\sqrt X\log(3X)}
\left[\frac{6.69}{\sqrt X}
+\left(1+\frac{3.88}{\log(X/9)}\right)
\bigl(\log|D_K|-2.672\bigr)\right].
$$

It needs no additional splitting data. A floating-point screen on the 771
experimental analytic acceptances gives ratios to the current tail bound at
$X=999$ of $0.32034$ minimum, $0.68339$ median, and $0.79884$ maximum.
This is candidate-selection evidence only: no acceptance uses these floats,
no native implementation of this bound is included, and no speedup follows
without exact lowering, certificate replay, and controlled timings. The
screen is retained as `corollary8-screen.json` with its diagnostic markers.

### Separate source-copy prototype

A subsequent unpromoted prototype implements that coarse Corollary-8 formula
in the actual native tail helper. It is deliberately **not** part of the
production correction in this PR. Its extracted actual helper encloses an
independent rational formula in 90 combinations of discriminant, cutoff, and
dyadic precision. Full native development-corpus checks give:

| Initial cutoff | Accepted | Initial analytic successes | Refined successes | Mismatches / errors |
|---|---:|---:|---:|---:|
| 999 | 940 | 754 | 0 | 0 / 0 |
| 513 | 940 | 562 | 192 | 0 / 0 |
| 765 | 940 | 754 | 0 | 0 / 0 |

All also retain 186 nonanalytic successes and exactly the baseline's 72
declines. This makes 765 preferable to 513 for the next controlled comparison,
without assuming that corpus behavior proves correctness or generality.
Source hashes at 999 and 765 respectively are
`337ff3981f2beff289dfe75e53b7ee454c9dd17fc68daa7fa345bc76e117acbd` and
`ab8191135418002fd4ecd431e77566c44b66083c361edd3cf2d44c7cf4071076`.
Sources, audit script, manifests, corpus reports, and timing reports are
retained under `build/cubic-analytic-schedule-evidence/corollary8-pilot`.

Two serial controlled runs on `opt`, with opposite implementation order,
used the existing 17-field diagnostic panel. Each has seven alternating
rounds, 20 warmups, 64 native calls per sample, and 256 fresh PARI
`bnfinit(f,0)` calls. External native scratch is preallocated and the existing
effort retry policy is included. This is not public-call timing, compilation
time, an unseen holdout, or full-corpus replay qualification.

The sums of per-field median milliseconds were:

| Run | Corrected production, 999 | Corollary 8, 999 | Corollary 8, 765 | PARI |
|---|---:|---:|---:|---:|
| Forward | 88.856 | 88.882 | 85.276 | 26.492 |
| Reverse | 89.338 | 89.188 | 85.643 | 26.578 |

The 765 prototype improves this aggregate by 4.03% and 4.14%; merely changing
the tail formula at 999 is essentially flat. For $x^3+9x-55$, its medians
are 2.962 and 2.865 ms versus corrected production's 3.118 and 3.209 ms and
PARI's 1.223 and 1.207 ms. This field's discriminant is $-9399$, not the
defining polynomial's $-84591$. These are modest improvements, not a PARI win.

### Next dominant cost: unsuccessful unit-stage work

The panel's $x^3-x^2-7x+122$ case still takes about 12.4 ms versus PARI's
1.58 ms. A separate individual-effort diagnostic on the same timing host
measures the existing individual effort modes (seven samples of 64 calls):

- Corrected production's effort five spends a median 6.747 ms before declining
  at phase 43, reason 434: no authenticated unit after bounded support/recovery.
- Effort one then succeeds in 5.835 ms. The ordinary retry driver pays both.
- Globally swapping these modes is not justified: for $x^3+9x-55$, effort one
  costs 3.850 ms while effort five succeeds in 3.195 ms.

The next forensic question is whether unit information is lost during
compaction or absent from the collected relations altogether. The marker
alone does not distinguish those causes. Inspect the full relation kernel
and PARI's corresponding unit/archimedean state before changing retention or
collection policy; first check whether the existing experimental branch has
already addressed this regime. A smaller residue cutoff cannot recover the
time spent on an attempt that fails before residue certification.

### Combined search and analytic-bound experiment

**Qualification warning (subsequent audit):** all Corollary-8 source-copy
results below are historical diagnostic observations, not qualified GRH
certification. The later specialization audit at the end of this section
finds a gap between the printed Theorem 7 and Corollary 8 constants. Until
that gap is explained, retain the stronger-search **Theorem-1/BF-999** source
as the supported comparison baseline; do not promote either coarse or
partial-prime Corollary-8 bounds. The production scale correction does not
use Corollary 8 and is unaffected by this qualification issue.

The retained `agent/cubic-frontier-next` forensics already answered the
missing-unit question. A fresh execution of its exact PARI oracle against the
saved precompaction transcripts confirms 34 rows of rank 12 and index 8 in
the original ordering, and 33 rows of the same rank/index in the reordered
search. All 22 or 21 integer-kernel basis products are exactly $1$ or $-1$.
Thus those captured rows cannot yield a nontrivial unit, irrespective of
compaction. These are historical captured search states, not a new capture
of the current production artifact.

The extra principal relation for $-11-4a$ gives the exact dependency product
$-17506a^2+106579a-419747$, of norm $-1$. The oracle checks the principal
ideal equalities, not only norms. This generator is a forensic witness, not
a production special case. The existing experimental initial-volume search
already addresses this missing-relation regime; repeating that implementation
would not be new progress.

We therefore compose the previously audited initial-volume/BF-lookup source
with the corrected ninth-scale guard and the coarse Corollary-8 tail. The
composition script authenticates both input hashes and checks that no function
AST changes except the planner guard and the tail helper; the initial cutoff
is the only additional constant change. All use the same stable compiler
checkout `07e61837cdbd4f967f537a1762369d59e35d4cc5`.

| Source-copy variant | First-effort acceptances | Analytic / nonanalytic | Refined successes | Errors / mismatches |
|---|---:|---:|---:|---:|
| Corrected production, 999 | 940 | 754 / 186 | 0 | 0 / 0 |
| Stronger search + BF lookup, 999 | 963 | 771 / 192 | 0 | 0 / 0 |
| Stronger search + Corollary 8, 999 | 963 | 771 / 192 | 0 | 0 / 0 |
| Stronger search + Corollary 8, 765 | 963 | 771 / 192 | 0 | 0 / 0 |

These are the same frozen 1,012 development/control fields, not an unseen
holdout. There are 23 gains and no losses relative to corrected production.
The three search variants have identical acceptance sets and accepted output
entries 20–35 (relation/unit and field data). For the combined 765 source,
fmpz, GMP, and JavaScript additionally agree on all 64 output entries for
every field, including declines. The actual tail helper also passes the 90
independent rational enclosure checks. None of these replaces independent
certificate replay or public receipt authentication.

The first controlled `opt` run uses the same 17 fields and sampling protocol
as above, now with all four implementations in one comparison:

| Polynomial | Corrected production | Stronger search, BF 999 | Stronger search, Corollary 8 at 765 | PARI |
|---|---:|---:|---:|---:|
| $x^3-x^2-7x+122$ | 12.553 ms | 2.535 ms | 2.498 ms | 1.574 ms |
| $x^3+9x-55$ | 3.149 ms | 1.807 ms | 1.732 ms | 1.215 ms |
| $x^3-x^2+3x-4$ | 2.272 ms | 1.285 ms | 1.204 ms | 1.027 ms |
| Sum of all 17 per-field medians | 87.552 ms | 45.414 ms | 44.377 ms | 26.418 ms |

Most of the improvement over production comes from the existing stronger
search source, not the new analytic formula. The latter's 765 variant reduces
this aggregate by 2.28% relative to the stronger-search BF baseline. Changing
only the tail at 999 gives 45.169 ms. This is not uniform non-regression:
$x^3-x^2+28x-447$ is 1.759 ms with BF versus 1.789 ms with Corollary 8 at 765.
The principal targets remain slower than PARI.

A second serial run, reversing implementation load order, gives aggregate
sums 87.192 / 45.080 / 45.138 / 43.879 / 26.320 ms for production, stronger
search with BF 999, Corollary 8 at 999, Corollary 8 at 765, and PARI.
The 765 change improves the stronger-search aggregate by 2.66% in this run,
versus 2.28% in the first. The corresponding medians are:

| Polynomial | Combined 765, first / second | PARI, first / second |
|---|---:|---:|
| $x^3-x^2-7x+122$ | 2.498 / 2.437 ms | 1.574 / 1.563 ms |
| $x^3+9x-55$ | 1.732 / 1.734 ms | 1.215 / 1.207 ms |
| $x^3-x^2+3x-4$ | 1.204 / 1.192 ms | 1.027 / 1.027 ms |

The combined aggregate is 1.680 and 1.667 times PARI's, versus about 3.31
times for this corrected production baseline. These are ratios of sums of
per-field medians, not geometric means, public-call measurements, or a claim
about the distribution of all complex cubic fields. The two small per-field
regressions relative to stronger-search BF in the first run do not repeat in
the second; uniform non-regression remains unproved.

The stronger source is **not qualified for release**. The combined mathematical
module is 477,118 bytes and its runtime module is 46,619 bytes, totaling
523,737: 38,737 over the unchanged 485,000-byte allowance. A simple root-name
reachability audit finds only one unused function, 1,248 bytes, so deleting
dead helpers alone cannot resolve this. The generated core also grows from
16,005,276 to 16,187,845 bytes when replacing the tail, despite the shorter
Python source. Source length is not a proxy for generated-code cost.
Consolidation, generated-code/resource review, public replay, and platform
qualification remain required; no allowance was increased.

Source identities, respectively stronger-search BF 999, Corollary 8 at 999,
and Corollary 8 at 765:

- `fb1b003609d37a51a47534f01508ea81a7a585d7c6dc203acafd14e48c517cc6`
- `52de9ce9977d999e54107d41b88d47c0d312fe2f2acace647789571b2eab07b0`
- `e9fa679cd2a61f56f61332ad86f6b3a37de16103415c75325594c40c9b9f54ac`

Composition/audit scripts, sources, build identities, full corpus/backend
observations, and timing reports are retained under
`build/cubic-analytic-schedule-evidence/combined-search`.

### A further bound improvement available from existing data

There is a general way to retain part of Corollary 8's favorable prime-ideal
sum without adding any transcendental inputs. Before forming its prime-power
terms, our planner stores $c(n)=a_K(n)-a_{\mathbb Q}(n)$, where $a_K(n)$ counts
prime ideals of norm $n$, not their higher powers. Consequently

$$
0\leq\max(c(n),0)\leq a_K(n).
$$

Every positive coefficient already has a log/square-root entry in the finite
plan. Thus outward-rounded evaluation of

$$
S_+(X)=\sum_{2\leq n<X}\max(c(n),0)\frac{\log n}{n\sqrt n}
$$

gives a lower bound for the prime-ideal sum in Corollary 8. Subtracting twice
a rational lower endpoint for $S_+(X)$ from the coarse bracket gives a safe
tighter bound. A native implementation must count each norm once, not once
per prime-power term or again for the second scale, and authenticate live
indices as the finite evaluator does.

An independent exact-rational experiment on three separately PARI-checked
maximal defining orders and four cutoffs checks this inequality. For the
noncyclic field, the coarse upper bound at 765 is about 0.419895, reduced to
0.381734 by this partial sum. For $x^3-x^2+3x-4$, the values are 0.132648 and
0.104320. These are bound widths, not timings or new native acceptance results.
That pilot was followed by the isolated native experiment below; the production
source is still unchanged.

### Native partial-prime bound: small-panel gain, full-corpus regression

The source-copy implementation adds `_cubic_bf_positive_prime_sum_lower`,
changes the tail helper to accept its result, and calls it from the finite
evaluator. An AST comparison authenticates that these are the only function
changes relative to combined Corollary-8/765; three variants change only the
initial cutoff to 765, 513, or 333. They retain the 1494 refinement and the
existing exact index-one acceptance rule.

For dyadic scale $s$, the helper computes

$$
L=\sum_{c(n)>0}
\left\lfloor\frac{c(n)\,\operatorname{logLower}(n)\,s}
{n\,\operatorname{sqrtUpper}(n)}\right\rfloor.
$$

Thus $L/s\leq S_+(X)$, using nonnegative log lower endpoints and positive
square-root upper endpoints. Only first-scale, exponent-one terms contribute.
Their selected norms must be strictly increasing; live value indices, norm
values, coefficient slots, and endpoint ordering are checked before use.
Higher powers and the second finite-sum scale cannot duplicate contributions.
Omitting favorable terms weakens this lower bound rather than invalidating it.
The helper is not an independent validator of prime decomposition: that remains
the authenticated planner's responsibility.

Under the hypotheses of [Belabas–Friedman, Corollary 8 and Remark 6](https://www.math.u-bordeaux.fr/~kbelabas/research/residue-arxiv.pdf),
specializing to degree three with one real place and replacing $\beta$ by one
for $X\geq69$ gives the conservative bound

$$
|\log\kappa_K-f_K(X)|\leq
\frac{4.65}{\sqrt X\log(3X)}
\left[
\frac{6.69}{\sqrt X}+
\left(1+\frac{3.88}{\log(X/9)}\right)
\left(\log|D_K|-2.672-\frac{2L}{s}\right)
\right].
$$

The decimal constants are exact rationals in the implementation. Every
operation rounds outward. A negative supplied $L$, nonpositive remaining
bracket, or malformed interval fails closed. This changes a certified residue
enclosure, not the theorem identifying the joint relation/unit index with a
positive integer. No empirical bound is promoted to a GRH theorem.

The actual helpers pass 800 independent rational cases (four precisions,
four cutoffs, 50 coefficient fixtures each) and 20 invalid-input cases.
An isolated compiled probe additionally passes 818 cases per backend on fmpz,
GMP, and JavaScript, with exact CPython outputs, input immutability, and poisoned
output preservation on rejected cases. These synthetic coefficient fixtures
test arithmetic and validation, not prime-decomposition correctness.

| Source-copy variant | First-effort successes | Initial analytic | Refined analytic | Nonanalytic | Errors / mismatches |
|---|---:|---:|---:|---:|---:|
| Coarse 765 baseline | 963 | 771 | 0 | 192 | 0 / 0 |
| Partial-prime 765 | 963 | 771 | 0 | 192 | 0 / 0 |
| Partial-prime 513 | 963 | 616 | 155 | 192 | 0 / 0 |
| Partial-prime 333 | 963 | 260 | 511 | 192 | 0 / 0 |

Acceptance sets and accepted relation counts are unchanged. The 513 source
also agrees across fmpz/GMP/JavaScript on all 64 output words for all 1,012
fields, including declines. An initial standalone native-availability check
failed and is retained as an unqualified run; it did not reproduce on fresh
loads. The qualified complete rerun requires native loading explicitly. The
cause of that initial failure is not established.

One serialized controlled run on the existing 17-field panel gave sums of
per-field medians 43.750 / 43.874 / 42.171 / 49.510 ms for coarse 765,
partial-prime 765, partial-prime 513, and partial-prime 333; PARI was 26.199 ms.
The apparent 3.61% gain from 513 did **not** generalize to the full corpus.

The full-corpus run on `opt` used explicit fmpz calls, authenticated source,
module and addon hashes, three alternating implementation-order rounds per
field, four native computations per sample, and 16 fresh PARI `bnfinit(f,0)`
computations per sample. Both used warmups outside samples; the native side
used preallocated external buffers and the unchanged effort sequence
`[5, 1, 7, 8]`. PARI's internal millisecond clock gives 1/16 ms per-call
quantization. Host: `cocalc-vm-8d993f531c1249b28aff31a2`, AMD EPYC 7B13,
Node 26.8.1, CPU 0 affinity; no competing controlled timing job.

Both native variants complete all 1,012 fields with no exceptions or class
number/invariant mismatches. Their effort counts are identical: 963 finish
in effort 5, 32 require efforts 5 and 1, and 17 require 5, 1, and 7.

| Final certification stratum | Fields | Coarse 765 | Partial-prime 513 | PARI |
|---|---:|---:|---:|---:|
| Nonanalytic | 202 | 644.946 ms | 647.265 ms | 331.375 ms |
| Candidate closes initially | 630 | 2339.289 ms | 2292.037 ms | 1006.688 ms |
| Candidate refines to 1494 | 180 | 1848.978 ms | 2019.580 ms | 371.250 ms |
| Sum of per-field medians | 1012 | 4833.213 ms | 4958.882 ms | 1709.313 ms |

The candidate is 2.60% slower by this aggregate, despite being faster on 658
fields and having a median per-field ratio of 0.9893. Its geometric mean
ratio is 1.0059 and 95th-percentile ratio 1.1308. The 180 refined fields cost
170.602 ms extra, outweighing the 47.253 ms saved on initial analytic
successes. The worst observed ratio is 1.555 for label `3.1.61718551.1`,
polynomial $x^3+1411x-5644$: 7.740 versus 12.036 ms, with PARI at 1.938 ms.
For $x^3+9x-55$, 513 does improve 1.700 to 1.613 ms, versus PARI 1.188 ms.
This familiar success is not evidence of a broad improvement.

**Timing decision: 513 does not replace coarse 765.** The later mathematical
audit below additionally suspends certification claims for **both** variants.
The
full corpus is the same frozen development/control corpus, not an unseen
holdout. These measurements are not public-call timings, receipt
authentication, independent class-group certificate replay, or release
qualification. They do not establish a PARI win: the full-corpus aggregate
is about 2.83 times PARI for the baseline and 2.90 times for the candidate.

Source inspection explains a concrete refinement inefficiency:
`_cubic_prepare_bf_plan` clears the coefficient prefix and recomputes prime
splitting, and `_cubic_evaluate_bf_plan` recomputes log/square-root endpoints
for the entire live value prefix. Refinement retains owners but not those
computed values. A future reuse change must preserve first-match header
indices, include newly admitted degree-two/three norms from previously visited
small primes, and reweight **all** finite terms when $X$ changes. Appending
only new terms to the old finite sum would be mathematically wrong. No such
reuse optimization is implemented or timed in this report.

The partial-prime source is 479,997 bytes plus the 46,619-byte runtime:
526,616 total, or 41,616 over the unchanged source allowance. The generated
765 core is 16,387,211 bytes. Source consolidation and resource/platform
qualification remain necessary; no source or arena limits were increased.

Source hashes for partial-prime 765, 513, and 333 respectively:

- `6ba3b522136aa3f67e6e801b8084c04664d50f095cb0b6e6d0c58d2ba57b2242`
- `75a104d985c3928a1606f614bb55d32e11abe30f1c489dd0f42f1998e45fa2ff`
- `118d01c67d11fb392248ad7bef09a04ac7df34da956eb7f8c4fa1102226e019d`

Sources, composition/audit/probe/timing scripts, build identities, and full
reports are retained under
`build/cubic-analytic-schedule-evidence/partial-prime`, excluding disposable
compiled caches. The full timing report SHA-256 is
`1e9b4e3137ca1c6539b45e3d78f5342a26598909e673532fa462f51cbbd4085d`.

### Specialization audit: an unresolved Corollary-8 proof dependency

A numerical feasibility check of the free parameter in Theorem 7 exposed a
more important issue than cutoff selection. Its direct specialization at
$\sigma=3/2$ has constant coefficients

$$
A=\frac{\gamma/2+1-\log(4\pi)/2}{2}+4+\frac43,
\qquad B=\log(2\pi)-\psi(3/2),
\qquad C=\frac{\psi(5/4)-\psi(3/4)}2=2-\frac\pi2.
$$

Here $\gamma$ is Euler's constant and $\psi$ the digamma function. Exact
rational enclosures give

| Coefficient | Direct Theorem-7 specialization | Printed Corollary 8 |
|---|---:|---:|
| $A$ | $(5.344881166983,\ 5.344881291859)$ | 3.35 |
| $B$ (subtracted per degree) | $(1.801387009097,\ 1.801387508598)$ | 1.801 |
| $C$ (subtracted per real place) | $(0.429203673205,\ 0.429203673206)$ | 0.619 |

Thus 3.35 is not an upper rounding of $A$, and 0.619 is not a lower rounding
of $C$. The digamma values were also independently checked with local PARI
at high precision. Both the linked preprint and the author's
[published offprint, pages 366–367](https://www.math.u-bordeaux.fr/~kbelabas/research/residue-mcom2843.pdf)
display these formulas. This is not an OCR-only discrepancy: the pages were
visually inspected.

The committed audit is reproducible without Sage.js or PARI:

```sh
python3 bench/class-unit-groups/cubic-bf-scale-audit.py --corollary-specialization
```

It uses exact fractions,
Machin's formula with alternating-series remainder bounds for $\pi$, the
positive atanh series for logarithms, and

$$
\frac1{2(N+1)}<H_N-\log N-\gamma<\frac1{2N},\qquad N=1000.
$$

Digamma recurrence/reflection reduce the required special values to these
constants. Its assertions establish the separation from the printed decimal
coefficients without floating-point comparisons. Decimal values in the
report are display-only; rational endpoints are retained.

**This is not a counterexample to Corollary 8.** A separate stronger estimate
might justify it. It does show that substituting $3/2$ into the displayed
Theorem 7 and rounding outward is not that justification. The exact helper
tests establish faithful evaluation of the chosen formula, and corpus
agreement establishes observed answers; neither closes this theorem-level
gap. Treat it as a blocking proof dependency for promoting this experimental
bound, rather than silently relying on the citation.

For orientation, direct safe coefficient roundings from Theorem 7 are
5.35, 1.801, and 0.429, giving a complex-cubic constant $-0.482$, not
$-2.672$. Its prime sum has denominator $(N\mathfrak p)^{3/2}-1$;
replacing that by the larger $(N\mathfrak p)^{3/2}$ loses favorable terms
and is conservative. These observations identify the replacement implemented
in the subsequent source-copy experiment below; they do not by themselves
qualify its public implementation or runtime.

The 45-digit `theorem7-pilot.py` evaluates five rational parameter choices
against exact PARI prime decompositions of all 1,012 fields. It is explicitly
numerical, not an interval certificate, and its Corollary-8 columns inherit
the issue above. Its unexpected comparison triggered this audit; no compiler
or default algorithm was changed in response to the numerical pilot.

Next steps are to reconstruct the bound directly from the explicit formula
or explain the missing estimate, then repeat the native/corpus timing with
the justified formula. In parallel with that mathematical question, source
consolidation and recomputation-free refinement remain engineering targets.
The existing stronger-search BF-999 comparison retains the major measured
search improvement without relying on this Corollary-8 dependency.

### Direct Theorem-7 replacement experiment

An isolated source copy changes only the tail helper, with its AST and source
hash authenticated against partial-prime 765. Specializing the printed
Theorem 7 at $\sigma=3/2$, using the outward coefficient bounds above,
replacing $\beta$ by one, and retaining the same conservative partial sum
gives

$$
E_7(X)=\frac{4.648}{\sqrt X\log(3X)}
\left[
\frac{4.26}{\sqrt X}+
\left(1+\frac{3.88}{\log(X/9)}\right)
\left(\log|D_K|-0.482-\frac{2L}{s}\right)
\right].
$$

Here $4.648=2.324(2\sigma-1)$ and
$4.26=4.26(n_K-1)/(2\sigma-1)$ for $n_K=3$; these are not the coefficients
of Corollary 8. All positivity guards, first/refined cutoffs (765/1494),
relation collection, index-one acceptance, and arena limits are unchanged.

The actual helper passes 800 independent rational formula checks and 20
invalid-input checks. The frozen first-effort screen preserves exactly the
963 successes of stronger-search BF-999, with zero losses, gains, exceptions,
answer mismatches, or accepted relation-count changes. Of those successes,
192 are nonanalytic, 749 close at 765, and 22 refine to 1494. All 64 output
words agree across fmpz/GMP/JavaScript for every one of the 1,012 inputs,
including declines. This is not full independent certificate replay.

The source hash is
`6fa3fe31efdbb01e9c147fbc98e930cfefdf04698067eb9d344ab9fd01e2475e`;
the generated core hash is
`6c639e7b04daaace275407100af128d2bf242fabb9a6d8999140d22747c66a5d`
(16,459,920 bytes). The module is 480,197 bytes; with the runtime it totals
526,816 bytes, still 41,816 above the unchanged allowance. No production
source change or release qualification is implied.

The controlled full-corpus comparison uses the same three-round protocol as
above, now against **stronger-search Theorem-1/BF-999**, not the unqualified
Corollary-8 source. All 1,012 inputs complete under the existing retry policy
with no exceptions or class number/invariant mismatches.

| Final certification stratum | Fields | BF-999 baseline | Direct Theorem 7 at 765 | PARI |
|---|---:|---:|---:|---:|
| Nonanalytic | 202 | 644.005 ms | 645.813 ms | 329.938 ms |
| Candidate closes initially | 783 | 3877.535 ms | 3823.805 ms | 1317.438 ms |
| Candidate refines to 1494 | 27 | 393.613 ms | 414.436 ms | 59.313 ms |
| Sum of per-field medians | 1012 | 4915.153 ms | 4884.054 ms | 1706.688 ms |

The aggregate improves by 0.63%; the geometric mean per-field ratio is
0.9894, median ratio 0.9880, and 95th-percentile ratio 1.0257. There are 763
faster fields relative to BF-999, and 34 faster than PARI. This is a single
run with some unrelated-path noise, not a demonstrated uniform or durable
speedup. The candidate remains about 2.86 times PARI in aggregate.
$x^3+9x-55$ takes 1.779 ms versus baseline 1.826 and PARI 1.188;
$x^3-x^2-7x+122$ takes 2.469 versus 2.500 and 1.563 ms.

The report is `theorem7-timing.json` in the retained evidence directory,
SHA-256 `60d878cee25da098002d65a8ea64c3fb5a237ce6b6ceceb5178e490c664bf4c0`.
All earlier public-call, holdout, independent-replay, source-size, and platform
qualification exclusions still apply. This small change does not justify
abandoning the larger search/representation work.

### Next structural target: genuine nontrivial joint indices

Joining the first-effort diagnostics to the full computation timings gives
49 retry fields consuming 982.725 ms, about 20.1% of the candidate's total
sum of medians, versus 102.938 ms in PARI. Of these, 29 stop at phase 8.
Every one of those 29 has a **strictly positive lower bound** for the log of
the joint relation/unit index. Thus a sharper valid enclosure for the same
retained presentation and unit cannot establish index one. Twenty-six also
have a provisional class number strictly above the corpus class number.
Reason markers 435/436 are stale unit-materialization markers, not the
phase-8 failure cause.

The first such field in the frozen ordering is label `3.1.606879.2`,
$x^3-117x-1157$. Its first attempt has fourteen factor-base ideals and a
provisional class number 6 versus the corpus class number 3. Its log-index
interval is approximately $(0.392853,0.995395)$: exact rational comparison
against the logarithm bounds shows that the only possible positive integral
joint index is **two**. The complete retry computation takes 9.321 ms versus
PARI's 3.688 ms in this run. These are diagnostic states, not independently
replayed public certificates.

The existing resident staged-certification guard stops at twelve factors;
this fourteen-factor case is outside it. The next experiment should audit
and generalize the existing state machine to this regime, not recreate
resumption that already exists for smaller cases. Capture the deficient
presentation, determine whether PARI obtains the missing relation or unit
through another adjacent-ideal visit, and preserve the exact acceptance and
arena-capacity contracts. `retry-frontier.cjs` records the cohort join;
the bounded-search and analytic-resumption source contracts still govern
which statuses permit collecting more rows.

## Fourteen-factor deficient-presentation forensics

The next field is now understood more precisely. A diagnostic source-copy
exit captures the unmodified, **uncompacted** principal relations before
certification. For $f=x^3-117x-1157$, the captured integral basis is

$$
\left(\frac{1+2a+6a^2}{7},\ a,\ a^2\right).
$$

An exact GP oracle changes this basis into PARI's integral basis, verifies
that the change matrix is integral and unimodular, reconstructs every
factor-base ideal, and checks every principal equality as an ideal equality.
It also computes the integer relation kernel and expresses its unit products
in PARI's fundamental unit. `bnfcertify` succeeds for the reference field.
These are PARI forensic checks, not independent Sage.js certificate replay.

| Captured search | Raw rows | Rank | Relation quotient order | Unit subgroup index |
| --- | ---: | ---: | ---: | ---: |
| First effort, 5 | 36 | 14 | 6 | 1 |
| Existing retry, 1 | 46 | 14 | 3 | 1 |

The first attempt already has a fundamental unit. Its obstruction is entirely
the relation lattice. Of the retry's individual rows, row 36 (one-based) alone
reduces the first lattice's index from 6 to 3. Its generator is

$$
\alpha=\frac{a^2-9a-106}{7},\qquad N_{K/\mathbb Q}(\alpha)=-1767.
$$

The corresponding row has exponent 1 at factor-base positions 1, 9, and 12,
and zero elsewhere. This witness is forensic evidence, **not a production
special case or proposed hardcoded relation**. The earlier 22-row diagnostic
describes compacted proof state; it must not be confused with these 36 raw rows.

A fresh PARI 2.17.4 `bnfinit(f,1)` trace uses the same fourteen-factor base at
bound 35. It collects twenty rows, obtains tentative class number 12 and
regulator $28.9750511241\ldots$, then performs further small-norm searches in
products of ideals. Its subsequent tentative class numbers are 6, 6, and 3.
The trace is retained separately from timing, which uses `bnfinit(f,0)`.
The Sage.js ablations below do not claim to reproduce that trajectory.

### General scheduling ablations, not promotion

Starting with the authenticated direct-Theorem-7 source, `permutation16`
extends only the existing PARI-style ordering guard from twelve to sixteen
factors. `staged16` additionally extends the existing staged-certification
guard. Neither changes the acceptance criterion, arena limits, or answers.
Both run the same source-transparent native program; no new handwritten
mathematical primitive or lookup table is involved.

| First-effort frozen corpus | Accepts / 1012 | Gains | Losses | Exceptions / wrong accepted answers |
| --- | ---: | ---: | ---: | ---: |
| Direct-Theorem-7 baseline | 963 | — | — | 0 / 0 |
| Ordering through 16 factors | 963 | 8 | 8 | 0 / 0 |
| Ordering and staging through 16 factors | 968 | 10 | 5 | 0 / 0 |

For each candidate, all 64 output words, including declined results, agree
across explicit fmpz, GMP, and JavaScript execution on the 256 corpus fields
with 13–16 factors. This is backend differential evidence, not a proof of
the certificate verifier. Three remaining staged losses are genuinely
rank-deficient presentations; two lack a recovered unit. The current root
declines before staged certification on rank deficiency, even though its
presentation helper distinguishes insufficiency from fatal errors.

A controlled `opt` run compares the baseline, both candidates, and PARI on
the fifteen fields whose first-effort acceptance changes under `staged16`,
plus the familiar class-number 5, 8, and 2 controls. This is a deliberately
selected **18-field diagnostic panel, not a representative corpus or holdout**.
Five rounds rotate implementation order; each native sample contains sixteen
calls with preallocated external scratch and the existing `[5,1,7,8]` retry
policy, each PARI sample thirty-two fresh `bnfinit(f,0)` calls. Each sample
has an untimed warmup and output checks outside the timed batch. CPU affinity
is fixed to CPU 0; source/module/addon hashes are checked before execution.

| Workload, median milliseconds | Baseline | Ordering16 | Staged16 | PARI |
| --- | ---: | ---: | ---: | ---: |
| $x^3-117x-1157$ | 9.637 | 4.078 | 3.339 | 1.406 |
| Sum of eighteen per-field medians | 166.034 | 118.973 | 116.707 | 27.219 |

The selected field no longer needs a fresh retry, but it is still slower than
PARI. Some fields regress severely: label `3.1.315279.1` rises from 4.589 to
15.271 ms. First-effort gains are not sufficient to establish a general speed
improvement. Timing values from earlier runs, including earlier PARI timings,
are not substituted into this paired comparison.

Sources, authenticated build identities, exact GP programs, detached captures,
surveys, backend results, and timing data are retained under
`build/cubic-analytic-schedule-evidence/fourteen-factor/`. The follow-up below
tests whether the existing round-robin initial-volume search recovers the
lost fields while retaining these gains. All source copies remain above the unchanged source allowance;
none is a qualified production artifact.

### Round-robin follow-up and resource obstruction

`volume16` additionally extends the existing initial-volume round-robin
search to 12–16 factors. Its four coupled guards are changed together:
collector dispatch, visit-matrix allocation, first resumption eligibility,
and subsequent collector dispatch. The visit matrix remains explicitly
sized to `factor_count + 1`; it is not left at its one-row inactive size.

This experiment accepts 979/1012 on first effort: eighteen gains, two losses,
and no wrong accepted answers. It recovers **all five** `staged16` losses.
However, the two new losses throw
`RangeError: NativeExactArena temporary capacity exhausted` at the unchanged
3 MiB temporary limit:

- `3.1.16355768.1`, polynomial $x^3-x^2+793x+10803$;
- `3.1.16912280.1`, polynomial $x^3-493x-11118$.

Each exception reproduces twice in explicit fmpz execution, and a subsequent
control call in the same process correctly computes class number 3. No limit
is increased. This variant is **not release-ready**, and the two-candidate
backend comparisons and timing table above do not qualify `volume16`.

An exceptional exit is not a certificate. A previous version of this report
incorrectly said that the second saved triple did not even have unit norm:
the GP diagnostic had reconstructed its integral basis from output slots
subsequently reused by analytic diagnostics. For this field, slot 40 is both
the initial basis's final diagonal and the later regulator lower bound. Using
the dedicated `verification_numerator` buffer instead, both triples are exact
units. The first is fundamental and the second has unit index seven. This
correction concerns the forensic oracle input, not a wrong accepted result.
The first field has regulator approximately 3620.9413 and a saved unit with
roughly 1575-digit coordinates.

Source SHA-256 identities for these isolated ablations:

- `permutation16`: `6a37a50b924d91739a828e22b5adc84dbc4749e7d5a72033554390193001c8b8`;
- `staged16`: `fc6e085fe1f41b536474cc314ea4d2807be401f83cfee66c0fe0aeb9b7f9a396`;
- `volume16`: `d3e32776889299c5a89125007414eedb410ed08a91e4c6090dda3ba86711a16d`.

The retained `variants.cjs` authenticates the parent source and asserts the
number of each replacement before generating these experiments.

### Temporary allocation traffic, rather than live storage

Disposable generated-core instrumentation distinguishes accumulated checkpoint
storage from live GMP blocks, accounting for malloc, realloc, and free. The
instrumented core is not used for timing or public certification.

| Field | Final accumulated bytes | Peak live block bytes | First overflowing operation |
| --- | ---: | ---: | --- |
| `3.1.16355768.1` | 6,011,392 | 303,264 | Fifth-root unit saturation |
| `3.1.16912280.1` | 9,585,440 | 370,960 | Dependency-unit coordinate multiplication |

The existing GMP checkpoint allocator's `free` hook only increments a counter;
it does not recycle storage until the entire checkpoint ends. Hence a modest
live set can exceed the unchanged 3 MiB limit through accumulated allocation
traffic. Repeated certification is not the only possible source of this
traffic: the backtraces identify unit arithmetic inside the attempts.

An experimental power-of-two free-block pool removes both exceptions without
changing mathematical source or limits. All 1,012 first-effort cases have
matching accepted answers; all 64 output words match the previous `volume16`
run on its 1,010 nonexceptional cases. Acceptance stays **979**, not 981:
the two former exceptions become ordinary phase-8 mathematical declines.
Their native provisional group orders are two and ten; the exact PARI oracle
gives true class numbers one and five, and unit indices one and seven,
respectively. Together these diagnose class-index two in each presentation,
with an additional unit-index seven obstruction in the second.
The existing saturation routine only probes roots of orders 2, 3, and 5;
none removes the latter unit's index seven.

The final canonical compiler build repeats this 1,012-field result with the
corrected allocator fingerprint. Additionally, all 256 affected-regime fields
agree on acceptance and all 64 output words across fmpz, GMP, and JavaScript.
These checks are same-source differential evidence, not independent certificate
replay or public-path qualification. The generated core SHA-256 is
`4ddb949ec0c84adfd10843de62c634f39e03569f97b3aae8875ad858ff6dcd36`.

The allocator implementation is being qualified separately on branch
`agent/native-arena-recycling`; this is a generic compiler/runtime change,
not handwritten class-group mathematics. Its randomized ASan/UBSan stress
test processes over 150 MB of requested storage below 1 MB high water, and
the existing allocator ownership/nesting/thread-local test passes. Size-class
rounding and per-allocation overhead still require representative performance
and cross-platform review.

Controlled CPU-0 `opt` timing of the identical mathematical source on 1,010
nonexceptional fields gives sums of first-effort medians 4,106.122 ms before
recycling and 4,113.093 ms after (0.17% slower; three rotated rounds, four calls
per sample). A nine-round, 32-call repeat on four controls and the ten largest
pilot regressions shows a worst regression of 5.02%; the familiar h=5 and h=2
fields regress 1.19% and 2.94%. This is not a no-regression qualification.
PARI completes every field, whereas 31 native first attempts decline, so these
first-effort totals must not be presented as an equal-completion comparison.

The fourteen-factor target takes roughly 7.6 ms with this broader initial-volume
search. The earlier staged16 measurement was roughly 3.3 ms (a separate run,
not a paired timing). Higher first-effort coverage is therefore not synonymous
with a better stopping schedule: preserve the earlier opportunity to certify
before paying for a larger initial relation batch. No production search policy
is changed by these diagnostic measurements.

An instrumented source-copy trace now isolates the fourteen-factor difference.
It records each staged closure call's raw relation count in a bounded scalar,
and writes that trace plus final proposal counters to otherwise unused output
words only after success. These modified outputs are diagnostic data, not
public certificates, and the instrumented kernels are not timed. The first
60 output words agree exactly with the uninstrumented parent surveys.

| Search | Raw relation counts at certification attempts | Proposals examined | Ideals planned |
| --- | --- | ---: | ---: |
| `staged16` | 23 (success) | 40 | 5 |
| `volume16` | 24, 25, 28 (success on third check) | 80 | 6 |

Both publish the same fundamental unit and analytic endpoints; their compact
published relation counts are 20 and 22, distinct from the raw counts above.
Thus the broader search changes the usefulness of the initial relation prefix
and incurs additional certification attempts, not just a different allocator
cost. A promising next policy is to preserve the cheap staged prefix and admit
broader-volume continuation only after a valid insufficiency result. That
requires a correctly preserved/deduplicated resident visitation state; simply
switching collectors without reconciling their cursor meanings is not justified.
Trace source hashes and scripts are retained in
`build/cubic-analytic-schedule-evidence/staging-trace/`.

The investigation also found that `backendFingerprint()` omitted
`gmp-checkpoint-allocator.cjs`: fresh builds with different allocator bodies
could receive the same cache key. The compiler branch now includes this
dependency and tests that changing only the allocator changes the actual
fingerprint calculation. Earlier experimental builds used fresh isolated
cache directories; their source/core hashes remain the authority rather than
the colliding cache key.

Allocator instrumentation, traces, exact unit-oracle correction, generated-core
ablation, and source/compiler build identities are retained under
`build/cubic-analytic-schedule-evidence/arena-pressure/`.

## Hybrid search: complete-corpus timing, not just first-attempt coverage

Two diagnostic source copies now combine the retained staged prefix with a
one-way transition to the broader volume traversal. Early transition after
the first admissible insufficiency gives 966 first-attempt successes: three
gains but five losses against staged16. Waiting until the staged schedule
would otherwise decline gives 971 successes, three gains and no losses against
staged16's 968. Both copies agree on all 64 output words across fmpz, GMP,
and JavaScript on all 1,012 fields. Accepted class numbers and invariants
match the frozen corpus. This is same-source differential evidence, not
independent mathematical replay.

The late hybrid changes only the root orchestration and the two collection
helpers relative to volume16. Proof helpers are byte-identical. Its traversal
flag is stored in an unused visit-header cell. Prepared LLL transforms and Gram
data are reused; the enlarged region has its own initially empty cursor.
Relations, element witnesses, online exact HNF/support, and modular admission
state remain resident. Overlapping regions can revisit proposals; exact
element deduplication prevents admitting the same element twice. This is not
a claim that no proposal is repeated.

Post-certification recovery requires `_cubic_can_resume_bounded_search`:
status zero with phase 43/reason 434, or phase 8 with a positive denominator
and an unresolved exact analytic-index classification. Other statuses do not
permit that transition. The mode changes only once, so resetting the bounded
attempt counter does not create an unbounded retry loop. The no-new-row
transition currently rechecks the unchanged proof once; this is retained as
an explicit experimental inefficiency, not a production recommendation.

Controlled CPU-0 `opt` timing now includes native retries `[5, 1, 7, 8]`, not
just successful first attempts. All three native variants use the same
recycling allocator. Each field has three rotated rounds, two native calls
per sample, and eight fresh GP `bnfinit(f,0)` calls per sample, with one warmup
per participant. Polynomial packing and external scratch allocation are
outside timing; failed-attempt diagnostic decoding needed to select retries
is inside. GP uses millisecond wall-clock ticks divided by eight. Host:
AMD EPYC 7B13, Node v26.7.0. Every implementation completes all 1,012 fields
with matching class numbers and invariants and no exceptions.

| Implementation | Fields needing native retries | Sum of per-field median times |
| --- | ---: | ---: |
| Staged | 44 | 4,935.339 ms |
| Volume-first | 33 | 4,877.343 ms |
| Late hybrid | 41 | 4,876.519 ms |
| PARI | n/a | 1,501.125 ms |

Late hybrid is 1.19% faster than staged in this run, effectively tied with
volume-first (0.017% difference), and still 3.25 times PARI. There is no
general PARI-win or durable/no-regression claim. These are preallocated
diagnostic kernel calls, not public API latency, independent replay, or a
new holdout set.

The fourteen-factor target `3.1.606879.2` takes 3.317 / 7.971 / 3.386 ms
for staged / volume / late, versus PARI 1.375 ms. The two earlier volume
memory-pressure fields now complete without exceptions but need a retry in
volume-first: `3.1.16355768.1` takes 50.073 ms there versus late 3.006 ms;
`3.1.16912280.1` takes 49.468 versus 4.077 ms. The hybrid's savings on these
fields are largely spent elsewhere.

The next missing transition is before certification: nine of the ten
volume-first successes missed by late hybrid exit at exact rank deficiency
(phase 42), and one at too few rows (phase 41). The smallest is
`3.1.315279.1`, $x^3-51x-177$: late takes 15.691 ms with a retry, volume
3.556 ms, PARI 1.625 ms. The hybrid's post-certification transition cannot
help a field that never reaches certification. The exact presentation helper
already distinguishes genuine insufficiency (status zero) from inconsistent
rank evidence (negative status); this provides the appropriate gate for
testing resident pre-certification recovery without weakening acceptance.

That pre-certification recovery is now implemented in a diagnostic source
copy. Only exact presentation status zero, staged mode, 13--16 factors,
and the as-yet-unused broader traversal permit it. A single bounded collection
call reuses the original target, candidates, element witnesses, modular state,
online HNF, prepared ideal data, and already allocated presentation capacity.
Negative collector status, row-count decrease/overflow, or desynchronized
online rows fail closed. The exact rank check is rerun with fresh independent
rank witnesses; only full rank proceeds to the unchanged Smith and certificate
pipeline. The uncompressed logical relation count is updated as well.

The resulting first-effort survey accepts 981/1,012 with zero exceptions and
correct accepted class numbers/invariants. It gains all ten missing fields
above, retains every staged and volume-first success, and therefore avoids
the first-attempt losses of both parents on this corpus. All 64 words agree
across fmpz, GMP, and JavaScript on all 1,012 fields. The new copy's source hash
is `c05b35224ecd3ed383e60bb193a19e89824c0a34d84a6701cfbfb74dffde5a46`;
generated core hash is
`bf43a2af7bece50286e6018ea4488afb951b716e4134718272572ded79bd0216`.
All pre-root helper source remains byte-identical to late hybrid. Thirteen
CPython tests execute the extracted recovery branch with controlled helper
outcomes: negative/full initial status, disabled staging, used traversal,
out-of-regime counts, collector errors, row decrease/overflow/desynchronization,
and all three recheck statuses. These are orchestration fault tests, not
independent proofs of the mocked helpers.
The separate controlled full-retry run is now complete under the same protocol:

| Implementation | Fields needing native retries | Sum of per-field median times |
| --- | ---: | ---: |
| Rank-recovery hybrid | 31 | 4,809.432 ms |
| Volume-first | 33 | 4,828.203 ms |
| Late hybrid | 41 | 4,864.191 ms |
| PARI | n/a | 1,488.125 ms |

All 1,012 computations complete with matching class numbers and invariants,
no exceptions, and no excluded failures. Rank recovery is 1.13% faster than
late hybrid and 0.39% faster than volume-first in this run, still 3.23 times
PARI. Those small aggregate differences do not establish a durable speedup.
The selected $x^3-51x-177$ improves from late 14.915 ms (efforts 5, 1, 7)
to rank recovery 4.132 ms (effort 5); volume takes 3.411 and PARI 1.500 ms.
The familiar $x^3+9x-55$ takes 1.839 ms in rank recovery versus GP 1.000 ms,
under this diagnostic, already-compiled, preallocated-kernel protocol.

There remain successful but expensive staged prefixes: `3.1.744076.3`
takes 9.254 ms with rank recovery, 9.275 with late hybrid, and 3.092 with
volume-first (PARI 1.500 ms), all native variants succeeding at effort 5.
`3.1.10194660.1` similarly takes 8.853 / 7.949 / 2.500 ms, PARI 1.500 ms.
Next investigate their exact relation/closure-attempt traces rather than
optimizing only first-attempt success counts or fitting field-specific rules.
The new full timing JSON hash is
`1832f122ec5951d76b24d000822f56b41fb0dc5972ddb4bfe2d5ea44825ac907`.
This remains diagnostic evidence, not public receipt replay, formal
verification, release qualification, or an aggregate PARI win.

Late source SHA-256:
`61ea143558b4ea22c1e7a0cd132ed893d4e97a934fca0a96470a9948b67de63b`.
Early source SHA-256:
`61762242b8ecd172fbfb97c903115bb25b99b2ab7a1f7133f391874e2ec72262`.
Full timing JSON SHA-256:
`ff72a72e48c677c42c270846692e4893981d08b7ad6a77ec8f516e4d9a3e4de6`.
Scripts, sources, manifests, surveys, backend comparisons, and timing evidence
are retained under `build/cubic-analytic-schedule-evidence/hybrid-prefix/`.
Production code, the 485,000-byte source allowance, 1 MiB resident limit, and
3 MiB temporary limit remain unchanged; source-budget and platform/public
qualification remain open.

## Successful-prefix forensics and repeated analytic work

For `3.1.744076.3`, $f=x^3+4x-332$, the exact replay now explains why both
searches can succeed at effort 5 while differing by a factor of three in time.
The initial 19-row, 13-column staged presentation has quotient order 36;
the initial volume presentation has the same shape but quotient order 18.
Both relation kernels already generate the full unit group. GP independently
checks every principal ideal identity, the maximal-order basis change, and
the unit subgroup index, with `bnfcertify` validating its reference field.
The volume prefix's row 14, generated by $5a-22$, reduces the staged quotient
order to 18 when adjoined. This is an explanatory witness, never a special
case in the algorithm.

The local PARI trace uses 13 factor-base ideals and 19 relations, searches
four ideals, and immediately obtains class number 18 and regulator
approximately 7.9617223392. Its reported small-norm statistics are 17/118;
these are PARI's counters, not asserted identical to Sage.js proposal counts.

Diagnostic native traces give:

| Staged closure attempt | Raw relations | Provisional group order | Joint-index enclosure after refinement |
| --- | ---: | ---: | --- |
| 1 | 19 | 36 | approximately [1.454, 2.742] |
| 2 | 27 | 36 | exactly the same logarithmic endpoints |
| 3 | 28 | 36 | exactly the same logarithmic endpoints |
| 4 | 31 | 18 | accepted |

Volume-first certifies at its first 19-row attempt. The fourteen-factor
control retains the opposite behavior: staged certifies at 23 rows/order 3,
whereas volume tries 24/order 6, 25/order 6, then 28/order 3. Thus neither
traversal universally yields a better initial relation lattice.

The failed staged attempts have exact logarithmic endpoints
`6906679256724406056` and `18601658589171059196`, at scale
`18446744073709551616`. They exclude index one and enclose only the integer
two. The unit-index computation above identifies this as a missing class
relation, not an insufficient unit subgroup. This does not license assuming
fundamentality whenever native root probes find nothing: the square-root
probe, for example, searches a bounded neighborhood of an approximate trace
and can also return zero when approximation fails. Its successful roots are
exactly authenticated, but its zero status is not a general nonexistence
certificate. The proposed optimizations do not make that inference.
The trace packs signed exact
diagnostics into a large integer in reserved output words only after success;
the first 60 words agree with the uninstrumented parent. Successful publication
reuses some diagnostic slots, so successful-slot contents are deliberately
not interpreted as failed-attempt index enclosures. Instrumented kernels
are never timed or treated as public certificates. An initial extended-output
trace was correctly rejected by the exact 64-word ABI and was replaced with
this diagnostic packing scheme, not by weakening the ABI.

Two independent general ablations follow from this evidence:

1. **Resident analytic reuse.** A private eight-entry matrix retains the latest
   successful BF evaluation, its threshold, provisional group order, enclosure,
   tail, and term/value counts. The field, order, precision and analytic policy
   are fixed for that root call. Reuse requires the same provisional group
   order; changing it invalidates the cache because the endpoint plan also
   contains its logarithm. The analytic endpoint owner remains resident and
   is not used as scratch by unit reconstruction. Both initial and refined
   plans may be retained. Every attempt still reconstructs/authenticates its
   unit and runs the final exact classifier. Cached data are not a verdict.
   The compiler rejected an initial version that omitted term/value counts
   needed at publication; the completed cache retains that metadata too.
2. **Do not refine a proven nontrivial joint index.** After unit saturation, let
   $J$ be the positive integral product of the class-relation and unit indices,
   with a rigorous enclosure $L\leq\log J\leq U$. If $L>0$, then $J>1$.
   Refining an enclosure for this unchanged $J$ cannot prove $J=1$; more
   algebraic evidence is required. The ablation adds `index_log_lower <= 0`
   to the refinement guard. The final classifier remains unchanged: malformed
   or contradictory intervals still fail, and only valid insufficiency can
   request more search. This does not assume that two valid enclosures are
   nested and does not skip unit saturation before forming $L$.

Both ablations retain 981/1,012 first-effort successes and produce no
exceptions or incorrect accepted class numbers/invariants. Analytic reuse
passes all 1,012 full-output comparisons across fmpz/GMP/JavaScript and nine
extracted cache-control checks. Relative to the uncached source, three
successful outputs retain a previously computed refined enclosure instead
of returning to the initial threshold; their group and unit data are unchanged.
The refinement guard also passes all 1,012 full-output three-backend
comparisons and 289 exact integer boundary checks using the
actual extracted guard and classifier. These are executable control-flow
checks and differential evidence, not Lean proofs or independent full-corpus
replay. Controlled timings and further qualification are separate gates.

The analytic-cache full-retry run completes all 1,012 fields correctly:
sums of medians are cache 4,827.115 ms, rank parent 4,832.277 ms,
volume-first 4,849.552 ms, PARI 1,500.750 ms. Cache improves the selected
`3.1.744076.3` from 9.359 to 7.421 ms, but is only 0.11% faster than its
parent in aggregate. That is not persuasive evidence of a general speedup;
retaining extra state needs a stronger performance case before promotion.
The raw timing hash is
`b01aa2ae5446d86144b7bf5641b73d4220803ad2eb90e7f59ff9c0feafdb2299`.
The refinement-guard ablation preserves all 64 output words of its uncached
rank parent on all 1,012 fields, not merely class numbers and invariants.
Its separate trace confirms that the selected field's first three attempts
now return their initial enclosure (approximately [1.198, 3.348]) rather
than refining it to approximately [1.454, 2.742]. Both exclude one; identifying
the exact remaining integer index is unnecessary before resuming search.
The fourth attempt certifies with unchanged output, and the fourteen-factor
control still certifies on its first attempt.

The subsequent guard/cache/rank full-retry comparison also completes all
1,012 fields correctly: guard 4,850.342 ms, cache 4,855.710 ms,
rank parent 4,857.071 ms, PARI 1,505.000 ms. The guard's aggregate improvement
is only 0.14% in this run; it remains 3.22 times PARI. On the selected field,
guard/cache/rank take 7.778 / 7.637 / 10.499 ms versus PARI 1.500 ms.
Neither ablation establishes a meaningful corpus-wide speedup despite
avoiding demonstrably redundant work on that field. Timing JSON hash:
`19058c9431f3bab052d1dd296b3ddacdcacc862d22151f0a86dc2a8928b36b58`.
Keep these as diagnostic findings, not a reason to promote new cache state
or claim a broad improvement. Relation-prefix quality and whole-call cost
remain the larger target.

An untimed corpus-wide attempt trace, joined to the separate uninstrumented
guard timings, partitions the workload as follows:

| Observed return/trace category | Fields | Full native time | PARI time |
| --- | ---: | ---: | ---: |
| No staged-success trace | 348 | 1,803.065 ms | 552.000 ms |
| One captured staged closure | 440 | 1,369.978 ms | 620.500 ms |
| Multiple attempts, preceding failures before analytic stage | 152 | 658.645 ms | 211.750 ms |
| Multiple attempts including analytic insufficiency | 41 | 246.643 ms | 59.875 ms |
| First-effort decline, later retry required | 31 | 772.011 ms | 60.875 ms |

The trace is published only when staged closure itself succeeds. In particular,
the 348 no-trace successes may include later trivial-group publication after
earlier staged attempts: they must not be interpreted as no earlier proof
work. Failed first efforts also do not publish their trace. The table gives
whole-call times for these observed cohorts, not timings of individual stages.
Every first-60-word output agrees with the uninstrumented reference.

This identifies a more prevalent next investigation than repeated analytic
work: the 152 successful computations with an earlier pre-analytic failure.
The smallest-discriminant example in that cohort is `3.1.23567.1`,
$x^3-x^2+26x-40$, with two staged attempts, 3.304 ms native versus 1.125 ms
PARI. Reconstruct its missing unit/relation evidence and PARI's search before
choosing another schedule. Do not assume that every repeated closure repeats
the analytic computation or that an unobserved trace means no work occurred.

Analytic-cache source:
`97a1d5eb46877cf34275f1b9d5e8b4465b47e79abed3796ea89f76e3bc38de0e`.
Refinement-guard source:
`500844f88c415c4cf686aa531e4e425855d9fd5b1cdc2916a106645a71dd3a3c`.
Generated-source resource comparison must normalize diagnostic source paths:
the rank core contains 73,309 copies of its source path. Raw core sizes are
16,039,665 / 16,888,125 / 17,361,486 bytes for rank / cache / guard, but
replacing each exact source path with `<SOURCE>` gives
12,374,215 / 12,460,545 / 12,375,658 bytes. The apparent 1.32 MB guard growth
is almost entirely its longer diagnostic filename, not extra computation.
This normalization is a resource audit, not a cache-identity replacement.
All artifacts and exact GP programs are retained in the existing
`build/cubic-analytic-schedule-evidence/hybrid-prefix/` evidence directory.

## Missing-unit prefix: an intermediate checkpoint must preserve exhaustion recovery

The smallest-discriminant member of the 152-field pre-analytic-failure cohort
is `3.1.23567.1`, defined by $x^3-x^2+26x-40$. Exact GP forensics, including
`bnfcertify`, confirm class group $C_{17}$, regulator approximately
$4.7786294054$, discriminant $-23567$, and equation-order index two.
The captured maximal-order basis is checked by a unimodular change of basis,
and every relation is replayed as an exact principal-ideal identity.

The initial ten-row, eight-column presentation has full rank and quotient
order 51, but its relation-kernel generators produce only torsion units.
The diagnostic unit-exponent gcd zero means no non-torsion unit was generated;
it is **not** a finite unit index. The existing effort-three fourteen-row
prefix has quotient order 17 and unit index one. Its twelfth or thirteenth
row, generated respectively by $-(a^2+a)/2-11$ or $a-3$, already reduces the
ten-row quotient order from 51 to 17. These are explanatory witnesses, never
field-specific implementation rules.

PARI's seed-one debug trace uses eight factor-base ideals, two rational
relations, and four additional relations from each of ideals numbered eight,
seven, and six (norms 11, 7, and 7). It reaches fourteen relations, tentative
class number 17 and the correct regulator on its first analytic check.
Its reported small-norm statistic is 13/27. This reconstructs the relevant
work schedule; it does not claim identical candidate order between systems.

The rank-hybrid parent instead attempts exact closure at ten rows, fails with
the explicit missing-unit reason 434, and next succeeds at 29 rows. A general
source-copy experiment inserts one $n+6$ relation checkpoint between the
initial $n+2$ and later $n+22$ targets for at most eleven factor-base ideals,
only after that explicit resumable insufficiency. Here $n$ is the number of
factor-base ideals. It keeps the resident relation state, ideal plans, online
HNF, and adjacent enumeration cursor. The native trace for the selected field
now succeeds at fourteen rows after 21 proposals, instead of the parent's
29 rows after 71 proposals. The first fourteen-row oracle above is captured
from effort three; the staged trace independently establishes its own quotient
and closure result, not byte identity of those raw prefixes.

### Negative result and corrected state transition

The first candidate, source SHA-256
`51605b1e3eef3584bf9753250d31a70731d6e495d0f3ca36db1bf504547115dc`,
lost three of the parent's 981 first-attempt successes: `3.1.761319.2`,
`3.1.1063351.3`, and `3.1.1954455.1`. It accepted 978/1012, with no exceptions
or incorrect accepted groups; all 64 output words agreed across fmpz, GMP,
and JavaScript on every field. Backend agreement did not detect this loss of
search coverage.

The traces identify a control-flow defect: the inserted checkpoint can consume
the last available adjacent relations. The subsequent larger adjacent request
then adds no rows, triggering an existing return before the original
expanded-shell stages. Keeping the numeric stage budget unchanged did **not**
preserve the old search opportunities.

The corrected source
`41550326694a0e28a56c1c8cb8a731b95f98db4e531ea52083e3d563c307eba8`
advances this exhausted adjacent traversal to the original shell stages only
after an inserted checkpoint, at stage zero, and with an explicitly resumable
proof result. The transition is one-way and cannot repeat at stage one.
It currently repeats the unchanged closure once on that transition; avoiding
that redundant attempt would require a separate state-validity argument.
Inconsistent relation counts or negative online status still fail before the
transition. No mathematical acceptance predicate or resource limit changes.

All 981 parent first-attempt successes are restored, with no new gains or
losses, no exceptions, and exact agreement of accepted class numbers and
invariants on all 1012 fields. Complete fmpz/GMP/JavaScript comparison again
agrees in all 64 output words. Extracted tests exercise 120 checkpoint-boundary
cases and 24 exhaustion-transition cases; AST comparison establishes that
every non-root function and workspace schema is unchanged from the rank
parent. This is scheduling evidence, not a formal proof of the compiler.

For the first two restored fields, the native diagnostic trace reaches shell
closure at 23 rows with quotient order 6 and 20 rows with quotient order 9,
respectively. The third returns class number one through the trivial
presentation publisher, which overwrites the diagnostic trace slots; no
complete staged trace is claimed for that field. Diagnostic instrumentation
preserves each candidate's first 60 output words and is never used for timing.

The corrected build's core SHA-256 is
`89e194b36ba53512197dbaa0f77210ffbdfcc4938ebc6dc2598f98cc59daca3a`.
Raw generated core size is 17,176,935 bytes; normalizing only its diagnostic
source-path strings gives 12,399,890 bytes, versus the rank parent's
12,374,215. The experimental Python source is 486,319 bytes before adding the
runtime source, and therefore does not qualify under the unchanged 485,000-byte
production allowance. Source compression/integration remains required.

### Controlled full-retry timing and the next structural cost

The isolated `opt` run completed all 1012 fields correctly for every
implementation, with 31 native retries and no final failures. It used the
same recycling allocator, CPU-zero affinity, three rotated rounds, two native
calls per sample, eight fresh GP `bnfinit` calls per sample, and one warmup.
Native retries at efforts 5/1/7/8 are inside the measured call; external input
packing and reusable scratch allocation are outside. Results are checked
outside timing. This is diagnostic native computation, not public API timing.

| Workload | Intermediate checkpoint | Rank parent | PARI |
| --- | ---: | ---: | ---: |
| Selected $x^3-x^2+26x-40$ | 2.451 ms | 3.283 ms | 1.125 ms |
| 152-field pre-analytic cohort, sum of medians | 561.939 ms | 610.803 ms | 204.125 ms |
| All 1012 fields, sum of medians | 4550.247 ms | 4583.535 ms | 1452.875 ms |

The selected field improves about 25.3%, the targeted cohort about 8.0%, and
the full corpus only 0.73%. The separate skip-hopeless-refinement guard totals
4551.734 ms in the same run, essentially tied with the new checkpoint.
The new candidate remains about 3.13 times PARI in aggregate. This single run
does not establish a durable broad win, and 82 first-attempt output records
differ from the parent because the successful proof prefixes can differ.
Raw timing SHA-256:
`ec0e72299b1ece73ac1308f1ef3daf8ed7e6c6beeb7a66b70da9408ec527f5b1`.

The largest absolute regressions are `3.1.385480.1` (3.868 to 5.771 ms),
`3.1.46983.1` (3.261 to 4.876 ms), and `3.1.94276.1`
(3.521 to 5.107 ms). Untimed native traces identify the common new work:
the intermediate prefix finds a unit but still fails analytic certification,
then proceeds to the same successful final relation count and proposal count
as the parent. Respectively, quotient orders progress as
$70\to70\to35$, $40\to10\to5$, and $54\to54\to18$.
This is an extra unsuccessful analytic attempt, not evidence that the
collector lost its cursor or recomputed the complete field.

The next smallest-discriminant target is therefore `3.1.46983.1`,
$x^3-x^2+22x+240$. It attempts closure at 8/12/28 rows, whereas the parent
uses 8/28; both finish after 61 adjacent proposals. Investigate which analytic
quantities can be retained when the class-index estimate changes, and whether
the already justified refinement guard removes the added work. Do not reuse a
class-dependent threshold merely because the field is unchanged. Mathematical
acceptance and the distinction between explicit insufficiency and invalid
evidence remain unchanged.

Sources, builders, extracted checks, GP programs, raw traces, and backend
reports are retained under
`build/cubic-analytic-schedule-evidence/hybrid-prefix/`. These source copies
remain unpromoted: this is neither full-corpus public receipt/independent
Sage.js replay qualification nor Lean verification. The production source and
source/resource allowances remain unchanged.

## Field-only residue reuse after an intermediate checkpoint

The next ablations start from the corrected intermediate-checkpoint source
`41550326694a0e28a56c1c8cb8a731b95f98db4e531ea52083e3d563c307eba8`.
First, source
`bd254ba726b182add49ccbf4836c420f4f6cefd38aae6963c911cda410b2577b`
combines that schedule with the previously justified post-saturation guard:
if the rigorous lower logarithmic joint-index bound is positive, refining
the enclosure cannot certify that unchanged index as one. The exact
classifier, unit authentication, and resumption rules remain unchanged.
The actual guard/classifier passes 289 integer boundary checks.

Second, source
`e435e7e092725c05b3f939394b872a4c356eafbd0310e17070e84e654afe4191`
adds a field-only BF residue cache on top of that combination. Both sources
retain 981/1012 first-attempt successes and reproduce **all 64 parent output
words on all 1012 fields**, including declines. Complete GMP and JavaScript
comparisons with each source's fmpz results also pass. These observations are
not yet public receipt, independent replay, or cross-platform qualification.

### The value-table collision matters

`_cubic_prepare_bf_plan` seeds five special values: the cutoff, its ninth,
three times the cutoff, the absolute field discriminant, and the current
class-order upper bound. `_cubic_bf_value_index` deliberately reuses the first
matching header entry when a prime norm equals one of those values. Therefore
changing the class-order header can change term indices and even the number
of stored values. Updating only endpoint rows 16/17 would not leave a coherent
BF plan for subsequent evaluation.

An extracted execution of the actual planner covers 54 small-cutoff cases,
with 51 term references to the class header and value-count changes in all six
field/cutoff groups. The ordered mathematical term tuples (multiplicity,
scale, norm, exponent) are unchanged across class orders, and every stored
index is checked against the value it names. These tests use small allowed
test cutoffs 27 and 81 and an exact elementary modular-root oracle; they are
planner tests, not additional class-group certificates.

### Cache invariant and limits of this implementation

The BF finite sum and its tail bound depend on the fixed field, maximal-order
prime splitting, cutoff, signature, and analytic precision, not on the
relation presentation's current order or on the discovered unit. The class
estimate enters the separate algebraic side of the joint-index inequality.
Header deduplication changes storage indices, not the prime-norm values in
the finite sum. Thus an already established residue enclosure remains valid
when the relation subgroup changes within this fixed-field root invocation.
This is a mathematical invariance argument under the same BF hypotheses,
not a newly assumed estimate or a Lean-checked proof.

The cache retains the latest successfully evaluated cutoff and residue/tail
endpoints in a private eight-entry exact matrix. No cached value crosses a
root invocation. If the class order changes, the implementation deliberately
rebuilds the **complete** current-class plan and all log/square-root endpoints
before reusing the field-only residue. Counts and class endpoints therefore
match the live plan. If the class order is unchanged, the existing private
plan/endpoints can also be reused. Unit discovery, materialization,
saturation, and final classification still run. A refined enclosure is
reused on its own merits; no nesting assumption about different cutoff
enclosures is made.

This first ablation still pays for prime splitting and transcendental
endpoints on class-order changes. It isolates the benefit of avoiding the
BF finite-sum and tail reevaluation while preserving indexed-plan semantics.
It does not yet implement a class-independent prime plan or value-keyed
transcendental cache. Twelve extracted control/fault cases verify cold fills,
same-class hits, changed-class rebuilds at both cutoffs, malformed cached
intervals, and invalidation on planner or endpoint failure.

The additional diagnostic source `field-cache-check.py` recomputes BF bounds
from the complete current plan on every cache hit and requires exact equality
of lower, upper, and tail endpoints with the cached values. Its enlarged
private matrix records hit counts; those counters are not production output
and are only reported when a nontrivial successful publisher preserves them.
This diagnostic is never timed. An initial build rejected augmented indexed
assignment on `FmpzMatrix`; explicit read/add/store expressions compile. That
diagnostic syntax limitation is not a mathematical cache failure and does not
justify an unrelated compiler change in this arithmetic experiment.

The diagnostic completes all 1012 fields on fmpz, GMP, and JavaScript with
identical acceptance and first 60 output words to the uninstrumented cache
source. Preserved counters report 54 cache hits in 44 nontrivial successful
fields, including 41 changed-class hits in 41 fields. Every hit recomputes
and matches all three cached endpoints exactly; this is stronger evidence
for the reuse than final class-group agreement alone. Counts are lower bounds
for all executed work because other publishers and failure paths can overwrite
the diagnostic slots. Each of `3.1.46983.1`, `3.1.385480.1`, and
`3.1.94276.1` has one reported changed-class hit; `3.1.23567.1` has none.
Diagnostic source SHA-256:
`5f17819debe096dbf0e9eae61d15951a8c54e17ca567ad9e28285877be44879a`.

### Timing result: correct cache, limited reach

The controlled `opt` run uses the same complete-call sampling protocol as the
previous section. All implementations complete all 1012 fields with correct
class numbers/invariants, 31 native retries, and no final failures.

| Workload | Checkpoint alone | With refinement guard | With guard and field cache | PARI |
| --- | ---: | ---: | ---: | ---: |
| `3.1.23567.1` | 2.377 ms | 2.444 ms | 2.385 ms | 1.125 ms |
| `3.1.46983.1` | 4.676 ms | 4.057 ms | 3.868 ms | 1.125 ms |
| `3.1.94276.1` | 5.040 ms | 4.342 ms | 4.236 ms | 1.375 ms |
| `3.1.385480.1` | 5.373 ms | 4.649 ms | 4.545 ms | 1.250 ms |
| `3.1.744076.3` | 9.303 ms | 7.409 ms | 6.638 ms | 1.500 ms |
| All 1012, sum of medians | 4487.424 ms | 4445.852 ms | 4472.268 ms | 1448.625 ms |

The guard improves the checkpoint parent by 0.93% in aggregate in this run.
The field cache improves the selected regressions further, but totals 0.59%
**slower** than the guard without caching. For the 44 fields with reported
cache hits, cache versus guard totals 228.416 versus 237.847 ms; the other
968 total 4243.851 versus 4208.005 ms. The latter group means no **reported**
hit, not necessarily no executed hit. These paired observations do not
establish the cause of the aggregate overhead, and single-run sub-percent
differences should not be treated as durable wins. The cache is not promoted
as a general speedup. Even the fastest aggregate remains about 3.07 times
PARI. Raw timing SHA-256:
`c4913cf3d62a0ccba8a282dcbc552bff4b1bdb5a51a3233c98a9d6a85dfdbfe3`.

The guard/cache generated core hashes are respectively
`d80e81b82053f5cc59159581f6a3ff7ae31564f25a699f073f22910ce1c55e0f`
and `4809d5b0aef60b6a804f68d7f3ccebba1a16326d610d4ceb29d58b18c3d03fe8`.
Python source sizes are 486,563 and 490,611 bytes; normalized-path core sizes
are 12,401,325 and 12,535,002 bytes. Both remain above the unchanged production
source allowance even before runtime source is included. Generated diagnostic
artifacts, controls, fresh-recomputation results, and timings are retained in
the same local evidence directory; production code remains unchanged.

The next investigation should measure first-evaluation cost rather than assume
that another cache layer will close the gap. A possible reusable decomposition
is field-dependent prime splitting, a class-dependent indexed value plan, and
evaluation of the field-only residue. The current cache still repeats the first
two and all transcendental endpoints when the class estimate changes. Any
further reuse must preserve those dependencies and be tested against a fresh
plan, while a broader phase profile must establish where the first successful
closure spends its time. Improvements limited to 44 reported-hit fields cannot
by themselves establish competitiveness over the complete corpus.

## First-evaluation phase profile and apparent primality cost

The next local diagnostic instruments the authenticated checkpoint-plus-guard
core, first at coarse phase boundaries and then at direct root/helper calls.
The original Python/core hashes remain
`bd254ba726b182add49ccbf4836c420f4f6cefd38aae6963c911cda410b2577b` /
`d80e81b82053f5cc59159581f6a3ff7ae31564f25a699f073f22910ce1c55e0f`.
Separate `DIAGNOSTIC-ONLY.json` manifests identify the modified cores; their
inherited build cache keys are not identities for the instrumented artifacts.
Nested `CLOCK_MONOTONIC_RAW` wrappers account for inclusive and exclusive time.
Every run checks 1,100 accepted full 64-word outputs against the uninstrumented
parent, whose result is also checked on GMP and JavaScript. The summaries
subtract the first 100 warmup calls. Exclusive categories sum to the measured
root duration. These are single-threaded **local instrumented profiles**, not
controlled `opt` timings or speed claims; wrapper overhead is included.

Seven coarse profiles show that the first BF preparation/evaluation is important
but not the whole gap: about 31% of instrumented root time for `3.1.283.1`,
versus 17% for `3.1.23567.1`. Direct-root profiling then attributes much of the
previously unassigned time to mathematical helpers, rather than establishing
an allocation bottleneck. The early small-unit probe is not called on these
effort-5 bounded searches. It therefore cannot explain their cost.

Further direct-callee instrumentation gives:

| Field | Instrumented root | Word primality check | Exact maximal-order fixed-point replay | Real-root isolation, all calls |
| --- | ---: | ---: | ---: | ---: |
| `3.1.283.1` | 1.200 ms | 0.218 ms / 1 call | 0.021 ms | 0.059 ms / 4 calls |
| `3.1.23567.1` | 2.353 ms | 0.005 ms / 2 calls | 0.042 ms | 0.117 ms / 6 calls |
| $x^3+9x-55$ | 1.733 ms | 0.005 ms / 3 calls | 0.051 ms | 0.070 ms / 4 calls |

For `3.1.23567.1`, eight generator-bound tests take 0.099 ms inclusive;
34 real-log evaluations from known root intervals take 0.114 ms. The profile
does not support a single remaining dominant analytic bottleneck. It does
identify a particularly avoidable cost for the smallest field: proving the
discriminant factor 283 prime invokes all seven deterministic Miller–Rabin
bases after trial divisions that have already established primality.
The initial attribution of that time to Miller–Rabin is corrected by the
primitive-level investigation below: virtually all of it is first-promotion
allocation, not primality arithmetic.

The general proposed correction is to return true in the existing ascending
small-prime loop when `small * small > number`, after the existing domain
and equality checks. All smaller primes have already been excluded. If the
number were composite, its least prime divisor would be at most its square
root, contradicting those exclusions. The comparison must be strict: at
equality a prime square must reach the divisibility test. Larger inputs retain
the existing seven-base test and unsigned-64-bit domain guard. This is a
deterministic proof, not a new probable-prime assumption or a field-specific
answer shortcut.

The source-copy ablation embeds the actual shared checker in the cubic module;
a separate relocation-only control embeds it without changing its body.
The candidate source hash is
`0afb13d5fc8ff32d3484cbf64f042318d9f75e3a32aa8e91b34138ef7cdc0c6f`,
and the control hash is
`61c36e3946b2b8f40d37c01029e9c38fdad4f97ea13324b71582cbc5dcdcaea5`.
AST comparison verifies that every pre-existing cubic function, constant, and
workspace remains unchanged. Extracted actual Python bodies agree with an
independent sieve on all 100,011 integers from -10 through 100,000; ten larger
boundary/pseudoprime cases preserve the original result. A call-count check
verifies zero Miller–Rabin calls for 283 and all seven for 2213. The original
shared module and production cubic source have not been edited.

Both candidate and relocation-only control retain 981/1012 first-effort
successes, with no errors and all 64 output words identical to the checkpoint
parent on every field, including declines. The candidate additionally passes
all 1012 full-output comparisons on GMP and JavaScript. Direct calls to the
compiled exported primality helper agree with the independent sieve on all
100,011 inputs on each of FLINT, GMP, and JavaScript, and reject six large
domain-boundary/composite cases on each backend. Explicit nontrivial factors
are checked for the three pseudoprime examples. This differential evidence
does not constitute Lean verification or independent replay of the complete
class-group certificates.

The first controlled timing attempt lost its SSH connection when `opt`
restarted. A subsequent read-only check found uptime below one minute, no
benchmark process, and no temporary benchmark directory. That attempt supplies
no timing evidence; it is not combined with a replacement run.
The replacement bundle is in `/tmp/cubic-prime-trial-timing-5v2Z9N` on `opt`,
but the subsequent execution connection also timed out before startup could
be confirmed. Recheck that exact directory and process before launching
another attempt. No performance improvement is claimed for this ablation yet.

### Controlled rejection and first-promotion allocation

A subsequent read-only check found another reboot, no benchmark process, and
the replacement directory gone. A fresh run in
`/tmp/cubic-prime-trial-timing-R0Crgz` then completed normally on the idle `opt`
host. The frozen corpus, three-round rotated sampling, exact result checks,
and full native retry policy are unchanged. All 1012 fields finish correctly;
each native variant retries 31. Sums of per-field medians are:

| Variant | Total |
| --- | ---: |
| Checkpoint-plus-guard parent | 4406.870 ms |
| Relocation-only primality control | 4414.310 ms |
| Trial-division early exit | 4460.442 ms |
| PARI | 1448.625 ms |

The candidate is 1.22% slower than the parent, not an improvement. Among the
423 defining polynomials whose discriminant has a prime factor between 47 and
2209 exclusively, candidate/parent totals are 1909.160/1890.807 ms; among the
other 589 they are 2551.282/2516.063 ms. This cohort classification describes
arithmetic applicability, not a measured call-count claim on every retry.
The timing SHA-256 is
`627b66706da62172e539e76c2239e2eb1db015adba010c8d0228c51751ea6881`.

The generated IR and C do contain the candidate's early return. A separate
private native call trace for `3.1.283.1` confirms the helper receives 283
and makes **zero** Miller–Rabin calls. A controlled standalone microbenchmark
on `opt` (five rotated rounds, 10,000 calls per sample) measures median times
of approximately 0.454 microseconds for the candidate versus 2.164 for the
parent at 283. Thus the local arithmetic shortcut works; it does not explain
the much larger time attributed to this helper inside the closed computation.
Longer 300-call class-group samples likewise do not establish a broad gain:
283 varies modestly while 331 is essentially unchanged. Production is not
modified on the strength of the standalone microbenchmark.

Instrumenting the actual `fmpz_set_str` primitive identifies the discrepancy.
The range guard constructs the literal $2^{64}$ before testing small primes.
Within the closed computation, this one call takes 0.216 ms, while the
primality helper exclusive of it takes about 0.001 ms. A second diagnostic
reads the active GMP checkpoint's counters around that call: **4,064
allocations requesting 65,024 bytes** for this single integer literal.
Requested payload is not total memory consumption; allocator headers and
FLINT's other allocations are not included in that figure. Each diagnostic
again retains all 64 output words for 1,100 accepted runs; printed first-call
details precede the 100-call warmup cutoff.

The installed headers disable `FLINT_REENTRANT`. FLINT 3.6's ordinary
[promotion-pool implementation](https://github.com/flintlib/flint/blob/v3.6.0/src/fmpz/link/fmpz_single.c)
initializes a 16-page batch when its free pool is empty, including minimum
limb allocations for every slot. Its cleanup drains the free slots. Our
`sagejs_flint_exact_checkpoint_cleanup` calls `flint_cleanup` at the ownership
boundary so caches cannot retain limbs in released arena storage. The source
mechanism explains the observed first-promotion burst; the counter measurement,
not the source citation alone, establishes its size in this kernel.

The next systems experiment should compare smaller promotion batches and/or
FLINT's existing
[reentrant allocation implementation](https://github.com/flintlib/flint/blob/v3.6.0/src/fmpz/link/fmpz_reentrant.c)
under the same mathematical source and resource limits. Reentrant allocation
creates and destroys individual promoted objects rather than maintaining that
pool, so it can trade startup savings for more allocation during arithmetic;
it is not assumed faster. **Do not remove cleanup or retain arena-backed
pointers across calls.** Avoiding the literal would merely move initialization
to the next necessary large-integer operation.

Dependency provenance needs care before that experiment: the installed
`libflint.a` member `fmpz_merged.o` does not hash-match the retained source
build's member. Do not silently replace one object from that older build or
claim an allocator-only comparison. Reconstruct an authenticated paired
control/candidate build and record the original-library comparison separately.

The root-interval investigation also now records actual scales. For 283 and
the user class-number-five example the exponent sequences are respectively
`[64,130,64,64]` and `[64,132,64,64]`; for `3.1.23567.1` they are
`[64,132,64,132,64,64]`. Reuse could avoid repeated isolation, but must bind
the immutable polynomial and requested precision. A finer adjacent dyadic
bracket may be rounded outward to a coarser dyadic scale; a coarser bracket
cannot simply be reused as a finer one. This remains a separate, unimplemented
opportunity, secondary to quantifying the promotion/cleanup cost.

Scripts, manifests, raw clock logs, and source copies are retained under
`build/cubic-analytic-schedule-evidence/hybrid-prefix/`, including
`build-coarse-profile.cjs`, `run-coarse-profile.cjs`,
`summarize-coarse-profile.cjs`, `run-coarse-profiles.cjs`,
`prepare-prime-trial.cjs`, and `check-prime-trial.py`.

## Paired FLINT promotion pools: measured removal of a fixed cost

The first-promotion diagnosis now has an authenticated dependency ablation.
This is a **diagnostic dependency experiment**, not a production dependency
change or a new mathematical regime. The generated checkpoint-guard core,
mathematical acceptance conditions, resource caps, and arena cleanup are
identical in both variants.

Rebuild FLINT 3.6.0 locally from the authenticated source archive
`b95e2c7792f5eea4a1c8d2d42c4098434756832e57a094b295eb5dfdc9b4c36b`,
using the installed portable profile (`-O3 -fPIC`, static, GMP/MPFR/OpenBLAS).
Save that fresh default control, then change only `PAGES_PER_BLOCK` from
16 to 1 in `src/fmpz/link/fmpz_single.c` and rebuild. Among all 134 archive
members, exactly `fmpz_merged.o` changes. Private installed FLINT headers
are byte-identical to the original prefix headers. The original installed
archive is retained as a separate third control, rather than silently
substituting an object from an older build.

| Artifact | SHA-256 |
| --- | --- |
| Fresh default archive | `e317176b97f16a4a5657e273bdb5e6c463293177b30de135fd5457adc0d42030` |
| One-page archive | `2c1e5d9eb2e918640a08b8e22e2084bb495cdc0d5ab0c77ad4408da90930bca1` |
| Identical generated core | `d80e81b82053f5cc59159581f6a3ff7ae31564f25a699f073f22910ce1c55e0f` |
| Default-linked addon | `b805688df2fed1a66345a5fdb0c78c26209edd37041da856ccd2d8ddc72d5216` |
| One-page-linked addon | `3bfe2aa7a5bca7182f5866a7e97192ad722cd447f2328f516eb370d7e24933ab` |
| Full timing output | `1e9453e6f257c22d6f8fb1051ad11bc57a77c5e46e0a3b3b212caf690550c654` |

The new artifact manifests explicitly identify the changed dependency; the
parent's cache key is not claimed as the identity of the relinked addon.
Compilation and instrumentation run locally. Only uninstrumented timing
runs on the idle dedicated `opt` VM, pinned to CPU 0 (AMD EPYC 7B13,
Node v26.7.0).

### Correctness and ownership evidence

Both variants produce identical acceptance and all 64 output words on all
1,012 frozen fields: 981 first-attempt acceptances and zero exceptions.
The one-page variant also agrees with the generated GMP and JavaScript
backends on all 1,012 complete outputs. An initial JavaScript check failed
because the new scratch directory could not resolve the FLINT package;
the complete rerun with the compiler worktree's `NODE_PATH` passes.
These are differential checks, **not independent mathematical replay**.

Upstream `make -j4 check MOD=fmpz` passes against the one-page library.
A separate lifecycle harness verifies exact arithmetic, promotion/demotion,
and repeated cleanup at 1, 253, 254, 255, 4,064, 4,065, and 8,193 live
integers. It also checks 8,193 worker-created integers surviving that
worker's FLINT cleanup and then being destroyed by the main thread. This
is general FLINT ownership testing, not permission for Sage.js arena objects
to survive their arena. Hooks run sequentially across the thread join;
this is not concurrent stress testing.

The harness reports first-promotion GMP allocations falling from **4,064
to 254**, and requested payload from **65,024 to 4,064 bytes**. Every
completed lifecycle has zero outstanding GMP payload. An ASan/UBSan build
of the harness also passes with leak detection, but the linked dependency
archives are not sanitizer-built: full-library sanitizer qualification is
not claimed. Page layout, freed-slot accounting, and cleanup code are
unchanged. Arena children and FLINT's cached arena-backed allocations must
still be cleared before releasing each arena.

### Controlled timing

The existing frozen-corpus protocol uses three rotated rounds, two native
computations per sample, one warmup, and eight fresh PARI `bnfinit(f,0)`
computations per sample. Native retry efforts `[5,1,7,8]` are inside the
clock; external input/scratch allocation is outside it. All 1,012 fields
finish correctly, with the same 31 retrying fields for every native variant.

| Variant | Sum of per-field medians, ms |
| --- | ---: |
| Fresh sixteen-page control | 4635.954 |
| One-page pool | 4421.122 |
| Original installed library | 4632.753 |
| PARI | 1475.125 |

The smaller pool reduces the total by **4.63%** against its matched control.
The median per-field time ratio is **0.9316** (6.84% reduction); the 90th
percentile ratio is 0.9867, while the 99th percentile is 1.0389. It is not
a claim that every workload improves. The two default-library controls
differ by under 0.1% in this run. The one-page corpus total remains **3.00
times PARI's**: this fixes a real representation cost, not the whole gap.

A separate five-field run uses five rotated rounds and 100 computations
per sample for both native and PARI, with ten native warmups and one PARI
warmup. Medians in milliseconds:

| Field | Fresh control | One-page | Installed | PARI |
| --- | ---: | ---: | ---: | ---: |
| `3.1.283.1` | 1.2932 | 1.0691 | 1.3040 | 0.7700 |
| `3.1.331.1` | 1.2633 | 1.0237 | 1.2850 | 0.8600 |
| $x^3+9x-55$ | 1.7825 | 1.5684 | 1.8047 | 1.0300 |
| `3.1.23567.1` | 2.4149 | 2.2020 | 2.4672 | 1.1000 |
| `3.1.46983.1` | 4.2478 | 3.9714 | 4.2361 | 1.1500 |

The roughly 0.2 ms savings agree with the earlier first-promotion trace.
Do not compare absolute values from separate timing rounds as though host
variation were absent. Neither experiment measures the public API or a new
holdout; public receipts/replay and four-platform qualification remain open.

Reproduction instructions, source-delta audit, lifecycle harness, build logs,
artifact manifests, full differential outputs, and raw timings are retained
under `build/cubic-analytic-schedule-evidence/flint-pool/`. Large reproducible
dependency builds stay in `/scratch/sagejs-runtime/cubic-flint-pool-Vqpqjn/`.
The next dependency question is whether upstream's reentrant allocator or
another pool policy improves this further without hurting high-throughput
FLINT workloads. This one-page experiment alone does not justify changing
the global production dependency policy. Repeated root isolation and the
larger certification cost remain separate algorithm/compiler opportunities.

## Reentrant allocation: cheaper first promotion, worse overall computation

The upstream `--enable-reentrant` allocator is now tested rather than assumed
faster. It avoids batch initialization, but allocates a FLINT object and GMP
payload for each promoted integer and frees them at demotion/destruction.
This is the upstream implementation, not a new mathematical backend or a
handwritten cubic shortcut.

The experiment uses another fresh extraction of the same authenticated
FLINT 3.6.0 archive and the same compiler/profile, adding only
`--enable-reentrant` to configure. Relevant upstream source files hash-match
the tarball. Installed `config.h` and `flint-config.h` differ from the
default headers only in the definition of `FLINT_REENTRANT`; TLS stays
enabled. This separately configured build is not claimed to differ in
exactly one archive member. The cubic core, acceptance checks, scratch
dimensions, resource caps, and arena cleanup remain unchanged.

- Reentrant archive: `7e230e4a9a4cf1433e05fb23e530a60e45e3bc06b84b2cfd5a255400c026d114`.
- Reentrant addon: `45b4eff941f1bbf2195bac46d16588998ff54fb36542dbe190a8b273b830f249`.
- Full timing output: `264db1ec005bf8120663458dabc5c038e751fd9c2a9a67df5c93efacdd421d57`.

The 1,012-field first-attempt survey agrees in acceptance and every output
word with the unchanged parent (981 acceptances, zero exceptions); both GMP
and JavaScript differential passes also agree on every word. Upstream
`make -j4 check MOD=fmpz` passes. The prior lifecycle harness, including
cross-thread destruction after creator cleanup, passes under ASan/UBSan
with leak detection. As before, the dependency archives are not themselves
sanitizer-instrumented. First promotion is just **one GMP allocation of 16
payload bytes**, excluding the separate FLINT object allocation.

### Controlled rejection

All timing is uninstrumented, serial, CPU-0-pinned on `opt`. The full-corpus
protocol is unchanged from the preceding experiment and includes the same
31 retrying fields, with all 1,012 computations accepted correctly:

| Variant | Sum of per-field medians, ms |
| --- | ---: |
| Sixteen-page control | 4682.524 |
| One-page pool | 4457.166 |
| Reentrant | 5073.191 |
| PARI | 1479.250 |

Reentrant is **13.82% slower than one-page** on this aggregate. Its median
per-field ratio to one-page is 1.1385; the 10th and 90th percentile ratios
are 1.0869 and 1.1856. The result rules out reentrant allocation as the
preferred policy for this corpus, despite its cheaper first promotion.

The longer five-field run (five rotated rounds, 100 computations per sample
for native and PARI) confirms the penalty. Medians in milliseconds:

| Field | Sixteen-page | One-page | Reentrant | PARI |
| --- | ---: | ---: | ---: | ---: |
| `3.1.283.1` | 1.3262 | 1.0995 | 1.1874 | 0.7800 |
| `3.1.331.1` | 1.2678 | 1.0772 | 1.1809 | 0.8600 |
| $x^3+9x-55$ | 1.8061 | 1.5689 | 1.8000 | 1.0400 |
| `3.1.23567.1` | 2.4253 | 2.1895 | 2.5079 | 1.0900 |
| `3.1.46983.1` | 4.1653 | 3.9867 | 4.5571 | 1.1400 |

Do not infer a general win from the noisy short-batch result for 283, where
reentrant happened to time below one-page; the longer run reverses it.
No production dependency policy changes. The one-page experiment remains
the stronger candidate, still requiring broader workloads and platforms.

### Allocation traffic explains the rejection

Private instrumented copies print the existing GMP checkpoint counters just
before checkpoint release. All three use the same instrumented core hash
`73deb1b6f7f89cc5037cdb25e6d2a316b34f859b6041c925dc9f826b5b9296ee`
and the explicitly recorded dependency variants. They run locally, not on
the timing VM; all five fields reproduce all 64 reference output words.
These counters are not additional timing evidence.

For $x^3+9x-55$:

| Policy | Allocation calls | Reallocation calls | Requested bytes | Checkpoint high-water bytes |
| --- | ---: | ---: | ---: | ---: |
| Sixteen-page | 4130 | 255 | 77312 | 268992 |
| One-page | 828 | 255 | 24480 | 53440 |
| Reentrant | 9630 | 5887 | 355456 | 36992 |

Reentrant has the smallest high-water mark but vastly more allocation
traffic. On `3.1.46983.1`, one-page records 877 allocations and 393
reallocations; reentrant records 24,418 and 18,036. The pooled implementations
retain promoted objects and their reusable limb capacity; reentrant clears
each object, so later promotions must allocate and grow again. Recycling
raw arena blocks alone does not preserve that object capacity. This source
mechanism and the measured traffic explain why minimizing first-allocation
work or peak memory is not the same as minimizing computation time.

For all five fields, the one-page trace records 762 frees at cleanup,
consistent with three 254-entry promotion batches rather than one 4,064-entry
batch. Recorded GMP checkpoint statistics exclude separate FLINT object
allocations and are not total process memory. The raw logs and strict parser
are `traffic-*.log`, `allocation-traffic.cjs`, and `summarize-traffic.cjs`.

### Next mathematical reuse invariant

A separate probe executes the actual CPython-parsable root isolator and
tests 25,728 integer-rounding cases plus 6,072 projected-versus-fresh root
intervals on all 1,012 fields. Starting at scale $2^{132}$, projection to
$2^0,2^1,2^{16},2^{64},2^{128},2^{132}$ gives exactly the same endpoints
as fresh isolation, with exact polynomial signs checked at every endpoint.
This is not a formal proof or an implemented native cache.

The underlying argument is small: if $S=qs$ with integer $q\ge1$ and
$L\le S\alpha\le U$, where $L,U$ are integers and $0\le U-L\le1$, then

$$
\left\lfloor\frac Lq\right\rfloor
\le s\alpha\le
\left\lceil\frac Uq\right\rceil.
$$

The projected integer endpoints still differ by at most one. For an
irreducible complex cubic the unique real root is irrational, so its
adjacent enclosing integer endpoints at each rational scale are unique.
Consequently the projected bracket agrees with fresh exact isolation.
This is one-way reuse: it provides no extra precision from a coarse bracket.
An implementation must bind the polynomial and scale, retain only valid
intervals, and keep the cache private to the arena. The static source call
graph identifies 16 functions, including the root helper and public entry,
through which that private borrow must pass. Exact sign validation can
remain the authority even on a cache hit.

Reproduction scripts, manifests, raw correctness/timing outputs, lifecycle
checks, and root-projection probe are retained under
`build/cubic-analytic-schedule-evidence/flint-reentrant/`; large rebuildable
dependencies remain in `/scratch/sagejs-runtime/cubic-flint-reentrant-V8c1dM/`.
These experiments remain direct-kernel, frozen-corpus diagnostics, not
public-call benchmarks, new holdouts, or independent mathematical replay.

## Private real-root reuse: source-transparent implementation

The root-projection invariant now has a diagnostic native implementation,
not just a proposed cache. It preserves the original isolator body under
`_cubic_real_root_interval_uncached` and routes its callers through a small
exact wrapper. The public kernel signature does not change. Sixteen
functions carry one additional private borrow; eight zero-initialized
integer slots are allocated inside the existing exact arena, binding the
four polynomial coefficients, scale, bracket endpoints, and validity flag.

A hit requires identical coefficients and a positive requested scale dividing
the cached scale. The wrapper projects outward, checks endpoint ordering
and width at most one, then checks both polynomial signs exactly. Any
failed condition uses the original isolator. Nonpositive requested scales
decline without modifying the cache; only successful fresh isolation is
stored. There is no global state, cross-call persistence, finer-precision
claim from a coarser interval, or changed mathematical acceptance test.

An AST reversal check removes just the documented borrow/allocation/wrapper
changes and recovers the parent's AST exactly. Executing the actual Python
helpers passes 14,168 exact comparisons across the 1,012 fields, including
mixed precision order, corrupted endpoints and flags, mismatched coefficients,
invalid cached scales, nondividing requested scales, and reuse across different
polynomials. Another 6,000 comparisons pass on 1,000 seeded cubics of negative
discriminant outside that field corpus; these polynomials are not asserted
irreducible, and this is a root-isolation test rather than a class-group
holdout. This is a same-source diagnostic test, not a Lean formalization.

The existing compiler accepts the implementation without compiler changes.
Both native artifacts (default FLINT and the previously tested one-page pool)
agree with the unchanged parent on acceptance and all 64 words for every
frozen field: 981 first-attempt acceptances, zero exceptions. GMP and
JavaScript also agree with the compiled source on all 1,012 outputs. These
checks do not substitute for independent mathematical replay.

Separate locally instrumented native runs count root-wrapper requests and
actual executions of the original isolator, while checking all 64 result
words. Counts are 4 requests / 2 isolations for 283, 331, and $x^3+9x-55$;
6 / 2 for 23567; and 12 / 3 for 46983. These instrumented copies are not
used in the timing experiments.

The earlier local instrumented profiles put the opportunity in perspective:
all root isolation together cost about 0.059 ms for 283, 0.070 ms for the
class-number-five example, and 0.115 ms for 23567 (roughly 4–5% of those
profiled computations). The cache still performs some isolation and checks
hits exactly, so a large end-to-end gain should not be expected. In the
same profiles, BF plan preparation plus finite-bound evaluation together
cost about 0.30–0.32 ms per example. These are instrumentation-inclusive
diagnostics, not controlled cross-host timings, but they identify a larger
remaining target than further tuning this cache.

### Provenance and resource review

- Candidate source: `2deecbbb0521fa868b500fa66f7c89f92e6b106e89946973eade7cbc746c409b`.
- Generated core: `2ece5ae0b053902a9fe8980cb1d4660114f1cb1bdd3492342ca92c12e0523b11`.
- Same source-transparent builder: `7e0940180b32e5d4b067639d381131e08d7e2b0a4eeb6700017f32856c8e633e`.

The source grows from 486,563 to 488,799 bytes (+2,236). The eight private
slots increase storage within unchanged memory/temporary-work caps. Both
experimental sources already exceed the 485,000-byte release allowance
before runtime source is counted: **no allowance is raised and no release
eligibility is implied**. Raw C falls from 16,958,635 to 16,414,642 bytes
because the source path is shorter, not because the implementation shrank.
Replacing each root source path by the same `<source.py>` marker instead
gives 12,621,840 versus 12,711,792 bytes (+89,952). Normalized lengths are
resource diagnostics, never artifact identities.

### Timing: a small opportunity, not a no-regression qualification

The CPU-0-pinned uninstrumented comparison isolates reuse by comparing the
parent and cache with the same one-page FLINT library. A third artifact
uses the cache with the default pool. Both full-corpus runs finish all
1,012 fields correctly, including the same 31 retrying fields. Sums of
per-field medians in milliseconds:

| Native calls per sample | Parent, one-page | Cache, one-page | Cache, default | PARI |
| --- | ---: | ---: | ---: | ---: |
| 2 | 4638.472 | 4544.829 | 4748.967 | 1526.000 |
| 10 | 4620.033 | 4568.823 | 4780.118 | 1533.125 |

Each run uses three rotated rounds, one warmup, and eight fresh PARI
`bnfinit(f,0)` computations per sample; native retries remain inside the
clock. The observed reductions are **2.02% and 1.11%**, respectively.
The longer run's median per-field ratio is 0.9887, with 90th percentile
1.0495: no per-field no-regression claim is justified. Raw outputs are
`timing.json` (`a9ce9bc4611e62e5bf23f5b0915c494f80d6a98c94726bc8c9bb6847c16abc30`)
and `timing-longer.json`
(`724a9bf0eede5810bb9b37f204fba26a883dc3df19a43dbfb679386f63bf2578`).

The separate five-field, 100-computation batches were mixed and showed
substantial timing variation for both native and PARI. They are retained
as `focused-timing.json`, not silently discarded or described as confirming
a uniform gain. A health snapshot found no other competing compute process
inside `opt` and reported zero guest steal time; it does not establish the
cause of the timing variation or prove an uncontended physical host.

An additional native-only diagnostic interleaves 21 alternating ABBA/BAAB
rounds, ten computations per sample, after 200 warmups per implementation
and field. It records wall and process CPU time. Median within-round
cached/parent ratios are:

| Field | Wall ratio | CPU ratio |
| --- | ---: | ---: |
| `3.1.283.1` | 0.9603 | 0.9588 |
| `3.1.331.1` | 0.9654 | 0.9659 |
| $x^3+9x-55$ | 1.0009 | 0.9972 |
| `3.1.23567.1` | 0.9819 | 0.9841 |
| `3.1.46983.1` | 0.9652 | 0.9657 |

This supports modest savings on several selected cases, but essentially
neutral performance on the user's class-number-five example. Sample-ratio
10th–90th percentile ranges still cross one; these are not confidence
intervals. The correct conclusion is **a working exact cache with limited
performance leverage**, not a new PARI win or release qualification. Keep
the implementation experimental and prioritize the larger BF planning and
finite-bound costs. Public-call timing, independent replay, source allowance,
four-platform qualification, and broader no-regression evidence remain open.

Source preparation, exact/fault-injection checks, manifests, corpus outputs,
instrumented counts, and reproduction instructions are retained under
`build/cubic-analytic-schedule-evidence/root-cache/`; the native build manifest
is also retained as `native-builds.json`. Large reproducible builds remain
in `/scratch/sagejs-runtime/cubic-root-cache-NadCCI/`.

## Validation status

- The specialization-audit follow-up passes formatting, all five focused
  analytic-schedule tests, strict Python (382 modules), direct documentation
  checking, and the complete 192-file unit tier after a fresh 10m09s build.
  The broader 585-file test tier subsequently stopped at `test/ffi.cjs`:
  five failures involve the missing FFLAS generated manifest and missing
  igraph addon/static library. It had reported 74 completed passing files;
  active siblings were cancelled and 509 remaining files were not started.
  This is a failed broad run, not a pass or a still-running process. The final
  serial architecture rerun passes FFI and preceding gates but stops at the
  stale optimizer inventory (current expected input
  `d870e205dd95ae3434ca8df34610b4a0c323107fd722e3b8faea0d336414adea`).
  An earlier architecture invocation overlapped the compiler build and is
  explicitly unqualified; its transient FFI failure is not a new source bug.
- Initial full local build, strict CPython/Ruff/Pyright gate, all 192 unit-test
  files, five focused unit tests, and the extracted analytic-suffix
  fault-injection fixture pass.
- The direct documentation generator check also passes with the final build.
- Native corpus checks above pass with explicitly identified artifacts.
- The final serial native run passes all nine tests in the BF-prefix,
  analytic-suffix, and native-class-number suites, including public receipt
  authentication, independent exact replay, pinned nontrivial fields, and
  large-regulator units. This is not full-corpus independent replay. Earlier
  runs failed for missing local addons or overlapped compiler builds and are
  not counted as evidence. Provisioning now uses the standard local prefix
  path linked to the existing dependency prefix; addons were rebuilt locally.
- `architecture:check` stops at a stale optimizer-opportunity manifest. Its
  recorded input hash is
  `ce64558cecbdc639cd6eeb9a6b3ad0de5d968c6523248d11401556004dc3bcde`;
  recomputing the input identity with the unchanged baseline native source
  gives `941e6567b32bb52ecd4835b97f67b6a66453dac61cc143c50cf4a9cb1d3fd7c1`.
  The mismatch therefore predates this correction. The inventory is not
  refreshed merely to obtain a passing gate.
- The `test:changed` wrapper failed during an overlapping compiler rebuild;
  the `docs:check` wrapper then failed during addon reconciliation before the
  local prefix was provisioned. Neither wrapper is claimed passing. Individual
  unit/native checks above ran successfully with the final environment.
  Four-platform release qualification and full-corpus public receipt/replay
  qualification remain outstanding.
