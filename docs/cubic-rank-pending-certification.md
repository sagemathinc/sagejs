# Rank-pending relation retention and earlier exact certification

## The scheduling obstruction

A row target is a place to attempt certification, not evidence that subsequent
dependent rows are useless. The previous smaller-prefix experiment used
$n+2$ instead of $n+6$ retained rows, where $n$ is the factor-base size.
If the target was reached before full modular rank, the admission filter
discarded modularly dependent proposals while seeking the remaining pivots.
Resuming the traversal after a failed certificate did not revisit those
proposals. The traversal cursor was correct; the admission policy lost useful
integral information.

For $x^3+189x-298$ (LMFDB `3.1.816744.1`, equation-order index $6$), the
experimental smaller prefix lost the principal element with integral-basis
coordinates $(-98,65,0)$ and factor-base valuation row

$$
v=(1,0,0,1,0,1,0,0,0).
$$

The final retained lattice in that unsuccessful experiment had index $80$.
Its column HNF $H$ has diagonal $(40,1,1,1,1,2,1,1,1)$, first row
$(40,2,26,28,34,26,29,29,22)$, and zero off-diagonal entries in the remaining
rows. In particular,

$$
H^{-1}v=(-1,0,0,1,0,\tfrac12,0,0,0)^T.
$$

Thus $v\notin H\mathbf Z^9$ but $2v\in H\mathbf Z^9$. Adjoining the
discarded relation reduces the lattice index from $80$ to $40$. The failed
index-$80$ certificate was a correct refusal, not an incorrect class number.
The relation-admission trace and an independent exact HNF calculation identify
the lost row; a public receipt replay separately checks the number-field
meaning of the retained relations and the complete certificate.

## General change and mathematical authority

Keep nonduplicate dependent rows while modular rank is incomplete, even if
the certification target has been reached. Once both target and full rank are
reached, the existing collector pauses for exact closure. In the existing
bounded staged regime, try $n+2$ first and retain the existing larger retry.
No field coefficients, class numbers, or expected answers enter this policy.

Let $L\subseteq R\subseteq\mathbf Z^n$ denote the collected relation lattice
and the actual principal-relation lattice for the certified factor base.
Retaining an additional exact principal relation replaces $L$ by
$L+\mathbf Z v\subseteq R$. It cannot invent a relation or weaken the
generator theorem. Linear dependence modulo the scheduling prime $27449$
does not imply integral membership in $L$. Modular rank remains scheduling
information only: exact HNF, unit reconstruction, and the existing rigorous
analytic index-one certificate still authorize every accepted result.

All existing assumptions and numerical certificate precisions are unchanged.
Only a mathematically insufficient certificate authorizes the existing
resident-state resumption; fatal and resource failures retain their previous
meaning. Duplicate principal-element rejection is unchanged. More retained
rows can exhaust the existing capacity on other inputs: this remains a bounded
decline, not permission to increase memory limits or ignore a failure. The
change is not a theorem of universal coverage or performance improvement.

## Relation to PARI

The inspected PARI 2.17.4 `src/basemath/buch2.c` has SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
Its `add_rel_i` tracks missing modular pivots separately from a surplus
dependent-relation allowance. It can discard dependent rows when that allowance
is exhausted; after full rank its admission rule changes. This patch does
**not** claim that PARI retains every dependent row, or reproduce PARI's exact
schedule. It fixes a demonstrated information-loss interaction between our
smaller checkpoints and our exact certificate/retry pipeline.

## Evidence and limits

The diagnostic prototype combined rank-pending retention with the previously
unsuccessful $n+2$ prefix on the shared-root baseline `b8698266a` (before the
separate cheap unit-proposal change). At fixed effort five, all 1,012 frozen
survey/control records ran without exceptions. Accepted counts changed from
940 to 948; declines from 72 to 64, with no lost acceptances and exact agreement
with every accepted class number and invariant vector. This is a direct native
diagnostic, not an adaptive public census or independent replay.

Seven of the eight gained cases have more than eleven factor-base ideals and
therefore do not use the smaller staged checkpoint at all. They improve from
retention alone. One is `3.1.43342803.2`, $x^3-8869$, with 23 factor-base
ideals and class group $C_3\times C_3\times C_9$; it is included in the
public exact-replay regression alongside the class-number-$40$ case.

The combined integrated source reproduces the same 948/1012 accepted count
and the same eight coverage gains against `67c3b3084`. Its source SHA-256 is
`4c7e0526959827cb2dec452ffddda9be3c17634a122c5d051323caa57fe3ece2`,
and its production cache key is
`686b668667ce4ab3ba43e6eea00f9c488001f176678c06ffd2396442c3ec0f1f`.

An uncontrolled local five-field pilot measured approximately 5--14% smaller
medians. These are exploratory timings, not controlled `opt` evidence or a
PARI win. The integrated candidate additionally includes the already committed
unit-proposal improvement; prototype identities must not be relabeled as that
combined candidate.

Pinned public examples show both directions of support-size change:
`3.1.588.1` uses nine instead of eleven rows and `3.1.24843.1` eleven instead
of fourteen, but `3.1.104072.1` uses seventeen instead of fifteen after the
earlier checkpoint needs a retry. Keep that case in the performance evaluation;
do not infer universal speedup from the five-field diagnostic.

Regression coverage includes the ordinary Python admission body on a partial
rank lattice where a dependent row halves the eventual integral index, zero
valuation unit witnesses, duplicate rejection, and later checkpoints. The
public native test includes both new field regressions and independent exact
replay under the explicit GRH contract. All ten focused tests pass, including
the pinned corpus, large-unit cases, closure/resource checks, and 2,492 exact
root comparisons per backend and CPython. The complete production build,
strict Python checks and architecture check pass. The parallel-workflow check
still fails on the inherited 395-live-task registry ambiguity; no unrelated
task contracts were modified. Controlled timings, the full current-source
public corpus and newly registered unseen neighbors remain release gates.

## Generated-code and resource comparison

Against `67c3b3084` at the same absolute source path and toolchain, Python
source grows from 436,271 to 436,769 bytes, generated core C from 17,429,956
to 17,437,098 bytes, and the Linux x64 standalone addon from 20,386,576 to
20,390,672 bytes. The 200,768-byte host adapter and 9,513-byte header are
unchanged, as are the 106-function, 246-edge closure and its 22 host entries.
No source allowance, arena limit or public ABI changed. This is Linux artifact
evidence, not a cross-platform or worst-case-memory qualification.
