# Windows qualification memory observation

The 0.8.0 candidate `1009da38e` passed Windows native build, strict Python,
portable tests, SEA startup, and fresh installation, but numerical npm collection
failed because no descendant survived a CIM snapshot. A fresh PowerShell/CIM
scan can take longer than a short Node or SEA computation. Retaining only the
supervisor is not evidence of observing the numerical subject.

The qualification harness now preloads an exit-boundary barrier into the actual
Windows npm/SEA subject. The collector freezes the set of ready PIDs **before**
its process-table scan, and acknowledges only ready PIDs found in that scan.
The supervisor independently requires its own child's acknowledgement before
accepting the result. The real process remains resident during observation;
there is no synthetic RSS value, supervisor-only acceptance, or memory waiver.

The barrier has a 35-second deadline (two existing 15-second CIM scan deadlines
plus scheduling headroom, within the unchanged 180-second subject timeout)
and fails closed on missing observation,
missing preload, and late acknowledgement after timeout. Main-thread-only setup
and removal of the configuration environment variable prevent worker joins or
grandchildren from inheriting an exit wait. Ordinary product execution is
unchanged: the preload is enabled only by this qualification harness.

This remains **sampled process-tree memory**, not an exact allocation high-water
mark. The exit observation establishes subject coverage but cannot reconstruct
transient allocations already freed. Existing periodic sampling remains active.
Measured wall/kernel time includes synchronization overhead; these instrumented
Windows package timings must not be described as uninstrumented performance.
Startup gates do not enable the barrier. Runtime mathematics, memory limits,
fallback policy, and shutdown behavior are unchanged.

Focused validation:

```sh
node --test test/numerics/evidence/memory-barrier.cjs
node --test test/numerics/evidence/qualification-supplemental.cjs
```

On Windows, the first command also exercises the real CIM collector against a
short supervised process with 64 MiB of touched memory. Set
`SAGEJS_TEST_MEMORY_SEA` to a built `sagejs.exe` to exercise the SEA preload path.
Tests cover natural and explicit exit, exit-status preservation, supervisor-only
non-acknowledgement, worker/grandchild isolation, and timeout/late-ack rejection.
These focused diagnostics are not a complete new-candidate qualification receipt.
