# Python compatibility performance laboratory

This directory turns behavior-validating Python workloads into explicit
performance-compatibility evidence. Sage.js does not promise to match CPython's
implementation, but code that behaves correctly and is unexpectedly unusable
because it is much slower is still a compatibility problem.

Run the initial persistent-process workload tranche with:

```sh
pnpm bench:python:compat -- --samples 7 --warmups 3 --json /tmp/python-compat.json
```

Every workload executes its correctness assertions before its timing is
accepted. The initial tranche measures `warm-throughput` only: compilation,
process startup, and module loading are deliberately outside its timings. Cold
CLI, compilation, import, first-call, and cached-import measurements will be
added as separate scopes rather than blended into a misleading aggregate.

`performance-policy.json` is the versioned product policy. Its classifications
use both ratios and absolute time differences, so a harmless microsecond ratio
does not become a product blocker. A confirmed result requires at least seven
samples and an independent rerun on a quiet qualification host. A single report
is always marked `provisional-single-run`; reaching the sample floor makes it a
sample-qualified observation, not a confirmed performance claim.

The workload bodies remain the BSD-licensed ordinary-Python CoWasm corpus in
`bench/cowasm/src`. The suite omits its raw-JavaScript comparison case because
that case does not perform portable Python work and is therefore not comparable
with CPython.
