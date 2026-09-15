# Scalar relation provenance audit

Initial read-only findings, 2026-09-15, followed by the implementation checkpoint
below. The original audit is retained to explain the source predicate.

## Implementation checkpoint

The current non-automorphism path now passes an explicit scalar-prefix count
to log collection. Connected execution uses the initializer's saved return;
the resident retry driver retains its actual local `initial_count`. Public
prepared-driver signatures are unchanged. Invalid counts reject before
collection or new logarithm writes. No coordinate-only inference is added.

All 192 scalar-GEN versus explicit-column cases pass against PARI 2.17.4,
CPython, generated JavaScript, GMP and tagged execution. These cover four
fields, three requested bit precisions, exact/rounded first matrix entries,
both generator representations, and ±1/±3. The oracle now explicitly converts
requested bits with `nbits2prec`; historical precision-word assumptions are
not carried into these tests. The source trace hash is
`24c33b4c7634dfda1532a795b16f5c7ec337651c093c51faa2d9d659ec35b7ee`.

Full quartic CPython replay still matches 150→151→152, including exact logs,
regulator, class number and capped-publication checks. Checker-only spies
verify one initialization and the same returned count at every append;
terminal repeats call neither. The compiled prefix checks are recorded below.

All 48 staged-prefix groups (384 columns) pass PARI, CPython, JavaScript,
GMP and tagged checks, including zero/four scalar prefixes, stages four/eight,
invalid-prefix and automorphism guards, and completed-prefix no-ops. The
focused core has 7,186,250 bytes; its run consumed 30.402 CPU seconds and
peaked at 385,788 KiB RSS. This does not substitute for a new native quartic
retry replay, which has not been run for this increment.

The full prepared cubic tagged replay also passes unchanged: class number 3,
invariants `[3]`, exact regulator, 58 relations and work counts 491/54/12.
Three fresh samples are 107.886, 107.949 and 108.149 ms. These are unpaired
diagnostics and show no visible benefit relative to the preceding 105–106 ms
square-root samples. The source-fidelity correction does not resolve the
performance gap; do not omit this negative result.

Core SHA-256 is
`1291731544988743817e203152756b746c20cb24c14589484dbb3695ec7dabda`,
size 58,164,743 bytes. Raw report:
`/tmp/sagejs-prepared-scalar-prefix-20260915.json`. Input and 64-word policy
are unchanged from the square-root experiment. Rebuild/replay consumed
234.347 CPU seconds and peaked at 1,747,008 KiB RSS under the same 4 GiB cap.

## Source predicate

PARI 2.17.4 `src/basemath/buch2.c:get_log_embed` (around line 2199) selects

```c
typ(z) == t_COL ? RgM_RgC_mul(M, z) : const_col(nbrows(M), z)
```

The predicate is the stored generator's **type**, not whether a column happens
to have zero nonconstant coordinates. `init_rel` (around lines 3595–3601)
passes `pr_get_p(gel(P,1))`, an integer, to `add_rel` for rational prime
relations. `Fincke_Pohst_ideal` (around lines 2536–2555) obtains `gx` from
`ZM_zc_mul`, rejects scalar columns before admission, and passes column
generators through relation insertion/normalization. Later driver families
must be audited independently; these observations do not authorize inferring
their generator types from coordinates either.

The current translation `relation_insertion.py:pari_initialize_owned_relations`
converts the integer into `(p,0,...,0)` and replaces its metadata token with the
one-based record index (lines 61–65). `pari_insert_smooth_relation` stores
normalized column coordinates with the same token convention. Consequently
the current three metadata slots encode token/relative-original/automorphism,
**not generator kind**. None should be silently repurposed as a scalar flag.

`relation_log_embeddings.py` always supplies `False` to
`pari_prepared_log_embedding`. That helper already implements the scalar
branch, bypassing embedding products while preserving its real/complex log
and complex-place weighting rules.

## Exact prepared cubic evidence

Inspected:

- `/tmp/sagejs-actual-initial-collector-gqERSy/fixtures.json`, field 1.
- `/tmp/sagejs-prepared-class-inputs-JXLwHg/inputs.json`, matching prepared
  cubic input used by the resident attempt.

The actual initializer returned **11** rational relations. Their generators,
in cache order, are

```
2, 3, 5, 11, 13, 37, 61, 71, 89, 149, 251
```

Their stored coordinates are `(p,0,0)`. All subsequent **47** collected
generators have a nonzero nonconstant coordinate. Log precision is 192 bits.
The three real embedding rows have exact first entry `(1,-1,0)` in the
mantissa/precision/exponent convention. This audit only reads the existing
qualified packet; it does not rerun its computation or treat its initial
count as an input answer to a future implementation.

## Minimal API proposal

For the currently supported non-automorphism initialization/collector
corridor, preserve the **actual return value of the native initializer** as
`scalar_prefix_count`. Pass it explicitly to the append-log entry and retain
it across subsequent calls/retries. Only `row < scalar_prefix_count` takes
the scalar branch. Validate `0 <= scalar_prefix_count <= count`; it is
immutable generator provenance, not the current cache length or completed-log
count. The value must come from initialization, never the oracle fixture's
known 11. No rescanning of coordinates or prime recognition is needed.

This compact prefix representation is justified only while all scalar GEN
relations are exactly the initial contiguous block and all later insertions
are columns. A general collector should instead retain an explicit generator
kind owner/tag at insertion, including future random/automorphism routes.
Do not generalize the prefix convention without auditing those routes.

## Rounding and differential controls

Coordinate-only inference is unsafe even when the integral basis starts with
1: source dispatch depends on type, and multiplying a column by a finite
precision embedding matrix can introduce real-zero terms or precision
propagation absent from `const_col`. Mathematical equality does not establish
identical PARI rounding or operation counts. `short_product.py:
pari_prepared_embedding_row` explicitly visits non-exact-zero matrix entries,
including their zero-coefficient products. An exact first column alone is
not a proof that every such product is a no-op.

The narrow correction should therefore test:

1. PARI scalar GEN versus an explicitly supplied scalar-shaped `t_COL` as
   **distinct cases**, with the translated flag following provenance even
   when their output words happen to agree.
2. Positive/negative rational generators, `1` and `-1`, real and complex
   places, supported precision widths, and exact versus rounded matrix
   entries. Zero generators should retain the current failure contract.
3. Exact seven-word log columns against source PARI, including phase and
   complex weighting, on CPython/JS/GMP/tagged.
4. The full prepared cubic: initial 11 rows use source scalar semantics;
   later 47 remain unchanged; records, acceptance, regulator and invariants
   agree. Retry calls retain the completed prefix and immutable scalar count.

Only after these tests should a paired measurement isolate this change from
the current capacity, `divmod`, and square-root experiments.

## Separate small-division observation

`small_real_division.py` also contains
`qp, k = value // y0, value % y0`. This is safe to replace with explicit
`divmod(value, y0)` in a **separate** patch: both exact operands are unchanged,
and the intended normalized-positive divisor contract makes `y0` nonzero.
PARI `src/kernel/gmp/mp.c:779–780` obtains both through one `divll` call and
its `hiremainder`. It affects the 128/192-bit divisor branch already exercised
by the 6,272-case real-division matrix. This audit makes no such edit while
the current whole-graph rebuild is in progress.
