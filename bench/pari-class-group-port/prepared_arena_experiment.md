# Prepared GMP arena experiment

The baseline allocation diagnostic records 1,006,129 malloc and 471,932 realloc
requests, with 26,156,536 total requested bytes, for one post-warmup prepared
GMP call. This motivates changing temporary allocation discipline while keeping
the GMP arithmetic and mathematical call graph intact.

`prepared_class_group_arena.py` is an ordinary Python wrapper around the existing
prepared attempt. Its explicit signature is checked against the original; every
argument is forwarded unchanged. Its only new operation is a lexical
`NativeExactArena(0, temporary_limit)`. The resident-child budget is zero because
no children are created. External packed owners retain the original policy.

`--arena-baseline` together with `--arena-bytes` invokes the original exported
entry from the same compiled module instead of the wrapper. This permits a
same-build comparison: identical generated helpers and compiler flags, fresh
owners, with the lexical arena as the intended difference. The report records
both options; an arena capacity in a baseline report is not an active arena.

The diagnostic probe opts in with `--arena-bytes`; default execution is
unchanged and only explicit GMP is accepted for this comparison. The diagnostic
ceiling is 128 MiB, under the unchanged 4 GiB process limit. As a provisional
capacity estimate, adding a conservative 64 bytes of header/alignment per
allocation or reallocation to the observed requested bytes gives 120,752,440
bytes, below 128 MiB. This is not a proven bound for other inputs, a higher
algorithmic limit, or permission to accept an exhausted arena. Verify the
allocator header/alignment assumption before execution.

The current compiler's speculative reservation multiplier makes this capacity
unsuitable under the process limit. A separately tested compiler correction is
required to reserve only effective capacity for nonretryable externally mutating
calls, while preserving replay-safe behavior. No arena performance result is
claimed until that correction and the complete prepared replay pass.

Failure must propagate before outputs are interpreted. An exhausted wrapper
may already have modified external buffers; the probe must terminate that run,
not reuse its apparently accepted output or retry it. Fresh runs restore all
owners from the original fixtures. Existing result, regulator and work-count
assertions remain outside measurement windows.

The CPython forwarding/exception test uses a stub callee and therefore proves
only wrapper mechanics. It is not an end-to-end mathematical replay. Native
lowering initially rejected an imported alias; the wrapper now uses a distinct
entry name and an ordinary unaliased import instead of expanding compiler scope.

Native IR lowering then passed for 243 functions (the prior 242-function graph
plus this wrapper). The wrapper has one native call, zero arithmetic operations,
one arena scope, and no owned children. Effects identify external writes and
`replaySafe: false`; the tagged entry is explicitly a GMP workspace bridge.
Lowering cost 34.095668 CPU seconds. This verifies admission and effects, not
compiled execution or allocator performance.

The full CPython wrapper replay also passes on the frozen prepared input:
class number 3, invariant factors [3], exact regulator words, 58 relations,
491 small elements, 54 factor attempts and 12 ideal visits. Reproduce with
`check_prepared_arena.py INPUT_JSON`. This checks the actual mathematical
callee, unlike the forwarding stub test; CPython does not use the native slab,
so it still cannot qualify the allocator implementation or its speed.

## Native result: correct, but slower

With compiler dependency `283df6d65`, the complete native arena call succeeds
under the unchanged process limit. `arena-first-native-20260915.json` records
the first replay and build cost: 313.84 CPU seconds, 3,200,928 KiB peak child
RSS, and exact output/work agreement. Core SHA-256 is
`5286a0ffe9630de1f8d8caca0b315315ccb98232845a243349279f201cc7ab9e`.

The same-build alternating comparison in `arena-paired-20260915.json` uses CPU
15, one BLAS thread, three pairs and 20 fresh computations per sample. Every
sample exceeds one second. Input/source/core hashes and all owner policies
match. Reset and setup remain outside the kernel totals; arena creation and
destruction remain inside. This shared-host diagnostic is not PARI qualification.

| Pair | Baseline ms/call | Arena ms/call | Arena / baseline |
| --- | ---: | ---: | ---: |
| 1 | 114.77 | 143.79 | 1.253 |
| 2 | 109.05 | 143.92 | 1.320 |
| 3 | 112.96 | 142.66 | 1.263 |

The geometric-mean ratio is 1.278: this arena is about 28% slower on the measured
prepared field. It is not a successful optimization and is not selected by
default. The negative result does not refute the allocation finding: this
whole-call bump allocator neither reuses individual freed spans nor retains its
slab between calls. Memory traffic and page faults are hypotheses for the next
diagnostic, not yet established causes. Measure them before proposing reuse.

## Page-fault diagnostic

`arena-page-faults-20260915.json` records three post-warmup fresh calls per arm,
using the same core, input and owner policy. The bump arena records 56,274 minor
faults total (18,758 per call), versus zero for the baseline. Both record zero
major faults and preserve all exact results and work counters. Owner resets are
outside the fault window. The counters are process-wide `resourceUsage` deltas,
not thread-local samples; timing bookkeeping is also within their window.

This supports investigating fresh-page churn in the arena; it does not measure
DRAM bandwidth or prove that page faults explain the entire slowdown. A bounded
next experiment is checkpoint-local reuse of freed small blocks, preserving
allocator ownership, realloc contents, cleanup and resource limits. The change
must pass allocator controls before another full native comparison.

## Small-block reuse follow-up

Compiler dependency `ec2a93ed9544d1c0e56106a1611bad61af0b4b53` adds
checkpoint-local free lists for exact aligned spans up to 512 bytes. Realloc
retains its physical span on shrink, grows in place when it fits, and recycles
a moved block only after copying its contents. Recycling uses the original
checkpoint owner, including when a nested checkpoint is active. Larger freed
spans remain bump-only; slabs are still released at the end of each call.

Focused allocator and generated-backend controls pass, including UBSan,
boundary sizes, neighboring live blocks, nested ownership, moving fallback,
and sticky exhaustion. Independent review corrected a C++ pointer conversion
before the final allocator replay. These controls do not establish a speedup.
The full prepared computation must be rebuilt and measured against its
non-arena export from the same compiled module before drawing that conclusion.

`check_prepared_arena_javascript.cjs INPUT_JSON MODULE_CJS [OUTPUT_JSON]`
exercises both actual same-source JavaScript entries on fresh ordinary arrays,
checking the class number, invariant factors, regulator, state, and work counts.
Its reported single-call times are explicitly not qualified measurements.

### Reuse result

`arena-reuse-first-20260915.json` records successful full native execution on
the same frozen field and work. Rebuilding cost 316.42 CPU seconds and peaked
at 3,201,048 KiB child RSS under the unchanged 4 GiB address-space limit.
The generated core is 58,295,392 bytes, SHA-256
`5f27b6bda505603f999e5f492aff7a32b8f8bd50ec7817428fe6d3fd005f9d7a`.
The three-call diagnostic has 24 minor faults total, versus 56,274 for the
earlier bump-only arena. Both same-source JavaScript entries also pass, with
fresh inputs and identical state, exact regulator and collection counters.

`arena-reuse-paired-20260915.json` repeats the same-build comparison on CPU 15,
one BLAS thread, AB/BA/AB, 20 fresh calls per sample and one excluded warmup. Input,
source, core, owner policies and exact results agree across all six samples.
Every timed sample exceeds one second.

| Pair | Baseline ms/call | Reuse arena ms/call | Arena / baseline |
| --- | ---: | ---: | ---: |
| 1 | 110.052 | 90.414 | 0.822 |
| 2 | 114.186 | 89.809 | 0.787 |
| 3 | 107.168 | 90.045 | 0.840 |

Geometric-mean ratio is 0.815793: **18.4% less kernel time** on this field.
The three arena samples have 160, 196 and 161 minor faults across 20 calls
each; baseline samples have 21, 16 and zero. All major-fault counts are zero.
Reset costs remain separately reported and excluded from these kernel totals.

This is a successful local allocation-discipline experiment, not whole-engine
or cross-platform qualification. No new matched PARI timing was taken in this
comparison; the large earlier PARI gap is not closed. The reduced page churn
and improved timing support the reuse change, but do not identify the entire
remaining cost. Public dispatch remains unchanged. Architecture checks retain
the separately documented stale optimizer-manifest failure.

The allocation interposer controls and complete replay also pass with reuse;
`arena-reuse-allocation-counts-20260915.json` retains both warmup and measured
counts. The post-warmup call records **30 malloc, zero calloc, zero realloc,
and 29 free calls**, with 73,776 malloc-requested bytes. This includes the
unchanged callback/bridge boundary, without subtracting its empty-call control.
It does not count each internal arena allocation as a libc allocation or count
direct mmap as malloc. The earlier baseline recorded 1,006,129 malloc and
471,932 realloc calls. Exact output/work and input/core hashes still match.

Thus the remaining approximately 90 ms cannot be attributed primarily to those
removed libc calls. Arena bookkeeping, exact-value initialization and copying,
arithmetic, and other generated-code work remain candidates. Profile the new
core before choosing the next compiler change; these counts alone do not
distinguish them. The instrumented call's time is not used in the paired result.
