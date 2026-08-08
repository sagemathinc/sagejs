# Source-transparent prime-field compiler experiment

## Question

Can a nontrivial exact linear-algebra kernel be written as ordinary,
CPython-parseable typed Python, compiled from its actual body, and run close
to handwritten C without substituting an implementation based on the
function's name?

This experiment deliberately separates that compiler question from the
production question of which mature library Sage.js should use.  FLINT remains
the production-quality control.  The handwritten Native Kernel v9 code is a
second control, not a compiler input.

The source under test is
[`native_prime_field_source.py`](native_prime_field_source.py).  It contains:

- classical row-pivoted LU/rank over a 32-bit prime; and
- ordinary cubic dense matrix multiplication.

Both decorated bodies are executable Python fallbacks.  The compiler lowers
their loops, branches, buffer accesses, and modular arithmetic into explicit
IR.  It does not inspect either function name.

## What the compiler learned

The experiment added four generally reusable capabilities:

1. An owned row-major `UInt64Buffer` representation with checked reads,
   writes, allocation, matrix copying, and shaped matrix return values.
2. A borrowed `PrimeModulus` context.  `prime_mul` therefore lowers to
   preinverse modular arithmetic instead of a hardware division by a plain
   integer modulus.
3. A name-independent row-update idiom.  Data flow of the form
   `target[j] -= factor * source[j]` becomes one checked row span and a
   Shoup-specialized native loop.
4. A name-independent modular dot-product idiom.  Exact product bounds allow
   several products to accumulate in a `uint64_t` before reduction.

The last two are compiler optimizations, not algorithm substitutions.  They
match lowered data flow and retain explicit buffers, row indices, ranges, and
modulus operands.  Renaming the functions or locals has no effect.  Generated
C contains the LU and multiplication loops and contains no call to the v9
`sagejs_prime_factor` implementation.

Bounds checks are enabled by default.  Setting
`SAGEJS_NATIVE_SOURCE_BOUNDS_CHECK=0` creates a distinct cache artifact for
research comparisons.  On the dedicated host, checked versus unchecked
medians differed by noise (about -2% through +2% for rank, except one +2.4%
sample; about -7% through +1.4% for multiplication).  The safe default is
therefore retained.

## Dedicated-host result

The benchmark ran on an otherwise idle 16-vCPU AMD EPYC 7B13 VM with 64 GB
RAM, Node.js 26.7.0, nine median samples, and modulus 65521.  Times are
milliseconds per call.  “C classical” is the handwritten v9 factorization
with its blocked cutoff forced above all tested sizes.  “C blocked” is the
default tuned v9 implementation.  “FLINT” calls the retained FLINT matrix
backend directly.

### GCC 13.3

| n | compiled Python LU | C classical | ratio | C blocked | FLINT LU | compiled Python multiply | FLINT multiply |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 32  | 0.0238 | 0.0240 | 0.99× | 0.0184 | 0.0075 | 0.0266 | 0.0198 |
| 64  | 0.1641 | 0.1585 | 1.04× | 0.0966 | 0.0422 | 0.1845 | 0.1121 |
| 128 | 1.2460 | 1.1770 | 1.06× | 0.6581 | 0.3085 | 2.7078 | 0.1957 |
| 256 | 9.9987 | 8.7828 | 1.14× | 4.2874 | 2.1704 | 22.1623 | 0.8273 |
| 384 | 32.8582 | 29.1590 | 1.13× | 13.6277 | 8.0439 | 72.1720 | 1.8502 |

### Clang 18.1

| n | compiled Python LU | C classical | ratio | C blocked | FLINT LU | compiled Python multiply | FLINT multiply |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 32  | 0.0217 | 0.0226 | 0.96× | 0.0181 | 0.0074 | 0.0246 | 0.0197 |
| 64  | 0.1450 | 0.1511 | 0.96× | 0.1050 | 0.0428 | 0.1475 | 0.1120 |
| 128 | 1.1434 | 1.1379 | 1.00× | 0.8292 | 0.3167 | 2.5886 | 0.1917 |
| 256 | 8.3263 | 9.1437 | 0.91× | 6.2688 | 2.3239 | 29.1719 | 0.8700 |
| 384 | 27.5427 | 28.4105 | 0.97× | 19.7445 | 8.0389 | 74.5229 | 1.8930 |

At 12×12, the interpreted Sage.js fallback took approximately 6 ms for rank
and 12 ms for multiplication.  The GCC-compiled bodies took 0.00240 ms and
0.00425 ms respectively: roughly 2,500× and 2,800× faster.  Those large ratios
measure removal of the generic Python/Sage object model from tight scalar
loops; they are not comparisons with mature native algorithms.

The complete source module is 3,573 bytes.  Its generated C is 33,059 bytes,
and the stripped GCC addon is 18,640 bytes (18,592 with Clang).  This result
does not support a concern that source-transparent kernels inherently require
multi-megabyte artifacts.

## Honest interpretation

The experiment passes its compiler-quality gate.  The actual Python LU body
lands within 14% of handwritten classical C under GCC and slightly beats it
under Clang.  The second, structurally different algorithm is compiled by the
same general buffer, modulus, and loop machinery.  This is strong evidence
that high-level exact-arithmetic source can be both maintainable and fast.

It does **not** show that a classical algorithm beats a sophisticated native
library.  At 256×256 under GCC, the source LU is 2.33× slower than the blocked
v9 kernel and 4.61× slower than FLINT.  Cubic source multiplication is only
1.34–1.65× behind FLINT at 32–64, but 13.8–39.0× behind at 128–384 as FLINT's
blocking and asymptotically faster algorithms dominate.  Compiler quality
cannot recover an algorithmic disadvantage.

The architectural conclusion is therefore mixed but useful:

- Continue source-transparent compiler work for arithmetic kernels and for
  sophisticated algorithms that can themselves be expressed in typed Python.
- Treat generic loop idioms and exact-domain representations as first-class
  compiler facilities; do not substitute whole functions by name.
- Keep FLINT and other mature libraries behind stable boundaries for their
  best algorithms, and use them as correctness and performance controls.
- Do not turn the experimental handwritten v9 backend into Sage.js's default
  architecture merely because it wins one benchmark.

This is the encouraging outcome: Sage.js need not choose between readable
mathematical source and serious scalar performance.  It still must choose or
implement the right mathematical algorithm.

## Reproduce

```sh
pnpm bench:native:prime-source
CC=clang CXX=clang++ pnpm bench:native:prime-source
SAGEJS_NATIVE_PRIME_SOURCE_SAMPLES=9 \
  pnpm bench:native:prime-source --json
```

Use `SAGEJS_NATIVE_PRIME_SOURCE_SIZES` to select dimensions and
`SAGEJS_NATIVE_PRIME_SOURCE_CACHE_ROOT` to place compiler artifacts outside
the source tree.
