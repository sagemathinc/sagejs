# Typed-Python Tate reduction benchmark

This experiment asks whether a compact, source-transparent Python expression
of Tate's algorithm can compete with PARI's mature C implementation.  It is a
compiler experiment, not a second production elliptic-curve API.

## Corpus

The large corpus is generated from John Cremona's canonical
[`allcurves.00000-09999`](https://github.com/JohnCremona/ecdata/blob/master/allcurves/allcurves.00000-09999)
table. The generator selects 5,000 evenly spaced global minimal models from
the 64,687 rows and tests every prime greater than three dividing each selected
conductor. Since a minimal elliptic curve has bad reduction exactly at the
prime divisors of its conductor, this produces 9,098 Cremona curve/prime
pairs. PARI `elllocalred` both verifies local minimality and supplies the
expected conductor exponent, Kodaira code, and Tamagawa number.

Four additional minimal curves of the form
`[0, 0, 0, 0, p^3]` exercise the `I0*` cubic-root branch at primes 101, 1009,
10007, and 1000003. The complete differential corpus therefore has 9,102
cases. The downloaded ecdata source is covered by Artistic License 2.0 and is
not copied into this repository; the generated corpus and native cache are
ignored build artifacts.

Generate and run it with:

```sh
pnpm run bench:native:tate:corpus
pnpm run bench:native:tate
```

`SAGEJS_NATIVE_TATE_CORPUS` selects another generated corpus. Without a
generated or explicitly selected corpus, the benchmark uses its built-in
13-case smoke set.

## Algorithms and correctness

[`native_tate_large_prime.py`](native_tate_large_prime.py) contains ordinary,
CPython-parseable typed Python. There is no function-name substitution or
Tate-specific intrinsic. Its public compiler entry points separate:

- coefficients to invariants to local classification;
- precomputed `c4`, `c6`, and discriminant to local classification;
- six-input and four-input ABI probes returning the same three-small-integer
  result shape.

The original experiment deliberately used Euler exponentiation for Legendre
symbols and enumerated every residue to count cubic roots. The current source
uses binary quadratic reciprocity for the Jacobi symbol and computes

```text
degree(gcd(x^3 + a*x + b, x^p - x))
```

with scalar degree-three polynomial arithmetic. This remains transparent
typed Python and changes the cubic branch from linear in `p` to logarithmic
modular polynomial exponentiation.

The expanded oracle check also found a production Sage.js defect: its
polynomial exponentiation accumulator started at `x`, thereby computing
`x^(p+1)` rather than `x^p`. The accumulator now starts at one, and the public
elliptic-curve tests include a large-prime `I0*` regression. All 9,102 cases
agree among PARI, interpreted production Sage.js, and the generated
JavaScript, tagged, GMP, and automatically selected compiler backends.

## Matched dedicated-host measurements

These warm medians were measured on an otherwise idle 16-vCPU, 64-GB Google
Cloud VM with an AMD EPYC 7B13, Node 26.7.0, GCC 13.3.0, and PARI 2.15.4.
Every row processes the same 9,102 cases.

| Implementation | Nanoseconds per case |
| --- | ---: |
| compiled typed Python, starting with coefficients | 1,650.3 |
| compiled typed Python, precomputed invariants | 1,141.9 |
| native ABI probe, six inputs and three outputs | 806.8 |
| native ABI probe, four inputs and three outputs | 850.2 |
| production interpreted Sage.js | 19,226.5 |
| PARI, including `ellinit` from coefficients | 1,867.7 |
| PARI, preinitialized elliptic curve | 686.7 |

Thus the compiled typed-Python path is about 11.6 times faster than the
production interpreter and about 11.6% faster than PARI when both start from
the five Weierstrass coefficients. PARI is about 1.66 times faster once curve
invariants are already available. Approximately three quarters of the native
precomputed-invariant time is accounted for by the scalar Node-API boundary
and the exact result tuple, so further scalar arithmetic tuning alone cannot
close that gap.

The distribution matters. The compiled full path is faster than PARI's full
path for the dominant multiplicative `I_n` cases (1,585.7 versus 1,815.3
nanoseconds) and several small additive types. The synthetic `I0*` case at
`p=1000003` takes 38.9 microseconds compiled versus 2.9 microseconds in PARI.
That remaining large-prime gap is attributable to generic tagged scalar
finite-field arithmetic versus PARI's specialized `FpX_nbroots`, rather than
the former linear root enumeration.

The generated cache entry is 3.1 MB, including a 520-KB stripped native addon,
a 969-KB annotated C source file, and a 1.1-MB provenance-rich manifest. The
typed Python source remains the maintained algorithm.

## Interpretation

The appropriate comparison has two answers:

1. For end-to-end local classification from coefficients, source-transparent
   typed Python can already match or beat mature C on this representative
   corpus.
2. For already initialized library objects and isolated large-prime finite
   field kernels, PARI remains faster. Native batching and compiler-recognized
   bounded residue arithmetic are the most credible next optimizations.

The benchmark intentionally reports Kodaira-family and prime-size buckets so
that future optimizations cannot improve a dominant easy branch while hiding
a regression in a rare mathematical branch.
