# Rows 1 and 3 independent ideal-replay audit

This lane asks what a cold verifier can prove from the immutable neutral fresh
row results alone. It does not import a row publisher, a W0 trace, or a PARI
answer, and it makes no timing claim.

## Result

Both envelopes support useful but incomplete detached replay.

- Row 1: the complete 51-dimensional presentation has determinant 3, hence
  its only nontrivial Smith invariant is 3. The retained order witness contains
  a norm-11 generator ideal, a nonzero proposed principal generator, and a
  published power ideal of norm 1331. Thus the order-three norm identity is
  exact. The envelope does not retain the multiplication table, factor-base
  ideals, raw relations, factor map, or principal coefficient column, so it is
  impossible to recompute the ideal equality `I^3 = (alpha)` cold.
- Row 3: the retained 2-by-2 presentation has determinant 6 and content 1,
  proving Smith factors `[1, 6]` and class group `Z/6Z`. The compact order
  witness retains 443 relation indices, their signed exponents, matching exact
  principal generators, a norm-3839 generator ideal, and two presentation
  ideals. It does
  not retain the field multiplication table, factor-base ideals, or raw
  relation records, so neither the compact linear combination nor the final
  order-six ideal equality can be recomputed from the envelope alone.

The adapters return `idealGeneratorReplayComplete: false` and a machine-readable
`missingOwnersForExactIdealEquality` list. This is intentional: determinant,
norm, Smith, and shape checks are not mislabeled as ideal-arithmetic replay.

## Files and checks

- `row1_independent_ideal_replay.py`
- `check_row1_independent_ideal_replay.cjs`
- `row3_independent_ideal_replay.py`
- `check_row3_independent_ideal_replay.cjs`

Each checker consumes a durable fresh neutral result, runs in a separate Python
process, and rejects mutations to the exact claims it makes. Neither adapter
reads mutable runtime state or performs a reference-system call.

The focused run used fresh result SHA-256 values
`d00c51fc42892d23d9ea0d8c17e07685b289af570f2897d2573c16ccaa497d54`
for row 1 and
`41bef3b744883eb7b91ef1e6fd415d31249322006400e0ffda13a5afbe3a7ba4`
for row 3. Row 1 rejected presentation and power-norm mutations. Row 3
rejected presentation, trivial-generator, and negative-relation-index
mutations.
