# Dense prime-field migration benchmark

This benchmark compares two isolated kernel implementations that consume the
same caller-owned row-major `UInt64Buffer`:

- the actual typed-Python bodies in
  `src/lib/sagejs/kernels/dense_prime.py`; and
- generated FFI calls to mature FLINT in
  `src/lib/sagejs/kernels/dense_prime_flint.py`.

The declared-FLINT timing includes reconstructing FLINT matrices from packed
storage. The legacy N-API timing starts with an already constructed opaque
FLINT matrix. Consequently this table measures a valid crossover only for a
caller that already owns canonical packed storage; it does not by itself
decide the current public `Matrix` dispatch.

## Dedicated-host result

Measured on `bench-1`, a dedicated 16-vCPU AMD EPYC 7B13 VM with 64 GiB RAM,
Node 26.7.0, GCC 13.3.0, modulus 65521, two warmups, and the median of 11
samples. Times below include caller-owned output/workspace allocation for both
packed implementations.

| n | rank Python/FFI | RREF Python/FFI | right kernel Python/FFI | solve Python/FFI |
|---:|---:|---:|---:|---:|
| 1 | 1.50/1.00 us | 1.50/1.70 us | 1.60/1.80 us | 2.10/1.90 us |
| 2 | 1.20/0.80 us | 1.20/1.30 us | 1.40/1.70 us | 1.80/1.80 us |
| 4 | 1.60/0.90 us | 1.70/1.70 us | 2.00/2.50 us | 2.50/2.80 us |
| 8 | 2.30/1.40 us | 2.80/2.60 us | 3.70/4.00 us | 3.20/3.70 us |
| 16 | 7.50/4.00 us | 9.20/6.40 us | 10.70/18.70 us | 8.10/7.80 us |
| 32 | 26.0/17.0 us | 26.0/19.9 us | 48.6/39.4 us | 40.4/21.5 us |
| 64 | 137/77 us | 137/107 us | 336/196 us | 217/94 us |
| 128 | 0.663/0.441 ms | 0.659/0.524 ms | 2.390/1.050 ms | 1.595/0.503 ms |
| 256 | 4.017/2.985 ms | 4.394/3.378 ms | 18.457/7.013 ms | 12.161/3.157 ms |

Within an already-packed kernel pipeline, the measured crossover is:

- rank uses declared FLINT whenever that isolated artifact is available;
- RREF uses typed Python through size 4;
- right kernel uses typed Python through size 16; and
- solve uses typed Python through size 8.

These thresholds are kernel tuning evidence, not current production policy.

## End-to-end correction

On 2026-08-10, a public `random_matrix(GF(97), 200).rref()` exposed that
`Matrix` still canonically owned a native FLINT object. Automatic dispatch had
to export and decode 40,000 residues in the dynamic host before entering the
packed kernel. On the development host, labeled fresh-process measurements
were approximately 189 ms for typed Python, 271 ms for declared FLINT through
the packed ABI, and 2 ms for the existing FLINT operation after module warmup.
An absent artifact was worse: it silently interpreted the cubic Python body
and took about 1.9 seconds.

Production now retains the FLINT-backed matrix operation and never implicitly
interprets the packed algorithm. `SAGEJS_NATIVE_TRACE=1` reports that choice.
The packed kernels remain real, independently useful compiler artifacts and
oracles. Production crossover will be reconsidered only after GF(p) matrices
own packed storage from construction onward, so export cost is not hidden from
the decision.

Run the standard comparison with:

```sh
pnpm bench:native:dense-prime
```

Override `SAGEJS_DENSE_PRIME_SIZES`, `SAGEJS_DENSE_PRIME_SAMPLES`, and
`SAGEJS_DENSE_PRIME_MODULUS` for larger or cross-platform measurements. Add
`--json` for the full core/production/FFI/legacy-N-API result.
