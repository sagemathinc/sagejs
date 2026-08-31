# Multilingual frontend benchmarks

Run `node bench/numerics/multilingual/intent-codegen.cjs`. The benchmark builds
canonical scalar-root records and translates each record to Sage, SciPy,
MATLAB, and Wolfram before parsing each emitted form back to the same semantic
digest.

Set `SAGEJS_MULTILINGUAL_BENCH_ITERATIONS` to change the default 2,000
iterations. This measures translation overhead only; it makes no claim about
solver performance or external-system speed.
