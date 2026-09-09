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

## BF arithmetic ablations: early composite exit and exact scale cancellation

The next campaign isolates two changes against the uncached
`checkpoint-guard.py` parent, using the same one-page FLINT library for all
timed native variants. It does not stack the noisy root-cache experiment.
Neither change selects a different analytic bound, changes the stopping rule,
adds a cache, or raises a resource allowance.

### Mathematical scope

The planner tests candidate primes by trial division. Once a divisor is
found, its primality flag is false and no subsequent divisor can change the
answer. Adding `break` after that assignment therefore preserves the complete
prime sequence; the private divisor variable is unused after the loop.
Executing the actual extracted before/after loop bodies agrees with an
independent sieve for every integer from 2 through 20,000. For the two live
cutoffs, the number of trial divisions falls from 12,961 to 3,699 below 765,
and from 36,260 to 9,079 below 1494. These operation counts are not timing
claims.

The finite-bound evaluator's first term divides a dyadic interval by an
exact positive integer $D=kN^k$, with $N\ge2$ and $k\ge1$ checked before use.
Its existing generic interval division receives denominator endpoints
$DS,DS$, where the native entry constructs $S=2^{64}>0$. For every signed
integer endpoint $A$ or $B$,

$$
\left\lfloor\frac{AS}{DS}\right\rfloor
=\left\lfloor\frac{A}{D}\right\rfloor,
\qquad
\left\lceil\frac{BS}{DS}\right\rceil
=\left\lceil\frac{B}{D}\right\rceil.
$$

The replacement computes those two quotients directly, preserving the
rounded endpoints exactly, rather than merely producing another valid
enclosure. It applies to both analytic scales. The second term, signed
multiplicities, final multiplier, and tail calculation remain unchanged.
This is an optimization under the existing positive-scale private contract,
not a claim about zero or negative scales.

The source-extracted CPython checks cover 7,000 signed quotient comparisons
up to 1,024-bit scales, 3,000 complete finite-bound evaluations, and 22,016
malformed-term comparisons. Synthetic finite-bound inputs use arbitrary
positive ordered intervals to test the algebraic identity; they are not
claimed to enclose actual logarithms or square roots. Malformed terms cover
zero multiplicity, invalid scale selectors, norm/exponent constraints, and
bad stored value indices. Source generation checks that every other
top-level function body is AST-identical to the parent.

Both native source copies, with both the original and one-page FLINT
libraries, preserve acceptance and all 64 output words on the frozen 1,012
fields: 981 first-effort acceptances and no exceptions. GMP and JavaScript
also agree on all 1,012 outputs for each source copy. These comparisons
are not independent mathematical certificate replay or public-path release
qualification.

### Generated source and resources

| Variant | Python bytes | Path-normalized core bytes |
| --- | ---: | ---: |
| Parent | 486,563 | 12,621,840 |
| Composite early exit | 486,585 | 12,622,102 |
| Cancel common scale | 486,417 | 12,619,980 |

Normalization replaces only the respective root source path with
`<source.py>`; these lengths are diagnostics, not artifact identities.
The sources still exceed the unchanged 485,000-byte release allowance
before counting runtime source. Small source reductions do not resolve
that outstanding qualification issue.

Source hashes are
`70a01b91a0254db9698c872dbd633a8276802cd5fedbb22ed2645343da655b4a`
(early exit) and
`17a01d6588f4b3543c8d68c40ed05194bfafc16d4e261321eea7c859fac115db`
(scale cancellation). Generated core hashes are
`b965e500084aee95501063062fc98a9f3311d2239289bb15799d34739c248f1e`
and `28ddda06ae9c01963d1000f8d86ad20cb7a48392b2079367a3ced4cc7631bee2`,
respectively. Compilation succeeds without compiler changes.

### Controlled timing and decision

The uninstrumented CPU-0-pinned `opt` run compares all three source copies
with the same one-page FLINT library. All 1,012 fields complete with correct
class numbers and invariants; the same 31 fields require retries. There are
three rotated rounds, two native calls per sample (retries inside the clock),
eight fresh PARI `bnfinit(f,0)` calls per sample, and one warmup. External
argument packing and scratch allocation are excluded. Sums of per-field
medians in milliseconds:

| Parent | Composite early exit | Cancel common scale | PARI |
| ---: | ---: | ---: | ---: |
| 4380.313 | 4348.451 | 4343.501 | 1457.625 |

Observed aggregate reductions are 0.73% and 0.84%. Median per-field ratios
are 0.9912 and 0.9900, with 90th percentiles 1.0100 and 1.0103. These are
small effects, not a uniform no-regression qualification. The full-run raw
SHA-256 is `3b4ba6da4c862016509e735705f417b6c62dfc02f9d631a99006f3f49c7dff9b`.
The host reports AMD EPYC 7B13 and Node v26.7.0.

Two additional native-only comparisons each use 21 alternating ABBA/BAAB
rounds, ten calls per sample, and 200 warmups per implementation and field.
Median within-round wall-time ratios to the parent are:

| Field | Early exit / parent | Cancellation / parent |
| --- | ---: | ---: |
| `3.1.283.1` | 0.9823 | 0.9755 |
| `3.1.331.1` | 0.9783 | 0.9818 |
| $x^3+9x-55$ | 0.9815 | 0.9727 |
| `3.1.23567.1` | 0.9941 | 0.9838 |
| `3.1.46983.1` | 0.9979 | 0.9831 |

CPU-time ratios are similar. All sample-ratio 10th–90th percentile intervals
cross one except scale cancellation on the class-number-five example
(wall 0.9535–0.9972, CPU 0.9535–0.9957). These are sample quantiles, not
confidence intervals. Paired raw hashes are
`d1c55ac83dc40ff12520c09a097f45a83874415a74a218c3508252bd1251f795`
(early exit) and
`17fb1aa77b0c565370117ec5ed0c3d6121bcedadac72c52cbce786a7e0980a52`
(cancellation).

These are small, general exact simplifications worth retaining for eventual
integration, but they do not explain or close the approximately threefold
aggregate PARI gap. No combined performance claim has been tested, and
neither experiment is promoted here. The next investigation should target
the cost of the full analytic representation and precision policy, rather
than extrapolating trial-division savings into a large end-to-end win.
In particular, determine whether a cheaper initial outward-rounded precision
can certify the same cases, with resident precision escalation when it
cannot. That is a hypothesis, not a measured result: all scale-dependent
data, unit-reconstruction precision, exported precision metadata, and
inconclusive-versus-invalid statuses need auditing before such a change.
The mathematical bound and acceptance inequality must remain unchanged.

Source generators, extracted-body checks, resource records, four complete
native surveys, backend comparisons, raw timings, and reproduction instructions
are retained under `build/cubic-analytic-schedule-evidence/bf-cancel/`.
Large reproducible builds remain in
`/scratch/sagejs-runtime/cubic-bf-cancel-2VLZDI/`. These artifacts do not
replace public authenticated receipts, independent exact replay, source-budget
resolution, or four-platform qualification; those gates remain open.

## Analytic precision: a larger gain and a saturation-proposal boundary

Two source copies change only `_CUBIC_ANALYTIC_PRECISION`, from 64 to 32
or 48. All theorem constants, exact arithmetic, acceptance inequalities,
and resource caps remain unchanged. The underlying Arb adapters accept
16–4096 bits, compute at the requested precision plus 32 guard bits, and
round scaled lower/upper endpoints outward. Lower precision widens the
enclosures; it does not authorize replacing an interval test by an approximate
comparison. The native entry constructs the corresponding scale $2^p$ and
the analytic publisher records both $p$ and that scale.

The joint-index decision still requires a well-formed enclosure containing
zero with upper endpoint strictly below a lower bound for $\log 2$.
Because the certified subgroup index is a positive integer, those conditions
force index one at any valid precision. Reversed or contradictory intervals
remain invalid. An extracted-source test exercises this unchanged classifier
against 16,000 independently constructed rational enclosures of
$\log j$, $1\le j\le32$, at 16, 32, 48, 64, and 128 bits, plus 25 boundary
checks. This is a targeted exact-arithmetic test, not a formal proof or an
end-to-end certificate replay.

Both variants preserve the same 981 first-effort acceptances on the frozen
1,012 fields, with no exceptions or wrong accepted class numbers/invariants.
Each agrees on all 64 words across original/one-page FLINT linkages, GMP,
and JavaScript. Comparisons with the 64-bit parent deliberately do **not**
require identical dyadic integers: scales and rounded endpoints changed.
For comparable analytic publications, 785 zeta enclosures overlap the parent;
770/778 regulator and joint-index enclosures overlap for unchanged unit
coordinates at 32/48 bits, respectively.

There are 15 changed-unit cases at 32 bits and seven at 48 bits. A separate
exact GP audit reconstructs the maximal-order row-HNF basis from `nf.zk`,
checks the field discriminant and class number, runs `bnfcertify`, verifies
unit norm and fundamental-unit exponent, and compares the units exactly.
All 22 cases differ only by sign from the parent unit. This is an independent
unit audit, not complete replay of every class-group relation transcript.

### Timing

The same uninstrumented CPU-0-pinned `opt` protocol uses the same one-page
FLINT library for all variants, three rotated rounds, two native calls per
sample with retries inside the clock, eight fresh PARI `bnfinit` calls per
sample, and one warmup. Every field completes correctly; 31 require retries.
Sums of per-field medians (ms):

| 64-bit parent | 32 bits | 48 bits | PARI |
| ---: | ---: | ---: | ---: |
| 4342.587 | 3777.102 | 3824.245 | 1455.000 |

The observed aggregate gains are **13.02% and 11.94%**, appreciably larger
than the preceding BF loop/arithmetic rewrites. The class-number-five example
changes from 1.565 ms to 1.244/1.249 ms, versus PARI's 1.000 ms. Raw timing
SHA-256: `b7a9ebfe883dca328a0c55b5f68426b8b9f4957af5886267a7a8b855900d17ea`.
These remain private-entry measurements on a reused corpus, not a new
holdout or public-call qualification.

Eight-field paired runs use 21 alternating ABBA/BAAB rounds, ten calls per
sample, and 200 warmups per implementation and field. Median wall-time ratios:

| Field | 32 / 64 bits | 48 / 64 bits |
| --- | ---: | ---: |
| `3.1.283.1` | 0.7860 | 0.8076 |
| `3.1.331.1` | 0.7605 | 0.7859 |
| $x^3+9x-55$ | 0.7831 | 0.8060 |
| `3.1.23567.1` | 0.8344 | 0.8392 |
| `3.1.41300.1` | **1.8250** | 0.8132 |
| `3.1.46983.1` | 0.9166 | 0.9484 |
| `3.1.97492.1` | **1.5329** | 0.8032 |
| `3.1.3209035.1` | **1.3033** | 0.8413 |

Sample-ratio 10th–90th percentile ranges stay on the same side of one for
each entry, but are not confidence intervals. Paired raw hashes are
`1a6acb6f431ec9a31f947b541b85c2ae3d74d393e42b9538735efa77ed086103`
and `7436d0fbc22a92f86cdae153b26ae88e41843aeaa795f21d0fefed8dd1878ece`.

### Why the three 32-bit cases regress

The three fields publish 16 rather than 10, 16 rather than 12, and 20
rather than 17 compact relations. A read-only call/return trace of the
generated JavaScript bodies preserves every output word of its corresponding
uninstrumented backend. It shows that the first unit is reconstructed
correctly at all three precisions. At 32 bits, however, the opportunistic
square-root proposal returns zero; cube/fifth-root probes also find nothing.
The joint-index enclosure remains insufficient, and later relations provide
the missing smaller unit. At 48 and 64 bits the square-root proposal returns
the exact square root immediately, passes exact power verification, and
certifies the original prefix. This trace is not a native timing profile.

The engineering consequence is to separate **analytic enclosure precision**
from **numerical proposal precision**. A failed low-precision root proposal
is not proof that a root is absent. The follow-up below implements that
separation instead of blindly lowering every use of a shared constant.

The two source hashes are
`21a31a0476e9dea6456d20e778509b1be6f4926dfe3a339a2ccb9c80549ef39a`
and `7a231a91b888700e8b09530e413cae6a147f2884688e36db48fe6fda03602985`.
Both retain the parent's 486,563 source bytes and 12,621,840 path-normalized
generated-core bytes. No compiler change or source-cap increase is made.
The experimental source remains over the release allowance, and public
receipts, complete independent replay, and platform qualification remain open.

### Implemented split: analytic32, saturation proposals at least 64 bits

The third source copy retains 32-bit analytic arithmetic and changes only
`_cubic_saturate_analytic_unit`: it constructs a separate proposal scale,
doubling the analytic scale until its corresponding precision reaches at
least 64, and passes that scale to the square/cube/fifth-root probes.
For an analytic scale $2^p$, the proposal scale is $2^{\max(p,64)}$.
No root is accepted without the existing exact power replay. The recovered
root's regulator is still recomputed at the analytic scale and checked against
the retained unit's regulator before the unchanged final index test.
All state remains in the same native arena; no owner or callback is added.

The actual-controller plumbing test covers 36 cases: precision below, at,
and above 64, failed opportunistic proposals, invalid probe statuses, and
invalid analytic scales. Those tests explicitly stub mathematical operations
and make no independent root-correctness claim. The generated-JavaScript
trace confirms that all three regression fields now propose at $2^{64}$,
recover the same exact square roots as the parent, and certify the original
prefix with analytic scale $2^{32}$.

The full native survey retains all 981 first-attempt successes, with zero
exceptions and **all parent relation counts restored**. Original/one-page
FLINT, GMP, and JavaScript agree on all 64 words for each of the 1,012
fields. Every published unit equals either its previously audited 32-bit
candidate or its parent unit. Comparable interval overlaps cover 785 zeta
and 772 regulator/index publications. These are still diagnostic checks,
not full independent class-group transcript replay.

The second controlled full-corpus run uses the same protocol and library:

| Parent64 | Split32 | Analytic48 | PARI |
| ---: | ---: | ---: | ---: |
| 4329.807 | 3795.418 | 3837.643 | 1455.250 |

All 1,012 computations finish correctly with the same 31 retrying fields.
Split32 reduces the sum of medians by **12.34%**. Its median per-field ratio
is 0.8486 and its 90th percentile is 0.9093. For $x^3+9x-55$, the observed
times are 1.560 ms parent, 1.223 ms split, and 1.000 ms PARI. Raw hash:
`03f84124890786ffb441d2bb3d9d0022dc4665151f9d2e6a476cee68154f1629`.
This does not compare split32 directly against unsplit32 in the same run;
do not infer their precise relative aggregate speed from separate runs.

The same eight-field paired protocol gives split/parent median wall ratios
0.8042, 0.7724, 0.7886, 0.8343, 0.7841, 0.9365, 0.7963, and 0.8234 in the
table's field order above. All corresponding wall/CPU sample-ratio
10th–90th percentile ranges are below one. In particular, the three large
unsplit32 regressions become approximately 18–22% improvements. Paired raw
hash: `e01f7bd18592661eb9e3d8bdb5137ef9e9bad87700cdd326c0253671f3725eaa`.
This is encouraging selected-panel evidence, not universal no-regression proof.

Split source hash:
`4478b0f9bd9d1bb7d5674f48a6e76c7e35bb22ef1c7541f6c44dded751583c0a`;
core hash: `ced8caf205baa8d985c0d6c36c86949d658fda890572ddc898e2467bcbb6373f`.
Source grows to 486,912 bytes (+349); path-normalized core grows to
12,625,579 bytes (+3,739). The unchanged source allowance remains unresolved.

**Decision:** retain split precision as the preferred next candidate, not a
production promotion. It provides a materially larger measured improvement
than the preceding micro-optimizations and explains a genuine mathematical
search regression. It does not yet implement general resident precision
escalation for inconclusive analytic intervals or difficult root proposals.
The corpus aggregate remains about 2.61 times PARI. Next separate the cost
of shorter integer representations from fewer precision-dependent operations,
then qualify this policy on fresh fields and the public replay path. Do not
attribute the observed gain entirely to allocation without measuring it.

Source generators, extracted-body tests, GP unit audits, backend surveys,
in-memory diagnostic traces, resource records, raw controlled timings, and
reproduction instructions are retained in
`build/cubic-analytic-schedule-evidence/precision/`. Large reproducible builds
remain under `/scratch/sagejs-runtime/cubic-precision-jxDdsr/`.

This campaign reruns the five focused analytic-schedule tests, direct
documentation checking, diff checking, and parallel-contract checking
successfully. The architecture gate passes FFI, package, numerical, native,
and Wasm checks, then stops at the previously documented stale optimizer
opportunity manifest (recorded `ce64558...`, current expected `d870e205...`).
It is not reported green and the unrelated inventory is not regenerated.

### Allocation attribution and the next missing-unit prefix

Read-only instrumentation of the generated native cores now measures the
checkpoint's existing allocation counters for the parent and split32 sources.
The instrumented addons use the same one-page FLINT library, run locally, and
are never used for timing. Each of the eight calls agrees on acceptance and
all 64 output words with its own uninstrumented survey. Wrappers around six
helpers measure inclusive counter deltas; nested helper counts must not be
added as if they were exclusive costs.

| Field | Allocations, parent → split | Reallocations, parent → split | Peak used arena bytes, parent → split |
| --- | ---: | ---: | ---: |
| 283 | 811 → 269 | 184 → 67 | 52096 → 18432 |
| 331 | 814 → 268 | 183 → 66 | 52352 → 18368 |
| 9399 ($x^3+9x-55$) | 828 → 272 | 255 → 94 | 53440 → 19008 |
| 23567 | 844 → 282 | 299 → 111 | 54528 → 20544 |
| 41300 | 850 → 296 | 338 → 151 | 56448 → 21952 |
| 46983 | 877 → 316 | 393 → 197 | 59712 → 24640 |
| 97492 | 1118 → 307 | 374 → 168 | 73728 → 23744 |
| 3209035 | 1656 → 320 | 448 → 228 | 108544 → 25664 |

For the class-number-five field, cumulative requested bytes fall from 24,480
to 8,376. The BF evaluator's inclusive allocation/reallocation counts fall
from 508/42 to 0/0, with unchanged call count. All eight split cases record
zero allocation and reallocation deltas in the BF evaluator, including both
evaluations on 46983. Dependency-prefix reduction still allocates, and
saturation retains its higher-precision exact-root proposal work. These are
checkpoint-accounted GMP operations, not all process allocations. Peak used
arena space is not RSS or a reduction in the configured arena capacity.
Zero new allocations also does not prove that every intermediate stays in
an inline machine word: existing FLINT pool entries may be reused.

This supplies concrete representation/allocation evidence behind the earlier
12.34% measured improvement. It does **not** apportion that time saving
between allocation, shorter arithmetic, and reduced precision-dependent
iteration. No new speedup is claimed from these instrumented runs.
Raw counter log hashes:

- Parent: `8de90e94174540dd48681ae245f7ff271097cf22b0fa570d4a1424da9f6bd97f`.
- Split32: `76603f465e5f79dc8e867db6ee70a3e56bff28baef880c679963e3c5fb2c8040`.

The retained controlled timing identifies the next field by an explicit
selection rule: first-effort accepted, native/PARI ratio above two, excess
above 0.5 ms, then increasing absolute field discriminant. This selects
**3.1.24364.3, $x^3-32x-92$**, with class number three, seven factor-base
ideals, and 2.570115 ms versus PARI's 1.125 ms. The 981 first-effort successes
account for 3119.988 ms native versus 1395.500 ms PARI; the 31 completed
retry cases account for 675.430 ms versus 59.750 ms. Thus first-effort
successes still contain most of the absolute remaining gap.

Read-only generated-JavaScript traces, each checked against all 64 native
survey words, show the same stopping sequence at parent64 and split32:
closures at raw relation counts 9 and 13 report missing units; the closure
at 22 succeeds. Its published compact relation count is 13, **not** the raw
22 relations collected. Comparing those two different counts would conceal
the overshoot.

The trace also snapshots the complete raw principal rows at each closure,
without mutating discovery state. An independent GP replay verifies the
maximal-order basis, every principal-ideal identity, and every raw-prefix
integer kernel. After `bnfcertify`, it expresses each kernel unit in the
certified fundamental-unit basis and takes the gcd of its exponents. Unit
index zero below means all such exponents are zero, i.e. only torsion; it
is not a finite index or a conclusion from a failed numerical root probe.

| Field | Raw prefix | Relation quotient order | Unit exponent gcd |
| --- | ---: | ---: | ---: |
| 24364 | 7 through 18 | 6 | 0 |
| 24364 | 19 through 22 | 3 | 1 |
| 42552 ($x^3+30x-48$) | 11 through 14 | 15 | 0 |
| 42552 | 15 through 24 | 5 | 1 |

For 42552, the current closures are at 11, 14, and 24. Both fields therefore
have an exact quotient change coincident with acquisition of the missing
fundamental unit, before the next scheduled closure. These GP checks audit
the captured mathematical data; they are not a formal proof, a native
internal trace, or the full independent Sage.js public certificate replay.
Snapshot hash: `333a3efc7ccf144d937a4e6909d67807fb85f7200c5c681c8d0add63fa1db511`.
Replay result hash: `0c1a1004c173c17cac79616abd4cb9ff592bcc7789767a2834bfe7a1ca7dec2b`.

The local PARI 2.17.4 trace on 24364 starts with 13 relations over seven
ideals, then requests one additional relation at a time. It uses successive
ideal-product searches and obtains its regulator at relation 16. Replaying
the 16 printed exponent vectors gives full rank at row 8, quotient order six
through row 15, and order three at row 16. This matrix replay does not check
the generators of PARI's printed relations, which that debug log does not
contain. The separate completed `bnfcertify` call confirms its final result.

The matching upstream `buch2.c` explains the adaptive search:
`small_norm` raises a multiplier prime ideal to an exponent determined by
the factor-base norm bound, multiplies it by each selected ideal, and runs
Fincke–Pohst enumeration there. The regulator-rank check includes an extra
archimedean direction, so the log's `1 < 2` is not a claim that a complex
cubic has unit rank two. Failed unit-rank or index checks lead back to
relation collection. Source SHA-256:
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`;
local GP binary SHA-256:
`10e2be10a4a64080a9eaab516db95459e71acc8f70b67aabbfcbf60fcbb18952`;
trace SHA-256:
`5456d5f679ceec4d19512cb02b881e336b4ab647080ea76a04218565062850ed`.

**Next experiment:** add an early certification opportunity on a strict
change of the resident exact full-rank relation lattice after a missing-unit
exit. Such a change is only a scheduling hint, never a correctness test:
the ordinary unit and analytic checks must still pass. Conversely, a new
unit can arise without a quotient change, so the original periodic checks
must remain. Preserve the proposal cursor and total budget, and do not let
an unsuccessful extra checkpoint consume a later recovery stage.

A caller-selected checkpoint ablation answers the prerequisite question:
the unchanged same-source certifier **does** accept the earlier prefixes.
`probe-earlier-closure.cjs LABEL COUNT` wraps the generated-JavaScript
collector, caps one requested target at the caller's count, and otherwise
executes the unchanged search and proof bodies. With targets 19 and 15,
respectively, both computations certify the correct class number and
invariants. On 24364 only the three unit-coordinate output words change,
by a simultaneous sign; on 42552 only the compact relation count changes,
from 16 to 14. This is an untimed diagnostic with externally selected
checkpoints, **not a general algorithm or source-native optimization**.
No field-specific checkpoint is proposed for production. Next implement the
resident event trigger and test coverage, resource usage, and performance
beyond these examples. No new production claim is made in this follow-up.

The new allocation instrumentation, strict log summarizer, ranking rule,
snapshot/replay programs, PARI debug trace, and outputs are retained beside
the precision campaign's existing evidence. No `opt` instrumentation or
additional controlled timing was used in this follow-up.

### Resident quotient-event checkpoint experiment

The next source-copy experiment implements that scheduling hint in ordinary
Python and compiles the complete program through the same canonical native
builder. It changes four bodies: the reduced-ideal ellipsoid collector, the
adjacent collector, the volume collector's returned budget, and the root
controller. No proof helper, analytic inequality, imported arithmetic,
public signature, owner allocation, or runtime capacity changes.

After a genuine missing-unit exit in the original adjacent-search regime
with at most eleven factor-base ideals, the collector may pause on a newly
admitted row whose existing exact online-HNF support flag is one. That flag
means the canonical relation lattice changed. The caller has already
established full rank, so a strict change lowers its positive integer index.
Consequently these extra event pauses cannot occur indefinitely: each proper
decrease divides the previous index and reduces it by at least a factor two.
This is a termination argument for extra checkpoints, **not** a proof of a
class number or of unit completeness. Ordinary certification remains the
only acceptance authority. Periodic checks stay in place because a new unit
need not change the relation quotient.

The leaf advances its proposal cursor before pausing. The adjacent and
volume collectors return their remaining proposal budget explicitly; the
root carries that budget across extra pauses instead of resetting it.
An unsuccessful extra checkpoint does not consume a recovery stage. The
larger initial-volume and expanded-shell regimes retain their existing
schedules; this experiment does not claim event scheduling there.

Control-flow review found and corrected one additional exhaustion edge:
if an event checkpoint fails and the adjacent traversal subsequently
exhausts, expanded-shell recovery must remain available even when no earlier
intermediate periodic checkpoint was inserted. The corrected source records
that an event checkpoint occurred and uses it in the existing exhaustion
transition. A negative-control test fails on the first candidate and passes
with this correction. Fatal computations still fail closed; their returned
cursor/budget is not resumable state.

Validation now includes:

- 1,296 cases executing the actual collector bodies with explicit arithmetic
  stubs, covering ellipsoid/shell cursors, zero/exhausted budgets, periodic
  targets, event positions, disabled events, and fatal online updates.
- 96 cases executing the actual root budget/pause statements, plus 48
  exhaustion-transition cases. These are control-flow tests, not mathematical
  ideal-arithmetic oracles.
- All 1,012 first-effort cases across native, GMP, JavaScript, and alternate
  FLINT linkage: 981 successes, zero errors, no gains or losses. The corrected
  candidate retains every output word and every recorded generated-JavaScript
  helper event from the first candidate on this corpus.
- All 20 fields whose published output differs from split32 have read-only
  relation snapshots, exact principal-ideal checks, every-prefix integer
  kernel replay, and certified GP fundamental-unit exponent checks. Their
  final kernel-unit exponent gcd is one. This is independent GP arithmetic
  on captured data, not full public Sage.js certificate replay.

The completed controlled runs use the same one-page FLINT, `opt` CPU zero,
three rotated rounds, two native calls per sample with retries inside the
clock, and eight fresh PARI `bnfinit` calls per sample. External scratch and
input packing are outside the clock. Both source variants finish all 1,012
fields correctly, with the same 31 retrying fields. Sums of per-field medians
in milliseconds:

| Run | Split32 parent | Event candidate | PARI |
| --- | ---: | ---: | ---: |
| Initial event experiment | 3856.760 | 3823.293 | 1459.625 |
| Corrected exhaustion transition | 3789.770 | 3753.545 | 1455.500 |

The corrected run's reduction is **0.96% overall**, and **17.95%** in the
20-field changed-output cohort (68.016 to 55.807 ms). That cohort is defined
by observed output changes, not a predeclared random performance sample.
This is a useful narrow improvement, not a broad PARI win: aggregate native
time remains about 2.58 times PARI.

| Field | Parent ms | Corrected event ms | PARI ms |
| --- | ---: | ---: | ---: |
| $x^3-32x-92$ | 2.662 | 2.431 | 1.125 |
| $x^3+30x-48$ | 3.249 | 2.306 | 1.125 |
| $x^3+9x-55$ | 1.266 | 1.308 | 1.000 |

A separate twelve-field paired run uses 21 alternating ABBA/BAAB rounds,
ten calls per sample, and 200 warmups per implementation and field. Its
median ratios of within-round mean wall times are **0.9179** and **0.6953**
for the two targeted fields; their 10th–90th percentile ranges lie below one.
The class-number-five ratio is 1.0028 (CPU 1.0003), with both ranges crossing
one. Thus this change does not improve that field; its noisy full-corpus
sample is not evidence of a systematic regression either. Quantiles are not
confidence intervals, and this panel is not a universal no-regression proof.

The holdout consists of 24 distinct field discriminants absent from the
frozen 1,012: scan $x^3+ax+c$ for $-42\leq a\leq-20$ and
$-130\leq c\leq-60$, retain the first irreducible complex fields with
nontrivial class number and $|D|\leq250000$, skipping repeated/existing
discriminants. PARI selects and certifies the fields **before** Sage.js is
run; no speed or Sage.js-success filter is applied. All 24 complete on their
first attempt in both variants, with all-output GMP/JavaScript agreement.
Controlled totals are parent 45.318 ms, corrected event 43.691 ms, and
PARI 26.000 ms, a **3.59%** aggregate reduction on this small neighboring
holdout. Only two published outputs change; both have independent exact GP
principal-row and kernel-unit replay:

| New field | Parent ms | Event ms | PARI ms |
| --- | ---: | ---: | ---: |
| $x^3-41x-124$, $D=-34867$ | 2.771 | 2.019 | 1.125 |
| $x^3-41x-122$, $D=-126184$ | 2.919 | 2.228 | 1.000 |

This is evidence of generalization, not a stratified large-discriminant
benchmark or proof that all neighboring inputs improve.

Corrected Python SHA-256:
`ad363e00797b312614898cce13b449e2dfab11601a4368360dd101984cd99c95`;
generated core SHA-256:
`7302024143fff53fc3caa9796f11f8a9da8dded53d961575fe4c5918ca8f90c8`.
Source is 490,031 bytes, +3,119 over its experimental parent. Path-normalized
generated core is 12,690,808 bytes, +65,229. Neither source-budget resolution
nor cross-platform/public-replay qualification is claimed. No allowance is
raised; PR203 remains draft and production source remains unchanged.

Raw timing hashes:

- Initial corpus: `93b569d1b2fb0f1497cae031b244bcf9b30ef282097480c2f9e3b6c6b7eea9d8`.
- Corrected corpus: `8ab5298d5c820a3f160b265064eff13e207438dad37dabfa2a06669c4bf73e05`.
- Corrected paired panel: `1bfd9da12057b30d808623d631ab63f6d1fee94efa32d777eef27d9370954063`.
- New neighboring fields: `4e8ae1ad3cacb543c4b0d0948a41c4648e5ea4a9dbbef373ca0de70babbf8454`.

All sources, generators, checks, manifests, snapshots, GP scripts and logs,
and raw timing outputs are retained under
`build/cubic-analytic-schedule-evidence/quotient-event/`; large reproducible
builds remain in `/scratch/sagejs-runtime/cubic-quotient-event-9hh9Nk/`.
The five focused tests, direct documentation check, diff check and parallel
contract check pass. The architecture rerun passes through native/Wasm
audits, then fails at the same stale optimizer-opportunity manifest recorded
above. That inventory is not refreshed to manufacture a passing gate.

**Remaining cost and next experiment.** Local diagnostic native profiles
use exclusive-clock accounting, 100 warmups and 1,000 measured calls, with
all 64 output words checked on all 1,100 calls. These are instrumented local
measurements, not `opt` timings. On 24364, three dependency LLL calls account
for about 0.291 ms; real-root isolation is called eight times (0.142 ms),
and 58 real-log evaluations take 0.154 ms. On 42552, the corresponding LLL
cost is 0.287 ms. Both cases compute dependency logs five times across
three closures. The main closure reduces dependencies before computing
high-precision logs, while the fallback raw-prefix helper already tries an
outward-rounded torsion certificate before LLL.

The next concrete opportunity is to test that cheap torsion screen earlier
when the compact prefix retains all raw relations. A successful screen could
avoid high-precision unit work on prefixes known to contain only torsion.
It must authenticate the kernel and log enclosures; a failed screen remains
inconclusive. When compaction drops raw rows, torsion of the compact subset
alone cannot justify skipping the raw-prefix unit recovery. Reuse the
existing mathematical criterion and measure the added work on successful
prefixes before claiming an improvement. This targets measured repeated
unit work rather than extrapolating more gains from the small event cohort.

## Early complete-prefix torsion screening: targeted gain, neutral aggregate

The next ablation implements the preceding proposal, based on corrected
quotient-event source `ad363e00797b312614898cce13b449e2dfab11601a4368360dd101984cd99c95`.
Only `_cubic_try_bounded_exact_closure` changes. Before dependency LLL it
copies the exact HNF kernel, computes coarse outward log intervals, and
tries the existing one-fifth torsion predicate. This is admitted only when
the compact prefix retains every raw relation and there is a nonempty
kernel. Success returns missing-unit phase 43/reason 434; no class-group
acceptance condition changes. Failed interval construction or an
inconclusive predicate falls through to the original work. Compacted
prefixes still have access to raw-prefix recovery.

The proof document now gives an elementary, unconditional derivation of
the [one-fifth torsion criterion](complex-cubic-native-class-group-proof.md#an-elementary-torsion-screen-for-relation-kernels).
It also states the caller's principal-equality, complete-kernel and interval
obligations. This is a written proof, **not** a Lean formalization or
independent verification of the complete implementation.

**Correctness and coverage.** Actual-source CPython tests cover 198
predicate/guard combinations and three invalid-domain cases. Another 20,481
actual-compactor cases check both payload matrices, row uniqueness and the
implication from count equality to complete retention (all support masks
and tail starts for zero through ten rows). The frozen
1,012-field first-effort survey retains 981 successes, zero errors and no
gains/losses. All 64 words match across native FLINT, GMP and generated
JavaScript, and across original/one-page FLINT linkage. Against the parent,
all successful outputs are identical. The only differing output is word 60
on the declined field `3.1.908491.1`: the shortcut no longer computes the
dependency coefficient-bit diagnostic for that failed attempt. Both
implementations also complete all 24 previously selected holdout fields
with three-backend agreement. Those fields are reused, not a fresh holdout.
The first-effort checks are not full-corpus independent certificate replay.

Read-only generated-JavaScript call traces preserve all 64 native output
words. Calls to `_cubic_reduce_dependency_prefix` fall from 1,130 to 975,
with fewer calls on 144 fields. These are helper-call counts, not a native
time profile or necessarily 155 LLL calls: the helper can return before
LLL when no dependency exists. On each of 24364 and 42552, three calls
with nonempty kernels become one. The new coarse checks certify torsion
at raw prefixes 9/13 and 11/14 respectively. The old exact GP prefix replay
already established torsion-only kernels at these prefixes. Across the new
trace, the predicate is called 590 times and succeeds 241 times, including
calls in the existing recovery helper; those totals must not be labeled
as new early exits.

**Controlled timing.** On the same isolated `opt` EPYC 7B13 VM, CPU 0,
using the same experimental one-page FLINT archive, the unchanged timing
driver runs three rotated rounds, two native calls per sample, eight fresh
PARI `bnfinit(f,0)` calls per sample, and retries `[5,1,7,8]` inside the native
clock. External packing/scratch and result checks are outside that clock.
All 1,012 results complete correctly; both native variants require retries
on the same 31 fields. Sums of per-field medians are:

| Implementation | Total ms |
| --- | ---: |
| Corrected quotient-event parent | 3826.253403 |
| Early torsion screen | 3815.6139965 |
| PARI | 1459.875 |

The aggregate difference is only **0.28%**, not persuasive evidence of a
broad speedup. Grouping by fewer dependency-helper calls in the first-effort
trace, the affected 144 fields total 342.513 to 321.655 ms (6.09% lower),
while the other 868 total 3483.740 to 3493.959 ms (0.29% higher). These are
whole-computation timings grouped by a trace property, not exclusive
attribution of time to that helper. The candidate remains about 2.61 times
PARI on this corpus.
Selected times are 2.542 to 2.100 ms on 24364 and 2.334 to 1.903 ms on 42552,
with PARI at 1.125 ms on each. A separate 21-round ABBA/BAAB test, 200 warmups
per implementation/field and ten calls per sample, gives median within-round
candidate/parent wall-time ratios 0.8550 and 0.7911 respectively. Their
10th–90th percentile ratios are 0.8425–0.8653 and 0.7763–0.8013 (not confidence
intervals). Several easy controls regress by roughly 1–3%; the h=5 seed's
paired median ratio is 1.0172, with range 0.9964–1.0468. Its full-corpus
sample happens to improve, illustrating why that isolated sample is not
the basis for a claim. The additional screen is not free on successful
prefixes. **Keep this unpromoted rather than roll it out unconditionally.**

**Identity, resources and reproduction.** Candidate Python is 491,684 bytes,
SHA `f2ad20f9f79113210b75ec3f97f530a279f1e28994408ef403041dc8982e9c41`.
Generated core SHA is
`5f1e83d230878fba2780458d874678b7f79a8dad2fef5345ab5e12f81f279a40`;
normalizing only the embedded source path gives 12,712,675 bytes, up 21,867
from the parent. Raw C byte lengths decrease because source-path strings
are shorter, not because generated mathematical code became smaller.
No resource or source cap is raised. The experimental source still exceeds
the unchanged production allowance before runtime dependencies are counted.

Sources, generators, raw surveys, backend/guard checks, traces, timing data,
manifests and summaries are retained under
`build/cubic-analytic-schedule-evidence/early-torsion/`. Reproducible large
builds are in `/scratch/sagejs-runtime/cubic-early-torsion-Ry6XLn/`.
`prepare.py` authenticates the parent and asserts that only the closure
function's AST changes; `check-screen.py` executes the actual new guard.
The canonical constant-indices builder and compiler lane are unchanged.
`prepare-harness.cjs`, `survey.cjs`, `relink.cjs`, `check-backends.cjs`,
`prepare-audits.cjs`, and `summarize-evidence.cjs` reproduce local checks.
`package.cjs` packages authenticated artifacts for the unchanged paired and
full timing drivers. On `opt`, `/tmp/cubic-early-torsion-PLo9T3/` retains
the timing bundle. The manifest's variant name `event` denotes the new
early-torsion candidate, and `parent` denotes the corrected quotient-event
implementation. Raw full timing SHA is
`c4e74e440ba6c9ec3def34eb098538cc89cee439e234e0122ac3d40013affb01`.
Five focused tests, direct docs check, diff check and parallel check pass.
`pnpm test:changed --base HEAD` also passes the merge and documentation gates
after a fresh 8m40s local build. That build reuses 41 production kernel
families; three native adapters and optional numerical Wasm reactors remain
absent, so it is not full runtime/platform qualification.
Architecture still stops at the previously recorded stale optimizer inventory;
neither that inventory nor release qualification is refreshed by this report.

**What this changes next.** The mathematical shortcut works, but paying for
another coarse log pass everywhere largely cancels its aggregate saving.
Investigate reuse of interval work or a general, measured admission rule,
without interpreting an inconclusive screen as proof of anything. Also
audit repeated presentation work: compact preparation computes HNF,
index verification computes SNF, and dependency extraction computes HNF
with a transform again. Sharing an authenticated HNF/transform, and using
its determinant for the index where justified, may remove work without
adding a speculative check to every easy field. This is a next experiment,
not an implemented or measured improvement.

**Next structural scheduling gap, independently replayed.** Applying the
previous selection rule (first-effort success, more than twice PARI and
over 0.5 ms slower, ordered by absolute discriminant) to this candidate's
frozen run selects `3.1.30772.1`, $x^3-x^2+5x-69$: 3.246 ms versus PARI
1.250 ms. The next is `3.1.41912.1`, $x^3-x^2+22x-14$: 2.862 versus 1.000 ms.
Read-only snapshots of every closure, with all 64 words matching the native
survey, were replayed using the same local PARI 2.17.4 executable as above.
`bnfcertify` succeeds, the maximal-order basis and every principal-ideal
row equality check exactly, and integer-kernel products are tested with
`bnfisunit` against the certified unit group at every prefix.

| Field | Actual closure rows | First decisive raw row | Exact prefix change |
| --- | --- | ---: | --- |
| 30772 | 13, then 32 | 14 | Quotient order 36 to 18; unit index already 1 |
| 41912 | 9, then 19 | 10 | Quotient order 12 to 6; unit index already 1 |

This is **missing class-relation evidence, not missing unit evidence**.
The event trigger's current missing-unit admission condition therefore
does not apply. A caller-selected generated-JavaScript checkpoint at 14/10
makes the unchanged certifier accept immediately, with only the compact
row count and the sign of the unit coordinates changing. These probes
are not a general algorithm or native performance evidence. Their source,
snapshots, GP scripts/logs and full outputs are in `prepare-next.cjs`,
`capture-next.cjs`, `replay-next.cjs`, `next-prefix.json`, `next-replay.json`,
`probe-next.cjs`, `probe-30772.json` and `probe-41912.json` in the evidence
directory. Snapshot SHA is
`621a6e8cf197ab62703ce9bd6736f4d9aef5bcfb2772d58d5b5728a432846024`.

Seeded PARI 2.17.4 `bnf` debug-level-5 forensics on 30772 use ten factor-base
ideals and close at the initial batch of sixteen relations, with class
number 18 and regulator approximately 3.812061594. Exact HNF replay of the
printed exponent matrices gives quotient order 36 at prefixes 10 through
15, then 18 at 16. This is matrix replay only: the PARI log does not publish
the principal generators. Its relation stream is not Sage.js's stream.
The local instrumented/debug run is not timing evidence. `pari-next.gp`,
`pari-next.log`, `replay-pari-matrix.cjs`, and `pari-matrix.json` retain the
experiment; the log SHA is
`99c3251c15a351cb7a0db0d44a1d7725f8d8da2f3bc351d4d7c39730ce34fd37`.

The higher-priority next mathematical experiment is to generalize the
resident quotient-change trigger to explicitly valid but insufficient
analytic-index exits, not only missing-unit exits. It must preserve exact
acceptance, periodic checkpoints, remaining budgets and expanded recovery,
and must never turn invalid intervals or resource errors into permission
to resume. The two discovered row numbers are diagnostic witnesses only,
not inputs to the proposed scheduling rule.

## Quotient events after analytic insufficiency

The next source-copy experiment generalizes event admission to the existing
`_cubic_can_resume_bounded_search` predicate. It starts from corrected
quotient-event source `ad363e00797b312614898cce13b449e2dfab11601a4368360dd101984cd99c95`,
**without** the preceding torsion-screen ablation. Only the root function's
AST changes: remove the redundant missing-unit-only restriction from the
event gate and retain the existing resume predicate, factor-count envelope
and periodic-checkpoint exclusion. No certifier, collector, interval,
resource limit or mathematical acceptance condition changes.

The predicate admits phase 43/reason 434 missing-unit evidence, or phase 8
with positive scale and an explicitly revalidated, insufficient analytic
index enclosure. Nonzero statuses, invalid or contradictory analytic
intervals and resource failures do not authorize resumption. The phase-8
reason word may refer to an earlier unit operation and is not an exit tag.
Exact quotient changes request another proof, never confer acceptance.
Periodic checks remain because a better unit can appear without a quotient
change. Proposal budgets, advanced cursors, and the previously corrected
event-exhaustion transition are unchanged. Within a fixed full-rank
relation stream, each strict lattice enlargement strictly decreases its
positive integer index; there cannot be infinitely many such event pauses.
Existing row/proposal limits continue to bound work between them.

**Checks.** The actual classifier, resume predicate and gate pass 7,290
combinations, including exact endpoint boundaries, missing-unit exits,
contradictory index-one enclosures, zero/negative scales, error/success
statuses, and factor counts inside/outside the admitted envelope. The
inherited actual-body collector tests still pass 1,296 cursor/budget cases,
96 stage cases and 48 exhaustion cases. These control-flow tests use
explicit arithmetic stubs and do not prove the ideal arithmetic.

The frozen 1,012-field survey retains 981 first-effort successes with no
errors, gains or losses. All 64 output words match across native FLINT,
GMP, generated JavaScript, and original/one-page FLINT linkage. Twenty
successful presentations change: only the compact row count and sometimes
the sign of the unit coordinates differ. Independent GP replay checks
the maximal-order basis, every retained principal-ideal equality and
integer-kernel units on all twenty; `bnfcertify` passes and the final
kernel-unit exponent gcd is one in every case. This is exact diagnostic
replay, not full-corpus public Sage.js certificate replay or Lean verification.

Read-only generated-JavaScript traces agree with all 64 native output words.
On 30772, the actual general collector now pauses at raw row 14 after the
failed row-13 closure; on 41912 it pauses at 10 after 9. There are no
field-specific row targets. Thirty-two fields have changed call traces,
but in these first-effort traces every field has the same number of closure calls as its parent:
the useful calls happen sooner, rather than adding more proof attempts.
The trace count includes changed event flags that do not change a result.

**Controlled `opt` measurements.** The same CPU-0 EPYC 7B13 protocol runs
three rotated rounds, two native calls per sample with `[5,1,7,8]` retries
inside the clock, eight fresh PARI `bnfinit(f,0)` calls per sample, and one
warmup. External packing/scratch and successful-result checks stay outside
the clock. Both variants complete all 1,012 correctly, with the same 31
fields requiring retries. Sums of per-field medians:

| Cohort | Parent ms | Generalized event ms | PARI ms |
| --- | ---: | ---: | ---: |
| All 1,012 fields | 3806.8593705 | 3795.6300305 | 1457.000 |
| Twenty changed presentations | 68.484737 | 50.9960095 | 24.000 |
| Other 992 fields | 3738.3746335 | 3744.634021 | 1433.000 |

This is **25.54% faster on the changed cohort**, but only **0.295% overall**;
the latter is too small to establish a broad speedup. The full candidate
remains about 2.61 times PARI. Selected full-run times are 3.275 to 2.383 ms
on 30772 (PARI 1.250 ms), and 2.765 to 1.871 ms on 41912 (PARI 1.000 ms).
Neither is a PARI win yet.

A separate 21-round ABBA/BAAB comparison, 200 warmups per field/implementation
and ten calls per sample, gives candidate/parent median within-round wall
ratios 0.7464 (30772), 0.6807 (41912), and 0.8352 (46983). Their 10th–90th
percentile ratios are 0.7314–0.7580, 0.6716–0.6873, and 0.8220–0.8517;
these are not confidence intervals. The nine other controls have median
ratios approximately 0.995–1.007, with ranges crossing one. In particular
the h=5 seed is neutral at 0.9987, despite its noisier full-run sample.

**Fresh neighboring holdout.** Before Sage.js execution, PARI selects the
first 24 irreducible complex cubics $x^3-x^2+ax+c$, scanning
$a=0,\ldots,15$ and $c=-100,\ldots,-40$, with nontrivial class number and
$|D|\leq250000$. Require distinct field discriminants absent from the frozen
1,012 and prior 24-field holdout; do not filter by Sage.js speed or success.
All 24 complete on the first effort for both variants and pass three-backend
agreement and certified PARI comparison. Three changed presentations also
pass exact principal-row/kernel-unit replay. The identical timing protocol
gives 46.108962 to 43.9109205 ms, versus PARI 27.875 ms: **4.77% improvement**
on this new cohort. The affected fields are 29447 (3.011 to 2.312 ms),
57224 (3.514 to 2.477 ms), and 136391 (2.850 to 2.517 ms). This holdout
supports a narrow general scheduling improvement, not a claim that every
neighbor improves or that the corpus-wide frontier is competitive.

**Resources and provenance.** Candidate source is 490,170 bytes (+139,
including explanatory comments), SHA
`efcb69dfdf83f3381654162b4834375219fa1b5b122b21258176b4c3b09f7dc7`.
Core SHA is `513e368cc36a7e8dceb55b449068e8a6d6e67db38aab8bfcbb700aaa83f6d415`.
After normalizing only embedded source paths, generated C falls by 7,020
bytes to 12,683,788; raw path-dependent lengths are not a code-size saving.
No compiler/FFI implementation or source allowance changes. The experimental
source still exceeds the unchanged production allowance, so this is not
promoted and PR203 remains draft.

Evidence is retained under `build/cubic-analytic-schedule-evidence/index-event/`;
large reproducible builds remain in
`/scratch/sagejs-runtime/cubic-index-event-M0Mrzs/`. `prepare.py` authenticates
the parent and verifies the one-function AST delta. `check-admission.py`
and the inherited `check-control.py` reproduce control checks. Harness,
survey, backend, linkage, replay and holdout generators are retained with
the raw outputs. `package.cjs` produces the authenticated timing bundle;
its historical variant name `event` denotes this index-event candidate,
and `parent` denotes corrected missing-unit-only quotient events. The
remote bundle is `/tmp/cubic-index-event-8URvpT/`. Raw full timing SHA is
`e09a5a3378b0180f2b488c3b5ce601322d7693e9eebe04d94f2e4ac029b681ca`;
paired timing SHA is
`71be55c82d1ff32c262639ee4faa677291178a6964a018ecab7c938e467e0429`;
holdout timing SHA is
`027449826f306126f1d7f7fa811f98735b0eb318c120d3b8f38145091814b4bb`.

**Next cost: retain certification work, not just collection state.** Local
native profiles use diagnostic-only generated-C instrumentation, exclusive
clock accounting and 1,100 calls per field (100 discarded warmups), with
all 64 output words checked throughout. They are not controlled timing.
The 30772 and 41912 computations each build/evaluate the BF plan twice,
materialize a dependency unit twice, and saturate twice. BF plan preparation
totals about 0.314/0.299 ms respectively; evaluation totals 0.221/0.216 ms
inclusive of its finite-sum and interval helpers. Root isolation is called
ten times in each computation. The final h=5 control needs only one BF pass.
This identifies repeated certification work after the collection gap closes.

Reusing that work needs a representation change, not merely a cache flag.
The BF value table currently stores the changing class-number candidate
at header index 4, and `_cubic_bf_value_index` deliberately deduplicates
prime-power norms against all five header values. Thus a term can share
the candidate's slot. Eleven actual-source lookup tests in
`check-plan-alias.py` demonstrate that overwriting slot 4 can invalidate
an existing norm reference. The derived log-class endpoints also change
when the quotient changes. Separate immutable field/threshold/precision
residue data from the changing log-class contribution before reusing it.
Likewise, retain only authenticated unit data, and allow discovery/saturation
to improve the unit when reusing it does not certify index one. These are
next implementation obligations, not claims of an implemented cache.

An additional first-effort trace records 915 BF evaluations over the 1,012
fields. Eighty-seven fields evaluate more than once, accounting for 98
evaluations after a field's first. Fifty-six of these repeat exactly the
first residue/tail outputs at the same scale. The remaining evaluations
require inspection of threshold/refinement transitions; equal field identity
alone is not a sufficient cache key. The two targets repeat identical
residue bounds while their class candidates change from 36 to 18 and
12 to 6 respectively. All 64 output words still agree with the native
survey. `analytic-trace.cjs` and `analytic-trace.json` retain this diagnostic.

Five focused analytic-schedule tests pass. The architecture rerun still
stops at the previously recorded stale optimizer-opportunity inventory;
it is not refreshed by this experiment. Full public replay and platform
qualification remain open. The changed-files merge/documentation gate passes
after its fresh local build completes in 8m30s.

## Resident field-residue experiment

The next source-copy candidate separates the changing class candidate from
the immutable BF norm table and retains one successful BF enclosure in the
existing root-owned proof workspace. This experiment starts from the
index-event source above, not from the early torsion-screen ablation.

**Mathematical and storage argument.** For fixed field $K$, threshold $X$
and precision, the computed enclosure $Z_K$ of
$\log\operatorname{Res}_{s=1}\zeta_K(s)$ does not depend on the current
relation quotient order $H$ or unit-subgroup regulator $R'$. The certification
formula remains

$$
\log H+\log R'+\log(2\pi)-\tfrac12\log|D_K|-Z_K.
$$

Under the previously stated hypotheses, this encloses the logarithm of the
positive integral joint index. Reusing $Z_K$ changes neither that identity
nor its acceptance test. It does not justify retaining an obsolete
$\log H$, assuming a unit is fundamental, or weakening the analytic bound.

The root authenticates the field/order before constructing the proof
workspace, and does not change that field during its lifetime. A new
zero-initialized, arena-owned $1\times9$ exact matrix stores readiness,
threshold, scale, term/value counts, residue endpoints, tail bound and last
class candidate. A successful initial evaluation publishes readiness last.
A changed threshold or scale clears readiness and rebuilds; failed
preparation/evaluation never publishes a new cache. This is a single-entry
cache, so refinement can evict the initial-threshold plan. Nothing survives
the root call or escapes its arena.

`_cubic_bf_value_index` now excludes header slot 4 from norm lookup. The
sorted norm tail and every finite-sum reference therefore remain independent
of the class candidate. A cache hit updates the class value and obtains new
outward log-class endpoints when $H$ changes; all field endpoints stay live.
The unused square-root endpoints of slot 4 are not refreshed: no norm term
can reference that slot, and the index formula reads only its logarithm.
The private workspace contract is essential: no other operation may mutate
the retained plan/endpoints. Unit discovery, saturation, checkpoint scheduling,
publication and final classification remain unchanged.

**Checks and observed work.** The actual-source lookup passes 22,350 norm
queries, including header collisions, followed by mutation of the class
slot without invalidating any norm reference. Actual cache-body tests cover
hits, misses, class changes, threshold/scale changes, failed preparation,
failed evaluation, failed log updates, retries, invalid scalar inputs and
a fresh root. Those transition tests stub arithmetic and are not a proof
of the interval or ideal calculations.

All 1,012 first-effort fields agree across native FLINT, GMP and generated
JavaScript, including all 64 output words and original/one-page linkage.
The candidate retains 981 successes, with no errors, gains or losses.
Relative to its parent, 216 fields increase only output word 38 (value
count) by one, reflecting the removed alias. Every other output word,
including all unit coordinates and analytic endpoints, is identical.
The existing 24-field holdout also passes three-backend agreement and
certified PARI answer comparison; it is a reused regression cohort here,
not another newly selected holdout.

Read-only same-source traces count 859 BF preparations/evaluations instead
of 915: 56 evaluations disappear across 45 fields. The 954 closure calls
and 873 saturation calls are unchanged. Both target fields use one BF
evaluation instead of two. Independent GP replay on their actual retained
prefixes again checks the principal equalities and integer-kernel units;
the final quotient orders are 18 and 6 with unit exponent gcd one. This
is not full public Sage.js certificate replay or formal verification.

**Controlled `opt` timings.** Use the same one-page FLINT archive, CPU-0
host, three rotated rounds, fresh PARI calls and `[5,1,7,8]` timed retry
schedule as above. The full corpus completes for both variants, with the
same 31 retry fields. Sums of per-field medians:

| Cohort | Index-event parent ms | Residue cache ms | PARI ms |
| --- | ---: | ---: | ---: |
| All 1,012 | 3732.189699 | 3701.215377 | 1445.875 |
| 45 fields with fewer BF evaluations | 186.598773 | 170.718968 | 62.125 |
| Reused 24-field holdout | 43.3303655 | 42.2271825 | 27.750 |

The full difference is only 0.83%; the candidate remains about 2.56 times
PARI overall. The affected cohort improves 8.51% and the reused holdout
2.55%. The two target times are 2.356 to 2.069 ms (30772, PARI 1.250 ms)
and 1.874 to 1.606 ms (41912, PARI 1.000 ms). A separate 21-round ABBA/BAAB
comparison corroborates the gains: candidate/parent median within-round
ratios 0.8785 and 0.8562, with 10th–90th percentiles 0.8699–0.8912 and
0.8420–0.8657. These quantiles are not confidence intervals. The 46983
ratio is 0.9006; the other nine controls have ranges crossing one. The
original h=5 seed is neutral at 0.9993. No new PARI-win claim follows.

**Resources and reproduction.** Source is 492,976 bytes, SHA
`17fa66c5ed80c37cd17c775ee2358d4a96ff9409d59f3cac6443179ee33f3f5e`.
Relative to its parent this adds 2,806 source bytes and 119,526 path-normalized
generated-C bytes (total 12,803,314). Core SHA is
`80c89b6c8529926f71963dd983a5415cf8884b92cb3f55335e25de73266fb661`;
one-page addon SHA is
`f994debd67ce0b0d5d7a5aede6da9a8afac345551acc1a9f3d201f1ebc31faaf`.
The extra matrix and possible extra norm value consume existing budgets;
no capacity, precision or source allowance is increased. The possible extra
norm value could cause a guarded decline outside the tested corpus, so
coverage is not claimed universally unchanged.

Small evidence and generation scripts are retained under
`build/cubic-analytic-schedule-evidence/residue-cache/`; large builds remain
at `/scratch/sagejs-runtime/cubic-residue-cache-C7Kcw3/`. `prepare.py`
authenticates and transforms the parent source; `check-cache.py` exercises
the actual helper bodies. `prepare-harness.cjs`, survey/backend/linkage
checks, trace, GP replay, holdout checks, packaging and summaries reproduce
the experiments. The controlled bundle is `/tmp/cubic-residue-cache-pKZLGj/`
on `opt`; its historical `event` name denotes this cache candidate and
`parent` denotes index-event. Raw timing hashes are
`38edbcfc07e68aed70c31fc0115d3d259aba43e80322e4012e34f60851bec7f5`
(full), `455252a28a34119f4a82ac8649dd577729b934d147502adfbc0df4e4e3f1d9a9`
(paired), and `b17dd409c9a420b77bab3b757229385cdbcd6d890218f12b2016afb88ccc614e`
(holdout). These are private-entry measurements, not public API timings.

This remains unpromoted. Architecture checking still stops at the known
stale optimizer inventory. Source consolidation, full public receipts/replay
and platform qualification remain necessary; PR203 stays draft. Five focused
analytic-schedule tests, the cache-transition check, direct documentation
checking, diff checking and parallel-contract checking pass. These checks
do not substitute for the missing release qualification. The next
remaining repeated work is unit certification: retain authenticated unit
evidence without preventing discovery/saturation of a better unit when the
joint index remains insufficient. Single-closure cases need a separate
optimization; caching cannot remove their first computation.

The same trace contains 56 saturation calls after a field's first. Thirty-two
repeat the unit-coordinate, regulator and auxiliary-log result prefix exactly;
24 differ. A difference may be presentation rather than a better unit, so
these are not 24 proved unit improvements. This distinction must be resolved
before caching units: unlike the field residue, the available unit evidence
can legitimately change as relations arrive.

## Retained-unit-first certification experiment

The next source copy adds a bounded two-pass unit policy to the resident
BF-cache parent. Every invocation first checks the current exact class
presentation as before. If a unit was authenticated earlier in this same
root call at the same scale, try that unit with the current class quotient.
If its certification is valid but insufficient, perform the original fresh
dependency/unit discovery on the **same prefix**, then certify again.
Invalid evidence returns an error immediately. At most one retained pass
and one fresh pass are possible; an insufficient retained unit alone never
requests more relations or establishes primitivity.

An additional zero-initialized, arena-owned $1\times7$ exact matrix retains
readiness, scale, three order coordinates and regulator endpoints. The
state is published only after exact unit construction/root replay and a
valid analytic classification. It is private to the immutable field/order
and cannot survive the root. A unit need not belong to the dependency
lattice of the latest compact rows: the mathematical index argument needs
an actual non-torsion unit of the maximal order. The existing detached
certificate publishes order coordinates, and its independent verifier
checks unit norm directly. No mathematical acceptance inequality changes.

The first two source drafts expose useful compiler boundaries. A borrowed
resource alias cannot be defined conditionally; its binding is invariant
and is now outside the loop. The definite-assignment check also rejects
publishing loop-local analytic values after a potentially empty loop.
Publication now belongs to the successful pass, with a fail-closed return
after the loop. No dummy initialization, compiler exception, host callback
or shared compiler change was introduced. Failed drafts/build logs remain
as diagnostics; only `unit-reuse-closed.py` is measured.

**Correctness and recovery evidence.** Seventy-two actual-loop control
cases cover readiness/scale selection, retained/fresh statuses and failed
publication. The mathematical operations are explicit stubs in this test;
it proves the bounded control transitions, not unit arithmetic. The full
first-effort survey retains 981 successes on 1,012 fields with no errors,
gains or losses. Native FLINT, GMP, generated JavaScript and both linkages
agree on all 64 words. Relative to the parent, only the signs of all three
unit coordinates change on 17 fields. All class-group, relation-count,
regulator and analytic-interval outputs are otherwise identical. The reused
24-field holdout passes both variants on their first efforts in all three
backends.

Independent GP replay checks the actual principal rows and all prefix
kernel units for those 17 fields plus the two targets. It additionally
checks each published unit's exact norm and its exponent relative to a
`bnfcertify`-certified fundamental unit; all 19 have absolute exponent one.
This is independent diagnostic replay, not full public Sage.js replay.

The same-source trace keeps 859 BF evaluations and 954 closure calls, but
adds 15 saturation calls on 11 fields where retained evidence is
insufficient. Four of those calls need genuinely better units on the
fresh pass. Exact independent replay authenticates the maximal-order basis,
both units, their unit indices, and $u=\pm v^e$:

| Field label | Raw prefix | Class number | Retained unit index $e$ | Fresh unit index |
| --- | ---: | ---: | ---: | ---: |
| 3.1.750412.1 | 37 | 4 | 2 | 1 |
| 3.1.3294660.1 | 26 | 17 | 2 | 1 |
| 3.1.4689300.1 | 33 | 3 | 2 | 1 |
| 3.1.23088780.1 | 38 | 9 | 4 | 1 |

The retained pass cannot certify these prefixes; fresh discovery does.
Thus a failed bounded root proposal cannot justify treating the retained
unit as fundamental or permanently skipping new unit discovery.

**Controlled measurements.** The same CPU-0 `opt` host and one-page FLINT
archive run paired and full comparisons serially, with the previously
specified warmups, rotated rounds and timed retry policy. All 1,012
complete for both variants with the same 31 retry fields. Sums of medians
are 3738.3631035 ms (residue-cache parent), 3721.9543185 ms (unit reuse),
and 1454.875 ms (PARI). This is only 0.44% overall and still about 2.56
times PARI, not a broad competitive-frontier win.

The 30772 target improves from 2.053 to 1.777 ms (PARI 1.250), and 41912
from 1.655 to 1.514 ms (PARI 1.000). Paired candidate/parent median
within-round ratios are 0.8526 and 0.9067, with 10th–90th percentiles
0.8375–0.8705 and 0.8871–0.9394. Field 46983 improves to ratio 0.8156.
Other controls' ranges cross one, including the h=5 seed; these quantiles
are not confidence intervals. The reused holdout totals improve from
43.428890 to 41.9296325 ms, versus PARI 28.250 ms, a 3.45% difference.

**Resources and reproducibility.** Measured source SHA is
`73130c1212f7a1900e24fa600f07a957588798084b0b3c5982b811fc2811886d`
(497,242 bytes, +4,266 including reindentation). Path-normalized generated
C increases by 72,491 bytes to 12,875,805; core SHA is
`37c66121d333d1d17663c3e61048bd4c176b64f9ebe839263df72c52d17b1af2`.
One-page addon SHA is
`a7882aa69d23122cb839b1e48749478854fa80546a6fea84ce09e1bb00537eeb`.
No resource, precision or source allowance is increased. Extra live unit
coordinates consume the existing arena budget; universal unchanged resource
coverage is not claimed from this corpus.

Small evidence is retained under
`build/cubic-analytic-schedule-evidence/unit-reuse/`, with large builds in
`/scratch/sagejs-runtime/cubic-unit-reuse-1GQ8OG/`. Source generation,
actual-loop checks, backend/linkage comparisons, trace, prefix/public-unit
replay, recovery-case selection/replay, holdout, profiles and summaries are
retained. `prepare.py` authenticates the parent. The controlled bundle is
`/tmp/cubic-unit-reuse-6UBmyk/` on `opt`; historical `event` means retained
unit and `parent` means residue cache. Raw timing hashes are
`5e9d355a06d0b80103bdb65999e388330beaeb4420ecb9f71a21a74863ddf995`
(full), `e6ec2ed3866d1ae2dbea244bfa7e12ea4d0e0992023034a717a94e3e37ab0e42`
(paired), and `b31c9c3500c53e97e94846670ed3ec7580e4a6726cba86f66a054cd028eef7b4`
(holdout). These are private-entry, not public-API measurements.

Focused tests and control checks pass; architecture still stops at the
known stale optimizer inventory. Source consolidation, full public replay
and platform qualification remain open. PR203 remains draft and neither
cache experiment is promoted.

### Next root-search opportunity: exact local power obstructions

Diagnostic-only local native profiles (1,100 calls, 100 discarded, all
64 words checked) now show only one dependency reduction, log-fill and
materialization per target. Seven root-isolation calls and two saturation
calls remain. Saturation costs about 0.129/0.118 ms inclusive on 30772/41912;
these instrumented numbers are not controlled timings. Initial BF
preparation still costs about 0.158/0.151 ms, field analysis 0.164/0.156 ms,
and generator-bound tests make eight calls. Inclusive costs must not be
summed with their children.

Exact GP forensics identifies a potentially cheaper way to avoid impossible
root searches. If $\phi:\mathcal O_K\to\mathbf F_q$ is a unital ring map,
$p\mid q-1$, and a unit satisfies $u=v^p$, then
$\phi(u)^{(q-1)/p}=1$. A non-one result therefore excludes a $p$th root.
For odd $p$, $-1=(-1)^p$ also excludes a root of $-u$. For $p=2$, taking
$q\equiv1\pmod4$ makes $-1$ a square in the residue field, so the same
obstruction excludes both torsion translates. This is an unconditional
necessary-condition argument, not a GRH bound or a proof of primitivity.

The published target units have the following exact degree-one residue
obstructions, independently computed after maximal-order basis and unit
norm checks:

| Field | Root exponent $p$ | Residue prime $q$ | $\phi(u)$ | $\phi(u)^{(q-1)/p}$ |
| --- | ---: | ---: | ---: | ---: |
| 30772 | 2 | 5 | 3 | 4 |
| 30772 | 3 | 13 | 11 | 3 |
| 30772 | 5 | 11 | 6 | 3 |
| 41912 | 2 | 5 | 2 | 4 |
| 41912 | 3 | 19 | 3 | 7 |
| 41912 | 5 | 31 | 28 | 16 |

All final-column entries differ from one, excluding the corresponding
searches. `local-power-forensics.cjs` and generated GP files retain these
witnesses. No native power screen or speed claim is made yet. A general
implementation must authenticate its residue maps, treat absence of an
obstruction as inconclusive, preserve exact replay for roots it does find,
and retain fresh-unit recovery. These conditions let a cheap finite-field
calculation remove work without interpreting a failed proposal as a theorem.

### Implemented local-power screen: exact exclusions before root proposals

The next unpromoted source copy implements the preceding residue-map argument
in ordinary typed Python. It does not dispatch on field names, coefficients,
discriminants or expected answers. Evidence is retained under
`build/cubic-analytic-schedule-evidence/local-powers/`; build/cache objects remain
at `/scratch/sagejs-runtime/cubic-local-powers-Nwtc5Y`. The parent is the
retained-unit-first source above, not the separate early-torsion ablation.

The screen runs only when the existing analytic index check is valid but
insufficient. It tries proven odd primes $q\leq97$, skipping primes dividing
the certified basis denominator $d$. It enumerates roots of the defining
monic cubic modulo $q$ and evaluates the already authenticated unit there.
All residue arithmetic is bounded machine-integer arithmetic; reductions of
the input coefficients and unit coordinates remain exact. Primality is checked
by trial division, not assumed from a candidate list. The bound 97 limits
optional work and is not a mathematical acceptance bound.

Here is the map justification, including the nonmonogenic case. If $\alpha$
is the defining root and the certified integral basis has coordinates with
common denominator $d$, then
$\mathcal O_K\subseteq\mathbb Z[\alpha,1/d]$. For $q\nmid d$ and
$f(r)=0\pmod q$, evaluation $\alpha\mapsto r$, $1/d\mapsto d^{-1}$ gives
a unital homomorphism on the localization, hence on $\mathcal O_K$.
Consequently a unit has nonzero image. A zero image is reported as a failure
of the authenticated premises, never as evidence that the unit is not a power.
No unramifiedness assumption is needed for this implication. The preceding
Fermat-power test then excludes $p$th roots of both signs, with the stated
$q\equiv1\pmod4$ restriction for $p=2$.

One set of exclusions is retained through the bounded saturation loop. This
is valid: if an exact root replacement gives $u=\pm v^k$, and
$v=\pm w^p$, then $u$ is itself a $p$th power up to sign, contradicting any
previous obstruction. Thus a proven exclusion cannot become invalid after
an authenticated replacement. Absence of an obstruction remains inconclusive.
The original numerical proposals, exact root replay, replacement limit,
analytic inequalities, and fresh-unit recovery remain in force.
This screen does **not** certify a fundamental unit or replace the joint
class/unit-index argument. It introduces no GRH assumption of its own.

The actual-source CPython checks cover 66,850 modular powers against `pow`,
2,916 signed proper-power examples in cubic quotient rings, and 1,296 signed
root replacements preserving exclusions. A redundant denominator and a
nontrivial triangular basis exercise modular evaluation in basis coordinates.
Both target units and both signs are excluded for $p=2,3,5$.
Invalid denominators and zero images fail; torsion units are inconclusive.
A negative control deliberately removes the torsion-safe square restriction:
it incorrectly excludes $-1$, and the test detects that error. These are
actual-body tests, not a formal verification of the helper or compiler.

All 1,012 first-effort outputs match the parent in **every one of the 64
words**: 981 successes, no errors, gains, losses or changed outputs. FLINT,
GMP, JavaScript and the experimental one-page FLINT linkage agree. All 24
reused holdout fields also agree in every word and accept at first effort;
this is not a newly selected holdout. Independent certified GP replay checks
the principal rows, prefix kernel units and published fundamental units for
the two targets. The four necessary fresh-unit recoveries from the preceding
section replay exactly, with retained indices $2,2,2,4$ becoming $1$.
This is not full-corpus independent public Sage.js certificate replay.

Read-only same-source JavaScript tracing, checked against native output,
finds 134 screen calls across 108 fields. It returns exclusions for all three
powers 113 times, only cube/fifth exclusions 19 times, and only square/fifth
exclusions twice. The resulting proposal counts are:

| Operation | Retained-unit parent | Local screen |
| --- | ---: | ---: |
| Square-root proposals | 134 | 19 |
| Cube-root proposals | 125 | 2 |
| Fifth-root proposals | 125 | 0 |
| Successful exact root extractions | 9 | 9 |
| Analytic saturation calls | 888 | 888 |
| BF evaluations | 859 | 859 |
| Closure calls | 954 | 954 |

All nine successful roots have identical field, operation and coordinates.
Both targets replace their three unsuccessful root proposals with one screen.
Diagnostic local native profiles show screen costs of approximately 0.00164
and 0.00234 ms, with four real-root-isolation calls instead of seven. Inclusive
saturation costs are about 0.0122/0.0134 ms. These instrumented profiles are
not controlled performance evidence, and inclusive parent/child costs must
not be added. A missing `node-gyp` lookup and then missing dynamic FLINT
module path initially prevented profiling; the unchanged instrumented source
was built with the explicit local node-gyp path and run with the compiler
worktree's `NODE_PATH`. The final three profile runs pass full-output parity.

Controlled uninstrumented timing ran serially on `opt`, CPU 0, AMD EPYC 7B13,
host `cocalc-vm-8d993f531c1249b28aff31a2`, under
`/tmp/cubic-local-powers-FqrvPX`. Both implementations use the same experimental
one-page FLINT archive. The full corpus uses three rotated rounds, two native
calls per sample with retries $[5,1,7,8]$ inside the clock, eight fresh
`bnfinit(f,0)` calls per PARI sample, and one warmup. External argument packing,
scratch preparation and result checking are outside the clock.

| Workload | Parent ms | Local-screen ms | PARI ms |
| --- | ---: | ---: | ---: |
| 30772 | 1.85105 | 1.70163 | 1.25000 |
| 41912 | 1.53083 | 1.41102 | 1.00000 |
| $x^3+9x-55$ | 1.33792 | 1.36358 | 1.12500 |
| Frozen 1,012, sum of field medians | 3838.91265 | 3771.23305 | 1476.12500 |
| Reused 24, sum of field medians | 44.05865 | 43.32511 | 28.12500 |

All full computations finish correctly; the same 31 fields need retries.
Aggregate differences are 1.76% on the frozen corpus and 1.66% on the reused
holdout, still about 2.55 times PARI on the full corpus. The separately paired
21-round ABBA/BAAB run (200 warmups per implementation/field, ten calls per
sample) gives median local/parent ratios 0.92647 for 30772, 0.91036 for 41912,
and 0.93114 for 46983. Their empirical 10th–90th percentile ranges are
0.90368–0.94149, 0.87875–0.93143 and 0.89606–0.95747. The other nine paired
fields' ranges include one; in particular the class-number-five example has
no resolved speed change. Quantiles are not confidence intervals. The 108
screened fields' full-run sum falls 839.56305 to 796.80362 ms, but unscreened
fields also move by 0.83%, so do not attribute every aggregate difference to
the screen. These are private-entry measurements, not public API timings.

`prepare.py`, `prepare-harness.cjs`, `check-screen.py`, `survey.cjs`,
`check-backends.cjs`, `trace.cjs`, `trace-parent.cjs`, `capture-prefix.cjs`,
`replay-prefix.cjs`, the recovery scripts, `relink.cjs`, `package.cjs`, and
the timing/summary drivers retain the reproduction path. `summary.json`
asserts full parent parity, preservation of all successful roots and holdout
parity; it records the exact sources, cores, checks and raw timing hashes.
The generated source is 502,789 bytes, SHA-256
`812c2da3f7be7354c2014ddbfad531f7c5cacdc560608d1052d56ccce5fe7d17`,
an increase of 5,547 bytes. Path-normalized generated C grows from 12,875,805
to 13,057,822 bytes; the raw core SHA-256 is
`f277563f7f6990254f3a3400f7852da540277cc5ed99ee7d1983fc47a7259e53`.
The source allowance remains unchanged; this experiment is not promoted.
Timing SHA-256 hashes are
`aaf4e2ae44c2333ebb88cd6444ee9c6b7a6378300ec527ad7e0c04e1dc6418ce`
(full), `47285ffb813510178ff9c98e5d175c114aca48bba472d6e176420abfbf1ba6d3`
(paired), and `e8dcd7d142602e35f56680f37ed1c1d9092ee43ac4d8957ca7bbe13fbfc340c6`
(holdout).

The next higher-impact scheduling question is the retry cohort: 31 fields
consume 673.92950 ms versus PARI's 60.375 ms, nearly 18% of Sage.js time and
about 27% of the total excess over PARI. The smallest-discriminant member is
`3.1.908491.1`, $x^3-x^2-7x+186$, with class number five: 8.80834 ms versus
1.5 ms, taking efforts $5,1,7$. Its initial exit is phase 43/reason 434.
Reconstruct the missing unit/relation evidence and work repeated across those
attempts before changing the retry policy. This is a measured next target,
not permission to select effort seven by field identity. Source consolidation,
public replay and cross-platform qualification still remain open. Focused
tests pass; architecture again stops at the known stale optimizer inventory.
PR203 remains draft.

### Retry forensics: missing evidence and delayed certification

Read-only generated-JavaScript snapshots now retain the complete raw matrices
and principal generators immediately before presentation reduction for the
two smallest-discriminant retry fields, at efforts 5, 1 and 7. All six runs
match the uninstrumented FLINT and GMP outputs in every word. Certified GP
replay independently checks every principal row, every prefix's rational
rank and exact lattice index, and the unit subgroup generated by its integer
kernel. A reported unit index zero means that all kernel products are torsion,
not a numerical failure to discover a unit.

| Field | Effort | Final raw rows | Rank / factor count | Final quotient | Kernel unit index |
| --- | ---: | ---: | --- | ---: | ---: |
| 908491 | 5 | 12 | 10 / 10 | 40 | 0 |
| 908491 | 1 | 21 | 9 / 10 | infinite | 0 |
| 908491 | 7 | 90 | 10 / 10 | 5 | 1 |
| 944919 | 5 | 50 | 20 / 20 | 3 | 0 |
| 944919 | 1 | 67 | 20 / 20 | 3 | 0 |
| 944919 | 7 | 220 | 20 / 20 | 1 | 1 |

For 908491, effort 7 first reaches rank ten and quotient 40 at raw row 47.
At row 49, the generator $18-\alpha$ changes the quotient to 5 and the kernel
unit index from zero to one. The final reduction nevertheless waits until
row 90. In this traversal, the adjacent collector returns 55 rows and the
compound stage then adds another 35. Thus the successful evidence is already
present before compound collection starts. This does not yet prove that the
existing bounded certifier would accept that prefix; its exact interval and
publication obligations must still be run.

For 944919, effort 7 reaches full rank and quotient 3 at row 110. Row 131
changes the quotient to one and introduces a fundamental unit. In the
certified basis with numerator rows $(1,2,1),(0,3,0),(0,0,3)$ and denominator
3, its generator has coordinates $(75,-47,-26)$. The adjacent collector
returns 126 rows, and compound collection continues to 220. Here an exact
index-one relation lattice together with the already checked generator bound
can prove the trivial class group without any unit calculation. The final
trivial receipt accordingly contains the identity, not a fundamental unit.
An initial diagnostic oracle incorrectly interpreted these shared coordinate
slots as a fundamental unit; it now branches on proof kind and checks the
appropriate conclusion. This was an oracle-schema error, not evidence of an
incorrect Sage.js class group. The long 220-row independent replay also
required increasing the **diagnostic GP** stack from 8 to 64 MB; no Sage.js
resource cap was changed.

Local PARI 2.17.4 `bnf` level-five traces, with seed one, show a different
search schedule. For 908491, PARI uses bound 41 and ten factor ideals, collects
16 relations from four searched ideals, and obtains tentative class number
5 and regulator approximately 28.2693892964. For 944919, it uses bound 89 and
twenty factor ideals, collects 26 relations from six searched ideals, and
obtains class number 1 and regulator approximately 49.1824419226. Separate
`bnfcertify` runs support the independent replay; trace timing is not used as
controlled performance evidence.

Source inspection identifies a concrete scheduling restriction to test:
the retained volume collector and its state allocation admit only factor
counts 12 through 16; its recovery transitions admit 13 through 16. The
ten-factor example therefore cannot use that existing resident recovery.
The next source-copy experiment admits every positive factor count up to
16 at these five gates, while keeping the cheap initial traversal and the
same explicit insufficiency/exhaustion predicates. It must be checked for
coverage, resource effects and timing regressions before any promotion.
This does not address the twenty-factor example by itself, and no speedup
is claimed for the gate change yet.

Reproduction scripts and detached evidence are retained under
`build/cubic-analytic-schedule-evidence/retry-forensics/` and
`/scratch/sagejs-runtime/cubic-retry-forensics-6Ksd6D`:
`capture-all.cjs`, `replay.cjs`, `pari.cjs`, `trace.cjs`, and `summarize.cjs`.
The exact input source remains
`812c2da3f7be7354c2014ddbfad531f7c5cacdc560608d1052d56ccce5fe7d17`.
SHA-256 identities are
`091dcc473b56ea3d0b5254bf6aa7b6b59d81ea2b7d06087d8ff571b36b7739be`
(raw snapshots),
`5899f40b5acd4d6a02b18e87a46764529082a7306a56a815c075ff0a10059165`
(independent replay), and
`4e394a97e6fc1de7bda0e1aa47658fd4c4977651a74d57f6931b78f66c9701ea`
(PARI traces). These diagnostics are not public certificate qualification.

### Retained volume recovery for smaller factor bases

The five-gate generalization has now been implemented, checked and timed as
another unpromoted source copy. The two allocation/collector lower bounds of
12 and three recovery-transition lower bounds of 13 become 1; the upper
bound 16 remains. There is no polynomial-specific dispatch. Existing small
factor bases still start with their cheap traversal: volume recovery becomes
available only through the existing exact rank or authorized proof-insufficiency
and exhaustion transitions. Errors do not authorize recovery. The collector,
unit search, prime bounds and acceptance inequalities are unchanged.

`check-gates.py` first verifies that these five substitutions are the complete
source diff. It then executes 63,360 comparisons of the actual old/new Python
dispatch predicates over factor counts 0 through 65, boolean state combinations
and negative/zero/positive rank statuses. Old admissions are retained; zero
and oversized shapes, inconsistent rank, and missing recovery authority remain
excluded. The existing traversal-state matrix gains six entries per factor
for newly admitted small shapes, at most 66 additional entries. There is no
new owner, arena or enlarged memory limit, but this allocation change still
needs timing and platform qualification rather than a zero-overhead assumption.

The frozen first-effort corpus improves from 981 to 982 successes: 908491 is
the sole gain, with no losses or errors. All 1,011 other outputs remain exactly
identical in all 64 words. FLINT/GMP/JavaScript and original/one-page linkage
checks cover all 1,012 inputs. All 24 reused holdout fields retain first-effort
acceptance and identical outputs across the three backends and both variants.

For 908491 the exact bounded certifier now succeeds at **16 raw relations**.
Its observed checkpoints are $(12,40,\mathrm{insufficient})$ twice,
$(13,40,\mathrm{insufficient})$, then $(16,5,\mathrm{accepted})$, where the
middle entry is the class-lattice index. Independent GP replay of every
principal row and prefix kernel confirms torsion-only units through row 15,
then class quotient five and unit index one at row 16. The published unit is
fundamental, and its analytic enclosure matches the previously successful
effort-seven result up to unit sign. The two earlier targets also replay
unchanged. Matching PARI's relation count does not claim identical relation
selection, work or performance. This is not public certificate qualification.

Controlled timing ran alone on the same `opt` host and CPU 0 under
`/tmp/cubic-narrow-volume-V3G7Xk`. Full-corpus and reused-holdout sampling are
unchanged. The paired panel adds 908491 to the previous twelve fields and
includes the full $[5,1,7,8]$ retry sequence inside the clock for both variants.

| Workload | Local-screen parent ms | Smaller-base recovery ms | PARI ms |
| --- | ---: | ---: | ---: |
| 908491 | 9.08522 | 3.95467 | 1.50000 |
| Frozen 1,012, sum of field medians | 3793.80516 | 3763.81767 | 1474.12500 |
| Reused 24, sum of field medians | 43.17593 | 42.57175 | 27.87500 |

The paired target median ratio is 0.43412, with empirical 10th–90th percentile
range 0.42448–0.45165: about 56.6% less time including avoided retries. Every
other paired field's range includes one. All full computations finish correctly,
with 30 retrying fields instead of 31. The aggregate difference is only 0.79%;
the target itself accounts for about 5.13 ms of the 29.99 ms difference, so do
not interpret the whole aggregate movement as a demonstrated algorithmic gain.
Likewise the reused holdout's 1.40% difference is not a resolved broad speedup.
The target still takes about 2.64 times PARI, and the corpus about 2.55 times.

Local diagnostic profiling (1,100 calls, 100 discarded, full-output parity)
shows why matching relation counts has not closed the timing gap. The root
takes about 4.117 ms with instrumentation: four adjacent-collector calls cost
1.765 ms inclusive, of which two volume calls cost 0.498 ms. There are four
dependency LLL-prefix calls, eleven real-root isolations, 91 real-log-bound
calls and twelve generator-bound checks. Some of this is repeated failed-prefix
certification, including the identical 12-row prefix. These inclusive costs
cannot be summed, and this profile is not a controlled speed comparison.
The next investigation should distinguish repeated prefix proof work from
the expense of entering the broader traversal late. The twenty-factor retry
944919 remains outside this generalization and needs a separate measured
extension, not an unreviewed upper-bound increase.

Source and reproduction evidence are retained under
`build/cubic-analytic-schedule-evidence/narrow-volume/` and
`/scratch/sagejs-runtime/cubic-narrow-volume-khwO41`. `prepare.py` authenticates
the parent and applies only the five gate changes. `summary.json` validates
all unchanged outputs, the sole gain, three-backend/linkage and holdout checks,
replay outcomes, and controlled timing files. The source shrinks by five bytes
to 502,784, SHA-256
`d7fce6c863655de1ab50dfa23fbda68cde54c8e29a4d802a56ee594ed17b2020`.
Path-normalized C shrinks by ten bytes to 13,057,812; the larger raw file
reflects longer source provenance paths, not added algorithmic code. Raw core
SHA-256 is `b4369ce46ebeb1324fccb6e5d5caf0bc40b0a6c1a4ed1dbf3485f06e6b44f921`.
Full timing SHA-256 is
`65de1f7ab90451dc8b2e0e0463d892bb122e476a53203cb973efd5861906146f`;
reused-holdout timing SHA-256 is
`83598ddf25e9f5357bc0937b26f9b993468cba81003ad4f2a7c1944f8e9f4bc3`.
Source allowance, production source and PR203 draft status remain unchanged.
Focused tests and actual-gate checks pass; the existing architecture-inventory,
public replay, consolidation and cross-platform qualification gaps remain.

## Unchanged-prefix insufficiency reuse: measured, narrow benefit

A separate unpromoted source-copy experiment reuses an explicit insufficient
closure result across exactly two already-authorized no-append transitions:
advancing the exhausted intermediate traversal, and entering the retained
volume traversal. It does not memoize successful certificates or infer failure
from a search timeout. The field, maximal-order basis, logical append-only
relation prefix, class quotient and analytic precision remain fixed across
these transitions. New relations force a fresh closure attempt; an error or a
changed row count cannot enter the reuse branch.

The six output diagnostics in slots 58 through 63 require special care:
collection can overwrite them without appending a relation. The experiment
saves and restores the previous proof diagnostics before recomputing the
existing resume predicate. A row-count-only cache without this restoration
would not preserve the authority for continuing the search. No acceptance,
analytic, precision, allocation or iteration limit changes. This is a local
control-flow argument, not a claim of Lean verification.

Actual-source tests cover 36 proof/reuse/error cases and 1,536 cases of the
two transition predicates. All 1,012 first-effort outputs are identical in
every word to narrow-volume recovery, with 982 successes and no errors or
coverage changes, across FLINT, GMP, generated JavaScript and the timing
linkage. The reused 24-field panel also preserves every output. Independent
certified-GP principal-row, integer-kernel-unit and published-unit replay
passes for 30772, 41912 and 908491; this is not public receipt qualification.

The full first-effort trace removes exactly seven duplicate closure calls,
957 to 950, on fields 761319.2, 908491.1, 1063351.3, 1954455.1, 21147075.4,
25748531.3 and 38041259.1 (all labels have prefix `3.1.`). Every other logged
event, including all analytic and root-search calls, is identical. For
908491 the closure row counts become 12, 13, 16 instead of 12, 12, 13, 16.

Controlled serial `opt` measurements use the same experimental one-page
FLINT linkage for both candidates, CPU 0, and the previously documented
warmup, retries and sampling rules. The 21-round paired panel finds a median
target ratio of 0.96232 for 908491, with empirical p10/p90 0.90857/0.99061.
The other twelve fields' ranges include one. These are sample quantiles, not
confidence intervals. The full-corpus sums are 3960.169 ms parent,
3925.025 ms reuse, and 1506.875 ms PARI, with 30 retrying fields on either
Sage.js variant. The reused-24 sums are 45.959, 44.606 and 28.375 ms.
Neither aggregate difference establishes a broad speedup from seven removed
calls. In particular, the full-run target's 4.657 to 3.918 ms change is much
larger than the paired estimate and must not be presented as a stable 16%
improvement. The candidate remains substantially slower than PARI overall.

Evidence lives in `build/cubic-analytic-schedule-evidence/unchanged-prefix/`
and `/scratch/sagejs-runtime/cubic-unchanged-prefix-BZLpWG`.
`prepare.py` authenticates the parent; `check-control.py`, `compare-trace.cjs`
and `summarize.cjs` check actual control flow, unchanged events, output parity,
resources, replay and timing evidence. Source grows 1,920 bytes to 504,704,
SHA-256 `e185960807e365d1f4c0b8954957b9bee3790ca0ee384bd1e22c432d253914b8`;
path-normalized core grows 39,941 bytes to 13,097,753. Raw core SHA-256 is
`67412a8c76340676a921716574c2d4d229c12ca872d08d7dd4e18a53761d0df4`.
This is not stacked into the next initial-volume search-order ablation:
the small benefit and added state merit comparison before consolidation.
Production source, allowance and PR203 draft status remain unchanged.

## Initial volume for small factor bases: mixed ablation, not a default

The next experiment changes exactly one scheduling predicate, from
`not staged_certification or factor_count == 12` to
`not staged_certification or factor_count <= 12`. Small staged factor bases
therefore start in the existing volume traversal rather than reaching it only
through authorized recovery. This source copy is based on narrow-volume
recovery, not the unchanged-prefix experiment. Acceptance, generator bounds,
analytic precision, resource limits, and the upper volume shape limit remain
unchanged. Actual-source comparison and 130 extracted-predicate cases verify
the single change. Source and normalized generated-C sizes are unchanged.

All 1,012 first-effort fields retain the same success status: 982 accepted,
30 declined, no errors, gains or losses. There are 383 changed outputs, all
on accepted fields, reflecting different relations, unit representatives and
search diagnostics. Every accepted class number and invariant list agrees
with the frozen oracle. All 64 words agree across FLINT, GMP, generated
JavaScript and the timing linkage. All reused 24-field checks pass too, but
this is neither a fresh holdout nor a full public receipt/replay qualification.

Independent certified-GP replay covers all 383 changed fields and 5,995
principal rows. It checks the maximal-order basis, every principal equality,
every full-rank-candidate prefix and its integer-kernel unit subgroup. Analytic
receipts additionally have their published fundamental unit checked; trivial
class receipts instead require a full-rank determinant-one relation lattice
and independently certified class number one. Initially the older harness
incorrectly required a fundamental unit on a trivial receipt, and its staged
closure snapshots missed the final trivial-class presentation. Both diagnostic
errors are preserved in the evidence. `capture-raw.cjs` now observes the actual
raw presentation immediately before reduction, including the final path, and
preserves all output words. The corrected complete replay passes. These checks
do not formalize or independently replay the Sage.js analytic inequalities.

The controlled paired panel demonstrates real tradeoffs:

| Field (prefix `3.1.`) | Parent ms | Initial-volume ms | PARI ms | Paired median ratio |
| --- | ---: | ---: | ---: | ---: |
| 42552.1 | 2.592 | 1.554 | 1.125 | 0.602 |
| 97492.1 | — | — | — | 0.866 |
| 30772.1 | 1.855 | 2.320 | 1.375 | 1.261 |
| 46983.1 | 2.215 | 3.273 | 1.250 | 1.472 |
| 908491.1 | 3.986 | 4.567 | 1.375 | 1.152 |

The 42552 gain and the three displayed regressions have paired empirical
p10/p90 ranges entirely on their respective sides of one. Full-corpus sums
are 3969.229 ms parent, 3941.233 ms initial volume and 1488.125 ms PARI;
reused-24 sums are 48.803, 48.162 and 29.000 ms. Thirty fields retry on either
implementation, with no incomplete final timing samples. The small aggregate
difference does not justify selecting volume first universally, especially
given the substantial target regressions. This is an unpromoted ablation.

Trace counts explain why fewer closures are not sufficient: closure calls
fall 957 to 902, but saturation calls rise 889 to 914, BF evaluations 860 to
864, and square/cube/fifth-root proposals 19/2/0 to 37/3/1. For 908491,
the first volume prefix has class quotient 10 and a fundamental unit at row
12; row 13 already has quotient 5 and the same unit subgroup. Nevertheless,
the next certification occurs at row 32. For 46983, adequate class/unit
evidence exists at row 10 but the collector reaches row 28. These are exact
prefix-oracle observations, not claims that Sage.js certified those earlier
prefixes.

Inspection identifies a specific interface gap: the adjacent collector's
`stop_on_lattice_change` request is honored by its ordinary traversal but
not forwarded into `_cubic_collect_initial_volume_prefix`. The next experiment
should propagate that existing request through the volume enumerator, commit
cursor/quota/budget state before returning, and invoke the unchanged exact
certifier at the event. A lattice change requests a proof; it is not itself
proof of completeness, nor a reason to remove periodic unit checks.

Evidence is retained in
`build/cubic-analytic-schedule-evidence/small-initial-volume/` and
`/scratch/sagejs-runtime/cubic-small-initial-volume-8rV85F`.
The source is 502,784 bytes, SHA-256
`ae99b7c9a226e75abee11fcc6c286ad930772d8effe2383331c4517992cb9e33`.
Normalized C is 13,057,812 bytes; raw core SHA-256 is
`66e742c574f243a0155d0f56f4e378fb6836778c29093b293fb1032d3cd6b8c8`.
`summary.json` records artifact identities, replay and backend checks, paired
quantiles and all timing samples. Production source, caps and draft status
are unchanged.

## Forward exact quotient events through the volume traversal

The missing checkpoint is now implemented in another unpromoted source copy.
The existing `stop_on_lattice_change` Boolean passes through the adjacent
dispatcher into the initial-volume collector and its inner ellipsoid
enumerator. After the exact online update, a newly appended row with support
flag one can return to the caller. This uses the same event predicate as the
ordinary traversal. It neither declares the class group complete nor changes
which resume statuses are admissible. The original exact presentation,
unit reconstruction and analytic acceptance run at the requested checkpoint;
periodic checks remain necessary because units can improve without changing
the class quotient.

An event occurs after advancing the proposal cursor. Before returning, the
outer volume collector accounts for consumed virtual slots, records the new
cursor and cumulative candidate count, and updates the per-ideal four-row
quota and cyclic ideal cursor. Thus a pause does not repeat a candidate,
reset its budget, or discard the remainder of a visit. The actual volume and
inner-enumerator Python bodies pass 324 scheduling cases with explicit
candidate/admission/lattice stubs: varying factor counts, budget chunk sizes,
rejected candidates and event frequencies preserves the complete proposal
sequence, accepted rows, final cursor/quota state and total consumed slots.
Zero budget and terminal online statuses leave traversal state untouched.
These are control-flow tests, not substitutes for mathematical verification.

Relative to initial-volume-first, all 1,012 first-effort success statuses
remain identical: 982 successes, 30 declines and no errors. Fifty-three
successful outputs change. Every accepted class number and invariant list
matches the frozen oracle, and all 64 words match across FLINT, GMP,
generated JavaScript and timing linkage. The reused 24-field panel also
passes all three backends; four transcripts change. Independent certified-GP
replay passes all 53 changed fields plus two controls, checking 822 principal
rows, prefix kernel units, maximal-order bases, and the appropriate analytic
unit or trivial-class presentation. Comparing raw snapshots with the parent
proves that the common prefix is exactly the same in all 55 cases: 53 finish
earlier and none later (parent total 1,704 rows). This is still not a
full-corpus independent replay of Sage.js public certificates.

For 908491 the first 12 rows have quotient 10 and a fundamental unit; row 13
has quotient 5. Sage.js now actually certifies that 13-row prefix, instead of
collecting 32 rows. For 46983 the corresponding successful prefix shrinks
from 28 rows to 10. Both independently replay exactly. The first-effort
aggregate trace has 906 closures, 922 saturation calls, and 864 BF evaluations
versus 902/914/864 in initial-volume-first. More checks can be profitable
when they avoid expensive subsequent relation work; counting calls alone
would incorrectly reject this change.

Controlled serial `opt` timing with identical one-page FLINT linkage gives:

| Workload | Initial volume ms | With quotient events ms | PARI ms |
| --- | ---: | ---: | ---: |
| 908491 | 4.526 | 2.701 | 1.375 |
| 46983 | 3.249 | 1.833 | 1.125 |
| Full 1,012-field sum | 3736.498 | 3663.541 | 1460.000 |
| Reused 24-field sum | 44.255 | 40.481 | 27.250 |

The paired 21-round median ratios are 0.58556 for 908491 (p10/p90
0.57016/0.59631), 0.55619 for 46983 (0.54314/0.57410), and 0.84434 for
24364.3 (0.82657/0.86101). The other ten panel ranges include one. These
quantiles are descriptive, not confidence intervals. The 53 changed fields
account for 168.658 to 117.171 ms; the other 959 also move by about 21 ms,
which should not all be attributed to the optimization. Thirty fields retry
in both variants, and every final timing sample completes.

A separate controlled paired run compares the combined candidate directly
against the earlier **cheap-first narrow-volume recovery**, not merely
against the regressing initial-volume ablation. For 908491 the median ratio
is 0.67640 (0.66425/0.68923); per-sample medians are 3.847 and 2.603 ms.
For 46983 the ratio is 0.82632 (0.82158/0.85924), with medians 2.102 and
1.742 ms. Other improvements include 42552 (ratio 0.61219) and 97492
(0.86119). However, 30772 still regresses by about 27.8%, 41300 by 10.0%,
283 by 8.5%, and the original `x^3+9*x-55` target by 4.2%. The latter's
relation output is unchanged, so an added traversal-dispatch cost need not
show up as a different transcript. These direct comparisons preclude
claiming a universal win or multiplying ratios from separate experiments.
The full candidate remains about 2.51 times PARI on this corpus; 908491 is
closer, but not yet competitive with PARI's roughly 1.4 ms.

A local coarse native profile, explicitly not controlled timing, preserves
all outputs across 1,100 calls (100 warmups) and reports a 2.550 ms root.
Two initial-volume calls cost 1.171 ms inclusive; unit materialization costs
0.224 ms and BF planning 0.167 ms. These nested costs must not be added to
their parents. This shifts the next target toward relation planning/search
cost and a principled choice between cheap-first and volume-first schedules,
while retaining the now-working event forwarding. No field labels or known
answers enter dispatch. A future choice must be based on general mathematical
or measured workload structure, with regression controls, rather than selecting
the best observed strategy separately for each benchmark field.

Reproduction artifacts are in
`build/cubic-analytic-schedule-evidence/volume-quotient-event/` and
`/scratch/sagejs-runtime/cubic-volume-quotient-event-TXKmyA`.
`prepare.py` authenticates initial-volume-first and changes only the three
traversal functions. Source grows 768 bytes to 503,552, SHA-256
`e66e054188ecb8fa1cf01c7fb1111a2043536861159c9a439f197e10dcab53ed`.
Normalized C grows 17,906 bytes to 13,075,718; raw core SHA-256 is
`887fe43537bb91dd939bb0a96e0b79dd417ca580616ab2057bfb49ab58b7e585`.
`check-resume.py`, `compare-prefix.cjs`, `summary.json` and the two paired
summaries record the control, exact-prefix, linkage, resource and timing
checks. The serial architecture rerun still stops at the known stale
optimizer manifest (`d870e205…` expected, `ce64558c…` recorded); it is not
refreshed merely to pass. Production source, allowances and PR203 draft status
remain unchanged; consolidation, public certificate replay and platform
qualification are still required.

## Cache exact prime-power contributions during generator-bound search

The next source-copy optimization preserves the search policy rather than
choosing another heuristic. `_cubic_grh_generator_bound` probes neighboring
bounds using fixed authenticated endpoints and scale. For a prime-ideal norm
$n=p^f$, its `SA` and `SB` contributions depend on the bound $B$ only through
$m=\max\{j\geq 1:n^j\leq B\}$. When $n>B$ the contribution is zero. Once $m$
is fixed, the original reciprocal-square-root interval, geometric and weighted
power sums, and final rounded products are identical. Cache those two final
rounded integers, not an approximate formula or a reordered sum.

A root-owned matrix has one row per possible norm and three columns:
the ready exponent $m$, `SA` lower endpoint, and `SB` upper endpoint. A hit
requires the same positive exponent. On a miss the original arithmetic runs,
and the exponent is published last, after the two values. Different trial
bounds can move either upward or downward; equality of exponents, not
monotonic traversal, governs reuse. Readiness is never published on a failed
computation. Distinct prime powers of primes identify distinct $(p,f)$ pairs,
so indexing by norm is sufficient: primality is authenticated by the existing
splitting-plan producer before this helper is called. This argument would
not justify calling the private helper with arbitrary composite "primes".
Multiplicity remains outside the cache, exactly as before.

The owner exists only during one root call, with one immutable endpoint batch
and scale. It is neither a cross-field cache nor valid after changing those
inputs. The existing prime splitting table remains separate and unchanged.
The extra allocation is at most $258\cdot3=774$ exact-integer entries under
the existing factor-search limit 257. Source, arena and generator bounds are
not raised; the larger resident footprint must still fit the original limits.
There is no new GRH hypothesis or weaker analytic acceptance condition.

Actual old/new Python contribution bodies agree in 310,800 comparisons at
four scales, including increasing/decreasing bounds and prime-power boundary
transitions. The checks exercise 131,724 cache hits without endpoint reads,
fresh owners for different scales, and a failed exponent change followed by
successful retry. A same-source JavaScript trace additionally hashes every
contribution's inputs and returned endpoints across all 1,012 fields: all
137,429 calls have exactly identical arithmetic transcripts. Positive
recomputations fall from 81,116 to 21,017, with 60,099 hits; interval-product
calls inside those contributions fall from 285,975 to 80,702. The 56,313 zero
contributions remain zero without ready entries. Every recorded subsequent
closure, saturation, BF and root-search event is identical to the parent.

All 1,012 complete first-effort output buffers are identical: 982 successes,
30 declines, no errors or changed bounds, units, intervals or diagnostics.
FLINT, GMP, generated JavaScript and timing linkage agree in every word.
The reused 24-field panel also retains identical outputs. Independent
certified-GP principal-prefix and published-unit replay passes the three
selected controls 30772, 41912 and 908491. This is not full-corpus public
certificate replay and does not formalize the analytic theorem.

Controlled `opt` timings with matched one-page FLINT linkage are:

| Workload | Parent ms | Contribution cache ms | PARI ms |
| --- | ---: | ---: | ---: |
| 908491 | 2.659 | 2.597 | 1.375 |
| Original 9399 target | 1.374 | 1.336 | 1.125 |
| 30772 | 2.190 | 2.153 | 1.375 |
| Full 1,012-field sum | 3713.767 | 3630.309 | 1469.875 |
| Reused 24-field sum | 41.914 | 40.528 | 27.625 |

The paired target ratio for 908491 is 0.96621, with empirical p10/p90
0.95574/0.97713. Ratios for 24364.3 and 3209035 are 0.97840 and 0.97541,
also with ranges below one; the other ten panel ranges include one. These
are sample quantiles, not confidence intervals. Full-run aggregate differences
are about 2.25% and 3.30% respectively; do not interpret all aggregate
movement as measured causal improvement on every individual field. Thirty
fields retry on both variants, and every final timing sample completes.
The corpus still costs about 2.47 times PARI. No broad competitiveness claim
or production promotion follows from this result.

Additional local diagnostic profiling of the parent identifies why the
remaining gap cannot be attributed just to too many relations. For 908491,
the detailed instrumented root is 2.886 ms. There are 415 reduced-candidate
checks, 254 smooth-principal append attempts and 1,347 extended-gcd calls.
Candidate checks cost 0.414 ms inclusive, append attempts 0.428 ms, and
extended gcd 0.135 ms. Seventy-seven ceiling square roots cost 0.119 ms.
The generator-bound checks cost 0.282 ms inclusive. Nested times must not be
summed, and wrapper overhead is included. The existing PARI trace for this
field reports 324 small-norm candidates and 16 relations; Sage.js's factor
attempt count is already lower, though the counters are not identical
instruction-level workloads. Exact per-candidate representation/arithmetic
cost is therefore a serious remaining hypothesis, alongside search order.

This is a useful compiler-motivation case too: the source computes Bezout
coefficients for some gcd calls whose callers discard them, and constructs
the square-root initial power of two by repeated multiplication. The inspected
compiler accepts exact powers only with constant exponents; its documented
word shifts are not arbitrary-precision shifts. These are identified
opportunities, not implemented compiler improvements or measured standalone
speedups. The existing dirty `mixed-exact-float-sidecar` worktree was inspected
read-only and left untouched; floating discovery with exact authentication
would require explicit compiler and mathematical qualification, not a silent
replacement of exact certification.

Evidence lives in `build/cubic-analytic-schedule-evidence/bound-contribution-cache/`
and `/scratch/sagejs-runtime/cubic-bound-contribution-cache-YZcmlz`.
`prepare.py`, `check-cache.py`, `trace-contributions.cjs` and
`summarize-contributions.cjs` retain the source transformation, arithmetic
comparisons and call-transcript evidence. Source grows 1,007 bytes to 504,559,
SHA-256 `52c39cbada600b83258a108b439806312753bcf0868e04d446db3a6e12c29345`.
Normalized generated C grows 18,816 bytes to 13,094,534; raw core SHA-256 is
`3c29e83714303f7480e141918c670c71425e07081ff185f419d031fd272a218f`.
The parent detailed profiles are retained with the volume-quotient-event
evidence. Existing source allowance and physical resource limits are unchanged.
The candidate remains unpromoted on draft PR203, with consolidation, public
replay, architecture-inventory reconciliation and platform qualification open.

## Gcd-only arithmetic: remove unused Bezout work

The next ablation replaces `_cubic_extended_gcd` with a nonnegative Euclidean
gcd at all six call sites in the contribution-cache source copy. They occur
in maximal-order fixed-point validation, rational-content removal and
primitive ellipsoid-point authentication. Actual AST inspection checks that
neither returned Bezout coefficient is ever read by any of those callers.
The remaining functions are structurally identical. The production source
currently has four such calls; its transformation is separately exercised by
the focused test but is not installed as the production implementation.

The mathematical argument is elementary and independent of GRH. Normalize
the inputs to $a=|\mathtt{left}|$, $b=|\mathtt{right}|$. For $b>0$,
$\gcd(a,b)=\gcd(b,a\bmod b)$, and $0\le a\bmod b<b$ proves termination.
The terminal $a$ is nonnegative, with the same $\gcd(0,0)=0$ convention as
the old routine. Every caller consumes only that gcd. This changes no ideal,
relation, unit, analytic bound, stopping rule or acceptance condition.

The tracked reproducer
`bench/class-unit-groups/cubic-gcd-only.py` authenticates its source hash,
rejects calls that read a Bezout coefficient or use unsupported assignment
shapes, and creates a new output file exclusively when requested. It includes
79,649 comparisons of the actual old and new Python bodies against
`math.gcd`: signed small integers, zeros, shared factors, consecutive Fibonacci
numbers and random multi-limb inputs through 4,096 input bits (including
larger products). Four deliberately unsafe transformations are rejected.
Reproducing the measured candidate without changing the production source:

```sh
python3 bench/class-unit-groups/cubic-gcd-only.py \
  /scratch/sagejs-runtime/cubic-bound-contribution-cache-YZcmlz/bound-cache.py \
  --expected-sha256 52c39cbada600b83258a108b439806312753bcf0868e04d446db3a6e12c29345
```

An optional `--output` path creates the source copy; an existing destination
is refused. The reproducer's output hash matches the compiled experiment.
This is a scalar arithmetic/source-transformation test, not a substitute for
full-kernel differential execution or certificate replay.

An additional closed-arena primitive witness extracts the actual candidate
helper without rewriting its body. It passes 8,817 `math.gcd`-oracle cases
on each of compiled FLINT, compiled GMP and generated JavaScript, including
negative/zero arguments, boundaries around powers of two and random inputs
through 4,096 bits. This supplies native promotion/sign coverage beyond the
small inputs seen in the class-group corpus. Its source, generated core and
input corpus identities are retained in `primitive-checks.json`.

All 1,012 first-effort outputs retain all 64 words across the parent,
candidate, FLINT, GMP, generated JavaScript and timing linkage: 982 successes,
the same 30 declines, no errors. The reused 24-field panel likewise retains
identical outputs. Independent certified-GP principal-prefix and published-unit
replay passes the three controls 30772, 41912 and 908491. Every captured
closure, saturation, BF and root-search event agrees exactly with the parent.

A read-only generated-JavaScript trace authenticates the ordered inputs and
gcd result of all 1,088,272 calls across the corpus. Of these, 804,354 return
one and 5,221 return zero. Every observed input is nonnegative and smaller
than $2^{63}$; this workload is not a benchmark of large-integer gcd.
Field 908491 makes 1,347 calls, of which 1,025 are coprime. Thus the measured
gain removes unused exact arithmetic and tuple-return work, not mathematical
search or large-integer asymptotic cost. The ordinary Python helper remains
unbounded; observed small inputs are not a new validity restriction.

Controlled `opt` timings, with matched one-page FLINT linkage, are:

| Workload | Contribution-cache parent ms | Gcd-only ms | PARI ms |
| --- | ---: | ---: | ---: |
| 908491 | 2.583 | 2.468 | 1.375 |
| Original 9399 target | 1.282 | 1.289 | 1.125 |
| 30772 | 2.150 | 2.068 | 1.250 |
| Retrying 944919 | 20.877 | 20.500 | 2.000 |
| Full 1,012-field sum | 3592.528 | 3512.296 | 1458.375 |
| Reused 24-field sum | 40.155 | 39.651 | 27.875 |

The separate 21-round alternating ABBA/BAAB comparison resolves a target
908491 median ratio of 0.97081, with empirical p10/p90 0.96260/0.98174.
The 3209035 ratio is 0.98689, with p90 only just below one at 0.99959;
the other eleven panel ranges include one. These quantiles are not confidence
intervals. Do not advertise the noisier full-run target difference as a
4.45% paired win, or attribute every aggregate difference to this change.
The full-run aggregate difference is 2.23%; the corpus still takes about
2.41 times PARI. Both variants retry 30 fields and every final timing sample
completes. No broad competitiveness or universal no-regression claim follows.

This experiment also sharpens the next priority. In the preceding cache run,
the 30 retrying fields cost 651.729 ms versus PARI's 58.125 ms, accounting
for about 27% of the total excess time despite being only 3% of the corpus.
The new gcd helper does not change any retry. Field 944919, already known by
independent replay to lack a nontorsion unit in its early attempts, still
costs about ten times PARI. The existing volume/staging dispatch has several
16-factor upper guards, while this field uses 20 factors. Reconstructing and
qualifying that larger resident search regime is a higher-leverage next step
than assuming more scalar cleanup alone will close the gap. Separately, the
million word-sized gcd calls motivate a generic compiler/runtime primitive
investigation, not coefficient-specific dispatch or a word-only algorithm.

Read-only dispatch inspection makes that next experiment precise: above 16
factors, effort five disables `use_pari_permutation` as well as
`staged_certification`, and requests $n+22$ relations instead of the staged
$n+6$. It also loses the retained volume-recovery path. For the 20-factor
field, PARI's recorded initial target is 26, exactly $n+6$. These coupled
policy differences should be separated by ablation, not treated as a mere
buffer-size increase. An ordering-only extension and then staged volume
recovery require their own shape/resource checks and out-of-sample replay;
neither extension is implemented or qualified by this gcd experiment.

The frozen corpus partition makes this more than a single-field observation:

| First-effort factor-base size | Fields | Retrying fields | Gcd-only total ms | PARI total ms |
| --- | ---: | ---: | ---: | ---: |
| At most 16 | 797 | 0 | 1722.329 | 1079.000 |
| 17 through 24 | 203 | 25 | 1581.222 | 354.500 |
| Above 24 | 12 | 5 | 208.744 | 24.875 |

All 30 first-effort declines are beyond the existing 16-factor dispatch
boundary. The 203-field intermediate cohort alone accounts for about 60% of
the total excess time. `frontier-cohorts.json` records every cohort member,
failure phase/reason and source/timing identity. Its extractor distinguishes
canonical successful factor counts from the retained failed-presentation
diagnostic slot. This is evidence for where to investigate, not proof that
widening the guard is correct or will produce a speedup.

The failure phases also distinguish missing mathematics from interval width:
20 declines reach the analytic test with a strictly positive lower logarithm
of the joint relation/unit index. Under the stated hypotheses their index is
therefore greater than one; a tighter enclosure of that same evidence cannot
certify index one. Six failures have insufficient relation rank, three have
no authenticated dependency-unit witness, and one exhausts the exact-product
exponent budget. Absence of a unit witness is not itself a proof that all
kernel units are torsion. Likewise, at analytic phase eight the retained
435/436 diagnostic codes describe the preceding materialization route, not a
failed reconstruction. Independent prefix replay remains necessary to
separate missing class relations from an incomplete unit subgroup.

Evidence is retained in
`build/cubic-analytic-schedule-evidence/gcd-only/` and
`/scratch/sagejs-runtime/cubic-gcd-only-NNIReO`. `prepare.py`,
`check-gcd.py`, `trace-gcd.cjs`, `gcd-trace.json`, the build manifests,
paired/full timings and replay programs identify the exact experiment.
The source shrinks 840 bytes to 503,719, SHA-256
`81a28cf7f14e114a27bce57cd63cf67671c57e1007459fd8fb5b9b94fd3be785`.
Normalized generated C shrinks 49,646 bytes to 13,044,888; raw core SHA-256
is `9cfd8b750d580a18988ffc9000bfdb5bd1cba748922ee9b0957c3d7eff88680e`.
Compilation took 49.73 seconds. No production source allowance, arena limit,
dependency policy or mathematical bound is raised. This remains an
unpromoted source copy on draft PR203, not four-platform release evidence.
The six focused analytic-schedule tests, formatting, direct documentation and
task-contract checks pass. The changed-file wrapper passes merge checks, all
192 unit-test files, and documentation checking after an 8m36s fresh build.
A separate documentation invocation overlapped that rebuild and failed on
the intermediate compiler interface; its failed receipt is retained, not
counted as validation. Final documentation checking is serial. The serial
architecture rerun again stops at the
already recorded stale optimizer inventory; it is not reported as a pass and
the manifest is not refreshed to hide that failure.

## Separating ordering from staged recovery at 17–24 factors

Two further source-copy experiments isolate the dispatch boundary identified
above. They are diagnostic candidates, not production promotion or public
certificate qualification. Both use the gcd-only parent and preserve all
mathematical acceptance tests, exact-product limits, arena budgets, and the
maximum factor/relation capacities. The experimental scheduling envelope
itself **does** change and requires explicit resource review.

The ordering-only control changes the upper bound in `use_pari_permutation`
from 16 to 24, leaving the six staged/volume guards unchanged. An actual-source
predicate check covers 660 factor-count/effort combinations; exactly 24 change
(17–24 factors, efforts 3–5). It reduces first-effort coverage from 982 to
957: 14 gains and 39 losses. The selected field $x^3-39x-569$ still has no
usable unit witness. Ordering alone is therefore not an adequate extension.

The coordinated candidate also widens the remaining six guards: volume
dispatch, staged certification, initial visits allocation, and three retained
volume-recovery paths. AST normalization confirms these are the only changes
relative to the ordering control. It retains the $n+6$ initial staged target
and existing exact insufficiency/exhaustion authority for continued search.
New 17–24-factor cases initially use the cheap traversal, not immediate volume
search; the earlier initial-volume policy remains confined to at most 12.

Across the frozen 1,012 fields, coordinated staging gives **1,005 first-effort
successes**, 25 gains and two losses relative to the gcd parent, with no
execution errors. FLINT, GMP, and generated JavaScript agree on all 64 output
words; default and one-page FLINT linkage also agree. All 809 fields outside
the 17–24 cohort retain every status and output word. The reused 24-field
holdout retains every word as well; it is not fresh out-of-sample evidence.

### Exact explanation and regressions

For $x^3-39x-569$, maximal-order index three is retained and the field
discriminant is $-944919$. Through raw row 32 the relation lattice has full
rank but quotient order three, and its dependency kernel generates only
torsion units. Row 33 gives quotient order one and unit index one. Thus the
new stop is explained by additional mathematical evidence, not by a looser
bound or a smaller precision. The trivial-class receipt correctly publishes
the identity rather than claiming to publish a fundamental unit.

The independently recorded PARI trace uses bound 89, 20 factor-base ideals,
and 26 relations: five rational relations and 21 small-norm relations from
six searched ideals of norms $89,79,79,73,71,71$. Its HNF is $20\times26$;
its regulator is approximately $49.1824419226$. This identifies further
discovery-work differences; it does not assert identical enumeration or
candidate order between implementations.

The two losses are retained as explicit negative controls:

- `3.1.25637479.1`, $x^3-x^2+720x-2596$, has class number one and 18
  factors. The new prefix has 24 raw rows, relation quotient order two, and
  unit index two. A dependency exponent of 4,280 exceeds the unchanged 4,096
  materialization limit. The parent certifies from 20 rows with both indices
  one. This is a bounded construction failure, not a mathematical
  contradiction or permission to suppress all errors.
- `3.1.69019020.3`, $x^3+372x-15748$, has class number nine and 19 factors.
  The new 33-row prefix has relation quotient order 18 and unit index one;
  the parent 41-row prefix has quotient order nine and unit index one.
  The new prefix needs another class relation. More precision or unit
  saturation cannot repair this missing class-group evidence.

Independent certified-GP replay passes for 194 selected successful fields,
checking 5,857 principal relations, the maximal-order basis, dependency-unit
subgroups, and published units where the receipt claims a fundamental unit.
Separate selected and parent-loss replays establish the failed-prefix facts
above. This is broader than agreement of final class numbers, but remains
diagnostic exact replay, not full-corpus public receipt replay or Lean proof.
An initial diagnostic capture omitted the expected class number and GP
rejected the resulting undefined symbol. The failed log is preserved; the
capture now includes class number/invariants and replay checks them explicitly.
No failed diagnostic run is counted as passing evidence.

### Controlled timing and resource scope

Timing uses `opt`, CPU 0, serial uninstrumented runs with matched one-page
FLINT linkage. The full corpus uses three rotated rounds, two native calls
per sample, and eight fresh `bnfinit(f,0)` computations per PARI sample.
Native retries through efforts 5, 1, 7, and 8 are inside the clock. Input and
scratch preparation are outside it. Every field completes with the expected
class number and invariants after retries.

| Workload | Gcd parent ms | Ordering only ms | Coordinated staging ms | PARI ms |
| --- | ---: | ---: | ---: | ---: |
| All 1,012 fields, sum | 3512.396 | 3347.766 | 3014.298 | 1453.000 |
| 203 fields with 17–24 factors, sum | 1580.901 | 1427.674 | 1093.848 | 353.500 |
| $x^3-39x-569$ | 20.416 | 18.184 | 5.197 | 2.000 |
| `3.1.529679.1` | 3.534 | 4.310 | 2.340 | 1.500 |
| `3.1.2231623.1` | 11.168 | 4.123 | 4.035 | 1.625 |
| `3.1.25637479.1` | 1.946 | 2.460 | 7.272 | 1.625 |
| `3.1.69019020.3` | 6.342 | 11.244 | 16.611 | 1.750 |

Coordinated staging reduces the full total by 14.2% and the targeted cohort
by 30.8%, but remains 2.07 times PARI overall. Ordering alone improves the
aggregate timing despite losing first-effort coverage, so it is a negative
coverage control, not evidence that ordering never helps performance. The
roughly 11 ms change outside the affected cohort is not attributable to
different mathematical work.

A separate 21-round alternating ABBA/BAAB comparison, after 200 warmups and
with ten calls per sample, confirms target staged/parent ratio 0.25494
(empirical 10th–90th percentiles 0.25343–0.25698). The two regression ratios
are 3.78865 and 2.62565; the original discriminant-9399 control ratio is
0.99535 with its percentile range straddling one. These are empirical
quantiles, not confidence intervals. Retry counts are 30, 55, and seven for
parent, ordering, and staging respectively.

All three source copies have 503,719 bytes and normalized generated C has
13,044,888 bytes. This does not imply unchanged dynamic workspace usage:
ordering may add 23 exact entries; staged visits now use up to
$(24+1)\times6=150$ entries, and staged presentation capacity reaches
$(2\cdot24+22)\times24=70\times24$, versus $54\times16$ at the old boundary.
The existing one-MiB/three-MiB budgets, 64-factor/1,024-relation ceilings,
ownership model, and allocation-failure behavior remain unchanged. No
production source allowance is raised; the copies still exceed that allowance
and require consolidation and platform/resource qualification before promotion.

Ordering source SHA-256:
`a256fcf0212410de69e3c61499f8db2150da73ddd0839e263e427c0deb456ef6`;
raw core:
`9d72f0d6e4e6036026d9eb579f55c320ee7af6e13f1cbd45627fbff2d00c1a6d`.
Coordinated source SHA-256:
`ecce12c5175f919c15126c4eb1829954c7db60f5091bff22b58b8542d0bbfc5a`;
raw core:
`8ba076ea8d1f19366f175bb5ec2d18631eeeff0afc197e06564b23de8fd0bf09`.
Compilation took 51.11 and 49.50 seconds respectively.

Evidence, final replay scripts, source copies, and small build manifests are
preserved under `build/cubic-analytic-schedule-evidence/ordering24/` and
`build/cubic-analytic-schedule-evidence/staged24/`. Working originals are
`/scratch/sagejs-runtime/cubic-ordering24-eouquO` and
`/scratch/sagejs-runtime/cubic-staged24-ieStHC`; controlled timing ran in
`/tmp/cubic-staged24-wBmafY` on `opt`. `summary.json` authenticates timing
inputs and records all per-field results. This candidate remains unpromoted
on draft PR203. The next ablation is immediate volume search for the newly
enabled 17–24-factor cohort, keeping the 13–16 schedule unchanged. Any
resumable recovery from materialization exhaustion separately requires a
typed distinction between bounded inability and invalid proof state.

## Volume-first ablation and bounded-region exhaustion

The next source copy changes only the initial traversal selection for
$17\le n\le24$; the 13–16 schedule and all certification criteria remain
unchanged. Its actual predicate is compared on 132 combinations of staged
status and factor count, with only the eight intended staged cases changing.
It restores both previous losses, but loses five other first-effort successes.
First-effort coverage is 1,002, with all three execution backends agreeing.
For $x^3-39x-569$, the new prefix has unit index one before row 29, and row 29
supplies the last missing rank/class evidence. The former 33-row staged prefix
and this 29-row volume prefix are different searches, not interchangeable
certificates or a claim of identical work to PARI's 26-row trace.

Full timing of this first ablation exposes two unrecovered failures. Its
attempt-time sum is **not** a completed-corpus performance result. The paired
driver correctly aborts when it cannot complete a requested field. A separate
paired run explicitly excludes those two fields, retaining the exclusion list;
it does not silently turn the failed full panel into a pass.

Read-only generated-body tracing resolves the fatal cases:

- `3.1.65734851.3` has relation quotient order 24 rather than true class
  number 12, but already has unit index one. Its next proposed ideal region
  needs coordinate limits $(72,3,3)$.
- `3.1.73693327.1` has quotient order 560 rather than class number 56 and
  only torsion dependency units in its initial 29-row prefix. A later
  proposed ideal region needs coordinate limits $(65,5,2)$.

Both exceed the retained coordinate limit of 64. The exact plan matrices
were captured without altering any of the 64 result words; an independent
integer formula reproduces these limits and distinguishes them from malformed
quadratic forms. The existing planner returned `-1` for both malformed geometry
and a valid region outside the discovery envelope. The collector consequently
treated these two optional search regions as fatal proof-state errors.

### An explicit, limited skip status

A second source copy changes only `_cubic_initial_volume_parameters` and
`_cubic_collect_initial_volume_prefix`. The planner contract becomes:

| Status | Meaning | Collector action |
| --- | --- | --- |
| $-1$ | Malformed positive plan or failed exact planning computation | Fatal decline |
| $0$ | Unprepared plan | Fatal here: this caller requires a prepared plan |
| $1$ | Prepared region within the coordinate limit | Enumerate normally |
| $2$ | Valid proposed region exceeds the coordinate limit | Mark this discovery region exhausted and visit the next ideal |

The new status is returned before writing any plan output. The coordinate
limit stays 64. Exhausting all eligible regions returns insufficiency, not
success; the existing full-rank, ideal-relation, unit, generator-bound, and
analytic-index checks still exclusively authorize publication. Search-region
exhaustion is not a completeness proof, and this change does not pretend that
the skipped region contains no useful relations. Malformed plans, invalid
rank/support state, reconstruction failures, and inconsistent intervals
remain fatal. No new owner, workspace capacity, or unbounded retry is added.

The actual old/new planner bodies pass 6,007 integer cases under both aliasing
and separate-output schedules. Independent integer square/cube-root formulas
check the geometry, including limits 64/65, malformed forms and unprepared
plans. Of these inputs, 1,573 are oversized; only their status changes, and
every output remains identical. The actual collector body passes 408
state-machine cases with the planner and completeness predicate stubbed:
oversized regions advance once, all-skipped exhaustion terminates, repeated
exhaustion does not repropose work, zero budget is inert, and malformed or
unprepared plans remain fatal. This is a state-machine test, not an arithmetic
or native execution oracle. A first test assertion used the wrong tuple slot
for the cursor; correcting that assertion does not change the implementation.

On the entire corpus, this second change restores exactly the two fatal
fields and preserves every output of the other 1,010. All FLINT/GMP/generated
JavaScript and linkage checks pass. First-effort coverage is 1,004, with eight
declines that the existing diagnostic retry schedule resolves. Relative to
the earlier coordinated staged candidate, there are two gains and three
losses. All 809 fields outside the targeted cohort are still unchanged.
Independent exact replay of the two restored fields proves the missing class
relation appears at row 47 for `65734851`, while `73693327` has class and unit
indices one by row 44 and publishes after row 45. Both published units are
checked as fundamental; three unchanged controls also replay exactly.

The first volume-first copy additionally passes exact replay of 183 selected
successful fields and 5,245 principal relations. One initial replay exceeded
GP's default eight-MB stack; its failure log is retained. Rerunning with an
explicit 256-MB GP stack passes. This increases the **independent checker**'s
budget, not Sage.js's arena or mathematical limits. Combined with the two
changed-field replays and all-word parity, this covers the changed successful
prefixes, not all public corpus certificates. The reused 24-field holdout is
unchanged and is not relabeled as fresh evidence.

### Completed-corpus timing, with the regressions retained

The corrected candidate uses the same controlled `opt` protocol and matched
one-page FLINT linkage as above. Every sample completes, including authorized
effort retries inside the timed region. The immediately preceding staged
candidate is rebuilt neither mathematically nor with a different allocator.

| Workload | Staged parent ms | Volume-first with skip ms | PARI ms |
| --- | ---: | ---: | ---: |
| All 1,012 fields, summed medians | 2971.098 | 2834.008 | 1444.875 |
| $x^3-39x-569$ | 5.030 | 2.685 | 2.000 |
| `3.1.20636980.1` | 5.885 | 7.591 | 1.625 |
| `3.1.25637479.1` | 7.255 | 6.002 | 1.625 |
| `3.1.45285240.1` | 12.095 | 38.072 | 1.750 |
| `3.1.65734851.3` | 4.869 | 10.297 | 2.000 |
| `3.1.69019020.3` | 16.722 | 4.601 | 1.750 |
| `3.1.73693327.1` | 6.736 | 8.537 | 2.500 |
| `3.1.87899928.1` | 2.057 | 9.001 | 1.750 |

The completed total is 4.6% lower than the paired staged parent and 1.96 times
PARI. This is still not a broad PARI win. It must not be conflated with the
earlier uncompleted volume-first attempt sum. The remaining new declines are
two bounded unit-product constructions and one incomplete class-relation
lattice; changing their diagnostic labels is not an optimization. The
regressions favor investigating evidence-responsive search and compact unit
construction rather than selecting a traversal by polynomial coefficients.

The completed nine-field paired run confirms target ratio 0.53924
(10th–90th percentiles 0.53522–0.54291), while `69019020` improves to ratio
0.27909. The worst regressions remain resolved: `45285240` is 3.17088 times
the parent and `87899928` is 4.39934 times the parent. The original 9399
control has ratio 0.99302 with a range spanning one. All fields in this
corrected paired panel complete; none are excluded. These are empirical
quantiles, not confidence intervals. The repeated 24-field holdout totals
39.354/39.018 ms for parent/candidate, with identical outputs; that small
movement is not evidence of changed mathematical work.

The initial-volume copy has SHA-256
`95cffc96d5e3e53e062c02680c2c2ce258d981ce2ce9bd2dc8d6b65e32e872d4`.
The typed-skip copy has SHA-256
`c1f8251ba3e6180b9b725b3dd11888f41c762a597e6cd6a272e0c0154e603619`;
raw core SHA-256
`005f2b1527683c31ef84645050b267eec87c654605be42293daca6dfabdf03ef`.
The initial-volume copy is 503,765 bytes with 13,048,204 normalized C bytes;
the typed-skip copy is 504,393 bytes with 13,053,433 normalized C bytes.
The latter adds 628 source bytes and 5,229 normalized C bytes, with no
additional owner or matrix allocation. Its compile time is 49.66 seconds.
Final scripts, source copies, small manifests, source/plan/state checks,
native surveys and replay evidence are retained under
`build/cubic-analytic-schedule-evidence/initial24/` and
`build/cubic-analytic-schedule-evidence/volume-skip/`. Scratch originals are
`/scratch/sagejs-runtime/cubic-initial24-r4rDSu` and
`/scratch/sagejs-runtime/cubic-volume-skip-h5KaCx`; controlled remote runs are
`/tmp/cubic-initial24-My9gGo` and `/tmp/cubic-volume-skip-oHPhgb` on `opt`.
Production source and allowance are unchanged. Both copies remain
experimental and require consolidation, fresh holdouts, public receipt
qualification and four-platform/resource review. The serial architecture
rerun again fails only at the already-recorded stale optimizer inventory;
that failed gate is not refreshed away or claimed passing.

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
