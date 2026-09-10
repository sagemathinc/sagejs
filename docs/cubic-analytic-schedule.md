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

## Unit-product budget exhaustion can permit resident discovery

The next source-copy experiment separates a missing affordable witness from an
invalid exact computation. `_cubic_materialize_dependency_unit` now returns
$1$ only for an authenticated unit, $0$ only at its two pre-exponentiation
budget exits, and $-1$ for invalid scales, exact operations, norms or
reconstructed-regulator authentication. The individual exponent limit 4,096
and total limit 16,384 are unchanged. A zero status carries no unit coordinates
that may be published or cached. The staged caller additionally authenticates
the reason and exceeded limit before returning resumable insufficiency;
the nonstaged caller still declines unless the status is exactly one.

This permits more relation discovery, not acceptance on weaker evidence.
The previously collected principal relations remain valid, and the existing
bounded resident schedule may produce a cheaper unit witness or a trivial
class-group presentation. Every eventual result must still pass its original
certificate. No new owner, matrix capacity, arena limit or proof assumption is
introduced. The source has four changed functions. Actual-body tests cover
19 materializer fault/boundary cases, 800 resumption-predicate cases and 150
caller-gate combinations. Stubbed arithmetic in these control tests does not
constitute an independent mathematical oracle.

Across all 1,012 fields, exactly two first-attempt declines become successes;
the other 1,010 complete result records remain identical. First-attempt
coverage becomes 1,006, with no execution errors or new declines. All 64
words agree across FLINT, GMP, generated JavaScript and the one-page FLINT
linkage. Independent certified GP replay checks five fields and 91 principal
relations, including both changed prefixes and three unchanged controls:

- `3.1.20636980.1` previously exceeded the total exponent budget by 20.
  Its class quotient has order two through row 25; row 26 establishes a
  trivial class group. The dependency-unit subgroup also becomes full.
- `3.1.87899928.1` previously requested an individual exponent 4,444.
  Its quotient orders at rows 25, 26 and 27 are four, two and one.
  The unit subgroup still has index two at row 27. This does **not** invalidate
  the trivial-class certificate: a generating factor base with an exact
  determinant-one relation presentation proves class number one without a
  fundamental-unit certificate. No fundamental-unit claim is made here.

The completed controlled `opt` run uses the same serial, retry-inclusive
protocol, matched one-page linkage, and uninstrumented source bodies:

| Workload | Typed-skip parent ms | Unit-budget resume ms | PARI ms |
| --- | ---: | ---: | ---: |
| All 1,012 fields, summed per-field medians | 2846.911 | 2817.370 | 1442.875 |
| `3.1.20636980.1` | 7.590 | 3.857 | 1.500 |
| `3.1.87899928.1` | 8.990 | 3.890 | 1.750 |
| `3.1.45285240.1`, unchanged | 37.443 | 37.333 | 1.625 |

The two restored fields no longer need the host's second effort. The
21-round paired panel resolves their candidate/parent ratios as 0.51534
(empirical 10th–90th percentiles 0.51242–0.51965) and 0.43501
(0.43299–0.43758). The seven unchanged controls have ranges spanning one.
The full total is about 1.95 times PARI; only 8.83 ms of its 29.54-ms reduction
is explained by the two changed fields. Movement on unchanged workloads must
not be attributed to eliminated mathematical work. Reused 24-field outputs
remain identical; totals 38.641/38.376 ms do not establish a new speedup or
constitute fresh holdout evidence.

Candidate source SHA-256 is
`776c3665ecb4950c08e8fe2017fcf78a397dacbaafb69335d6d9f35abd11b1c1`;
raw core SHA-256 is
`46cde49c6e7c49c18b63973916ee5709382f9f96e1c90846e52b5b1572cf75e8`.
Source is 505,382 bytes, normalized C 13,085,018 bytes: increases of 989 and
31,585 respectively. Compilation takes 50.17 seconds. These remain
experimental source copies, above the unchanged 485,000 production source
allowance. Consolidation, public receipts, full independent public replay,
fresh holdouts and platform/resource qualification remain open.

### The next slow field: do not confuse two different index-two gaps

For $f=x^3-x^2+230x-37610$ (`3.1.45285240.1`), exact replay of efforts
5, 1 and 7 checks respectively 47, 45 and 268 principal rows. Effort 5
has quotient order 12 and a full unit subgroup from row 21 onward; it never
closes the remaining class index two. Effort 1 has quotient order 2,460
and only torsion dependency units. Effort 7 has quotient order six and a
full unit subgroup by row 44, but postpones its first proof attempt until
row 268. These are independently checked lattice/unit statements, not a
claim that the native analytic suffix was executed at every earlier row.

Read-only generated-JavaScript admission tracing preserves every result word.
It shows that effort 7's row 44 comes from an ordinary reduced-ideal
ellipsoid at a norm-three ideal, **before compound-product discovery**.
The first effort, by contrast, visits its eight selected ideals, of norms
31, 29, 17, 13 and 11; its eligibility mask excludes the small ideals even
when its resident volume traversal resumes.

One must not infer that row 44 repairs effort 5 just because both preceding
quotients have order 12. An explicit cross-prefix check disproves that
inference: adjoining row 44 leaves effort 5's quotient order 12. Instead,
effort 7's row 17, found at a norm-two ideal, already suffices to reduce
effort 5's quotient order to six. Its element is
$\alpha=(a^2+7a+924)/29$, with norm 47,328. This is a diagnostic witness,
never a special-case input or production search rule. Exact factor bases and
integral bases match between the compared captures. The initial quotient's
nontrivial HNF diagonal entries are six and two; the equality of quotient
orders between two runs did not establish equality of their relation lattices.

PARI 2.17.4, seed one and `bnfinit(f,0)`, starts with 17 factor-base ideals
and 23 relations, then reaches tentative class numbers 24, 12, 12 and six
at relation counts 23, 26, 27 and 29. Its `buch2.c` `small_norm` routine
searches $P_0^{e_0}P_j$, choosing $e_0$ from the squared largest factor-base
norm; here it uses exponents nine for norm two and six for norm three.
After full rank, its relation-admission heuristic targets surviving quotient
generators. This does not modify the mathematical certificate. The debug
trace also warns that fundamental units are not supplied at its current
precision; class-group-only timing must not be described as producing the
same explicit unit certificate as Sage.js. Debug trace timings are excluded.

PARI's targeted products remain useful algorithmic evidence, but the native
trace makes a smaller structural experiment possible first: after typed
certificate insufficiency, admit previously excluded small ideals to the
same resident traversal, preserving all exact certification and resource
limits. Separately, the exhaustive retry needs an earlier proof opportunity.
Neither hardcoded witnesses nor unlimited additional search are justified.

Final source copies, scripts, manifests, corpus checks, paired timings and
exact replays are retained under
`build/cubic-analytic-schedule-evidence/unit-budget-resume/`.
Scratch originals are in
`/scratch/sagejs-runtime/cubic-unit-budget-resume-iY466J`; the completed
remote timing directory is `/tmp/cubic-unit-budget-resume-x1Q1aE` on `opt`.
Multi-effort replay filenames now include the effort: the original script
overwrote per-field GP files between efforts even though its JSON retained
each result. The corrected replay was rerun and retains all three scripts.

## Small-ideal recovery: a useful search, not yet the right schedule

Three further source-copy experiments test the preceding forensic hypothesis.
They preserve the initial prefix and activate previously excluded ideals only
after the existing typed resumption predicate accepts an insufficient proof.
The activation is limited to the 17–24-factor cohort, uses unused cells in the
existing visit-state header, and happens at most once. It preserves each
active region's basis and cursor and begins with the least-norm newly enabled
ideal. Previously excluded slots must have no admitted rows, candidates or
prepared parameters; contradictory state fails closed. No polynomial, label,
known class number or captured witness is consulted.

| Experiment | First-attempt successes | Gains versus unit-budget parent | Losses |
| --- | ---: | ---: | ---: |
| Activate small ideals with expanded volume regions | 1003 | 0 | 3 |
| Use their original bounded ellipsoids | 1003 | 0 | 3 |
| Keep the first small region active across dependent rows | 1005 | 1 | 2 |

All three complete the 1,012-field first-attempt native survey without
execution errors or wrong accepted answers, and all 64 words agree with GMP
and generated JavaScript. The first two are negative controls, not proposed
defaults. Their changed structural-record counts are 28 and 25. Independent
GP replay checks the first experiment's target and three lost fields,
200 principal rows; all four still have incomplete relation lattices.

The second experiment's read-only trace identifies the additional problem.
It does reach the new norm-two ideal, with bounded coordinate limits
$(24,2,2)$, but the four-admitted-row visit quota immediately sends the
cursor back to the large ideals. Admitted dependent relations consume this
quota even when they do not improve the class quotient. Merely enabling the
correct ideal therefore does not execute the useful part of its search.

The third experiment retains that first small ideal until its region is
exhausted, the global relation target requests a proof, or the original
proposal/storage budget stops it. This is not an unbounded visit. The global
staged proof checkpoints and maximum presentation shape are unchanged, and
all successful results still pass the original exact certificate. The
activation body passes 648 deterministic state cases, their 648 repeated-call
idempotence checks, and four contradictory-state faults. These extracted
control-flow tests do not substitute for arithmetic or backend verification.

On `3.1.45285240.1`, the unchanged initial 23 rows give quotient order 12
and a full unit subgroup. The norm-two visit discovers
$(a^2+7a+924)/29$ as row 32, reducing the quotient order to six. This is the
same diagnostic witness identified independently in the older retry, but
it is rediscovered by general native source, not injected. The unchanged
checkpoint policy requests the next proof at row 39, which succeeds and
publishes an independently verified fundamental unit. Thus no host retry,
compound-product search or 268-row presentation is needed for this field.

The third candidate passes certified GP replay of 24 successful fields and
777 principal rows, including all its changed successful records plus three
controls. Separate replay of the two new declines checks 98 principal rows:
`3.1.11856684.1` retains quotient order six although the true order is three;
`3.1.27142115.1` retains order two although the true class group is trivial.
Both have full unit subgroups. These are unresolved class relations, not
insufficient floating-point precision. All 809 fields outside the cohort are
unchanged. Reused 24-field checks and complete one-page linkage parity pass.

The controlled serial `opt` run completes every field, with retries inside
the timed region and matching one-page FLINT linkage:

| Workload | Unit-budget parent ms | Focused small-ideal visit ms | PARI ms |
| --- | ---: | ---: | ---: |
| All 1,012 fields, summed per-field medians | 2828.561 | 2813.116 | 1444.625 |
| `3.1.45285240.1` | 37.548 | 5.724 | 1.750 |
| `3.1.11856684.1` | 4.601 | 18.040 | 2.000 |
| `3.1.27142115.1` | 7.090 | 23.874 | 1.750 |

The target is about 6.56 times faster, but remains 3.27 times PARI. The two
new retries almost cancel its absolute saving. A 0.55% movement in the full
total is not a durable overall speed claim or grounds to promote this
schedule. Preserve the successful earlier policy and investigate a later
bounded recovery transition; also forward strict lattice-change events so
the target can request certification at row 32 rather than waiting to 39.
That earlier certificate opportunity still needs actual native execution,
not merely the retrospective exact lattice/unit oracle.

Of the aggregate 15.44-ms movement, 10.16 ms occurs on the 989 structurally
unchanged records. The target plus its two regressions save only 1.60 ms
in total; the other 20 changed records save 3.68 ms. Do not attribute the
whole aggregate difference to the newly discovered relation.

The completed 11-field paired run confirms target ratio 0.15185
(empirical 10th–90th percentiles 0.15120–0.15320). It also confirms the
two regressions at ratios 3.94798 and 3.40570. Another existing success,
`3.1.65734851.3`, improves to ratio 0.47906; the recently recovered
`20636980` and `87899928` become 3.6% and 12.0% slower respectively.
The original 9399 control spans one. Reused 24-field totals are
39.285/39.254 ms with unchanged outputs. These mixed results support
preserving the earlier schedule, not blanket early activation. The first
paired invocation omitted its required `event` argument and failed before
collecting samples; the corrected invocation completed all 11 fields.

The three source hashes are respectively
`9ea91ba398637fbaaacd4362b6a86bcc210200a9e62111ffb5aeed2a0cf08e6a`,
`8dd8718626149a507fb15e6f9d8db8a7854c9730d6c7fec6983135dab56a1c5a`,
and `3d55c604511f5890eec55cfea49c0706ed99d877a045887617232564b5e125c9`.
Their source/normalized-C byte counts are 507,837/13,159,646,
508,281/13,171,129, and 508,774/13,185,105. The third raw core hash is
`fe53307a43a088be78741ac43df9556e29db3a4f2e51a03459770711f3120927`.
No additional owner or matrix allocation is introduced. These counts are
resource-review inputs, not completed resource qualification; none raises
the production source allowance.

Sources, preparation scripts, checks, manifests and exact traces are retained
under `build/cubic-analytic-schedule-evidence/small-ideal-recovery/`,
`small-ideal-bounded/`, and `small-ideal-visit/`. Scratch roots are
`/scratch/sagejs-runtime/cubic-small-ideal-recovery-QVFyZR`,
`/scratch/sagejs-runtime/cubic-small-ideal-bounded-H6MdjR`, and
`/scratch/sagejs-runtime/cubic-small-ideal-visit-rlbEkf`; the last experiment's
controlled timing directory is `/tmp/cubic-small-ideal-visit-eBNVFM` on `opt`.
All remain unpromoted research copies. The first two are retained precisely
because their coverage failures narrow the next algorithmic decision.

## Preserve the full prefix before small-ideal recovery

Three further source-copy experiments separate event-driven certification from
the time at which excluded small ideals become eligible. Their common parent
is the focused-visit copy above; corpus comparisons use the unit-budget parent.
None changes production source, proof authority, or the 485,000-byte allowance.

1. **Early activation with exact lattice events:** forward the already existing
   strict-lattice-change stop flag when the small-ideal recovery marker is set.
   The retained proposal budget survives each inserted proof attempt. This
   actually certifies `3.1.45285240.1` at row 32, rather than only establishing
   that possibility with the retrospective oracle. It still loses both
   `11856684` and `27142115`: earlier checks do not repair the search-order
   regression. First-attempt coverage remains 1,005/1,012, with 37 structurally
   changed records. No controlled timing improvement is claimed for this copy.
2. **Late recovery:** admit previously excluded ideals only after the original
   final staged insufficiency. Preserve all earlier prefixes and use one
   additional bounded resident pass. This gives 1,007/1,012 first-attempt
   successes, no losses, no errors, and exactly identical full outputs on the
   other 1,011 inputs. Target checkpoints are 23, 39, 40, 43, 47, 54; the new
   class relation and certificate arrive at row 54.
3. **Recovery after the original full prefix:** the protected fields actually
   finish at checkpoints 24/40 and 26/34 respectively. Instead of waiting for
   every incremental extension, preserve the original full-prefix collection
   and permit the one-time transition after its insufficient proof. This
   retains 1,007/1,012 first-attempt successes with no losses or errors. Target
   checkpoints become 23, 39, 46. Only one other full output changes:
   `3.1.3229112.1` publishes the negative of the parent's fundamental unit;
   its class group and all other output words are unchanged. Its captured
   checkpoints are 26, 42, 44. This is a scheduling rule, not polynomial,
   discriminant, class-number, or known-witness dispatch.

All three candidates pass complete 1,012-field FLINT/GMP/generated-JavaScript
64-word comparisons and matched one-page linkage checks. For the latter two,
all 797 fields in the frozen at-most-16-factor cohort and all 203 in the
17-through-24 cohort now succeed on the first native attempt. The remaining
five initial declines are above 24 factors: `23984479.2` (31), `47391719.2`
(30), `54759159.1` (25), `93074700.2` (25), and `96582828.1` (25), with the
common `3.1.` label prefix. Four report analytic insufficiency; `93074700.2`
has rank 24 in 25 columns. Retained phase-eight reason words are not evidence
of a unit-reconstruction failure.

### Boundedness and mathematical authority

Activation still requires the exact proof helper's typed insufficiency,
17 through 24 factors, active volume traversal, and an unused activation
marker. The two delayed variants additionally require full modular rank.
Previously prepared plans, live cursors, exact rows and units remain resident;
contradictory state remains fatal. The marker is set once even if no excluded
ideal is available. Only finding an eligible ideal resets the staged counter.
It therefore cannot restart this extra pass repeatedly.

The delayed pass may use the final row of the **already allocated**
$2n+22$-row presentation workspace, instead of the previous $2n+21$ checkpoint
ceiling. This is an explicit increase in usable rows, not in allocation or
the hard capacity. Full modular rank is required because the collector stops
before another admission once both that rank and the target count are reached.
Raw admission storage is larger; all downstream presentation and dependency
arrays were already allocated for $2n+22$. The post-collection shape and
online-count checks remain unchanged. Strict lattice events request a proof
only; they preserve the remaining proposal budget and do not establish
completeness themselves. Exhausted searches still decline, and invalid exact
operations are not reclassified as insufficiency.

Actual-source activation tests exercise 8,640 states, 8,640 repeated-activation
checks, and four contradictory-state failures for each variant. AST comparison
confirms that only the top-level native orchestration function differs from
the focused-visit parent. These are control-flow checks, not a mathematical
certificate proof. Independent GP replay checks 38 successful early-event
fields/1,153 principal rows, its two declines separately, four late-recovery
fields/92 rows, and five post-prefix fields/128 rows. The checker verifies
principal ideal identities, prefix lattices, relation-kernel units, and the
published unit or trivial-class proof as applicable; it does not replace
full public Sage.js receipt qualification.

### Controlled late-recovery measurement and new neighbors

The serial `opt` late-recovery run completes all 1,012 fields, with the existing
retry sequence inside the clock. Parent/candidate/PARI totals are
2,893.976/2,864.792/1,454.875 ms. Target `45285240` improves
38.531 to 15.117 ms versus PARI 1.750 ms. The two protected fields remain
4.772/4.768 ms and 7.111/7.088 ms respectively. Paired target ratio is
0.39288 (empirical tenth–ninetieth percentiles 0.38917–0.39705); both protected
fields' ranges span one. One unchanged control, `20636980`, has a 0.67% paired
increase, so do not claim literally zero timing movement outside the target.
Of the 29.184-ms aggregate saving, 23.414 ms comes from the target; the rest
is movement on unchanged outputs. This is about a 1% corpus improvement,
still 1.97 times PARI, not a broad PARI win. Reused 24-field totals are
39.052/39.025/27.250 ms with unchanged outputs.

After freezing the late candidate, a new deterministic coefficient panel uses
$x^3-x^2+230x-37610+29^2k$ for $k=-12,\ldots,-1,1,\ldots,12$.
All 24 polynomials are irreducible complex cubics, absent from the development
corpus, and independently checked using `bnfcertify`. Every field completes
with identical parent/candidate attempts and three-backend outputs. Exact
replay checks all 686 principal rows. Controlled totals are
113.168/112.998/41.750 ms: regression evidence, not a demonstrated new-regime
speedup. The source was fixed before checking these answers.

For the later post-prefix candidate, a separately frozen panel takes
$k=-24,\ldots,-13,13,\ldots,24$. The initial validation correctly stops on
$k=-24$, whose polynomial is reducible. Its failed log is retained; the
qualified panel records that exclusion explicitly and keeps all other 23
fields without filtering by class group, Sage.js success, or speed. All 23
pass certified PARI checks, complete with unchanged parent/candidate attempts,
and agree across three backends. Exact replay checks 697 principal rows.
These panels are coefficient neighborhoods, not new LMFDB stratified samples,
and neither is evidence that the new recovery branch itself was exercised
on unseen fields.

### Post-prefix timing and the cost of repeated certification

The post-prefix candidate also completes the full controlled corpus. Its
parent/candidate/PARI totals are 2,903.141/2,851.796/1,457.500 ms, about a
1.77% aggregate improvement and still 1.96 times PARI. First-attempt declines
fall from six to five; every field completes with the existing retry policy.

| Field | Parent ms | Post-prefix recovery ms | PARI ms |
| --- | ---: | ---: | ---: |
| `3.1.45285240.1` | 38.907 | 8.582 | 1.750 |
| `3.1.3229112.1` | 17.458 | 9.845 | 1.750 |
| `3.1.65734851.3` | 10.439 | 7.189 | 2.000 |
| `3.1.11856684.1` | 4.610 | 4.613 | 2.000 |
| `3.1.27142115.1` | 7.279 | 7.272 | 1.750 |
| `3.1.97410060.2` | 19.068 | 20.440 | 1.875 |

The 12-field paired run confirms ratios 0.22022, 0.57174 and 0.68753 for
the first three fields (empirical tenth–ninetieth ranges
0.21774–0.22193, 0.56649–0.57889, and 0.68278–0.69095). Every other panel
range spans one, including both protected fields. This isolates useful
improvements without claiming that all fields become faster.

The `65734851` result is instructive: its entire final output is unchanged,
but its checkpoints change from 23/39/40/43/47 to 23/39/50. It collects
**more** rows, yet avoids two failed certification attempts and is faster.
Exact replay of its 50-row prefix and published unit passes. Likewise,
`3229112` changes 26/42/43/46/50 to 26/42/44. Final output equality alone
is not an adequate proxy for equal work, and minimizing relation count alone
does not minimize time. In the three `45285240` scheduling traces, the norm-two region
rediscovers the same diagnostic element $(a^2+7a+924)/29$ at row 32, 54,
or 46 according to scheduling; the element is never supplied to the algorithm.

The two protected fields and the target initially all have class-quotient
index two and full unit subgroups, as checked by exact prefix replay.
Consequently, that mathematical condition alone does **not** distinguish
which field benefits from early small-ideal activation. A class-number or
polynomial-specific dispatch would hide this scheduling problem rather than
solve it. Preserving the original full prefix before a one-time transition
is the tested general policy here, not a claimed optimal policy.

The complete 1,012-field checkpoint audit finds exactly four changed traces,
while verifying all 64 output words against each implementation's survey.
The fourth, `3.1.97410060.2`, is a genuine regression despite identical final
output. Its paired ratio is 1.08794 (1.08092–1.09444), measured in a separate
21-round single-field continuation of the same controlled run. It changes
28/44/45 checkpoints to 28/44/66. Exact parent/candidate replay checks 45/66
principal rows and establishes the distinction: the class quotient already
has the correct order 27 at row 28; the unit subgroup index falls from 20 at
28 to two at 44. The old traversal reaches unit index one at 45, the new
traversal at 52, but the new program waits until 66 for certification. No
class-lattice event occurs when those last missing units arrive.

This narrows the next experiment to unit-progress-aware checkpoint requests,
or a better bounded periodic policy, while preserving the original traversal
state. A heuristic can request an exact check; only the unchanged exact proof
may accept. Do not promote the post-prefix schedule as regression-free or
infer a unit-progress event from final class-number equality. These are still
research copies, and none of the three improving fields beats PARI here.

The three tabulated improvements account for 41.188 ms of the 51.345-ms
aggregate movement; the fourth changed trace loses 1.372 ms. The remaining
11.529-ms movement is on the other 1,008 unchanged checkpoint/output records.
Do not credit that entire remainder to the new relation.
The reused 24-field totals are 40.038/40.196/27.625 ms; the fresh qualified
23-field totals are 107.527/107.115/40.750 ms. Outputs and attempt sequences
are unchanged on both panels. Timing uses the same serial `opt` CPU-zero
protocol, matching one-page FLINT linkage, rotated full-corpus samples, and
21-round alternating paired samples described above. Inputs and external
scratch are preallocated: these are not public-API timings.

Sources and preparation scripts are retained in
`/scratch/sagejs-runtime/cubic-small-ideal-events-nnuarw`,
`/scratch/sagejs-runtime/cubic-small-ideal-late-x9eENx`, and
`/scratch/sagejs-runtime/cubic-small-ideal-after-prefix-HFF822`.
Their respective source hashes are
`6725ac412d0dedc696ee420ef2a82686293ff23520bdb23a7eb09fc0c57b74f4`,
`d2ffeedc44e95e5020e24d458ddaff1d3184faa84969f772617b9eb4f9d5af2f`, and
`63fc5b19e5f611099edafe13dcaf031e92517c2520af3be78a838a6f353cdaaa`.
Source byte counts are 508,804, 509,431, and 509,436, all above the unchanged
production allowance. No new owner or matrix is introduced. Exact source
and generated-core identities, raw checks and timing protocols remain
experimental resource-review inputs, not completed release qualification.
Both delayed variants have 13,199,993 normalized generated-core bytes.
The post-prefix raw core hash is
`bd10a22d41f9512b887aff993623af5ae70d101fb480c75228b6420be5b9be75`.
Controlled timing directories on `opt` are
`/tmp/cubic-small-ideal-late-CHlGkN` and
`/tmp/cubic-small-ideal-after-prefix-4EiHwg`; all runs are terminal.
Sources, preparation/checker scripts, manifests, exact traces and timing data
are also preserved under `build/cubic-analytic-schedule-evidence/` in the
`small-ideal-events`, `small-ideal-late`, and `small-ideal-after-prefix`
directories. Each has a file-hash archive manifest. Generated build caches
and copied addon binaries are deliberately excluded from these smaller
evidence archives; original build/linkage manifests retain their identities.

### Power-aware recovery policy

A fourth source-copy experiment uses an existing exact observation to choose
between post-prefix and late recovery. On `45285240` and `65734851`, the
existing residue screen already excludes square, cube and fifth roots of
either signed retained unit. On `97410060`, the square obstruction is absent.
The read-only actual-call trace records these results and checks all final
output words. `3229112` has no retained nontorsion unit at its failed prefix,
so there is no unit to screen there.

Within the existing recovery eligibility guard, inspect only an authenticated
unit-cache entry at the current analytic scale. Before the last staged
attempt, retain the original incremental checks unless all three exact local
obstructions are present. With no such cached unit, allow the post-prefix
discovery pass; after final staged exhaustion, retain the one-time late pass
regardless. Invalid residue-map premises remain fatal. A missing obstruction
is **inconclusive**, not evidence that the unit is a power. Even the presence
of all three obstructions is not a claim of primitivity: larger prime indices
remain possible. This is solely a general, mathematics-informed scheduling
heuristic; the full exact acceptance rule is untouched.

This fourth copy retains 1,007/1,012 initial successes, no losses or errors,
and complete 1,012-field FLINT/GMP/JavaScript/linkage agreement. All final
outputs equal the post-prefix candidate's. The complete checkpoint trace now
has only the three improving executions: `97410060` returns to 28/44/45,
while 26/42/44, 23/39/46 and 23/39/50 are retained for the other three.
Exact six-field replay checks 259 principal rows, including all three
previously regressing fields. Actual policy/activation-body tests cover
18,432 states, 96 screen calls and 48 fatal invalid-map cases; the residue
arithmetic is explicitly stubbed in this control test, with actual residue
execution covered separately. AST comparison confines the change to the
native orchestration function. The reused 24-field control and both earlier
neighbor panels (47 fields total, now reused) retain identical attempts and
all three-backend outputs.

Controlled parent/candidate/PARI totals are
2,841.992/2,770.868/1,442.750 ms, with every field completing. Selected times
are 37.584/8.192/1.750 for `45285240`, 17.272/9.781/1.750 for `3229112`,
10.302/7.019/1.875 for `65734851`, and 18.840/18.623/1.875 for `97410060`.
The three improving fields' paired ratios are 0.21876, 0.56577 and 0.68913;
their empirical tenth–ninetieth ranges are respectively 0.21773–0.21980,
0.56243–0.57061 and 0.68588–0.69373. Every other field in the original
12-field paired panel spans one. The fourth regression field is measured
separately because the timing bundle was generated before that label was
added to its preparation script; the preserved actual driver and results
identify the real panel, not the intended one.
That separate completed run gives `97410060` ratio 0.99834, with empirical
tenth–ninetieth range 0.99501–1.00236. It no longer exhibits the preceding
8.8% regression. These measurements support retaining the screened policy
for further qualification, not a universal no-regression guarantee.

The aggregate movement is about 2.50%, still 1.92 times PARI. Only 40.166 ms
of the 71.124-ms difference comes from the three changed checkpoint traces;
do not attribute the remaining 30.958 ms on unchanged traces to this policy.
The reused 24-field totals are 39.020/38.661/27.500 ms. The original
$x^3+9x-55$ anchor remains 1.266 ms versus PARI 1.000 ms, and
$x^3-x^2+3x-4$ is 0.851 ms versus PARI 0.875 ms; the latter difference is
too small for a meaningful speed-win claim with this sampling resolution.
All are resident-kernel measurements with preallocated external scratch,
not end-to-end public API or startup timings.

The source is `/scratch/sagejs-runtime/cubic-small-ideal-power-aware-peWQpb/aware.py`,
SHA-256 `5d007de348effb7e86acf3c984f420aa7903306d97c7a53ca0de90a918903239`.
It has 511,196 source bytes and 13,233,368 normalized generated-core bytes;
raw core SHA-256 is
`ff5059deac8a1c9d5fb48593eb34d65a36dd792018db97118aa9e533cbd9abdb`.
There is no new owner or matrix, and no production allowance is raised.
The controlled directory is `/tmp/cubic-small-ideal-power-aware-iOS99j` on
`opt`. This is an improved research candidate, not a production promotion:
public-certificate integration, source consolidation, wider unseen regime
coverage and platform/resource qualification remain necessary.
The smaller source/script/data archive is
`build/cubic-analytic-schedule-evidence/small-ideal-power-aware`, with file
hashes in `archive.json`; `final-checks.cjs` checks the authenticated artifacts,
all backend/linkage observations, control cases, exact replay and timing
completion. The current controlled runs and local diagnostic checks are all
terminal. Merge checks, all 192 unit files and documentation checking pass
after an 8m30s build; the architecture rerun still stops at the unchanged
stale optimizer inventory. Final report edits receive a separate documentation
check rather than being represented as part of the earlier wrapper run.

## Extending coordinated resident scheduling through 32 ideals

The next smallest-discriminant initial decline is `3.1.23984479.2`,
$f=x^3-x^2+184x+8367$, with $h=6$, cyclic class group, and 31 factor-base
ideals. Read-only generated-JavaScript snapshots reproduce every output word
of the uninstrumented FLINT and GMP executions. Independent PARI replay
checks the maximal-order basis, every principal ideal relation, relation-kernel
units, and `bnfcertify`. The old effort-five attempt collects **56 raw rows**,
not 37: 37 is its reduced presentation size. Its exact quotient has order 12
and its kernel units already generate the full unit group modulo torsion.
The effort-one retry collects 87 raw rows, although its quotient first reaches
6, with unit index one, at row 61.

Adding retry row 61 alone to the failed effort-five lattice lowers its index
from 12 to 6. Its independently factored generator is

$$
\alpha=\frac{-a^2+11a+291}{9},\qquad N(\alpha)=-137381.
$$

Its principal ideal factors over the existing ideals of norms 37, 47, and 79.
The actual call trace places it in the ordinary four-vector shell, not an
ellipsoid callback. The initial diagnostic script's ellipsoid-only assertion
therefore failed; the corrected checker records shell provenance rather than
inventing an ellipsoid certificate. This element is diagnostic evidence,
never an input, lookup entry, or special case in the algorithm.

PARI 2.17.4's seeded debug trace uses the same 31-ideal factor base through
107. Nine rational relations and 28 small-norm relations from seven ideals
give tentative order 12 and regulator approximately 61.4571. It then requests
two targeted relations and obtains order 6 without changing the regulator.
The `small_norm` implementation forms a powered multiplier: here an ideal
above 3 has exponent $\lfloor\log_3(107^2)\rfloor=8$, and the next search
multiplies it by an ideal above 79. The full-rank targeting branch temporarily
marks surviving class-group generators as missing to guide relation admission.
These are search heuristics, not substitutes for the final index test.
Debug timestamps are not controlled performance measurements.

### Coordinated eligibility experiment

A frozen source-copy experiment changes nine comparisons from
`factor_count <= 24` to `factor_count <= 32`. They jointly govern the stable
norm ordering, per-ideal visitation storage, initial-volume dispatch, staged
presentation allocation, and subsequent bounded recovery. AST normalization
proves that these nine constants are the only syntax-tree changes. No exact
acceptance rule, allocator limit, global factor/relation limit, or owner
declaration changes. Existing formulas can allocate larger matrices in the
newly admitted regime: the largest staged presentation there is $86\times32$.
That dimension check is not a proof of peak arena consumption.

An existing presentation-allocation comment says that rows beyond the target
must increase modular rank. That comment is not a valid argument for these
research copies: admission deliberately retains dependent rows while rank
is deficient. Safety relies on actual capacity checks and fail-closed exits,
not that obsolete counting claim; source consolidation must correct it.

All 1,012 development fields now certify on effort five, with no errors or
coverage losses. Exactly ten fields change output/checkpoint traces; the other
1,002 retain all 64 output words and their checkpoint sequences. The two
fields with 34 and 36 ideals remain outside the extension and unchanged.
Complete FLINT/GMP/generated-JavaScript comparisons pass both with the normal
linkage and with the experimental one-page FLINT linkage used for timing.
Independent replay validates the ten changed fields, totaling 426 principal
rows. This is exact oracle replay, not full public Sage.js receipt replay.

The selected field now certifies once at 68 raw rows. Its first full rational
rank occurs there, so simply inserting an earlier proof checkpoint would not
help this execution. At row 37 its rank is 26, with the norm-47, norm-59 and
norm-61 columns entirely absent. At row 67 its rank is 30 and only the norm-47
column is absent; row 68 fills it. The traversal visits eight large ideals,
two locally redundant ideals, then revisits large ideals. This identifies a
concrete next question: use missing factor support to direct discovery rather
than waiting for an incidental factor in another large-ideal search. Such
guidance must remain separate from exact certification.

There is also a more precise admission-policy difference. In PARI's
`Fincke_Pohst_ideal`, `relid` advances only when `add_rel` returns positive.
While rank is missing, `add_rel_i` admits independent rows and a limited
supplementary tail; other dependent nonzero rows can be rejected. A pure-unit
zero relation may be stored while returning zero and therefore does not consume
the per-ideal quota. Our volume traversal increments `visit_rows` by every
newly retained row. Retaining dependent exact witnesses is deliberate and must
not be removed merely to imitate PARI. Instead, a follow-up can test separating
witness retention from the per-ideal progress quota, using modular rank and/or
exact lattice progress as scheduling signals. That experiment has not yet
been implemented or timed; the frozen 32-ideal results above do not include it.

### Fresh neighboring fields

After freezing the candidate, the panel fixes
$x^3-x^2+184x+8367+81k$ for $k=-12,\ldots,-1,1,\ldots,12$.
All 24 polynomials are irreducible and complex, and canonical `polredabs`
comparisons show distinct fields not represented in the 1,012-field corpus.
No input is excluded or selected by Sage.js success or speed. Each PARI result
passes `bnfcertify`; both implementations succeed on effort five, and all
three backends agree on every output word. Independent candidate replay checks
another 515 principal rows. Only three of these fresh fields have 25–32 ideals;
the panel does **not** establish 24 fresh activation cases for the new regime.

### Controlled timing

Serial CPU-zero runs on `opt` use matched one-page FLINT linkage and the same
preallocated-scratch, retry-inclusive protocol as the preceding experiment.
Across all 1,012 fields, sums of per-field medians are 2,785.844 ms for the
power-aware parent, 2,677.978 ms for this candidate, and 1,443.250 ms for PARI.
Every computation completes. The candidate remains **1.86 times PARI**, not
an overall PARI win. Of the 107.866-ms aggregate difference, 97.576 ms comes
from the ten changed executions; the other 10.290 ms occurs on unchanged
traces and should not be attributed wholesale to this scheduling change.

| Field | Parent ms | Candidate ms | PARI ms | Paired candidate/parent |
| --- | ---: | ---: | ---: | ---: |
| `23984479.2` | 25.847 | 12.082 | 2.750 | 0.46907 |
| `47391719.2` | 20.327 | 7.157 | 2.250 | 0.34937 |
| `54759159.1` | 17.056 | 4.088 | 1.750 | 0.23838 |
| `93074700.2` | 40.800 | 6.442 | 1.750 | 0.15811 |
| `96582828.1` | 17.757 | 3.488 | 1.750 | 0.19494 |

The paired panel contains all ten changed fields, the two above-range fields,
and four earlier controls. It uses 21 alternating ABBA/BAAB rounds, ten calls
per sample, and 200 warmups per implementation and field. All ten changed
fields have empirical tenth–ninetieth ratio ranges below one; all six unchanged
controls have ranges spanning one. For the selected field the range is
0.46678–0.47251. These are empirical ranges, not confidence intervals or a
universal no-regression guarantee.

The fresh 24-field totals are 81.353/71.720/39.625 ms for parent/candidate/PARI.
Exactly the three newly admitted-regime fields change output words; all others
remain identical. The rotated samples exposed a possible fresh regression,
so a separate completed paired run measures all three changed neighbors.
For $k=-8,6,12$, paired ratios are respectively 0.35186, 1.03941 and 0.62795;
the empirical tenth–ninetieth ranges are 0.35005–0.35418,
1.03611–1.04377 and 0.62447–0.62972. Thus the roughly **3.9% regression at
$k=6$ is real in these measurements**, not hidden by the panel's aggregate gain.
That field changes from 48 to 50 raw rows and publishes the opposite sign of
the same fundamental unit. An additional exact replay checks the parent's
48 principal rows. It is a retained regression witness for the next scheduling
experiment, not grounds for a polynomial-specific dispatch rule.
None of these numbers includes public wrapper allocation,
startup, or a full public certificate replay. All timing processes are terminal;
the preserved remote directory is `/tmp/cubic-staged32-V7iTop` on `opt`.

The frozen candidate has SHA-256
`14844519b1d825edd744f5a602acc0a681118757abfa446749805197ae4f035a`,
511,196 source bytes, and raw generated-core SHA-256
`5ac51c8bdefe8b8dc39d5545fbd5788f28f000406efc58e548eb53fa4414b492`.
Source size is unchanged from the parent and still above the unchanged 485,000
production allowance. Source, preparation and checker scripts, exact GP
programs, traces, manifests and raw observations are retained in
`/scratch/sagejs-runtime/cubic-large-base-forensics-WF5td7`.
The smaller hashed archive is
`build/cubic-analytic-schedule-evidence/staged32`; it excludes generated build
caches and addon binaries while retaining their identities and reproduction
scripts. `summarize.cjs` authenticates the candidate/core identities, complete
backend/linkage observations, exact replays, and finished timing artifacts.
The subsequent fresh paired check and parent replay have their own hashed
supplement at `build/cubic-analytic-schedule-evidence/staged32-fresh-paired`.
This is a research candidate, not production promotion or platform qualification.

## Progress quotas: a negative experiment and a powered-ideal witness

The next experiment separates retained witnesses from the per-ideal quota.
For $25\leq n\leq32$, while modular rank is deficient, each newly retained
row advances that quota only if the existing exact online HNF transcript
records a lattice change. Every admitted dependent witness remains stored.
Once full rank is known, the original raw-row quota remains in force.
No mathematical acceptance rule, owner, helper ABI or resource allowance changes.
Source `quota.py` has SHA-256
`f6de7b705c7156cff865bb06225d454f2ddf9c3eb7b0515658d3ff1cd920fcac`
and 511,803 bytes; generated core SHA-256 is
`9fc1bd9e77f0c4c640d6d9e97c73a808ac080c17c794214e170472db191baef2`.
It remains an over-budget research source copy, not production code.

All 1,012 first attempts still succeed, with no errors or coverage losses.
Normal and one-page FLINT linkage each pass complete FLINT/GMP/JavaScript
64-word comparisons. The actual quota-selection/update blocks pass 240,240
control cases. Exact GP replay checks 446 principal rows across all ten fields
in the potentially affected larger regime, plus 94 rows on the three changed
members of the previous 24-field holdout. That panel is **reused**, not newly
unseen evidence for this successor. These checks are not full public Sage.js
certificate replay or a Lean formalization.

Final-output comparison alone misses two changed executions. A complete
1,012-field scalar call/return trace of presentation, volume-leaf and ideal-plan
operations identifies nine changed fields, versus seven changed final outputs.
In particular, `3.1.54759159.1` still publishes the same 64 words and attempts
certification at 31 rows, but its last two rows now come from continuing ideal
20 rather than planning ideal 19. Its paired runtime increases by about 48%.
An identical answer and checkpoint count do not establish identical work.

Controlled serial `opt` timing uses the same one-page allocator on both sides,
the previous rotated full-corpus protocol, and 21 alternating ABBA/BAAB rounds
for paired panels (10 calls per sample, 200 warmups, 84 samples per field).
Ratios below are candidate/parent; the displayed ranges are empirical p10/p90,
not confidence intervals.

| Field | Parent ms | Quota ms | PARI ms | Paired ratio [p10, p90] |
| --- | ---: | ---: | ---: | --- |
| `3.1.23984479.2` | 12.065 | 14.420 | 2.625 | 1.2054 [1.2019, 1.2083] |
| `3.1.25195212.7` | 6.171 | 8.694 | 1.625 | 1.4047 [1.3961, 1.4140] |
| `3.1.47391719.2` | 7.159 | 6.779 | 2.250 | 0.9568 [0.9529, 0.9621] |
| `3.1.57663252.3` | 7.022 | 5.269 | 2.000 | 0.7636 [0.7596, 0.7709] |
| `3.1.93074700.2` | 6.453 | 10.901 | 1.750 | 1.7079 [1.6995, 1.7232] |
| `3.1.95903148.1` | 9.429 | 6.798 | 2.125 | 0.7340 [0.7303, 0.7362] |

Full-corpus summed medians move from 2717.448 to 2685.157 ms, versus PARI
1443.750 ms. **This is not evidence for promoting the quota policy:** the nine
changed traces collectively become 6.466 ms slower; the apparent aggregate
gain comes from 38.757 ms of movement elsewhere. Small paired shifts also
occur on unchanged controls, so do not attribute those globally to scheduling.
The reused 24-field panel moves 72.096 to 69.243 ms versus PARI 39.625 ms.
Its three changed cases have paired ratios 0.9393, 0.6951 and 0.9385, including
an improvement on the prior fresh regression. Those gains do not erase the
development-panel regressions.

The trace explains one failure mode: dependent rows do not advance the quota,
so a visit can linger on an ideal that adds little lattice information. A
second source copy, `responsive.py`, rotates after a batch with no exact HNF
change. Its SHA-256 is
`8bc51a168776b9875f98936ea617134fdd0445e8ade6d9519a0a502d8f8fe059`
(512,104 bytes). Its actual control blocks pass another 240,240 cases. A
finite-state check bounds retained rows in a rank-deficient progress visit
by $4+3+2+1=10$, conditional on the leaf respecting its remaining raw-row
quota; this is not a global presentation-capacity or arena bound.

This variant has 1,011/1,012 first-attempt successes across all three backends:
the selected field `3.1.23984479.2` declines again. No controlled speed claim is
made for it. Exact replay of its 70-row failed prefix proves full rank, a
relation quotient of order 12, and unit subgroup index one. Its 87-row retry
has quotient 6 and unit index one; both prefixes' 157 principal rows replay.
Thus this failure is neither missing rational rank nor a missing fundamental
unit. It is an unsaturated class-relation lattice.

### A concrete powered-ideal search to implement next

The failed 70-row HNF has nontrivial diagonal entries at factor ideals of norms
3 and 79, with diagonals 6 and 2. This identifies quotient generators; it does
not assert that their orders in the true class group equal those diagonals.
The old retry witness
$(-a^2+11a+291)/9$ independently reduces this new failed quotient from 12 to 6
as well. Its principal ideal and the enlarged lattice determinant are checked
again, not inferred from its usefulness for the earlier failed prefix.

PARI's `buch2.c` provides a more systematic route. After full class/unit rank,
the `LIE` branch directs search toward the primes generating the remaining
quotient. `small_norm` multiplies a target ideal by a power of a small ideal,
with exponent chosen by exact integer logarithm of the largest factor-ideal
norm squared. On this trace it searches $\mathfrak p_3^8\mathfrak p_{79}$,
since $e=\lfloor\log_3(107^2)\rfloor=8$, and records relations supported on
norms $(3,79,107)$ and $(3,67,79)$.

An independent exploratory GP probe derives the targets from the failed HNF
and the exponent from the factor norms, constructs the powered product, and
uses its $T_2$ geometry with PARI's volume policy. Its bound is approximately
$113676084.61$, agreeing with the debug trace's rounded $1.137\cdot10^8$.
The first returned primitive candidate is

$$\alpha=\frac{4a^2+172a+123}{9},\qquad
N(\alpha)=-55460133=-3^8\cdot79\cdot107.$$

Exact ideal factorization verifies its complete relation vector, not merely
its norm, and adjoining that row changes the failed quotient from 12 to 6.
It matches PARI's first printed factor-support pattern. The probe uses
floating geometry for discovery and GP's `qflll`/`qfminim`; it does **not**
establish identical private PARI reduction/enumeration order. It also uses the
oracle class number to stop the diagnostic search, which must not become an
implementation stopping rule. Native implementation must use the unchanged
independent exact certification. The probe's first run failed because `I` is
a reserved GP constant; that failed log is retained beside the corrected run.

This is the next structural opportunity: preserve successful prefixes, then
use the remaining quotient to choose powered-ideal discovery. Neither quota
experiment is promoted. Existing ideal-product/power primitives should be
reused with explicit bounds and resident scratch, not a second hidden CAS.
The source already has `_cubic_prime_ideal_power_basis` and
`_cubic_compound_prime_ideal_basis`, including a bounded integer-power schedule.
However, compound search is enabled only for efforts 6--8, requires incomplete
relation collection and no discovered unit, plans broad products, and uses
reduced four-direction shells. That is not the demonstrated regime: a
full-rank, unit-complete but uncertified quotient needs a **targeted powered
ellipsoid after failed certification, in the same resident call**. Merely
enabling the old broad compound loop earlier would not implement this contract.
No polynomial, witness, exponent or answer from this diagnostic may become a
special-case dispatch rule.

Sources and raw evidence are retained under
`/scratch/sagejs-runtime/cubic-rank-progress-quota-OpYkuY` and
`/scratch/sagejs-runtime/cubic-responsive-quota-xDvPqB`.
The checked 109-file, 12,299,559-byte archive at
`build/cubic-analytic-schedule-evidence/progress-quota-campaign` preserves
sources, scripts, manifests, exact GP programs/logs, call traces and all timing
observations, excluding generated caches and addon binaries. `summarize.cjs`
authenticates the source, backend/linkage scope, replay inputs, timing drivers
and changed-execution attribution. Source consolidation, public replay,
platform qualification and the existing architecture-inventory failure remain
open.

## Validation status

- The coordinated 32-ideal research report passes changed-file merge checks,
  all 192 unit-test files and documentation checking after a fresh 8m31s build
  (621.08s for the complete recorded changed-file command). Six focused tests,
  the nine-guard AST/dimension check, artifact-summary authentication and the
  separate fresh paired-regression checker also pass. The architecture gate
  still stops at the known stale optimizer inventory; neither that inventory
  nor the production source allowance was changed. These worktree gates do not
  substitute for the separate research-artifact replay/linkage checks above.
- The current unit-budget and small-ideal research follow-up passes the
  changed-file merge checks, all 192 unit-test files and documentation checking
  after a fresh 8m36s build. Its explicitly identified source-copy/backend and
  exact-oracle checks are separate from those production-worktree gates.
  The serial architecture rerun still fails at the known stale optimizer
  inventory after preceding FFI/native/Wasm/resource checks pass; no manifest
  was refreshed to hide that failure.
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

## Powered quotient recovery: measured gains, scheduling regressions (2026-09-10)

This is a research source-copy campaign, **not a production promotion**. The
production module and its 485,000-byte allowance are unchanged. The frozen
parent is the previous `staged32.py`, SHA-256
`14844519b1d825edd744f5a602acc0a681118757abfa446749805197ae4f035a`.
The interleaved candidate `powered-v3.py` is 524,231 bytes, SHA-256
`2481411bccc458176c62fbaafb8f3782012dbda4b31b2dae16da3d219c3f0488`.
Its generated isolated core is 17,962,615 bytes, SHA-256
`9149b9c443f01f8951457ad44aa421b79a336eee487184283d793d69a24fd134`.
The source-size/resource review is therefore still a release prerequisite.

### New mathematical work and unchanged proof authority

After an explicitly resumable, unsuccessful exact certification, the new
`_cubic_resume_powered_quotient_search` can target unresolved row-HNF quotient
coordinates. It chooses a smallest-norm ordinary factor-base ideal $P$, derives
$e=\lfloor\log_{N(P)}(M^2)\rfloor$ from the largest factor-base norm $M$, and
searches reduced ellipsoids in products $P^eQ$. The target ideals $Q$ are
visited in descending coordinate order where the current row-HNF diagonal is
greater than one. The power exponent is checked against a bounded policy;
an excessive value exhausts this discovery pass rather than silently changing
the selected power. Row-HNF targets need not coincide with the column-HNF
generators in the earlier GP forensic probe, and neither identical LLL bases
nor identical PARI enumeration order is claimed.

The helper calls the existing exact ideal-power/product, embedding, LLL,
ellipsoid, smooth-principal-relation admission, and online-HNF machinery. If an
enumerated $\alpha$ yields a verified factorization
$(\alpha)=\prod_i\mathfrak p_i^{a_i}$, its exponent row is a valid relation
regardless of how the search proposed it. Adding such rows preserves the
surjection from the presented group onto the class group once generation has
been certified. It does **not** prove that the remaining kernel is trivial.
The existing exact closure and publication rules remain responsible for that.
Search failure is not a proof of nonexistence; an HNF change requests another
proof attempt, never an answer.

The root owns three new matrices: transforms $3\times3$, parameters
$1\times11$, and persistent traversal state $1\times10$: 30 additional
`fmpz` cells in three owners. Its borrowed search bundle shares the existing
factor base, relation witnesses, online HNF and membership scratch. Integer
slots 7954–7971 reuse the compound-product scratch in this staged regime;
ordinary adjacent plans and their cursors are not replaced. The 8,192-slot
workspace, relation/power/coordinate/candidate limits and 1 MiB resident / 3 MiB
arena call budgets are unchanged. Existing proof/admission function bodies and
top-level constants are AST-identical to the parent; only the root changes and
one helper is added. These checks do not substitute for platform/resource
qualification.

The first build exposed a compiler limitation: augmented indexed assignment
on `FmpzMatrix` is rejected. Two counter increments now use explicit
read/add/store. This is a recorded compiler improvement opportunity, not a
handwritten-native escape hatch.

### Why interleaving is necessary—and not sufficient

The first compiling policy loses `3.1.61822200.1`: dependent powered witnesses
fill its 62-row storage before ordinary recovery can find the missing class
relation. The interleaved policy retains every witness and cursor but gives
ordinary recovery a turn after a powered batch without an exact lattice
change. It restores **1,012/1,012 first-attempt successes**, with all 64 output
words agreeing across FLINT, GMP and generated JavaScript, under both normal
and experimental one-page FLINT linkage.

Actual-body stub tests cover 26 helper-control cases and 1,548 root-prefix and
post-call cases, including proof success/fatal exits, resume eligibility,
capacity, unit-cache identity, exhausted state, no-progress handoff and exact
failure. These are control tests, not arithmetic proofs. Independent GP replay
checks 2,216 principal rows on 99 fields; a trace-driven supplement checks
another 548 rows on 25 fields whose final outputs did not expose their changed
execution. Together these cover every one of the 122 changed traced executions
plus two controls. Published units are independently checked where the output
claims a fundamental unit; trivial class presentations use their separate
exact check. This is not Lean or full public Sage.js certificate replay.

Controlled serial `opt` timings use identical experimental one-page FLINT
linkage for parent and candidate, preallocated external argument storage, and
unchanged retries inside the clock. The full corpus uses three rotated rounds,
two native calls per sample and eight fresh PARI `bnfinit(f,0)` calls per
sample. All 1,012 fields complete. Totals sum each field's median:

The timing host is Linux x64 on AMD EPYC 7B13, Node 26.7.0. The timed
`/usr/bin/gp` is **PARI 2.15.4**, executable SHA-256
`c9673623cad2eaa7cfe402e7b7d833f1f703689a09837026b6386aaafba6deec`.
This is distinct from the local PARI 2.17.4 used for source forensics and
independent exact replay. No timing comparison with PARI 2.17.4 is claimed.

| Workload | Parent (ms) | Powered (ms) | PARI (ms) |
| --- | ---: | ---: | ---: |
| All 1,012 fields | 2698.458 | 2710.122 | 1433.000 |
| `3.1.45285240.1` | 8.227 | 4.941 | 1.625 |
| `3.1.57663252.3` | 6.898 | 6.342 | 2.000 |
| `3.1.61822200.1` | 7.268 | 9.521 | 1.875 |
| `3.1.97410060.2` | 18.613 | 27.844 | 1.750 |

The candidate is **1.891 times PARI overall**, slightly slower than its parent.
The 122 changed traces lose 30.042 ms; other traces move favorably by 18.378 ms.
Do not attribute that latter movement to a successful scheduling change.
An 18-field paired panel was frozen before timing: the previous 16 controls
and targets plus the earliest changed field and the repaired starvation case.
Twenty-one alternating ABBA/BAAB rounds, ten calls per sample and 200 warmups
confirm ratios of 0.5996 and 0.9121 for the two gains above, versus 1.3189 and
1.4952 for the two regressions. Their empirical 10th–90th percentile ranges
are respectively 0.5961–0.6045, 0.9065–0.9204, 1.3131–1.3266 and
1.4886–1.5000. These ranges are not statistical confidence intervals.

Exact traces explain the distinction. On `3.1.45285240.1`, one powered
relation changes quotient order 12 to 6 and certifies at row 24. On
$x^3+1197x-15048$ (`3.1.57663252.3`), three rows change 9 to 3 and certify at
row 34 instead of the parent's 47. Conversely, `3.1.97410060.2` already has
the correct quotient order 27 at row 28, but unit subgroup index 20. New
witnesses reduce that index to 4 at row 30, 2 at row 31, and 1 at row 45;
certification waits until row 48. Its final output is identical to the
parent's despite the 49.5% slowdown. The next scheduling question is therefore
**class-relation versus unit-saturation progress**, not simply full rank or
a nontrivial class quotient. Oracle unit indices are diagnostic evidence and
must not become production dispatch inputs.

### Fresh neighbors and an early eligibility guard

After freezing the powered source and before timing, freeze two coefficient
neighborhoods, each with $k=-6,\ldots,-1,1,\ldots,6$:
$x^3+1197x-15048+81k$ and $x^3-x^2+1632x+21012+81k$.
All 24 are irreducible complex fields, canonically distinct from one another,
the 1,012 development fields and the previous 24-field panel. GP `bnfcertify`
passes. Both parent and powered candidate accept only **3/24**; all other
fields stop at phase 2 before relation collection. No success-filtered timing
aggregate is reported for this panel.

The immediate cause is the pre-search check
`minkowski_generator_bound > 4096`. Here the integer bound is
$B_M=\lfloor(2\lceil\sqrt{|D|}\rceil+6)/7\rfloor$. The code already caps its
analytic search/storage at the usable factor-search limit, independently of
$B_M$. A separate, untimed eligibility source copy removes only that early
upper-bound comparison. It retains the positive exact GRH generation test,
the final check that the chosen bound is no larger than $B_M$ or the factor
limit, and every allocation/proof limit. Its SHA-256 is
`76e25fea827b0553110e072df53836ca5ae711c4f881de1c4355b853d4f7665c`.
All 1,012 development outputs remain identical to the powered candidate.

This ablation reaches **17/24 successful fields**, with five bounded declines
and two fields encountering FLINT arena-capacity exceptions. The complete
normal-linkage and one-page-linkage checks retain those failures. In
`fresh-powered-gain--5`, effort 7 exhausts the FLINT arena while GMP and
JavaScript succeed; `fresh-powered-regression-2` exhausts FLINT at effort 5
while the other backends return a bounded insufficiency. Neither backend
equivalence nor release readiness is claimed for those two fields. The first
checker stopped on the exception; its successor records errors separately
and checks equality only for nonexceptional executions. The guard removal is
an informative next-frontier experiment, not permission to expand budgets or
reinterpret an exception as a successful result.

Independent exact replay additionally checks all **17 successful eligibility
fields and 924 principal rows**, including the published fundamental units
when claimed. The remaining seven fields stay in the complete panel results;
this successful-subset replay does not resolve their failures.

Working artifacts are in
`/scratch/sagejs-runtime/cubic-powered-closure-LYb8r4`; the preserved, hashed
nonbinary evidence copy is
`build/cubic-analytic-schedule-evidence/powered-quotient-campaign`.
`prepare*.cjs`, the source copies, actual-body checks, build identities,
complete surveys/traces, replay programs/results, frozen panel and timing
drivers record positive and negative attempts. `summarize.cjs` authenticates
the timed source/driver identities and checks the reported completed corpus.
Production integration, source consolidation, public receipt replay, and
four-platform resource review remain open; PR203 stays draft.

### Unit-aware powered scheduling follow-up

`powered-unit-aware.py`, SHA-256
`b7722b6101c3b9c98d09db2612684f7537ca050fede467678fa261f44fc260ee`,
is a separate 525,366-byte source copy. It invokes powered discovery only when
the retained authenticated unit has the existing exact local obstructions to
being a square, cube and fifth power. Missing obstructions mean inconclusive;
even all three do not prove primitivity. Ordinary recovery remains available,
and neither the acceptance rule nor the new eligibility ablation is included
in this source. No new owner is added relative to `powered-v3.py`.

This restores `3.1.97410060.2`'s original proof checkpoints 28, 44 and 45 while
preserving the two powered-search gains. All 1,012 first attempts succeed;
normal/one-page FLINT/GMP/JavaScript comparisons pass. There are 87 changed
final outputs but 110 changed traced executions relative to `staged32`.
Independent replay covers all 110 changed executions and 2,378 principal
relations; 1,564 actual-root control cases include all combinations of the
new local-obstruction gate. The helper body is unchanged from the checked
interleaved version.

Its separate serial full-corpus timing is parent 2736.496 ms, candidate
2758.106 ms, PARI 1441.000 ms: **still not an aggregate improvement**. The
earlier `powered-v3` timing is not reused as its baseline. The remaining
`3.1.61822200.1` trace still inserts a proof attempt at 37 rows, with unchanged
quotient order 4, between the original failed 33-row and successful 42-row
attempts. A concrete next ablation is to retain that powered batch but defer
certification until ordinary search resumes or an exact quotient event occurs.
That is a scheduling proposal, not a measured claim or a change in proof
authority. Repeated local-obstruction work also needs cost attribution before
adopting the gate broadly.

That follow-up must track “new witnesses retained” separately from “request
proof now.” In particular, an ordinary-search cursor reset must not erase the
fact that the powered pass added rows. If ordinary discovery exhausts or the
shared relation storage becomes full, attempt closure on the retained new
prefix before declining; unit-only witnesses may already suffice even when
the class HNF is unchanged. Keep fatal exact failures separate from those
scheduling decisions and test the capacity/stage-exhaustion exits explicitly.

The same frozen 18-field paired protocol confirms ratios 0.6027 and 0.9173
for the two gains, 1.3316 for `3.1.61822200.1`, and 1.0044 for the repaired
`3.1.97410060.2`. Their empirical 10th–90th ranges are respectively
0.5998–0.6090, 0.9147–0.9232, 1.3166–1.3395 and 1.0008–1.0115. Thus the
large regression is removed, not evidence of literally zero overhead.
Across the full corpus, changed traces lose 31.989 ms while other traces
move favorably by 10.379 ms. Both timed policies remain unpromoted. All `opt`
timing processes for this campaign completed; artifacts are separately kept
under `timing` and `timing-unit-aware`, with authenticated driver and build
identities and per-sample results.

The corresponding PARI 2.17.4 source distinction is in `buch2.c`,
`compute_R` (around lines 3050–3105) and the main loop (around 4090–4127).
PARI keeps archimedean relation components, reconstructs their generated unit
lattice using rational approximation and HNF, and checks a tentative $hR$
against the analytic estimate. A relation-insufficiency result requests one
more relation. It does not know the true class number or the true unit index
in advance. Our independently replayed unit indices explain performance;
they are not available to the production scheduler. In particular, unchanged
class HNF does not imply unchanged unit information. Deferring an attempt is
safe only as a search policy, not as an assertion that certification could
not already succeed.

Validation at this handoff: six focused tests, all 192 unit files, the fresh
build and documentation checking pass. The broader `test:changed` wrapper
continues into the 585-file all tier; that running tier is **not claimed
passing** here. Architecture checking stops at the known stale optimizer
opportunity inventory (expected `d870e205...`, recorded `ce64558c...`); no
inventory refresh is used to hide it. The initial direct docs attempt overlapped
the rebuild and failed on a temporarily absent parser artifact; the later
standalone docs check passes. Exact and timing checks above are completed,
separate evidence, not predictions about the running broad suite.

The broad suite subsequently terminated unsuccessfully in `test/ffi.cjs`:
the local FFLAS/igraph prerequisites are missing (including `libigraph.a`).
The completed unit and docs checks stand, but the full tier did not pass.
The old process is terminal; do not restart it merely to wait for an outcome.

## Deferred powered batches and certified retained units (2026-09-10)

These are research source copies, not changes to production or its source,
relation, factor-base, exponent or arena limits. Their complete local evidence
is in `/scratch/sagejs-runtime/cubic-powered-deferred-E955gg`, preserved without
binaries under `build/cubic-analytic-schedule-evidence/powered-deferred-campaign`.

### Separate witness retention from proof scheduling

`deferred.py` (526,180 bytes), SHA-256
`d9008a23d93e749b77287bb1b3478d0fc12955075f740f97a238b518a2c47acb`,
retains powered-search witnesses even when it defers a proof attempt. An
unchanged class HNF does not mean unchanged unit information. Ordinary search
therefore sees the retained-row event, and storage/stage exhaustion forces an
attempt on that prefix before declining. The extracted actual root passes
1,609 control cases. All 1,012 fields succeed on the first effort with full
64-word FLINT/GMP/generated-JavaScript agreement under normal and one-page
FLINT linkage. All 110 changed traced executions independently replay 2,378
principal rows. This is exact diagnostic replay, not public receipt replay.

Compared with the frozen `staged32` parent, controlled full-corpus totals are
2739.107 → 2736.265 ms, versus PARI 1441.000 ms: effectively a tie. The paired
ratio on `3.1.61822200.1` falls from the preceding policy's 1.3316 to 1.0260;
it is still a regression. The established gains on `3.1.45285240.1` and
`3.1.57663252.3` remain, with paired ratios 0.6038 and 0.9216. Three additional
regressions selected *after* that full run have paired ratios 1.3201, 1.6302
and 1.2648 for `16261112.1`, `47623800.1` and `67151700.2`, respectively.
Those post-hoc measurements diagnose defects; they are not a frozen holdout.

A new 24-field panel was frozen before Sage execution: constant-coefficient
neighbors of the two powered-search gains, using steps $29^2$ and $15^2$ and
$k=-6,\ldots,-1,1,\ldots,6$. All are irreducible complex fields, canonically
distinct from one another, the 1,012 development fields and the previous 48
neighbors. All pass `bnfcertify`, three-backend checks and exact replay of
597 principal rows. Only two change traced execution and one changes final
output. Full panel totals worsen 95.541 → 96.914 ms (PARI 40.375); the active
`fresh-deferred-index15-1` case has paired ratio 1.0988. Keeping the panel's
inactive cases is essential; this is not 24 new powered-search successes.

### Proving that another unit reconstruction cannot help

`certified-unit.py` (527,328 bytes), SHA-256
`ef0665114868c7c4e1bb67607ca10c461ad8bd720244f0ab42a3983f8ab1bf9f`,
changes only `_cubic_try_bounded_exact_closure` relative to `deferred.py`.
After a valid but insufficient analytic check with a retained authenticated
unit, it can skip the otherwise repeated fresh dependency/unit reconstruction.
It returns **insufficient**, never success, through this new branch.

Here is the mathematical argument, with the premises made explicit. Let $K$
be a complex cubic field with certified maximal order, and let the certified
factor base generate $\operatorname{Cl}(K)$. Exact principal relations of full
rank define a finite presented group of order $h'$, surjecting onto the class
group of order $h$. Hence $c=h'/h$ is a positive integer. For a verified
non-torsion unit $u$, put
$m=[\mathcal O_K^\times:\langle-1,u\rangle]$. A complex cubic field has unit
rank one and roots of unity $\{\pm1\}$, so $m$ is a positive integer and
$u=\pm\varepsilon^m$ for a fundamental unit $\varepsilon$. The existing
conditional analytic enclosure bounds $\log J$, where $J=cm$.

In a common positive fixed-point scale, let $U$ be the certified upper
endpoint for $\log J$ and $L_2$ the lower endpoint for $\log2$. The strict
integer comparison $U<2L_2$ implies $J<4$, hence $1\le m\le3$. Exact local
obstructions to either sign of $u$ being a square or a cube exclude $2\mid m$
and $3\mid m$. Therefore $m=1$.

The residue maps are those already used by unit saturation: proven primes
not dividing the basis denominator and roots of the defining polynomial
give maps from the maximal order into finite fields. Squares use primes
$q\equiv1\pmod4$, so both signs have the same quadratic obstruction; for
odd powers, $-1$ is itself a power. A zero image contradicts the authenticated
unit/map premises and fails fatally. Missing obstructions are inconclusive.
No finite unsuccessful root search is promoted to a non-power proof.

This proves fundamentality, **not necessarily $c>1$**: an interval may still
be too wide even when $J=1$. Thus the frozen experiment's comment about a
“class-relation deficiency” is stronger than the branch proves. Read it as
“fresh units cannot enlarge the certified unit subgroup”; correct that wording
during source consolidation. Deferring further work cannot publish an incorrect
answer, and the existing final class-group certification remains necessary.
The GRH hypotheses, analytic bound and exact relation authority are unchanged.
This is a written argument, not a Lean formalization or a verified compiler.

Actual-guard tests cover 96 control cases, including strict-bound equality,
missing obstructions and invalid maps. Another 10,000 integer examples are
sanity checks, not the universal proof above. All 1,012 first attempts and
normal/one-page three-backend full outputs pass. The 110 changed traces
relative to `staged32` replay 2,378 exact principal rows. Instrumenting the
actual new return branch detects 11 activations; separate exact PARI replay
certifies every captured unit and checks fundamental-unit exponent $\pm1$.
The reused fresh panel has one activation (`fresh-deferred-index29-1`), also
checked exactly; all 24 final outputs remain identical to `deferred.py`.

### Completed controlled timing and limits of the claim

The new comparison uses **deferred versus certified-unit**, not `staged32`.
On `opt`, the frozen 21-field paired panel includes the previously identified
three regressions. There are 21 ABBA/BAAB rounds, ten kernel calls per sample
and 84 samples per field. Ratios are candidate/parent; the empirical ranges
are sample quantiles, not confidence intervals.

| Field suffix | Full-run parent → candidate (ms) | PARI (ms) | Paired ratio | Empirical 10th–90th range |
| --- | ---: | ---: | ---: | ---: |
| `16261112.1` | 6.732 → 4.917 | 1.750 | 0.7395 | 0.7293–0.7441 |
| `47623800.1` | 9.198 → 5.867 | 1.750 | 0.6470 | 0.6432–0.6514 |
| `67151700.2` | 6.265 → 4.653 | 1.875 | 0.7500 | 0.7428–0.7569 |

The full 1,012-field totals are 2727.913 → 2687.281 ms, versus PARI 1437.750
ms: still 1.869 times PARI. Only 11.447 ms of the aggregate 40.632 ms movement
comes from the 11 activated fields; the remaining 29.185 ms is movement on
other fields and must not be attributed to this branch. The paired results,
not the aggregate alone, support the targeted performance improvement.

These are closed-kernel timings with packed argument preparation outside the
clock, on Linux x64/AMD EPYC 7B13, Node 26.7.0. Timed PARI is 2.15.4; local
exact replay/source forensics use 2.17.4. Both compared kernels link the same
experimental one-page FLINT library. Full measurements use three rotated
rounds and medians per field; retries and correctness checks follow the
retained drivers. Neither public API overhead nor public receipt replay is
qualified by these results.

The deferred generated core is 17,919,936 bytes; certified-unit is 18,416,409
bytes, SHA-256
`6be43db1266c69cb0a1ba6beb71671cc4628e8461da505211b5f3e7f89d30796`.
The raw 496,473-byte increase despite a 1,148-byte source addition is mostly
provenance text, **not duplicated mathematical machinery**. An authenticated
comparison of the actual generated files (`core-growth.cjs`) finds 13,225
bytes of growth after replacing each main source path by `SOURCE.py`.
Removing comments and `#line` directives and collapsing whitespace gives
5,719 bytes of additional C text. Of 278 parsed static-int function bodies,
only the FLINT/GMP closure helper bodies differ under that normalization;
their cleanup-call counts are unchanged. These are source-text measurements,
not machine-code size, peak allocation or cross-platform safety evidence.
The new branch adds no owner
declaration, but uses existing temporary-allocating helpers. One-page linkage
and Linux backend agreement do not establish cross-platform memory safety.
Production is unchanged and PR203 remains draft.

Next: expand frozen unseen *activation* coverage, separate repeated analytic
enclosures and local screens from unit reconstruction cost, and consolidate
successful changes into readable source before production qualification.
Retain the demonstrated regressions and the separate eligibility/arena failures.
Six focused tests pass. The earlier full suite's missing FFI prerequisites
and stale architecture inventory remain unresolved; no all-suite pass is claimed.

### Frozen successor holdout and rejected bound expansion

A successor panel proposes eight constant-coefficient shifts around each of
the 11 development activation fields, using $k=-4,\ldots,-1,1,\ldots,4$
times the square of the anchor's equation-order index. All 88 proposals are
frozen before Sage execution. Three are reducible; the other 85 are complex
and canonically distinct from all 1,084 previously used fields and one another.
All pass `bnfcertify`. This is a local structural holdout, not a random sample
of the population of cubic fields.

All 85 pass the first effort with matching class numbers/invariants and full
FLINT/GMP/generated-JavaScript output agreement for both deferred and
certified-unit sources. Each field ran in an isolated process; there are no
backend exceptions or worker failures. Only one final output changes, but the
actual shortcut activates twice:

- $x^3-x^2+10x-82$, class number 8;
- $x^3-x^2-208x-2836$, class number 2.

Both captured units are independently verified fundamental, and all 38
principal relations in their final prefixes replay exactly. This does not
claim full independent public-certificate replay on all 85 fields.
Scripts and evidence are in
`/scratch/sagejs-runtime/cubic-unit-index-holdout-AijhIL`.

The completed all-85-field controlled timing gives deferred 211.019 ms,
certified-unit 208.505 ms and PARI 125.000 ms (1.668 times PARI). The two
activation fields account for only 0.984 ms of the 2.514 ms aggregate movement.
Repeated paired runs on **every** field confirm activation ratios 0.8617
(empirical 10th–90th range 0.8489–0.8740) and 0.8147 (0.8083–0.8206).
Their full-run medians are respectively 2.052 → 1.770 ms versus PARI 1.125 ms,
and 4.077 → 3.375 ms versus PARI 1.625 ms. The largest non-activation median
ratio is 1.00535; no universal no-regression claim follows from this sample.
This panel's timing uses the same frozen parent/candidate and the existing
three-round full and 21-round paired protocols. Both `opt` processes are
terminal; exact artifact and driver hashes are checked by `timing-summary.cjs`.
The complete successor evidence and generated-core analysis are preserved in
`build/cubic-analytic-schedule-evidence/unit-index-holdout`.

A separate read-only screen considers extending the theorem to $J<7$ with
exact nonsquare, noncube and non-fifth-power obstructions. Every positive
integer $m<7$ other than one has a prime factor in $\{2,3,5\}$, so the same
argument applies. The screen uses an exact lower bound for $\log7$ from
$3\log2-\log(8/7)$, bounding the atanh series at $z=1/15$ termwise and its
remaining geometric tail with integer ceilings. It does not change a return
value or scheduling decision. All 1,012 full outputs remain identical.
Among 23 fields reaching retained-unit analytic insufficiency it identifies
**no additional eligible fields**. Do not add a wider production branch merely
because its sufficient condition is sound: this corpus provides no measured
workload benefit for it.

The latest development timings also show that the 20 largest per-field
excesses over PARI sum to 162.309 ms, about 13% of the aggregate 1249.531 ms
gap. Outlier forensics remain useful, but optimizing only those outliers
cannot explain or close the whole gap. The next profile should distinguish
common exact order/ideal work, analytic enclosures and unit reconstruction;
the current output/trace equality checks alone do not measure those costs.

### Common-work profile and next mathematical experiment

An instrumented copy of the **current** certified-unit core now profiles three
complete passes through the 1,012-field corpus, checking all 64 output words
against its uninstrumented survey on every call. The first pass is discarded;
the remaining 2,024 calls have nested inclusive/exclusive counters whose
exclusive totals sum exactly to the recorded root total. This ran locally
with `CLOCK_MONOTONIC_RAW` while a developer rebuild was active. Instrumentation,
compiler effects and local contention are included: these are diagnostic
fractions, not controlled timings or estimates of attainable speedup.

The largest measured named exclusive component is
`_cubic_online_relation_lattice_update`: about 8.4%, with 19.29 calls per field.
Other substantial components include dependency-unit materialization (6.9%),
smooth principal-relation admission (5.6%), maximal-order analysis (5.3%) and
BF-plan preparation (4.6%). No single component explains the whole gap.
The record lives in
`/scratch/sagejs-runtime/cubic-certified-common-profile-96vVXy` and its preserved
`build/cubic-analytic-schedule-evidence/certified-common-profile` copy.

Reading the online updater exposes a concrete general experiment: it scans
every entry of its $n\times n$ canonical row-HNF basis to count nonzero rows,
but uses that count only to ask whether rank is $n$. A row-HNF basis padded
with zero rows is upper triangular, so
$\det H=\prod_{i=1}^n H_{ii}$; full rank is equivalent to every diagonal entry
being nonzero. That predicate takes $n$ reads, not $n^2$. It is **not** valid
to recover the rank of a deficient HNF by counting nonzero diagonal entries:
for example, $\left(\begin{smallmatrix}0&1\\0&0\end{smallmatrix}\right)$ has
rank one but zero diagonal. The source comment rejecting all diagonal
shortcuts conflates these two claims.

### Diagonal full-rank predicate: implementation and measured ablation

The predicate is now implemented in the research source and backported as the
same narrow change to this branch's production Python source. It changes only
the initial full-rank question in `_cubic_online_relation_lattice_update`.
The membership branch and the rest of the updater are AST-identical to the
parent. In particular, rank-deficient prefixes still receive a full HNF
update; support bits, dependent unit witnesses and publication are unchanged.
The `column: uint64` declaration remains explicit for later copy loops.

The proof requires the maintained canonical row-HNF invariant, not an
arbitrary matrix assumption. Nonzero rows have strictly increasing pivot
columns, so pivot column $j_i\geq i$; padded zero rows follow them. Consequently
$H$ is upper triangular and $\det H=\prod_i H_{ii}$. Nonzero determinant is
equivalent to full rank. This proves equivalence of the old and new branch
conditions, including deficient prefixes, without claiming that diagonal
entries count deficient rank. The initial zero basis has the invariant, and
each full exact HNF update preserves it; the membership shortcut leaves it
unchanged.

Validation of the actual extracted old/new predicates covers 6,435 canonical
HNFs, dimensions zero through 64 and every rank, including large integer
entries. A separate read-only audit checks canonical HNF at all **19,522**
actual updater entries across 1,012 fields, including dimensions 34 and 36.
All predicates agree, and all final 64-word outputs are unchanged. The scan
reads fall from **4,595,897 to 283,929** across that corpus. These finite tests
support implementation fidelity; they are not a formal proof of the theorem.

Full-output differential checks pass for all 1,012 fields on FLINT, GMP and
generated JavaScript, under both normal and experimental one-page FLINT
linkages. Another **85** fields pass all three backends under one-page linkage.
Those 85 are the earlier unit-index successor panel, reused here, not newly
unseen HNF holdouts. Exact principal-relation replay from the parent remains
separate evidence; no new public certificate or Lean qualification is claimed.

Controlled `opt` totals (sums of per-field medians) are **2696.393 → 2658.960
ms**, versus PARI **1438.125 ms**: a 1.39% aggregate improvement, still **1.849×**
PARI. The frozen 21-field development panel has paired median ratios between
0.97176 and 0.99683. Every median favors the candidate, but several empirical
10th–90th percentile ranges cross one. This supports a modest common-work
improvement, not a universal no-regression claim. The protocol is three rotated
full-corpus rounds, two native calls or eight fresh GP computations per sample;
paired measurements use 21 ABBA/BAAB rounds and ten calls per sample after 200
warmups. Packed input buffers are prepared outside the clock, bounded retries
inside; all these fields accept at the first effort. PARI is the timed 2.15.4
binary on `opt`, not the local 2.17.4 replay binary.

The measured advanced research source has SHA-256
`10e17e9d8f726100bc88462f080cb4ac2642f7e10d5aefe9408aabcf0cc662a4`
and 527,190 bytes, versus its certified-unit parent at 527,328 bytes. Its core
hash is `91a7d2255633f1860cd4fab036dbfd067a955bf469b1ada5f13f567ccaae3ff8`.
Raw generated-C size comparisons contain differing repeated provenance paths
and are not machine-code size evidence. This remains an over-budget research
program, not a release candidate. The **separate tracked production source**
shrinks by the same 138 bytes, and its package including runtime passes at
**480,241 / 485,000 bytes**. No source allowance or resource capacity changes.
Research timings must not be presented as timings of that production program.

Sources, authentication scripts, backend reports, prefix audit and timing
records are in `/scratch/sagejs-runtime/cubic-hnf-diagonal-uS0GUY`; the remote
timing directory is `/tmp/cubic-hnf-diagonal-UnX1A9`. The focused tracked test
executes the actual Python predicate and spies on diagonal reads, membership
eligibility and support reset, including the deficient off-diagonal example.

The next isolated experiment replaces only the basis-to-source copy with the
existing declared `fmpz_matrix_set_block(source, 0, 0, basis)`. Its preconditions
hold for the distinct resident $n\times n$ basis and $(n+1)\times n$ source;
the final source row is still explicitly overwritten by the incoming relation.
This needs no new owner, shape, capacity or handwritten mathematics. The other
comparison/copy-back loops remain unchanged. The experiment compiles and all
1,012 outputs agree on GMP and JavaScript, but the compiler's
`FMPZ_FFI_DECLARATIONS` allowlist excludes `flint:fmpz_matrix_set_block`, removing
the root's `fmpz` entry point. The initial three-backend harness therefore
fails before computing its first field. It is not a three-backend pass or a
comparable timing. IR inspection confirms a resource/resource call with two
`uint64` offsets and Boolean status; the adapter checks distinct owners and
complete block bounds, copies exact entries, then recomputes allocated bytes.
Admitting it needs compiler-lane review of arena allocation/failure cleanup,
alias/bounds tests and generated targets, not just a refreshed manifest or
timing the GMP replacement. No compiler or FFI policy is changed here.

A separate **fused comparison/copy-back** source experiment uses only the
existing operations: compare each old basis entry immediately before replacing
that same cell with the corresponding reduced entry. The accumulated Boolean
is exactly the disjunction of the old entrywise comparisons; every read of an
old basis cell precedes its overwrite. The final support mark and basis are
therefore identical on successful completion. Distinct resident owners and
the unchanged HNF output provide the necessary state invariant. Allocation
failure may leave a different private partial state, but it cannot publish a
certificate and must follow the existing arena failure cleanup.

This second candidate leaves the first copy, rank calculation, HNF operation,
owner shapes and capacities unchanged. Actual Python bodies agree in 1,360
injected-HNF control cases on return values and all matrix state. All 1,012
complete outputs agree on FLINT/GMP/JavaScript under normal and one-page
linkages, as do the reused 85 fields under one-page linkage. Its source hash
is `89f0e18703f9fa1b75cfdfa196c95822d42a9e0363cc379afe495c41d2e1f553`.
Both follow-up experiments and scripts are retained under
`/scratch/sagejs-runtime/cubic-hnf-block-rwQI42`. Neither is backported to
production at this point. Broader copy/equality work needs its own invariant
and resource review rather than an unexamined increase in basis dimensions.

The fused-copy controlled run completes with totals **2690.766 → 2665.557 ms**
against PARI **1437.875 ms**, a 0.94% reduction. The same frozen 21-field
paired panel has 20 median ratios below one, from 0.98441 to 0.99976, and one
essentially tied at 1.00032. Several ranges cross one. Thus it is a small
common-work benefit, not a new PARI win; do not compound percentages from
separate runs into an unmeasured end-to-end claim. The remote directory is
`/tmp/cubic-hnf-fused-vS6hv5`. An initial paired invocation omitted its required
`event` argument and failed before timing; the corrected `paired-event.json`
is the authenticated evidence. The completed full run was not restarted.

### Rank-deficient membership opportunity

A read-only exact-membership screen of the same 19,522 updater entries finds
**2,278 contained rows among 15,822 rank-deficient prefixes**. It checks each
canonical HNF as before and reduces the incoming vector over its nonzero
pivots using exact integers, without altering the native algorithm's decisions.
All 1,012 final outputs remain unchanged. This suggests avoiding entire HNF
computations, not just entry scans; membership cost on noncontained rows still
needs measurement.

A separate source copy extends `_cubic_relation_row_in_hnf` to skipped pivot
columns. At each column, subtract the contributions of already determined
integer row weights. If the next basis row has a pivot there, positive-pivot
divisibility uniquely determines its weight. Otherwise the residual must be
zero, since every later basis row vanishes in that column. Induction over
columns proves that success is equivalent to an integral combination of the
nonzero HNF rows. The pivot-row cursor is at most the column cursor, hence is
in bounds whenever a column is visited. For full-rank HNF this reduces to the
original triangular solve. The updater returns the proper-sublattice status
for a contained deficient row, leaving support zero and all principal/unit
witnesses in the original ledger.

The actual new helper agrees with independent rational Gaussian elimination
on **5,808** tests through dimension 16, covering every rank, large pivots,
known integral combinations and perturbed/arbitrary vectors. The generic
rational solver tests consistency of $H^Tc=v$ and integrality of its unique
weights, rather than reimplementing the same pivot traversal. All 1,012 outputs
also agree on FLINT/GMP/JavaScript with normal linkage. Source hash:
`919b6a5faa159d0e0c6faeece024b8a86513e259302818cc25a1dda0add8b536`.
This is separate from the fused-copy candidate, has not been backported, and
is not yet a performance claim. Its inherited updater comment saying all
deficient prefixes undergo HNF is stale in this research copy; correct it
before consolidation. The mathematical rule and executable branch, not that
old comment, are what the current experiment tests.

Controlled timing is now complete at `/tmp/cubic-hnf-deficient-RWDS4b`:
**2736.187 → 2714.411 ms**, versus PARI **1439.000 ms**, only **0.80%** faster
overall. The paired panel is heterogeneous: `3.1.23984479.2` improves about
16.0% (ratio 0.83990, empirical range 0.83364–0.84393), `3.1.83062751.1`
about 12.1% (0.87912, 0.87451–0.88329), and `3.1.28159543.3` about 9.1%.
But `3.1.50086188.2` regresses 1.65% (1.01650, 1.00717–1.02307),
`3.1.97410060.2` 1.56%, and other smaller regressions occur. Do not promote
unconditional generalized membership from the aggregate alone. One-page
three-backend checks also pass for all 1,012 and the reused 85 fields.

A second read-only screen finds **zero zero-vectors** among the 2,278 contained
deficient rows; this is genuine nontrivial dependence, not an opportunity to
replace the experiment with a zero-row test. All full outputs remain unchanged.
The next scheduling question is whether to reuse the modular admission
information already computed for each row. A row increasing rank modulo the
scheduler prime cannot belong to the previous *integer* relation lattice:
an integral linear combination would remain a linear combination after
reduction modulo that prime. This implication does not require equality of
modular and rational ranks. It is a sufficient **nonmembership** filter, never
a class-group certificate or a license to discard dependent unit witnesses.

Do not infer the per-row filter from a global rank counter after a batch:
several rows may await the exact online update, and the counter may include
future rows. Correct reuse needs per-row evidence tied to admission, or a
proved single-row synchronization boundary. The existing support ledger and
borrowed search workspace may provide a compact representation, but its
initialization, skipped/retried proposals and catch-up batches need explicit
review before implementation. No such filter is implemented in this commit.
The complete nonbinary follow-up evidence is preserved in
`build/cubic-analytic-schedule-evidence/hnf-followups`.

### Production backport validation

The tracked diagonal-only source passes a fresh production build, all seven
focused analytic-schedule tests and strict CPython syntax/Ruff/Pyright checks
for 382 modules (zero errors). `pnpm test:changed -- --base HEAD`, run against
the two code/test changes before documentation updates, completes merge checks,
the build, Python precompilation and **all 192 unit-test files**. The separate
specialized `test/number-field-cubic-native-class-number.cjs` recheck passes
all four tests: authenticated native receipts/declines, independent exact
receipt replay, pinned nontrivial LMFDB cases and large-regulator exact units.
This is narrower than public qualification of the advanced research sources.

The first specialized run was contaminated by an overlapping changed-file
compiler rebuild and failed during REPL loading (`get_compiler_version` was
not a function). It is retained as a failed run, not mathematical evidence.
The successful rerun started only after compiler rebuilding completed.
`pnpm architecture:check` passes FFI, package/source budgets, native boundaries
and Wasm audits, then still fails the pre-existing stale optimizer-opportunity
inventory (now expecting input `be4a3d5670ff2fd5a90fae1a77199eb7fae207d3fe7a43dc26e24fd7ae94bf63`,
finding `ce64558cecbdc639cd6eeb9a6b3ad0de5d968c6523248d11401556004dc3bcde`).
Do not refresh that inventory merely to turn the gate green. The proof and
campaign documents pass generated-doc checks. Nonbinary source/scripts/reports
are preserved under `build/cubic-analytic-schedule-evidence/hnf-diagonal`.

### Per-row modular hints and the residue-normalization prerequisite

The next research copy implements the per-row filter without another owner,
buffer, capacity or global counter. `_cubic_modular_admit_relation` clears the
current proposal's support slot, marking it one only on modular independence.
The append helper borrows the existing support matrix (already a search
workspace member), and initial rational-prime admission writes the same
per-row slots. The exact updater consumes that row's hint, resets the slot,
and skips only the membership test when marked. It still computes the full
exact HNF and the final support bit by comparing canonical bases. Other
pending rows' slots are untouched. The existing processed-prefix guards remain
necessary before reuse of the support transcript.

An adversarial test exposed a prerequisite that ordinary cubic tests missed:
the old modular scheduler copied exponents with `checked_uint64` but did not
first reduce them modulo $p=27449$. A nonzero multiple of $p$ could be treated
as a pivot. For the four rows

$$
(p,0),\quad(1,0),\quad(1,1),\quad(0,1),
$$

the unnormalized candidate marks modular independence as $(1,0,0,1)$, even
though the last row is the difference of the preceding two ordinary rows.
Explicit residue normalization produces the correct marks $(0,1,1,0)$.
This is a modular-scheduler invariant failure, **not an observed false class
group certificate**: even an incorrect hint only causes an additional exact
HNF here, whose final support decision remains authoritative. The failing
initial experiment and a minimal actual-body reproducer are retained.

The normalized candidate reduces each exponent modulo $p$ before conversion
to the word workspace. Inductively its echelon rows span exactly the reductions
of previously admitted relations. Independence modulo $p$ then excludes
integer-lattice membership, since reduction preserves every integral linear
combination. A duplicate rejection and reuse of a candidate slot reset its
hint. An admitted modularly dependent row remains in the original relation
and unit-witness ledger; this filter never discards one.

Actual-body controls cover **8,000** admissions against independent modular
Gaussian elimination, including prime-multiple inputs and reused/rejected
slots. The 4,000 ordinary cases preserve the parent's decisions and complete
modular workspace. All 720 generated independence hints are independently
checked by integer column-HNF lattice equality. Another **4,024** updater
controls preserve return status, final basis and support, including 1,011
deliberately conservative stale hints; they also check neighboring pending
marks and rejection of failed HNF. Private scratch on failure is not a
published certificate.

A read-only audit consumes **13,103 hints** at the 19,522 actual corpus update
points. Every consumed hint agrees with the subsequent exact HNF support bit;
all final 64-word outputs remain unchanged. The normalized candidate passes
all 1,012 FLINT/GMP/JavaScript comparisons with normal and one-page linkages,
and the reused 85 fields with one-page linkage. This is not public receipt
qualification. Source SHA-256:
`dd6ebde6b846c7aad2af5b1e2fb07058612184ba897f21032676bf21d14ec566`;
the preceding unnormalized copy is
`0c06c13023c23a1efa4de208b47698bf2d921118594b10574b69ae61f79e975b`.
The source remains over the unchanged production allowance. No tracked
production mathematical source or compiler policy changes in this campaign.

The controlled experiment compares the normalized filter (`event`), unfiltered
generalized membership (`parent`), the diagonal-only source (`baseline`) and
PARI, with the same allocator and frozen 21-field paired panel. The full run
completes all 1,012 fields: **2707.215 ms** filtered, **2747.982 ms** unfiltered,
**2739.545 ms** diagonal-only, **1460.375 ms** PARI. These are 1.48% and 1.18%
reductions against the two native controls, respectively. All 21 paired
filter-versus-unfiltered empirical 10th–90th percentile ranges cross one:
the incremental filter benefit is not clearly resolved on this panel.
Against diagonal-only, the larger generalized-membership gains persist
(ratios 0.83729, 0.87761 and 0.90672 on the three previously identified fields).
The previous regression sites are consistent with ties in this run, not proof
that the filter causally eliminated their regressions. The remote
directory is `/tmp/cubic-modular-hnf-filter-043BFx`; local scripts, frozen
sources, controls and reports are in
`/scratch/sagejs-runtime/cubic-modular-hnf-filter-mkOKgG`.

Fresh coverage freezes 42 proposals before any candidate execution: the
existing 21 development timing anchors with constant shifts
$\pm[\mathcal O_K:\mathbb Z[\alpha]]^2$. One reducible and eleven canonically
represented fields are excluded, leaving **30** complex cubics canonically
disjoint from 1,169 prior fields. PARI independently certifies the reference
class groups. All three implementations and three backends agree on all
output words: **28** accept at effort five, **two** decline, with no exceptions.
The declines are the $+1$ neighbors of `3.1.61822200.1` and `3.1.83062751.1`;
they remain in the report. This is local structural coverage, not a random
population sample or a claim of 30 successful certifications.

Independent replay checks **720 principal-relation rows across 29 fields**,
including all 28 first-effort successes and one declined prefix. The other
decline never supplies a raw prefix; it is explicitly excluded, not counted as
replayed. This uses independent PARI ideal arithmetic and `bnfcertify` on
captured same-source data, not a public Sage.js certificate or Lean proof.

Fresh timing completes **29 of 30** with the existing bounded retry policy.
For those 29 completed computations, sums of per-field medians are **121.756 ms**
filtered, **123.407 ms** unfiltered, **124.653 ms** diagonal-only and **44.250 ms**
PARI: still **2.752 times PARI**. The remaining native decline takes about
5.17 ms; that time is not counted as a completed class-group computation.
All 28 fields accepted at first effort were selected for pairing before timing.
Ten have empirical 90th-percentile filtered/diagonal ratios below one; one has
its 10th percentile above one. The strongest gain is the $+1$ neighbor of
`3.1.95903148.1`, ratio **0.80701** (0.80126–0.81178); the $-1$ neighbor of
`3.1.93074700.2` regresses slightly, **1.00814** (1.00015–1.01614).
These are descriptive empirical ranges, not confidence intervals or a
universal improvement claim. The reused full driver retains `holdout:false`
metadata; freshness is separately established by the frozen-input and canonical
deduplication manifest. Raw reports are unchanged. The authentication/summary
script checks source, driver, fields, manifests and the pre-timing selection.

### Fresh retry frontier: powered quotient target order

The largest completed holdout excess is
$x^3-x^2+1632x+21496$, discriminant $-62999288$, class group $C_3$:
**26.175 ms** including efforts five and one, versus PARI **2.000 ms**.
This one field accounts for about 31% of that cohort's total excess.
It is now a development input, not a fresh test for changes motivated by it.

Exact principal-relation and unit replay distinguishes the obstruction:
effort five ends with a 66-row, 22-factor presentation of order **6** and
unit index **1**; effort one reaches order **3**, unit index **1**, with
84 rows. Thus the first effort lacks a class relation, not a fundamental unit.
Read-only traces show it materializes the same fundamental unit up to sign
three times. Its class-index-six enclosure has upper log-index
$6010141979/2^{32}$, slightly above $\log(4)$, so the existing strict
$J<4$ shortcut does not apply. No oracle unit-index information may be used
to authorize a native stopping decision.

PARI 2.17.4 debug/source forensics (`buch2.c`, `small_norm` and its caller)
shows an initial 28-relation quotient of order six, regulator approximately
659.0758245, followed by a quotient-generator-directed powered search with
multiplier norm two and target norm 41. Two further relations close the
quotient to three. Native tracing instead chooses $P_2^{12}P_{67}$ and stays
on that target for two batches, adding eight rows without changing its HNF.
Before those batches the active HNF pivots are at indices 14, 17 and 21,
then 14 and 21. This is not a claim of identical PARI and native bases,
enumeration order, or private relation lists. PARI's default-precision debug
run also warns that it does not supply expanded fundamental units; exact
replay separately verifies the native unit. Timings use the previously
recorded opt PARI 2.15.4, not this local forensic binary.

A source-only ablation visits active quotient pivots in ascending factor-base
order instead of descending. It preserves the multiplier, exact products,
enumeration, retained cursor, admission, certification and all capacities.
Only `_cubic_resume_powered_quotient_search` changes. Target ordering schedules
optional discovery; it is not a theorem that ascending order is optimal or
that exhausting a target certifies anything. Source SHA-256:
`a5d9bbf17e705aaa49df0716d7c4057cea1af23c6293b03d3e7f7c217ef575c3`.

The ablation certifies the target at first effort with raw checkpoints
29, 30 and **34** rows. Independent exact replay checks all 34 principal rows,
the order-three quotient and the published fundamental unit. Normal-linkage
FLINT/GMP/JavaScript comparisons pass all **1,042** development-plus-neighbor
inputs: **1,041** first-effort successes, one gain and no losses, with 63 changed
outputs. Both normal and one-page linkages agree on all outputs. The selected
call/return trace changes on **84** fields, including 21 whose final outputs
are identical; output comparison alone would undercount affected executions.
Actual-body control tests cover 26 lifecycle/failure cases and 574
ascending-cursor/subset cases through 32 factors; arithmetic stubs are not
arithmetic oracles. Independent exact replay now checks **1,729 principal rows
across all 84 changed traces**, with no exclusions. Initial target pairing (21 alternating
ABBA/BAAB rounds, ten calls per sample, 200 warmups per implementation) gives
**26.180 → 9.783 ms**, ratio **0.37339**, empirical range 0.37238–0.37795.
Retries remain inside the timed boundary. The full 1,042-field run completes
1,041 fields with both implementations; the same one native decline remains.
Completed-cohort totals are **2769.046 → 2720.567 ms**, PARI **1484.125 ms**.
On the original 1,012 alone they are **2648.567 → 2617.516 ms**, PARI
**1440.125 ms**. Changed traces account for **30.199 ms** of the 48.479 ms
overall decrease; unchanged selected traces account for the other 18.280 ms.
Do not attribute the entire aggregate movement to the changed search policy.

Follow-up pairing confirms the three largest changed-trace regressions:
`3.1.19203756.1` **1.20057** (1.19121–1.20835), `3.1.67151700.2`
**1.17132** (1.16193–1.17781), and `3.1.16261112.1` **1.08816**
(1.08094–1.09758). The three largest non-target gains also repeat:
`3.1.11943311.2` **0.76849**, `3.1.67139800.1` **0.81673**, and
`3.1.76586796.4` **0.82513**, with each empirical range below one.
The largest unchanged-trace apparent regression, `3.1.1328459.1`, becomes
a tie under pairing (0.99847, 0.98740–1.00779). This is post-survey
adjudication, not fresh holdout selection. All timing jobs are terminal;
remote bundle `/tmp/cubic-ascending-timing-2y3QVC` and authenticated
`ascending-summary.json` retain the complete comparison and declined field.

The regression traces make a universal order switch inappropriate. For
$x^3-456x-4522$ (`3.1.19203756.1`), descending order closes quotient six to
three with one powered relation at row 25. Ascending starts at target index
12 instead of 13, adds four rows without closing, and ordinary search later
certifies at row 40. The other two regressions similarly postpone the decisive
relation: 29 versus 40 rows, and 24 versus 32 rows. Conversely, the new target
was starved on the high-index target despite a useful low-index one.
Next investigate bounded, resumable allocation of work among active quotient
targets using exact progress. Merely replacing one universal order with the
other is not the conclusion of this experiment; all dependent unit witnesses
must remain retained and exhaustion must not be interpreted as completeness.

The first target replay invocation included effort eight, which produced no
raw prefix, and its harness failed by dereferencing the missing snapshot.
The corrected replay explicitly covers the actual timed efforts five and one
(66 and 84 rows); effort eight remains a reported decline, not a replayed
success. Generated GP programs/logs and the failed-run explanation are retained.
The initial timing-summary assertion also assumed selection-list ordering;
the paired runner actually traverses the frozen field list. The corrected
assertion checks precisely that traversal, without altering measurements.

The nonbinary source, scripts, manifests, failed experiments, timings, controls,
and independent GP programs are preserved under
`build/cubic-analytic-schedule-evidence/modular-hnf-filter`.
No production mathematical source changed in these two campaigns.
The unchanged production source budget and
public/platform qualification still exclude these larger research copies.

### Opposite triangular presentation for quotient-generator selection

The next ablation tests the presentation itself rather than another universal
visit order. Let $L\subseteq\mathbb Z^n$ be the full-rank relation lattice,
$H$ its authoritative upper row HNF, and $J$ the coordinate-reversal permutation.
Then

$$
H'=\operatorname{rowHNF}(JHJ),\qquad B=JH'J
$$

is a lower triangular basis of the **same** lattice $L$. Multiplication by
$J$ on the left only changes the order of basis rows; multiplication on the
right reverses ambient coordinates. Mapping back therefore changes no
relation or quotient. In a lower triangular presentation, a diagonal-one
relation expresses that coordinate generator in terms of preceding ones.
Induction shows that the indices with diagonal greater than one generate
$\mathbb Z^n/L$. These diagonal entries are relative presentation indices,
**not** independently known orders of the corresponding ideal classes.

The research source computes $H'$ in the existing $(n+1)\times n$ HNF source
and result scratch, padding the last source row with zeros. It scans the mapped
diagonal in descending original index order. The authoritative online basis
is read-only during this preparation; ordinary exact updates subsequently
reuse that scratch. No owner, capacity, multiplier, enumeration rule, relation
discard or stopping test is added. This is optional target selection, never
publication authority. It is not an assertion that this reproduces PARI's
complete permutation/elimination strategy.

For the fresh retry target's initial 29-row lattice, opposite-presentation
pivots are $(0,3),(13,2),(14,2)$ rather than the authoritative upper
presentation's $(14,2),(17,2),(21,3)$: the first descending target becomes
norm 41, not norm 67. For the largest ascending-order regression, the opposite
pivots are $(0,3),(13,2)$, recovering the useful norm-31 target rather than
norm 29. This explains both successes without consulting the true class
number. For `3.1.67151700.2`, targeting a pivot of value 48 in the original
presentation eliminated earlier value-two pivots; it would be incorrect to
assume that a target can improve only its own diagonal entry.

Source `dual-hnf-v2.py`, SHA-256
`28c71ac9c3720ec506dcbbe6bc971c89557c408ff1fec02d6e1dc6d9ba59e3f5`,
is **529,458 bytes** and changes only the powered-search helper. All 1,042
normal/one-page FLINT/GMP/JavaScript comparisons agree, retaining 1,041
first-effort successes, the one gain and no losses. There are 65 changed
outputs, 96 changed selected call/return traces, and **113** fields invoking
the modified helper. Identical selected traces do not imply identical work:
the new HNF may run even when it selects the same target. Independent replay
checks **1,845 principal rows across all 96 changed traces**, without exclusions.
Actual-body tests cover 65 independent column-HNF selector/control cases
through 32 factors, including unchanged authoritative bases and failed HNF
before any target product. Other arithmetic in that unit harness is stubbed.

The first source used an unimported, nonexistent `fmpz_matrix_hnf` spelling and
failed compilation. The corrected source uses the existing declared
`fmpz_matrix_hnf_into`; this was an experiment error, not a compiler obstacle.
An initial independent Sympy test grew to approximately 3.5 GB with its
unbounded HNF algorithm and was explicitly terminated. Giving that oracle
the exact determinant of the full-rank triangular input enables its bounded
modular HNF algorithm; the corrected tests pass. Neither failure is native
class-group success evidence, and neither changes runtime resource limits.

Initial seven-field pairing against the descending-order parent retains the
new target's **26.317 → 9.794 ms** improvement (ratio 0.37218). The three
ascending regressions become **1.00295**, **0.96332**, and **0.99682** on
`3.1.19203756.1`, `3.1.67151700.2`, and `3.1.16261112.1`, respectively;
the first and last empirical ranges cross one, while the middle improves.
The earlier three non-target gains remain at ratios **0.77346**, **0.82229**,
and **0.82304**. These fields were selected from the preceding experiment
before opposite-presentation timing.

The completed 1,042-field run has 1,041 completed fields and the same bounded
decline, `membership-holdout-3.1.83062751.1-1`. Sums of per-field median
milliseconds are **2,800.295 descending**, **2,742.510 ascending**,
**2,739.189 opposite presentation**, and **1,485.375 PARI**. The candidate
remains about **1.844 times PARI**, not a general win. Among the 113 fields
invoking the changed helper, descending/opposite totals are
**402.412/368.375 ms**: 34.037 ms of the aggregate 61.106 ms movement lies
on that cohort. The remaining 27.069 ms occurs on fields not invoking the
helper and must not be attributed to the new selection policy. Compared with
ascending order, opposite presentation saves only 3.321 ms in the full run;
its stronger result is avoiding the three large paired ordering penalties.

After that full run, the three largest absolute regressions among previously
unpaired helper-invoking fields were selected for 21 alternating ABBA/BAAB
rounds, with ten calls per sample and 200 warmups per implementation. All
three persist:

| Field | Descending / opposite ms | Paired ratio | Empirical p10–p90 |
| --- | ---: | ---: | ---: |
| `3.1.29147.1` | 1.540 / 1.593 | 1.03422 | 1.02341–1.04650 |
| `3.1.462360.1` | 1.516 / 1.573 | 1.04136 | 1.02446–1.05434 |
| `membership-holdout-3.1.3229112.1-1` | 3.465 / 3.508 | 1.01167 | 1.00486–1.02233 |

These are post-selection adjudications, not fresh holdout results; empirical
ranges are not confidence intervals. The authenticated driver checks
acceptance for every timed call and class number/invariants after each
ten-call sample. The first summary incorrectly treated optional `accepted`
input metadata as universal: fresh neighbor fixtures omit it. The corrected
summary checks driver identity and full-run acceptance, without changing raw
measurements. `dual-hnf-followup-summary.json` records the correction.

Existing selected traces show that all three regressions actually choose a
different target. The first uses index 3 rather than 8 and needs three added
relations instead of two (14 rather than 13 rows at certification). The other
two use indices 2 rather than 7, and 6 rather than 12, respectively, retaining
the same one-row completion. Thus the 0.04–0.06 ms penalties cannot all be
assumed to be pure HNF conversion overhead; enumeration and target-construction
work can differ too. A future cost attribution must measure those components
separately. In particular, the evidence does not justify selecting presentation
from the known class number or inserting field-specific thresholds.

The next experiment should test a general work-allocation rule, such as giving
the existing target a small bounded opportunity before paying for another
presentation. Any new rule must reconcile its resident cursors, preserve all
unit witnesses, retain the unchanged exact certification boundary, and be
tested against both the rescued slow field and these regressions. The 30-field
neighbor panel has now informed development; a further untouched panel is
required before making new out-of-sample claims. Source consolidation,
public receipts, resource review and platform qualification remain outstanding.

The campaign's nonbinary archive contains 729 files (35,965,324 bytes) with
per-file SHA-256 identities, including failed experiments and independent GP
programs. It is retained in the backed-up worktree's ignored
`build/cubic-analytic-schedule-evidence/modular-hnf-filter` directory rather
than relying only on unbacked scratch. No production mathematical source or
compiler source changed in this campaign. The changed-file validation completed
merge checks, a fresh full build and documentation checks; final focused tests
pass all seven cases, and direct documentation generation/check and task scope
checks pass. Those repository checks do not qualify the larger experimental
kernels for release. PR 203 stays draft; the earlier architecture inventory
failure and broader platform/public qualification requirements are not cleared
by these measurements.

### Staging original and opposite presentations in one resident call

The next campaign tests a general allocation rule rather than a field-specific
choice: give the original upper-HNF target a bounded opportunity, retain it
while it changes the exact relation lattice, and switch to the opposite
presentation after a stagnant batch. This changes discovery only. It does not
discard admitted principal relations or unit witnesses, add a publication rule,
or enlarge an arena, matrix, relation capacity or global proposal budget.

Two details are essential to implementing that statement faithfully:

- Online status two means a **trivial quotient**, not arbitrary lattice
  progress. The ellipsoid leaf stops at the first exact support change, so its
  last admitted row's exact support marker detects progress; no new rows means
  no progress. A modular rank counter is not the authority for this decision.
- A target cursor from the upper presentation is not the visitation history of
  the opposite presentation. The first opposite plan must reset that cursor
  even after an oversized or fully exhausted original region. Later opposite
  plans resume normally. A switched partial original suffix is deliberately
  abandoned optional discovery, not declared exhausted or mathematically
  complete. Admitted witnesses and the global remaining budget survive.

The initial corrected-cursor candidate, SHA-256
`55d15c2c3bf926d1a2235f3b310d265a67b82e3e2bea2a050db40ed3b81cad76`,
allowed 32 **virtual slots** in the original plan. Actual tracing finds zero
new candidates and zero relations in all ten selected first 32-slot calls:
the ellipsoid enumerator can skip large empty regions cheaply, so this is not
a useful candidate budget. The candidate merely pays for an unused original
plan before taking the opposite one. All 1,042 normal/one-page three-backend
comparisons pass; independent replay checks 2,208 principal rows across all
113 changed traces. It is nevertheless rejected as a scheduling policy.
Paired ratios on the previous small regressions worsen to 1.06376, 1.06958
and 1.02845; the rescued target remains 26.293 to 9.822 ms. On the 113
helper-invoking fields, opposite-only/staged totals are 366.769/371.805 ms.
The full staged aggregate happens to be lower, 2,718.019 versus 2,725.851 ms,
because other fields also move; this is not evidence of a policy improvement.

Removing the 32-slot cap restores the existing batch boundary: four admitted
rows or the first exact support change, under the unchanged global budget.
That candidate has SHA-256
`83aa8cffcf3178fbc997ff6391a0ce03e9f0a1733868a1bcc334f3ec0cff41b6`.
All 1,042 normal/one-page three-backend comparisons pass, but only the rescued
field's final output changes relative to the original-parent survey. Returning
after a stagnant original batch gives control to the outer scheduler, which
can do ordinary collection before the opposite target gets a turn. Thus a
correct local state transition does not by itself implement the intended
whole-program work allocation. No controlled timing claim is made for this
intermediate version.

The next candidate continues inside the same helper call after switching,
rather than returning solely because stagnant rows were admitted. The second
batch borrows the same owners and retains the first batch's rows. Exact
progress, exhaustion, bounded failure or the unchanged remaining proposal
budget still controls return. Lifecycle tests exercise source bodies with
stubbed arithmetic; full native/dynamic comparisons and independent ideal
replay are separate requirements, not implied by those control tests.

The first normal-linkage survey invocation omitted the dynamic fallback's
module search path and failed before completing the corpus with
`MODULE_NOT_FOUND` for `@sagemath/sagejs-flint`. The corrected invocation
supplies the existing compiler worktree's package path. The failed log remains
retained, and no mathematical pass is inferred from that failed invocation.

The same-call source is 531,509 bytes, SHA-256
`5d0c318bf4234636b54ddec1a41fddef5651759d783827648653e2506a59675e`;
its generated C core is 18,597,831 bytes, SHA-256
`b64fd1c62aaab5d6ef21d8d37ce78d6734bdbb3732fe432c5c224491184bbfa9`.
All 1,042 fields agree across FLINT/GMP/JavaScript under normal and one-page
linkages: 1,041 first-effort successes, the rescued-field gain, no losses and
the same remaining decline. There are 14 changed final outputs and 21 changed
selected traces. Independent replay checks all 21 traces, 570 principal rows,
without exclusions. The intermediate return-to-caller version also has
independent replay of its three changed traces, 100 rows. The 73 earlier and
61 same-call actual-body control cases include budget accounting, retained
support marks, unchanged authoritative basis, bounds through 32 factors,
trivial-quotient return, exact failures and optional oversized plans.

The frozen ten-field paired comparison with the original descending policy
shows ratios 1.0010, 1.0099 and 0.9984 on the three prior small regressions;
all empirical p10–p90 ranges cross one. The three retained non-target gains
become approximately 11%, rather than opposite-only's 18–23%. The rescued
field is 26.53 to 9.19 ms (ratio 0.3473, empirical p10–p90 0.3444–0.3492).
Its proof checkpoints are now 29, 34 and 38 rows, versus opposite-only's
29, 30 and 34. More rows do not by themselves imply greater total runtime:
unit-reconstruction expressions and arithmetic sizes also matter. However,
the faster target time relative to the previous opposite-only run requires
a direct paired comparison before attributing a further gain.

That direct comparison is now complete on the same frozen ten-field panel.
The rescued field improves **9.869 to 9.187 ms** against opposite-only,
paired ratio **0.93273** (empirical p10–p90 **0.92633–0.93549**). The
three original small-regression fields improve against opposite-only by
approximately 3.1%, 3.6% and 1.3%. Conversely, the three other gain fields
are **14.7%, 7.7% and 7.6% slower than opposite-only**, despite remaining
faster than the original descending policy; `3.1.67151700.2` is also 3.8%
slower than opposite-only. This is a tradeoff, not dominance.

Full 1,042-field timing completes the same 1,041 fields, with totals
**2,804.754 ms original**, **2,744.397 ms opposite-only**,
**2,754.725 ms same-call staged**, and **1,488.000 ms PARI**. Among the
113 helper-invoking fields, original/opposite/staged totals are
**404.626/369.856/377.464 ms**. Staging is about 2.1% slower on that cohort
than opposite-only, and about 1.851 times PARI over the full completed set.
It is not promoted as the universal policy.

The first three newly identified unpaired regressions among changed traces
were frozen for a further paired adjudication: `3.1.43939476.2`,
`3.1.1824155.1` and `3.1.88587.1`. This is a post-selection check, not a
fresh holdout. The checked driver, linkage identities, raw timings, summaries
and selection policy are retained with the rest of the campaign evidence.
The resulting staged/original ratios are **1.01066** on `43939476`
(empirical range 0.99914–1.02339, unresolved), **1.01454** on `1824155`
(1.00889–1.02265), and **1.03908** on `88587` (1.02718–1.06341).
The last two are confirmed new penalties; avoiding the old three does not
establish a no-regression policy.

Before adding another unconditional ordering or batch-size rule, measure the
target's exact work by stage. The independent replay shows the final published
units differ only by torsion sign, while both are fundamental. More retained
rows may alter dependency expressions and unit reconstruction, but the observed
6.7% speed difference does not by itself attribute cost to that stage. Preserve
the distinction between PARI's compact class-group computation and an explicit
expanded-unit certificate when comparing work. A compact, exactly checkable
representation could matter more than another search-order adjustment; it
requires a separate representation/proof investigation, not an assumption that
less evidence may be published. Source consolidation and a new untouched panel
remain prerequisites to promotion.

The extended nonbinary archive now contains **1,128 files / 67,551,552 bytes**,
including all staged source variants, failed attempts, controls, exact replay
programs and controlled measurements. All timing and replay jobs are terminal.
The tracked change remains documentation and task handoff only; production
source and its allowance are unchanged, and PR 203 remains draft.

#### Structural follow-up: reconstruction precision and product sizes

A read-only same-source JavaScript trace preserves all 64 result words while
counting work inside dependency-unit materialization. It is not a native timing
profile. Both policies materialize twice. Both first try scale $2^{32}$, then
$2^{112}$ or $2^{110}$; all four numerical attempts return status 18. In the
source this is the explicit `complex_magnitude <= 0` exit, after

$$
\text{complex magnitude}
=\left\lfloor\sqrt{S^3/\text{exponential}}\right\rfloor,
\qquad \text{exponential}\approx S e^R.
$$

The recorded regulator intervals give $R\approx659.075824498$. For a unit
oriented so its real absolute value is $e^R$, its complex absolute value is
$e^{-R/2}$ by the norm identity. Even avoiding zero in this fixed-point
quantity requires roughly $\log_2 S\ge R/(2\log 2)\approx475.423$;
the attempted 32 and 110–112 fractional bits are far too few. This is a
necessary scale consideration, **not** a sufficient accuracy theorem for
rounding all integral-basis coordinates. Numerical proposals must still pass
the existing exact norm and full-precision regulator authentication.

The code then uses exact products of the dependency's relation elements.
Matrix-coordinate multiplication counts and largest observed operand bit sizes
inside the two materializations are:

| Policy | First materialization | Second materialization |
| --- | ---: | ---: |
| Opposite-only | 209 multiplications, 3,215 bits | 199 multiplications, 3,038 bits |
| Same-call staged | 209 multiplications, 3,215 bits | 211 multiplications, 2,635 bits |

Both return coordinates of 955, 954 and 953 bits. Thus the staged dependency
performs more multiplications in its second materialization but with a smaller
largest operand. This gives a concrete expression-size difference to profile;
it does not prove how much of the paired 6.7% saving belongs to materialization.
An initial scalar-coordinate counter saw zero calls because these products use
the matrix-coordinate path; the extended trace explicitly measures that path.
Both reports and their scopes are retained.

The next source-transparent experiment should choose reconstruction proposal
precision from the actual regulator/embedding scale, avoiding demonstrably
futile low-precision attempts and comparing adaptive reconstruction with exact
products. Keep bounded resource behavior, same-source fallback and exact
authentication unchanged. This is a better-supported next question than
another arbitrary fixed target-order or coordinate-budget choice.

Final repository validation passes all **192 unit-test files**, seven focused
cases, merge invariants, documentation generation/check and task scope. These
checks do not change the experimental/public qualification distinction above.

### Adaptive unit reconstruction: correct proposals, negative timing result

The next experiment changes only `_cubic_materialize_dependency_unit`. The
first proposal remains cheap. The second may increase its fractional precision
to $\lceil 2R_{\mathrm{upper}}\rceil+64$, capped at 4,096 bits, and recomputes
outward logarithm intervals for the nonzero factors in the selected dependency
at that precision. Negative dependency exponents reverse interval endpoints.
Original dependency evidence, exact norm/regulator authentication, exponent
budgets and exact-product fallback remain unchanged. Invalid root/log proposals
fall through to the existing fallback. This precision is a scheduling estimate,
**not** a theorem guaranteeing correct coordinate rounding.

Increasing arithmetic precision alone is insufficient: exponentiating the old
low-precision regulator interval amplifies its uncertainty. Refining the
selected relation-product logarithm is necessary for this proposal to succeed.
For the large-regulator target, both 1,383-fractional-bit attempts now authenticate
and replace the two exact-product materializations (209 and 211 matrix-coordinate
multiplications). The initial 32-bit attempts still fail with status 18.

Source `adaptive-unit.py` has SHA-256
`04d7691fc33d54067cb5d05db540785d4ad8a0eb5380afdbce259769c14532a9`
and 534,686 bytes; generated core has 18,671,945 bytes and SHA-256
`1323707f8ecd50c8d9776bde514c45c1dedba3fa0dd7d44bfd1f202e7b5c3d54`.
This remains a research copy, above the unchanged production source allowance.
Eighteen extracted actual-body control cases cover precision/cap boundaries,
signed interval accumulation, invalid proposals, unchanged original evidence,
authentication failure and exponent-budget rejection. Their arithmetic is
stubbed; they are control tests, not a mathematical oracle.

All 1,042 fields pass full 64-word FLINT/GMP/JavaScript comparisons under both
normal and one-page linkages. There are 1,041 accepted fields, no gains or losses
against the actual staged parent, and the same bounded decline
`membership-holdout-3.1.83062751.1-1`. Nineteen final outputs change. Adding
reconstruction calls to the selected traces reveals 514 changed traces, including
many with identical final outputs. Independent exact principal-ideal replay
checks all 11,209 rows across those 514 prefixes, without exclusions. This is
not full public-certificate qualification or a new untouched holdout.

Controlled serial `opt` timing uses identical one-page FLINT linkage,
preallocated external buffers, bounded retries inside the clock, three rotated
full-corpus rounds, and separate 21-round alternating ABBA/BAAB paired tests.
PARI uses fresh `bnfinit` calls; public startup/marshalling and expanded-unit
output equivalence are not claimed.

| Completed-field sum (ms) | Staged parent | Opposite-only | Adaptive | PARI |
| --- | ---: | ---: | ---: | ---: |
| All 1,041 | 2795.362 | 2770.703 | 3130.139 | 1488.500 |
| Changed reconstruction traces | 1749.994 | 1736.027 | 2098.464 | 783.125 |

The adaptive candidate is approximately 12.0% slower overall. Direct pairing
on the large-regulator target gives **9.140 to 13.936 ms**, ratio **1.52609**
(empirical p10–p90 **1.51421–1.53891**). `3.1.16261112.1` regresses by 66.8%
and `3.1.19203756.1` by 34.5%; nine of the ten paired descriptive ranges lie
above one. These quantiles are not confidence intervals. The candidate is
rejected as a speedup, despite its successful reconstruction mechanism.

Two local diagnostic native profiles wrap generated functions without changing
their mathematical bodies, preserve source/core identities, retain identical
one-page linkage, and check all 64 words on every one of 200 target calls per
variant. Clock wrappers are diagnostic-only, single-threaded, and include
instrumentation overhead: their times must not replace controlled measurements.
The coarse profile attributes the increase primarily to unit materialization
(approximately 1.94 to 6.75 ms per field), especially reconstruction (1.02 to
5.28 ms), rather than the original dependency-log stage (about 0.26 ms in both).
The more detailed profile reports square-root time around 0.35 to 2.28 ms and
the logarithm-of-two series around 0.032 to 0.796 ms. These nested times must
not be added to their parents, and detailed-wrapper overhead differs from the
coarse run.

Source inspection identifies a reusable follow-up: `_cubic_ceil_sqrt` constructs
its upper Newton seed by one doubling per exponent bit. Binary powering can
produce exactly the same seed in logarithmically many iterations. Test that
change separately on both the staged parent and the adaptive candidate; do not
infer that eliminating this overhead will rescue adaptive reconstruction or
close the broader PARI gap.

#### Binary-powered square-root seed ablation

The source-transparent follow-up changes only `_cubic_ceil_sqrt` in separate
copies of the staged parent and adaptive candidate. For nonnegative $n\ge2$,
write $b=\operatorname{bitlength}(n)$ and $k=\lceil b/2\rceil$. The old loop
builds $2^k$ using $k$ doublings. The new loop starts with $c=1,p=2,e=k$;
on odd $e$ it multiplies $c$ by $p$, then halves $e$ and squares $p$ if another
iteration is needed. The invariant $c p^e=2^k$ proves the identical final seed.
There are $O(\log k)$ loop iterations rather than $k$. Avoiding the final unused
square also ensures the power temporary never exceeds the required seed.

Since $n<2^b\le2^{2k}$, this is an upper Newton seed. The existing descending
integer Newton iteration, final ceiling correction, floor wrapper and negative
input sentinel are unchanged. No rounding or class-group proof rule changes.
An extra live exact power temporary is introduced; unchanged mathematical
outputs do not establish cross-platform allocation qualification by themselves.

Extracted original and candidate bodies pass 10,401 cases against CPython
`math.isqrt`, including negative inputs, consecutive small integers, square
boundaries up to 16,385 bits and 300 deterministic random integers up to 8,192
bits. Both actual compiled copies also pass all 10,401 cases for floor and
ceiling on FLINT/GMP/JavaScript. The first native-vector harness invocation
failed before native execution because CPython's default 4,300-digit decimal
serialization cap rejected a test input; the retained rerun explicitly bounds
the test-process cap at 10,000 digits. This does not change library limits.

All 1,042 full cubic outputs are identical to each copy's own parent across
all three backends and both linkages. The source hashes are
`e356fc368bc41ae8de0308901c8cd25f417fe4d44b19bb289d428618d2ceec8a`
(staged) and
`e9afad722a4034c9280fa2668d285ccce1cabd16db243bc6033c23453d263e00`
(adaptive). Generated cores are 18,852,586 and 19,088,898 bytes, respectively:
the shorter-running seed construction increases generated code. That resource
tradeoff must remain visible rather than being hidden by refreshed manifests.
This experiment does not change production source or raise its allowance.

A narrow compiler probe explains why the natural `1 << k` replacement needs
care. With a `uint64` exponent the literal is contextually coerced to `uint64`,
producing a word shift with its documented 0–63 count restriction, not an
arbitrary-precision power. Explicitly declaring `one: int = 1` and shifting
`one << exponent` fails compilation with `uint64 operator << requires uint64
operands`. This is an opportunity for a general checked exact-integer shift,
not a reason to substitute word arithmetic in the square-root helper. The
initial probe used the wrong import module and failed before lowering; its
corrected word and exact probes are distinguished in the retained evidence.
No compiler or shared ABI edits were made from this arithmetic lane.

The production helper also still counts bits by repeated division, whereas
these research parents use the separately developed `int.bit_length()` support.
Consequently a production backport must qualify that compiler prerequisite and
measure the actual production path; these research timings do not establish
its speedup.

The controlled square-root ablation is now complete. Full completed-field sums
are **2,839.631 ms staged**, **2,755.201 ms staged with binary seed**,
**3,171.742 ms adaptive**, **3,019.637 ms adaptive with binary seed**, and
**1,490.750 ms PARI**. Thus the seed change improves this run's staged aggregate
by about 2.97% and adaptive aggregate by 4.80%. Do not combine these ratios with
totals from earlier runs: even unchanged implementations move between runs.

All ten staged paired median ratios favor the seed change (0.9690–0.9885),
but five descriptive p10–p90 ranges cross one. The target's direct paired result
is 9.358 to 9.168 ms, ratio 0.97729 (0.96503–0.99576). On the adaptive target it
is 14.224 to 12.473 ms, ratio 0.87517 (0.86958–0.88893). The faster seed helps,
but the adaptive policy remains substantially worse than the staged policy.
The square-root experiment is promising reusable arithmetic, not a new
class-group regime victory or a qualified no-regression production release.

Next, examine the proposal's dependency order before increasing precision
again. Its exponential magnitude depends on the regulator and scale, not on
the accumulated complex phase. Currently the routine computes roots, phase
normalizations and phase powers before discovering that the complex magnitude
rounds to zero. Evaluating the identical magnitude calculation first could
avoid that provably unused phase work without predicting a heuristic threshold.
Such a reordering must preserve every successful proposal, resource behavior
and authoritative certificate; failure-code precedence needs explicit review.
This is an unimplemented next experiment, not an asserted speedup. Separately,
the compact-unit representation question remains open: PARI class-group timing
must not silently be compared with mandatory expanded-unit publication.

All controlled timing and replay processes for this campaign are terminal.
Repository checks pass all 192 unit files, seven focused cases, merge invariants,
documentation generation and task scope. `architecture:check` still fails the
known stale optimizer-opportunity manifest (expected input `be4a3d56...`, recorded
`ce64558c...`); the native classifications and other preceding architecture
checks pass. No manifest was refreshed merely to hide that failure. PR 203
remains draft, and production/compiler source and resource limits are unchanged.

The nonbinary evidence archive now contains **2,288 files / 108,482,859 bytes**
under `build/cubic-analytic-schedule-evidence/modular-hnf-filter`. It includes
source transformations, controls, manifests, profile instrumentation scripts,
raw timings, independent replay programs and failed probe/harness evidence;
native build caches are omitted. These backed-up local research artifacts are
not authenticated public Sage.js execution receipts.

### Magnitude before phase: reject unused reconstruction work

The follow-up is implemented in `magnitude-first.py`, SHA-256
`c6b54bdb9311a43d241db306e24552530dfb0f5662f6f3459c24f15247cb2335`,
531,849 bytes, based on the binary-square-root-seed parent. It moves the
**identical** regulator-to-exponential-to-magnitude calculation before phase
construction, but after the existing root checks. Application of `real_sign`
remains after phase construction. An AST multiset check verifies that the
function's top-level statements are a permutation, not changed expressions;
every other function is identical.

For valid private-call scales, the unsigned magnitude depends only on the
regulator interval and scales. Neither evaluating the relation elements at the
complex embedding nor accumulating their normalized phase changes those inputs.
If the old magnitude calculation rejects, its phase result was unused. If it
accepts, the new order computes the same phase, targets, rounded coordinates
and exact norm check. No new bound, rounding estimate or certificate is used.
The root guards still precede both parts. On inputs where both phase and
magnitude would fail, private diagnostic precedence intentionally changes:
status 16 or 18 can precede status 14. The fresh-unit caller rejects every
status other than 1; the materializer records the private diagnostic and
continues reconstruction/exact fallback. Its separate status-2 coordinate
diagnostic and all successful-unit authentication remain unchanged.

Extracted actual bodies pass 45 synthetic unit-power/precision cases, including
29 successful proposals and 13 zero-magnitude proposals, with identical tuples.
The zero-magnitude cases perform no phase embedding or multiplication in the
new order. Two additional double-failure controls exercise the intentional
diagnostic precedence. Initial harness runs exposed a missing extracted helper
and an incorrectly sliced test-argument tuple; both failures and the corrected
passing run are retained. They were test-harness failures, not passing evidence.

All 1,042 development fields retain identical full 64-word outputs across
FLINT/GMP/JavaScript under normal and one-page linkages: 1,041 accepted and the
same one bounded decline. Selected traces change on 390 fields. Reconstruction
attempts remain **1,411**, while complex-phase multiplications inside them fall
from **99,438 to 29,554**. The large-regulator target still has four status-18
attempts, but each now skips 183 phase multiplications. Independent exact replay
checks 8,813 principal relations across all 390 changed prefixes, without
exclusions. Counts describe the actual same-source trace, not native timings.

Controlled serial `opt` timing gives completed-field sums **2,832.774 ms parent**,
**2,737.375 ms candidate**, **1,498.625 ms PARI**: approximately 3.37% lower
than the parent, still 1.827 times PARI. Changed-trace fields account for
1,451.577 to 1,375.568 ms of that movement; the other 19.39 ms must not all be
attributed to skipped phase work. The target improves **9.306 to 8.587 ms** in
direct pairing, ratio **0.92607** (empirical p10–p90 **0.90805–0.92956**).
Other paired improvements include approximately 7.35%, 6.02%, 5.24% and 4.76%;
five of the ten descriptive ranges cross one. PARI's target median in the
full run is 2.0 ms. This is a narrower gap, not a target or universal PARI win.

The generated core shrinks from 18,852,586 to **18,772,769 bytes**, SHA-256
`660412535cbc117f6c55b250c615e0f0cdf864a63522f31d719a464e1d34f4fd`.
Reconstruction retains 346 IR locals, the same calls and no external writes,
but its exact temporary-slot count rises **17 to 18** because the magnitude
is live earlier. Thus pure statement reordering is not a proof of identical
resource use. Existing arena limits are unchanged; corpus checks are not a
replacement for platform/resource qualification. Production source is untouched.

#### A fresh structural neighbor panel

Before executing Sage.js on new inputs, freeze 84 constant-term perturbations
of the existing 21 timing anchors: $k\in\{-3,-2,2,3\}$ times the squared
equation-order index. Exclude only reducible, noncomplex or canonically
represented fields, using PARI `polredabs` against the 1,199 prior records.
This leaves **58 canonically new fields**; all PARI class-group oracles pass
`bnfcertify`. This is a local structural holdout, not random-population evidence.
The candidate source remains frozen throughout.

All 58 accept on their first attempt and preserve every output word against
the parent across all three backends and both linkages. Independent exact
replay checks all 1,220 principal relations across these prefixes, with no
exclusions. Full controlled sums are **180.815 ms parent**, **172.267 ms
candidate**, **85.625 ms PARI**: a 4.73% aggregate improvement, still about
2.01 times PARI. Pairing uses the first ten fields in preexisting input order,
not fields chosen for observed speedups. One shows a clear descriptive gain:
`magnitude-holdout-3.1.61822200.1-3`, 2.594 to 2.407 ms, ratio 0.92765
(0.89980–0.93796). The other nine ranges cross one, including small positive
median ratios. Do not claim 58 individually demonstrated speedups or a
qualified absence of regressions. These fields become development data after
this measurement.

#### Remaining native costs

The magnitude-first generated-core diagnostic checks all 64 output words on
200 target calls. Subtracting the first cumulative 100-call snapshot from the
second gives an instrumented warm mean of 9.192 ms. Among instrumented
boundaries, dependency-unit materialization has 1.209 ms inclusive / 1.086 ms
exclusive cost, online relation-lattice updates 0.900 ms, HNF transforms
0.473 ms, BF-plan construction 0.454 ms, and LLL transforms 0.310 ms.
These are diagnostic costs with wrapper overhead, not the controlled paired
timings above; inclusive nested times must not be added. They motivate
investigating compact unit evidence and relation-matrix processing, rather
than another unmeasured precision heuristic.

### Beyond milliseconds: initialization versus class-group work

Freeze a five-input discovery panel $f_k=x^3-x+10^k+7$ for
$k\in\{6,9,12,15,18\}$ before running it. On the otherwise idle `opt` VM,
PARI 2.15.4 runs one fresh process per field with seed 1, a 30-second timeout
and a 512 MiB maximum PARI stack. Time `nfinit(f)` separately from
`bnfinit(nf,0)` using `getwalltime()`. No `bnfcertify`, expanded-unit extraction
or Sage.js fallback is included. All five are irreducible complex cubics with
equation-order index one. These are single-run discovery observations, not
representative-population benchmarks or unconditional class-number proofs.

| $k$ | `nfinit` (ms) | `bnfinit(nf,0)` (ms) | Class number | Regulator, approximately |
| --- | ---: | ---: | ---: | ---: |
| 6 | 0 | 12 | 1 | $2.316\times10^5$ |
| 9 | 4 | 53 | 12, invariants $(6,2)$ | $2.905\times10^7$ |
| 12 | 2 | 961 | 1 | $2.171\times10^{11}$ |
| 15 | 3 | 810 | 1 | $2.995\times10^{14}$ |
| 18 | 7 | 19,822 | 1 | $1.894\times10^{17}$ |

Zero milliseconds means below the integer wall timer's resolution, not zero
work. The polynomial and field discriminants equal
$4-27(10^k+7)^2$. Initialization is plainly not the dominant cost in the two
largest-time examples; this does not exclude discriminant factorization as a
bottleneck for other fields or defining equations.

At $k=12$, a separate `setdebug("bnf",1)` run of flag 0 reports 568 factor-base
ideals, bound 4051, and 876 ms wall time. The printed internal timer totals
include 494 ms in HNF routines, 243 ms in `small_norm`, and 47 ms in floating
embeddings. They are integer CPU-time diagnostics, not an exhaustive disjoint
wall profile. The trace reaches tentative class number 1 while the regulator
is still five times its final value, then collects another relation. Thus even
class number 1 is not evidence that the remaining unit/index work is trivial.

The comparison's output contract matters substantially. Two subsequent fresh,
untraced flag-0 runs take 862 and 849 ms; two flag-1 runs take 2,469 and
2,446 ms. Both flags report the same class invariants and regulator, but flag 1
retains exact algebraic data rather than relying on floating embeddings for
some operations. This is an ABBA diagnostic, not a statistically qualified
2.9-times performance claim. In the separate flag-1 trace, `bnfunits` returns
the nontorsion unit as **412 factors**, with the reported
$\lfloor\log_2(|e|+1)\rfloor$ of the largest exponent equal to 260. No expanded
fundamental unit is constructed by our diagnostic. The enormous regulator
therefore does not force an enormous expanded output in PARI's compact path.

The magnitude-first Sage.js research kernel currently does **not** compete on
this panel. The $k=6$ input returns false at phase 2 on efforts 5, 1, 7 and 8:
its Minkowski bound exceeds the unchanged `_CUBIC_MAX_GRH_BOUND_SEARCH=4096`
guard. The other four inputs raise `RangeError: number-field analysis
projection is invalid` on the direct first-effort call. The shared analysis
adapter only projects complete candidates; its bounded constructor can leave
large-prime or composite residuals unresolved. Those exceptions require a
separate analysis/fallback-boundary investigation; they are not accepted
results or evidence of public-path fallback success. No limits are raised and
no native decline or exception is counted as a timing win. Native observations
are local capability checks, not same-host successful timings against PARI.

#### Consequence: compact exact unit evidence is a structural requirement

There is a direct mathematical route that avoids expanding a dependency unit.
Suppose the replayed principal-ideal relations are
$(\alpha_i)=\prod_j\mathfrak p_j^{M_{ij}}$, with all factors included, and an
exact integer vector $c$ satisfies $c^TM=0$. Then the **formal product**
$u=\prod_i\alpha_i^{c_i}$ satisfies $(u)=\mathcal O_K$, hence is a unit.
This proof uses the exact ideal identities and integer kernel equation; it
does not require multiplying the algebraic numbers into three huge coordinates
or checking their expanded norm afterward. A certified interval for
$\sum_i c_i\log|\sigma_{\mathbb R}(\alpha_i)|$ proves nontorsion when it
excludes zero and gives an interval for a regulator multiple.

This does **not** by itself prove fundamentality or completeness of the class
group. Factor-base generation, the relation presentation, and the joint
class/unit index-one certification still need their existing mathematical
justification. Signed interval accumulation must refine precision if
cancellation makes it inconclusive. A compact certificate must bind every
factor, exponent and exact ideal relation, and its verifier must reject missing
factors, altered exponents and nonzero kernel residuals. Public compact versus
expanded unit APIs and bounded replay resources must be explicit. This is a
proposed next regime, not an implemented compact certificate or formal proof.

Raw scripts, outputs, native failures, profile snapshots and summaries are
retained with the preceding campaign in
`build/cubic-analytic-schedule-evidence/modular-hnf-filter`. Relevant entry
points are `seconds-pari.cjs`, `seconds-pari-paired-flags.cjs`,
`seconds-pari-trace.gp`, `seconds-native-check.cjs`, and
`summarize-seconds-and-profile.cjs`. The next large-input campaign should address
the analysis capability boundary, factor-base/storage scaling and compact unit
authority together, not merely increase a bound or expand an enormous unit.

Compact logarithmic verification also avoids the failed adaptive proposal's
precision trap. If each certified logarithm has absolute error at most
$\delta$, the linear combination has error at most
$\delta\sum_i|c_i|$. To target error $\varepsilon$, one may therefore refine
the input logarithms until $\delta\sum_i|c_i|\leq\varepsilon$, using exact
outward bounds. The needed fractional precision depends logarithmically on
the exponent sizes and desired error; it need not grow linearly with the
regulator merely to represent $\exp(-R/2)$ as a nonzero dyadic number.
This is an error-propagation bound, not a promise that every index test will
resolve at that precision. It explains why compact exact evidence is a more
substantial direction than ever-higher-precision coordinate reconstruction.

A separate GP exact-ideal demonstration on the $k=12$ compact unit verifies
this algebraic route without expanding the unit. It factors each of the 412
small elements as a principal ideal, reconstructs that individual ideal from
its prime-ideal factors, and checks equality. Accumulating their signed
exponents gives zero at all 410 distinct prime ideals across 1,993 factorization
entries. The successful log records 40 ms for this replay alone; it excludes
unit discovery and is not a Sage.js benchmark. This checks unit membership,
not fundamentality, interval accuracy or the final GRH class-number proof.
It uses PARI's exact ideal arithmetic, not an independently implemented or
formally verified arithmetic backend.

The first demonstration script had GP comment syntax errors and used the
reserved name `I`. GP continued and printed a misleading empty-replay marker
despite those errors. That log is retained as a failed harness run; only the
corrected, error-free rerun with nonempty counts supports the statement above.
The corrected script explicitly rejects an empty replay. This is another
reason not to infer success solely from GP's process exit code or a printed
success label.

### Independent compact-unit prototype and broader research priority

The goal is competitiveness for cubic fields **overall**, not only the small
complex cubics in the existing corpus. The 1,042-field development distribution
cannot establish how often that regime occurs in research workloads. There is
no distribution-free notion of a "large proportion of fields" across an
unbounded family. Further small-field tuning is paused pending a broader
stratified frontier. This includes both signatures, logarithmic discriminant
bands, regulator size, nontrivial class groups, equation-index effects and
hard polynomial-discriminant factorization. Failures and resource declines are
part of the frontier, never omitted from speed comparisons. Report per-stratum
coverage, timeouts, ratios and total CPU cost separately rather than letting
many tiny fields conceal a missing large-field algorithm.

The next measurement campaign should freeze input families and seeds before
selection by Sage.js outcomes, use explicit per-input time/memory ceilings,
and retain censored cases. It must separate polynomial-to-order initialization,
class-group discovery, compact exact evidence, and optional expanded unit
output. Include fresh input calls and report setup/cache effects separately.
PARI 2.15.4 and 2.17.4 differ even in compact dependency representations, so
record versions and use the newer available comparator as well as the retained
historical baseline. Real cubics are an explicit coverage question; this
complex-cubic research kernel is not a solution for them.

The independent prototype is now reproducible from tracked sources:

```sh
gp -q -f bench/class-unit-groups/cubic-compact-unit-export.gp > compact-unit.log
python3 bench/class-unit-groups/cubic-compact-unit.py compact-unit.log
node --test test/cubic-compact-unit.cjs
```

CPython with SymPy is required for this research-only exact lattice oracle.
The verifier itself never invokes PARI. On the same large-regulator field,
the local PARI 2.17.4 export has **382 factors, 376 distinct ideals and 1,840
relation entries**, with maximum dependency exponent size **34 bits**. These
are not the earlier 2.15.4 witness's 412 factors and 260-bit-scale exponents.
The independent replay passes in about 6.31 seconds locally; this is a
correctness prototype, not a competitive implementation or an `opt` timing.
The verifier never expands a dependency power. It does not prove
fundamentality, nontorsion, a regulator enclosure or a class-group result.

Each ideal is checked as a canonical full-rank integer column HNF, stable under
multiplication by the defining root. Invertibility is independently checked,
so the verifier does not assume the power order is maximal. For an ideal basis
$b_1,b_2,b_3$, let $S$ be the integer lattice spanned by all rows of their
multiplication matrices. Then
$I^{-1}=\{x:xI\subseteq\mathbb Z[a]\}=S^*$, the integral dual lattice.
The prototype constructs this rational lattice via a denominator and adjugate,
and checks $II^{-1}=\mathbb Z[a]$ by exact ideal multiplication and HNF.
It rejects noninvertible ideals, including a tested ideal in the nonmaximal
order $\mathbb Z[2a]$ for $a^3-a-1=0$.

For each rational factor $\alpha=v/d$ and signed ideal exponents, it verifies
$vI_-=dI_+$ before accepting that principal-ideal relation. Only afterward
does it accumulate the large signed dependency exponents columnwise. A zero
residual proves the formal product's ideal is the unit ideal, hence the
product is a unit of the power order. The principal-ideal powers in this
verification are the small per-factor valuations, never the large dependency
exponents. The test checks rational factors, duplicate sparse entries,
261-bit exponents, malformed dimensions, altered/missing relations,
nonideals, noninvertible ideals, and 100 exact interval vertex oracles for
signed logarithm accumulation. Input logarithm authenticity is explicitly
outside the latter arithmetic helper.

The first export mixed power-basis element coordinates with PARI's reduced
integral-basis ideal coordinates even though the order index was one. The
independent verifier rejected those lattices. Correcting the exporter to
multiply by the actual integral-basis change matrix and recanonicalize by HNF
fixes the mismatch. This failed export is retained; index one does not mean
the two bases are identical.

Existing dynamic Sage.js machinery already provides `FactoredNumberFieldElement`,
certified factor logarithms, and live relation-kernel unit authority in
`class_unit_context.py`. Reuse those contracts instead of inventing another
factored-element API. The missing native/detached path must avoid generic
`norm()` and `principal_ideal()` implementations that raise individual factors
to huge exponents before cancellation. The new prototype establishes a
replay route for that gap; it is not yet native integration. Broader measured
bottlenecks, rather than another small-field microbenchmark, should determine
which representation, relation-search or linear-algebra work is done next.

During test review, the initial noninvertible-ideal case was found to use the
wrong scaled polynomial and was rejecting at the signature check instead.
The corrected polynomial is $x^3-4x-8$, and the regression now requires the
specific noninvertibility error. A negative test that fails for the wrong
reason does not qualify the intended mathematical guard.

### LMFDB broad-cubic coverage reconnaissance

The user selected [LMFDB cubic tables](https://www.lmfdb.org/NumberField/?degree=3)
as the primary source of interesting workloads. The repository already has a
read-only PostgreSQL bulk exporter, so there is no need to scrape individual
search pages. A repeatable-read, read-only mirror query on 2026-09-10 returned
913,287 complex and 266,650 totally real cubic records. Of these, 69,393 complex
and 12 real records have no recorded class number. Largest absolute
discriminants are approximately $1.263\times10^{25}$ and $1.963\times10^{34}$,
respectively; neither extreme has a recorded class number or regulator.

The [completeness statement](https://www.lmfdb.org/NumberField/Completeness)
covers both cubic signatures through $|D|=3{,}375{,}000$, with additional
specialized collections beyond that. These counts describe the database, not
a representative distribution of all research inputs. In particular, the
large-discriminant records are highly concentrated in particular families.

Three contrasting examples from the bulk query are:

| LMFDB field | Defining polynomial | Recorded class number | Recorded regulator |
| --- | --- | ---: | ---: |
| [3.1.2053046834465061134700.275](https://www.lmfdb.org/NumberField/3.1.2053046834465061134700.275) | $x^3-44602909000650$ | 202,393,728 | 36.3097542072 |
| [3.1.232227935940.1](https://www.lmfdb.org/NumberField/3.1.232227935940.1) | $x^3-x^2-55216x+24733810$ | 1 | 367,081.475446 |
| [3.3.22337757618922610865.26](https://www.lmfdb.org/NumberField/3.3.22337757618922610865.26) | $x^3-173252583x-604189507782$ | 81 | 96,396,300.7753 |

The first recorded group is $C_3^5\times C_6\times C_{12}\times C_{11568}$;
the third is $C_3^4$. These are database values, not newly verified Sage.js
results or timings. The first and third records set `used_grh=true`; the
second sets it false. Record that provenance separately from the assumptions
of each timed computation.

The query groups coverage into three-decade discriminant bands and captures
two extremes per signature for discriminant, class number, and regulator.
It preserves missing values, decimal strings for large integers, the exact SQL,
capture time, and raw-result hash. Reproduction script and report are
`lmfdb-broad-survey.cjs` and `lmfdb-broad-survey.json` in the existing
`modular-hnf-filter` evidence archive. Query SHA-256:
`773dfa3e138b45501c8baee2ed53aa2613df61bfa68727f707f2139d46386bfc`;
raw result SHA-256:
`842fc472a3c5c0da3a95a3e803fd77ae894cc6c219011c76abd7fc2f2b47b9d1`.

This is reconnaissance, not the frozen timing corpus. Next freeze a
deterministic sample within signature, discriminant, class-group, and regulator
strata, plus a separately reported extreme/missing-answer panel. Start with
bounded pilot measurements per stratum before scaling the timed sample.
Keep the synthetic large-regulator panel as a supplement: the largest recorded
complex regulator in this mirror is only about $3.67\times10^5$, far below the
earlier synthetic examples. LMFDB alone would therefore miss an already
demonstrated representation bottleneck. No new performance conclusion follows
from the bulk query itself.

### Frozen broad panel and first bounded phase pilot

`bench/class-unit-groups/cubic-broad-corpus.cjs` now downloads and validates a
prospectively stratified panel from the same read-only mirror. The seed is
`sagejs-cubic-overall-20260910-v1`. Strata combine signature, transitive Galois
group, three-decade discriminant and regulator bands, and trivial/cyclic/
noncyclic/unknown class data. Select at most 16 fields per stratum by a fixed
hash of the label, and retain the top two discriminant/class-number/regulator
extremes per signature separately. Selection never consults Sage.js results.
Derived polynomial discriminants and equation-order indices use exact integer
arithmetic, independently of the database's index metadata. Class-group
invariant products must match recorded orders. These are data consistency
checks, not a proof of the supplied field or class-group claims.

The frozen panel has **1,235 fields in 90 strata**: 524 complex and 711 real,
with 110 missing class numbers. Roles are 331 development, 892 holdout, and
12 stress fields. These role names are prospective: overlap with previous
development corpora must be audited before calling the holdout unseen.
Corpus payload SHA-256:
`65d445813d42a18d6d9e6debe231a620a05d900c805064448d0e0358a93ce219`.
The raw corpus and per-stratum populations are retained as
`lmfdb-broad-corpus.json` and `lmfdb-broad-corpus-summary.json` in the
`modular-hnf-filter` archive. No timed aggregate across these unequal strata
would represent the prevalence of research workloads.

`bench/class-unit-groups/cubic-broad-pari.cjs` freezes a 29-field stress pilot:
the 12 explicit extremes plus the largest recorded regulator among development
fields in each signature/discriminant band. It times `nfinit(f)` separately
from `bnfinit(nf,0)`, with one fresh process per field, seed 1, a ten-second
process timeout and a 512 MiB PARI stack ceiling. The ceiling is not a total
process RSS limit. These are GRH-conditional discovery timings without
`bnfcertify`, expanded-unit output, repeated samples or native Sage.js timings.
Startup wall time is retained separately; the small phase timings have only
millisecond resolution. The generated GP program receives coefficients, not
the database's answers, integral basis or factorization.

Both serial runs completed on the otherwise idle `opt` VM. PARI 2.17.4
completed all 29 fields: 26 agreed with database class numbers and invariant
factors, and three had no database answers to compare. PARI 2.15.4 completed
28 with identical class numbers and invariant factors; the remaining real
extreme hit the ten-second timeout. Different versions/builds and single
samples do not establish a general version-speedup claim.

| Missing-answer field | PARI result $h$ | 2.17.4 class-group phase | 2.15.4 class-group phase |
| --- | ---: | ---: | ---: |
| `3.1.1086061775432017340256300.1` | 314,928 | 545 ms | 644 ms |
| `3.1.12627147759764869116703083.1` | 162 | 1,075 ms | 1,104 ms |
| `3.3.19627909893848232377256843521369709.1` | 3 | 3,557 ms | process timed out at 10 s |

The first two defining polynomials are $x^3-89660767673106630$ and
$x^3-429667960411287811$. Their resulting invariant factors are respectively
$[3,3,3,3,3,3,3,12,12]$ and $[3,3,18]$. Their regulators are approximately
$471990.99$ and $7.0053933504\times10^9$. The real extreme returns $[3]$ and
regulator approximately $5.0388\times10^{16}$. These are PARI results, not
independently certified new mathematics. Merely filtering on *recorded*
regulator would exclude these large-regulator workloads from LMFDB itself.

In all three cases, 2.17.4's order initialization took one millisecond.
The class-number-202,393,728 example took 104 ms in discovery; the complex
class-number-one example with recorded regulator 367,081 took only 4 ms.
Large class number or regulator alone is not an adequate proxy for measured
cost. Missing database answers are also not evidence of intractability:
two of the largest complex examples finish in about a second in both tested
PARI versions. LMFDB's documentation does not establish why these particular
records lack answers. Keep “not recorded”, “timed out”, and “proved hard” as
distinct claims. No native/public Sage.js coverage or timing claim follows
from this pilot yet.

The exact per-field GP inputs, stdout/stderr, status, phase timings, host and
binary identities are archived under `broad-pari217` and `broad-pari215`.
The 2.17.4 executable hash is
`c87bdfb1fa3192bd1281c9975ff2da0783f8e6f747a8304e550bf0288fb81e1d`,
with explicitly selected `libpari-gmp.so.9` hash
`b7856e5e6ed098f816c122fc8116f1b1cb27776da77d6fe3eba66a901c1515eb`.
The system 2.15.4 executable hash is
`c9673623cad2eaa7cfe402e7b7d833f1f703689a09837026b6386aaafba6deec`.
Its real-field timeout is retained with the completed initialization marker;
it must not be replaced by a zero time or omitted from the denominator.

The initial local GP smoke test failed because `apply(Str, b.cyc)` is not a
valid conversion closure. Error detection rejected the run despite GP's zero
process exit status. The exporter now uses explicit `vector` construction;
the corrected local smoke test and both complete remote pilots use that form.
Offline tests cover exact index derivation, huge integer square roots, corrupt
metadata and result hashes, missing answers, invariant consistency, GP errors,
timeouts and mismatches. All 193 repository unit-test files passed. The full
1,235-field timed baseline, historical-overlap audit and Sage.js coverage
measurements remain next steps; this pilot does not replace them.

### Full broad baseline and the bounded GRH envelope experiment

The subsequent serial `opt` run uses the same frozen corpus and PARI 2.17.4
binary/library as the pilot. The runner's `all` mode visits every record,
including missing-answer fields. All **1,235 computations completed**:
1,125 class numbers and invariant lists agree with LMFDB; 110 have no database
answer. There are no timeouts or mismatches. These are still single-sample,
GRH-conditional phase diagnostics, not independent certification.

| Signature | Fields | Sum of `nfinit` times | Sum of `bnfinit(nf,0)` times |
| --- | ---: | ---: | ---: |
| Complex | 524 | 445 ms | 21,004 ms |
| Real | 711 | 414 ms | 9,518 ms |

The maxima in the class-group phase are 1,059 ms for the complex extreme and
3,520 ms for the real extreme. Initialization is not the dominant aggregate
cost on this panel. Startup is excluded from the phase sums; the strata are
unequally sampled, so these sums do not estimate research-workload prevalence.
Raw programs, results, errors and protocol are in `broad-full-pari217`.

The crucial limitation is visible when coverage is grouped by PARI's measured
`nfinit` plus `bnfinit` time, rather than by discriminant alone:

| PARI phase time (complex fields) | Fields | Accepted by the wide research variant |
| --- | ---: | ---: |
| Below 10 ms | 337 | 241 |
| 10–99 ms | 129 | 0 |
| 100–999 ms | 57 | 0 |
| At least one second | 1 | 0 |

Thus **every current success is still a sub-10-ms PARI workload**. Larger
discriminants and regulators do not by themselves establish progress on
computationally harder cases. The next campaign must cross this measured
cost frontier, keeping the synthetic seconds-scale panel in scope, rather
than treating the 75 coverage gains below as sufficient overall progress.

`broad-overlap-audit.json` compares this panel with the previous 1,100 records
(1,012 original, 30 membership neighbors, 58 magnitude neighbors), using exact
coefficients, stored canonical coefficients and historical labels. It finds
six overlaps: two prospective development fields and four holdout fields.
The roles are not rewritten after measurement. This is not an exhaustive
isomorphism audit or a claim of no exposure in any other historical dataset.

`bench/class-unit-groups/cubic-broad-native.cjs` runs one isolated child per
complex field, with efforts 5, 1, 7, 8 and the unchanged arena/caller-buffer
limits. Each child has a ten-second wall limit. The 711 real fields are
explicitly outside this kernel's signature, not reported as Sage.js failures.
These are direct research artifacts, not public dispatch, authenticated public
receipts, or fallback timings. The parent is source `c6b54bdb...` above.

| Research source | Accepted complex fields | Bounded declines | Exceptions | Timeouts |
| --- | ---: | ---: | ---: | ---: |
| Parent | 166 | 357 | 1 | 0 |
| Remove premature Minkowski rejection | 241 | 197 | 85 | 1 |
| Also handle wide discriminants exactly | 241 | 275 | 7 | 1 |

Every accepted class number and invariant list agrees with the full PARI run.
All 166 parent accepted outputs remain identical in all 64 slots. All 241
accepted outputs also agree between the two ablations. Repeating the first
ablation with the parent's one-page FLINT archive gives identical statuses
and accepted outputs; it is not a change of allocator masquerading as coverage.
`cubic-broad-report.cjs` requires complete runs, checks publication, invariant
orders, field discriminants and indices, and rejects missing comparisons or
false accepted results. It does not label scalar agreement a certificate replay.

#### Mathematical and representation changes

The first ablation removes only the early rejection when
$M=(2\lceil\sqrt{|D|}\rceil+6)\mathbin{//}7>4096$. This is a valid loose
unconditional Minkowski bound, but its size does not determine the actual
allocation: the GRH search was already capped at 257, its value table at 258,
and the final accepted generator bound at 257. If the existing exact GRH
inequality cannot prove a smaller bound, the unchanged final guard declines.
Removing this early rejection does not authorize using an unproved bound,
increase those allocations, or weaken the class/unit completeness check.
All 356 parent phase-2 declines have $M>4096$ by an independent integer check.

This exposes an unrelated representation limit. The resident integer log/sqrt
FFI accepts `fmpz` storage but calls `arb_log_ui` and `arb_sqrt_ui`, rejecting
values that do not fit an unsigned machine word. All 78 new batch exceptions
have $|D|>2^{64}-1$. The second ablation leaves the small-prime batch intact,
substitutes 1 in its discriminant slot when $|D|$ exceeds 32 bits (portable to
Wasm), then fills that slot's endpoints with existing exact-source operations:

- An outward logarithm interval from the arbitrary-precision positive-rational
  logarithm routine, applied to $|D|/1$.
- For $S=2^{96}$, let $q=\lfloor\sqrt{|D|S^2}\rfloor$. The scaled square-root
  endpoints are $q$ and $q+1$ unless $q^2=|D|S^2$, when both are $q$.

Thus $q/S\leq\sqrt{|D|}\leq(q+1)/S$ follows from exact integer inequalities,
not floating-point rounding or a machine-size assumption. The existing
Python square-root helpers supply $q$; focused tests execute the actual
source helpers and injected endpoint code on inputs through 521 bits, including
word boundaries and perfect squares. The log-routing test uses a stub to
check argument transfer; it is not an independent proof of Arb's log routine.
The full native run exercises the real declared log operation. No new native
primitive or FFI declaration is introduced.

All 78 batch exceptions become bounded declines, not new accepted answers.
Seven exceptions remain: five temporary-arena exhaustions, one output-buffer
word-capacity exhaustion, and one incomplete number-field-analysis projection.
The same field `3.1.997235064.9` times out in both ablations. Final decline phases
are 1 (one field), 2 (197), 4 (two), 31 (65), and 36 (ten); a final phase alone
does not identify all failed efforts or prove which individual guard fired.

#### Replay, timing, and the next structural difference

The first 21 newly accepted effort-5 fields in increasing discriminant order
were selected for detailed replay. This is post-coverage selection, not a new
untouched holdout. All 64 outputs agree between generated same-source
JavaScript, FLINT and GMP execution. Independent PARI ideal arithmetic checks
**661 principal rows**, maximal-order bases, exact relation-prefix identities,
and the published fundamental unit or trivial-class presentation as applicable.
The replay also calls `bnfcertify`. It is stronger than final-answer agreement,
but is not the detached independent Sage.js certificate verifier or a Lean proof.
Files: `grh-gains-survey.json`, `grh-gains-raw.json`, `grh-gains-replay.json` and
the corresponding generated GP programs/logs.

The wide variant additionally replays `3.1.5248896471.1` ($h=117$): this is
the smallest newly accepted effort-5 discriminant above the portable 32-bit
cutoff. All 64 outputs agree in the three backends, and independent replay
checks 28 principal rows and the published fundamental unit. This exercises
the new endpoint route on a successful result, not only on later declines.
Evidence is under the `grh-wide-replay` prefix.

A separate serial run on idle `opt` measures those 21 fields, with three
warmups and seven batches of eight fresh computations per implementation.
Native timing includes the direct polynomial-to-group call and assertion,
but excludes reusable caller-buffer setup, loading/JIT, and public dispatch.
PARI timing includes `nfinit` plus `bnfinit(...,0)`, without expanded units.
The system order alternates by field; this is not a randomized paired study.
All returned answers are checked. Summed per-field batch medians are
**193.162 ms native versus 50.375 ms PARI**, with no native wins in this panel.
The outlier `3.1.542518020.1` is 52.691 versus 2.750 ms. The first new field,
`3.1.284263800.2`, is 6.164 versus 2.250 ms. These are coverage gains, not a
claim of overall competitiveness or public-call speed.

The first timing-driver attempts emitted no GP results: increasing the PARI
stack ceiling on the same input line as the entire workload skipped the
remaining computation. The empty output was rejected, not counted as fast
success. Putting the stack setup on its own line produced the complete
21-field run retained in `grh-gains-opt-timing.json`.

The largest newly accepted discriminant is 323,711,668,280, with PARI
$h=1$ and $R\approx785290.78$; another accepted field has recorded
$R\approx367081.48$. This still leaves the seconds-scale extremes uncovered.
To identify the next mechanism, `grh-compound-forensics.cjs` traces the smallest
final-phase-31 decline, $x^3-x^2-33195x+2393095$, discriminant
$-14223227480$. Read-only generated-JS tracing preserves all 64 outputs versus
the unmodified native computation. Efforts 5 and 7 stop at phase 36, effort 1
at phase 44; effort 8 tries to plan pair 129 with 35 factors and four compound
multipliers, exceeding the unchanged 128-pair capacity.

PARI's trace uses the same **35 factor-base ideals**, cutoff 106, and a four-ideal
subbase. It collects an initial relation batch, subsequently obtains tentative
$h=12$ and $R\approx14924.495$, then adds three relations and reaches $h=3$.
Its final trace warns that expanded fundamental units are not supplied at that
precision. This reinforces two next tasks: stream/resume compound-ideal work
instead of rejecting its eagerly materialized plan, and retain compact exact
unit dependencies with certified logs instead of demanding huge expanded units.
The 257 certified search envelope and incomplete field-analysis candidates are
separate remaining frontiers; enlarging a buffer is not a substitute for these
algorithmic and representation changes.

For the broader measured-cost objective, a separate deterministic choice is
the least-discriminant complex field taking PARI at least 10 ms in the frozen
run: $x^3-93477150$, label `3.1.1246798226700.1`. Its recorded phase time is
14 ms, $h=405$, and $R\approx332.0468$; Sage.js declines at phase 2.
`grh-cost-frontier-pari.log` shows PARI's cutoff **458**, **74 factor-base
ideals**, three subbase ideals, and an initial 80-column relation target.
The trace spends most work in small-norm search and the 74-by-80 HNF, not in
order initialization. Trace timings are local diagnostics, not substitutes
for the controlled frozen timing. PARI reaches $h=405$ in the first displayed
regulator/class-number check.

This field exceeds **both** the current 257 search cap and 64-factor workspace
layout. Merely increasing the search constant cannot make the algorithm cover
it. In particular, fixed offsets such as `_GROUP_OFFSET = 670` rely on exactly
64 ten-slot factor records. The next generalization needs dimensioned resident
factor/group/prime-power workspaces with checked total resource budgets,
followed by resumable relation collection and compact unit authority. Do not
raise a factor-count constant while leaving these overlapping offsets intact.
This measured-cost target, rather than another sub-10-ms PARI success, is the
next campaign's main representative.

Both ablations remain generated research source copies, reproducible with
`cubic-grh-envelope-ablation.cjs PARENT OUTPUT [guard|wide]`. Source hashes are
`a9cb394dcde39569d233e6bb6e02e724149516a1e3eb310da75e700a3a5086ec`
(531,980 bytes) and
`1003d7acb758905e19fd1a48704e24ce76349d6e1cb0dfee59737cb3bece9f0b`
(533,345 bytes). Generated cores are respectively 18,530,075 and 19,288,620
bytes. Relink manifests identify the unchanged one-page FLINT archive and
exact addon hashes. Neither meets the unchanged production source allowance;
no production/compiler/source-limit change or cross-platform qualification is
claimed, and PR #203 remains draft. The archived broad coverage report, source
copies, build manifests, raw results and replay logs preserve failures as well
as successes. Full generated IR and binary caches remain scratch-only.

### Dimensioned storage and the first costlier-field successes

The next source-copy campaign separates storage, discovery geometry and exact
dependency reduction. It does not qualify a production envelope or replace the
overall goal with tiny-field timings.

`bench/class-unit-groups/cubic-dimensioned-workspace.py` forwards an ordinary
scalar `NativeRecord` layout through the transitive helper graph. Its runtime
policy accepts factor capacity $1\leq F\leq512$ and a search ceiling between
32 and 4096, checked before arithmetic or allocation. The chosen ceiling is
not a mathematical generator bound: the existing exact GRH-bound computation
must still succeed within it. The independent layout test checks disjoint
regions for every permitted capacity and exactly recovers the old geometry at
$F=64$. In particular, modular scratch now has $F^2+F+1$ entries. The runner's
optional `FACTOR_CAPACITY SEARCH_LIMIT` arguments bind both the buffer size
and the native ABI; its default remains unchanged.

This exposed a compiler obstruction: scalar record parameters were classified
as prime-field evidence even in exact helpers. The isolated
`agent/native-exact-layout-records` lane corrects dispatch and erases private
all-`uint64` records into scalar parameters before exact representation
analysis. Borrowed exact owners retain their identity; no public exact-record
ABI is introduced. The cubic layout traverses 39 helpers. Controlled serial
`opt` timing on 41 reused accepted controls gives sums of per-field medians
208.426 ms before and 207.264 ms after; worst field ratio 1.024. Five warmups,
seven alternating paired rounds of sixteen calls, full 64-word comparisons,
and the same one-page FLINT archive support no material regression on this
panel, not universal zero overhead. This timing precedes a final compiler
guard preserving existing public word-record graphs; its artifact identity
is not relabeled as a later build.

At capacity 128, the target $x^3-93477150$ reaches **the same cutoff 458,
74 factor ideals and 56 rational-prime groups as PARI**. Capacity 74 itself
still encounters a conservative one-extra-slot reservation; this is not
evidence for a 75th ideal. The next failure is a reduced discovery ellipsoid
with coordinate bounds $(321,2,2)$, rejected by the old per-axis cap 64.

The frozen diagnostic panel is the first 21 complex fields, ordered by
absolute discriminant, with prior PARI initialization plus class phase at
least 10 ms. It is reused frontier data, not a pristine holdout. The ablations
use capacity 128/search ceiling 1024 and retain the 1 MiB/3 MiB arena limits:

| Research variant | Accepted | Declined | 15-second timeouts |
| --- | ---: | ---: | ---: |
| Dimensioned layout only | 0 | 21 | 0 |
| Capacity-aware staged scheduling | 0 | 19 | 2 |
| Also redistribute the coordinate-box budget | 0 | 13 | 8 |
| Also use augmented HNF for compact dependencies | 2 | 19 | 0 |

The scheduling ablation changes eleven coordinated `factor_count <= 32` or
`> 32` guards to the allocated capacity. The volume ablation admits a box only
if $(2l_0+1)(2l_1+1)(2l_2+1)\leq129^3$. Thus every previously admitted
axis-64 box remains admitted, and the maximum bounding-box cardinality does
not grow. The $(321,2,2)$ box has only 16,075 points. Only the bounded,
resumable initial-volume path opts in; exhaustive fallback paths keep the old
axis cap. Positivity checks, exact candidate validation, proposal budgets,
candidate limits and final certification remain unchanged. This is a discovery
policy, not a completeness theorem.

#### The actual timeout is transformation recovery, not class-number size

The first full-rank prefix has 170 principal rows and quotient index 405.
Support compaction selects an **84 by 74 matrix with entries of absolute value
at most 3**. A first coarse trace localized the stall after support preparation;
the initial suspicion of Smith form was disproved by isolated tests. HNF and
SNF index probes finish in about 11 and 28 ms locally. Removing the redundant
SNF index calculation is mathematically valid but the full call still times
out. Finer tracing locates the stall in the subsequent
`fmpz_matrix_hnf_transform_prefix` call.

FLINT 3.6.0's `fmpz_mat_hnf_transform` dispatches a matrix of this full-column-
rank shape to `fmpz_mat_hnf_minors_transform`. The captured matrix reproduces
the timeout in an isolated native probe. The alternative computes ordinary
row HNF of $[A\mid I_m]$ and extracts the transformation. It finishes in about
73 ms locally versus a 10-second censoring limit for the direct transform.
PARI `mathnf(A~,1)` takes about 3 ms on the same captured input. These are
local single-run diagnostics, not controlled speedup claims.

The mathematical argument is simple and general. If
$U[A\mid I_m]=[H\mid U]$ is obtained by unimodular row operations, then
$UA=H$ and $\det U=\pm1$. For full column rank $n$, the final $m-n$ rows of
$U$ form a basis of the entire integral relation kernel: writing any integral
row vector in the unimodular $U$ basis, its product with $A$ vanishes exactly
when its first $n$ coordinates vanish. This preserves the exact dependencies
used to construct units; it does not by itself prove unit fundamentality or
class-group completeness. Independent PARI verification of the native probe
checks $UA=H$, $|\det U|=1$ and index 405; the recovered transformation's
entries require at most 13 bits.

The staged native implementation widens its two existing compact matrices
from $p\times n$ to $p\times(n+p)$ and reuses their logical prefixes, rather
than adding owners or leaving the native call. Each attempt overwrites the
entire active identity block before reduction. This adds $2p^2$ matrix slots
(57,800 slots at $p=170$), so unchanged arena ceilings do **not** mean unchanged
memory consumption. Insufficient resources must still decline. One-shot and
other transformation paths have not yet been generalized. The redundant
compact SNF index check uses the already verified full-rank HNF diagonal
product; invariant-factor computation for publication remains present. The
unused Smith scratch is retained in this controlled ablation.

#### Independent replay and controlled timings

Generated JavaScript, GMP and FLINT agree on all 64 published words for both
new successes. Independent PARI replay checks the maximal-order basis, every
one of 308 principal rows, the complete final-prefix unit lattice, and the
published fundamental unit. PARI `bnfcertify` passes. Intermediate prefixes'
unit lattices were not replayed individually. This remains an independent
PARI replay, not a detached Sage.js checker or a Lean proof.

| Field label | Class number / invariants | Native median | PARI median |
| --- | --- | ---: | ---: |
| `3.1.1246798226700.1` | $405$, $[3,3,3,15]$ | 369.567 ms | 14.000 ms |
| `3.1.1428754729688.2` | $393$, $[393]$ | 153.463 ms | 11.750 ms |

Controlled serial `opt` comparison uses five warmups and seven alternating
paired rounds of four calls on AMD EPYC 7B13, Node 26.7.0. Native timing is the
direct polynomial-to-class-group entry, including its existing exact witness
and certification work, excluding buffer allocation and loading. PARI times
fresh `bnfinit(polynomial,0)` calls, including initialization, with seed 1 and
class-number/invariant checks; process startup is excluded. Native full output
is checked after every batch. Both compute GRH-conditional class groups, but
their retained certificate contracts are not identical. Native is still about
26.4 and 13.1 times slower. These successes establish new native reach into
the measured-cost frontier, **not competitiveness on it**.

Evidence is under `build/cubic-analytic-schedule-evidence/modular-hnf-filter`:
`dimensioned-*-panel.json`, `dimensioned-forensics.json`,
`dimensioned-opt-timing.json`, `compact-transform-*-verify.*`,
`augmented-gains-{raw,replay}.json`, and `augmented-opt-timing.json`.
The source-copy chain and negative experiments are retained with their scripts.
Final experimental source SHA-256 is
`4474d3d4fb0cea66e5436a2fd449a02dbff48404c358208d2f1a43607f87b6b0`
(536,701 bytes), core SHA-256
`ee5881d4811372b8c34ca7bc94b6c760ec965145e522a22698db2db110433a25`
(20,433,494 bytes), cache key
`01b1a7ff1016698389a8e3b4988b0254400194ede9ad40354e05515b81792382`.
Source allowance, public dispatch, production artifacts and release readiness
are unchanged. Next work is efficient exact transformation/dependency recovery
and profiling the now-successful larger cases, followed by unseen neighbors
and the seconds-scale panel—not further optimization of tiny controls.

Correction to the previous handoff: CLI session 65056 terminated in FFI tests
with missing optional native prerequisites, including `libigraph.a`. It did
not pass the full 586-file suite and is not still running.

### Incremental canonical HNF: a measured larger-field improvement

The next diagnostic profile changes the immediate optimization target.
Instrumenting every generated cubic helper, while retaining the unmodified
mathematical body and checking all 64 output words, attributes 244 of 369 ms
to `_cubic_online_relation_lattice_update` on the class-number-405 field.
For the class-number-393 field it attributes 115 of 194 ms to that helper.
These are local instrumented exclusive times, not controlled comparisons.
The augmented compact transformation itself accounts for only 17.5 and 8.3 ms.
The online path was recomputing HNF after each nonmember relation even though
the previous canonical HNF was already resident.

`bench/class-unit-groups/cubic-incremental-hnf.py` supplies an ordinary typed
Python row-insertion algorithm. The companion `cubic-incremental-hnf-ablation.py`
adds that helper and replaces exactly one online HNF call in a source copy.
An AST regression reverses those two edits and requires the entire remaining
module to equal the input. Allocation, relation selection, membership tests,
support-ledger updates, certification and publication are unchanged. No field
coefficients, expected class numbers or discriminants occur in the helper.

#### Correctness invariant

Let $B$ be the current canonical row HNF of the admitted relations, padded
with zero rows to $n$ rows, and let $v$ be the incoming row. The helper copies
$[B;v]$ into the existing $(n+1)\times n$ output scratch. At each column it
combines the next basis row and the extra residual row; rows already assigned
pivots are never swapped with later rows. Both active rows are zero in all
earlier columns. Missing pivots are handled by exchanging the active row and
the residual, so deficient rank and skipped pivot columns are supported.

If their current entries are $a,b$ and $b$ is divisible by $a\ne0$, subtraction
eliminates $b$. Otherwise extended Euclid supplies $s,t$ and $g>0$ with
$sa+tb=g$. The two-row transformation is

$$
\begin{pmatrix}s&t\\-b/g&a/g\end{pmatrix},
\qquad \det=\frac{sa+tb}{g}=1.
$$

Swaps, sign changes and these determinant-one transformations preserve the
integer row lattice. After making the pivot positive, Euclidean division
reduces every entry above it into $[0,g)$. Later operations do not change
earlier pivot columns. Induction over columns gives increasing positive
pivots, reduced entries above each pivot and trailing zero rows: the canonical
row HNF of $[B;v]$. By uniqueness it is the same matrix as the replaced full
HNF call. Consequently the existing comparison with $B$ records exactly the
same support bit, and the same rank/index-one logic remains valid. Induction
over incoming rows preserves the complete support transcript, not just the
eventual determinant. Initial zero $B$ establishes the induction base.

The routine is private and assumes the stated padded-HNF input and distinct
correctly dimensioned matrices. It is not an unchecked public arbitrary-matrix
HNF API. Scalar arithmetic remains arbitrary-precision exact. It adds no
owned resources and retains the existing arena ceilings; this does not assert
a new worst-case bound on coefficient growth or qualify arbitrary capacities.
The compiler currently rejects augmented indexed matrix assignment (`-=`);
this experiment uses the equivalent explicit indexed assignment. That syntax
gap is recorded rather than changing the compiler during the arithmetic test.

#### Independent checks and controlled measurements

The checked-in dynamic test compares all 4,845 prefixes (including explicit
zero, skipped-pivot, negative, duplicate and 300-bit cases) against SymPy HNF,
with the orientation conversion explicit. A standalone native probe matches
306 final matrices across JavaScript and GMP (612 checks). That probe has no
qualified `fmpz` root; it is not described as a three-backend probe.
Separate prefix replay verifies JavaScript/GMP agreement, canonical HNF shape,
and independent PARI lattice equality for all 84 compact-matrix prefixes and
all 308 original principal-relation prefixes of the two successful fields.
An initially attempted large-matrix SymPy replay was deliberately stopped
after exceeding 2 GB; the PARI replay replaces that diagnostic, not the small
independent test or any mathematical acceptance condition.

The complete incremental cubic program agrees in all 64 publication words
with the independently replayed augmented parent in JavaScript, GMP and
`fmpz`. Controlled idle-`opt` timing compares the parent and incremental
artifacts afresh, with five warmups and seven rotating-order rounds of four
calls. PARI uses `bnfinit(polynomial,0)` with seed 1 and checks the same class
number and invariants. Startup, loading and input-buffer construction are
excluded; native exact certification remains included.

| Field label | Augmented parent | Incremental HNF | PARI | Native speedup | Remaining PARI ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| `3.1.1246798226700.1` | 351.891 ms | 123.166 ms | 14.00 ms | 2.857× | 8.798× |
| `3.1.1428754729688.2` | 152.861 ms | 71.102 ms | 11.75 ms | 2.150× | 6.051× |

This is a real improvement on costlier inputs, not yet PARI competitiveness.
The 21 reused frontier fields retain identical accept/decline decisions and
all 64 words on every attempted effort. The next 20 discriminant-ordered
PARI-at-least-10-ms neighbors were selected before running this candidate;
all 20 decline, without timeout or exception. They had earlier baseline
measurements, so they are not a globally untouched holdout. The full 41-field
panel has two successes and 39 declines. This does **not** establish successful
generalization to 20 unseen neighbors. The next declined field is
$x^3-86126810$, label `3.1.4860135888300.8`, with PARI $h=486$, invariants
$[3,3,3,3,6]$, $R\approx685.815$ and a 12-ms frozen class-group phase;
the current initial-ideal planning path declines. Its structural diagnosis,
and the seconds-scale/high-regulator cases, remain required work.

Evidence under the same scratch root and backed-up ignored archive includes
`augmented-profile-results.json`, `incremental-hnf-dynamic-results.json`,
`insertion-probe-results.json`, the three `insertion-*-replay.gp/json` pairs,
`incremental-target-results.json`, `incremental-opt-timing.json/log`,
`incremental-neighbors-manifest.json` and `incremental-panel.json`.
The timed research source is 540,492 bytes, SHA-256
`b747e9291b2d3c464e53a078e0eb3394844fccca5f6b8731a29eacc76c4fa43e`;
cache key `7bd0f436e3bb6e7186e32f514e20d509adaed58e48959a761eefe005c1ef9fec`.
Generated core: 20,757,173 bytes, SHA-256
`ea01e9415c3eadb7f4a041391250dfd9bb4f2a0716451c3cb2dc0adc9b098400`.
These are research artifacts, not a source-allowance increase or production
pack qualification. The checked-in helper has been formatted; AST equality
with the timed helper must be maintained rather than relabeling its hashes.

The subsequent full frozen-corpus comparison isolates the HNF change: both
the augmented parent and incremental candidate produce 273 acceptances,
245 declines and six exceptions on the 524 complex fields, with no timeout.
Every attempted effort has identical status, all 64 output words and error
text. All 273 accepted class numbers and invariant lists agree with PARI.
The 711 real fields are outside this kernel, not attempted failures. See
`incremental-isolated-report.json`, `augmented-full-native` and
`incremental-full-native` for protocols, source identities and every result.

Relative to the earlier 241-success wide-bound variant, the combined layout,
collection and transformation experiments add 32 successes and lose none.
Twenty-eight older successful publications change non-class-group words;
they must not be called byte-identical across that combined experiment.
Of the current successes, 271 take PARI under 10 ms and two take 10–99 ms.
None of the 57 PARI 100–999-ms fields is accepted. Six exceptions remain:
three temporary-arena exhaustions, one invalid number-field analysis
projection and two output integer-buffer capacity errors. These are reported
research failures, not silent fallback successes or qualified public behavior.

Further read-only tracing corrects the apparent cause of the next decline.
For $x^3-86126810$, the initial plans succeed, including a $(173,3,1)$
coefficient box. The collector later attempts its 501st candidate in one
ideal, hits the existing 500-candidate cap and encodes failure as a relation
count of 258 against capacity 257. Phase 34 was simply the last planning
marker. `next-decline-trace.json` retains the actual return-local trace and
checks parity with unmodified native output. The next experiment retires a
discovery region at the existing cap and continues with other ideals; it
must not raise the cap or confuse a partially explored region with a complete
enumeration. Final exact certification remains the sole publication authority.

The separate 41-control timing run on idle `opt` uses the same augmented and
incremental binaries as the larger-field run, five warmups and seven alternating
rounds of sixteen calls. Sums of per-field medians are 167.870 and 164.596 ms;
the median incremental/parent ratio is 0.9955 and the largest is 1.0430. No
field exceeds 1.05 in this run. All 64 output words are checked after each
batch. `incremental-opt-controls.json` retains every sample and exact binary
identity. This supports no material regression on these reused controls,
not a universal no-regression theorem.

The capped-region retirement ablation compiled and ran on the same 41 fields.
It adds no successful class groups: two still succeed and 39 decline, without
timeout or exception. On $x^3-86126810$ it collects 233 rows while keeping each
ideal at at most 500 candidates, then hits the next explicit guard: staged
presentation storage allows only $2n+22=180$ rows for $n=79$. It does not yet
attempt the final certificate. Thus the phase-44 result must not be described
as an analytic-index failure. The raw relation store has capacity 257, distinct
from this staged presentation allowance. This negative experiment is archived
as `retire-capped-ideal-ablation.py`, `dimensioned-retired-closure.py`,
`retired-panel.json` and `retired-decline-trace.json`; it is not production code.

PARI debug-3 forensics on this same field (`next-field-pari.gp/log/json`) shows
cutoff 383, 54 rational primes and 79 factor ideals. PARI first uses 85 relation
columns and obtains tentative class number 1944 with regulator
$685.8145472999\ldots$. It then seeks seven further relations using its
small-ideal recovery step (the trace identifies $p_0$ above 2 and ideals above
131, 167 and 3), and the tentative class number becomes 486 with unchanged
regulator. The local trace attributes 5 ms to the first small-norm search,
3 ms to the initial HNF and below its millisecond resolution to `hnfadd`.
These instrumented/local phase values are not a new controlled benchmark.
PARI also warns that explicit fundamental units are not supplied at this
precision with the chosen `bnfinit(...,0)` call. Our comparison continues to
use the requested class-number/invariant workload; it does not claim identical
unit-publication contracts or substitute a heavier PARI baseline.

The next algorithmic question is therefore why our initial collection needs
233 rows where PARI reaches a full-rank presentation in 85, and how to retain
and certify the compact support before allocating tall staged workspaces.
Do not merely raise 180 or 500 until this difference is understood. The
seconds-scale/high-regulator regime remains part of the overall objective.

The subsequent changed-file validation is terminal, not still running: merge
checks, all 194 unit files, the full build and documentation checks pass. The
587-file CLI tier then fails in FFI tests after four files pass; 581 files are
not started. Missing local optional native prerequisites include the graph
prefix's `libigraph.a`. This is not a whole-suite pass. The architecture run
also retains the known stale optimizer-opportunity manifest failure; refreshing
that manifest is not a substitute for review. Draft PR 203 remains unqualified.

### Broader-factor scheduling, analytic extent and retained unit witnesses

The next read-only ledger snapshot makes the rank failure precise. For
$x^3-86126810$, the 233-row retired-region variant has rank 78 rather than 79
modulo 27449. Its entire column for the factor ideal above 263 vanishes. That
ideal's transposed stored HNF is
$\left(\begin{smallmatrix}1&0&0\\0&1&0\\142&229&263\end{smallmatrix}\right)$.
The initial selected-ideal prefix excludes it from direct search. This is not
discriminant factoring or an analytic failure. The stale staged-storage comment
also contradicts current admission: dependent rows are retained before full
rank, so the claimed post-target rank-increase bound no longer applies.

Separate source-copy ablations preserve the 500-candidate per-ideal limit,
existing arena budgets and final certificate:

| Discovery schedule | First raw rows | Modular rank | Outcome on this field |
| --- | ---: | ---: | --- |
| Retire capped regions, selected ideals | 233 | 78 | staged storage guard |
| Dependent quota alone | 84 | 78 | rank insufficiency |
| Lazily admit all factor ideals | 125 | 79 | analytic interval inconclusive |
| All ideals and dependent quota | 85 | 79 | analytic interval inconclusive |

The quota admits at most `target - factor_count` modular-dependent witnesses
before full rank. It is only discovery scheduling: it can discard an important
integer-index or unit witness. PARI's `add_rel_i` also limits dependent admission
through its `relsup` counter, and its `small_norm` visits the full selected
factor list. These are structural correspondences, not a claim that our
candidate order, generators or unit sidecar are identical to PARI's.

Independent PARI replay of all 130 principal rows and the actual proof
checkpoints finds quotient orders 1944, 972, 486 at raw counts 85, 101, 106.
Every checkpoint's full unit lattice has index one. Sage.js nevertheless
reconstructs a unit of index two from the first compact subset. The six-row
positional tail loses earlier dependent witnesses. Once the correct class
number and regulator are available, the final scaled log-index interval is
$[-3084636304,3089780167]/2^{32}$. Its upper endpoint is about 0.7194, above
$\log 2$: another relation cannot resolve this interval-width obstruction when
the class and regulator evidence are unchanged.

An explicitly accounted research extent of $X=1800$, replacing the refined
$X=1494$ finite sum, certifies the field under the same theorem and index test.
The exact scale $X/9=200$ is retained. Universal prime-power counting gives
367 finite terms and 288 required values; this experiment uses capacities
512/512. It adds 1,202 exact-vector slots and 1,280 matrix entries, without
adding owners or increasing the 1-MiB/3-MiB arena budgets. This is not
constant-memory, a production cap increase, or cross-platform qualification.
The extent and both table dimensions change together; the original small
initial extent is unchanged. `analytic-extent-layout.json` and the inspectable
`analytic-extent-ablation.py` retain the derivation and hashes.

The tracked `bench/class-unit-groups/cubic-dependent-witness-tail.py` then
changes only `_cubic_compact_relation_plan`: walk backward until six
**non-support** rows have been retained, rather than inspecting the last six
raw positions. The selected set still contains the entire exact HNF support
and at most six additional rows, so it generates the same relation lattice
and respects the same compact-row bound. It also contains the old positional
selection. This does not prove preservation of the full unit lattice or a
speedup; exact unit/index certification remains mandatory. Exhaustive testing
covers 40,955 support-mask/tail-budget cases, including empty, all-support,
all-redundant and early-redundancy cases, and rejects out-of-range reads.
All other program AST nodes are unchanged. The tracked transformer reproduces
the compiled experiment's entire AST exactly.

Both extent variants certify four of the reused 41 costlier fields; 33 decline
and four raise resource exceptions. Independent replay of the witness-tail
variant verifies all 360 principal rows across these four successes, full unit
lattices at eight actual checkpoints, and all four published fundamental units.
All 64 outputs also agree across JavaScript, GMP and FLINT for each variant's
captured run. This is independent PARI replay, not a detached Sage.js checker
or Lean formalization.

Controlled idle-`opt` comparison uses five warmups and seven rotating-order
rounds of four fresh direct native calls, with each variant's full 64-word
output checked and PARI `bnfinit(f,0)` class numbers/invariants checked:

| Field label suffix | Positional tail (ms) | Witness tail (ms) | PARI (ms) |
| --- | ---: | ---: | ---: |
| `1246798226700.1` | 89.310 | 91.481 | 14.000 |
| `1428754729688.2` | 83.211 | 82.382 | 11.750 |
| `4860135888300.8` | 205.840 | 205.538 | 11.500 |
| `5782398831495.20` | 179.941 | 121.887 | 10.750 |

The class-number-108 field improves 1.476-fold; this is neither a universal
speedup nor a PARI win. The two larger new successes still take roughly
18 and 11 times PARI's time. These measurements do not include public dispatch
or startup, and PARI's explicit-unit publication contract remains different.

Full frozen-corpus validation gives 280 accepted class groups for both extent
variants, all matching PARI. The positional variant has 225 declines and 19
exceptions; the witness variant has 226 declines, 16 exceptions and two
10-second censored runs. The runs were local coverage diagnostics, not isolated
timings. One censored field still times out at 15 seconds in a separate retry;
the other completes. The original censored observations are retained.
Against the preceding 273-success incremental variant, these combined changes
gain ten fields but lose three, all of which now hit a bounded exact unit
materialization exit. There is therefore no promotion recommendation. The
isolated witness-tail change gains and loses no accepted fields, but changes
109 attempted outputs/statuses. Of the 280 successes, 276 have PARI cost below
10 ms and four have cost 10–99 ms; none reaches the 100-ms-or-higher frontier.

Artifacts include `retired-collection.json`, `quota-collection.json`,
`fullbase-collection.json`, `fullquota-collection.json`, the corresponding
`*-decline-trace.json` and `*-panel.json` files, `extentwitness-target-raw.json`,
`extentwitness-target-replay.json`, `schedule-opt-timing.json`, and
`schedule-full-report.json`. Source/core/binary hashes are recorded in
`dimensioned-artifact-summary.json`. All experiments remain research copies;
production source and its allowance are unchanged.

### Smith invariants from the resident square basis

Diagnostic profiling of the class-number-486 witness-tail run attributes about
70 ms to four tall Smith computations and 41 ms to four compact-presentation
preparations. These are instrumented local observations, not controlled timing.
The exact square HNF already exists before each Smith call. For full column
rank, its first $n$ rows generate exactly the same sublattice of $\mathbf Z^n$
as the raw relation matrix; its Smith factors are therefore identical.

`bench/class-unit-groups/cubic-square-smith.py` changes only the matrix and
logical row-count arguments at the two audited Smith call sites: use
`relation_hnf` and `factor_count`. The preceding rank/HNF preparation remains
mandatory. Raw principal rows, all support and compact-presentation checks,
unit recovery, allocation, final certification and publication are unchanged.
This does not infer class-group completeness from Smith form. Independent
CPython/SymPy tests cover 244 full-rank tall/square pairs, including duplicated
and zero rows and integers through 513 bits; AST tests prove that nothing
outside the four argument expressions changes. The tracked transformer
reproduces the compiled whole-source AST.

On all 524 complex fields, the square-Smith variant retains the parent's
280 acceptances, 226 declines, 16 exceptions and two censored runs. Every
completed attempt has identical full 64-word output, status and exception text.
No claim of output equivalence is made for the two censored computations.
All accepted class numbers/invariants match PARI. The four larger successes
also have identical JavaScript/GMP/FLINT outputs to the independently replayed
parent. Generated source is 541,205 bytes (ten fewer), SHA-256
`f42331b80fe22caef454d8502047b19b8af55ecc4a448853d8573ffe884d542c`.

The subsequent idle-`opt` paired run preserves the same five-warmup,
seven-round, four-call protocol, now requiring identical full outputs for
both variants:

| Field label suffix | Tall Smith (ms) | Square Smith (ms) | PARI (ms) |
| --- | ---: | ---: | ---: |
| `1246798226700.1` | 91.693 | 87.934 | 14.000 |
| `1428754729688.2` | 80.574 | 72.709 | 11.750 |
| `4860135888300.8` | 207.965 | 175.571 | 11.500 |
| `5782398831495.20` | 120.676 | 114.878 | 11.000 |

These are measured improvements of 1.04–1.18-fold, not PARI wins. Preserve
`square-smith-opt-timing.json`, `square-smith-targets.json`,
`squaresmith-full-native`, and the profiling scripts/results separately from
the controlled artifacts. The benchmark VM was idle before the serial runs.

Current validation: changed-file merge checks and all 195 unit files pass;
the focused witness/HNF/Smith suite passes, including the independent exact
oracles. Python formatting and direct docs/scope checks pass. The architecture
gate still fails at the previously documented stale optimizer manifest; no
inventory was refreshed to hide it. This research-only change is not a
production or cross-platform qualification.

Next priorities follow the evidence: preserve successful old searches while
resuming through missing factor ideals; make analytic extent/storage adaptive
under explicit budgets; carry compact unit authority without expanding large
dependency powers; and avoid rebuilding unchanged proof stages. In particular,
the three lost fields exit at the existing bounded unit-materialization guard,
and the seconds-scale/high-regulator frontier remains unserved. Broadening
discovery globally is not ready for promotion merely because ten fields improve.

### The three lost trivial groups and unexpanded unit evidence

Read-only traces of both variants, with identical 64-word results across
JavaScript/GMP/FLINT, refine the preceding materialization diagnosis. All three
lost fields have class number one. The old search reaches an exact trivial
relation quotient and publishes without requiring a fundamental unit. The
broader/quota search remains at quotient order two, repeatedly fails unit
reconstruction at the exponent-limit exit (status 17), and exceeds the existing
4096 dependency-exponent budget. Thus unit materialization is the observed
exit, but the changed relation-discovery schedule also loses decisive class
relations. Preserve the successful old search before broader activation.

The captured unit log magnitudes are about 367081.4754, 28479003.5178 and
862343.9301. The middle value is **not** the field regulator: comparison with
PARI's numerical regulator 418808.8753 initially suggests unit index 68. A
subsequent PARI companion check with `bnfunits` and factored `bnfisunit` returns
the exact exponent 68 and finds that the **entire raw relation kernel** at that
checkpoint generates a unit subgroup of index 68. This is not just a witness
lost during compaction. The other two captured subgroups have index one, while
all captured class quotients have order two. A compact unit representation
alone cannot remove these indices or prove completeness. The companion uses
`bnfinit(f,1)` to retain unit data; the initial flag-zero attempt cannot supply
`bnfunits` at that precision and is preserved as a failed experiment. It is not
a timing comparison with the flag-zero class-group baseline.

`bench/class-unit-groups/cubic-compact-unit.py` now supports a supplied rational
order basis, not just the equation order. It verifies that the basis contains
1 and is closed under multiplication. Each ideal must be closed under every
order basis element and independently invertible; closure under the polynomial
generator alone is insufficient in a larger order. Principal-ideal identities
and the exact zero relation residual then prove the formal product is a unit.
Neither maximality nor fundamentality is assumed or asserted.

An independent real-logarithm checker isolates the unique real root exactly,
evaluates each generator by rational interval Horner arithmetic, and uses
outward-rounded fixed-point arithmetic for $\log v=2\operatorname{atanh} y$.
After reduction to $1\leq v\leq2$, $0\leq y\leq1/3$; the omitted positive tail
after $N$ terms is bounded by

$$
\frac{2y^{2N+1}}{(2N+1)(1-y^2)}
\leq \frac{9}{4(2N+1)3^{2N+1}}.
$$

All sums of signed dependency logarithms retain outward rounding. An interval
containing zero is inconclusive, never a torsion certificate. A strictly signed
interval, together with the ideal replay, proves a nontorsion unit without
expanding any dependency power. This is an independent CPython/SymPy research
checker, not yet native certificate publication or a formalized proof.

Five actual compact witnesses from the three fields (two old, three new) pass
this replay: 201 principal-generator occurrences over the supplied order bases,
maximum dependency width 25 bits, and no expanded unit powers. Their independent
128-bit-scale log enclosures have widths at most $2.47\cdot10^{-28}$ and overlap
the retained native intervals. Overlap does not independently establish that
the narrower native intervals themselves enclose the exact value. These checks
prove unit membership and nontorsion, **not** a fundamental unit or class group.

Tests include 30 unimodular changes of order basis, invalid/nonclosed bases,
an equation-order lattice that is not an ideal of the larger order, 260
high-precision numerical comparisons and 12 exact rational-series comparisons
for the rational log enclosure, signed
huge-exponent products, cancellation, and zero-containing interval rejection.
The numerical comparisons are regression oracles, not the enclosure proof.
Artifacts: `trace-unit-losses.cjs`, `unit-loss-traces.json`,
`replay-unit-losses.py`, `unit-loss-independent-replay.json`, and
`pari-unit-loss-indices.json`. The next
mathematical boundary is combining this compact exact unit authority with a
verified regulator lattice and the joint class/unit index test, while recovering
the missing class relations and retaining explicit failure/resource accounting.

The old final presentations expose one decisive relation for each regression.
Independent ideal replay and square-HNF index checks verify that adjoining
each row to the corresponding new first full-rank checkpoint reduces the
quotient order from two to one:

| Field suffix | Old row (zero-based) | Generator in the defining power basis |
| --- | ---: | --- |
| `232227935940.1` | 46 | $(-49474+144a+a^2)/261$ |
| `738427259115.2` | 58 | $(130527-47a+a^2)/137$ |
| `750484414680.1` | 47 | $848+3a$ |

These are diagnostic witnesses, never hardcoded inputs to discovery. The old
final raw counts are 47, 59 and 54; the new first full-rank counts are 35, 43
and 47. `replay-missing-trivial-relations.py` and
`missing-trivial-relations.json` retain all exact rows, generators and hashes.
This identifies concrete missing work rather than treating the last
unit-materialization guard as the whole cause of the regression.

Call-origin tracing (`trace-missing-proposals.cjs` and
`missing-proposal-origins.json`) places all three old witnesses in
`_cubic_append_initial_volume_ellipsoid`. No rational multiple or sign change
of any corresponding generator reaches the new variant's smooth-relation
append boundary. Thus these are not the same proposals subsequently rejected
by that appender's admission test. The discovery traversal or earlier filters
must be reconciled before blaming only the final certificate.

Validation of this follow-up is terminal: focused exact tests, all 195 unit
files, the eight-stage build and documentation checks pass. The 588-file CLI
plan stops after four files pass and `test/ffi.cjs` reports five failures from
missing FFLAS/igraph prerequisites; 582 files are not started. The architecture
gate still reports the previously recorded stale optimizer manifest. These are
not whole-suite or release passes. No timing or build job remains live from
this checkpoint.

## Missing LMFDB class numbers and the seconds-scale cost frontier

Missing database answers must not be equated with computational hardness.
Reclassification of the existing frozen 1,235-field PARI 2.17.4 run gives the
following complex-cubic counts. These bands use **only** `bnfinit(nf,0)` wall
time, unlike the combined initialization/class-group bands above.

| LMFDB class number | Fields | Below 10 ms | 10–99 ms | 100–999 ms | At least 1 s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Missing | 98 | 27 | 43 | 27 | 1 |
| Recorded | 426 | 315 | 81 | 30 | 0 |

All 98 missing-answer complex fields completed, as did the 12 missing-answer
real fields. This is a stratified sample, not a population-weighted estimate.
It does not establish why any database entry is missing. The corresponding
PARI results are GRH-conditional reference answers, not independent
certificates or newly contributed LMFDB data. Across the 98 complex fields,
initialization totals 82 ms and the subsequent class-group/unit phase totals
10,284 ms. Discriminant factoring is not the dominant aggregate phase on
these particular inputs; this must not be extrapolated to arbitrary cubics.

Three fresh, serial local debug traces isolate the wider regime. They are
not controlled `opt` timing comparisons, and their phase timer intervals
include surrounding work, not just isolated function bodies:

| Field label | PARI class number | Factor-base ideals | Initial relation matrix | Main debug timer intervals |
| --- | ---: | ---: | --- | --- |
| `3.1.256834971976.1` | 3 | 32 | $32\times38$ | HNF 1 ms; complete class-group phase 3 ms |
| `3.1.1086061775432017340256300.1` | 314928 | 443 | $443\times442$ | Initial small-norm search 320 ms; initial HNF 179 ms |
| `3.1.12627147759764869116703083.1` | 162 | 349 | $349\times177$ | Small-norm search 261 + 90 + 2 ms; largest HNF update 654 ms |

PARI stores relations as columns in these debug dimensions. The last field is
$x^3-429667960411287811$, with class invariants $[3,3,18]$ and reported
regulator approximately $7.0053933504\cdot10^9$. Its fresh trace takes 1 ms
for `nfinit` and 1,033 ms for `bnfinit(nf,0)`; the earlier frozen run recorded
1,059 ms for the latter. PARI starts with 66 relations, obtains 111 more in
its first search pass, then appends 173, four and one relations, reaching
355. The factor-base bound is 2,247. The trace explicitly warns that the
fundamental units are too large to return. No expanded unit or unconditional
`bnfcertify` is requested.

The 443-ideal field has bound 2,960 and finishes with 449 relations. Its
regulator is approximately 471,991. It also warns that the explicit
fundamental units are not supplied at the available precision. The returned
class numbers/invariants in all three traces agree with the corresponding
earlier PARI run; that is repeatability, not an independent proof.

The inspected PARI `buch2.c` calls `hnfspec_i` on the first relation batch,
and `hnfadd_i` on subsequent batches while carrying dependency and embedding
data. Thus the large HNF interval is not merely computing the Smith form of
a small final class presentation. Scaling our incremental exact presentation
and compact dependency witnesses together remains essential.

Our square-Smith research artifact still declines the 443-ideal field at
phase 2, and the 349-ideal field raises the recorded number-field-analysis
projection exception before relation collection. Neither is a native success.
The next wider campaign should use the 443-ideal field as an explicit
hundreds-of-milliseconds target: establish a certified factor-base bound,
dimension the resident state for that base, and profile relation collection
and exact dependency-preserving linear algebra. Resolve the analysis boundary
separately for the one-second target. Simply removing caps or expanding huge
units is not a solution. Retain the smaller frozen cases as regression tests,
not as substitutes for this wider frontier.

A fresh capability probe of the lazy-rank research source
`37a4efb4d234ac235f6cf308c3c4299f546b2c775b02405cf1ab92ec3f3bf0fd`
on the 443-ideal field still declines at phase 2 for both research layouts
`(factor_capacity=128, search_limit=1024)` and `(128,4096)` on efforts
5, 1, 7 and 8. The `(512,4096)` layout instead raises
`NativeExactArena memory limit exceeded` before relation collection. The
primary and temporary budgets remain 1 MiB and 3 MiB. No failed invocation
counts as a speed result. Raw results are in `native-layout-probe.json`.

Read-only generated-JavaScript return-local tracing then disambiguates phase
2, with all 64 output words checked against the unmodified FLINT-native call.
At search limit 1,024 the GRH cutoff helper returns zero. At 4,096 it returns
**2,960, exactly PARI's bound**. The later decline occurs while processing prime
727, with 126 factor slots and 89 rational-prime groups already used: the next
group cannot fit the 128-slot layout. Thus the mathematical generator-bound
gap is closed for this example within the existing research helper. The next
obstruction is dimensioning and using the 443-ideal resident state within
reviewed memory requirements, not inventing a more permissive GRH assumption.
The trace is retained as `native-decline-trace.json`.

The layout formula exposes a specific storage opportunity: its primary exact
vector reserves $123F+320$ integer slots for factor capacity $F$, of which
$108F$ are reserved for twelve $3\times3$ ideal powers per factor. Under the
existing 32-byte-per-slot semantic charge, $F=443$ already requires 1,753,888
bytes before integer payload growth or other owners; $F=512$ requires
2,025,472 bytes. This alone exceeds 1 MiB. These are semantic charges, not
physical RSS measurements. An on-demand or bounded-cache ideal-power layout
is therefore a concrete general storage experiment; it must preserve all
power consumers and exact valuation checks. Lowering the accounting constant
to make the same allocation appear smaller would not solve the problem.

`cubic-broad-report.cjs` now reports answer availability separately, retaining
incomplete runs in its denominator and checking phase boundaries. The debug
replay also exposed a parser bug: starred `Bach constant` and `check`
diagnostics were mistaken for GP failures. The parser now admits only those
two exact numeric diagnostic shapes; malformed lines and actual GP errors
still fail. The initial misclassification is retained in raw evidence and
corrected by replaying its stdout/stderr, without restarting the computations.

Evidence is hash-verified under
`build/cubic-analytic-schedule-evidence/missing-answer-phases/`, including the
GP programs, raw debug traces, corrected parses, aggregate report and source
scripts. The underlying corpus hash remains
`65d445813d42a18d6d9e6debe231a620a05d900c805064448d0e0358a93ce219`.
No mathematical implementation, production source allowance, arena budget or
default proof policy changes in this reporting follow-up.

Validation: the seven focused corpus/report tests pass, as do `test:changed`
(merge invariants, all 195 unit files, the eight-stage build and documentation
check), standalone documentation checks and the task-scope check. This does
not resolve the previously recorded full-CLI or release-qualification gaps.

## Bounded higher ideal powers and the next anisotropic-search boundary

`bench/class-unit-groups/cubic-bounded-power-cache.py` now emits an inspectable
research source copy with permanently resident prime-ideal bases and a bounded
cache of higher powers. This is not a public dispatch change. The generated
source is 546,403 bytes, SHA256
`32f1cace5c3e3ad0b42457ba1fe26b41b6cfce2dcb3c2af841255d9c23392dc1`;
its native cache key is
`4234700222093cb18ff8f7803210c0f20668942876aea58b5c27244313f4985f`.
It derives from the lazy rank-recovery source
`37a4efb4d234ac235f6cf308c3c4299f546b2c775b02405cf1ab92ec3f3bf0fd`.
The production source remains 480,241 bytes under its unchanged 485,000-byte
allowance. Primary and temporary arena limits remain 1 MiB and 3 MiB.

### Storage contract and exactness argument

For capacity $F$, keep $9F$ entries for the original prime-ideal HNF bases.
There are $S=\min(F,32)$ direct-mapped cache slots. Each slot has a factor
identity, a valid prefix depth, and eleven nine-entry bases for powers
$P^2,\ldots,P^{12}$: 101 entries total. All remaining layout regions retain
their sizes. The primary vector therefore changes from $123F+320$ entries to
$24F+101S+320$ entries. At $F=512$, its base semantic charge falls from
2,025,472 to 506,880 bytes; at $F=443$, it falls from 1,753,888 to 453,888
bytes. These figures exclude integer payloads and other owners and are not
RSS measurements. They do not change the accounting rate.

Generated core C shrinks from 20,719,467 to 20,342,788 bytes; the Linux addon
grows slightly from 20,706,064 to 20,714,256 bytes. These are artifact-size
observations, not peak-memory or compile-time qualification. Both builds use
the same isolated exact-layout compiler prerequisite; no compiler or allowance
change was needed for this cache.

The cache invariant is: a slot tagged with factor $i$ and depth $d$ contains
the exact bases of $P_i^2,\ldots,P_i^d$, with $1\leq d\leq12$. Empty slots
have zero identity and depth. The permanent $P_i$ bases remain unchanged.
On an identity mismatch, reset the published prefix to depth one. On a miss,
the existing exact ideal product multiplies $P_i^d$ by $P_i$. Publish depth
$d+1$ only after that product succeeds. Induction gives the same lattice as
the old eagerly retained power table. Eviction discards derived data, not
mathematical evidence. A failed product may dirty its unpublished destination;
retry overwrites that destination without treating it as valid.

Returned offsets are synchronous borrows, not durable references: consumers
must finish using them before another cache lookup can evict the slot.
Valuation first fills the requested maximum power, then tests lower powers
without intervening eviction or multiplication. The old per-factor valuation
metadata is not used as cache-validity authority. Ramified-square tests and
both prewarming loops use the same helper. Relation admission, exact norm and
membership tests, discovery order, exponent limit and final certification are
unchanged. Malformed identities/depths and out-of-range accesses fail closed.

The independent CPython/SymPy test checks 17,200 lookups on 55 actual prime
ideals, cache sizes 1, 2, 4, 16 and 32, powers through twelve, eviction,
repeated hits, immutable prime bases, and 22 invalid/failed-product cases.
Reference ideal powers use independent exact ideal arithmetic. Seven reused
structural controls additionally have identical complete output buffers in
FLINT, GMP and generated JavaScript. These tests support this cache argument;
they are not detached proofs of complete class-group results.

### Completed coverage and controlled timing

The frozen 1,235-field corpus is rerun on both the parent and cache sources,
with capacity 128, search ceiling 1024 and efforts 5, 1, 7, 8. Both accept
286 complex fields, decline 220, raise 16 exceptions and time out on two;
711 real cubics remain explicitly outside the kernel signature. Every
accepted class number and invariant list agrees with the frozen PARI run.
Every completed attempt preserves status, error and all 64 output words.
Matching timeout statuses do not establish equivalence of censored outputs.

This also completes the previously missing full-corpus check of lazy rank
recovery: compared with the older square-Smith run it gains six acceptances
and loses none, including recovery of all three former class-number-one
losses. Those gains belong to rank recovery, not to the cache change.

The cache ablation runs serially on idle `opt` (AMD EPYC 7B13, Node 26.7.0).
Its panel consists of seven reused structural controls plus 33 deterministic
SHA256-ranked effort-five successes, selected without candidate timing data.
This is neither a fresh holdout nor a population-weighted workload. Each
implementation has five warmups and seven rotating-order rounds of four
calls. Native calls include polynomial-to-result certification, excluding
input packing, loading and process startup. PARI uses `bnfinit(polynomial,0)`;
all answers/invariants and native full-output equality are checked. Artifacts,
binary hashes, runner, field panel and raw samples are retained.

Across the 40 fields, the geometric mean cache/parent time ratio is 0.94137;
sums of per-field medians are 622.107 versus 636.502 ms. Thirty-nine medians
decrease; the other rises 0.19%. Thus this run finds no material slowdown,
not a universal no-regression guarantee. The four larger controls move from
100.000, 54.495, 113.016 and 120.514 ms to 98.450, 53.512, 110.935 and
118.608 ms. PARI remains at 14, 11.75, 11.5 and 10.75 ms. The cache is a
storage improvement with modest speed benefits, not a PARI win.

### Larger-field diagnosis: geometry is not a work budget

With capacity 512 and search ceiling 4096, the 443-ideal field
`3.1.1086061775432017340256300.1` now passes the former allocation obstruction.
Both native backends decline during ideal planning, phase 34, factor index
16 over the prime 53. A separate JavaScript attempt times out at 90 seconds;
large-field three-backend parity is therefore not established.

Source-transparent diagnostic copies isolate return $-2$ from ellipsoid
preparation. Exact LLL succeeds, the Gram matrix is positive definite, and
the first reduced basis vector is the scalar $-53$. The coefficient bounds
are $(84546,2,2)$: 4,227,325 bounding-box slots exceed the old $129^3=2,146,689$
limit. This is a resource-policy decline, not a failed mathematical premise.
All captured diagnostic output words agree between FLINT and GMP.

Inspection of PARI 2.17.4 `buch2.c`, `Fincke_Pohst_ideal`, shows a structurally
different policy: conditional centered enumeration, explicit scalar-axis
skipping, at most 500 attempted nonscalar factorizations, and a separate
1,000,000 enumeration-trial limit. It does not first reject the enclosing box
because its scalar direction is long. An independent exact Gram diagnostic
on our rejected region finds 500 distinct primitive nonscalar points after
500 leaf visits, two rows and one plane, with maximum absolute coordinates
$(250,1,0)$. This checks points in the region, not smoothness or class relations.

The next experiment should retain exact conditional intervals but use explicit
visited-node/candidate budgets and resumable cursors, skipping the scalar axis
without charging its entire virtual length. Our current cursor accounting
charges virtual box slots, so removing the preparation guard alone is not a
complete fix. Preserve old successful prefixes and final certification; do
not disguise a wider geometry envelope as a correctness theorem or simply
raise the box cap. The seconds-scale compact-unit and HNF boundaries remain.

Source copies, diagnostics, reports and raw timing/coverage evidence are kept
under `build/cubic-analytic-schedule-evidence/bounded-power-cache/`; rebuildable
native artifacts remain on scratch. The research code is not qualified for
public receipts, cross-platform release, or independent full certification.

An initial work-budget source copy now exists at SHA256
`37fc85bd60fb5d097ff8db65c03d59e01ae19ed61a3170909fd71f20a669df16`
(native key `5179a2406c72322ff727913841340264a3e784d94d57a52bd7d86d6dc1e256a8`).
It preserves virtual accounting inside the old envelope and returns consumed
work explicitly for larger regions. Every candidate or proved empty/scalar
block consumes one work unit there. Exact predicates and the existing
500-candidate limit remain. Both callers consume the returned counter; neither
infers it from the new cursor's virtual-position difference.

The extracted Python cursor harness passes 183 checks, including ordinary
positive-definite Gram matrices, equality to the old traversal on its envelope,
zero-work calls, and split budgets of one or mixed small sizes. On the rejected
large region all tested schedules produce the same 500 points and final cursor
using 503 work units. Seven reused controls retain all 64 output words in
FLINT and GMP. This is preliminary qualification: the harness mocks ideal
arithmetic, and there is no full-corpus or large-field JavaScript result yet.

The new source gets past prime 53 but still declines. A separate compiled
failure-site trace identifies an append beyond relation capacity: the last
fully processed count is 499, and the append returns the 500 overflow sentinel,
not a 500th published relation. It has planned 152 ideals and tested 66,932
candidates. Both native backends agree on the diagnostic output. The final
phase-34 marker alone was stale and did not locate this later failure; recording
the exact failure site was necessary. Further work must address relation
admission/retention and rank recovery, not merely enlarge the geometric box.

The subsequent state trace measures 443 factors, capacity 499, and modular
rank 429 at that exit. PARI debug level two records 216,564 small-norm
candidates and 1,011 smooth candidates in its first pass, followed by smaller
recovery passes. `add_rel_i` rejects duplicate exponent rows and, while rank
is missing, permits a limited supplementary dependent-row allowance rather
than retaining every smooth row. Our current admission predicate deliberately
retains all modularly dependent rows during rank deficiency to preserve useful
integer-index/unit witnesses. That small-field recovery choice now consumes
the large-field buffer before the missing pivots arrive.

A separate, unpromoted rank-quota ablation, source
`df420145dc8fa625f0abe3b24954ce49f6d19bb09d3200cdda9d099356210bf6`,
reserves space for missing pivots by limiting dependent admissions to the
checkpoint's supplementary margin. It passes this storage obstruction and
reaches exact presentation preparation with 447 retained rows and exact rank
441 of 443, then correctly declines for insufficient rank. FLINT and GMP
agree on all output words. This is not yet a complete algorithmic improvement:
the policy can discard useful class-index or unit witnesses and has no broad
regression qualification. Recovery after the two remaining missing pivots,
compact unit witnesses and the later analytic certificate still require work.
No class number is published by either new search ablation.

The raw level-two PARI trace is preserved, including the level-one parser's
initial rejection of the extra debug shapes. A separate diagnostic reparser
admits only explicit cubic ideal-description and rejection-counter lines;
all other error checks remain, and its class number/invariants match the
frozen PARI reference. Neither diagnostic timings nor candidate counts are
substitutes for controlled whole-computation comparisons.

Validation for this checkpoint: all eleven focused cache/layout/corpus tests,
all 195 unit-test files, the eight-stage build, documentation checks and
precompilation of 422 lazy modules pass. The first full-CLI attempt overlapped
an automatically triggered rebuild and produced two compiler-load failures;
that attempt is not treated as regression evidence. In the serial rerun the
Brandt tests pass; the 588-file CLI plan then stops at five FFLAS/igraph
prerequisite failures in `test/ffi.cjs`, after four complete files pass, with
582 not started. The architecture sequence passes its FFI/package/native/Wasm
checks, then stops at the previously recorded stale optimizer-opportunity
manifest. Neither gap is hidden by refreshing an allowance or manifest.

## Larger-field powered rank recovery and the lost integer index

The next source-copy experiment continues the 443-ideal field
`3.1.1086061775432017340256300.1`, using the rank-quota parent
`df420145dc8fa625f0abe3b24954ce49f6d19bb09d3200cdda9d099356210bf6`.
It is **not promoted**. Production dispatch, the 485,000-byte source allowance,
and the 1 MiB/3 MiB arena limits are unchanged.

The existing powered-ideal routine requires full rank and therefore cannot
repair this parent's exact rank 441 of 443. A separate research helper now
selects missing modular pivot columns after the caller has established exact
rank insufficiency. It searches $P_0^eP_j$, using exact ideal products, reduced
embeddings and the existing principal-relation checker. Modular pivots choose
discovery targets only; they never authorize a class-group result. It retains
the existing candidate cap and a shared remaining work budget across at most
four multiplier passes. The six-row supplementary allowance is a discovery
policy, not a mathematical completeness assertion.

One multiplier improves exact rank 441 to 442, adding one row after 965
candidates in two plans. Continuing through four multipliers reaches rank 443,
with 449 rows, after 2,006 candidates in five plans. The single-multiplier source
is `3cf93ea78b1732a473278220c15ba31d101eada19d527e94b6d25ecb6e91fa83`;
the four-pass source is
`c330e2f86d14833018ba3e91e221d94e3501a5db0b303f6f36a8ddc94a6889f6`
(560,363 bytes before any production qualification). Both native backends
agree on every output word and still return false. All 119 existing helper
bodies/signatures are AST-identical to the quota parent; the root orchestration
and one new helper account for this experiment. Fourteen actual-body mocked
control-flow checks pass, but they are not arithmetic or publication proofs.

### Independent replay shows why full rank is insufficient

A separate diagnostic-only native export publishes the ledger before proof
and returns false with marker 90. It cannot be confused with a successful
public certificate. Its FLINT/GMP exports agree entry for entry. Independent
CPython/SymPy replay checks the supplied order's closure and identity,
invertibility of the used ideals, and **all 449 principal-ideal equalities**.
The two new generators have order coordinates $(664020,0,1)$ and
$(812679,0,-1)$; these are discovered witnesses, never input-specific rules.

The replay proves prefix rank 441 using modular independence for the lower
bound and two independently checked exact null vectors for the upper bound.
It proves final full rank by modular independence. An exact determinant of a
full-rank row subset supplies a valid determinant multiple for modular HNF.
Eliminating unit presentation pivots by unimodular row/column operations leaves
a 15-by-15 block for independent Smith reduction. Generic deficient-prefix HNF
and then generic 443-by-443 Smith were separately interrupted after severe
coefficient growth; neither interrupted attempt is counted as validation.

The resulting finite presentation has order

$$
5\,035\,908\,620\,195\,247\,849\,621\,248\,714\,631\,818\,400
$$

and invariant factors

$$
(3,3,3,3,3,3,3,3,6,60,2132088866955938224873092141540).
$$

PARI's matrix-only HNF/Smith calculation agrees with this independent replay.
The presentation order is **15,990,666,502,169,536,686,548,191,061,550 times**
PARI's GRH-conditional field class number 314,928. Recovering rank therefore
does not remotely finish relation-index saturation. The existing eight-factor
publication envelope also rejects this eleven-factor intermediate quotient;
widening that envelope alone would not establish the field's class group.
These replay claims do not establish maximality of the supplied order,
generation by the factor base, unit saturation or a complete class-group
certificate.

### The six dependency slots contain only sign duplicates

An additional exact check obtains six integral dependency vectors from PARI,
then independently verifies their rank and zero residual against the full
relation matrix. Each has only two nonzero exponents, of absolute value one.
Exact field multiplication shows that **each associated unit is $-1$**.
Since these vectors span the rational kernel, every integral relation-kernel
unit has a nonzero power equal to a root of unity and is therefore torsion.
Thus this ledger contains no non-torsion unit, not merely an unsuccessful
bounded attempt to find one.

This identifies a concrete defect in the experimental retention policy:
generator deduplication recognizes $\alpha$ but not $-\alpha$. Sign duplicates
consume the six supplementary slots without adding an ideal relation or a
new non-torsion unit. Rejecting those duplicates is mathematically different
from rejecting all equal exponent rows: distinct generators of the same ideal
can yield indispensable units and must not be discarded by that shortcut.

The seven reused-control comparison also rejects promotion of the quota
parent. Six controls complete on both FLINT/GMP backends and preserve every
word between the quota and powered variants. Five succeed; the former h405
success `3.1.1246798226700.1` now declines with quotient order 810 in both.
The h486 control `3.1.4860135888300.8` hits the 45-second limit in all four
quota/powered native calls; matching timeouts are not equivalence evidence.
A separate three-backend run agrees on the first two controls but times out
on the third. These failures are retained, not presented as a no-regression
result. No controlled performance claim is made for the powered prototype.

Sources, raw ledgers, replay scripts, failure records and content hashes are
retained under `build/cubic-analytic-schedule-evidence/rank-powered/` and
`/scratch/sagejs-runtime/cubic-rank-powered-GYdo8N/`. Research helpers should be
consolidated into shared discovery machinery before promotion, not copied into
production as another large duplicate routine.

### Rejecting sign duplicates recovers useful index and unit evidence

The sign-aware admission source
`170c416ecca70a5fa6f97fc432535fc0989b84301ddebb0651da82c0e6559eed`
rejects a generator only when its coordinates equal an earlier generator or
its negative. It does **not** reject distinct generators just because their
ideal exponent rows agree. The actual extracted admission body passes 15,376
small coordinate-pair tests, including retention of distinct generators with
identical exponent rows. The justification is the exact identity
$(\alpha)=(-\alpha)$ and the already-known unit ratio $-1$; removing these
duplicates loses neither an ideal-class relation nor a non-torsion unit.

On the large field, the 64-word decline status and rank counters happen to
remain identical, but **307 retained ledger rows change**, beginning at row
121. Counter equality was therefore not treated as ledger equality. A fresh
diagnostic export agrees across FLINT/GMP, and the independent replay again
verifies all 449 principal-ideal equalities and exact rank 441 to 443.
Its presentation now has order **629,856**, with invariants

$$
(3,3,3,3,3,3,6,12,12).
$$

That is twice PARI's field class number, rather than approximately
$1.60\times10^{31}$ times it. The nine-factor intermediate quotient still
exceeds the eight-factor public envelope. Neither its smaller order nor its
agreement in most invariant factors authorizes a class-group answer.

The new rationally spanning six-dimensional dependency kernel is also checked
exactly. Its vectors use 365 generators each, with maximum exponents between
860,341 and 1,529,442. Bounded explicit materialization refuses these exponents;
no allocation or exponent limit is raised. The independent compact-unit
checker instead supplies rigorous real-log intervals: five are strictly signed
and prove non-torsion; one contains zero and is inconclusive. This proves the
presence of non-torsion units, **not** a fundamental unit or saturated unit
subgroup. Compact representation is now a concrete requirement on this field,
not merely an anticipated optimization.

In a fresh seven-control FLINT run, six fields succeed and the h405 field still
declines. In particular, the h486 field that timed out under quota/powered
admission succeeds again; a separate FLINT/GMP/JavaScript call agrees on every
output word and matches the cache parent's successful result. This is a
restored control, not a controlled timing comparison or full-corpus
qualification. The h405 regression remains open. The first mixed-control
harness stopped on its regression assertion, and the later all-backend harness
timed out on h486; the terminal per-backend report preserves those failures.

The next work is to close the remaining integer relation index, retain useful
unit evidence in bounded resident state, and certify compact units. A general
invariant-result representation is also needed: increasing an eight-factor
constant alone would neither resolve the index-two gap nor prove the unit
subgroup complete. The two new powered generators and every field answer in
these notes remain diagnostic evidence, never special cases in discovery.

### Post-rank recovery reaches the reference presentation on the larger field

The next source-copy experiment extends the same powered-search helper with
a post-rank mode; it does not add a second copy of the search algorithm.
Its source hash is
`655a712ad8cb1b7fa5860c5db377cfd81c7e7dc3007e5f775f8b4ecb7f39c738`
(565,385 bytes, **unpromoted**). The caller must first have an exact full-rank
presentation, synchronized online HNF and raw rows, and evidence that this
attempt actually used powered rank recovery. Nonunit diagonal positions of
the exact HNF select discovery directions. They are not completeness tests.
The root preserves the remaining work budget, collects bounded batches, and
stops at the first exact decrease in the HNF determinant. It then prepares
the ordinary proof attempt; a determinant decrease never publishes a result.
The new index must divide the old one. Increased or nondividing indices,
invalid row counts, and inconsistent state fail closed.

On `3.1.1086061775432017340256300.1`, this appends 13 rows to the previously
retained 449, using 4,628 additional candidates in ten powered-ideal plans
with one multiplier pass. The index falls from 629,856 to **314,928**.
FLINT and GMP agree on every output word. Both still return false: the
unchanged eight-invariant publication envelope rejects the nine-factor
presentation before the remaining unit/analytic certification runs.
Neither the 1 MiB/3 MiB arena limits nor production dispatch has changed.

A diagnostic export again returns false with marker 90 and detaches the
ledger. The two native exports agree entry for entry. Independent
CPython/SymPy replay verifies all **462 principal-ideal equalities**, exact
rank 443, HNF index 314,928, and Smith invariant factors

$$
(3,3,3,3,3,3,3,12,12).
$$

PARI's matrix-only HNF/Smith calculation agrees. These are also the invariant
factors of PARI's GRH-conditional field computation, but that agreement is
not a proof of the field's class group. The independent replay does not yet
establish maximality, factor-base generation, or unit saturation.

The old ledger is checked to be an unchanged prefix. Exact triangular
membership in its column HNF identifies the index-changing row without
using PARI: rows 449 through 460 (zero-based) are already in the old relation
lattice. Row 461, whose discovered order coordinates are $(-174170,0,1)$,
is not in it, but twice that row is. Its exact HNF coordinates have seven
half-integral entries and no other denominators. Thus its image has order
two modulo the old lattice, proving the index halves. This generator is a
diagnostic witness, never a hardcoded discovery rule.

### The enlarged ledger supplies a useful compact unit

PARI proposes a 462-by-19 integral dependency matrix. The replay checks the
integer zero residual against the relation matrix and proves full rational
column rank by rank 19 modulo 27,449. The first attempt at generic symbolic
rank was deliberately interrupted during coefficient growth; it is not a
passing check. Full modular column rank is an exact lower-bound witness for
rational rank, not a heuristic replacement. This establishes rational
spanning, not integral saturation of the proposed dependency basis.

One dependency uses 382 nonzero exponents, of maximum absolute value 41,618.
Its independently enclosed real absolute logarithm is

$$
\frac{160610210145895453011859878300772358658052060}{2^{128}}
\ \leq\ \log|\sigma(u)|\ \leq\
\frac{160610210145895453011859878300772360623064428}{2^{128}}.
$$

This is approximately 471,990.9868 and proves a non-torsion unit without
expanding its coefficients. Similarity to PARI's regulator does **not** prove
fundamentality. The other 18 dependencies are torsion: one is explicitly
materialized as $-1$, and fresh independently authenticated logarithm
enclosures for all 18 lie inside $[-1/5,1/5]$. The elementary complex-cubic
unit-gap lemma in the proof document applies. An interval merely containing
zero would not suffice.

The independent compact-unit checker now exposes that classification
explicitly. It rejects malformed intervals and intervals contradicting the
unit gap, distinguishes inconclusive wide intervals from torsion, and never
claims unit saturation. Focused tests include exact boundary inequalities,
128/521-bit scales, invalid types, and authenticated compact cancellation
products. This is research replay machinery, not a new public certificate.

The actual extracted search body passes 35 mocked mode/budget/failure
scenarios. The actual extracted root block passes 16 further scenarios for
first-decrease stopping, multiplier and budget exhaustion, invalid index
transitions, and prerequisite guards. Mathematical operations are mocked in
these control tests; the separate ideal and lattice replays provide the
arithmetic evidence. Seven reused controls complete on FLINT and GMP and
preserve every parent output word: six successes and the known h405 decline.
There is no new full-corpus, JavaScript, cross-platform, or controlled timing
qualification for this experiment.

The first source build failed definite-assignment checking for a capacity
variable defined in the earlier recovery branch. Moving that definition to
its common dominating scope fixes the source; no compiler check was weakened.
The measured source's older helper docstring still describes rank discovery
only and needs generalization before promotion. Generated core source is
21,022,222 bytes and the local addon is 20,792,080 bytes; these are recorded
resource observations, not a generated-code approval or a raised allowance.

Sources, diagnostic ledgers, independent replay programs, hashes, and failure
records are preserved in
`build/cubic-analytic-schedule-evidence/index-recovery/` (30 nonbinary files,
4,119,207 bytes) and `/scratch/sagejs-runtime/cubic-index-recovery-5VjExI/`.
The focused compact-unit test and Python formatting pass. The architecture
gate passes its FFI/native/resource stages but still stops at the existing
stale optimizer-opportunity artifact manifest; it is not reported green.

**Next:** carry authenticated compact-unit exponents and outward-rounded
logarithms through the native analytic joint-index proof, with bounded
dependency storage and a dimensioned invariant result. Do not merely enlarge
the eight-factor constant or attempt to expand this unit. Only a complete
accepted computation is eligible for the next controlled PARI comparison.

### Analytic feasibility exposes and repairs a large-integer endpoint boundary

A further diagnostic runs the same native relation search and analytic
helpers, but supplies the independently authenticated compact-unit log
interval as an explicit input. It returns false with a diagnostic marker;
it is **not** native authentication of that input or a complete certificate.
The initial source is
`9c0d521b792680aa982e6d94a9855a817f25309ea892ee0f3531a306aad38ab1`.
Both cutoffs, 765 and 1800, throw on both native backends before analytic
evaluation. The first harness stopped on the exception; the revised harness
preserves every error and diagnostic output rather than counting matching
errors as successful equivalence.

The cause is concrete: the existing resident logarithm/square-root batch
checks `fmpz_abs_fits_ui` and uses `arb_log_ui`/`arb_sqrt_ui`. It rejects this
field discriminant, which exceeds a machine word. This is not an overly
conservative analytic bound or failed relation search.

The corrected source
`61b0d60af6e26559de96f64df4e12e6ad6856f76b28fb4afb0e51c3464f9a9a8`
keeps the batch for values at most $2^{31}-1$, a portable routing threshold,
not a mathematical input limit. Larger values use the existing
arbitrary-precision positive-rational log operation. Their square-root
endpoints are computed in ordinary source from
$r=\lfloor\sqrt{vS^2}\rfloor$, with explicit exact checks
$r^2\leq vS^2<(r+1)^2$; the upper endpoint is $r$ for a perfect square and
$r+1$ otherwise. The batch sees private positive placeholders, and every
large input and its four endpoints are restored before any BF evaluation.
Invalid intervals or integer-root checks decline. Three already-owned log
workspaces are forwarded through the helper calls; no foreign interface,
handwritten mathematical C, or arena byte limit changes.

Forty-seven extracted-body tests exercise routing and root arithmetic through
8,192-bit values, boundary cases, inactive tails, and failure paths. They use
the actual integer square-root source and independent rational logarithm
bounds in place of foreign calls. The first extraction attempts omitted the
native decorator removal and then a square-root dependency; both test-harness
failures were corrected before counting the passing run. The first source
build also exposed unsupported named-constant exponentiation; constructing
the expected scale with the existing bounded doubling pattern avoids that
compiler gap without weakening its checks.

With the endpoint correction, the native BF diagnostics complete and agree
on every output word across FLINT/GMP. The joint-index logarithm intervals
are approximately $[-2.2083,2.2563]$ at 765 and $[-1.1871,1.2345]$ at 1800.
Both are correctly inconclusive: their upper endpoints exceed $\log 2$.
Thus a wider field range needs a discriminant-aware analytic refinement
schedule, not just compact unit storage.

A separate **unpromoted** cutoff experiment extends the coefficient workspace
to 5400 while keeping the 512-term/512-value capacities and 1 MiB/3 MiB arena
limits. Its source hash is
`9bbdf8b51842d87aefddea762aae76706870c86ea8a858bf056604ce44f7d68e`.
On this field it uses 399 terms and 353 values, and yields

$$
-\frac{2411168422}{2^{32}}
\ \leq\ \log([\mathbb Z^{443}:L]/h\;[\mathcal O_K^\times:\langle-1,u\rangle])
\ \leq\ \frac{2523365782}{2^{32}}.
$$

The upper endpoint is strictly less than the certified lower bound
$2977044471/2^{32}$ for $\log 2$, and the interval contains zero. The ordinary
analytic classifier therefore returns one on both native backends. This is
conditional on the analytic theorem's assumptions and authenticated order,
factor-base, relation, and unit premises. In particular, the diagnostic
kernel did not authenticate the supplied unit-log input and still returns
false: no public class-group result or native end-to-end certificate is
claimed. Raising the default refinement cutoff globally is not proposed.

These additional sources, raw errors/results and hashes are preserved in
`build/cubic-analytic-schedule-evidence/index-recovery/analytic-suffix/`
(15 nonbinary files, 2,313,754 bytes). The next closed-program work must join
native compact dependency discovery and authentication to this analytic
path, generalize invariant publication, and select refinement from actual
certificate insufficiency under explicit storage/work budgets.

The changed-file checks passed merge invariants and a fresh eight-stage build
plus documentation checking. The CLI sweep then stopped in `test/ffi.cjs`,
including unavailable igraph native-library prerequisites, cancelled its
active sibling and left 582 files unstarted. The full suite is not green;
these environment failures are separate from the passing focused compact-unit
test and diagnostic mathematical replays.

### Native compact dependency discovery and independent log authentication

The next research source removes the externally supplied unit interval. Source
`09d2af8ba60248e36415f98892aed9aaa0ec2338dfab1bf27fb5597734fde358`
uses the actual resident 462-by-443 relation ledger on
`3.1.1086061775432017340256300.1`. It transposes that ledger, calls the existing
declared integer right-kernel operation, reduces its 19 dependency rows using
the declared LLL operation, and runs the existing interval-guided compact-unit
selection. The selected row is then multiplied against every column of the
**original** relation ledger with exact integers; a nonzero residual declines.
Kernel and LLL output are proposals, not unchecked proof authority. Kernel
basis completeness is unnecessary for authenticating the selected unit.

The GMP-native diagnostic discovers 382 nonzero exponents, maximum absolute
value 41,618, without expanding the unit. Its real absolute logarithm is
enclosed by

$$
\frac{160610210145895453011859878300772359635735126}{2^{128}}
\leq \log|\sigma(u)| \leq
\frac{160610210145895453011859878300772359638101387}{2^{128}}.
$$

That interval is near 471,990.9868. Feeding it to the experimental cutoff-5400
analytic suffix gives the same index-one classification as the externally
supplied witness experiment. The input contains the polynomial and bounded
output/workspace buffers, not a class number, relation, or external unit.
The root deliberately continues to return false with diagnostic marker 96;
this is not public class-group acceptance or a controlled performance result.

For detached verification, source
`9ab8d6aab33a05270fe3baf9d4962d885363ddc6c73decf89dfdfb2d982d776e`
additionally exports the factor-ideal bases, all raw relations and generators,
the selected dependency, and the seven exact order-basis parameters **from
that same execution**, before the analytic suffix overwrites diagnostic words.
The private packed factor buffer contains $9n+r+7$ entries with an explicit
$9F+R_{\max}+7$ admission bound. This is an untimed research format, not a
change to the production certificate ABI or arena limits. Its source cache key
is `6289a9691a5647461710c2b4c20a4f981aecf914c2165d493d34692bb932d2d3`.

The new `replay_with_log` research checker first checks every principal-ideal
equality and the complete dependency residual using CPython/SymPy exact ideal
arithmetic. It then independently isolates the unique real root and computes
outward rational log bounds at 256 bits. Exact cross multiplication proves
that this fresh enclosure lies inside the native interval. Merely overlapping
intervals would not suffice. Failure of containment is an inconclusive replay
at the chosen precision, not proof of a false native interval. Altered ideal
relations, dependency exponents, invalid endpoint types/scales, and incorrect
or zero-width proposed log intervals have focused rejection tests. Both signs,
cross-scale enclosures, and a 261-bit compact torsion cancellation are tested.

The complete large-field replay succeeds: 462 relations, 443 ideals, 3,020
relation entries, no expanded dependency powers, and a proved non-torsion unit.
The detached GMP record hashes to
`d5bb41e11d6d90b785438827ed5ea352ea22ead66cd87facbe7d2147cccfbdf7`.
Every factor, relation, generator, polynomial, dimension, and order-basis entry
also agrees exactly with the preceding independently replayed ledger. This
justifies reusing its HNF/Smith evidence for presentation order 314,928 and
invariants $(3,3,3,3,3,3,3,12,12)$; matching counters alone would not justify
that transfer. The checker itself does not prove maximality, factor-base
generation, fundamentality, or the analytic theorem premises.

One compiler capability boundary is now explicit: `fmpz_matrix_right_kernel`,
`fmpz_matrix_nrows`, and `fmpz_matrix_ncols` are absent from
`FMPZ_FFI_DECLARATIONS` in the compiler lane's `exact-analysis.cjs`. Consequently
this source exports the GMP-native entry but no `fmpz` entry. The initial
two-backend harness attempted the unavailable entry and recorded a JavaScript
`TypeError`; it is not evidence of a native mathematical failure. The detached
export harness checks entry availability explicitly. Simply extending the
allowlist is not justified without reviewing allocation/checkpoint effects:
the existing right-kernel binding allocates a square matrix with dimension
equal to the number of relations. No compiler whitelist, production source
allowance, or arena byte limit was changed in this experiment.

Research scripts, source copies, build identities, detached data and replay
results are retained under
`build/cubic-analytic-schedule-evidence/native-compact/`. Production source
remains 480,241 bytes under its unchanged 485,000-byte allowance. This closes
the external-unit-input gap on the selected larger field, but not the public
publication, source-size, portability, adaptive-refinement, or broad-frontier
qualification gaps. PR #203 remains draft.

The same-source JavaScript diagnostic was run separately with a 180-second
limit and exited with timeout status 124 without a result. It is not a
mathematical decline or evidence of output disagreement; no large-field
dynamic/native equivalence is claimed. The fresh focused test and docs checks
pass. `test:changed` passes merge checking, then its CLI sweep passes four
files before `test/ffi.cjs` fails five missing FFLAS/igraph prerequisite checks,
cancels the active sibling, and leaves 582 files unstarted. The architecture
gate passes its FFI/native/resource checks but again stops at the stale
optimizer-opportunity manifest. These remain failed full gates, not release
qualification. No full build was needed for the CPython research-checker and
documentation changes; the experimental native source was compiled afresh.

### Bounded refinement distinguishes analytic uncertainty from algebraic defects

Research source
`662b82d3bbd0a8808e9000f35ce4dee425b3576e337a9e1c9a579113665e1f12`
replaces the single cutoff-5400 diagnostic with a resident refinement loop.
The source-transparent `next_analytic_cutoff` helper is maintained in
`bench/class-unit-groups/cubic-bf-scale-audit.py` and extracted into the native
source without replacing its body. It doubles a cutoff, clamped to the
storage envelope, while preserving exact multiples of nine. The planner now
accepts intermediate multiples of nine in $[72,5400]$, rather than just two
named cutoffs. All live term/value and arena bounds remain separate guards;
5,400 is a research storage extent, not a theorem of sufficient accuracy.

Refinement is authorized only by a validated, inconclusive joint-index
interval that still contains zero. Success stops immediately. Invalid or
contradictory evidence stops with failure. A strictly positive lower bound
already proves that the current relation/unit data have joint index greater
than one: more precise analysis of the **same** algebraic data cannot make
that index one. That outcome therefore stops refinement and identifies the
need for further algebraic work. It does not silently accept the quotient.

The cutoff is charged before each plan against a budget of three times the
storage extent. This is a bounded sum-of-cutoffs planning budget, not a bound
on wall time or every arithmetic operation. The step uses
$X+\min(X,M-X)$ instead of an unchecked $2X$ when selecting the next cutoff.
Strict growth and the finite envelope prove termination. The coefficient
table and finite prime-power plan are rebuilt for each cutoff: newly admitted
higher-degree norms of previously visited primes must not be lost. The
selected compact unit, its rigorously enclosed logarithm, and the two foreign
analytic matrix owners are retained across attempts; no new foreign resource
is constructed inside the loop. Reusing more of the finite plan is future
work and requires its own correctness argument.

On the motivating 443-ideal field the actual native sequence is

$$
765\;(0)\ \longrightarrow\ 1530\;(0)\ \longrightarrow\
3060\;(0)\ \longrightarrow\ 5400\;(1),
$$

where parentheses give the analytic classifier. The total cutoff charge is
10,755. Every exported relation, ideal, generator, order-basis parameter and
selected unit exponent agrees with the fixed-cutoff parent, as do the final
analytic endpoints. No external unit is supplied. This is a general bounded
schedule, **not a speed improvement on that field**: the staged sequence adds
analytic work relative to starting at 5,400.

The helper passes 2,000 exact scheduling tests and termination checks through
the unsigned-64-bit scale. Its actual compiled body agrees with an independent
integer oracle on 2,016 cases using both the GMP and same-source JavaScript
entries, including values above $2^{64}$. The helper artifact has no `fmpz`
entry; absence is reported, not counted as a pass. Thirteen extracted actual
suffix control-flow cases cover early/late success, envelope exhaustion,
proved algebraic insufficiency, contradictory intervals and failed foreign
operations. The numerical operations are mocked in these tests, so they
prove scheduling behavior and owner reuse, not the analytic formula.

The next local panel consists of seven reused controls and 20 frozen-corpus
complex holdouts with $|D|\geq 10^{12}$, ordered by SHA256 of
`adaptive-analytic-20260910/` followed by the label. Selection was written
before execution. These are not claimed to be previously unseen across all
earlier campaigns or population-weighted. All 27 fixed/adaptive native pairs
complete and export identical algebraic data. Both schedules give 16
index-one classifications and 11 inconclusive classifications. Every one of
the latter now has a strictly positive joint-index lower bound; none merely
runs out of analytic resolution at 5,400.

| Native diagnostic outcome | Fields | Final cutoff distribution |
| --- | ---: | --- |
| Index-one classifier | 16 | 2 at 1,530; 10 at 3,060; 4 at 5,400 |
| Index one excluded by a positive lower bound | 11 | 6 at 765; 4 at 1,530; 1 at 3,060 |

Cutoff charges sum to 101,160 for the 16 index-one cases versus 86,400 for
fixed 5,400, and 19,125 for the 11 insufficient cases versus 59,400. These
counts expose the tradeoff, not a comparative timing result. All diagnostic
roots still return false; public invariant publication, full certificates and
controlled end-to-end timing remain outstanding. The first seven scalar
control calls used placeholder transcript buffers and stopped at marker 105:
their equality alone was not analytic qualification. The subsequent
dimensioned exports are the actual 27-case analytic comparison. Only the
first `output[30]` history slots are live; remaining diagnostic words may
contain older phase data.

#### The panel caught a detached basis-orientation error

Independent replay initially failed on `3.1.1428754729688.2`, whose defining
polynomial is $x^3-x^2+190117x+10422535$. The diagnostic tuple
$(146,1,6,27,146,0,146)$ was incorrectly decoded as an upper-triangular basis.
The native convention names the basis vector first: the correct power-basis
columns are $(1,6,27)/146$, $(0,1,0)$ and $(0,0,1)$. Thus the identity has
coordinates $(146,-6,-27)$. The accidental transpose does not define an order
for this polynomial. It happened to agree on the earlier diagonal-basis large
field, which is why testing only that field missed the issue.

The independent checker now provides `native_order_basis_columns`, with a
focused off-diagonal regression and rejection of the accidental transpose.
The native source, input polynomial and exported bytes were not changed to
fix this verifier-side error. Initial replay files are preserved and corrected
results use `unit-replay-v2` names; a completed old replay is not relabeled as
having exercised the corrected decoder.

All 27 corrected replays pass: 3,712 principal-ideal equalities, exact compact
dependencies, and independent rational-log enclosures contained in the native
intervals. All selected units are non-torsion. For the 16 index-one
classifications, the native presentation order agrees with the saved PARI
class number; this comparison does not replace independent invariant or
analytic-premise verification.

One concrete next algebraic case is `3.1.2545362165060.5`, defined by
$x^3-7803x-1557948$. Its native presentation index is 18, equal to PARI's
conditional class number, while its selected unit log is near 97,947.0295,
approximately twice PARI's regulator. At cutoff 1,530 the rigorous native
joint-index log interval is approximately $[0.0333,1.3569]$: it already excludes
index one. The fixed-5,400 interval is approximately $[0.4102,0.9703]$ and still
excludes it. The PARI regulator ratio is a diagnostic hint, not a proof of unit
index or fundamentality. This is a concrete target for resuming relation/unit
collection with the existing resident state, rather than increasing analytic
cutoffs indefinitely.

For that next field, independent CPython/SymPy HNF and Smith computations
confirm the 53-by-47 ledger has rank 47 and cyclic presentation of order 18.
Independent rational bounds for $\log 2$ and $\log 3$ show that the existing
fixed-cutoff joint-index interval admits exactly the integer index two,
conditional on that native analytic enclosure and its generation premises.
This does not independently distinguish a missing class relation from a
missing unit generator.

A fresh PARI 2.17.4 debug trace, seed one and `bnfinit(nf,0)`, uses the same
47-ideal/53-relation dimensions: 15 initial rational-prime relations, then
38 small-norm relations from 797 trials (59 factorizations reported), followed
by its first HNF. It immediately obtains tentative class number 18 and
regulator 48,973.5147, with check ratio approximately 1.00904. No extra HNF
update is reported. Therefore row count alone does not explain our missing
unit information; which principal relations we retain matters. PARI warns
that precision is insufficient to provide expanded fundamental units, but
returns the class number and regulator. That warning is retained and is not
mistaken for an expanded-unit certificate or a computation failure. This
debug trace is not a controlled competitive timing.

All scripts, source/build identities, selected labels, detached data and
replay outcomes are archived under
`build/cubic-analytic-schedule-evidence/adaptive-analytic/`. Production source
and resource allowances remain unchanged; this is an unpromoted experiment.

Final focused tests, formatting, merge checks, documentation checks and all
195 unit-test files pass. The full CLI attempt then fails the same five
FFLAS/igraph prerequisite checks in `test/ffi.cjs`, with 582 files unstarted;
the architecture gate still stops at stale optimizer artifacts after passing
its native/FFI/resource audits. Neither gate is reported green. The research
native source and helper were freshly compiled; no production build inputs
or dispatch were changed.

## Resident algebraic feedback after a positive joint-index bound

The next experimental closed program resumes relation collection when the
analytic interval proves that the current joint index exceeds one. The exact
predicate `resume_algebraic_collection` is recorded in
`bench/class-unit-groups/cubic-bf-scale-audit.py`: it requests a retry only
for a validated inconclusive classifier with a positive lower endpoint, a
non-reversed interval, and room in the round/work/relation envelopes. It
does not certify the analytic premises or distinguish missing class relations
from missing unit information. Its actual compiled body passes 3,073 exact
GMP/JavaScript comparisons, including values above the machine-word range.

The caller retains the original ledger, search state, selected-exponent owner
and analytic workspaces. A private helper borrows them and owns five temporary
matrices for the transpose, kernel, LLL reduction/transform and logarithms.
These are ordinary lexical owned resources, not a nested arena. The existing
compiler already supports this pattern: a separate witness agrees through
10,000 repeated calls on GMP and JavaScript, including early returns. The
generated main helper closes all five owned matrices on success and failure,
and does not close borrowed parameters. This inspection is not a full
physical-allocation proof: the existing right-kernel binding still allocates
a relation-count-square workspace. No compiler whitelist was widened.

After each certified algebraic deficit, the existing powered-ideal search
resumes with its retained cursor and a shared remaining discovery budget.
It adds at most four rows per batch, possibly returning earlier after exact
HNF change, and rechecks the compact unit and analytic interval. Eight retries,
four multiplier passes, relation capacity and the existing per-attempt
analytic envelope bound the experiment. Exhaustion still declines.

For `3.1.2545362165060.5`, one retry gives **53 -> 57 relations**. Independent
replay checks every principal equality, the selected exponent residual,
rational logarithm enclosure and cyclic presentation of order 18. The new
unit log is approximately 48,973.5147 instead of 97,947.0295. The elementary
unit-gap argument proves that the old unit is the square of the new one up
to torsion; this does not merely compare floating-point logs with PARI.
The native index-one classifier now succeeds at cutoff 1,530. GMP, tagged
integers and generated JavaScript agree on the complete target diagnostic.
Across 256 same-process GMP calls, all detached outputs agree; observed RSS
was about 137/149/192/192/193 MB after 1/16/64/128/256 calls. This is limited
observed memory behavior, not an allocation bound or a competitive timing.

The same 27-field panel improves from **16 to 24 index-one classifications**.
All 16 formerly successful cases retain identical raw witnesses, selected
exponents and analytic endpoints. All 11 changed cases have fresh independent
replay of every principal relation, selected unit/log and HNF/Smith
presentation. The 16 byte-identical witnesses reuse their previous independent
receipts only after checking their input/checker hashes; they are not counted
as fresh replays. There are 3,841 retained relations, including 129 additions.
All 24 classified presentation orders match the saved PARI class numbers;
the eight newly classified invariant lists also match. These are the same
earlier selected labels, not a new claim of unseen sampling.

| Remaining field | Final rows | Presentation order | PARI class number |
| --- | ---: | ---: | ---: |
| `3.1.1246798226700.1` | 112 | 1,620 | 405 |
| `3.1.4860135888300.8` | 117 | 1,944 | 486 |
| `3.1.2602492536667698675.123` | 211 | 69,984 | 34,992 |

All three exhaust the eight-retry envelope without index-one classification.
The next search improvement should address those retained relation deficits,
not silently increase analytic cutoffs or accept these larger groups.

Fresh PARI debug traces for all three are recorded separately under
`build/cubic-analytic-schedule-evidence/algebraic-resume-next-forensics/`.
For the first, $x^3-93477150$, PARI uses cutoff 458, 74 factor ideals and
80 relations: 16 rational-prime relations followed by 64 small-norm relations.
Its first HNF already gives class number 405 and regulator approximately
332.0468, without an additional HNF update. It visits target ideals 74 down
through 51 and reports 253 factorizations from 5,791 small-norm trials. Our
original 80-row ledger has presentation order 3,240; the extra 32 rows reduce
it only to 1,620. Thus the remaining discrepancy is already present in
relation selection at equal dimensions, not merely too few rows or a larger
factor base. These debug timings are not controlled performance evidence.

An independent exact modular-rank check further localizes the first ledger:
its 74 columns have rank 72 modulo two, with nonpivot columns 33 and 34
(zero-based), while rank modulo three is 70. The corresponding checked
presentation invariants are $(3,3,6,30)$; PARI reports $(3,3,3,15)$. A useful
next experiment is prime-specific quotient-directed discovery, rather than
treating every nonunit HNF diagonal as an equally useful target. This is a
search heuristic, not permission to discard the presentation's two-primary
part: doing so still requires new exact principal relations and certification.
The modular checks agree with independent Smith invariants on all three
remaining presentations and are recorded beside their PARI traces.

Initial independent replay hit severe coefficient growth in SymPy's full-size
Smith recursion, after relation/unit/log verification. Stack traces isolate
that phase. The revised oracle eliminates only unit diagonal pivots by exact
unimodular Schur complements, then computes Smith on the smaller quotient.
The actual elimination agrees with direct Smith and determinants on 200
random small integer matrices. Four mutations of the target certificate
(generator, exponent, zero exponents, reversed interval) are rejected.
Initial failed and intentionally stopped runs are preserved separately.

The final scheduled research source has 584,966 bytes and SHA256
`0b260478d3e59df9e47f7a5270bea567cccfdbf052a0ecbb7a3e004da286756a`;
its build key is
`0c6cb183f53a4a2381b8cf972ac2e4abc117f5272c2fb3203f139c08875b3ecd`.
All 27 full outputs match the preliminary closure before predicate extraction.
Scripts, source, detached records, replay results and build identities are
archived in `build/cubic-analytic-schedule-evidence/algebraic-resume/`.

Every root still returns false diagnostically. Production source remains
480,241 bytes, its allowance remains 485,000, and arena limits remain unchanged.
Source compression/integration, dimensioned public certificate publication,
independent maximality/generation/analytic-premise checking and resource/platform
qualification remain required. No controlled timings were taken; `opt` was
not used, and PR #203 remains draft.

Final validation: the fresh build passes, all 195 unit-test files pass, and
documentation/merge checks and lazy-module precompilation pass. The full CLI
attempt is terminal at the same five missing FFLAS/igraph prerequisite
failures in `test/ffi.cjs`, after four files passed and with 582 unstarted.
Architecture passes its native/FFI/resource stages but still rejects the
pre-existing stale optimizer manifest. These failures are not green release
qualification. The main nonbinary evidence archive contains 140 files
(8,478,975 bytes), with verified hashes and separate generated-artifact
identities; generated binaries and full IR are not committed.

## Parity-directed forensics: five small missing generators

The next experiment qualifies an incremental parity-quotient reference in
`bench/class-unit-groups/cubic-two-primary.py`. It uses exact integer bitsets,
one per pivot, and reduces arbitrary candidate parity vectors to nonpivot
coordinates. The actual Python bodies pass independent dense Gaussian
elimination tests on 232 matrices, including empty inputs, every prefix of
small ledgers, duplicate and negated rows, signed 257-bit entries, and widths
through 512. Tests explicitly distinguish parity membership from integer
lattice membership and retain genuine two-torsion. This is a discovery-only
reference, not a newly qualified native capability.

The current native compiler rejects integer `&` and `^`: its bitwise lowering
admits only `uint64`. Supporting exact signed Python bitwise semantics needs
coordinated lowering/backend/range/resource work. The relevant files have
overlapping live claims, including a dirty mixed exact/float worktree. No
compiler file, guard, backend whitelist, production source allowance or arena
limit was changed. The prerequisite and ownership conflict are recorded in
[discussion 104](https://github.com/sagemathinc/sagejs/discussions/104#discussioncomment-18386814).

The reference replays all 3,841 retained relations from the same 27-field
panel. Its final pivot sets agree with independent dense elimination. All 24
index-one diagnostics have the same parity-quotient dimensions as the saved
PARI invariants. The three remaining presentations have dimensions 2, 3 and
3, versus PARI's 0, 1 and 2: excess dimensions 2, 2 and 1. This comparison
localizes a discovery problem; the PARI dimensions are not inputs to a
proposed public algorithm or acceptance rule.

Fresh PARI 2.17.4 debug traces record its accepted raw relations. Their indices
refer to `F.LP`, **not** the final `bnf[5]`: `buch2.c` constructs the latter
as `vecpermute(F.LP,F.perm)`. A first direct interpretation against `bnf[5]`
failed the parity check on the second field. The corrected trace driver
reconstructs rational-prime/prime-decomposition order, retains precisely the
returned factor ideals, converts their bases to the native order, and verifies
an exact HNF-based bijection. No positional agreement is assumed. This maps
five PARI relations that jointly remove precisely the observed parity gaps:

| Defining polynomial | PARI accepted relation numbers | Principal generators | Retained presentation index after adjoining them |
| --- | --- | --- | --- |
| $x^3-93477150$ | 62, 80 | $4a-2055$; $2a^2/435-a-2031$ | $1620\to405$ |
| $x^3-86126810$ | 61, 82 | $434-a$; $-a^2/203-a-2199$ | $1944\to486$ |
| $x^3-4036047015$ | 150 | $a+1261$ | $69984\to34992$ |

PARI's principal-ideal routine supplies a generator of each traced ideal
product, which need not be the identical unit multiple used during discovery.
The independent `CubicIdealReplay` then verifies every ideal-product identity
using rational/integer lattice arithmetic, with no PARI arithmetic in the
checker. All five generator-plus-one mutations fail. Exact solves against
the original column HNF show every new relation has order two modulo the old
integer lattice; independent parity residuals prove the subgroups have orders
4, 4 and 2. Recomputed augmented HNFs give the indices in the table. The proof
document records this argument. These are **proved presentation improvements**,
not merely agreement of reported class numbers.

An additional offline check retains the old compact unit and transports the
old joint-index interval by the proved index factor: subtract $k\log2$ when
the presentation index drops by $2^k$. A separate 256-bit rational logarithm
oracle verifies the native $\log2$ endpoints. The resulting intervals are
approximately $[-1.153,1.069]$, $[-1.160,1.167]$, and $[-0.629,0.642]$.
The actual classifier returns 0, 0 and 1: the first two still need analytic
refinement, whereas the third's old enclosure is already sufficient after
the exact relation improvement. This does not change the native 24/27 count;
the new relations were supplied externally for forensics. It suggests an
exact reuse opportunity when a resident retry proves an index ratio while
retaining its old unit, distinct from blindly reusing class-indexed tables.

All five useful rows already occur during PARI's initial small-norm pass.
The latter two fields also require PARI's own later powered pass, but our
existing ledger plus these earlier PARI rows already gives the reference
index. The search paths are complementary. The next useful investigation is
therefore why our initial enumeration/admission misses these small elements,
alongside testing parity-directed continuation; it is not yet justified to
assume that a bigger budget or a bitset implementation alone fixes discovery.
None of these particular generators is to become a hardcoded search rule.
There are no duplicate relation rows in the original 80-, 85- and 188-row
prefixes, so merely changing duplicate-row admission cannot explain these
three failures. A targeted diagnostic should distinguish: target ideal not
visited, element outside the prepared region, enumeration not reaching it,
primitive/content normalization, smoothness failure, and word-prime rank
admission rejecting an integer-useful relation. The existing centered
enumerator must be inspected rather than assumed to use naive box order.

Reproducible scripts, original/corrected GP traces, parity results, detached
inputs and exact replay evidence are archived under
`build/cubic-analytic-schedule-evidence/two-primary/`. Scratch originals are in
`/scratch/sagejs-runtime/cubic-two-primary-GFo7Va`. The first optional reversed
HNF/Smith audit was stopped after observed resident memory exceeded 2 GB; its
result is not used. The successful replay uses the existing column-HNF
convention, exact triangular solves and index products, avoiding that
unnecessary Smith computation. Initial GP syntax/ordering and reference-format
errors are recorded separately rather than treated as successful checks.

No new native search, public certificate, controlled timing result or platform
qualification is claimed at this checkpoint. Production and PR #203's draft
status are unchanged.

Checkpoint validation: the fresh build passes in 8m35s, all 196 unit-test
files pass, and 13 focused checks pass, including committed principal-witness
fixtures and mutations in `test/cubic-compact-unit.cjs`. Python reference
tests use the repository's platform-aware executable selection. Documentation,
merge checks and precompilation of 422 lazy modules pass. The full CLI run
is terminal at the same five missing FFLAS/igraph prerequisite failures after
four files passed, with 583 files unstarted. Architecture again passes its
native/FFI/resource stages and fails at the pre-existing stale optimizer
manifest. These are not green release qualification. The original evidence
archive has 97 files and 4,218,702 bytes; a separate supplement records the
analytic interval transport and final test sources/receipts.

## Search visitation versus admission: two different losses

The next experiment traces the closed research program without importing any
PARI relation into its search. The baseline source hash is
`0b260478d3e59df9e47f7a5270bea567cccfdbf052a0ecbb7a3e004da286756a`.
Entry records detach the ideal basis, LLL transform, exact Gram matrix,
ellipsoid bounds and retained cursor. Candidate records distinguish a failed
smoothness check, duplicate generator, new word-prime pivot, and dependent-row
quota rejection. Trace storage is separate from mathematical state; overflow
is reported, never interpreted as mathematical exhaustion.

With tracing enabled but the search policy unchanged, **all original output,
factor, relation, generator, unit-exponent and order-basis fields agree exactly**
on the three remaining failures. Their complete traces contain 4,164, 6,291
and 25,946 eligible candidates, respectively. Principal ideals are compared by
independent exact multiplication and HNF, not just by generator coordinates:
PARI's later reconstructed generator could differ by a unit.

The findings are different in the two regimes:

- For `3.1.1246798226700.1` and `3.1.4860135888300.8`, none of the four target
  prime ideals from the preceding PARI witness audit enters the initial-volume
  search; no tested eligible candidate generates any of those four principal
  ideals. The scheduler enables eight norm-permutation positions plus local
  redundancies. Its missing-ideal recovery is conditional on rank deficiency,
  not on a full-rank presentation having excessive index.
- For `3.1.2602492536667698675.123`, the program does visit ideal 153, and tests
  $a+1261$ at reduced coordinates $(-1,1,0)$ inside the prepared ellipsoid.
  At retained row count 184, the rank modulo 27449 is 178. The target is
  $182+6=188$ rows, so all six allowed dependent slots are occupied. The actual
  native trace records the reserved-quota rejection branch. Independent dense
  elimination confirms that this row does not increase rank modulo 27449,
  while the exact parity helper shows that it adds a new direction modulo two.
  This is **not** a missed enumeration candidate or an insufficient bound.

`test/fixtures/cubic-two-primary-admission.json` records the actual sparse
184-row/182-column prefix (945 nonzero entries), candidate, native rejection
event, and provenance hashes. `test/cubic-two-primary.cjs` checks the two ranks,
quota arithmetic, parity extension and signed/doubled candidate controls.
The separate compact-unit test already verifies this generator's principal
ideal identity. Neither test infers that genuine class-group two-torsion should
be removed.

### Controlled policy ablations, not a global optimization claim

Three source-transparent research changes keep the original relation capacity,
proposal budgets, candidate limits, eight-retry limit and certification checks:

1. Enable every existing factor-base position for lazy initial planning.
2. Additionally resume that retained unpowered search after an analytically
   established algebraic deficit, before using powered ideals.
3. Preserve the old initial prefix and enable the extra positions only after
   that deficit, then resume as in (2).

No field label, defining coefficient, reference answer, or imported PARI
generator controls these policies. Extra tracing memory is instrumentation;
these runs are not timing or production-resource qualification.

| Field | Baseline final index / rows | Full initial ordering, then resume | Late activation, then resume | PARI class number |
| --- | --- | --- | --- | --- |
| `3.1.1246798226700.1` | 1620 / 112 | 405 / 80; zero retries | 405 / 99; six retries | 405 |
| `3.1.4860135888300.8` | 1944 / 117 | 972 / 116; declines | 972 / 115; declines | 486 |
| `3.1.2602492536667698675.123` | 69984 / 211 | 34992 / 192; one retry | 139968 / 220; declines | 34992 |

These are different final ledgers. Late activation preserves the initial
prefix, not the baseline's subsequent powered rows; the larger final index
does not represent an index increase within one append-only computation.

The full-initial experiment without unpowered continuation instead ends at
69984 / 217 on the third field. All three variants' target-field ledgers have
fresh independent principal-relation, compact-unit/log, HNF and Smith replay.
The two successful full-ordering presentations have invariants
$(3,3,3,15)$ and $(3,3,3,3,6,72)$, agreeing with PARI. They reach the research
index-one classifier, **not public class-group acceptance**.

The broader panel rejects promoting either traversal policy globally. The
full-initial/resume run has 21 index-one diagnostics, three declines (including
two previous successes), and three unqualified runs because the trace exporter
overflowed. The late-activation run completes all 27 detached computations:
22 index-one diagnostics versus the baseline's 24. It preserves all 16 initial
successes' ledgers and compact units exactly, but loses three later successes:
`3.1.750484414680.1`, `3.1.1343801573410596300.4`, and
`3.1.2441197187235506700.191`. Three large-field traces are explicitly truncated;
their detached mathematical outputs are present and their unchanged ledgers
are compared separately. No truncated trace supports a candidate-level claim.

Thus replacing the search ordering is not the next production patch. The
evidence supports separate treatment of (a) lost integer-useful relations under
odd-prime admission, (b) missing ideal coverage, and (c) the choice between
unpowered and powered continuation. A parity-aware admission/targeting policy
must still preserve room for missing rational-rank pivots, genuine two-torsion,
unit witnesses, bounded storage and fail-closed certification. It must beat the
current policy on the broader panel, not merely repair these two examples.
Any auxiliary parity basis must describe the **retained** ledger: testing a
proposal must not commit it to that basis before admission succeeds. Otherwise
a discarded proposal could incorrectly hide the next useful parity direction.

Research scripts, source snapshots, complete/overflow-marked traces, replay
results and failed attempts are hash-archived under
`build/cubic-analytic-schedule-evidence/search-visitation/`. Working scratch is
`/scratch/sagejs-runtime/cubic-search-trace-EkdWMX`. The final diagnostic source
has hash `60196d057e0e58634a2c542ae1837e6efccb364dde7b8cfcdd406503b7803f2d`
and 591,798 bytes. It remains unpromoted; production source and its 485,000-byte
allowance are unchanged. No `opt` timing, platform qualification or public
certificate claim is made by this checkpoint.

Validation: the new regression and 18 neighboring focused checks pass. A fresh
build completes in 8m31s with all 41 native families reused; all 196 unit files,
documentation checks, and precompilation of 422 lazy modules plus eight dynamic
programs pass. The subsequent CLI suite stops at the same five missing
FFLAS/igraph prerequisites after four files pass, with 583 unstarted. The
architecture check again reaches the pre-existing stale optimizer manifest
after passing native/FFI/resource checks. An earlier unit attempt overlapped
the rebuild and saw a temporarily absent generated parser; the sequential
post-build run passes that test and the full unit tier. These results do not
constitute green release qualification. The evidence archive contains 142
hash-checked compressed files (292,560,286 original bytes; 14,565,001 compressed).

## Retained-ledger parity admission: 27/27 broad diagnostics

The next experiment starts from the unchanged powered-continuation baseline
`0b260478d3e59df9e47f7a5270bea567cccfdbf052a0ecbb7a3e004da286756a`.
It does not replace the initial ideal ordering, ellipsoid bounds, per-ideal
quotas, analytic checks or continuation policy. Instead, a private word-packed
parity basis detects when an otherwise rejected odd-prime-dependent row adds
integer-lattice information. Such a row is admitted only with room reserved
for every missing odd-prime pivot. The existing physical relation capacity is
unchanged. See the proof document for the retained-span and capacity arguments.

The exact helpers are ordinary Python in
`bench/class-unit-groups/cubic-two-primary.py`. They use existing uint64 XOR,
AND, OR and shifts, with `# sagejs: native-bitwise` preserving Python's XOR
semantics. No compiler files or claims were changed. The compiler currently
requires binding a helper call's result rather than discarding the expression;
the commit helper returns whether it published a pivot. The earlier exact
arbitrary-precision bitset reference remains separate from this compiled
machine-word representation.

The frozen larger-field development panel now has **27/27 index-one
diagnostics**, versus **24/27** before. All 27 detached runs complete and still
return false at the public boundary. Twenty have byte-identical original
output fields, including all 16 previous initial-pass successes. Seven change:

| LMFDB label suffix after `3.1.` | Previous rows / retries | Parity rows / retries | Additional parity admissions | Presentation order |
| --- | ---: | ---: | ---: | ---: |
| `1246798226700.1` | 112 / 8, declines | 83 / 0 | 3 | 405 |
| `4860135888300.8` | 117 / 8, declines | 87 / 0 | 2 | 486 |
| `2602492536667698675.123` | 211 / 8, declines | 191 / 0 | 3 | 34992 |
| `347399299982700.28` | 105 / 2 | 105 / 0 | 2 | 3159 |
| `341970033803678280.6` | 131 / 3 | 128 / 0 | 1 | 243 |
| `1343801573410596300.4` | 182 / 8 | 165 / 0 | 2 | 2187 |
| `2441197187235506700.191` | 204 / 5 | 197 / 0 | 2 | 227448 |

The panel retains 3,735 rows rather than 3,841. These counts are structural
evidence, not controlled timings. The three former failures now finish in the
initial pass, without the eight unsuccessful continuation rounds. Admission
changes which rows exhaust each local quota, so subsequent actual candidates
can differ despite the same traversal policy. In particular, this run does
not simply insert the five previously reconstructed PARI witnesses: none is
hardcoded, and the third field closes without retaining `a+1261` itself.

For all three former failures, disabling the policy reproduces every original
output field exactly. With the policy enabled, GMP, tagged integers and
JavaScript agree on every detached field, not just the class-number diagnostic.
The packed helper separately passes 46 native/dynamic cases against the actual
CPython helper and independent scalar rank checks, including factor counts
0, 63, 64, 65, 127, 128, 129, 255, 256, 257, 511 and 512, signed 301-bit
coefficients, rejected proposals, padding and guard words. Invalid dimensions
are rejected before mutation by the witness wrapper. The tracked 232-matrix
reference test also exercises the new prepare/commit split and the real
184-row admission-loss fixture.

Research source `5b20a10fdabace9b758117657976ed8dd2467523bc3e9456180d535d8c45ede9`
has 588,740 bytes, up 3,774 from its research baseline. Its generated isolated C
core has 17,186,531 bytes, up 12,335 from 17,174,196. This is not a proposal to
raise the production source allowance. Production effective source remains
480,241 bytes against the unchanged 485,000-byte limit. The extra caller-owned
packed scratch is `8 * ((capacity + 1) * ceil(capacity / 64) + 3)` bytes:
2,088 / 8,248 / 32,856 bytes at capacities 128 / 256 / 512. It adds no exact
matrix owner and does not widen the exact arena, factor, candidate or relation
limits. Full generated-code/platform/resource qualification is still required.

Working evidence is `/scratch/sagejs-runtime/cubic-parity-admission-ipwLEI`;
the durable local archive is
`build/cubic-analytic-schedule-evidence/parity-admission/`. Native build key:
`f3ec959b377c6fbc6796222d1ba3d9fecec3ce17d4d7617eaeac4557b5c3e4c2`;
standalone word witness key:
`fd204651386f0d9d79499db12e1ecf0b4b156f92807d15fed04f6b6ce4981642`.
PR #203 remains draft. This is a research diagnostic improvement, not a
release-qualified certificate, independent holdout success or PARI timing win.

All seven changed ledgers have independent principal-ideal, compact-unit/log,
HNF and Smith replay: 956 relations in total, with all seven invariant lists
matching the recorded PARI 2.17.4 results. The other 20 outputs match their
previously replayed baseline data exactly. The checker proves unit membership
and logarithm enclosure, not maximality or fundamentality by itself; its
`class_group_proven` flag remains false. LMFDB's missing class numbers are
preserved as missing. When a database answer is absent, comparison uses the
successful PARI record and its SHA256 instead. An initial comparison mistakenly
called `int(None)`; the corrected per-field pass completed all replays but then
hit an aggregate filename collision. The seven persisted results were assembled
with fresh input-hash and completeness checks. Both harness failures are kept
in `attempts.md`; neither was treated as successful full-batch validation.

Focused checks pass (19), and a fresh `pnpm test:changed -- --base HEAD` receipt
passes merge/doc checks, an 8m34s build, and all 196 unit files (1m43s), with
626.14 seconds total. The full architecture gate still stops at the existing
stale optimizer-opportunity manifest, after native/FFI/resource checks pass.
No release qualification or additional platform coverage follows from this
research checkpoint.

### Larger-field structural follow-up

Fresh PARI probes on the three large controls with discriminant-label component
`1086061775432017340256300` report the following retained factor-base sizes:
414 (`.596`), 364 (`.387`) and 424 (`.1013`), matching Sage.js's respective
cardinalities. This checks counts, not equality of the ideal sets or all search
bounds. Their regulators are approximately $1.99\cdot10^6$,
$8.36\cdot10^6$ and $8.15\cdot10^6$. These are not small-unit examples despite
their class groups having only nine invariant factors.

PARI's returned HNF block is $9\times9$ in each case, with companion blocks
$9\times405$, $9\times355$ and $9\times415$. These are returned structures,
not proof that PARI used only nine-dimensional matrices throughout its run.
Sage.js's compact-unit step operates on 420, 404 and 430 retained rows and
6, 40 and 6 kernel dependencies; its recorded log precisions are 134, 134 and
138 bits. All three finish analytic refinement at cutoff 5400. The current
declared right-kernel adapter already uses rational nullspace plus saturation,
not the older full transpose-HNF unimodular transform. It would be incorrect
to propose removing that obsolete algorithm as if it were still running.

These facts motivate a phase-cost breakdown before another optimization:
maximal order/factor base, relation search, exact lattice/kernel work,
compact-unit/log work, and analytic refinement. Neither final matrix sizes nor
matching factor-base counts identify the dominant phase by themselves.
The exact GP programs and outputs are retained in `pari-shapes.json` and the
corresponding `*-shape.gp` files in the evidence archive.

### Controlled opt diagnostic timings: improvement and the larger remaining gap

The 10-field panel is deliberately selected development data: the seven changed
fields and three large unchanged controls. It is not an unseen holdout. The
idle dedicated `opt` VM used one pinned CPU (2) on AMD EPYC 7B13, Node 26.7.0,
and an exclusive timing lock. No compilation or unrelated task ran on that VM.
Both source hashes and native binary hashes are recorded. Inputs and buffers
were allocated outside timing; every call recomputed from polynomial to the
detached ledger, with all original outputs checked after each measured call.
The native policy had one warmup and five rotating single-call samples.
PARI 2.17.4 used `bnfinit(polynomial,1)`, a fixed random seed, one warmup and
three fresh computations per sample; every sample checked the class number
and invariants. GP process startup was excluded from its reported interval.

All entries below are medians in milliseconds:

| Label suffix after `3.1.` | Previous native | Parity native | PARI | Parity / PARI |
| --- | ---: | ---: | ---: | ---: |
| `1246798226700.1` | 308.31, declines | 142.03 | 19.00 | 7.48 |
| `4860135888300.8` | 327.05, declines | 195.22 | 18.67 | 10.46 |
| `347399299982700.28` | 239.50 | 221.11 | 23.33 | 9.48 |
| `1086061775432017340256300.596` | 13931.88 | 13821.34 | 823.67 | 16.78 |
| `1086061775432017340256300.387` | 17715.76 | 17669.81 | 820.67 | 21.53 |
| `341970033803678280.6` | 19398.32 | 5331.76 | 44.00 | 121.18 |
| `1343801573410596300.4` | 1602.02 | 1084.42 | 69.00 | 15.72 |
| `1086061775432017340256300.1013` | 16081.19 | 16078.44 | 777.00 | 20.69 |
| `2441197187235506700.191` | 1635.23 | 1417.94 | 102.00 | 13.90 |
| `2602492536667698675.123` | 2078.11, declines | 1546.20 | 88.00 | 17.57 |

These remain **research diagnostic costs**, not public certified API timings.
The three former declines are not equivalent-result speedup comparisons.
The four other changed fields all improve with nonoverlapping observed native
sample ranges; notably `341970033803678280.6` improves by $3.64\times$, while
remaining about $121\times$ slower than PARI. The three unchanged large controls
have overlapping old/new sample ranges: no durable speed difference is claimed
for them. Their remaining $16.8$--$21.5\times$ gaps, and the $121\times$ gap on
the smaller factor base, require actual phase profiling. They cannot be
explained away as submillisecond overhead or a missing LMFDB answer.

Raw samples, full output expectations, host/affinity data, GP and native binary
hashes, and the exact runner are in `opt-timing.json`, `fields.json`,
`timing.cjs` and `launch-timing.cjs` in the archive. The remote run completed in
`/tmp/cubic-parity-admission-5U8qem`; its result and log were retrieved before
handoff. The next performance priority is the larger-field phase breakdown,
alongside holdout testing and eventual public-certificate integration, rather
than declaring this 27-field development panel generally competitive.

## Larger-field phase costs and in-place online HNF

The next campaign measures the whole closed native program at checked early
return boundaries. Its baseline is parity source
`5b20a10fdabace9b758117657976ed8dd2467523bc3e9456180d535d8c45ede9`.
The instrumented source is
`a7eddc3c089ccbbb4c5d27df39f6412f07bb804c23365eee51f720a2f8259433`,
compiled with unchanged compiler commit `8cd09c4484cddfcf7024b5169a4c18fa0b07d3f0`.
Parameter `phase_stop=0` performs the entire original computation; values
1 through 11 return false at explicit boundaries with markers 201 through
211. Larger values decline before execution. There is no internal host clock
or callback. Each prefix includes its own generated all-exit cleanup, so
differences estimate phase costs rather than recording isolated phase clocks.
The no-stop controls agree with every frozen detached output on all four
measured fields, as do the separately loaded uninstrumented controls.

On idle `opt`, pinned to CPU 2 under the exclusive timing lock, one prefix
warmup and three rotated samples give these cumulative medians in milliseconds:

| Label suffix after `3.1.` | Before collection | After initial collection | Entire diagnostic |
| --- | ---: | ---: | ---: |
| `1086061775432017340256300.596` | 620.22 | 13156.66 | 13347.77 |
| `1086061775432017340256300.387` | 572.40 | 15353.66 | 17159.72 |
| `341970033803678280.6` | 52.45 | 441.64 | 5325.28 |
| `1086061775432017340256300.1013` | 599.03 | 15445.00 | 15610.08 |

The first field's broader one-sample sweep reaches field analysis at 1.28 ms,
the integer kernel at 13269.91 ms, dependency LLL/precision at 13311.01 ms,
principal logs at 13327.74 ms, authenticated compact unit at 13270.27 ms,
and final closure at 13310.37 ms. Small nonmonotone differences are noise and
different cleanup costs, not negative phase times. The substantial cost
precedes compact-unit work.

For `341970033803678280.6`, a separate one-sample sweep reaches the compact
unit at 442.37 ms and the first analytic attempt at 443.79 ms, but final
analytic closure at 5321.19 ms. It has no algebraic retry. Its cutoffs are
765, 1530, and 3060; the last crosses the order-index prime 2819. The present
index-prime code enumerates $2819^2=7{,}946{,}761$ potential unital maps from
the exact maximal-order algebra. This identifies a different structural
target from online HNF: authenticate a cyclic basis $1,t,t^2$ modulo $p$ and
count roots of its cubic relation, falling back when that basis test fails.
This proposed finite-algebra optimization is not implemented by the HNF change
below, and the phase evidence alone does not measure that one call in isolation.

PARI 2.17.4's local debug trace for the first field reports discriminant
factorization at 0 ms, field initialization at 1 ms, initial `small_norm` at
115 ms, and `hnfspec [414 x 420]` at 669 ms. It then adds 10 relations and
reduces the tentative order from 157464 to 78732. Debug timings are local
diagnostics, not a substitute for the prior controlled `opt` comparisons.
In particular, PARI's final nine-dimensional block does not mean it never
processed the larger matrix.

### An exact HNF change with unchanged search and proof work

The research in-place variant preserves the pivot sequence of the existing
incremental HNF helper. The old online update copies the basis to an augmented
matrix, copies that matrix to its reduction buffer, scans for a change, then
copies the result back. The replacement borrows the already available
one-row membership workspace as the residual and mutates the retained basis
directly. Exact nonmembership, or a previously authenticated nonmembership
hint, already proves that the canonical lattice changes; a full comparison
is unnecessary. A contained row leaves the basis unchanged. The unused old
source/reduction owners remain allocated in this ablation, so neither allocation
policy nor any memory limit is weakened to obtain the result.

The ordinary Python helper is in `cubic-incremental-hnf.py`. All 4845 tested
prefixes agree with both the copying implementation and an independent SymPy
HNF, including skipped pivots, deficient rank, duplicates, signs, and 300-bit
coefficients. The residual ends at zero on every prefix. The unchanged
unimodular swap, Bezout, sign, and quotient operations preserve the lattice;
positive reduced pivots give the same unique HNF. Partial failure invalidates
private state and must never publish a result.

Research source
`19d7d1d543d5fec23836bf0369adf2c0d593f58d436d46f65d69cac40cfe80ac`
has 586407 bytes, versus 588740 for the parity baseline. All 27 complete
detached outputs and parity counters agree exactly with that baseline on both
GMP and tagged backends. Production source, source allowance, admission policy,
relation order, selected units, analytic bounds, and publication are unchanged.
This is still a research diagnostic, not a newly released certified API.

Working scripts, frozen inputs, generated-code provenance, timings and exact
lattice certificates are in
`/scratch/sagejs-runtime/cubic-phase-costs-SJsWGz`. The independent HNF check
authenticates both lattice inclusions: PARI proposes $H,C$, Python checks
$AC=H$ exactly and solves every column of $A$ integrally in the triangular
basis $H$. It also checks canonical form. No assumed class number or guessed
determinant bound enters these inclusions. The native replay's basis is checked
by inclusion in this authenticated lattice and equal finite index.

The initial naive SymPy HNF attempts exhibited severe coefficient growth and
were terminated deliberately; PARI's naive transformation mode also exhausted
its 512 MiB stack on one matrix. LLL-assisted `mathnf(A,4)` supplied proposals
for all four independently checked certificates. These are checker-algorithm
issues, not waived failures of a mathematical equality.

### Paired costs and remaining work

The separately compiled, unchanged online-HNF replay on the frozen ledgers
takes median 5262.32, 3732.32, 130.93 and 5197.17 ms in the table's order.
Copying its inputs alone takes 5.64, 5.03, 0.65 and 5.75 ms. The replay does
not receive the collector's known-nonmembership hints, so it can perform more
membership work; its cost must not simply be subtracted as an exact phase
clock. It nevertheless establishes that online exact lattice maintenance is
a substantial, separately reproducible cost, not just relation discovery.

Paired whole-computation measurements use unchanged inputs, one warmup, three
alternating samples, CPU 2 and full-output checks outside timing:

| Label suffix after `3.1.` | Copying HNF (ms) | In-place HNF (ms) | Baseline / in-place |
| --- | ---: | ---: | ---: |
| `1086061775432017340256300.596` | 13234.84 | 9779.59 | 1.353 |
| `1086061775432017340256300.387` | 16992.54 | 15190.21 | 1.119 |
| `341970033803678280.6` | 5334.85 | 5393.37 | 0.989 |
| `1086061775432017340256300.1013` | 15883.90 | 12567.62 | 1.264 |

The three large fields improve, but the analytic-heavy field is about 1.1%
slower, with nonoverlapping sample ranges in this run. This is not a blanket
no-regression result and does not justify production promotion. It also does
not close the gap with PARI. A five-pair repeat on that smaller field gives
5322.43 versus 5398.29 ms, again favoring the baseline. The full observed ranges
are 5315.97--5341.78 and 5385.70--6703.19 ms; the slow final in-place sample is
retained, not excluded. The median regression is about 1.4%. Its cause has not
been isolated, and no no-regression claim is made. Two smaller outputs agree with the
generated JavaScript backend; all 27 were checked on GMP and tagged.

The finite-algebra feasibility probe checks all 12 index-prime algebras arising
from these four recorded order bases. At $p=2819$, the first order-basis element
$t$ has $\det(1,t,t^2)=2530\ne0$ in $\mathbf F_{2819}$, and

$$
g(T)=T^3+2542T^2+1936T+1275
$$

has the three roots $1113,2021,2781$. The probe derives the multiplication
table from the polynomial and rational order basis, checks the power-basis
identity, and independently verifies all products under the three proposed
unital maps. Once $1,t,t^2$ is a basis, $\mathbf F_p[T]/(g)\to A$ is an
isomorphism: it is a surjection between vector spaces of dimension three.
Thus the roots count precisely the maps $A\to\mathbf F_p$, including when
$g$ has repeated roots. No heuristic bound or assumption that the original
defining generator remains primitive modulo an index prime is involved.

The candidate search must choose a complement to the actual identity vector,
not blindly use the last two order coordinates. In this example the identity's
first coordinate vanishes modulo 2819. A failed cyclic-basis test must retain
the exact general fallback. This finite-algebra path is the next implementation
target; it is only a feasibility/proof probe in this checkpoint.

All controlled `opt` jobs have ended and the exclusive lock was confirmed free.
The generated in-place core has 17053595 bytes versus baseline 17186531;
production's effective source remains 480241/485000. The scratch evidence is
also gzip-archived with original SHA-256 hashes and round-trip checks under
`build/cubic-analytic-schedule-evidence/phase-costs/`. This includes the
baseline, instrumented and in-place source, generated cores/headers, exact
input ledgers, all raw timings, independent certificates, and failed attempts.
The archive contains 95 files: 186005889 original bytes and 17982915 compressed
bytes. The formatted tracked helper has the same AST as the measured native
source helper.

Validation for this checkpoint: Python formatting, nine focused checks,
all 196 unit files, merge checks, docs checks and the complete 8m47s build
pass. The broader CLI run stops in `test/ffi.cjs` on the existing missing
FFLAS generated manifest and igraph native dependencies: five failing cases,
with 583 files unstarted after cancellation. Full architecture likewise stops
at the previously recorded stale optimizer manifest, after its native, FFI
and resource checks pass. Neither failure is waived or represented as a green
full-suite receipt. The task stays active and PR #203 stays draft. Final
validation-receipt metadata is written after the build; this checkpoint does
not claim release qualification of that exact final metadata snapshot.

## Checked cyclic residue algebras at index primes

The next source-copy experiment addresses the quadratic map enumeration
identified above. The tracked research helper is
`bench/class-unit-groups/cubic-residue-algebra.py`; production dispatch,
source allowances, certification predicates and storage limits are unchanged.
The complete native experiment inserts one checked shortcut into
`_cubic_degree_one_prime_count`, only on its index-prime branch. It retains
the entire existing exact enumeration if the shortcut declines. The baseline
is the parity-admission source, not the in-place HNF experiment, so these
effects are separated.

### Exact algebra argument and its premises

Let $A$ be the supplied commutative, associative, unital algebra of dimension
three over $\mathbb F_p$, with $p$ proven prime. The caller must already have
authenticated the maximal-order multiplication table and the coordinates of
$1$. This helper does **not** prove those premises or maximality of the order.

For a proposed $t$, compute $t^2$ using the table and test invertibility of
$S=(1,t,t^2)$. On success, compute $t^3$, solve
$t^3=r_0+r_1t+r_2t^2$ by exact determinants modulo $p$, and verify that identity
in all three original coordinates. The evaluation homomorphism

$$
\mathbb F_p[T]/(T^3-r_2T^2-r_1T-r_0)\longrightarrow A,\qquad T\longmapsto t
$$

is surjective because $1,t,t^2$ are a basis. Both vector spaces have dimension
three, so it is an isomorphism. Unital $\mathbb F_p$-algebra maps from the
quotient to $\mathbb F_p$ correspond exactly to the **distinct** roots of its
defining cubic. This remains true for repeated roots and nilpotents: no
separability or unramified-prime premise is needed. Such maps from
$\mathcal O_K/p\mathcal O_K$ correspond to the degree-one primes above $p$.
This local-algebra argument is unconditional; the surrounding class-group
certification retains its existing analytic assumptions.

The bounded search uses two standard coordinates complementary to the actual
identity, trying at most four combinations. It never assumes the existence
of a generator. In particular, $\mathbb F_2^3$ and the algebra with a
two-dimensional square-zero radical may require the original enumeration.
An unsuccessful search is not a mathematical error and never supplies a
root count. Bounds outside $2\leq p\leq65535$ also decline before arithmetic.

There is also a useful completeness observation for this bounded search when
$p\geq5$. For complementary coordinates $e,f$, the determinant
$\det(1,e+cf,(e+cf)^2)$ is a polynomial in $c$ of degree at most three.
If any element generates $A$, this polynomial is not identically zero:
adding a scalar multiple of $1$ does not change cyclicity, scaling a generator
scales the determinant by its cube, and the possible generator $f$ is detected
by the leading coefficient. A nonzero cubic cannot vanish at all four
distinct values $0,1,2,3$. Thus for these primes a monogenic algebra is found
within the existing search. The implementation does not rely on this lemma
to publish a count; every accepted basis is still explicitly checked.
For characteristics two and three, falling back remains intentional.

The polynomial root-count helper is the existing typed-source
`cubic_root_multiplicity_counts` from the pinned compiler foundation. It
counts distinct roots via the squarefree polynomial $T^p-T$ (with its
qualified discriminant shortcut). For a successful cyclic presentation,
this replaces $p^2$ candidate linear forms by a bounded number of algebra
products and degree-three polynomial arithmetic logarithmic in $p$.
No field label, class number, precomputed splitting answer or GRH bound
selects the path.

### Differential checks and scope

The focused test constructs 733 finite algebras/bases, of which the helper
accepts 552 and declines 181. It includes every monic cubic over
$\mathbb F_2,\mathbb F_3,\mathbb F_5$, random changed bases, all 168 invertible
bases over $\mathbb F_2$ for two contrasting algebras, products of fields,
square-zero radicals, and signed 300-bit lifts of table and identity entries.
The larger prime examples include 251, 2819 and 65521. Independent exhaustive
linear-form enumeration checks the small algebras; direct polynomial-root
enumeration checks the larger polynomial quotients. The actual original
index-prime fallback is also tested on all cases with $p\leq19$.

The compiled witness matches all 733 expected results with GMP, tagged exact
integers and generated JavaScript, preserving every input entry. A separate
24-field panel selects previously unused development fields from the frozen
LMFDB corpus by their largest index-prime divisor at most 65535, then label.
It excludes the prior 27-field panel and does not select using class numbers
or performance. The selected primes range from 31 to 191. On all 24 fields,
all three backends agree with PARI 2.17.4 `idealprimedec` applied to its
maximal-order algebra. This is a local-algebra comparison, **not** a claim of
24 new completed class-group computations or an independent maximality proof.

All 27 existing larger-field complete output ledgers are unchanged in GMP
and tagged execution: relation rows, principal elements, factor data, unit
exponents, order basis, analytic outputs and parity counters. Two smaller
members additionally pass full JavaScript execution. These are exact
equivalence checks against the already retained ledgers; they do not upgrade
the historical independent replay's proof-authority flags.

### Source and resource identity

The complete research source is 593759 bytes, SHA-256
`bbe363dc3fce80813efc29494d3f71257dac862d7170fe7962ea2c252aa7bd1e`;
native cache key
`b3fefbc313d18531d4f7ef28d082fdcd5bf3d98ac390626989bfa416b2cb7b8b`.
The generated core is 17245835 bytes, 59304 bytes above the parity baseline.
The helper borrows the existing table and uses scalar temporaries; it creates
no additional matrix/vector owners or persistent caches. No arena budget is
increased. These size observations are not cross-platform resource
qualification, and the research closure still exceeds the unchanged
production source allowance.

The small compiled witness has source SHA-256
`a8d9a3973cdfc2444b99daf41fb90b9a54df3ceaae16d3ae382b82a56ffc2e9d`
and key `d610b6a0a6a09a589cc264bbbfbb6f1dde028df1ed26e6d16a2dc57d7a8a25b8`.
Compiler foundation is the clean commit
`8cd09c4484cddfcf7024b5169a4c18fa0b07d3f0`.
Reproduction scripts and raw evidence are in
`/scratch/sagejs-runtime/cubic-cyclic-residue-XTfP0f`.

### Controlled full-computation and local-operation timings

The four-field comparison uses the same dedicated `opt` host, CPU 2, exclusive
timing lock, precompiled artifacts and preallocated caller buffers. Each
policy receives one warmup and five alternating measured calls. Timers cover
the entire native polynomial-to-detached-ledger computation, including private
arena cleanup; exact output comparisons occur outside the timer. These are
research closure timings, not timings of a newly qualified public API.

| Field suffix after `3.1.` | Parity baseline (ms) | Cyclic shortcut (ms) | Baseline / shortcut |
| --- | ---: | ---: | ---: |
| `1086061775432017340256300.596` | 13510.638 | 13497.058 | 1.001 |
| `1086061775432017340256300.387` | 17387.771 | 17505.310 | 0.993 |
| `341970033803678280.6` | 5300.948 | 459.593 | 11.534 |
| `1086061775432017340256300.1013` | 15779.967 | 15846.919 | 0.996 |

An additional benchmark fixture was transferred while the last control was
running, so do not interpret its sub-percent difference as a qualified
regression or speedup. A separate target-only confirmation was run after all
transfers completed, with the same one-warmup/five-pair protocol and no other
benchmark activity. Its medians are **5307.402 ms versus 455.656 ms**,
a **$11.648\times$** improvement. All five baseline samples lie between
5300.633 and 5326.726 ms; shortcut samples lie between 454.255 and 460.095 ms.
Every full output remains identical. The earlier controlled PARI reference is
44 ms, not a fresh measurement in this run: approximately a $10.4\times$ gap
still remains. Removing one accidental quadratic local-algebra operation is
not overall PARI competitiveness.

The 24 additional LMFDB algebras also receive an isolated-operation comparison
on `opt`, after full-computation timing finishes. One compiled witness selects
the old exact enumeration or the checked shortcut plus fallback; both use the
same table and identity. Seven alternating batches of ten calls follow one
warmup per policy. All counts agree. Across these fields, old enumeration
medians range from 1.508 to 55.600 ms; shortcut medians range from 0.03357 to
0.04895 ms. The per-field speed ratios range from $38.4\times$ to
$1135.9\times$. These timings include the witness's private arena and host
boundary, and are **not class-group speed ratios**. Many complete computations
already have cached splitting information for these small primes, so the
isolated gain cannot be attributed to their entire class-group runtime.

The correct next target is the remaining roughly 456 ms full computation and
the relation-collection-dominated larger controls. The earlier phase and HNF
measurements remain useful hypotheses, not exact additive timing accounts.
Test composing the independently justified in-place HNF update with this
shortcut, then reprofile the residual full path before choosing another
optimization. Do not reduce analytic bounds or weaken certificate checks to
erase the remaining PARI gap.

A fresh **local debug trace**, not a controlled timing run, further narrows
that next question. PARI uses 121 factor-base ideals and a $121\times127$
initial relation matrix for `341970033803678280.6`. Its debug intervals report
12 ms in `small_norm`, 23 ms in `hnfspec`, 5 ms in the associated floating-point
work, and 1 ms in the regulator/check stage. It returns class invariants
$[3,3,3,3,3]$, but warns that explicit fundamental units cannot be returned at
the available precision. Our unchanged ledger has 121 ideals and 128 rows.
Thus this example no longer suggests an orders-of-magnitude excess in the
number of stored relations; the cost of collecting and maintaining those
relations is now the appropriate subject of controlled attribution. The raw
GP program, output and warnings are retained as `pari-target.json`.

Evidence is additionally preserved in the backed-up worktree under
`build/cubic-analytic-schedule-evidence/cyclic-residue/`: 82 gzip files,
83716383 original bytes and 4718582 compressed bytes. The manifest records
original SHA-256 hashes and every compressed file was round-trip checked.
It includes the complete baseline/candidate sources, generated cores and
headers, 27 original ledgers, differential vectors and results, fresh-field
GP scripts, raw timing samples, source-boundary check and failed harness
attempts. The tracked helper's AST matches its compiled source exactly.

The checkpoint's 28 focused checks pass, as do all 196 unit files, the
8m47s full build, docs checks and merge checks. The broader CLI suite stops
at the same five existing FFLAS/igraph dependency failures in `test/ffi.cjs`;
583 files remain unstarted. The recorded `test:changed` command fails after
801.88s rather than being described as a complete suite pass. Architecture
checks still reach the pre-existing optimizer manifest mismatch after their
native/FFI/resource checks pass. Final handoff and receipt metadata is written
after the build, so this is not exact-final-metadata release qualification.
The goal remains active and PR #203 remains draft. No production path or
allowance has changed.

## Composing cyclic residue counting with in-place online HNF

The two independently tested changes now coexist in one research closure.
Starting with the checked cyclic-residue source, only the HNF insertion helper
and its online-update caller are replaced by their in-place counterparts.
Removing those two definitions makes the before/after ASTs identical. The
previously allocated source and reduced matrices remain allocated but unused:
this experiment does not change resource limits, the factor base, candidate
order, admission, analytic assumptions, or publication.

The input is cyclic source SHA-256
`bbe363dc3fce80813efc29494d3f71257dac862d7170fe7962ea2c252aa7bd1e`.
The composed source is 591426 bytes, SHA-256
`f5aaecbde89ffbe20eb7d7947dd6231b4fcf53b57f754223b965f7aea8addb5b`,
with native key
`e70c6c95ce5069bd3713562430fe90e8e5cfb69a0605c0e1957bf4d7857bdd62`
and generated core size 17168611 bytes. Compilation uses the same pinned
compiler foundation `8cd09c4484cddfcf7024b5169a4c18fa0b07d3f0`.

All 27 complete development ledgers agree with the frozen baseline on GMP
and tagged execution; two complete JavaScript controls agree as well. These
checks include all 64 output words, factor records, relation rows, principal
elements, unit exponents, basis records, return value, and parity counters.
They do not upgrade the research-only return into a public certificate.

Dedicated `opt` measurements pin CPU 2 and hold the exclusive timing lock.
Each field/backend has one warmup and five alternating samples; all full
outputs are checked outside the timed interval. Inputs are preallocated, and
the entire native computation and cleanup are timed. Node is 26.7.0 on the
AMD EPYC 7B13 host. No files are uploaded during measurement.

| Field label | Cyclic only, median ms | Composed, median ms | Speedup |
| --- | ---: | ---: | ---: |
| `3.1.341970033803678280.6` | 453.549 | 348.753 | 1.300 |
| `3.1.1086061775432017340256300.1013` | 15764.091 | 11403.929 | 1.382 |
| `3.1.1086061775432017340256300.387` | 17497.904 | 14657.383 | 1.194 |
| `3.1.1086061775432017340256300.596` | 13924.930 | 9627.001 | 1.446 |

Thus the composition improves the seconds-scale cases too, not merely the
index-prime target. These are before/after Sage.js ratios, **not PARI wins**.
The raw `combined-timing.json` scope string accidentally says three samples;
the retained runner executes five and the raw arrays contain five each. The
table uses those five actual samples; the original record is not rewritten.

The invariant behind the in-place update remains exact: elementary unimodular
row operations adjoin the incoming row to the padded canonical HNF. Exact
membership, including skipped pivots in rank-deficient prefixes, determines
whether the lattice changes. A retained nonmember hint may bypass that test
only when the existing admission logic has already established nonmembership.
The old production full-rank-only membership helper is not a substitute for
this research closure's padded-HNF membership helper. The 4845-prefix SymPy
oracle still verifies both insertion implementations, with zero residual on
success; 27 full-ledger comparisons additionally check the composed callers.

### Phase boundaries and candidate counts

Cumulative-prefix instrumentation of the composition places most remaining
cost before or during relation collection. For the smaller target, medians
are 1.504 ms through field analysis, 51.988 ms through factor-base preparation,
337.319 ms through initial collection, and 359.486 ms for the instrumented full
call. For the three larger fields, single diagnostic samples reach factor-base
preparation in 0.56–0.62 s and the full call in 9.60–14.58 s.

These are diagnostic boundaries, not additive phase clocks. In particular,
the `.1013` initial-collection prefix takes 13.09 s while its instrumented full
call takes 11.58 s. Early return changes cleanup and potentially generated-code
behavior. This contradicts interpreting every prefix difference as an isolated
phase duration; it does not invalidate the separately measured full-call gain.

A separate, untimed source copy counts helper entries in 12 private workspace
cells. Original workspace-length checks exclude that diagnostic tail, and all
original outputs and parity counters still agree on the four fields.

| Field suffix | Ellipsoid candidate helper calls | Principal-relation helper calls | Prepared ellipsoids |
| --- | ---: | ---: | ---: |
| `341970033803678280.6` | 14322 | 9674 | 21 |
| `1086061775432017340256300.1013` | 134742 | 56551 | 161 |
| `1086061775432017340256300.387` | 789970 | 193045 | 405 |
| `1086061775432017340256300.596` | 179145 | 70602 | 179 |

Fresh local PARI 2.17.4 debug traces use seed 1 and `bnfinit(polynomial,1)`.
Their returned class numbers and invariants agree with the frozen references.
PARI's `small_norm` counters report, respectively, 7319, 50395, 168377, and
71221 factorization attempts, summing all search passes. The associated smooth
proposal counts are 190, 1122, 1229, and 805. The raw traces are retained;
their CPU timers are not controlled timing evidence.

The counters have related but nonidentical meanings. PARI increments its
attempt counter after primitive/nonscalar filtering and before `factorgen`;
it counts smooth proposals before its relation-admission test. Sage.js's
principal-relation entry includes its own content removal, norm computation,
and possible unit handling. The ellipsoid counter includes rejected points.
These counts therefore support investigating cost per candidate and lattice
maintenance, not claiming identical searches or dividing unrelated counters
to obtain an exact overhead ratio. Similar final relation-matrix dimensions
alone would have established even less.

### Checked word-prime trial-division ablation

The tracked `bench/class-unit-groups/cubic-word-prime-ablation.py` changes one
statement in `_cubic_append_smooth_principal_relation`:

```python
rational_prime: uint64 = checked_uint64(workspace[group_base])
```

This is justified by the existing root guards: $2\leq p\leq B$, where the
generator bound $B$ is checked against the search limit, at most 4096. The
conversion checks overflow rather than truncating. Norms, prime valuations,
and exact divisions remain arbitrary precision. There is no change to which
integers are smooth or to any ideal, relation, or certificate decision.
Unsupported input to the research transformer is rejected; it is not a
general proof that an arbitrary caller supplies a valid factor base.

The pinned compiler already lowers an exact integer modulo a `uint64` divisor
to `integer.mod_uint64`. Inspection finds exactly one such operation in the
changed helper, versus zero in the composed baseline. Both are isolated,
source-transparent native programs; no new compiler rule or C implementation
was introduced. The source copy is 591450 bytes, SHA-256
`9dd21f7ad6a9e57b936eb694bcaf6d91263041a5822d57740bf7f7a48086f13f`,
native key
`2dbbb04ed32ecff1c2cac4cd75abc6a9a8663f68178735e8251dac0c7243909d`.
Its generated core is 16890108 bytes. Running the tracked transformer on the
composed source reproduces this exact source hash.

The focused test proves that reversing this one annotated assignment restores
the entire original AST. It executes the actual extracted trial-division loop
on 360 exact cases, including 2048-bit norms, high valuations, and divisors
near the word boundary, and checks overflow rejection. All 27 full GMP and
tagged ledgers remain identical; two full JavaScript controls also agree. The
compiler foundation's two existing exact/word-buffer tests additionally pass
their IR, generated-core, CPython, GMP, tagged, and JavaScript checks.

Fresh dedicated `opt` paired timings use the same five-sample protocol:

| Field suffix | Composed baseline, median ms | Word prime, median ms | Speedup |
| --- | ---: | ---: | ---: |
| `341970033803678280.6` | 357.155 | 350.103 | 1.020 |
| `1086061775432017340256300.1013` | 11611.136 | 11588.479 | 1.002 |
| `1086061775432017340256300.387` | 14636.340 | 14517.587 | 1.008 |
| `1086061775432017340256300.596` | 9596.026 | 9536.496 | 1.006 |

This is a small experiment, not a demonstrated substantial or durable gain.
In particular, sub-percent changes on the larger fields do not establish a
meaningful speedup. Keep it as a reproducible representation ablation, not a
production change or the explanation of the remaining PARI gap. Native CPU
sampling below separates this negative result from two larger opportunities.

## Factor-group scans and exact index conversions

Native sampling of the composed closure on
`3.1.1086061775432017340256300.1013` identifies a representation-cost lead.
The successful V8 profile contains 11,194 leaf-PC samples, 10,483 in the exact
native addon; only nine addon samples remain unresolved. Symbolization uses
the live `/proc/self/maps`, the exact unstripped addon, and its `nm` symbol
ranges. The executable ELF load segment has matching file offset and virtual
address, validating the recorded PC-to-symbol adjustment. These are **leaf
samples**, not exact clocks or inclusive per-caller attribution.

Among native samples, `__gmpz_sizeinbase` accounts for 20.88%, `__gmpz_export`
11.90%, `__gmpz_add` 11.62%, and the smooth-principal-relation helper itself
9.39%. `sagejs_native_integer_vector_mpz_index` accounts for another 3.79%;
`__gmpz_mul` accounts for 1.03%. Size/export calls have other consumers too:
the profile alone does not assign all their cost to indexing. The separate
source ablation below tests that hypothesis directly.

The profile uses unchanged composed source with compiler `profileSymbols`
enabled. Its addon SHA-256 is
`1b4abbfbc2b71ed3aa060746f741ddb40df17570127b1bcd9e19cb8648a61022`;
the successful raw log hash is
`c152b96e840b28c269cb408e356fbe6a9716d1a5028e98b61f3274a8531e5a14`.
The complete field output and parity counters still match the frozen ledger.
Earlier `gprofng` attempts are explicitly unusable: collector/preload failures
and SIGPROF-handler conflicts omitted most computation. Their apparent BLAS
hotspot is not evidence and is not used here.

### Two isolated ordinary-Python transformations

`bench/class-unit-groups/cubic-factor-scan-ablation.py` provides independent
`indices` and `ranges` modes. Both operate on inspectable source copies;
neither changes production dispatch or the production source allowance.

**Word offsets.** The compiler preserves exact integer promotion in expressions
such as `factor_base + 7`, even when `factor_base` is a `uint64`. In this helper,
eight workspace reads and two writes consequently use arbitrary-precision
indices and their conversion/bounds-check path. Replacing the ten positive
offset literals with explicitly typed `uint64` locals makes every workspace
index in the helper machine-sized: ten reads and five writes. The root's
bounded layout ensures these particular sums fit. This is not authorization
to change general Python addition into wrapping or overflow-raising word
arithmetic. A general compiler improvement must preserve negative indexing,
exact promotion, and exception semantics independently of this experiment.

**Group ranges.** For every rational prime, the root sets `group_factor_start`
before appending its factors, then stores that start and the number appended
in the group record. Each appended factor receives the same group identifier.
The resulting disjoint contiguous ranges partition the factor records.
Subsequent visitation ordering does not physically permute them. Hence a scan
that filters all factors by this group identifier visits the same relevant
factors, in the same order, when restricted to the stored range. Both existing
group-equality tests and auxiliary-factor tests remain in place. The new code
checks nonnegative start/count and an exact end bounded by `factor_count`
before converting endpoints to machine indices. An invalid range returns the
existing fatal sentinel above relation capacity.

For $G$ groups and $F$ factors, the two full scans cost $2GF$ factor visits
per smooth candidate absent early rejection. Using the partition costs $2F$
visits plus $O(G)$ checked range setup. Norm trial division, ideal-power
membership, residual auxiliary valuations, relation admission, and all
certification conditions are unchanged. Bounds checks do **not** establish
partition completeness for an arbitrary caller: root construction is an
essential precondition. No untrusted detached group table is newly accepted.

The source hashes are:

- Baseline: `f5aaecbde89ffbe20eb7d7947dd6231b4fcf53b57f754223b965f7aea8addb5b`.
- Indices: `9475276ad74ee4f24b01c48d197d0b72b06ab08fd32305bfd392034dfcb7c271`.
- Ranges: `4418fef4f5cdb0ef85628bf75f8f443ac5262766de299d0c49f1eb699f659f95`.

The tracked transformer reproduces both measured source hashes exactly.
Generated core sizes are 17,168,611, 17,110,591, and 17,066,196 bytes,
respectively; all three retain source-transparent IR and isolated cores.
The variants do not enlarge arena/workspace capacities or alter ownership.

### Exact comparison scope

Each variant independently matches all 27 complete frozen development ledgers
on GMP and tagged execution, plus two JavaScript controls. The checks include
every output word, relation, element, factor record, basis record, unit
exponent, return value, and parity counter. This establishes equality with
the research baseline on those inputs, not public mathematical certification
or cross-platform qualification.

The focused factor-scan checker extracts and executes the actual group loop
under exact modeled valuations. Across 2,500 deterministic cases it checks
identical complete workspace mutations and ideal-power/membership call order,
including zero valuations, auxiliary factors, rejected relations, and excessive
valuations. It additionally checks 250 malformed ranges fail closed. This is
a scan-equivalence test with modeled ideal arithmetic, not a substitute for
the full native comparisons. On the research source, modeled workspace reads
fall from 3,148,281 to 457,623. The checker also runs against the production
helper's different power-storage implementation, rejects repeated/ambiguous
transformations, and tests Unicode-safe source offsets.

The actual composed online-HNF caller was separately checked against SymPy
on 4,845 insertion prefixes and two hint policies. Exact HNF, support flags,
and index-one status agree; 2,913 prefixes change the lattice. Sentinel
objects prove the obsolete source/reduced matrices are never touched, and
the original relation rows remain unchanged. This extends the insertion-only
oracle to its real online-update caller.

### Controlled three-way timings

The dedicated `opt` VM ran the unchanged composed baseline and each isolated
variant on CPU 2 under the exclusive timing lock. There was one warmup per
implementation followed by six rounds using all six permutations of the
three implementations. Thus each implementation occurs twice in every order
position. All sources and binaries were staged before timing; no compilation
or uploads overlapped measurement. Inputs were preallocated; the complete
native call and cleanup were timed, with full ledger and parity checks after
each call, outside timing. Every check passed.

Medians below are milliseconds; the field labels have prefix `3.1.`:

| Field suffix | Baseline | Word indices | Group ranges | Index speedup | Range speedup |
| --- | ---: | ---: | ---: | ---: | ---: |
| `341970033803678280.6` | 347.921 | 244.898 | 232.270 | 1.421× | 1.498× |
| `1086061775432017340256300.1013` | 11370.049 | 5429.465 | 3488.508 | 2.094× | 3.259× |
| `1086061775432017340256300.387` | 14300.597 | 8281.825 | 7124.813 | 1.727× | 2.007× |
| `1086061775432017340256300.596` | 9249.727 | 5193.547 | 4086.300 | 1.781× | 2.264× |

Each variant's observed sample range is disjoint from the baseline's on every
field. For example, `.1013` has baseline 11335.5–11383.2 ms, indices
5407.6–5447.3 ms, and ranges 3473.2–3494.9 ms. This is not the sub-percent
word-prime result: source-level index representation and unnecessary group
scans are both substantial costs on these larger workloads.

Raw `timing-results.json` SHA-256 is
`2572a483862a6784147b263b1adf18087b6ed484e8cf5f8616af931acf2569ab`.
It records the runner, inputs, source and native binary hashes, sample orders,
host identity, and all samples. Both variants improve independently; their
benefits must not be multiplied or presumed additive. A combined variant is
not part of this run.

These are still **before/after research computation timings, not PARI wins**.
The previously recorded PARI values on these fields are about 44, 777, 821,
and 824 ms, respectively; those are contextual earlier measurements, not a
fourth implementation freshly interleaved in this experiment. There is still
a material gap. The next useful work is to compose the changes, reprofile the
remaining cost, test new fields and limits, and turn the index finding into a
general semantics-preserving compiler improvement through the compiler lane.
Production integration must retain the exact range invariant and independently
complete publication, resource, and platform qualification.

The five focused source/valuation/HNF/residue tests pass after formatting.
Merge invariants and direct documentation checks pass. The existing runtime
build passed before the final research-only scripts/documentation additions;
it is not an exact-final-metadata build claim. The broader `test:changed` run
passed 196 unit files and rebuilt successfully, then stopped at five existing
FFLAS/igraph failures in `test/ffi.cjs`, leaving 583 files unstarted. The fresh
architecture run passes native/FFI/resource checks but still fails the same
stale optimizer-opportunity manifest. These are not whole-suite passes. PR
#203 remains draft, and production source remains 480241/485000 bytes.

The sources, generated cores/headers, full comparison ledgers, profile log,
symbol table/load segments, and timing records are hash-archived under
`build/cubic-analytic-schedule-evidence/factor-group-scans`: 162 files,
392,204,462 original bytes and 21,564,037 gzip bytes. Each compressed file was
round-trip verified. The archive manifest SHA-256 is
`6ce70f31bb28277259e7933e53125ff90972f44ebd12b1029c5025643ae79bb6`.
The duplicate Node executable and unusable `gprofng` experiment directories
are excluded; their limitations are recorded rather than treated as evidence.

## Composed factor scans and wider-field extension (2026-09-10)

The `combined` mode of `cubic-factor-scan-ablation.py` now applies checked
group ranges and then types the twelve relevant offsets, including the two
new group-range reads. Its source SHA-256 is
`7774843b367034cf4a76764f140fcb5797136ec1c4ee6f68e038aaa0c44c495c`
(592,374 bytes), with native build key
`dee64aa1c0e24b921e89f5600203852ae6e7dd601e817194da6fa6b97c3d1242`.
This remains a generated research closure, not the registered production
source or permission to increase its source allowance. No bounds, candidate
order, relation policy, or acceptance predicate changes.

The actual-loop oracle additionally checks the composition on all 2,500 cases
and 250 invalid ranges. Complete comparison passes on all 27 frozen GMP and
tagged development ledgers and two JavaScript controls. Five focused
scan/valuation/HNF/residue tests pass after formatting.

A completed controlled run on exclusive `opt`, CPU 2, uses one warmup and
six balanced-order rounds per field, with the same preallocated-input,
complete-call/cleanup timing and outside-timing full-ledger/parity checks as
the preceding experiment. Node is 26.7.0 on AMD EPYC 7B13. Every comparison
passes. Median milliseconds, with field prefix `3.1.` omitted:

| Field suffix | Baseline | Group ranges | Ranges plus word offsets |
| --- | ---: | ---: | ---: |
| `341970033803678280.6` | 349.315 | 234.234 | 206.912 |
| `1086061775432017340256300.1013` | 11346.800 | 3471.834 | 3018.972 |
| `1086061775432017340256300.387` | 14273.237 | 7107.563 | 5986.413 |
| `1086061775432017340256300.596` | 9256.416 | 4120.400 | 3603.082 |

The composition improves on group ranges alone on every measured field;
their observed sample intervals are disjoint. These are measured combined
gains, not products of isolated speedups. PARI was not freshly interleaved
in this run; its earlier timings remain substantially faster. Raw timing
report SHA-256:
`d13e03f6deb6fdd303e496d15834e32d6b6c7b7a8ef63af597049e7957dcf158`.

### Frozen extension beyond the native development panel

Before running either variant, freeze 20 additional complex cubics from the
existing LMFDB corpus, excluding all 27 native-development fields. Select by
SHA-256 of `factor-scan-extension-v1:LABEL` within prior PARI runtime bands:
six at 10–99 ms, ten at 100–499 ms, and four at 500 ms or above. This is an
extension beyond that native panel, **not** a claim that no prior Sage.js
survey ever touched these fields. Missing LMFDB answers remain missing;
hashed PARI records are comparison references, not certificates. Panel hash:
`fb46c2bd475b824eeb05f9b303f6821b56ad34e7008ddd0c8ab7c41f031da9ba`.

The local serial run retains every field and enforces a 90-second subprocess
timeout per variant. It uses factor capacity 512, search limit 4096, effort
5, and shape-probes before allocating the exact logical transcript shapes.
It is correctness/coverage evidence, not controlled performance evidence.
All 20 baseline/composed full observations agree; there are no subprocess
timeouts. Sixteen reach research phase 96 with classifier 1 and agree with
PARI's class number. The other four are retained explicitly:

- `3.1.15898963521669228.17`: classifier 0, relation index 52,488,
  whereas PARI reports class number 26,244. No success is claimed.
- `3.1.1086061775432017340256300.428` and `.163`: phase 44,
  output slot 62 equal to 11. This slot is reused for both ideal indices
  and reconstruction statuses, so the value alone does not identify the
  failure. Pinpointing the failing branch requires a fresh trace; it is not
  permission to certify or silently retry with weaker checks.
- `3.1.12627147759764869116703083.1`: matching `RangeError`,
  `number-field analysis projection is invalid`, before a result is produced.

Independent exact replay of the new detached relations, compact unit logs,
and presentation Smith invariants is underway separately. It is not included
as a completed qualification claim in this checkpoint. That checker proves
principal equalities and unit/log facts in the supplied order; it does not
by itself prove maximality, unit fundamentality, or the full class group.
Public acceptance remains false throughout this research harness.

The completed experiment's sources, drivers, ledgers, generated native core,
binary, manifests and timing are round-trip hash-archived in
`build/cubic-analytic-schedule-evidence/combined-factor-group-scans`:
68 files, 173,527,571 raw bytes and 15,991,097 compressed bytes. Archive
manifest SHA-256 is
`a07d16a8579328bbb816c3cb03e3ccb6d4c92d9986dd782ed801dda9c5c6ace8`.
The live partial replay report is deliberately excluded; its driver is
included. Production/public/platform qualification and residual profiling
remain open. Generic constant folding in PR #202 is separate from the
runtime-base-plus-offset issue isolated here.

## Rank-discovery admission and traversal limits (2026-09-10)

An instrumented copy of the composed closure identifies both phase-44
extension failures at the guard following `_cubic_resume_powered_rank_search`
(original composed source line 13548). The diagnostic changes only two output
slots to record exit locations; all other outputs and parity counters match.
This is not a root-isolation failure: slot 62 alone was ambiguous.

The powered search used the same `limit` for two different contracts:

- The admission target is $\min(F+6,C)$ for missing-rank search, where $F$
  is the factor count and $C$ the physical relation capacity. Independent
  parity rows can legitimately extend the ledger beyond that ordinary target.
- The enumeration loop also required `relation_count < visit_limit`, with
  `visit_limit` set to that admission target. At or beyond the target, it
  visited no candidate and the caller rejected its zero-work return.

For `3.1.1086061775432017340256300.428`, $F=474$ and the stalled ledger has
481 rows; for `.163`, $F=432$ and the ledger has 438 rows. Both trigger this
zero-visit condition. No new analytic bound or special field treatment is
needed. `cubic-rank-search-budget.py` separates the rank-discovery traversal
limit from admission: it uses physical capacity for traversal, retaining the
original dependent/parity admission predicate. Quotient-mode four-row batches
retain their original limit. Physical capacity, candidate cap, virtual work
budget, exact support-change stopping, and all certification checks remain.
The transformation mechanically restores the original source when its two
edits are undone, and rejects repeated or ambiguous application.

This is a scheduling correction, not a proof that more relations will always
suffice. All newly retained rows still require the same exact principal-ideal
checks; modular pivots only guide discovery. Exhaustion remains inconclusive.
Neither a larger relation ledger nor a modular rank observation grants public
proof authority.

The focused test executes the extracted actual powered-search helper with
modeled owners and enumeration: 320 over-target states reproduce the old
failure and make progress after the fix, 192 ordinary states are unchanged,
and 512 quotient-mode states are unchanged. Capacity/work exhaustion and
malformed transformations are checked. This is a control-flow oracle, not a
replacement for the mathematical relation checker.

The compiled research source hash is
`ee5f4ff978b4b8980ea99d7a3eeb81199cc4d3d01187a4c99d0792a848fb0330`,
with build key
`3814a1dee3f2dd10d96643e8ddda80089f121541d1029c5dabc88ab7af7cc362`.
All 27 previous full GMP/tagged ledgers and two JavaScript controls remain
identical. Both newly progressing fields agree across GMP and tagged on all
64 output words, complete detached ledgers, basis, unit exponents and parity:

| Label suffix | Presentation shape (relations × factors) | Order | Nontrivial Smith invariants |
| --- | ---: | ---: | --- |
| `.428` | 524 × 474 | 19,683 | nine factors of 3 |
| `.163` | 470 × 432 | 5,629,338 | eight factors of 3, then 858 |

Independent exact replay passes for both: order closure, prime-ideal data,
principal relations, compact unit cancellation, rational log enclosures, and
presentation Smith invariants. The orders/invariants agree with the hashed
PARI reference records. The original 180-second replay attempts timed out
after producing checked HNF witnesses; these failures are retained. A second
replayer independently verifies the saved witnesses against the input rows,
then removes all trivial unit-row factors in one step. It completes both
checks locally in approximately 23 and 21 seconds. These are verification
durations, not controlled class-group computation benchmarks.

Specifically, with columns $A$ the original relations, an untrusted PARI
`mathnf` call proposes an upper column HNF $H$ and an integer matrix $C$.
The checker proves $AC=H$ and checks integral triangular back-substitution
for every column of $A$. These are both lattice inclusions; neither the
native class number nor a guessed determinant is used to establish them.
Canonical upper HNF additionally has $0\le H_{ij}<H_{ii}$ for $i<j$.
Consequently any diagonal-one row is exactly a coordinate unit row. Integral
column operations clear its column without altering other entries, so deleting
all such rows and columns at once preserves the cokernel. Smith computation
then runs on the small retained matrix instead of repeatedly copying a large
matrix for hundreds of trivial factors.

The successful replayer SHA-256 is
`904089320d2e991661efd74553882d26dc652cd8a32affe9caeac9b553b8b2c4`.
The existing compact-unit checker is unchanged at
`795d171c6988ae3c80d8a1520011e4d2d12213f32427b069c8f2f74053f44b26`.
These facts do **not** prove order maximality, unit fundamentality, or the
complete class group independently. Public acceptance remains false. The
production source, allowance, and resource contracts are untouched; controlled
timing, consolidation, and public/platform
qualification remain open.

The full frozen 20-field extension rerun also completes without child-process
timeouts: the two rank failures now progress, and every complete observation
on the other 18 fields is unchanged. Thus 18 research classifier-one class
numbers match PARI; the doubled-index case and projection error remain
unresolved. This is not 18 public certificates, nor a timing comparison
against the old fast-but-unsuccessful rank-search returns.

Completed trace, source, generated code/binary, native ledgers, both timed-out
and successful fixed-field replay records, HNF witnesses and reference hashes
are archived under `build/cubic-analytic-schedule-evidence/rank-discovery-budget`.
The 63 files occupy 333,159,217 raw bytes and 33,510,828 gzip bytes; every
compressed file was round-trip hash-verified. Manifest SHA-256:
`cc32f1b8346062d32aa53d2b634d18f478250cad8322a0816ab8384aeb779f8e`.
The separately running wider replay is not counted as complete in this archive.

### Completed extension replay and residual profiles

The wider replay has now terminated. Its naive dense-HNF version retained
nine replays, eight timeouts and three unresolved native results. The checked
HNF-witness version completed 16 replays, with one timeout and the same three
unresolved results. The final timeout, `.361`, also disappears when the
canonical diagonal-one rows are removed in one batch: independent replay of
its saved witness completes in about 18 seconds, with presentation order
40,861,908 and invariants eight factors of 3 followed by 6,228.

Combining that checked result with the two corrected rank-search fields
completes replay for **19 of the 20 current extension presentations**. Eighteen
have class numbers and invariants matching the hashed PARI references. The
remaining replayed presentation is the explicitly unaccepted doubled-index
case; the twentieth input still raises the analysis-projection error.
The consolidation script checks every replay input hash and exact equality
of the complete current ledger against the replayed ledger, including field
data, all output slots and parity counters. It does not silently reuse a
replay merely because the class number matches. Consolidated report SHA-256:
`b5072a856371e8db6f505f8da981d9b7388d87c9f7fc82edd91e2e9c6a6b63ab`.
Maximality, fundamentality and complete class-group proof remain explicitly
false in these independent reports.

Two new local V8 leaf-PC profiles use a symbolized build of the corrected
source, key
`db2e107ebbf4574bc1f5e86771edacea8c8100c705bcb6844ad2655f92e857bb`.
Both runs compare the complete result with the original frozen development
ledger. Exact addon hashes, captured executable mappings and symbol ranges
bind the sampled PCs to functions. These profiles are not controlled timings,
inclusive call trees, or mathematical operation counts.

For field `.387`, 5,026 of 5,945 samples land in the native addon; 28 native
samples remain unresolved. For `.1013`, the corresponding counts are
2,594/3,322, with 12 unresolved. Among native samples, GMP limb inversion
accounts for 11.6%/8.1%, integer copying (`mpz_set`) 8.8%/6.6%, and limb copying
7.5%/6.2%, respectively. Division/remainder operations also remain prominent.
Leaf samples in smooth-principal-relation and online-lattice-update helpers
identify useful candidates for subsequent inclusive phase instrumentation,
but do not attribute the shared GMP expense to either caller. The earlier
word-prime trial's near-tie still argues against assuming that changing one
trial-division operand type will remove this whole residual cost.

The completed profiles, exact symbolized native artifacts, all HNF witnesses,
replay outcomes and consolidation are separately round-trip hash-archived in
`build/cubic-analytic-schedule-evidence/residual-profile-replay`: 46 files,
258,281,559 raw bytes and 42,806,090 gzip bytes. Manifest SHA-256:
`5d5d5e107b08e8e46f1c0a06711ae40a0e807f02c3843e0ee798b603a392988b`.
Next distinguish collection, lattice maintenance, and certification costs
with phase-level evidence before selecting another general optimization.

### Exact prime-support rejection before individual valuations

Inclusive, local diagnostic instrumentation now separates the costs that the
leaf profiles could not. On `.1013`, 56,551 smooth-principal-relation calls
consume 0.964 s inclusive (0.871 s exclusive), and 430 online HNF updates
consume 0.960 s, in a 3.111 s instrumented root call. On `.387`, the respective
counts/times are 193,045 calls and 2.596 s (2.513 s exclusive), and 404 HNF
updates taking 0.978 s, in a 5.918 s root call. These are single local runs
with clock instrumentation, not controlled performance measurements. Every
run compares the full transcript and the exclusive counters sum to the root.

Seeded PARI 2.17.4 `bnf` debug traces visit 50,395 candidates on `.1013` and
168,377 on `.387`, with 1,122 and 1,229 smooth candidates, respectively.
The candidate counts are comparable, not separated by orders of magnitude.
PARI's `src/basemath/buch2.c`, `can_factor`, first calls `Z_ppo(N, F->prodZ)`
before factoring an integer norm. `src/basemath/base4.c`, `Z_ppo`, repeatedly
takes a gcd and divides it out. The extracted 2.17.4 source and raw traces
are retained with the experiment. Unlike PARI's preceding rounded embedding
norm calculation, this ablation retains our exact norm-form evaluation.

The ordinary-Python transformer
`bench/class-unit-groups/cubic-prime-support-ablation.py` inserts the same
prime-support criterion before the existing trial-division loop. Its default
uses the existing Euclidean `_cubic_gcd`; `--gcd flint` uses the already
declared `sagejs.ffi.flint.fmpz_gcd` only inside the new filter. Neither option
changes any other gcd call, factor-base selection, candidate order, admission
predicate, ideal-valuation check, or certification condition.

#### Mathematical and storage contract

Let $P$ be the product of the rational primes represented in the factor base
and let $N>0$ be the exactly computed absolute principal norm. Starting with
$x=N$ and $g=P$, repeat $g\leftarrow\gcd(x,g)$ and, if $g>1$, replace
$x\leftarrow x/g$. Each division is exact and strictly decreases $x$.
No prime outside the support of $P$ is ever removed. Conversely, a prime
dividing both the remaining $x$ and the original $P$ continues to divide the
current $g$: it cannot disappear from the gcd while its exponent in $x$ is
positive. Consequently, when the gcd becomes one, the remaining $x$ is
coprime to the original $P$. The original norm is supported on the factor
base exactly when this residue equals one. Repeated prime powers in either
input are allowed. This criterion needs **no GRH assumption**.

A rejection therefore proves that the principal ideal cannot factor over
the existing ideal factor base. A pass is only permission to run the old
exact valuation and ideal-membership checks; it is not a relation or a class
group certificate. Norm one retains its existing unit path; zero or invalid
norms remain rejected. The filter explicitly rejects nonpositive inputs.

The product is computed once after factor-base construction and resides in
one new exact arena entry at `layout.norm + 10`. The ten existing norm-form
coefficients occupy offsets 0 through 9. The compound workspace starts one
entry later and `layout.entries` grows by one, so no guessed unused padding
or overlapping storage is used. The product is immutable during collection.
All existing arena, candidate, relation, and output budgets remain unchanged;
allocation exhaustion still fails closed. Rejected candidates no longer
overwrite the transient group valuation slots. Thus the claim is equality
of externally observable transcripts, not byte identity of private scratch
state or identical cache-preparation work. Successful candidates still
overwrite every group valuation before the detailed checks read them.

Both source variants compile with the pinned private-layout compiler
`8cd09c4484cddfcf7024b5169a4c18fa0b07d3f0`. The default source SHA-256 is
`8d4d845c72474dd5424834140b5bcd81cdb3c7a4624e5073e7f1cd00dbf1fc05`;
its key is
`25838e7e5d68a94c3ed41e352fde2163fe9b85bcb0c9496f135ab439feb8a399`.
The default research source is 594,121 bytes; generated core grows from
16,617,213 to 16,774,273 bytes. Both native addons are 20,779,632 bytes.
Production source remains 480,241/485,000 bytes: this is **not** a source
allowance increase or production promotion of the larger research closure.

The 12,288 deterministic positive-integer tests compare the criterion with
trial division, including non-squarefree products, missing primes and large
prime powers. Additional tests cover empty support, invalid inputs, source
insertion guards, and continued detailed checking after a successful filter.
The default variant preserves every full ledger in all 27 development fields
in both GMP and tagged native execution, plus two JavaScript controls. All
20 frozen extension observations also match the rank-corrected baseline,
including its unaccepted doubled-index result and analysis-projection error.
The previously replayed 19 presentations are not new independent replays:
the complete replay inputs are unchanged, not merely their class numbers.

#### Controlled default-filter measurement

On exclusive `opt` CPU 2 (AMD EPYC 7B13, Node v26.7.0), one warmup followed
by six alternating-order paired rounds gives these median times. Inputs are
preallocated; each entire native call and arena cleanup is timed; full
transcript and parity checks run outside the timed interval.

| Label suffix after `3.1.` | Before | Exact support filter | Speedup |
| --- | ---: | ---: | ---: |
| `341970033803678280.6` | 205.43 ms | 188.47 ms | 1.09x |
| `1086061775432017340256300.1013` | 3029.26 ms | 2453.37 ms | 1.23x |
| `1086061775432017340256300.387` | 6063.93 ms | 4352.98 ms | 1.39x |
| `1086061775432017340256300.596` | 3650.36 ms | 2920.73 ms | 1.25x |

The slowest filter sample is below the fastest baseline sample on every
field. Raw timing report SHA-256:
`702391ca0f95fa56508d134c8eec4138acfaa438cf89b14f0651b462f295340f`.
This run also measured the system `/usr/bin/gp`, which is **PARI 2.15.4**, not
the 2.17.4 executable used in the forensics. Its separately batched, seeded
polynomial-to-`bnfinit(f,0)` medians were 48, 476.5, 382, and 349.5 ms.
Those are version-labelled additional observations, not replacements for
earlier 2.17.4 timings or evidence of a PARI win. GP startup is excluded;
its internal wall timer has millisecond resolution. The research native
program still does not publish complete class-group certification.

Focused tests and merge checks pass. The wider architecture gate still
fails at the branch's pre-existing stale optimizer-opportunity manifest;
it is not reported as passing or repaired by refreshing unrelated metadata.
The next ablation compares the two gcd implementations and measures the
explicit PARI 2.17.4 executable. Residual online HNF and root-exclusive work
remain significant targets after smoothness rejection becomes cheaper.

That second ablation is now complete, with the same warmup, paired sampling,
CPU affinity, exclusive lock, complete-ledger checks, and separately batched
PARI protocol. In this table both native columns already contain the exact
prime-support filter; only its gcd implementation differs.

| Label suffix | Euclidean gcd | Declared FLINT gcd | PARI 2.17.4 |
| --- | ---: | ---: | ---: |
| `341970033803678280.6` | 189.45 ms | 181.70 ms | 25 ms |
| `1086061775432017340256300.1013` | 2458.33 ms | 2442.98 ms | 205 ms |
| `1086061775432017340256300.387` | 4329.09 ms | 4135.31 ms | 365 ms |
| `1086061775432017340256300.596` | 2970.71 ms | 2903.48 ms | 248 ms |

The gcd substitution adds about 4–5% with disjoint sample ranges on `.6`
and `.387`. The ranges overlap on `.1013` and `.596`; their smaller median
differences are not strong evidence of a win. The principal improvement is
the mathematical prefilter, not this choice of gcd implementation. Both
variants remain available for reproducible comparison instead of declaring
the FLINT version universally faster.

The explicit PARI executable is
`/tmp/cubic-parity-admission-5U8qem/gp`, version 2.17.4; the timing report binds
its binary hash. Seed 1 is reset before every fresh `bnfinit(f,0)`, with a
512 MiB maximum PARI stack. The return value's class number and invariants
are checked each time. These are fresh, version-labelled observations, not
a cross-version speedup claim: the preceding parity campaign used the same
seed but `bnfinit(f,1)`, a 512 MiB initial stack, and three calls per sample.
Neither these four fields nor these fixed-seed runs
establish performance across the full cubic population. On this protocol a
roughly 7–12x native/PARI gap remains, so the overall goal is still open.

FLINT-filter source SHA-256:
`e04f8428b2dea0799e2676ea7e5a2f3891abf29e0fc60deb16e6ebeba52ea902`;
key `8ab4f2468ba58946edac260cd0d1e08276d1f08949093971bedca9e5c2f0e439`.
Its generated core is 17,112,454 bytes and directly invokes the declared
`fmpz_gcd` from the isolated native body. No host callback or new handwritten
mathematical routine is introduced. All 27 GMP/tagged development ledgers,
two JavaScript controls and all 20 extension observations are again equal
to the baseline, including the unresolved results. The tracked transformer
reproduces both compiled Python sources byte for byte. Second raw timing
report SHA-256:
`a5e261b354f58ccbf7bd6ee86e605bb3562f47d467d36da96b6ca2fa6a861c4c`.

The two native variants, full transcripts, generated IR/core/binaries,
timing runners, baseline and replay identities, inclusive instrumentation,
raw PARI traces and relevant PARI source are round-trip hash-archived under
`build/cubic-analytic-schedule-evidence/prime-support-filter`: 128 files,
444,869,383 raw bytes and 65,085,879 gzip bytes. Manifest SHA-256:
`ba66e5c773abfed62d5a431096f671a15eed28130a613ba4f0fdf9a00e2fde29`.

#### PARI flag control: do not confuse retained algebraic data with class invariants

A final dedicated control pins both PARI executable and shared-library
hashes, uses the same 512 MiB initial stack for both flags, and alternates
six fresh seeded calls after warmup. Median milliseconds for flags 0/1 are
24/49 on `.6`, 201/918 on `.1013`, 356/923.5 on `.387`, and 250/962 on
`.596`. Every call agrees on the class number and invariants. The shared
library hash is
`b7856e5e6ed098f816c122fc8116f1b1cb27776da77d6fe3eba66a901c1515eb`;
the installed library resolved by the preceding run and the explicitly
pinned copy have this same hash. Control report SHA-256:
`c330b46148974021b7e656370650addc9e1a1741372fe9b22946771d81b58897`.

This distinction is documented by
[PARI's `bnfinit` contract](https://pari.math.u-bordeaux.fr/dochtml/html-stable/General_number_fields.html#bnfinit):
flag 0 can use floating embeddings in place of exact algebraic data and is
appropriate when only class-group invariants or the regulator are wanted;
flag 1 retains exact algebraic data, including compact units, for subsequent
operations. Both use the same default GRH assumption. Thus the class-number
performance target must include flag 0, while certificate/compact-unit work
also needs a separately labelled flag-1 comparison. This experiment does
not establish which internal operation accounts for the entire flag gap.

Subsequent **local diagnostic** flag-1 traces narrow that question. They keep
exactly the same candidate and smooth counts as the flag-0 traces. On
`.1013`, `hnfspec` accounts for 652 ms versus the earlier 96 ms with flag 0;
on `.387`, it accounts for 491 ms versus 93 ms, with additional HNF updates
also more expensive. These diagnostic clocks are not the controlled table
above and do not support precise cross-run phase ratios. They do identify
where most of the observed flag cost appears, rather than attributing it
to more relation search or discriminant factoring.

The source explains a structural difference: at the first HNF reduction,
`Buchall_param` sets `C = flag ? matbotid(&cache) : embs` before calling
`hnfspec_i`. `matbotid` constructs integer identity columns indexed by the
retained relations. Flag 1 later combines the transformed integer columns
with embeddings and retains them for exact compact-unit reconstruction;
flag 0 transports the much smaller embedding data instead. This motivates
an explicit next experiment: separate our invariant computation from the
cost of constructing its exact witness, and test whether compact/lazy
transformation data can preserve exact replay while reducing HNF work.
Dropping the witness or accepting an uncertified floating result is not
the proposed optimization.
