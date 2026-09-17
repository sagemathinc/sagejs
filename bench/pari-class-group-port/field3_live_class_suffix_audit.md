# Field-3 live class-generator join

This lane closes the representation join between the resident field-3 retry
driver and the already-qualified mixed-quartic `class_group_gen` leaf. It does
not add an answer fixture, alter the final composer, or broaden the frozen
quartic assembly.

## Source correspondence

The mapping follows PARI 2.17.4 `src/basemath/buch2.c`:

- the driver’s logical H prefix is `W` at `class_group_gen`;
- the first two logical transformed-log columns are the `C` columns consumed
  by `get_clg2` for the two non-unit Smith components;
- `Vbase = vecpermute(F.LP, F.perm)` selects factor-base descriptors using the
  live one-based permutation;
- `class_group_gen` obtains `D`, `Uir`, `M1`, and `M2`, calls `genback`, and
  retains the principal correction factors used by `nf_cxlog` and `get_clg2`.

For the frozen field-3 quartic `x^4 - 2000022*x - 2000042`, the live HNF has
two rows. Its final permutation begins with packet indices 11 and 2. The
prepared packet descriptors at those positions have primes 13 and 3. The new
leaf does not accept those values as expected answers: it reads the live
permutation, selects the corresponding same-workspace descriptors, and
reconstructs each `pr_get_tau` multiplication matrix from the prepared
integral-basis multiplication table and packet generator.

## Retained evidence

After the existing Smith/quartic assembly succeeds, the join transactionally
retains:

- the one-based packet indices, primes, algebraic generators, and reconstructed
  multiplication matrices used for both class generators;
- both signed `Uir` order columns and the complete `M1` matrix, for the exact
  identities `Uir_j * D_j = W * M1_j` checked by the assembly;
- the ordered compact principal corrections, including offsets, kinds,
  numerators, denominators, and exponents. On this branch they are the exact
  positive rational factors `1/13` and `1/3` derived by `genback`.

The generated ideals themselves remain the established assembly outputs. The
join makes no claim that a new arbitrary-ideal map or final BNF composer has
been implemented.

## Qualification

`check_field3_live_class_suffix.cjs` first invokes the existing prepared
field-3 replay to regenerate an ordinary input workspace. In a single CPython
process it then runs the resident retry driver and passes that invocation’s
live H, C, permutation, and packet owners directly to the new suffix. No class
invariant, generator ideal, active packet choice, or principal factor is copied
from the PARI answer.

The resulting live inputs are replayed through the identical compiled source
on JavaScript, GMP, and tagged backends. The checker requires exact agreement
for the class group `[2, 2]`, class number 4, both generator ideals, all retained
order/principal evidence, and the suffix state. Mutating either the live HNF or
the active permutation is rejected without publishing any retained witness.
Generated isolated core code is also scanned for host callbacks.

This remains an experimental prepared-boundary cut. The field-specific
quartic leaf only admits the authentic `Uir = -I` branch with scalar principal
corrections; general signed quartic `genback`, final-result composition, units,
and public certification remain outside this lane.
