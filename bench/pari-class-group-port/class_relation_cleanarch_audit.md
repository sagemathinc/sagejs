# Class-relation `cleanarch` retry boundary

This lane translates the class-generator logarithm cleanup at PARI 2.17.4
`src/basemath/buch2.c:4178-4190`, together with its `cleanarch` dependency at
lines 899-931. The implementation is ordinary CPython-parseable Python in
`class_relation_cleanarch.py`; the same body is compiled by `@native`.

The first admitted cut is the frozen totally-real cubic
`x^3 - 20018*x + 20034` from `unit-bridge-cubic-fixtures.json`. It contains
seven genuine class/relation logarithm columns, including nonzero phases. The
fixture is authenticated by its existing SHA-256 rather than copied or
silently simplified.

## Correspondence

- Each column receives `-sum(real parts)/3` in PARI source order.
- Each imaginary part is reduced modulo `2*pi` using PARI's cached reciprocal,
  precision-loss test, floor convention, and packed-real arithmetic.
- A successful attempt first fills detached scratch storage and publishes the
  whole matrix only after all 21 entries succeed.
- A failed cleanup calls `pari_cleanarch_retry_action`, which implements
  `nbits2extraprec(gexpo(C0) + 64) - gprecision(C0)` and
  `PREC += max(add, 1)`. It updates only driver metadata and cannot mutate the
  previously published candidate.

The pristine source oracle rebuilds the frozen packed logarithms, calls the
actual static `cleanarch`, and records the exact 21 cleaned entries. On this
fixture the failure action is `[retry, 192, 256, 64, 10, 64]`: a failed
192-bit attempt restarts at 256 bits. The checker compares all packed fields,
not floating approximations, under PARI, CPython, generated JavaScript, GMP,
and tagged native backends.

Run:

```sh
node bench/pari-class-group-port/check_class_relation_cleanarch.cjs
```

## Deliberate remaining boundary

This is not yet the general mixed-signature cleanup. The mathematical leaf is
specialized to degree three and signature `(3, 0)`, though it already covers
both real corrections and complex phase reduction. Integrating the output
with the shared outer driver, rebuilding `C` at the increased precision, and
supporting arbitrary `(r1, r2)` remain follow-up work. No final class-group or
public completeness flag is changed by this lane.
