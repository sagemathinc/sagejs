# Row 19 Phase-6 timing source cut

Row 19 is correctness-complete, but its transaction is intentionally a cold
owner pipeline: several Python subprocesses exchange compressed temporary
owners which are reread and authenticated by the class, compact-unit,
exact-unit, and final coordinators. None of that is inside PARI's resident
`bnfinit0(nf,0)` boundary, so transaction wall time is not a matched result.

Run `node bench/pari-class-group-port/check_row19_phase6_timing_blocker.cjs`.
It pins all five orchestration sources, authenticates the frozen input, rejects
a changed prepared authority, and emits the required live-owner source cut.

