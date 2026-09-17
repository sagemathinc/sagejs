# Field-3 terminal owner adapters

This adapter closes the two serialization edges consumed by
`field3_c7_final_assembly.py`. It performs no number-field search and contains
no class-number, unit, or relation answer fixture. Every mathematical array in
an output is copied from an immutable authenticated owner or derived by a
shape-preserving operation whose source is retained in the output ancestry.

## Unit owner

The `unit` operation authenticates mode-0444, SHA-256-addressed owners for:

- the 301-by-15 full terminal ancestry;
- C5's accepted rank-two lattice and 301-by-2 raw transform;
- C6's terminal `getfu` result; and
- on success, both the exact
  `field3-c6-factorback-source-v1` owner and its independent
  `field3-c6-factorback-receipt-v1` cold replay.

It requires the complete digest chain
`full15 -> C5 -> C6` and `factorback source -> factorback receipt -> C6`, the
same field/run/precision/generation, all six exact factorback verdicts, and the
per-column inverse, torsion-sign, and norm correspondence. It independently
checks that C6 applies the inverse choice as the same sign to all 301 raw
transform entries and both exact factor entries.

Successful C6 produces
`sagejs.pari-class-group/field3-c5-c6-unit-owner-v1`, with the exact materialized
power-basis units, 301-by-2 adjusted factored transform, factorback column
receipts, and all four source digests. A C6 `LARGE` or `PRECI` result instead
produces the same schema with `accepted=false`, `status=not_given`, no exact
units or transform, and no factorback claim. This is intentionally rejected by
C7 and preserves PARI flag-zero semantics rather than inventing units.

It also validates the complete 12-word C6 terminal state, immutable embedding
and candidate digests, the C5 analytic acceptance state, determinant, and
precision/generation protocol. `PRECI` maps only to status word three and
`LARGE` only to status word two; both require empty mathematical outputs.

The factorback receipt schema is precision-independent. The verifier's
qualified bounded AGM replay now includes the authentic 153088-bit precision;
this adapter therefore accepts that precision only when the independently
published receipt binds the exact factorback source, C5, and C6 owner bytes.

## Live final owner (fail-closed pending serializer)

The intended `live` operation joins full terminal `W` and packed `Ce`, a future
immutable serialization of the existing exact relation authority (the full
288-by-301 relation matrix and all 301 exact principal generators), and a
future immutable serialization of the existing class-suffix replay (terminal
`B`, the two exact factor-base descriptors, Smith invariants, and
principal-factor proof).

The class owner must name both source digests. The adapter checks `W`, `Ce`,
the Smith diagonal, exact-relation and principal-generator authority, and all
class replay verdicts. Each of the 301 `relationPrincipals` is built directly
from one relation column and its corresponding exact power-basis principal
generator. The two `Vbase` entries and terminal `B` are copied from the class
owner. Torsion `[-1]` of order two is derived from the authenticated mixed
signature: a characteristic-zero field with a real embedding has only `+1`
and `-1` as roots of unity.

No production immutable serializer for those two existing in-memory
authorities exists at this commit. Therefore the `live` operation deliberately
fails closed with `live owner publication awaits authenticated relation/class
serializers`; it does **not** treat a caller-created object carrying a desired
schema string and true-valued booleans as mathematical authority. Once the
real serializers exist, the retained validation design can be enabled and will
yield exactly `sagejs.pari-class-group/field3-live-final-owner-v1`. A compact
fingerprint will not be admitted in place of the exact arrays.

The C7 consumer was tightened independently of that pending edge. It now
validates the successful unit terminal state, precision/generation, both
materialized units and norms, the complete adjusted/factored transforms, all
source ancestry digests, every factorback proof verdict and column, every one
of the 301 exact principal-generator power-basis records, and live ancestry.

## Publication and qualification

The implemented unit output is canonical JSON with a trailing newline, named
by its SHA-256, written through a unique temporary file, atomically renamed,
and sealed mode 0444. An existing name is accepted only if both bytes and mode
still agree. Repeated publication is idempotent. The pending live path never
publishes a file.

`check_field3_terminal_owner_adapters.cjs` is a bounded generated-data
qualification. It checks success at low and 153088-bit declared precision,
`PRECI-not_given`, exact sign propagation, atomic/idempotent publication,
duplicate-key rejection, and authenticated semantic mutations. It does not
perform or stand in for the authentic 153088-bit arithmetic run.
