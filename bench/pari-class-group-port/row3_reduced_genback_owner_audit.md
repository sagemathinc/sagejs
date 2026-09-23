# Row 3 reduced `genback` candidate owner

This closes the fail-closed dependency identified by
`row3_class_group_gen_dependency_cut.py` for frozen development-panel row 3,
the totally real cubic

```text
x^3 - 20000000022*x + 20000000042.
```

The input is the immutable, independently checked row-3 presentation owner.
No class generator, reduced ideal, T2 candidate, or PARI terminal answer is an
input.  PARI 2.17.4 remains the attributed algorithmic source; the translated
ordinary Python is GPL-2.0-or-later.

## Source-derived candidate boundary

The earlier Smith cut produces the active terminal request `(1,-1)`.  The
authenticated terminal permutation maps it to original factor-base positions
4 and 74.  The new owner performs the missing work as follows:

1. reconstruct the first two terminal prime ideals from their source
   descriptors and compare their HNFs with the presentation owner;
2. exactly round the retained 320/384-bit `embeddingG` cells, with ties to
   even, to obtain PARI's integer T2 matrix;
3. compute the first T2/LLL candidate for `P_11`, for the scaled inverse of
   `P_349`, and for their reduced product using the existing translated
   `idealHNF_inv_Z`, integer LLL, and candidate multiplication graph; and
4. replay the existing general signed cubic `genback` tape with those three
   computed candidates.

For this field all three first LLL candidates are scalar:

```text
(11,0,0), (349,0,0), (3839,0,0).
```

That is a computed result, not a shortcut or a supplied tape.  The completed
extended ideal is

```text
J = [3839,0,2150; 0,349,30; 0,0,1],   F = 1/349.
```

The generic tape consumes exactly three candidates and publishes the same
integral representative as the direct candidate prepass.

## Exact witnesses

The compact principal factor admits an especially small independent clearing
witness:

```text
J * P_349 = (349) * P_11
            = [3839,0,1745; 0,349,0; 0,0,349].
```

Both sides are recomputed by exact cubic ideal multiplication before the owner
is published.  Thus `(J,1/349)` is exactly the requested fractional ideal
`P_11 * P_349^-1`.

The exact order-six witness is independent of reduction.  If the two rows of
the authenticated raw-to-presentation map are `r0,r1`, then

```text
2*r0 - 3*r1
```

combines the retained principal relations to the factor-base exponent vector
having `+6` at original position 4, `-6` at position 74, and zero elsewhere.
The diagonal presentation `diag(3,2)` rejects proper divisors 1, 2, and 3, so
this signed generator has exact order six.

## Boundary

This owner completes one authentic `class_group_gen` request and its exact
principal/order witness.  It does not complete unit reconstruction, the class
and unit correspondence, public-object construction, or qualification timing.
It is therefore not by itself a public class-group result.

Run the deterministic publication, mutation, and semantic-input checker with:

```bash
node bench/pari-class-group-port/check_row3_reduced_genback_owner.cjs \
  ROW3_PRESENTATION_OWNER.json
```
