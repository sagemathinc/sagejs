# Prepared `h = 1` no-oracle composition root

## Boundary

`build_prepared_h1_no_oracle_root` receives four things: the hash-qualified
resident candidate, exact unit-relation authority, a sealed regulator replay,
and the regulator envelope digest. It has no fixture path, callback, PARI
handle, or process capability.

The focused checker prepares the two detached authorities before calling the
root. That preparation still uses the pinned regulator fixture and Sage.js
rigorous regulator replay. Consequently, “no oracle” describes the connected
computation boundary, not the historical provenance of every detached input.
The published source hashes retain that provenance.

## Connected replay

The root performs all of the following again on every cold replay:

1. Replays all 73 principal ideal relations and the active 8-by-15
   relation-to-HNF witness.
2. Verifies that the trailing 8-by-8 presentation has determinant `+/-1`, so
   the class group has order one and legitimately has no class generators.
3. Replays the 2-by-73 unit words, exact principal products, norms, and their
   links to the published power-basis units.
4. Refines the three resident 320-bit roots to 2176 bits using exact polynomial
   signs and rebuilds the integral-basis embedding. No retry embedding is an
   input.
5. Recomputes all 73 archimedean atom logs, applies the exact unit transform,
   and reruns `cleanarch`. No retry log is an input.
6. Binds those new 2176-bit logs to the independently replayed regulator and
   its exact units. Since the older regulator record contains 192-bit logs,
   replay requires at least 176 common leading bits after normalization rather
   than pretending distinct floating evaluations must be bit-identical.
7. Derives and cold-replays the exact order-two torsion group from the prepared
   polynomial.

Publication is canonical, immutable, transactional, and idempotent. Cold
replay recomputes the payload rather than accepting self-consistent hashes.
Coordinated rehashed log mutations, exact-unit mutations, public-completion
mutations, and conflicting publication all fail closed.

## Scope

The result establishes internal PARI 2.17.4 correspondence for this prepared
`h = 1` sentinel without a live retry oracle. It deliberately keeps public
completion false. A public class/unit result still needs:

- a replayable proof that the selected unit lattice has index one; and
- the global factor-base bound and relation-completeness proof.

The GRH/PARI heuristic-policy assumptions remain explicit.
