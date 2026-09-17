# Row 14 terminal class-witness boundary

This cut implements the exact terminal quotient and minimal-order verifier for
the mixed quartic `x^4 - 200000002*x - 200000002`. It proves orders 24 and 8
by testing every positive multiple below the claimed order for membership in
the live three-column presentation. It also checks the presentation's Smith
minor gcds and all 192 combinations of the two mapped quotient vectors, so
the generators are independent and exhaust the quotient. The resulting presentation relations are
then transported through the live raw-to-presentation transform and replayed
against all 799 factor-base coordinates.

The input contract is intentionally fail-closed. It requires the future live
806-relation owner to retain the raw relation matrix, the 799-by-3 factor map,
the 806-by-3 raw transform, and a nonempty compact principal factorization for
every raw relation. The output principal witnesses are signed products of
those retained factorizations; they are not expanded, and no approximate
`getfu` result is involved.

The focused checker uses generated protocol data only. It establishes the
matrix orientation, the exact relations `(1, 0, 0)` and `(0, 1, -4)`, all 32
minimality checks, 192 independence checks, and rejection of mutations to
every evidence boundary.
It does **not** publish an authentic row-14 witness. That remains blocked on
the live terminal owner reaching and retaining the 806-relation state.

Frozen W0 evidence was used only to map the expected source schema during
development. It is not read by the implementation or checker and supplies no
relation, transform, principal factor, or acceptance value. A later W0
differential checker may compare independently produced live output, but must
not feed W0 cells into this computation. `publicComplete` therefore remains
`false`.
