# Public maximal-order standard corpus sweep

This is a checked, single-sample correctness/resource sweep, not a stable performance benchmark. Every timeout is retained as an ordinary bounded outcome. The JSON companion retains every raw adapter record, returned basis, independent verification result, sample, stage trace, RSS observation, and terminal state.

## Identity and policy

- Sage.js commit: `b60ed9aa0af59f08be3caa258503e5ff9dcff092`
- Generated: 2026-08-17T22:15:03.168Z
- Host/OS: project-52d00914-04c1-4c7a-83d6-69240c2570f1; Linux 6.17.0-1022-gcp (linux-x64)
- CPU: AMD EPYC 7B13; 16 logical CPUs
- Node: v26.7.0
- Native addon SHA-256: `6d91384d5c11df6be128ed87d3defe09eb50fe9bffdf21782e9a0401195fcb48`
- Corpus manifest: `cf66e794684801d794410cd982dcac220f1fbb415ff04c9d6f65705153eadb2d`; 443 selected of 494
- Boundary: public `NumberField.maximal_order()` on a fresh constructed field in one persistent Sage.js worker
- Policy: 0 warmups, 1 retained sample, 5000 ms/request, 4096 MiB configured V8 policy

## Checked outcome

- Independently verified exact lattices: **409/443**
- Bounded timeouts: **34**
- Other terminal states: **0**
- Wrong/invalid lattices: **0**
- Successful median / p90: 345.892 ms / 1431.878 ms
- Timing buckets (<100, 100–500, 500–1000, 1000–3000, 3000–5000 ms): 23 / 250 / 54 / 73 / 9

Timeout case IDs (timeouts are not correctness failures):

`pari-round4-vector-001`, `pari-round4-vector-002`, `pari-round4-vector-007`, `pari-round4-vector-008`, `pari-round4-vector-010`, `pari-round4-vector-104`, `pari-round4-vector-139`, `pari-round4-vector-152`, `pari-round4-vector-168`, `pari-round4-vector-169`, `pari-round4-vector-174`, `pari-round4-vector-180`, `pari-round4-vector-188`, `pari-round4-vector-200`, `pari-round4-vector-250`, `pari-round4-vector-267`, `pari-round4-vector-273`, `pari-round4-vector-280`, `pari-round4-vector-285`, `pari-round4-vector-286`, `pari-round4-vector-307`, `pari-round4-vector-314`, `pari-round4-vector-365`, `pari-round4-vector-419`, `pari-round4-vector-420`, `pari-round4-vector-421`, `pari-round4-vector-422`, `pari-round4-vector-423`, `pari-round4-vector-424`, `pari-round4-vector-425`, `pari-round4-vector-426`, `pari-round4-vector-429`, `hecke-degree-90`, `hecke-precision-degree-12`

## Corrected proof-completeness reruns

At `a851dd12`, these five cases failed closed with `fallback factorization returned a prime without a proof`. After resumable deterministic proof discovery and arbitrary-prime polygon routing were integrated, each was rerun in its own newly spawned public worker, on a fresh field, with a 120000 ms bound and independently verified. These corrected runs are separate from the uniform 5000 ms corpus policy.

| Case | State | Public time (ms) | Exact lattice verified |
| --- | --- | ---: | --- |
| pari-round4-vector-168 | ok | 12606.498 | yes |
| pari-round4-vector-250 | ok | 22547.248 | yes |
| pari-round4-vector-285 | ok | 17328.516 | yes |
| pari-round4-vector-314 | ok | 20930.490 | yes |
| pari-round4-vector-365 | ok | 33278.218 | yes |

## Stage signal

- `global-certification`: 144158.563 ms total across 409 completions; max 3327.776 ms at `pari-round4-vector-412`
- `discriminant-decomposition`: 67049.115 ms total across 409 completions; max 1636.402 ms at `pari-round4-vector-353`
- `native-local-orders`: 32879.382 ms total across 409 completions; max 1385.260 ms at `pari-round4-vector-079`
- `composite-local-order`: 10072.043 ms total across 272 completions; max 191.686 ms at `pari-round4-vector-412`

The dominant accumulated stage remains independent global certification. Representative forced `round4` and `polygon` calls both exceeded 20 seconds on vectors 002, 007, 008, and 010; they did not improve the timeout class.

## Interpretation

A verified row proves the returned lattice has the frozen field discriminant/index, canonical lattice digest, equation-order containment, `1`, and multiplication closure. A timeout proves only that the configured 5-second resource policy expired; it is intentionally preserved and excluded from accepted timing statistics. The five historical proof failures are recorded in the JSON as superseded observations, not silently rewritten.
