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
