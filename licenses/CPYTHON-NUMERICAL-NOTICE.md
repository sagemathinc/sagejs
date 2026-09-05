# CPython numerical-source notice

The private finite summation in
`src/lib/sagejs/numerics/statistics/_packed.py` adapts the partials algorithm
and final half-even correction from `math_fsum` in CPython's
`Modules/mathmodule.c` at revision
`53d2e14a3081085a12c65cff14de77604da14670`.

- Source: <https://github.com/python/cpython/blob/53d2e14a3081085a12c65cff14de77604da14670/Modules/mathmodule.c>
- Copyright (c) 2001 Python Software Foundation; All Rights Reserved.
- License: PSF-2.0; the complete upstream terms are retained in
  [CPYTHON-LICENSE.txt](CPYTHON-LICENSE.txt).
- CPython credits Raymond Hettinger for partials summation and Mark Dickinson
  for the exact partials sum and final rounding correction.

Sage.js changes: ordinary typed Python as the source and dynamic fallback,
caller-supplied bounded scratch/output buffers, finite-input-only status codes,
no interpreter allocation or callback inside the compiled region, and a bounded
for-loop flag in place of the final while/break. This is not a replacement for
the complete Python `math.fsum` interface or its nonfinite-input semantics.
