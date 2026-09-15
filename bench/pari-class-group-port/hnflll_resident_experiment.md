# Resident HNFLLL transfer experiment

This is a bounded experiment, not a production HNF replacement. It asks
whether keeping HNFLLL's exact matrix entries resident and expressing its hot
mutations as `addmul`, `submul`, and `swap` improves the translated PARI
algorithm without changing that algorithm.

## Corrected real boundary

The parent computation starts with 66 factor-base rows and accepts 73 relation
columns. Those are not the dimensions passed to HNFLLL. PARI's translated
`hnfspec` sparse cleanup and assembly reduce the matrix first. The retained
successful owner output has:

- `hnf_assembly_state[:6] = [8, 0, 15, 8, 58, 0]`;
- an active 8 by 15 `matbnew` operand;
- no dependent rows and an 8 by 58 trailing `B` matrix;
- HNFLLL state `[282, 23, 764, 439, 223, 102, 392, 156, 60, 16, 16]`.

The checker freezes those 120 actual `matbnew` entries. Their canonical JSON
SHA256 is
`a648370ee80ae4d87aab350847ff8950d2a7214dfbf72ca06b5199d2e9046d19`.
It also freezes hashes of H, U, lambda, D, and the state. This corrects the
earlier inference that HNFLLL itself receives a 66 by 73 matrix.

## Implementation and verification

`hnflll_resident_experiment.py` is source-equivalent to the existing packed
translation. Its public boundary remains packed. Each invocation allocates one
`NativeExactArena`, copies the reversed operand into resident vectors, runs the
same HMM reduction, and copies H, U, lambda, and D out. Hot linear combinations
use resident `addmul`/`submul`; complete column exchanges use resident `swap`.

The checker passed CPython, JavaScript, GMP, and tagged execution. Every backend
matched the packed translation and the frozen output hashes. It independently
checked `original * U == H`. Focused probes cover destination/operand aliasing,
resident swaps, conservative bounded overflow, and no result publication after
that overflow.

The 4096-bit bound matches the existing 64-word packed-owner allowance. On this
one operand, a diagnostic search found that the resident implementation accepts
64 bits while 56 bits is conservatively rejected. That is fixture evidence,
not a general HNF intermediate bound.

## Allocation-inclusive timing

Under a 4 GiB address-space limit and 600-second timeout, seven alternating
pairs of 50 calls gave:

- resident: 3.297365 ms geometric mean;
- packed baseline: 3.415338 ms geometric mean;
- resident / packed: 0.965458.

The resident path is 3.45% faster. The clock includes arena allocation,
initialization, copy-in, arithmetic, and copy-out. It excludes construction and
materialization of the checker's already-existing boundary owners.

This is a successful semantic transfer but not a material HNF speedup. It also
shows that the earlier 61.75 ms whole HNF phase cannot be identified with this
HNFLLL kernel: the isolated real HNFLLL takes only about 3.4 ms in the packed
translation. Sparse cleanup, rank/assembly, logarithmic transformation, and
final propagation account for the rest and need separate attribution before a
larger storage-reuse claim.

Reproduce with the already-built Sage.js FLINT prefix:

```sh
ulimit -v 4194304
SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix \
  HNF_RESIDENT_REPETITIONS=50 \
  timeout 600s node \
  bench/pari-class-group-port/check_hnflll_resident_experiment.cjs
```

The retained resident core cache key is
`1255ec43bbe8088c29ee9a75c2d070a458ed7cffddbc8d144f50954771c1ad6b`;
its generated core is 525,343 bytes with SHA256
`bba81437cd4c0aa55c1508ddeece319dbf29a378c4f33c0b4ba0cbe672a3b605`.
