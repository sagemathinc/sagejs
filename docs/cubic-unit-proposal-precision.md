# Cheap unit proposals, unchanged exact certification

This change separates the cost of proposing an algebraic unit from the
precision and evidence required to certify a class group. It does **not**
reduce the 64-bit analytic certificate precision, change relation collection,
or accept agreement with PARI as a correctness argument.

## Algorithm

Let $s=2^{64}$ be the analytic fixed-point scale and $d$ the retained
dependency-log scale, with $d\ge s$ and $s\mid d$. The previous reconstruction
used $\max(s^3,d)$ throughout its approximate embedding calculation. The
materialization coordinator now:

1. Runs the same reconstruction body at scale $s$.
2. Requires exact integral order coordinates with norm $1$ or $-1$.
3. Recomputes the candidate's regulator interval at the original analytic
   scale $s$, requiring a positive ordered interval that overlaps the retained
   dependency-log interval after exact scale conversion.
4. If either proposal validation fails, retries the same body at
   $\max(s^3,d)$ in the same borrowed scratch.
5. Preserves the previous fatal regulator rejection at this second stage and
   the bounded exact-product fallback when reconstruction cannot produce a
   norm-authenticated candidate.

The other caller of the original reconstruction helper retains its previous
full-precision policy. The embedding algorithm is extracted once, not copied.
No field-specific branch, cached answer, new owner, or foreign function is
introduced. Arena exhaustion propagates rather than requesting another attempt.

## Why the lower-precision proposal is safe

For integral coordinates in the authenticated maximal-order basis, the
candidate $u$ is an algebraic integer. Its exact norm $N_{K/\mathbb Q}(u)=\pm1$
implies that $u$ is a unit. Numerical rounding does not establish this fact;
the existing exact norm computation does.

The logarithm/regulator routine is unchanged. A positive certified lower
bound excludes a torsion unit, and the existing saturation and final analytic
index check remain the authority for publication. In unit rank one, the
regulator of any non-torsion unit is an integer multiple of the fundamental
regulator. Likewise, the full-rank lattice of authenticated principal relations
has index an integer multiple of the class number when the factor base
generates the class group. Therefore the final class-number/regulator index
argument does not require a proof that an approximate reconstruction rounded
to the *particular* formal dependency product. It requires a genuine unit,
genuine relations, the generator theorem, and the unchanged rigorous analytic
bounds. The dependency-regulator consistency check is retained as an additional
guard, not substituted for these facts.

See [the complete class-group argument](complex-cubic-native-class-group-proof.md)
for the generator and analytic index theorems and explicit GRH assumptions.
This note is a mathematical argument, not a Lean formalization or a proof of
the compiler and foreign arithmetic implementation.

A failed first proposal has not established a contradictory certified state:
it has merely failed to provide usable coordinates. More reconstruction
precision is consequently justified. This is different from interpreting a
failed final certificate as a request to gather arbitrary additional relations.

## Validation and limits

The focused failure-transition test executes the actual CPython coordinator
with injected mathematical callees. It checks successful first proposals,
norm rejection, numerical failure, invalid or disjoint regulator intervals,
second-attempt rejection, the original exponent limits and exact-product
fallback, invalid scale conversion, and propagation of resource exceptions.
It is a control-flow test, not a replacement for native arithmetic tests or
independent public replay.

The experimental native closure agrees in all 64 output slots with the
shared-root predecessor on 1,012 frozen survey/control inputs: 940 accepted,
72 identical fixed-effort declines, and no exceptions. This is differential
evidence, not the adaptive public 1,000-field census.

Serialized CPU-pinned alternating diagnostics on `opt` measured the selected
$x^3-x^2-11x-63$ field at 2.758 ms before and 2.562 ms after this change
(ratio 0.929). The class-number-five headline case measured 2.436 to 2.287 ms
(ratio 0.939). A separate fourteen-field diagnostic found roughly 3--7% gains
on nontrivial examples, with approximately 1% slower medians on two tiny
class-number-one examples. These are native-call diagnostics, not public
PARI comparisons, statistical non-regression certification, or a PARI win.

The earlier successful full public census is pinned to `bbe1d2ca3`; it does
not qualify this follow-up. Full public replay, retained timings, new held-out
neighbors, and platform qualification remain separate gates.

The integrated source passed all nine focused native/public tests, including
authenticated production receipts, independent exact replay, pinned nontrivial
LMFDB examples, large-regulator units, and the new failure-transition test.
Strict CPython syntax, Ruff formatting, and Pyright checks also passed.

The closed program has 106 functions, 246 call edges, and the same 22 host
entries. The new scale-parametrized implementation is private. At the same
absolute source path, generated core C changes from 17,395,261 to 17,429,956
bytes and the Linux x64 addon from 20,382,480 to 20,386,576 bytes. The 200,768-byte
host adapter and 9,513-byte header are unchanged. Python source grows from
434,340 to 436,271 bytes; no source allowance or arena limit is increased.
This is Linux resource evidence, not cross-platform qualification.

The integrated source SHA-256 is
`aa709ab3fd430f82f15dbb3c4490cd2156aa477e0a2c9dfc27b79df7ed4f379d`.
It differs in comments/formatting from the experimental source archived with
the [controlled diagnostics](https://github.com/sagemathinc/sagejs/releases/tag/cubic-frontier-census-bbe1d2ca3-20260906).
The production tests qualify the integrated source; the diagnostic timings
identify the experimental source and must not be silently relabeled.
