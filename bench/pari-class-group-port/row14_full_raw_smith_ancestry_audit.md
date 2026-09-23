# Row 14 full raw-relation Smith ancestry

The row-14 raw Smith gap is closed without running a generic Smith or Hermite
transform on the `806 x 799` relation matrix.  The implementation reruns the
already authenticated production `hnfspec`/`hnfadd` stages and reverses their
exact column operations for all 806 terminal columns.  This is the same
source-operation replay previously used for the seven unit-kernel and three
class-presentation columns; it now retains the other 796 terminal identity
columns as well.

`relation_column_ancestry.cjs` still performs exactly the same integer linear
combinations, but no longer scans an entire square transform when the reversed
column has only a few live coefficients.  It visits active transform rows and
nonzero transform entries.  This changes neither the mathematical operation
nor its ordering.  The existing synthetic ancestry checker covers negative
floor division, unit/nonunit column compaction, append composition, and
permutation embedding.

The authenticated full replay produced 649,636 coefficients in 110.656
seconds with 886,644 KiB peak RSS.  There are 499,420 nonzero coefficients and
the largest absolute value occupies 62 bits.  The resulting JSON is 11 MiB.
These are development-host replay measurements, not qualified PARI/Sage.js
timings.

The final proof orders the 796 tail rows first, applies the authentic
determinant-one `3 x 3` Smith left transform to the three class rows, and puts
the seven kernel rows last.  Independently, the checker:

- multiplies the complete emitted `806 x 806` matrix `U` through the authentic
  `806 x 799` raw relation matrix and the independently reconstructed
  `799 x 799` matrix `V`;
- checks all 643,994 cells of `U R V = D`;
- computes exact FLINT determinants `det(U) = -1` and `det(V) = -1`;
- checks the Smith diagonal has 797 ones followed by 8 and 24, hence order
  192 and invariant factors `[8, 24]`; and
- rejects a mutated regenerated-ancestry coefficient through exact replay.

The resulting material hashes are:

- `D`: `0f59ce6bf71550e788c2ae8349ce415360e5c6cd04320fd5ba2cf79e6c684dba`;
- `U`: `819bcfe2bba45872fdcb529f8c1b7f55963012d9fb038c9fee9268ad180d7db8`;
- `V`: `92efd71d2a319bd88bfd4ab089d726ea074d2841df2b516ea5082426a8276613`.

The exact source identities include correspondence result
`edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2`,
accepted relation owner
`9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65`,
factor metadata
`cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684`,
and raw relation matrix
`011be48f351b237a725ddd6561da15cd8194539b4a3aea0754ed50ccc070ff08`.

Reproduce the two bounded steps with:

```bash
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 \
timeout 900 prlimit --as=4294967296 --rss=4294967296 --cpu=900 -- \
node bench/pari-class-group-port/row14_terminal_class_witness_coordinator.cjs \
  /tmp/row14-accepted-owner/row14-accepted-9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65.json.gz \
  /tmp/row14-factor-metadata-latest.json \
  /scratch/row14-full-ancestry.json --audit-full-ancestry

OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 \
timeout 900 prlimit --as=4294967296 --rss=4294967296 --cpu=900 -- \
node bench/pari-class-group-port/check_row14_full_raw_smith_ancestry.cjs \
  /scratch/sagejs-row14-fresh-registry-7wM3U3/\
row14-prepared-complete-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json \
  /scratch/row14-full-ancestry.json
```

This proof closes the previously recorded `641,576`-coefficient left-ancestry
gap.  It does not change the separate unit-materialization, arbitrary ideal
map, or public completeness claims.
