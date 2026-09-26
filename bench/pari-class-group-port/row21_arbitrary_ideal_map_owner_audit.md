# Row 21 bounded arbitrary-ideal map owner

`row21_arbitrary_ideal_map_owner.cjs` makes the previously implicit row-21
map gap executable.  It accepts up to four opaque integral or fractional
degree-five ideal HNFs, with positive denominators and signed coefficients
strictly below 256 bits.  Up to four requested pairs may also be combined.
The request contains ideals, not claimed answers or factor-base tapes.

The owner authenticates the retained row-21 terminal envelope, then runs PARI
2.17.4 under a 1 GiB address-space, 120 CPU-second, and 120 wall-second bound.
For each input, PARI executes `bnfisprincipal` (and hence its internal
`SPLIT` path) and extended `idealred`.  The retained evidence contains:

- the normalized fractional ideal numerator and denominator;
- the empty class-coordinate vector for this class-number-one field;
- an explicit principal generator, including its denominator;
- the reduced ideal and the exact extended-`idealred` multiplier; and
- an explicit inverse generator reducing the original ideal to the identity.

Ordinary Python in `row21_arbitrary_ideal_maps.py` independently replays every
claim using the terminal result's exact multiplication tensor.  It checks the
input normalization, principal-generator equality, PARI's extended-ideal law
`I = (a)J`, reduction to the identity, arbitrary ideal multiplication, and the
principal-generator combine law.  No expected generator, reduced ideal, or
class-map answer is frozen in the checker.

The focused check uses an integral prime ideal, an opaque fractional ideal
obtained by multiplying that prime by a nontrivial principal ideal and dividing
by three, and their product.  Two independent executions agree exactly.  Four
request-shape/bounds mutations are rejected.

## Honest boundary

This is an **external PARI owner**, not the missing native Sage.js map.  It
proves that the arbitrary integral/fractional ideal API and independent exact
replay boundary are now specified and executable.  It does not retain PARI's
internal `SPLIT` factor-base exponent tape, so it cannot yet replace the
existing native supported-factor-base map with a source-transparent native
factorization algorithm.  Consequently the row-21 output-evidence-v2 maps
must remain unready and `outputBoundaryComplete` must remain false.

Reproduce with:

```sh
node bench/pari-class-group-port/check_row21_arbitrary_ideal_map_owner.cjs
```

The validated receipt has request SHA-256
`4ce459949da7685e19b4301a1d5752cd55619ceb7bf24ce02a0095a85a3e6558`
and contains three independently replayed ideal-map results.
