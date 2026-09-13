# Analytic suffix extraction audit

This extraction isolates the existing final analytic certification suffix without
starting another class-group campaign or changing relation collection. Four
ordinary Python helpers carry the index interval, decision, bounded unit
saturation and final publication. Every exact matrix/vector owner remains in
the original root arena.

## Mathematical contract

For a complex cubic field, let $h'$ be the order of the exact presentation and
$R'$ the regulator of its retained exact unit subgroup. The caller has already
established generation of the class group and valid principal relations; hence
$h'/h$ is a positive integer. An authenticated non-torsion unit likewise gives
$R'/R\in\mathbb Z_{>0}$. The class-number formula relates their product to

$$
I=\frac{h'R'(2\pi)}{\sqrt{|D|}\operatorname{Res}_{s=1}\zeta_K(s)}.
$$

The caller's rigorous Belabas–Friedman enclosure, under the stated GRH
assumptions, encloses the zeta residue. This extraction does not replace that
theorem or produce the residue from competitor answers.

The index helper computes a dyadic enclosure for $\log I$ from caller-owned
BF endpoint rows 12/13 (log discriminant) and 16/17 (log presentation order),
the regulator-log interval, log-$2\pi$ interval, and residue-log interval.
Division of the discriminant logarithm by two rounds outward. Inverted
intervals, nonpositive log discriminant and negative log presentation order
are rejected.

The classifier returns:

- `1` if the well-formed enclosure contains $0=\log1$ and its upper endpoint
  is strictly below the rigorous lower endpoint for $\log2$;
- `0` for a well-formed wider enclosure that does not establish index one;
- `-1` for invalid or contradictory evidence, including an interval wholly
  between $0$ and the lower endpoint for $\log2$.

The positive-integer index premise rules out that last interval. Merely testing
whether an upper endpoint is below $\log2$ would otherwise accept a
contradiction. A wide interval is insufficient, not a proof that the index is
greater than one.

## Saturation and allocation barriers

The saturation helper borrows the root's coordinate workspace and logarithm
scratch. It retains the original order of square-, cube-, and fifth-root
probes and the limit of eight authenticated replacements. Each accepted root
must pass the existing exact power replay; its newly enclosed regulator must
overlap the previous regulator divided by the proposed prime. A root probe
returning zero is only absence of an authenticated candidate within that probe,
not a proof of primitivity. Unknown statuses and invalid regulator comparisons
are fatal.

The root still prepares the initial BF plan at $X=997$, then allocates
exactly `value_count×1` values and `4*value_count×1` endpoints. It computes and
saturates the initial enclosure before deciding whether the existing
$X=1494$ refinement is needed. Refined owners are allocated only after the
refined plan succeeds. No extra owner, eager refinement, new stage, or new
relation retry is introduced.

At the final root decision, only valid but insufficient evidence retains
phase `8`. Negative classification uses fatal phase `44`. Publication failure
also uses phase `44`, not a host effort retry. The tests evaluate the actual
host gate, whose retriable phases include `8` but not `44`.

## Publication

The publication helper checks the retained scalar validity and index-one
decision again, then detaches requested factor and relation rows and writes
the established result layout. Transcript-capacity errors leave the accepted
output marker untouched. Scalars are cleared and filled before `output[0]=2`
is committed last. A late packed-scalar capacity failure therefore cannot
expose an accepted marker. Partial unaccepted transcript or diagnostic data
may remain on failure; no atomic transaction for all output buffers is claimed.

Collection, support/compact presentation, unit reconstruction/materialization,
the root reconstructed-regulator guard and BF mathematics are outside this
change.

## Evidence

The CPython source-extracted tests check 48 interval configurations against an
independent exact rational oracle, 11 classifier cases, 10 root orchestration
cases, and three late-output failure positions. Root tests preserve the
initial/refined lazy allocation sequence and distinguish insufficiency from
contradiction and publication failure. Their injected probes are control-flow
tests, not mathematical arithmetic evidence.

The compiled tests execute the actual transitive production source in dynamic
JavaScript, GMP and fmpz. They check exact integer interval arithmetic at small,
80-bit and 255-bit scales; actual Arb regulator/logarithm arithmetic and exact
root probes on units $\alpha^e$ for
$e=1,2,3,5,4,9,25,30,256,512$, where $\alpha^3-\alpha-1=0$; and every accepted
retained unit against independently generated exact divisor powers, signs and
inverses. They also exercise the eight-replacement limit.

For those saturation tests, the residue is a deliberately constructed model
using the subgroup generated by $\alpha$. It is **not** a BF certificate or a
new class-group proof. It isolates real saturation arithmetic and the
index-classification interface without requiring a fresh field computation.
Actual result/transcript layouts, invalid intervals, undersized transcript
buffers, poisoned unused endpoint rows, and a real late one-limb output
overflow are compared across all three backends.

No production rebuild, opt execution, holdout field or timing claim belongs to
this lane. Shared closure/API qualification, package source budgets, optimizer
provenance, full public replay and cross-platform release validation remain
integration responsibilities.

At this branch's compiler revision the four new helpers have no decorators,
but the pure scalar classifier is nevertheless exported automatically. The
closure has 93 functions and 23 host-callable entries. Integration is correcting
the generic dependency-only export policy: explicit selected roots and lexical
decorators remain entries; the classifier and the historically accidental
undecorated rank-multiply export become internal, leaving 21 entries. This lane
does not add dummy owner arguments or change compiler claims to hide that fact.
