# Hyperelliptic curves to `rforest`: implementation memo

This memo specifies the missing curve-specific layer between a genus-2/3
hyperelliptic curve and the generic `rforest` matrix-product API.  The formulas
are from Harvey--Sutherland, *Computing Hasse--Witt matrices of hyperelliptic
curves in average polynomial-time, II* (especially equations (7)--(9) and
Algorithms `ComputeHasseWittFirstRows` and `ComputeHasseWittMatrices`).

The main conclusion is that the current `rforest` repository is sufficient as
the product engine.  It intentionally contains no general curve-to-matrix
adapter: the only curve example in the repository is the elliptic
`test_rforest.c`.  `pyrforest` is likewise a wrapper around generic polynomial
matrix products.  We need to implement the small, exact adapter described
below.

## 1. Model accepted by the recurrence

The recurrence works at odd primes with

```text
y^2 = F(x),  F in ZZ[x],  deg(F) in {2*g + 1, 2*g + 2}.
```

For the Sage model `y^2 + h(x)y = f(x)`, use

```text
F(x) = h(x)^2 + 4*f(x),       y' = 2*y + h(x).
```

This is an isomorphism at every odd prime.  For rational input, first use the
project's exact integral coordinate transform, and exclude primes dividing its
denominators/scale.  The characteristic polynomial of the matrix below is
basis-independent, so coordinate scaling does not alter the desired
`L_p(T) mod p`.

Characteristic 2 is not supported by this route.  It must use a separate
fallback.

For a prime `p`, the reduced equation is usable when its degree is still
`2*g+1` or `2*g+2` and `gcd(F mod p, F' mod p) = 1`.  A degree-`2*g+2`
equation may lose its leading term and retain degree `2*g+1`; this can still be
good reduction.  The recurrence also tested correctly in that situation, but
an initial implementation may harmlessly send the finitely many primes
dividing the leading coefficient to the direct fallback.

## 2. Translation strategy

Choose `g` distinct integers `a_1,...,a_g`; the deterministic default
`a_i = i-1` is sufficient.  For each `a`, form over `ZZ`

```text
F_a(x) = F(x+a),
(F_a)_j = sum_{t=j}^d binomial(t,j) * a^(t-j) * F_t.
```

Write

```text
c = 0 if F_a(0) != 0, otherwise 1,
H(x) = F_a(x) / x^c = sum_{j=0}^r h_j*x^j,
r = d-c,
e = 2-c.
```

Squarefreeness implies `c <= 1`.  Usually `c=0` and `e=2`.  If `a` is an
exact integral root, then `c=1` and `e=1`, which reduces both the matrix
dimension and the product length.

For a translation constructed with `c=0`, a prime dividing `F(a)=h_0` is
inadmissible for that batch even if it is a good prime of the curve.  Put all
such primes into a finite direct-fallback set.  If `F(a)=0` identically, a good
prime cannot divide `h_0=F'(a)`, since that would make the reduced polynomial
non-squarefree.

Also use the direct fallback for:

- `p=2`;
- good primes `p<g`;
- primes dividing some `a_i-a_j`, so the translations collide modulo `p`;
- primes excluded by the rational-to-integral transform;
- any prime for which one translated recurrence is inadmissible;
- endpoint/word-size or native resource-limit failures.

With `a_i=0,...,g-1`, translation collisions occur only among the already tiny
primes.  Bad-reduction primes should be returned as bad rows, not fed to either
the forest or exact completion.

The direct fallback needed here is simple and exact: reduce `F` modulo `p`,
compute the ordinary polynomial power `F(x)^((p-1)/2)` (without quotienting by
another polynomial), and extract coefficients `x^(p*i-j)`.  It is linear in
`p` up to fixed-genus polynomial-arithmetic factors, but the exceptional set is
finite and small for fixed input.

## 3. The transition matrix

Use zero-based matrix indices.  Define `r x r` integer matrices `A` and `B` by

```text
A[i, i-1] =  2*h_0                         for 1 <= i < r,
A[i, r-1] = -2*h_(r-i)                     for 0 <= i < r,
B[i, r-1] = (r-i)*h_(r-i)                  for 0 <= i < r,
```

with every other entry zero.  Then the paper's matrix is simply

```text
M_k = B + k*A.
```

Equivalently, its only nonzero entries are

```text
M_k[i, i-1] = 2*k*h_0                      (1 <= i < r),
M_k[i, r-1] = (r-i-2*k)*h_(r-i)            (0 <= i < r).
```

Let `V_0=[0,...,0,1]` be a row vector of length `r` and put
`n=(p-1)/2`.  The unnormalised row needed at `p` is

```text
u_p = V_0 * M_1 * ... * M_(e*n) mod p.
```

There are two equivalent ways to give this to `rforest`.

### Raw linear matrices

Use polynomial matrix `P(x)=B+x*A`, `kbase=1`, and endpoint

```text
k[p] = e*n + 1.
```

Thus the endpoint is `(p+1)/2` for `e=1` and `p` for `e=2`.  The existing
elliptic `test_rforest.c` is the `e=2` case: its endpoint is `p`, so the product
ends at `M_(p-1)`.

### Paired matrices (recommended)

Use one matrix per `n`, as in the paper:

```text
P(x) = M_x                                      if e=1,
P(x) = M_(2*x-1) * M_(2*x)                     if e=2.
```

For `e=2`, its coefficient matrices are

```text
P_0 = (B-A)*B,
P_1 = 2*(B-A)*A + 2*A*B,
P_2 = 4*A*A.
```

In both cases call `rforest` with `kbase=1` and

```text
k[p] = n+1 = (p+1)/2.
```

This computes `P(1)...P(n)` and hence exactly `M_1...M_(e*n)`.  It uses degree
1 for `e=1` and degree 2 for `e=2`.  It is preferable to the raw form because
there are half as many transition factors/evaluations in the usual `e=2`
case.

The current C ABI stores each polynomial entry contiguously:

```text
M[((i*dim + j)*(deg+1)) + q] = coefficient of x^q in P[i,j].
```

For each translated curve use `rows=1`, `dim=r`, modulus `m[p]=p`, and a fresh
copy of `V=V_0` and `z=product(m[p])`; both `V` and `z` are mutated.  Endpoints
must be monotone.  The C API asserts on malformed inputs and has no status
return, so all dimensions, allocations, endpoints, and `kappa` must be checked
in the host adapter before entering it.

The library has process-global arithmetic/memory state and is not reentrant.
Calls must be serialized unless the native port first removes that state.

## 4. First-row normalization and extraction

Let `chi_p(t)` be the Legendre symbol and let `delta_p=(e*n)! mod p`.  The first
row of the translated matrix is the last `g` entries of `u_p`, reversed and
multiplied by

```text
s_p = chi_p(2)^e / (chi_p(h_0)^(e-1) * delta_p) mod p.
```

In code,

```text
row_j = s_p * u_p[r-j] mod p,                1 <= j <= g.
```

Useful specialisations are:

- `e=2`: Wilson gives `delta_p=(p-1)!=-1`, and `chi_p(2)^2=1`, so
  `s_p=-chi_p(h_0)`.  No factorial forest is needed.
- `e=1`: `s_p=chi_p(2)/n!`.  Compute `n! mod p` for every prime with one
  reusable scalar forest: polynomial matrix `[x]`, `V=[1]`, `kbase=1`, and
  endpoint `n+1`.  The same factorial results serve every `e=1` translation.

Do not try to choose the sign of `n!` from a square-root formula; it is a
genuine arithmetic ambiguity noted in the paper.

## 5. Reconstructing the full matrix

Let `q_ij` be entry `j` in the first row computed for `F(x+a_i)`.  The paper's
matrix convention is

```text
W[i,j] = coefficient of x^(p*i-j) in F(x)^((p-1)/2),  1 <= i,j <= g.
```

Under translation,

```text
W(a) = T(a) * W * T(-a),
T(a)[i,j] = binomial(j-1,i-1) * a^(j-i)       for i <= j.
```

Recover `W` one column at a time.  Once columns `1,...,j-1` are known, define

```text
gamma_j(a) =
  sum_{k=1}^g sum_{ell=1}^{j-1}
    binomial(j-1,ell-1) * (-a)^(j-ell) * a^(k-1) * W[k,ell].
```

Then solve the `g x g` Vandermonde system

```text
sum_{k=1}^g a_i^(k-1) * W[k,j] = q_ij - gamma_j(a_i)
```

over `F_p`.  The matrix is invertible precisely when the chosen translations
are distinct modulo `p`.  For genus 2/3, straightforward modular Gaussian
elimination is adequate and less error-prone than a specialised inverse.

Finally compute

```text
det(I - T*W) = 1 + c_1*T + ... + c_g*T^g mod p.
```

These are exactly the independent residues of
`L_p(T)=det(1-T*Frob)`:

```text
L_p(T) == det(I-T*W) mod p.
```

In particular `c_1=-trace(W) mod p`.  Keep this sign and coefficient order at
the native boundary; exact genus-3 completion consumes `(c_1,c_2,c_3) mod p`.

## 6. Convention trap in Sage

For a prime field, Sage's `Cartier_matrix()` constructs the coefficient matrix
`[F^((p-1)/2)_(p*i-j)]` used above.  The method named `Hasse_Witt()` in the
current Sage source instead multiplies several Frobenius-twisted Cartier
matrices; even over `GF(p)` it is therefore generally a power of the matrix
needed here.  Differential tests for this adapter must use:

- direct coefficient extraction (best and independent);
- Sage `Cartier_matrix()` for supported odd-degree `h=0` cases;
- the characteristic polynomial congruence against Sage/Magma local factors.

Do not compare the raw output to Sage `Hasse_Witt()`.

Literature also varies between Cartier--Manin matrices, Hasse--Witt matrices,
and their transposes.  The exact convention above is the one in the
Harvey--Sutherland paper, agrees with Sage `Cartier_matrix()`, and satisfies
`L_p(T)=det(I-TW) mod p`.

## 7. Differential validation already performed

A standalone exact-Python prototype was checked against direct expansion of
`F(x)^((p-1)/2)`:

- 3,883 nonsingular/admissible random cases across genera 1, 2, and 3;
- both degrees `2*g+1` and `2*g+2`;
- primes from 3 through 97;
- both the transition recurrence and translated-row Vandermonde
  reconstruction;
- another 2,791 `c=1` cases with an exact root at zero;
- degree `2*g+2` examples whose leading coefficient vanishes modulo `p` but
  whose reduced model still has genus `g`.

Every case matched direct coefficient extraction.

The genus-3 degree-8 example in the paper was also reproduced exactly:

```text
F = 2*x^8+3*x^7+5*x^6+7*x^5+11*x^4+13*x^3+17*x^2+19*x+23,
p = 97, translations = [0,1,2].

translated first rows:
[9,37,54], [43,60,30], [5,70,84]

reconstructed W:
[ 9 37 54]
[70 62 16]
[61  4 26]
```

This is the matrix printed in the paper.

Production fixtures should add:

- fixed genus-2 degree-5/6 and genus-3 degree-7/8 curves;
- exact-root (`c=1`) and generic (`c=0`) translations;
- a nonzero original `h(x)` tested via `h^2+4f`;
- primes dividing a chosen translated constant (direct fallback);
- good even-degree reduction with leading-term loss;
- bad reduction and characteristic 2 status rows;
- raw-linear versus paired-matrix equality;
- native `rforest` output versus direct coefficients, not just the pure
  recurrence prototype;
- Linux optimized/portable, macOS arm64, Linux arm64, and Windows x64 equality.

## 8. Native portability and API constraints

These are adapter requirements revealed by the current C implementation:

- `long` is used for endpoints and counts.  On Windows LLP64 this is only 32
  bits.  Either expose an honest prime bound below `2^31`, or change the pinned
  internal ABI to fixed-width 64-bit indices and audit every loop/conversion.
- Internal limb-size helpers must use 64-bit count-leading-zero operations
  (`clzll`, not `clzl`) on Windows.
- The FFT code assumes 64-bit GMP limbs and has process-global setup state.
- The Windows build needs the same runtime/CRT discipline as the existing
  smalljac port; the portability audit observed clang runtime dependencies for
  128-bit division helpers.
- `A` must be preinitialised for exactly `rows*dim*nprimes` GMP integers.
- `kappa` is empirical.  Use a conservative default and benchmark it; never
  pass a negative or unchecked value into the asserting C API.

For the first product implementation, the safe contract is a serialized batch
operation with a documented prime bound, explicit per-row status, and direct
fallback for the finite exceptional set.  It should return either the full
`g x g` matrix modulo `p` or, preferably for the exact-L-polynomial pipeline,
the normalized residues `(c_1,...,c_g)` plus enough diagnostic status to
distinguish bad reduction, fallback, and resource limits.

## 9. Primary sources

- David Harvey and Andrew V. Sutherland,
  [*Computing Hasse--Witt matrices of hyperelliptic curves in average
  polynomial-time, II*](https://arxiv.org/abs/1410.5222).
- David Harvey and Andrew V. Sutherland,
  [the original average-polynomial-time paper](https://arxiv.org/abs/1402.3246).
- Canonical MIT-licensed
  [`rforest`](https://github.com/edgarcosta/rforest), especially `rforest.h`,
  `rforest.c`, and `test_rforest.c`.
- [`pyrforest`](https://github.com/edgarcosta/pyrforest), useful for documenting
  the generic matrix-product ABI but not a curve adapter.
- Current Sage source
  `sage/schemes/hyperelliptic_curves/hyperelliptic_finite_field.py`, especially
  `_Cartier_matrix_cached` and `_Hasse_Witt_cached`.
