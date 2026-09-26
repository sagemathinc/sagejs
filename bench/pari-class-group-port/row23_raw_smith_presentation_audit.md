# Row 23 raw rectangular Smith presentation

The live row-23 HNF call retains more than the terminal `W=[6]`: while that
call remains alive it owns the complete 40-by-31 relation matrix in both
`hnf_original` and `relation_records`.  This lane derives a full rectangular
Smith certificate directly from that same-run owner.

`row23_raw_smith_presentation.py` performs transformation-tracking integer
Smith reduction and publishes row-major matrices with the exact dimensions
required by output-evidence v2:

```text
U  40 x 40
W  40 x 31
V  31 x 31
D  40 x 31
```

It also publishes every primitive row and column operation.  The producer
accepts no expected class number, invariant list, terminal HNF, retained
answer, or W0 path.  Its sole mathematical input is the raw relation matrix.
The result has 30 unit diagonal entries followed by 6.

The focused checker opens the immutable prepared-only corpus item (which
contains no relation or answer), computes the factor base and relations
afresh, and invokes the proof bridge before the live owners leave the process.
Its JavaScript replay starts again from `W` and identity
matrices, validates the determinant-one Bezout identity of every pair
operation, replays all primitive transformations, and compares the resulting
`U`, `V`, and `D` byte-for-byte.  Thus `U` and `V` are independently known to
be unimodular and `U W V = D` is independently replayed.  Input and operation
mutations are rejected.

This closes only the raw presentation-proof gap.  Relation logarithms and the
factor/reduce/combine maps remain separate output-evidence gaps.  No public,
timing, or qualification claim is made.

Run with a lane-private native cache:

```bash
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache-row23-raw-smith \
SAGEJS_NATIVE_CACHE_ROOT=/scratch/sagejs-native-cache-row23-raw-smith \
node bench/pari-class-group-port/check_row23_raw_smith_presentation.cjs
```
