# Row 6 whole-prepared closure status

The prepared-input prefix has advanced from two child-process owners to one
source-transparent native graph. `row6_phase6_prepared_prefix_root.generated.py`
calls the real row-6 factor-base root and passes bounded views of its live
outputs directly into the real initial-relation root. Its exact check runs
under the 4 GiB / 600 second limits and reproduces factor dimensions
`(C1,C2,KC,KCZ)=(9196,9196,1130,740)`, 203 initial relations, target 1,137,
need 934, missing 927, and the exact RNG owner. There is no subprocess,
filesystem owner, JSON, or mapping boundary between these two stages.

The terminal side is likewise connected: the earlier resident root now joins
analytic work, post-HNF acceptance, Smith invariants, rank-two units, exact
factor-base reconstruction, all 1,137 principal equations, and class-witness
projection in one native call.

These two graphs are not yet one whole prepared kernel. The remaining middle
is structural rather than a scalar-mapping problem:

1. Gate C deliberately releases collector scratch before allocating the
   initial HNF graph, restores collector scratch afterward, and allocates each
   continuation HNF from live dimensions. Those owners are not one prepared
   invocation.
2. Collector relations are exact buffers, while the current HNF roots consume
   signed-64 matrices. Their current bridge is a host `toArray()` plus a new
   allocation. Exact buffers have borrowed views; signed-64 buffers do not.
3. Column ancestry separately reruns the HNF schedule because Gate C does not
   retain the cleanup/HNF transformations needed for reverse replay.
4. The fused terminal invocation is allocated only after Gate, factor, and
   ancestry have been projected into mapping-shaped owners.

Consequently timing remains disabled. Timing either the connected prefix, the
connected suffix, or the existing correctness transaction would measure a
surrogate.

The next implementation is tightly specified: build one bounded private Gate-C
root whose private helper calls give collector/HNF scratch sequential
lifetimes; copy or borrow the needed signed-64 relation spans inside that root;
retain reverse-HNF transformations during the genuine HNF calls; and pass the
resulting relation, log, HNF, class, and unit buffers directly to the fused
terminal root. No new mathematics or mapping ABI is required.

Run the exact prefix and obstruction checks with:

```bash
prlimit --as=4294967296 --cpu=600 -- \
  node --expose-gc \
  bench/pari-class-group-port/row6_phase6_prepared_prefix_check.cjs
node bench/pari-class-group-port/row6_phase6_whole_prepared_obstruction.cjs
```
