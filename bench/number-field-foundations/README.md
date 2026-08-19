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

## Measured comparison

`measurements.json` freezes digest-checked public workloads for compact prime
streams, exact zeta coefficients, quadratic zeta batches, general analytic
zeta, and certified global arithmetic.  Run the persistent Sage.js and
Sage/PARI workers on the same host with:

```sh
node bench/number-field-foundations/run.cjs \
  --systems sagejs,sage,magma,hecke --samples 5 --warmups 1 \
  --output bench/results/number-field-foundations-current.json
```

The general analytic-zeta workload is intentionally excluded from the default
profile because the readable Sage.js Meijer-G reference currently takes
minutes.  Use `--include-slow` or select it explicitly to quantify that known
production-kernel gap.  The Magma adapter excludes process startup by running
all warmups and samples in one Magma process per workload. Its sub-millisecond
compact-stream and coefficient kernels use a recorded inner repetition count
to overcome Magma 2.18's coarse timer; the report contains the per-operation
average. The `hecke` adapter loads Oscar's pinned Hecke backend and measures
the algebraic workloads it supports; unsupported arbitrary-complex zeta
evaluation is reported explicitly. A missing proprietary executable or Julia
project is reported, not silently replaced by another implementation.

The runner rejects a timing unless every retained sample has the reviewed
answer digest.  It records the exact Git revision, dirty-tree state, tool
versions, persistent-process startup, warmup/sample policy, and raw samples.
`--update` is only for deliberate oracle review.

The measured Oscar/Hecke environment on the primary benchmark host is
`/home/user/.local/share/sagejs-benchmarks/number-fields-julia`. It contains
Julia 1.12.7, Oscar 1.8.1, Hecke 0.39.22, and JSON3 1.14.3. Create an equivalent
environment with Julia's package manager before selecting the `hecke` adapter:

```sh
julia --project=/path/to/reference-environment -e \
  'using Pkg; Pkg.add(["Oscar", "Hecke", "JSON3"]); Pkg.precompile()'
node bench/number-field-foundations/run.cjs \
  --julia-project /path/to/reference-environment --systems hecke
```

Set `SAGEJS_HECKE_BENCH=1` to include the digest-checked Oscar/Hecke adapter
smoke test in `test/number-field-foundations-performance.cjs`.
