# Row 3 Phase 6 resident-kernel audit

Row 3 can now execute the generic translated prepared root used by rows 1 and
4. `row3_phase6_resident_input.cjs` derives fresh bounded owner shapes from
the degree-three prepared input, the 668-element factor base, the 675-relation
target, and the 6,800-relation reserve. It does not read W0, retained
relations, a terminal answer, or an oracle result.

`row3_phase6_resident_kernel_host.cjs` authenticates the prepared authority,
compiles once, allocates once, and resets owners outside the clock. The timed
region is one call to `pari_resident_generated_class_attempt`. Under the
mandatory 4 GiB address-space and 600 second CPU limits, two successive calls
produced the same state:

- initial bounds `(C1,C2,KC,KCZ,KCZ2,KC2) =
  (5301,5301,668,446,446,668)`;
- 675 accepted relations;
- HNF state `[2,9,666,0,7,69,0,675,0]`;
- class number 6 and invariant factor `[6]`;
- a nonzero rank-two regulator;
- attempt state `[4,0,1,1]`.

The first local bounded check measured about 9.54 and 9.55 seconds for the two
resident Sage.js calls and about 0.728 seconds for the resident PARI
`bnfinit0(nf,0)` call. These are development-host observations, not qualified
timings, and no ratio is published.

## Why row 3 still fails closed for matched Phase 6 timing

The generic resident root ends after analytic acceptance, regulator
reconstruction, and the initial Smith class candidate. It does not execute
row 3's exact compact-unit suffix. The correct fresh transaction currently
runs that suffix in ordinary CPython after serializing the live HNF relation,
generator, and logarithm owners. In particular it performs the rank-two
unit-lattice bridge, `getfu(LARGE)`, the 675-relation factored-unit transform,
exact norm/sign replay, and class-witness reconstruction there.

Therefore the new root is a genuine resident **class-candidate/regulator**
boundary, but it is not the complete prepared class-and-unit boundary required
for a PARI comparison. `row3_phase6_resident_kernel_check.cjs` deliberately
reports `wholeClassUnitBoundaryAvailable: false`, `qualifiedTiming: false`,
and `ratioPublished: false`.

An attempted direct native wrapper around `pari_cubic_unit_bridge_prepare` and
`pari_getfu_real_cubic` exposed the next concrete compiler/storage task: the
compiler does not lower fixed local exact workspaces such as `[0] * 49` in a
typed native root (`expected an integer value, got Tuple[Integer]`). The next
honest implementation should pass reusable integer, float, and int64 arenas
from the host (or add typed buffer views for all three storage kinds), then
run the bridge/getfu/provenance suffix in the same resident call graph. Until
that work lands, timing the new class-candidate root against full PARI would
compare different algorithms and is forbidden.

Run the bounded two-call check with:

```sh
node bench/pari-class-group-port/row3_phase6_resident_kernel_check.cjs
```
