# Packed local-factor stream baseline: Linux x64

This is the current Phase-0 packed-local-stream acceptance measurement.  It is
not the final integrated-source acceptance run: the implementation commit is
`70ed9cdb0ffe8d10c94fb1ef05c3992ebd7e8a5e`, before the performance-lane
changes are integrated.

The machine-readable receipt is
`baseline-local-streams-linux-x64.json`, with SHA-256
`47dc2596250c401b06457fa57358d2a3ac941f16cdc17c955ce5d2f2e71db260`.
Its recorded source status is empty.  Each row contains all seven wall, CPU,
and RSS samples in addition to the summaries below.

## Results

The workload is the packed smalljac coefficient stream for
`y^2 = x^5 + x + 1` over primes in `[3, limit)`, normalized as
`det(1 - T*Frob)`.  No public polynomial objects are materialized.

| Limit | Rows | Good rows | Wall median | Wall MAD | User-CPU median | Peak RSS | Exact packed-stream SHA-256 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10,000 | 1,228 | 1,225 | 57.256 ms | 0.159 ms | 57.283 ms | 95,805,440 B | `22c84c679d21c9e564c7ef960447de5e3c2e32706aa44792bd86015017d70c2d` |
| 100,000 | 9,591 | 9,588 | 1,809.288 ms | 1.103 ms | 1,808.674 ms | 97,509,376 B | `2c71e4b3f978c930f135267cd98dfb072b952e1432c0ef90e1aa831931512894` |

All seven repetitions at each limit produced the same exact digest.  The
`10^5` result is therefore a 1.809-second, 97.5-MB packed traversal baseline,
not an estimate inferred from a shorter interval.

## Environment and timing boundary

- Host: `bench-1`, Linux x86-64, 8 logical AMD EPYC 7B13 CPUs, 33.65 GB RAM.
- Runtime: Node.js 22.22.2.
- Backend: smalljac 4.1.3 through the resident Sage.js FLINT addon.
- Receipt time: 2026-08-23 06:52 UTC.
- Preflight load average: 0.40, 0.69, 0.76, decaying after the previously
  completed exclusive benchmark; the process list had no competing benchmark
  or build process.
- The timer covers one complete packed interval traversal in the already
  resident process.  A small `[3,101)` traversal warms the addon before the
  seven recorded repetitions.

The total process resource record was 13.893 seconds user CPU, 0.037 seconds
system CPU, and 95,224 KiB peak RSS.  Individual raw samples, including the
initial `10^4` CPU-accounting outlier, remain in the receipt; medians are used
for the comparison table.

## Interpretation

This confirms the plan's existing diagnosis: the packed genus-2 local-factor
backend is already a strong boundary.  The next performance target is public
stream construction, serialization, checkpointing, and statistics without
materializing thousands of heavyweight polynomial resources.  The exact same
corpus and digest must be rerun at the final integrated performance commit.
