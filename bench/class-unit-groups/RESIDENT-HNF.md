# Resident exact relation HNF

This lane adds an independently callable small-matrix capability; it does not
change the cubic caller.  `resident_exact_relation_hnf_selection()` accepts
the authentic initial and candidate relation rows, packs the complete source
once, and publishes the canonical nonzero row HNF, the source-row support,
the retained candidate indices, and the retained rank.

## Exact boundary

The typed-Python kernel calls FLINT for the initial HNF and unimodular left
transform.  Before publishing anything, it multiplies the transform by the
resident source and checks the complete result against the HNF, then checks
that the transform determinant is `1` or `-1`.  Source support is the union
of nonzero transform coefficients in the nonzero HNF rows.

Deletion follows the existing stable schedule.  A trial zeros one supported
candidate in the retained workspace and keeps the deletion only when FLINT
returns the identical canonical HNF.  Accepted deletions remain zero for later
trials; rejected deletions are restored exactly.  Replay output and the later
trial-source matrix deliberately share one workspace because their lifetimes
do not overlap.  The generated JavaScript target comes from this same kernel
source.

The ordinary CPython implementation remains an independent exact oracle and
interruptible fallback.  It verifies its own transform and determinant and
runs the same bounded deletion schedule.  FLINT and the readable algorithm
can choose different valid unimodular transforms, so CPython is compared on
canonical HNF lattice, rank, and retained-lattice replay.  Native and generated
JavaScript are compared to the current FLINT source support and retained rows
exactly.

The public boundary rejects matrices above 64 rows, 16 columns, 1,024 source
entries, or 4,096 bits per entry.  It caps deletion trials at 64, accounts for
all packed output storage, and checks a caller-supplied scalar work budget no
larger than 1,000,000 units.  A cancellation callback selects the interruptible
CPython path and is polled before the initial HNF and every deletion trial.
Invalid shapes, packed metadata, masks, counts, rank, work, completion flags,
or failed exact replay fail closed.

## Differential and end-to-end evidence

`test/number-field-class-group-resident-hnf.cjs` compiles the kernel into a
fresh temporary cache.  Its fixtures are captured selector inputs from LMFDB
fields `3.1.4027.2` in both proof modes and a rank-six prefix from
`3.1.5448.1`.  Native and generated JavaScript match the current exact HNF,
source support, retained candidate indices, rank, and deletion count.  The
same test runs the independent oracle under ordinary CPython from outside the
repository, exercises a two-trial incomplete deletion, checks cancellation
and resource declines, and injects a failed kernel replay.

`resident-hnf.py` replaces only the private selector while timing the public
`cubic_class_number_projection()` for discriminants 588, 4027, and 5448 in
both proof modes.  It rotates target order per sample and prepares the maximal
order outside the timer.  Every target must reproduce the exact scalar, proof
status, and presentation digest.  Complete bounded results undergo detached
cubic-certificate replay; policy handoffs undergo detached relation-
presentation replay from the authenticated live scalar projection.

A nine-sample, one-warmup O2 native run on the 2026-08-28 Linux x64
development host passed the benchmark's wishlist guard.  The unconditional
discriminant-4027 selector fell from 57.8 ms to 24.2 ms, and the whole scalar
fell from 452.3 ms to 407.9 ms, a 9.8% improvement.  The conditional 4027
workflow improved 2.3%.  The four 588/5448 neighbor changes ranged from a 1.5%
regression to a 1.8% improvement, all inside the 3% guard.  A separate
five-sample generated-JavaScript run measured an 8.5% unconditional-4027
improvement and no neighboring regression; its resident selector took 21.4
ms versus 58.3 ms on the current path.

An O0 smoke run also reproduced all six scalars, proof labels, presentation
digests, native results, and generated-JavaScript results.  Direct Sage/PARI,
GP/PARI, and Magma executables were unavailable in this checkout, so no new
foreign-oracle measurement is claimed.  The three expected class numbers are
the pinned values already used by the cubic compiler profiler.

Run the full measurement with:

```sh
SAGEJS_USE_SOURCE=1 SAGEJS_OPT_LEVEL=O2 \
  SAGEJS_RESIDENT_HNF_SAMPLES=9 \
  SAGEJS_RESIDENT_HNF_ENFORCE=1 \
  node bin/sagejs --python bench/class-unit-groups/resident-hnf.py
```

## Integration handoff

The narrow caller change belongs in
`cubic_class_number._select_cubic_relation_candidates()`.  Keep its empty-input
guard and exception policy, then replace the support/deletion block with one
call and project the retained indices back to candidate records:

```python
selection = matrix_module.resident_exact_relation_hnf_selection(
    initial_rows,
    (entry[0] for entry in candidates),
    width,
)
if selection.rank < 1 or not selection.deletion_complete:
    return None, 0
return (
    tuple(candidates[index] for index in selection.selected_candidate_indices),
    selection.rank,
)
```

The integration lane must also:

1. Add `src/lib/sagejs/kernels/matrix/class_group_hnf.py` to the
   `matrix-native-kernels.files` list in `architecture/package-graph.json`.
2. Add that source beside the other matrix kernels in `pyrightconfig.json`.
3. Add a `bench:number-field-resident-hnf` script to `package.json` which runs
   `node bin/sagejs --python bench/class-unit-groups/resident-hnf.py`.
4. Add this production witness to `architecture/native-kernels.json`:

   ```json
   {
     "id": "class-group-resident-hnf-production",
     "source": "src/lib/sagejs/kernels/matrix/class_group_hnf.py",
     "functions": ["resident_exact_relation_hnf_select"],
     "semantic_domain": "resident bounded exact relation HNF support, stable candidate deletion, retained rank, and exact transform replay through declared FLINT FFI",
     "fallback": "same-source",
     "host_isolation": "certified",
     "oracles": ["cpython", "javascript", "flint"],
     "benchmark": "bench:number-field-resident-hnf",
     "platforms": ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"]
   }
   ```

That registry drives both production and Wasm pack generation; no separate
pack descriptor is needed.  The caller integration should update the shared
cubic profiler attribution for the new coarse boundary and run the pinned
10-field cubic smoke corpus before the broader stratified corpus.  No
handwritten native file or `architecture/native-code.json` exception is
needed.  This lane does not consume an optimizer-packed-container API; its
declared parallel dependency is ordering-only for final integration.
