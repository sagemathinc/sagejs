# Rows 3 and 4 real-cubic presentation audit

This cut authenticates the frozen development-panel owners for rows 3 and 4,
replays their exact relation logarithms and translated `hnfspec_i` schedule,
and derives the non-unit class presentations before comparing the frozen final
answers.  The source trace hashes are
`8ef5cd64a3baaf0ff6f3e57951cdb0d1a7549879aef6dd089d5a69b39da970b9`
(row 3) and
`acebe2f9f4bdfc0c3da76ab6d9ad1aa409a1fb0bfd4113ebec9b825c432e2cb8`
(row 4).  They are anchored in
`development-default-driver-manifest.json`; the coordinator also authenticates
the prepared-number-field bundle and the manifest's prepared, event-stream,
and terminal-result hashes.

The replay proves `R*T = 0`, `R*V = W` in terminal factor-base order, all
factor descriptors and ideals, all retained principal relations, and the Smith
outcomes.  Row 3 yields `W = diag(3,2)`, class number 6, and invariant `[6]`.
Row 4 yields `W = [2]`, class number 2, and invariant `[2]`.

This is not yet a public class-group result.  Both immutable owners retain
`classWitnessesComplete=false`, `unitsComplete=false`,
`correspondenceComplete=false`, and `publicComplete=false`; factor-base
selection and GRH/relation bounds remain upstream assumptions.

The attempted next connector—expanding the authenticated row-4 raw relation
certificate into one explicit algebraic principal generator—does not fit the
campaign's medium tier.  A single worst-exponent power using the existing
common-denominator exact cubic primitive was stopped by `timeout` with exit
124 after 600.15 seconds (599.19 user seconds), before producing a value; an
earlier full product was also stopped at the same cap.  Therefore no class
witness is published or claimed here.  The missing connector is a bounded,
source-transparent exact principal-ideal genback/product owner that consumes
the authenticated raw relation coefficients without materializing this
enormous intermediate power.

The source hashes embedded in generated owners authenticate the checked-out
Python implementation.  Like every content-addressed replay owner, they do
not assert that a later repository `HEAD` has the same source bytes.
