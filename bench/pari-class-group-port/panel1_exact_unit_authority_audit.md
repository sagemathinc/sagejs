# Panel row 1 exact unit authority

Status: complete bounded rank-two unit, exact reconstruction, norm, sign, and
regulator authority for `x^3 - 20010*x + 20018`.

The only producer input is immutable presentation authority
`c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf`,
schema `sagejs.pari-class-group/panel1-presentation-authority-v1`.  It contains
58 authenticated principal relation generators and raw packed logarithm
columns, the source-replayed column-major `58 x 7` raw-to-kernel ancestry, the
source-scheduled seven terminal log columns, the `2 x 7` acceptance lattice,
the integral multiplication tensor, prepared field/root identity, and packed
regulator.  No unit coordinate, compact unit transform, or final
archimedean-unit column is a producer input.

## Computation

`pari_cubic_unit_bridge_prepare` applies the existing integer rank-two LLL,
real rank-two LLL, composition, phase cleanup, and regulator check.  It derives
the column-major compact transform

```text
[0,0,0,0,1,0,0, 0,0,0,0,119,0,1].
```

Packed-real addition is schedule-sensitive.  The seven input log columns are
therefore the output of the presentation authority's complete source-order
`hnfspec` replay, not a differently associated dense floating sum.  The exact
raw-to-kernel matrix is independently used to compose a `58 x 2` raw relation
provenance owner.  Each exact unit is then reconstructed directly from those
58 principal generators using integral cubic multiplication and exact
division.  Both multiplication determinants are exactly `+1`.

The first unit in the maximal-order integral basis is `[6671,-2224,1]`.  The
second coordinate triple has bit lengths `[9259,9253,9247]`.  Its size is the
reason every native input and publication buffer in the focused replay uses
16,384-bit exact storage; a 4,096-bit owner would truncate the authority.

The coarse root brackets `(-142,-141)`, `(1,2)`, and `(140,141)` are first
validated against the exact cubic.  Each bracket is then refined dyadically
and the integral-basis numerator polynomial is evaluated with exact rational
arithmetic.  The resulting phase bits are `[0,1,1,1,1,0]`, or signs
`(+,-,-)` and `(-,-,+)`.  The packed bridge phases must agree cell-for-cell.
The accepted packed regulator is retained only after the bridge recomputes the
rank-two determinant and finds zero packed-value discrepancy.

## Oracle separation and publication

Only after the complete arithmetic result returns does the coordinator open
pristine W0's `fundamental_units` event.  It compares the derived `7 x 2`
transform and packed regulator.  W0 contains `fu = null`, so it supplies no
exact reference unit.  The owner records this ordering explicitly.

Publication is content-addressed, atomic, idempotent, and mode `0444`.  The
focused check performs two cold publications, native GMP and JavaScript-exact
16,384-bit norm/publication replays, short-owner rejection, and eight
fail-closed presentation mutations.  Its timeout is 600 seconds and its peak
working set remains below the 4 GiB lane ceiling.
