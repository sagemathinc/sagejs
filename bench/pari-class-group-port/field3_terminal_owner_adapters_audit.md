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
- on success, the independent
  `field3-c6-factorback-receipt-v1` cold replay.

It requires the complete digest chain `full15 -> C5 -> C6 -> factorback`, the
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

## Live final owner

The `live` operation joins:

- full terminal `W` and packed `Ce`;
- `field3-full-owner-authority-v1`, whose exact owner contains the full
  288-by-301 relation matrix and all 301 exact principal generators; and
- `field3-live-class-suffix-owner-v1`, whose replay owns terminal `B`, the two
  exact factor-base descriptors, Smith invariants, and principal-factor proof.

The class owner must name both source digests. The adapter checks `W`, `Ce`,
the Smith diagonal, exact-relation and principal-generator authority, and all
class replay verdicts. Each of the 301 `relationPrincipals` is built directly
from one relation column and its corresponding exact power-basis principal
generator. The two `Vbase` entries and terminal `B` are copied from the class
owner. Torsion `[-1]` of order two is derived from the authenticated mixed
signature: a characteristic-zero field with a real embedding has only `+1`
and `-1` as roots of unity.

This yields exactly
`sagejs.pari-class-group/field3-live-final-owner-v1`; no answer is reconstructed
from a hash or a previously expected C7 result. The two narrow input schemas
are the production serialization of the already-existing exact live relation
authority and class-suffix replay. Their producer must retain those source
arrays; a compact fingerprint is not admitted in their place.

## Publication and qualification

Both outputs are canonical JSON with a trailing newline, named by their
SHA-256, written through a unique temporary file, atomically renamed, and
sealed mode 0444. An existing name is accepted only if both bytes and mode
still agree. Repeated publication is idempotent.

`check_field3_terminal_owner_adapters.cjs` is a bounded generated-data
qualification. It checks success and `PRECI-not_given`, exact sign propagation,
301 principal records, atomic/idempotent publication, duplicate-key rejection,
and authenticated semantic mutations. It does not perform or stand in for the
authentic 153088-bit run.
