# Cubic residue scales: exact audit and scheduling experiment

This is a correctness correction and a diagnostic experiment, not a new
performance or release qualification. Historical timing reports at $X=997$
remain historical measurements, not evidence that their analytic enclosure
satisfied the theorem contract.

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

## Validation status

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
