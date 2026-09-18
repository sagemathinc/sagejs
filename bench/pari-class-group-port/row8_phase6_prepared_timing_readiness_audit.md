# Row 8 Phase-6 prepared-kernel timing readiness

Row 8 does **not** yet have a matched resident prepared-kernel timing pair. The
existing correctness transaction is genuine and starts from authenticated
prepared-`nfinit` data, but its clock cannot be compared with pristine PARI's
`bnfinit0(nf,0)` clock.

The executable audit authenticates the frozen prepared authority and the fresh
aggregate result, rejects a mutated prepared input, and verifies the precise
implementation boundary. Gate C has four reusable native handles, but initial
root construction is not exposed as a resident runner and post-HNF analytic
acceptance executes `row8_fresh_post_hnf` in a Python subprocess. The complete
transaction also performs owner allocation, replay, serialization, and
publication.

Consequently, `createTimingArm()` fails closed with
`SAGEJS_PHASE6_NO_RESIDENT_KERNEL`; it never reports transaction wall time as a
kernel time. `commonProjection()` defines the eventual shared semantic output
shape. The next implementation step is a serialization-free resident graph
from prepared NF through post-HNF acceptance and that projection.

```sh
node bench/pari-class-group-port/row8_phase6_prepared_timing_readiness_check.cjs
```

Adding `--live-fresh` reruns the full untimed fresh correctness transaction. It
is deliberately not part of a timing campaign.
