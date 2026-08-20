---
title: "Hyperelliptic conductors, root numbers, and L-series"
---
# Hyperelliptic conductors, root numbers, and L-series

Sage.js can assemble certified global arithmetic data and numerically evaluate
the Hasse--Weil L-function of a supported genus-2 or genus-3 hyperelliptic
Jacobian over `QQ`. The exact and numerical parts have deliberately different
contracts:

- local Euler factors, conductor exponents, the global conductor, and the root
  number are exact and carry certificates;
- L-values, derivatives, and analytic ranks are arbitrary-precision numerical
  computations checked by nested refinement, not theorem-proving enclosures.

## Certified global data

Here is a genus-2 curve whose two bad primes are semistable:

```sage
R.<x> = PolynomialRing(QQ)
C = HyperellipticCurve(x, x^3 - x + 1)

C.bad_primes()
# (23, 31)
C.conductor()
# 713
C.root_number()
# 1
```

The full object preserves the local proof data:

```sage
G = C.global_reduction()
G
# GlobalReductionData(conductor=713, root_number=1, bad_primes=(23, 31))

[(d.prime, d.reduction_type, d.conductor_exponent,
  d.local_root_number) for d in G.local_data]
# [(23, 'semistable_nodal', 1, 1),
#  (31, 'semistable_nodal', 1, 1)]

G.certificate['archimedean_sign_formula']
# '(-1)^genus'
```

For semistable reduction, the finite local sign is

```text
(-1)^dim H_1(dual graph, Q)^Frobenius.
```

Sage.js obtains that dimension as the multiplicity of `T=1` in the exact
Frobenius polynomial stored in `dual_graph_euler_coefficients`. Good abelian
reduction—including the implemented genus-2 almost-good cases—has local sign
`+1`; the real-place sign is `(-1)^genus`. The semistable formula is the local
root-number theorem in [*Arithmetic of hyperelliptic curves over local
fields*](https://arxiv.org/abs/1808.02936).

Global assembly is atomic. It factors the discriminant of the completed
integral branch polynomial, checks 2 and every prime in the discriminant or
model-denominator support, and returns only after every candidate has a local
certificate. A wild or otherwise unsupported prime raises
`GlobalReductionUnsupportedError` with the prime and local diagnostics. It
never returns a partial conductor.

## The analytic L-series

```sage
L = C.lseries()
L.curve() is C
# True

L.coefficients(20)
# [0, 1, -1, -1, 0, 1, 1, -1, -1, -3, -1, 2, 0, -3, 1,
#  -1, -1, 8, 3, -5, 0]

L(1)
# 0.285801000946...   (numerical)
L.value(2)
# 0.656103102139...   (numerical)
L.derivative(1, 1)
# numerical first derivative
```

Several points reuse one exact coefficient prefix and one theta grid:

```sage
L.values([1, 1.25, 2])
```

The canonical completion is

```text
Lambda(C,s) = A^s Gamma(s)^g L(C,s),
A = sqrt(N)/(2*pi)^g,
Lambda(C,s) = w Lambda(C,2-s).
```

It is available directly, together with a numerical functional-equation
residual:

```sage
L.completed_value(1)
L.check_functional_equation()
# approximately 0
```

`L.last_diagnostics()` reports the conductor and sign used, exact coefficient
cutoffs and backends, inverse-Mellin and outer-grid sizes, the coarse/fine
refinement difference, and `rigorous=False`.

The same API works in genus 3. This odd-degree example is particularly fast
because its good local factors use the certified rforest/Jacobian path:

```sage
f = x^7 + 4*x^6 + 6*x^5 + 7*x^4 + 5*x^3 + 3*x^2 + x
D = HyperellipticCurve(f, 1)
D.conductor(), D.root_number(), D.bad_primes()
# (24055, 1, (5, 17, 283))
D.lseries().value(1, prec=32)
# 0.226...   (numerical)
```

## Probable analytic rank

Functional-equation parity is imposed on the derivatives of the **completed**
function, not on raw derivatives of `L(C,s)`. The probable rank search starts
at the parity forced by the certified root number, compares independent
coarse and fine completed jets, and stops at the first derivative separated
from their numerical discrepancy.

```sage
C.analytic_rank()
# 0

C.analytic_rank(leading_coefficient=True)
# (0, 0.285801000946...)
```

The second entry is the first nonzero raw derivative, not its Taylor
coefficient. As with elliptic-curve numerical analytic rank, this is a
probable answer. A failure to isolate a derivative raises
`HyperellipticLseriesNumericalIndeterminacyError`; increasing `prec` or
`max_order` is explicit rather than silently guessing.

## Numerical algorithm and portability

Let `K_g` be the inverse Mellin transform of `Gamma(s)^g` and put
`Theta(t)=sum(a_n K_g(nt/A))`. Splitting the Mellin integral at the center and
using the functional equation gives

```text
Lambda(C,s) = integral_0^infinity Theta(exp(u))
              * (exp(s*u) + w*exp((2-s)*u)) du.
```

Evaluating a Meijer-G function separately for every `(n,u)` would be slow.
Instead Sage.js obtains the whole theta grid from a vertical inverse-Mellin
trapezoid. Every vertical node evaluates one ordinary Dirichlet polynomial;
all requested `s` values and derivatives then share the grid. Default
binary64 work uses a portable Lanczos gamma implementation, while higher
requested precision uses `mpmath`. Both paths run independent coarse and fine
coefficient/grid plans.

No PARI, Magma, lcalc, or standalone executable is used at runtime. Exact
coefficients come from the existing portable smalljac/rforest and certified
bad-reduction paths. PARI and Magma are development oracles only.

The engine currently requires the complete global reduction assembly to
succeed. In particular, bad reduction at 2 and odd reduction outside the
implemented almost-good/semistable envelope remain honest capability
boundaries.

For a reproducible stage-by-stage timing on the conductor-713 example, run

```bash
pnpm bench:hyperelliptic-lseries
```

On the Linux x64 development host with Node 26.7.0, a warm exact prefix of
5000 coefficients took 0.74 seconds, three 32-bit values sharing one grid took
12.25 seconds, and the 32-bit probable-rank computation took 15.27 seconds.
The benchmark prints its platform and all stage results as JSON; these numbers
are a reproducibility baseline, not a universal performance promise.
