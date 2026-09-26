# Matched prepared-path allocation counts

This diagnostic measures calls to dynamically interposed glibc allocation
entry points, not mathematical correctness, live memory, or speed. It forwards
to the original glibc allocator and does not replace GMP memory hooks. Counts
are calling-thread-local. Internal libc paths that bypass interposable symbols
are not claimed covered. Static GMP in the sampled addon imports the allocation
symbols dynamically; static linking alone does not exclude its calls.

## PARI 2.17.4 reference

`pari-allocation-counts-20260915.json` records three post-warmup repetitions of
the already matched prepared field `x^3-20010*x+20018`. Each reports:

| Counter | Per computation |
| --- | ---: |
| malloc calls | 670 |
| calloc calls | 0 |
| realloc calls | 0 |
| free calls | 553 |
| malloc requested bytes | 300,704 |

The warmup reports 677 malloc and 559 free calls. The window includes relation
cache initialization through invariant-only SNF. Preparation, reporting and
cache destruction are outside. Therefore unequal malloc/free counts are not
evidence of a leak. The old clock field is instrumented and must not be used
for performance claims.

All class invariants, regulator words and work counters match the previous
reference: class number 3, invariants [3], 58 relations, 491 small elements,
54 factor attempts and 12 ideal visits. Source, library, executable and
interposer identities are recorded. The reference compile/run cost 3.987324 CPU
seconds and stayed within the unchanged 4 GiB address-space cap.

Reproduce with a qualified interposer emitted by
`count_prepared_allocations.cjs`:

```sh
node bench/pari-class-group-port/count_pari_allocations.cjs \
  /tmp/sagejs-prepared-attempt-reference-r6W2XO/fixtures.json \
  /tmp/sagejs-alloc-count-f9EbBw/libsagejs_alloc_count.so
```

Use the normal diagnostic CPU ledger and process limits around this command.
The temporary paths are artifact locations, not committed dependencies. Rebuild
the reference with `check_prepared_attempt_reference.cjs` if absent.

## Sage.js GMP capture

`gmp-allocation-counts-20260915.json` records one warmup and one fresh measured
computation. The post-warmup computation has 1,006,129 malloc calls, 471,932
realloc calls and 1,006,128 frees, with no calloc calls. Requested malloc bytes
are 12,175,864 and requested realloc bytes are 13,980,672. Reallocation requests
are not net growth and should not be interpreted as peak live memory.

The empty callback control records 12 malloc/free calls and 32,920 requested
bytes. No subtraction is made: the Sage.js window includes the call bridge,
whereas the PARI window brackets C directly. The difference in bridge scope is
explicit; the approximately million-call traffic is not attributed to bridge
overhead merely from this control. Exact outputs and work assertions pass.

Known-count allocation controls, thread exclusion and exception restoration
pass. Generated addon disassembly shows static GMP default allocation routines
calling the interposed allocation symbols through PLT entries. Binary hashes,
mapping identities, source/core hashes and the underlying probe report are
archived. Counter overflow is zero. This is a diagnostic capture, not a repeated
performance qualification.

The final PARI rerun using this interposer build is archived in
`pari-allocation-counts-final-20260915.json`; all three post-warmup counts are
unchanged. The initial reference capture is retained for provenance.

These measurements support investigating per-helper temporary storage in both
backends, not only tagged slot reuse. They do not establish how much of the
35x runtime gap can be recovered by changing allocation discipline.

## Tagged capture and comparison

`tagged-allocation-counts-20260915.json` contains the final tagged capture with
the same controls, exact work checks and binary provenance. Its post-warmup
counts repeat the preliminary capture exactly:

| Counter | PARI | Sage.js GMP | Sage.js tagged |
| --- | ---: | ---: | ---: |
| malloc | 670 | 1,006,129 | 1,100,577 |
| realloc | 0 | 471,932 | 680,471 |
| free | 553 | 1,006,128 | 1,100,576 |
| malloc requested bytes | 300,704 | 12,175,864 | 8,981,328 |
| realloc requested bytes | 0 | 13,980,672 | 21,499,184 |

All post-warmup calloc counts are zero. Sage.js includes its synchronous call
bridge and PARI excludes teardown, as described above. No timing conclusion or
whole-engine generality follows from this single prepared-field measurement.

The next experiment should compare GMP with the same GMP computation using
reusable/arena temporary storage. Existing arena speculative virtual reservation
must not cause the trial to exceed the 4 GiB process cap. Any allocator change
needs independent lifetime/failure tests before the mathematical replay.
