# Multilingual frontend benchmarks

`intent-codegen.cjs` builds canonical scalar-root records and translates each
record to Sage, SciPy, MATLAB, and Wolfram before parsing each emitted form back
to the same semantic digest. `catalog-roundtrip.cjs` samples six foundational
domains in the Sage and SciPy targets supported by every catalog operation.

Set `SAGEJS_MULTILINGUAL_BENCH_ITERATIONS` to change the default 2,000
iterations. This measures translation overhead only; it makes no claim about
solver performance or external-system speed.

```sh
node bench/numerics/multilingual/intent-codegen.cjs
node bench/numerics/multilingual/catalog-roundtrip.cjs
```
