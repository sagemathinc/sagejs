# Fused independent LU residual norms

The private typed-source `lu_residual_norms` kernel checks the actual
permutation is bijective, reconstructs the unit-lower/upper product in original
index order, and computes both the residual infinity norm and input infinity
norm. It retains separately rounded products and accurate summation. The
caller owns disjoint buffers; output is published only after complete success.
Shapes are square, size 1–128. Invalid storage/permutation and nonfinite
arithmetic have distinct rejection statuses.

This is not public dispatch or a new numerical acceptance criterion. Independent
thresholding, public result construction, and the owned cancellation/budget
boundary still need integration. The public per-cell check schedule is unchanged.

The corpus compares native and generated JavaScript against independent CPython
`math.fsum` reconstruction and the same typed Python source. It includes ordinary
and perturbed factors at sizes 1, 2, 3, 8, 16, 32 and 128, plus cancellation,
FMA-distinguishing products, subnormals and signed zero. Storage/permutation,
nonfinite input, norm overflow, and failure publication are checked. Node-Wasm
and Chromium/Firefox/WebKit workers pass the valid/adversarial arithmetic cases
using the production pack builder and no exact-library prefixes. This is kernel
evidence, not public browser qualification. Node 22 and strict Python pass too.

`local.json` retains an alternating seven-block comparison after three warmups:

| Size | Native (ms) | Generated JS (ms) |
| --- | ---: | ---: |
| 16 | 0.071 | 3.984 |
| 32 | 0.435 | 28.293 |
| 64 | 3.136 | 220.595 |
| 128 | 22.054 | 1820.927 |

These are local development core timings with normal wrapper marshalling and
reused buffers. They exclude packing, public factorization/validation/result
contracts, callback checks, startup and memory qualification. They must not be
compared directly with public LU timings as an end-to-end speedup. No target,
default or four-platform qualification is claimed.

```sh
SAGEJS_NUMERICAL_BROWSER_TESTS=1 node --test test/numerics/performance/packed-lu-validation.cjs
node bench/numerics/performance/lu-validation-core.cjs NEW_RECEIPT.json
```
