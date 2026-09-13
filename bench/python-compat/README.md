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

## Dictionary fast paths: initial measurement

The September 5, 2026 development measurement used Node 26.8.1 and CPython
3.14.4 on Linux x64, with three warmup passes and seven measured passes.
Construction bypasses the general Python class call machinery; literal
construction avoids an immediately invoked function and repeated bound-method
calls. Primitive-key insertion bypasses general object-key normalization, and
exact dictionary assignment bypasses method lookup without bypassing subclass
overrides. Object keys still use the existing equality resolver.

| Workload | Sage.js median | CPython median | Ratio | Policy status |
| --- | ---: | ---: | ---: | --- |
| One million one-item literals | 783.18 ms | 63.30 ms | 12.37x | performance cliff |
| Insert 100,000 distinct items | 73.37 ms | 5.56 ms | 13.20x | watch |
| Overwrite an item one million times | 559.25 ms | 30.26 ms | 18.48x | performance cliff |

These are **provisional**, not release budgets or independently confirmed cliff
closures: the development host was also building modules. Earlier development
observations were approximately 7.10 s, 274 ms, and 2.48 s respectively, but a
quiet-host paired before/after run is still required for a confirmed speedup.
The remaining dictionary cliffs are open; do not relabel them as compatible
merely because this implementation is faster.

Reproduce the selected workload with:

```sh
node bench/cowasm/run.cjs --only build_dictionary --only build_dictionary_2 --only set_dictionary_item --policy bench/python-compat/performance-policy.json --warmups 3 --samples 7 --json /tmp/python-dictionaries.json
```
