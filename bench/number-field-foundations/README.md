# Algebraic number-field foundations benchmarks

`workloads.json` fixes five benchmark selections, one for each project phase.
Every selection has a digest of its mathematical oracle output. A benchmark
adapter must check that digest (or an equivalent digest of its own normalized
results) before reporting timings.

Verify the selections and corpus identity offline:

```sh
node bench/number-field-foundations/oracle-workloads.cjs
node bench/number-field-foundations/oracle-workloads.cjs --json
```

Only use `--update` after intentionally regenerating and reviewing the oracle
corpus. The modes distinguish cold initialization, warm computation, cached
results, batching/streaming, and producer versus certificate-checker time.
Native dependency compilation and lazy-module compilation must be reported
separately from warm mathematical work.

The manifest is deliberately implementation-neutral so each project can add a
small adapter without changing its cases or silently selecting easier answers.
Reference-system comparisons must also use persistent processes; do not
compare a warm Sage.js call with a cold Sage/PARI or Magma startup.
