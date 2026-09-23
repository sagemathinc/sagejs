# Row 11 Phase-6 prepared-kernel timing readiness

Row 11 has genuine fresh correctness but no complete resident timing graph.
Gate C has four reusable native handles. Its transaction nevertheless invokes
Python once for post-HNF acceptance and again for class closure plus exact unit
reconstruction, while also allocating and serializing owners. Timing that
transaction against pristine resident `bnfinit0(nf,0)` would conflate language,
subprocess, filesystem, replay, and publication costs.

The executable check authenticates both the prepared input and frozen fresh
aggregate result, rejects a mutation, defines the eventual common semantic
projection, and confirms the timing arm fails closed.

```sh
node bench/pari-class-group-port/row11_phase6_prepared_timing_readiness_check.cjs
```

`--live-fresh` performs an untimed end-to-end correctness rerun. A matched
timing adapter requires native resident replacements for both Python suffixes
and one `prepareResident`/`runResident` graph from prepared NF to projection.
