# rforest and genus-3 completion audit

This directory records the implementation decision behind the genus-3 batched
local-factor lane.  It is development evidence, not a shipped Sage.js API.

## Decision

Integrate the canonical rforest C library as the integer matrix-product engine
for batched Hasse--Witt computation over `QQ`.  Pin commit
`3103d396c67cb1685131b1f11e84975cca335bdf` directly.  Do not integrate
pyrforest: its current submodule pins rforest commit `eb1878be`, from before
the upstream license files were added, and its Sage/Cython conversion layer is
not useful to the native Sage.js boundary.

rforest is viable and unusually portable for code of its age.  Its repository
is not, however, a curve-to-Hasse--Witt library.  Its two-function public ABI
only evaluates polynomial transition-matrix products modulo many supplied
moduli.  Sage.js must still implement the curve-specific matrices, admissible
prime handling, row transformations, and normalization in Harvey--Sutherland
II.  The ordinary per-prime Hasse--Witt implementation remains both the
fallback and the differential oracle.

After rforest produces `c1,c2,c3 mod p`, use exact real-Weil candidate
enumeration followed by a certifying Jacobian search.  Reuse the design of
smalljac's dormant genus-3 completion code, but not the old source as a
dependency: smalljac 4.1.3 has no definitions of `hecurve_g3_compose` or
`hecurve_g3_square`, and its former p-adic coefficient producer is commented
out.

## Source, license, and dependency audit

At the pinned commit the repository has 7,550 lines of C/header source.

- `LICENSE` is MIT, copyright 2026 David Harvey and Andrew Sutherland
  (SHA-256 `3a3d01909dbd4ef225282abd72285f8e5d104b1892695e3fb830181f4117a397`).
- `COPYING` covers David Harvey's bundled `zz` integer/FFT sources under a
  permissive two-clause BSD-style license
  (SHA-256 `00f9c0b8927deae0e654d2d3c41d802db606e757e7ac2c67caf7ce002d10619f`).
- The only runtime libraries are GMP and the platform math/C runtimes.
- There is no C++, Python, Cython, Sage, PARI, OpenMP, or standalone-program
  runtime dependency.
- The custom `zz` layer is not optional in the current call graph.  The
  production source slice is therefore the complete static `librforest`, not
  just `rforest.c` and `rtree.c`.

The narrow reproducible vendor slice is the 20 translation units named by the
upstream `MPZFFTOBJECTS` and `RFORESTOBJECTS` lists: the 18 root-level library
sources plus `fft62/mod62.c` and `fft62/fft62.c`, their headers, `LICENSE`, and
`COPYING`.  Exclude the test/profile programs and export only `rforest` and
`mproduct` from the private adapter.  There is no smaller demonstrated link
closure: even the low crossover path reaches the bundled `zz` machinery.

The installed ABI is:

```c
void rforest(mpz_t *A, mpz_t *V, int rows, mpz_t *M, int deg, int dim,
             mpz_t *m, long kbase, long *k, long n, mpz_t z, int kappa);
void mproduct(mpz_t z, mpz_t *m, long n);
```

`A` has `rows*dim*n` initialized outputs. `M` stores `deg+1` coefficient
matrices.  The call mutates both `V` and `z`; on the demonstrated use `z` is
reduced to one.  All `mpz_t` values are caller-owned.  The interface has no
status return and enforces preconditions with C assertions, so the Sage.js
adapter must validate dimensions, monotone endpoints, allocation products,
and `kappa` before entering C.

rforest is not reentrant.  `hwmpz.c` owns process-global FFT state and setup
flags, and the memory accounting layer also uses globals.  Calls must be
serialized behind the existing native mathematical mutex unless a later
upstream refactor makes the context explicit.

The library accesses GMP's `_mp_d`, `_mp_size`, and `_mp_alloc` fields and
assumes 64-bit GMP limbs in its FFT conversion.  The dependency gate must
assert `GMP_LIMB_BITS == 64`; public integer widths should not expose GMP or C
`long`.

## Portability results

The portable harness duplicates upstream's elliptic trace-sum fixture without
its Unix-only `sys/time.h`.  For `y^2=x^3+2x+3`, all primes from 17 through
100,000, and `kappa=4`, every host returned:

```text
primes=9586 trace_sum=11664
```

Measured rforest times from the upstream harness were:

| Host | Toolchain | rforest time |
| --- | --- | ---: |
| Linux x86-64 | GCC 15.2 | 0.338 s |
| macOS arm64 (M1), GMP 6.3.0 | Apple Clang 17.0.0 | 0.233 s |
| Linux arm64 | GCC 13.3.0 | 0.639 s |

macOS and Linux arm64 build after deleting the makefile's inappropriate
`-m64`; no source changes were needed.

Native Windows x64 compiled all library sources with clang-cl 19.1.5 and linked
against Sage.js's existing vcpkg GMP.  The downstream patch contains one
Windows semantic portability correction:

```diff
-64-__builtin_clzl(x)
+64-__builtin_clzll(x)
```

On LLP64, `unsigned long` is 32 bits, so the original builtin truncates its
`uint64_t` argument and the smoke test crashes.  The fixed build returns the
same trace sum.  It also needs build-only adjustments already established by
the smalljac Windows port: `/MD`, no `-m64`, and
`clang_rt.builtins-x86_64.lib` for `__udivti3` and `__umodti3`.  The upstream
test program itself is Unix-only; `portable_trace_harness.c` is the appropriate
cross-platform smoke test.

A final ASan/UBSan/LeakSanitizer run found that upstream `mproduct` allocated a
temporary GMP vector without releasing it. The pinned patch adds the missing
`mpz_vec_clear_and_free(w,n)`. Rebuilding all 20 translation units with both
sanitizers then ran the complete genus-2/3 bridge with no memory or undefined-
behavior report. This is independent of the LLP64 correction and should be
proposed upstream.

## Exact coefficient lifting

Write the local numerator as

```text
L(T) = 1 + c1*T + c2*T^2 + c3*T^3
         + p*c2*T^4 + p^2*c1*T^5 + p^3*T^6.
```

The paper's convention is

```text
W[i,j] = [x^(p*i-j)] f(x)^((p-1)/2),  1 <= i,j <= 3,
L(T) = det(I-T*W) (mod p).
```

The real Weil polynomial is

```text
h(X) = X^3 + c1*X^2 + (c2-3p)*X + (c3-2p*c1).
```

Put `A=c1`, `B=c2-3p`, and `C=c3-2p*c1`.  The candidate is a genus-3
`p`-Weil polynomial exactly when `h` has all three roots in
`[-2*sqrt(p),2*sqrt(p)]`.  This is checked without numerical roots:

1. the cubic discriminant
   `A^2*B^2-4*B^3-4*A^3*C-27*C^2+18*A*B*C` is nonnegative;
2. the three elementary symmetric functions of the roots shifted by
   `+2*sqrt(p)` are nonnegative;
3. the three elementary symmetric functions of `2*sqrt(p)` minus the roots
   are nonnegative.

The nontrivial shifted inequalities are:

```text
B + 12p - 4A*sqrt(p) >= 0
-C - 4pA + 2(B+4p)*sqrt(p) >= 0
B + 12p + 4A*sqrt(p) >= 0
 C + 4pA + 2(B+4p)*sqrt(p) >= 0,
```

together with `-A+6sqrt(p)>=0` and `A+6sqrt(p)>=0`.  The sign of every
`a+b*sqrt(p)` is decided by signs and the integer comparison `a^2` versus
`b^2*p`.  This proves that the executable candidate filter uses no floating
zero or rounding test.

The crude Weil bounds give

```text
|c1| <= 6*sqrt(p),  |c2| <= 15p,  |c3| <= 20p*sqrt(p).
```

Consequently `c1 mod p` has a unique lift for `p>144`, `c2` has at most 31
lifts, and `c3` has at most `40sqrt(p)+1` lifts.  The exact real-Weil filter
leaves `O(sqrt(p))` candidates.  In the 101-record corpus it leaves 7--269
candidates (269 at `p=1601`), and the standalone BigInt implementation checks
the entire corpus in under 0.3 seconds on the Linux x86-64 development host.
For every good corpus entry at `p=5,7,11`, its candidate count also agrees
exactly with Sage's independent `WeilPolynomials(6,p)` enumeration.

For `p>144`, candidates with the same exact Jacobian order satisfy

```text
delta(c2)=k*p,
delta(c3)=-k*p*(p+1).
```

But `|delta(c3)| <= 40p*sqrt(p)`.  Thus exact `#J(F_p)=L(1)` and the residues
determine the polynomial uniquely whenever `(p+1)^2>1600p`, in particular for
every prime `p>=1601`.  For smaller primes, enumerate and retain the twist:

```text
J  = p^3+1 + (p^2+1)c1 + (p+1)c2 + c3,
Jt = p^3+1 - (p^2+1)c1 + (p+1)c2 - c3 = L(-1).
```

The corpus contains a genuine small-prime collision: for one curve at `p=5`,
two exact Weil candidates have the same `J`, while `(J,Jt)` is unique.  This is
why the twist path cannot simply be deleted.

## Certifying group search

Candidate enumeration makes a rigorous Las Vegas certificate simple.  For
each valid sampled divisor class `D`, compute its exact order `e_D`, or merely
record which candidate orders annihilate it.  The true group order is in the
exhaustive Weil candidate set and is divisible by every `e_D`.  If exactly one
candidate survives, it is therefore the true `L(1)`; no assumption that the
samples generate the Jacobian is used.  Do the same in the quadratic twist if
the primary candidates remain ambiguous.  If several candidates survive,
sample again or use the correctness fallback; never guess.

If the exponent has an `ell^a` part occurring in `t>=1` invariant factors, one
uniform sample fails to capture `ell^a` with probability `ell^(-t)`.  After
`k` independent samples the miss probability is at most `ell^(-k)`, and the
union bound over primes dividing the exponent explains why very few samples
usually suffice.  This probability affects running time only: uniqueness of
the surviving exhaustive candidate is the certificate, so it cannot make an
incorrect result more likely.

There is also a concrete conservative sampling budget.  Weil gives
`#J(F_p) <= (sqrt(p)+1)^6`, so for a word-size prime `p<2^63` its exponent has
fewer than 192 distinct prime divisors.  The probability that `k` samples miss
some full primary exponent is therefore less than `192*2^(-k)`.  The
corresponding tail sum bounds the expected number of samples needed to recover
the full exponent by 10, while 40 samples put this crude bound below
`2*10^-10`.  Production should nevertheless stop on a certificate, not on
that numerical budget, and fall back if uniqueness is not reached.

A simple first implementation can test every surviving candidate order on
each sample, costing `O(m log(p))` Jacobian additions for `m` candidates; here
`m<=269`.  The production fast path should use the congruence-strided
baby-step/giant-step search from the smalljac design, whose interval width
after the mod-`p` information yields `O(p^(1/4))` Jacobian operations.  Twist
work is only needed when the primary order does not certify a unique
polynomial.

The old smalljac implementation confirms the practical structure:

- `smalljac_genus3_charpoly_from_Pmodp` enumerates the admissible `c2` lifts,
  uses Haloui's conditional `c3` bounds, and runs `jac_search` in strides of
  `p*2^r`, where `r` is the rational 2-rank;
- it tests the paired twist order and distinguishes remaining group orders;
- its documented cost is `O(p^(1/4))` Jacobian operations after the mod-`p`
  polynomial is known;
- `jac_order` only declares an exact order when the observed subgroup exponent
  has a unique compatible multiple in the rigorous interval, which is the same
  certificate principle above;
- version 3 used 40 retry samples and warned that exceptional curves could
  remain unresolved at small primes; unresolved is an allowed fallback, not an
  incorrect answer.

For the production implementation, port the search around Sage.js's verified
Jacobian law and exact candidate list.  Do not copy smalljac's floating bounds,
`unsigned long` order limits, static mutable temporaries, or hard-coded retry
policy.

## Included evidence

`benchmark-rforest.cjs` measures the production boundary without conflating
its stages. It reports the raw packed native residue stream, checked Python
row construction, exact Weil-candidate enumeration, and exact filtering with
oracle-derived Jacobian/twist order values separately. Those values are
computed from the checked-in local polynomial as `L(1)` and `L(-1)`; this
benchmark checks filtering cost and correctness, not independent Jacobian
witness generation or certification:

```bash
node bench/rforest/benchmark-rforest.cjs --limit 1009 --repeat 3 \
  > bench/rforest/rforest-benchmark.json
```

Rows without order evidence remain explicitly `indeterminate`; consequently
the completion sample reports both unique and unresolved counts. The raw
stage is the rforest throughput measurement, while the later stages measure
what is still required before Sage.js may return an exact local polynomial.

One warm three-sample Linux x86-64 run under Node 26.7.0 on the development
host, for `y^2=x^7+x+1` and the closed interval `[2,101]`, gave these median
wall times:

| Stage | Median wall time | Result |
| --- | ---: | --- |
| packed native rforest | 38.198 ms | 26 aligned rows |
| checked Python modular rows | 71.415 ms | 24 available rows |
| exact Weil-candidate enumeration | 3442.971 ms | 872 candidates, maximum 63 |
| oracle order/twist filtering | 3418.819 ms | 23 unique, 1 indeterminate |

All three packed streams had SHA-256
`b6e048e71541a9324d7070c7f06715f6ff498f7bd2a1774422ae6107c8e2484c`.
This measurement is intentionally sobering: the production remainder forest
is fast, but ordinary transpiled candidate lifting currently dominates the
complete genus-3 workflow. It supports keeping `algorithm="auto"` on the exact
reference path until the follow-up Jacobian certification lane accelerates
the later stages.

- `generate_genus3_oracle.sage` regenerates the fixture using Sage only as a
  development oracle.
- `genus3_candidates.mjs` is an executable exact specification and benchmark
  for residue lifting and real-Weil filtering.
- `portable_trace_harness.c` is the cross-platform rforest smoke test.
- `../../test/data/hyperelliptic-rforest/genus3-oracle.json` contains odd- and
  even-degree models, small primes, the `c1` uniqueness boundary, and primes
  1009 and 1601.  The `p=101` sparse odd-degree value was independently checked
  against Magma 2.18-5; all records also verify the defining Hasse--Witt
  coefficient formula directly.

Primary references:

- Harvey--Sutherland, *Computing Hasse--Witt matrices of hyperelliptic curves
  in average polynomial time*, arXiv:1402.3246.
- Harvey--Sutherland, *... II*, arXiv:1410.5222.
- Kedlaya--Sutherland, *Computing L-series of hyperelliptic curves*,
  arXiv:0801.2778.
- Sutherland, *A generic approach to searching for Jacobians*,
  arXiv:0708.3168.
