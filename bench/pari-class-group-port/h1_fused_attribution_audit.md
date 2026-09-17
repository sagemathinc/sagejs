# Fused H1 matched flag-zero attribution

This is a single diagnostic profile, not a replacement timing qualification and
not an optimization.  It patches timers and counters into a copy of the
authenticated generated C artifact, builds a distinct addon, and replays the
frozen prepared H1 input once.  The mathematical call graph, scheduling, and
outputs are unchanged.

## Correctness and closure

The relation, compact, owner, and terminal-RNG hashes exactly match the frozen
qualified run.  The root and one-attempt p192 `getfu`/PRECI state match, and
`public_complete` remains false.  The eight stage intervals sum exactly to the
2,613,032,759 ns native inclusive interval.  That interval covers 99.9895% of
the 2,613,306,023 ns external addon call, exceeding the 99% acceptance rule.

The diagnostic addon was built in 326.6 seconds with peak aggregate RSS
2,386,308 KiB under the fixed 4,194,304 KiB / 600 second envelope.  Exact
artifact and raw-receipt hashes are recorded in
`h1_fused_attribution_result.json`.

## Ranked attribution

| Rank | Stage | Time | Share |
| ---: | --- | ---: | ---: |
| 1 | preparation | 1,713,621,875 ns | 65.58% |
| 2 | log/HNF | 582,048,007 ns | 22.27% |
| 3 | relation collection | 286,664,440 ns | 10.97% |
| 4 | owner bridge | 12,432,820 ns | 0.48% |
| 5 | post-HNF/Smith | 8,860,538 ns | 0.34% |
| 6 | compact/getfu | 6,307,596 ns | 0.24% |
| 7 | addon ingress | 3,082,223 ns | 0.12% |
| 8 | addon egress | 15,260 ns | <0.01% |

The top three stages account for 98.80% of the native interval.  Wrapper
conversion is disproved as the dominant explanation.  No GMP upstream
allocation, reallocation, or free occurred while the timed root was active;
the existing checkpoint/storage reuse absorbed the run.  The addon borrowed
348 packed integer buffers without copying them.  Those buffers exposed only
10,857 logical limb words but 4,550,975,488 words of aggregate slot capacity;
this is a capacity metric, not evidence that every capacity word was touched.

The earlier 2.411-second matched gap cannot be assigned exactly from a single
Sage-side profile because PARI lacks the identical internal stage clocks.  A
proportional reading assigns approximately 1.581 s to preparation, 0.537 s to
log/HNF, and 0.265 s to relation collection.  These are prioritization weights,
not claims of PARI stage-by-stage excess.

## Falsifiable next hypotheses (no optimization performed)

1. **Preparation performs capacity-scaled work.** Instrument loop trip counts
   and bytes actually written for its five largest buffers.  This hypothesis is
   rejected if observed work scales with logical lengths and remains far below
   capacity; it is supported if right-sizing only those authenticated buffers
   reduces preparation time without changing any frozen hash.
2. **Log/HNF is dominated by exact scalar traffic or missed private inlining,
   not allocation.** Use symbol-level samples plus generated-call counters.  It
   is rejected if a substantial share lies in allocator/checkpoint code; it is
   supported if exact load/store/conversion helpers or non-inlined private calls
   dominate while allocation counts remain zero.
3. **Relation collection repeats bounded helper overhead.** Count invocations
   and exclusive time for the hottest relation helpers, then compare a compiler
   private-graph/inlining diagnostic with identical scheduling.  It is rejected
   if no small helper set explains most of the 286.7 ms; it is supported if one
   mechanically inlined/private specialization removes a substantial share
   with all counters and terminal RNG unchanged.
