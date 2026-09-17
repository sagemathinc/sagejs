# High-precision packed-real full product

This experiment closes the accidental quadratic product path in the translated
packed-real multiplication used by the 153,088-bit corridor.  The mathematical
source remains ordinary CPython-parseable Python:

```python
product = mx * my
bits = product.bit_length()
exponent = ex + ey + bits - 2 * px + 1 - 64 * unequal
discard = bits - px
result = (product + (1 << (discard - 1))) >> discard
```

The GMP lowering contains an `mpz_mul`; no handwritten product C was added.
The existing portable word convolution remains the small-input branch and the
dynamic Python body is the correctness fallback.

## Tune boundary

`MULRR_MULII_LIMIT` is measured in **bits**, not words.  PARI calls
`prec2lg(MULRR_MULII_LIMIT)` before comparing the `t_REAL` length.  The pinned
PARI 2.17.4 `Olinux-x86_64` build reports a 3,520-bit limit, so 3,520 bits stays
on the word-convolution branch and 3,584 bits is the first representable
64-bit-word precision on the full-product branch.  This is host-tuned and must
not be treated as a universal PARI constant.

## Exact evidence

Run:

```text
node bench/pari-class-group-port/check_high_precision_full_product.cjs
```

The checker pins the PARI 2.17.4 archive and relevant upstream sources, builds
a pristine PARI oracle, and compares eight exact packed
`(mantissa, precision, exponent)` fixtures across CPython, JavaScript, GMP, and
tagged lowering.  The fixtures cover 3,456 / 3,520 / 3,584-bit boundary cases,
both signs, unrelated exponents, unequal precision with PARI's single extra
guard word, an algebraically checked exact-half tie, and an algebraically
checked rounding carry at 153,088 bits.  All agree exactly.  The pristine PARI
trace SHA-256 is
`5ac82d06b7ca75071a3103d58b8aac4d31ab4b2ac4eb4c8b67c31407c3f43b83`.
Two malformed batch calls are also rejected before either caller-owned output
or state changes.

The generated core is 991,765 bytes and has cache key
`3f08fc2565b34bac8432ef069b9e55e4966fffd79841753634fcec6cf516b06b`.
The checker inspects the `native_pari_short_product` definition and requires
both `mpz_mul` and the pinned 3,520-bit cutoff to be present.

## Scaling probe

This is a branch-shape probe, not a matched PARI benchmark.  Thirty-one warm
native calls at each size gave representative medians:

| bits | median |
| ---: | ---: |
| 3,584 | 0.092 ms |
| 153,088 | 0.457 ms |

Operand length grows 42.7 times while time grows 4.95 times.  Direct quadratic
Python word iteration would imply a size factor of about 1,824.5.  Exact
timings are machine-load sensitive, so the checker gates only on a deliberately
loose subquadratic discriminator and treats the numbers as unqualified against
PARI.
