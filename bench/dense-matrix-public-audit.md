# Dense matrix public audit

Run the reproducible audit from the repository root:

```sh
node bench/dense-matrix-public-audit.cjs --quick --runtime sagejs --check
node bench/dense-matrix-public-audit.cjs --runtime all --check
node bench/dense-matrix-public-audit.cjs --full --runtime all --check
```

The first command is a roughly five-second focused correctness and reporting
contract. The routine command is a roughly thirty-second Sage.js/SageMath
comparison. `--full` uses substantially larger matrices and five warm samples;
it is intended for explicit performance investigations rather than routine
testing. `SAGE` may select a SageMath executable.

The output is machine-readable JSON with explicit host, revision, workload,
runtime, domain, and operation fields. Each domain runs in a fresh process.
The report separates total fresh-process time, estimated bootstrap time,
order-dependent first-measured time, and warm median/minimum/maximum. The
first-measured value is **not** a cold operation measurement: operations run
serially within a domain process, so an earlier operation may already have
loaded the same backend. Every timed result is consumed
by a semantic witness: complete round-trip traversal for random construction,
sampled entries for structural operations, exact matrix
identities for solving and kernels, and known results for rank, RREF,
determinant, and characteristic polynomial. Destructive or cacheable algorithms
receive a fresh matrix copy on every invocation.
That copy is inside the timed window and the report labels these cases
`copy-plus-operation-on-fixed-source`. Reusing one fixed mathematical source
makes samples comparable while preventing cached result reuse.

Backend routes are collected only between an explicit trace begin/end pair
around each timed invocation. Setup and result verification happen outside that
window and therefore cannot be misattributed to the operation under test.

## Initial audit, 2026-08-12

The first full Linux x64 run at revision `e2ad41d` used Node 26.7.0, SageMath
10.9.post1, and one BLAS/OpenMP thread. Exact timings vary with host and load;
the reproducible JSON report is authoritative. The durable conclusions were:

1. **Large-word-prime construction and mutation need one canonical resource
   lane.** Constructing a 500 by 700 matrix over `GF(2^61 - 1)` from `range`
   took about 2.28 seconds warm versus 143 ms in SageMath. The same public
   representation cannot perform `swap_rows` or `swap_columns`, raising
   `NotImplementedError`. Those are correctness/capability defects, not merely
   crossover tuning.
2. **Large-word-prime execution is opaque.** Eleven successful operations,
   including multiplication, RREF, determinant, solve, and kernel, emitted no
   `SAGEJS_NATIVE_TRACE` classification. Several were already dramatically
   faster than this SageMath build, so the next lane should preserve that
   algorithmic strength while making representation and backend selection
   explicit.
3. **Direct swaps are the clearest fixed-size regression.** At 700 by 900,
   `GF(2)` row/column swaps took roughly 10--14 ms in Sage.js versus about
   0.008 ms in SageMath. Small-prime swaps were about 3--8 ms versus
   0.13 ms. The trace shows matrix selection/reconstruction, confirming that
   the public operation copies or rebuilds a complete matrix instead of doing
   an in-place backend swap.
4. **Binary random fill deserves a controlled follow-up.** `GF(2)` random
   construction was a visible part of Sage.js's local full-mode workload. The
   audit intentionally makes no Sage/Sage.js ratio claim for this operation,
   because the public generators do not promise identical distributions. A
   dedicated benchmark with common pre-generated random bits would make this a
   clean, bounded packed-kernel investigation.
5. **Exact resources validate the hybrid architecture.** `ZZ` and `QQ`
   multiplication, determinant, RREF, characteristic polynomial, solve, and
   right kernel were generally competitive with or faster than SageMath for
   the full workloads. Exact list/range construction was also faster after
   warmup. Remaining exact gaps cluster around full-matrix swaps and modest
   add/subtract boundary overhead, rather than mature FLINT algorithms.
6. **Cold timing must remain separate.** Fresh Sage.js processes spent roughly
   0.7--0.8 seconds bootstrapping per domain in the routine run, and first
   measured invocation occasionally paid another lazy compiler/library cost.
   Because the latter is serial and order-dependent, it is evidence for a
   follow-up process-isolated cold-start experiment, not itself a cold timing.

`random_matrix` measurements use each runtime's public generator and native
distribution. They are useful within one runtime, but are deliberately omitted
from cross-runtime ratios because equal seeds do not imply identical data or
distribution across Sage.js and SageMath.

## Prioritized follow-up

1. Complete a generated arbitrary-word-prime matrix resource or equivalent
   packed representation that supports bulk range ingress, swaps, and traceable
   resource-to-resource algorithms without losing the current fast backend.
2. Wire direct resource/packed row and column swaps for `ZZ`, `QQ`, `GF(2)`,
   and small word primes. This should replace selection-and-reconstruction.
3. Profile and batch the `GF(2)` random-fill path at 500 by 700 and larger.
4. After those representation fixes, reconsider packed add/subtract crossover
   and per-call overhead. Do not optimize sub-millisecond routine cases before
   the capability holes above.
5. Retain JSON reports on Linux x64, Linux arm64, and Darwin arm64 rather than
   hard-coding this host's crossover into public dispatch.
