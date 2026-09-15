# Generated resident candidate: first paired baseline

This measures the corrected one-call resident candidate against the adapted
PARI 2.17.4 reference described in `resident_attempt_reference_audit.md`.
It is not a full `bnfinit` comparison or a broad competitiveness result.
The exact frozen records are in `resident-paired-20260915.json`.

The input is the prepared maximal-order real cubic `x^3 - 20018*x + 20034`,
at 192-bit working precision. Both sides compute the eager degree catalog,
initial factor base, ideal packets, subfactor selection, analytic inverse hR,
relations, HNF, regulator acceptance and invariant-only output. No computed
class or factor-base answers are supplied to either timed computation.

Seven alternating pairs ran on CPU 15, one BLAS/OpenMP thread, with no agent
build running. This is still a shared host: affinity alone does not prove
machine-wide isolation, so the machine-readable `qualifiedTiming` remains false.
Each arm has three fresh warmup calls per pair. Pilot-fixed batches contain
four native calls or 160 PARI calls; each retained batch exceeds one second.
Native owners are freshly allocated per pair and restored before every call.
Native compilation, module loading, setup, reset and output checking are outside
the kernel clock; reset is reported separately. PARI compute **plus teardown**
is used in the denominator. Setup/packing is not free in an end-user API.

| Pair | Sage.js kernel ms/call | Reset ms/call | PARI compute + teardown ms/call | Kernel ratio |
| --- | ---: | ---: | ---: | ---: |
| 1 | 323.39 | 50.24 | 7.697 | 42.02 |
| 2 | 322.68 | 50.27 | 7.730 | 41.74 |
| 3 | 326.89 | 55.00 | 7.720 | 42.34 |
| 4 | 323.07 | 48.50 | 7.678 | 42.08 |
| 5 | 325.16 | 49.18 | 7.704 | 42.21 |
| 6 | 329.07 | 53.30 | 7.716 | 42.65 |
| 7 | 324.98 | 48.92 | 7.684 | 42.29 |

Geometric-mean slowdown is **42.1889x kernel-only**, or **48.7771x including
reset**. This connected path is not competitive yet. The comparison does not
isolate compiler overhead: representation, allocation, metadata gathering and
log-cache reuse differ as explicitly recorded in the reference audit. Phase
attribution is the next diagnostic, not a conclusion already established here.

Every native call checks class number 1, empty invariants, exact regulator,
73 relations, 1,046 small elements, 96 factor attempts and 16 ideal visits.
Each pair additionally compares degree counts, bounds, factor-base sizes,
subfactor count, inverse hR and all 66 terminal RNG words. PARI checks all
its corresponding values on every repeat. No retained pair was discarded.

The source SHA256 is
`8bfdb3f7685b88f0cbc44c4e4cef11062f2c96962fb8d79dcf5ee8a90ef6cf1e`;
core SHA256 is
`2b5bd02ac3dfe6eab32af9b4c48ba975bd42ccb279a408a6182cf85850d0ee9d`;
native addon SHA256 is
`ffb9fe45977be1ea04cc46032c916b4b3e60e71c2bc9460f7f57afde6c68d090`.
Both generated native C and the adapted PARI control use `-O3`; complete
binding flags, binary/library hashes, host metadata and fixture hashes are in
the JSON. The harness intercepts compilation requests only to load that exact
qualified artifact: there are zero compiler calls during the comparison.

Reproduce after regenerating the checker and release-reference artifacts:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 taskset -c 15 node \
  bench/pari-class-group-port/compare_resident_attempt.cjs \
  INPUTS_JSON REFERENCE_BINARY --cpu 15 --cache-key QUALIFIED_CACHE_KEY \
  --pairs 7 --warmups 3 --port-repetitions 4 --pari-repetitions 160 --run
```

The run used 46.447848 CPU seconds and peaked at 1,370,340 KiB child RSS.
No CPU, memory, owner-capacity or mathematical limit was raised.
