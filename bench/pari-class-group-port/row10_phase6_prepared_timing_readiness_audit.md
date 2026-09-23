# Row 10 Phase-6 prepared-kernel timing readiness

Row 10's authenticated fresh transaction is correctness evidence, not a
resident prepared-kernel timing arm. Gate C reuses four native handles, but the
whole graph has no `prepareResident`/`runResident` pair and post-HNF analytic
acceptance runs `row10_fresh_post_hnf` in a synchronous Python subprocess.
Owner allocation, replay, serialization, and publication are also inside the
transaction boundary and outside PARI's `bnfinit0(nf,0)` clock.

The executable check authenticates the prepared authority and frozen fresh
aggregate row, rejects a prepared-input mutation, defines the eventual common
semantic projection, and proves that a timing request fails closed rather than
timing the transaction.

```sh
node bench/pari-class-group-port/row10_phase6_prepared_timing_readiness_check.cjs
```

Use `--live-fresh` only for an untimed full correctness rerun. The next timing
implementation must port the post-HNF suffix and join it to initial-root and
Gate-C native stages in one serialization-free resident graph.
