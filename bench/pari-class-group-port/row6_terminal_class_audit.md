# Row 6 terminal class ancestry and witnesses

This cut reconstructs the exact terminal HNF ancestry for prepared-panel row 6
from its immutable Gate-C and factor-base owners. It replays the source HNF
schedule at columns 1133, 1136, and 1137, reverses the retained transformations,
and obtains seven relation-kernel columns and two presentation columns. Exact
matrix replay proves that the latter map to `diag(2, 2)` on two distinct active
factor-base rows.

The class owner then authenticates all 1,137 raw principal relations using the
prepared cubic multiplication table, reconstructs all 1,130 factor-base prime
ideals, and verifies the two order-two ideal witnesses. On the retained owner it
checks 7,819 exact cubic ideal products and 7,116 nonzero relation entries, with
maximum raw exponent 5. The resulting class group is `C2 x C2`, of order 4.

The retained-owner ancestry check takes about 49 seconds. Class-owner composition
then takes about 2.5 seconds and about 112 MiB peak RSS under a 4 GiB/600 second
cap. Neither computation opens the frozen W0 transcript. The 147-cell transformed
archimedean image is also retained for the subsequent unit suffix; that suffix
is a separate authority and is not established by this cut.

The real components of that image come from the authenticated source-stage HNF
replay. Its sign components are propagated separately and exactly modulo two
through the same integer ancestry map, then normalized to canonical `0`/`pi`
representatives. This avoids losing parity when unreduced integer multiples of
`pi` exceed binary64's exact-integer range.
