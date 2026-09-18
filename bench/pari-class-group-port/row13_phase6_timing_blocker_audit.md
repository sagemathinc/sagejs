# Row 13 Phase-6 timing source cut

Row 13 has a correct fresh prepared-input transaction, but not yet a matched
resident clock. `row13_terminal_transaction_host.cjs` owns stage orchestration
and immutable publication in the same callable boundary and exports no
`prepareResident`/`runResident` pair. Timing that transaction would charge
Sage.js for filesystem and replay work absent from `bnfinit0(nf,0)`.

Run `node bench/pari-class-group-port/check_row13_phase6_timing_blocker.cjs`.
The check authenticates the frozen prepared input, rejects a polynomial
mutation, pins the inspected sources, and prints the exact four-step source cut.

