# Row 23 symmetric prepared-adapter pair

This development-only pair connects row 23 (`5.5.1002836007889.1`) to the
field-neutral Phase 6 worker protocol.  It does not enable qualification,
authorize a timing host, or open any final-reserve field.

## Boundaries

The Sage.js arm is a normalization layer over the reviewed row-23 prepared
root.  Authentication, compilation, owner allocation, reset, projection,
replay, and serialization remain outside its clock.  Its clock contains the
root's one native call from authenticated prepared-`nfinit` data through the
class group and rank-four exact-unit result.

The PARI arm links the authenticated pristine PARI 2.17.4 library.  It creates
`nfinit` once before `READY`.  For every request it restores PARI's prepared
stack, installs the requested seed, and clocks exactly
`bnfinit0(nf, 0)`.  Result projection, terminal-RNG inspection, RSS inspection,
and serialization are after the clock.  Two consecutive executions with the
same seed produced identical terminal RNG state and mathematical output.

Both arms publish exactly this neutral projection:

- polynomial `[341,-970,772,-141,-2,1]` in ascending order;
- class group `Z/6Z`;
- unit rank four, nonempty regulator evidence, and torsion order two;
- flag-zero class-and-unit completion mode.

The projection intentionally does not claim that PARI and Sage.js retain the
same stronger internal witnesses.  It states only the mathematical result
common to both calls.

## Unqualified smoke

One registry-level worker-protocol smoke ran each implementation once and
proved identical output, replay, RNG-scope, and work-counter digests.  Its
receipt is
`/scratch/row23-phase6-unqualified-protocol-smoke-v1.json`, SHA-256
`44b2419707c12c9fcadb107dcc5035e0f4fc103d672790a9c58fbe9418960b44`.
The receipt explicitly records `qualifiedTiming=false`,
`executionEnabled=false`, and `reserveOpeningEnabled=false`; therefore it is
correctness evidence only and publishes no performance conclusion.

The read-only global readiness check is
`/scratch/phase6-readiness-row23-pair-v1.json`, SHA-256
`a294b97f27cae89b3f58c82076c42e3478e602977618ab3330f727f87d296490`.
It admits development rows `0,1,3,4,14,16,23`, leaves nine development pairs
missing, runs no long campaign, and opens zero reserves.
