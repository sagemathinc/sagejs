# Python `round` benchmark

`pnpm bench:python-round` compares two-argument `round` in one warm Sage.js
session with one warm CPython process. Both runtimes execute the same Python
source, values, loop shape, warmups, sample count, and checksum. Process startup
is outside every measurement. This is important: starting a new process for
each sample makes Python startup dominate and can make a slow implementation
look competitive.

The default workload makes 100,000 calls for each of `ndigits=0`, `2`, and `6`,
plus an identical loop without `round`. It reports seven-sample medians and the
complete timings remain available in the machine-readable result inside each
runtime. `pnpm bench:python-round:check` also enforces a deliberately broad
reviewed ceiling of 20× CPython. That ceiling is a regression tripwire, not a
performance target.

The scalar builtin is intentionally JavaScript today. A focused `@native`
experiment found that the current compiler rejects Python `round(float, n)`,
`int(float)`, and `floor(float)` as unsupported binary64 operations. An
arithmetic-only scalar native call was about 3.3× slower than equivalent
JavaScript because the call boundary dominated; a 100,000-iteration arithmetic
batch behind one boundary was approximately tied. A native rounding path would
therefore only be promising as a coarse batch after the compiler grows a
correct binary64 rounding primitive. Moving each scalar call across the Wasm or
native boundary would predictably make it slower.

The integration test runs the same benchmark with shorter sampling and rejects
any rounding workload above the reviewed 20× ceiling. This makes an accidental
switch from the ordinary scaling path to BigInt conversion, string formatting,
or a per-call native boundary visible in CI instead of silently shipping a
large slowdown.

The exact slow path is not benchmarked as a headline workload. It handles
decimal ties, extreme exponents, and overflow correctly, and is guarded by the
CPython differential corpus. Ordinary finite values use the scaling fast path;
only ambiguous or extreme cases allocate the exact integer ratio.

## Reference result

On 2026-08-26, with Node 26.7.0 and CPython 3.14.4 on the Linux x64
development host, the default check reported:

| workload | Sage.js warm median | CPython warm median | ratio |
| --- | ---: | ---: | ---: |
| loop control | 14.580 ms | 1.726 ms | 8.45× |
| `ndigits=0` | 216.198 ms | 20.436 ms | 10.58× |
| `ndigits=2` | 134.957 ms | 22.607 ms | 5.97× |
| `ndigits=6` | 136.131 ms | 24.613 ms | 5.53× |

Each row is 100,000 iterations. The control row shows that much of the ratio is
the current Python-loop overhead rather than rounding arithmetic. These are
reference observations, not portable budgets; the 20× check is the reviewed
cross-runtime regression ceiling.
