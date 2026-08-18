# Public maximal-order timeout recovery delta

This checked delta reruns exactly the 34 timeout IDs retained by the bounded b60ed9aa standard-corpus artifact. It uses the same five-second public policy after certification acceleration at c1b31206. Timeouts remain ordinary bounded outcomes, never correctness failures. The JSON companion retains every raw adapter record, returned basis, sample, stage trace, RSS observation, and independent verification result.

## Identity and policy

- New Sage.js commit: `c1b3120639048c19e0a527584032b6de5f69df80`
- Baseline Sage.js commit: `b60ed9aa0af59f08be3caa258503e5ff9dcff092`
- Baseline artifact SHA-256: `bee8e202e83a6ff289c50317b8c87d2e56e7b2ca5b360384abf475216693a640`
- Generated: 2026-08-17T22:35:23.994Z
- Host/OS: project-52d00914-04c1-4c7a-83d6-69240c2570f1; Linux 6.17.0-1022-gcp (linux-x64)
- CPU: AMD EPYC 7B13; 16 logical CPUs
- Node: v26.7.0
- Native addon SHA-256: `6d91384d5c11df6be128ed87d3defe09eb50fe9bffdf21782e9a0401195fcb48`
- Corpus manifest: `cf66e794684801d794410cd982dcac220f1fbb415ff04c9d6f65705153eadb2d`
- Policy: persistent worker, fresh field/request, 0 warmups, 1 sample, 5000 ms/request, 4096 MiB

## Checked delta

- Prior timeout cases rerun: **34**
- Recovered with independently verified exact lattices: **3**
- Still timed out at five seconds: **31**
- Other terminal states: **0**
- Wrong/invalid lattices: **0**

Recovered case IDs:

`pari-round4-vector-001`, `pari-round4-vector-002`, `pari-round4-vector-008`

Still-timeout case IDs:

`pari-round4-vector-007`, `pari-round4-vector-010`, `pari-round4-vector-104`, `pari-round4-vector-139`, `pari-round4-vector-152`, `pari-round4-vector-168`, `pari-round4-vector-169`, `pari-round4-vector-174`, `pari-round4-vector-180`, `pari-round4-vector-188`, `pari-round4-vector-200`, `pari-round4-vector-250`, `pari-round4-vector-267`, `pari-round4-vector-273`, `pari-round4-vector-280`, `pari-round4-vector-285`, `pari-round4-vector-286`, `pari-round4-vector-307`, `pari-round4-vector-314`, `pari-round4-vector-365`, `pari-round4-vector-419`, `pari-round4-vector-420`, `pari-round4-vector-421`, `pari-round4-vector-422`, `pari-round4-vector-423`, `pari-round4-vector-424`, `pari-round4-vector-425`, `pari-round4-vector-426`, `pari-round4-vector-429`, `hecke-degree-90`, `hecke-precision-degree-12`

## Vector 010 diagnostic

Vector 010 still timed out under the uniform five-second policy, so it was rerun in a newly spawned worker with a 30000 ms bound. Diagnostic state: **timeout**; exact lattice verified: **not available**.

## Stage signal for recovered cases

- `native-local-orders`: 2574.459 ms total across 3 recovered cases; max 1220.250 ms at `pari-round4-vector-002`
- `global-certification`: 2511.522 ms total across 3 recovered cases; max 1417.667 ms at `pari-round4-vector-008`
- `discriminant-decomposition`: 139.801 ms total across 3 recovered cases; max 84.123 ms at `pari-round4-vector-002`

## Interpretation

Every recovered row passed the same independent containment, closure, discriminant/index, and canonical-lattice checks as the original artifact. A still-timeout row means only that the fixed resource budget expired. This delta does not substitute longer diagnostic timings into the uniform five-second outcome.
