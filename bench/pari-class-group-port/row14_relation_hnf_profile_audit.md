# Row-14 relation/HNF profile

This is a bounded diagnostic of the `89.392067233 s` aggregate recorded by
`row14_matched_kernel_clock_audit.md` at commit `f6c99d9a8`. It is not a new
performance receipt and it does not change the matched clock. The qualifying
profile loads the same resident native graphs first, compiles and warms its
diagnostic variants outside the measurement, and then executes the exact
prepared-root-to-806-column Gate-C path once under the usual 4-GiB/600-second
limits.

The benchmark-only `diagnostic_stage_switch` calls compile to no-ops in every
ordinary build. They acquire a native monotonic clock only when
`diagnosticStageClock` is explicitly requested. JavaScript clocks surround
native calls and the existing allocation/materialization steps. Every native
trace is accepted only if its visits and per-stage totals both conserve the
root clock.

## Exactness

The instrumented path reproduced the authentic checkpoints

```text
802  [3,10,792,4,7,105,0,802,0]
804  [4,11,793,2,7,1,0,804,0]
805  [2,9,796,1,7,3,0,805,0]
806  [3,10,796,0,7,0,0,806,0]
```

and the continuation outputs `[804,805,805,805,805,805,806]`. The final
relation state is `[806,8110,0,0,806,806]`; the combined relation/HNF/log/RNG
digest is
`1c669dd03269ef25e1c79e08c104f416062465380964515c6079902a96aacfef`,
and the immutable terminal RNG digest is
`c1084b71784a5c2d2769417798403180447aee7620f68d264b34e25c8e3414ad`.
Peak RSS was `1,623,624 KiB`.

## Where the aggregate goes

The qualifying diagnostic took `84.789463075 s`, 5.15% below the earlier
single `89.392 s` observation. This is close enough to explain the aggregate,
but neither single observation is a qualified timing comparison.

| component | seconds | share |
|---|---:|---:|
| repeated `compileKernel` cache lookup/lowering | 50.162 | 59.2% |
| explicit owner allocation and JS materialization | 12.178 | 14.4% |
| twelve native mathematical roots | 19.210 | 22.7% |
| control, publication, and unattributed host work | 3.239 | 3.8% |

The word “compile” is not a cold native build here. All four diagnostic addons
were built and loaded before Gate C. Nevertheless the second calls spend
`17.082 s` on the collector graph, `4.015 s` on `hnfspec`, `25.619 s` on the
continuation-control graph, and `3.446 s` on `hnfadd`. The compiler recomputes
large source/dependency/IR information before discovering or loading its
content-addressed addon. This work was inside the earlier matched Gate-C
aggregate as well, because Gate C itself calls `compileKernel`.

The native roots decompose as follows:

| native stage | seconds |
|---|---:|
| sparse cleanup in first `hnfspec` | 6.828 |
| initial and retry relation collector | 5.781 |
| `hnffinal` (first HNF plus three additions) | 4.401 |
| first-HNF assembly and log transform | 1.779 |
| relation log embeddings | 0.310 |
| CUP rank | 0.063 |
| all remaining native stages | 0.048 |

The initial collector root is `5.952 s`. The first `hnfspec` is `13.006 s`.
The seven continuation collectors together take only `0.139 s`, including the
four genuine stalls. The three `hnfadd` roots together take `0.113 s`.
Therefore incremental HNF arithmetic is not the cause of the large aggregate;
the first sparse cleanup/HNF is the only substantial native HNF computation.

## Storage and conversion evidence

Before the initial collector, the host constructs 154 typed buffers containing
7,416,701 elements and charges 102,083,908 bytes; populating them costs
`5.251 s`. The initial HNF reserves 44 buffers, 14,713,142 elements and a
conservative 1,436,633,832 bytes. Its zero/lazy allocation costs only
`0.222 s`.

Each nonempty continuation currently rebuilds zero-filled JS arrays, converts
them to typed owners, and then discards them after publication. The three
`hnfadd` batches own 14.1, 13.7 and 12.4 MB, but their JS
materialize-and-allocate steps cost `2.344`, `2.197` and `2.164 s`: `6.705 s`
for `0.113 s` of native arithmetic. Each of seven retries also reconstructs
eight exact and six `int64` control owners, although these smaller owners cost
only tens of milliseconds in total.

Generated-code inspection gives a second, independent boundedness signal:

| root | reachable functions | generated C | native scalar `mpz_t` params | `mpz_set*` sites | exact arithmetic sites |
|---|---:|---:|---:|---:|---:|
| collector | 174 | 34.2 MB | 19 | 11,105 | 3,202 |
| `hnfspec` | 39 | 14.3 MB | 4 | 3,865 | 1,740 |
| `hnfadd` | 28 | 10.2 MB | 6 | 2,758 | 1,059 |

All three graphs have zero private clones and zero automatic selections in the
compiled artifact. The `.gmp` entry used by Gate C therefore carries loop
dimensions and control scalars as `mpz_t`. Across the three generated graphs
there are 3,289/1,685/1,355 integer-buffer index sites respectively (including
938/444/339 explicitly `mpz`-indexed sites), plus 557/278/221 exact-buffer
loads into `mpz_t` and 858/504/440 checked loads into `int64`. The compiler also
emits a complete tagged version beside every exact version, contributing to
404,143, 170,600 and 122,007 lines of generated C, but Gate C explicitly calls
the GMP root and cannot exploit the tagged policy advertised for `hnfadd`.

The generated effects correctly say the native roots themselves
`mayAllocate=false`; the expensive allocation in this experiment is at the
host-owner boundary, not hidden `malloc` inside the mathematical loops.

## First optimization campaign

The two highest-confidence general mechanisms are:

1. **Make content-addressed compilation genuinely resident/cache-fast.** Cache
   the lowered dependency graph and loaded function handle by source authority,
   and let a prepared computation retain those handles. A cache hit must not
   parse, lower, regenerate, or re-inspect a 174-function graph. This directly
   targets 50.162 measured seconds without changing mathematics.
2. **Give a prepared native transaction reusable typed storage.** Validate
   shapes and capacities once, retain collector/HNF/append owners across calls,
   and reset logical lengths instead of constructing millions of JS values and
   fresh typed owners. In particular, never materialize `Array(size).fill(0n)`
   before an output-only native buffer. This directly targets 12.178 measured
   seconds and follows PARI's stack-reuse discipline without exposing unsafe
   storage to public Python.

After those mechanisms, the next compiler campaign is clear rather than
speculative: clone the private call graphs after the checked boundary and
propagate bounded machine-sized loop dimensions, indices, and status values.
That campaign should compare the same conserved leaf clocks, starting with
the 6.828-second sparse cleanup, 5.781-second collector, and 4.401-second
`hnffinal` leaves. It should not begin by optimizing the 0.113-second
incremental `hnfadd` arithmetic.

## Reproduction

```bash
/usr/bin/prlimit --as=$((4*1024*1024*1024)) --cpu=600 -- \
  node bench/pari-class-group-port/check_row14_relation_hnf_profile.cjs
```

The checker loads the complete matched resident graph and warms diagnostic
addons before starting Gate C. Diagnostic compilation, authentication, result
hashing, and this report are outside every native stage clock and outside the
formal matched timing receipt.
