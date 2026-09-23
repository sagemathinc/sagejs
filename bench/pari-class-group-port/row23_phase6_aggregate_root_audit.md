# Row 23 Phase 6 one-call aggregate audit

`row23_phase6_aggregate_emitter.cjs` mechanically composes the complete
`pari_connected_relation_hnf` ABI with the reviewed row-23 suffix root.  The
generated `pari_row23_phase6_aggregate_root` makes exactly two private Python
calls inside one compiled graph:

1. fresh prepared relation collection and HNF; and
2. the analytic, acceptance, rank-four lattice, `cleanarch`, `prepare_getfu`,
   and exact `getfu` suffix.

The host authenticates and allocates every owner before the measured boundary.
The measured boundary is exactly one `aggregate.gmp(...)` invocation.  Large
storage is explicit: catalog scratch/output owners, a 6,144-cell
moderate-capacity work arena, and a 2,574-cell 4,096-word exact arena.  The
suffix partitions the exact arena with `integer_buffer_view`; no large exact
workspace is allocated inside the call.

The generated graph compiled at `-O3` under a 4 GiB address-space and 600-second
wall limit with cache key:

```text
94bcec3ba482159f8a805d3858d0e73fff125c3cb6501ebb398cabbc364e033b
```

The real end-to-end check passed under the same limits.  An independent cached
module rerun had a one-call shared-host diagnostic of 3.097699355 seconds.
This is not a quiet-host qualification timing.  The persisted receipt is:

```text
/scratch/row23-phase6-aggregate-root-check-v1.json
sha256 7a7b650e80c4c6786d84ba82091be68e44260fb99b03d762842dc40d369a5e6f
```

It produced:

- 40 accepted relations;
- terminal HNF state `[1,10,30,0,9,3,0,40,0]`;
- class group `Z/6Z` and class number 6;
- unit rank four with exact norms `[-1,1,1,1]`; and
- exact-unit digest
  `2f8c5f4ce98e4ccdcfcdc9cd2fc8bbaac38949093eb4aa5484af2584be9850bc`.

Validation command:

```bash
ulimit -v 4194304
timeout 600s node bench/pari-class-group-port/check_row23_phase6_aggregate_root.cjs
```

This closes the row-23 resident-boundary blocker: the computation is a genuine
fresh relation-to-exact-units class-and-unit computation, not a serialized
stage composition or detached replay.  Allocation, compilation, prepared-input
authentication, and result projection remain deliberately outside the clock.
