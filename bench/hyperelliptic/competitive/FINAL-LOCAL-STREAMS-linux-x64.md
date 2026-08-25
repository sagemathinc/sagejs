# Final packed local-factor stream receipt: Linux x64

This is the final integrated packed-local-stream measurement. The
machine-readable receipt is `final-local-streams-linux-x64.json`, with SHA-256
`02a8e22f328cc35f3f324fa4e405fb8835aaa31b162e31cbe4fc0ad66c38952b`.
It records source commit `35c4930d505b8230773c8bc450a41cddd4ab2083`.

The workload is the packed smalljac coefficient stream for
`y^2 = x^5 + x + 1` over primes in `[3, limit)`, normalized as
`det(1 - T*Frob)`. No public polynomial objects are materialized.

| Limit | Rows | Good rows | Wall median | Wall MAD | User-CPU median | Peak RSS | Exact packed-stream SHA-256 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10,000 | 1,228 | 1,225 | 56.587 ms | 0.091 ms | 57.107 ms | 95,141,888 B | `22c84c679d21c9e564c7ef960447de5e3c2e32706aa44792bd86015017d70c2d` |
| 100,000 | 9,591 | 9,588 | 1,741.044 ms | 1.516 ms | 1,740.758 ms | 96,845,824 B | `2c71e4b3f978c930f135267cd98dfb072b952e1432c0ef90e1aa831931512894` |

All seven repetitions at each limit produced the same exact digest as the
frozen Phase-0 receipt. Relative to that receipt, the final `10^5` packed
traversal is 3.8% faster (1.741 versus 1.809 seconds) and uses slightly less
peak RSS (96.8 versus 97.5 MB). This is a resident packed-boundary comparison;
public lazy and materialized streams are separate contracts.

## Environment

- Host: `bench-1`, Linux x86-64, AMD EPYC 7B13.
- Runtime: Node.js 22.22.2.
- Backend: smalljac 4.1.3 through the resident Sage.js FLINT addon.
- Receipt time: 2026-08-23 16:06 UTC.
- The host had no competing benchmark or build process; preflight load average
  was 0.03, 0.37, 0.39.
- A small `[3,101)` traversal warms the addon before the recorded repetitions.

The first `10^4` CPU sample includes host scheduling activity and remains in
the raw receipt. Medians are used for the comparison table. No timing row was
removed, and the exact stream digest is checked on every repetition.
