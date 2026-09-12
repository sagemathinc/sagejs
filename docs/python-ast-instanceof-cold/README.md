# PR248 compiler-only cold mpmath experiment

2026-09-12, reserved idle bench-1. No remote build. Isolated copies of retained
exact c4c126d09 runtime tree; recursive diff verified only compiler.js and
src/ast_types.py differ. This is compiler isolation, NOT full candidate product
qualification. Baseline built Node26.7; candidate built Node26.8.1. Both executed
the same Node26.7 binary (SHA256 ad19784f7e90ba789a099eccba77ede8dc90a778c424f1c10a70fed3ff903fdc).

Baseline compiler42159115d5f2ff666423bd6c92e6781e049a98679226dc076f093754f28f8d64;
candidatefe8484106aacfccec3e413d16ba2efc960a54eaf607cededd68c2f79c3240046,
PR248 commit786d23b1b. Existing qualified source/artifacts were not modified.

All87 mpmath source hashes match prior wheel-qualified report
/tmp/sagejs-mpmath-pair.2XMOsa/report.json. Each launch had new HOME/cache/temp
and an explicitly empty precompiled module-cache directory. Runtime resources
were byte-identical. Exact compiler and Node hashes enforced by driver.

Unchanged30s gate: both timeout (30.075 and30.077s). Gate remains OPEN.
Predeclared independent-process ABBA non-gating90s phase runs all correctly
completed sqrt(2) and zeta(2) checks. Import seconds:

- Baseline45.8603, candidate42.7323.
- Candidate43.0609, baseline46.2457.

Candidate import is6.82%/6.89% lower in the two order pairings (about3.1s).
Total process seconds46.7378/43.7163/44.0153/47.1579. Arithmetic itself stays
approximately4–5ms; this is cold import/compiler evidence, not arithmetic gain,
CPython ratio, shipped-precompiled-path measurement, or cliff closure.

Raw report SHA256 f1ded8b059e6762be50b943cc0cabe43fc0bdd4f4e04b848dbc4dee3a58f283a.
The checked-in report adds a final newline only, SHA256
615985052d5d6535d9e2d01ad3f329ea49db4328659cc0a31da99c2106817425.
To reproduce, provision the exact compiler/runtime trees as `baseline/` and
`candidate/` beside this driver, then execute `run.cjs` with the stated Node
binary. Those large build resources are deliberately not committed here.
Remote evidence: bench-1:/home/user/sagejs-ast-cold.ryME7r. Host released after
all six planned processes exited; no measurements retried or omitted.
