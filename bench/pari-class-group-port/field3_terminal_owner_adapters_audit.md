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

The factorback source must also name the authenticated C6, embedding, and
relation owners. The receipt binds the complete source bytes and independently
repeats all three digests. The adapter requires both copies to agree with the
actual C6 and embedding owners, then propagates the links into the unit owner's
ancestry and proof records for C7 cross-owner validation.

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

## Live final owner

The `live` operation joins full terminal `W` and packed `Ce`, the authenticated
exact relation authority (the full 288-by-301 relation matrix and all 301 exact
principal generators), and the independently replayed class suffix (terminal
`B`, two exact antiuniformizer descriptors, Smith invariants, and factored
order-principal witnesses).

The class owner must name the exact full15, relation, raw-log, local-HNF
protocol, frozen resident authority, and live-class-join digests. The adapter
requires all links to agree, checks `W` and high-precision `Ce` byte-for-byte,
recomputes relation-array and terminal-`B` checkpoints, validates the Smith
diagonal, and consumes every exact replay verdict. It also checks each
antiuniformizer, multiplication matrix, generated inverse ideal witness, and
both 301-entry order-principal factorbacks against the retained replay and
full15 transform. It never admits the obsolete uniformizer-derived `tau`.

Each of the 301 `relationPrincipals` is built directly from one authenticated
relation column and its exact power-basis principal generator. The two `Vbase`
entries and terminal `B` are copied only after their corrected serializer
proofs pass. Torsion `[-1]` of order two is derived from the authenticated
mixed signature: a characteristic-zero field with a real embedding has only
`+1` and `-1` as roots of unity. Any missing digest, replay flag, defining
equation, checkpoint, or factorback fails before publication.

The C7 consumer was tightened independently of that pending edge. It now
validates the successful unit terminal state, precision/generation, both
materialized units and norms, the complete adjusted/factored transforms, all
source ancestry digests, every factorback proof verdict and column, every one
of the 301 exact principal-generator power-basis records, and live ancestry.

## Publication and qualification

Both implemented outputs are canonical JSON with a trailing newline, named
by its SHA-256, written through a unique temporary file, atomically renamed,
and sealed mode 0444. An existing name is accepted only if both bytes and mode
still agree. Repeated publication is idempotent.

`check_field3_terminal_owner_adapters.cjs` is a bounded generated-data
qualification. It checks success at low and 153088-bit declared precision,
`PRECI-not_given`, exact sign propagation, atomic/idempotent publication,
duplicate-key rejection, and authenticated semantic mutations. It first runs
the corrected bounded terminal-source qualification and records its authentic
relation/class owner digests, then tests the adapter without launching a new
high-precision computation. It does not perform or stand in for the authentic
153088-bit arithmetic run.
