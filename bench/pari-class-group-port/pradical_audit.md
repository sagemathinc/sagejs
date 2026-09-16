# Integral-basis Frobenius and p-radical translation

This is an upstream-assumed PARI 2.17.4 dependency port, not a completed prime
decomposition or class-group engine. `pradical.py` connects ordinary Python
translations of `base2.c:pow_ei_mod_p` and `pradical` to the small-prime matrix
kernel dispatcher. Inputs are the actual maximal-order multiplication table,
degree and rational prime, not known Frobenius or radical matrices.

## Source correspondence and representation

- `integral_frobenius.py` follows `gen_pow_fold`: plain-square callbacks square
  then reduce, and square/multiply callbacks square, reduce, multiply by the
  selected integral basis element using `zk_ei_mul`, then reduce again. Basis
  element one retains the source immediate return. Diagnostic traces check
  callback order, not only the resulting power.
- `small_prime_matrix_kernel.py` follows `FpM_ker` dispatch to binary, ternary
  and odd-word Gaussian kernels. Exact pivot and kernel-basis order are kept.
  The small dimension guard excludes CUP; the prime guard excludes the
  arbitrary-precision-prime kernel. Dense binary/ternary storage replaces
  packed planes and therefore does not imply equal access costs.
- `pari_small_pradical` constructs columns of Frobenius, multiplies by the
  original Frobenius while q<n, and takes the kernel of the resulting power.
  It then subtracts one from the original Frobenius diagonal, **without**
  reducing again, exactly as source `phi` construction does.
- The matrix-product helper follows classical SMALL_ULONG accumulation with
  HIGHBIT-triggered reductions, or selected-column copy/XOR for p=2. Canonical
  residues and the explicit prime bound keep additions below 2^64; the
  comparison against 2^63 is equivalent to the source bit test here.

Column-major workspace has 5*n*n+2*n slots: original Frobenius, its power,
product scratch, radical output, and kernel-private matrix/markers/pivots.
Separate owners hold the multiplication table, two n-element columns, power
diagnostics, phi, radical publication and aggregate diagnostics. Disjoint
ownership and a valid integral table are caller preconditions. Guards reject
invalid dimensions or storage before writes; arithmetic failure need not
roll back internal scratch. Only active output prefixes are written.

## Reproduction and evidence

Under the existing metered 4 GiB process wrapper:

```sh
node bench/pari-class-group-port/check_pradical.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

The oracle extracts the literal static functions from the pinned archive and
links PARI. It calls `nfinit`, never `bnfinit`, and publishes integral tables,
exact Frobenius powers, phi and radical basis. Its receipt includes archive,
extracted source, oracle and linked-library identities.

Final connected receipt: `/tmp/sagejs-pradical-5zjguw/fixtures.json`.
All 24 combinations of six fields and primes 2,3,5,37 match in CPython,
JavaScript, GMP and tagged execution, including exact basis order and
intermediate Frobenius powers. This includes the index-3 cubic and index-37
quartic. The cubic's radical basis is (2,1,0), (0,0,1); the quartic at 37 has
zero radical, an important distinction between an equation-index obstruction
and field ramification. The tested helper also matches 256 exact matrix
product controls in JavaScript/GMP/tagged, including high-word accumulation,
and checks all short-owner guards plus degree/prime rejection atomicity.

Core SHA-256:
`8b92bf344735fe6ac4a666604f3817a803ad4b35e7c0859dea24551358703763`.
Initial connected compilation/replay used 10.990471 CPU seconds and 272880 KiB
peak child RSS. The final cached replay used 2.561304 CPU seconds. These are
qualification costs, not a paired performance result.

Independent component receipts:

- `/tmp/sagejs-small-prime-kernel-1vVLDd/fixtures.json`: 1,697 matrices,
  including exact mutated private matrices and kernel bases, empty shapes,
  rectangular cases and invalid-input guards across all execution modes.
- `/tmp/sagejs-integral-frobenius-HgFf2T/fixtures.json`: 126 cases through
  127-bit prime controls, exact source callback counts/order, immutable tables,
  output tails and invalid-input guards across all execution modes.

Independent source review found no blocker in the connected schedule, owner
layout, matrix arithmetic or phi convention. Source files remain readable
Python with dynamic fallbacks; no production dispatch or proof status changes.

Strict library checking passes with zero errors/warnings (403 configured
Pyright modules); formatting checks 1,049 Python files. The experimental
modules also execute directly in CPython in the focused tests. Parallel and
diff checks pass. Full gates are **not green**: architecture checking still
stops at the previously recorded stale optimizer manifest, and the changed
test selection stops in `test/module-cache.cjs` with generated-code
`ReferenceError: $ρσ$py$Any is not defined` under Node 26.8.1. The latter is
a module-cache qualification failure outside the new bench-only call graph;
it has not been repaired or waived. Failed runs remain in the CPU ledger.

## Remaining dependency

The index-prime path still needs polynomial factors/Dedekind correction,
quotient-algebra image/supplement/inverse operations and splitting, and full
`primedec_end` descriptors (uniformizers, anti-uniformizers, valuations and
sorting). A radical alone cannot replace `idealprimedec`. This checkpoint
removes its radical dependency but does not change the existing `get_fs`
index-divisor frontier or establish the full prepared-nf boundary.
