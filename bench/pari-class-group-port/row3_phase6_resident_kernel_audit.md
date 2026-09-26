# Row 3 Phase 6 resident class-and-unit kernel audit

Row 3 now has a bounded resident prepared boundary covering the mathematical
relation, HNF, class-group, regulator, compact-unit, and provenance work.
`row3_phase6_resident_input.cjs` derives fresh owner shapes from the prepared
input, the 668-element factor base, the 675-relation target, and the
6,800-relation reserve. It does not read W0, retained relations, a terminal
answer, or an oracle result.

`row3_phase6_resident_kernel_host.cjs` authenticates the prepared authority,
compiles once, allocates once, and resets outside the clock. Its timed region
contains two direct native calls with no filesystem access, subprocess,
serialization, allocation, replay, inspection, or publication:

- `pari_resident_generated_class_attempt` collects 675 relations and completes
  the source HNF/analytic/class path;
- `pari_row3_phase6_resident_unit_suffix` completes the rank-two unit bridge,
  validates its regulator, runs `getfu(LARGE)`, reverses the retained HNF, and
  publishes exact compact and raw-relation unit provenance.

Under the mandatory 4 GiB address-space and 600 second CPU limits, the
resident boundary produces:

- bounds `(C1,C2,KC,KCZ,KCZ2,KC2) =
  (5301,5301,668,446,446,668)`;
- HNF state `[2,9,666,0,7,69,0,675,0]`;
- class number 6 with invariant factor `[6]`;
- a nonzero rank-two regulator;
- `getfu` state `[2,0,0,22,0,0,0,0]`;
- compact unit transform
  `[3,-2,3,0,0,0,0,-2,1,-2,0,0,0,0]`;
- 1,350 exact raw-relation provenance coefficients.

An independent post-clock replay agrees coefficient-for-coefficient with both
unit transforms, proves unit norms `[1,-1]`, real signs
`[+,+,+,-,-,-]`, raw-relation annihilation, principal-relation norm replay,
and principal-generator signs. The exact `LARGE` representation is retained
as factored/provenance data rather than expanded into enormous algebraic
integers, matching the deliberate compact materialization mode.

A representative local bounded run measured about 12.5 seconds for the whole
resident Sage.js boundary. The earlier resident PARI reference was about
0.73 seconds. These are development-host observations, not qualified panel
timings, and no ratio is published.

Run the two-invocation bounded check with:

```sh
node bench/pari-class-group-port/row3_phase6_resident_kernel_check.cjs
```
