# Row 3 Phase 6 resident-boundary gap

Row 3 has authenticated prepared-input correctness and a pristine resident
PARI 2.17.4 `bnfinit0(nf, 0)` reference adapter. It does **not** yet have an
honest resident Sage.js timing adapter.

The current correct transaction crosses three boundaries which cannot be
included in a matched mathematical clock:

1. `row3_prepared_initial_base_frontier.cjs` compiles eleven native roots and
   executes a JavaScript sequence which allocates and projects an immutable
   factor-base owner.
2. `row3_prepared_relation_hnf_frontier.cjs` compiles the collector, HNF,
   analytic and terminal roots while running, then allocates new native owners
   between calls.
3. Its final unit reconstruction invokes ordinary Python in a subprocess and
   serializes the complete relation/log payload through JSON.

Those operations are appropriate in an untimed correctness transaction. They
are not equivalent to restoring a prepared PARI stack and timing one call to
`bnfinit0`. Timing the existing transaction would charge compilation,
filesystem, subprocess, serialization and publication work only to Sage.js.

The row therefore fails closed for Phase 6 timing. The missing implementation
is a resident in-memory root (or resident call graph) that accepts only the
authenticated prepared NF, retains compiled handles and bounded workspaces,
performs relation/HNF/unit/class work without a subprocess, and returns a
common semantic projection after its clock stops. Until that exists, row 3 is
correctness-covered but timing-ineligible.

`row3_phase6_resident_boundary_gap_check.cjs` authenticates the exact prepared
row, checks the structural blockers above, exercises the pristine PARI helper,
and optionally reruns the existing fresh correctness transaction. It never
reports a Sage/PARI ratio.
