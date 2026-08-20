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
  The default evaluator uses a native FLINT Arb/Acb double-Mellin kernel when
  available and retains the ordinary-Python implementation as
  `algorithm="reference"`.

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

The native evaluator computes a complete derivative jet in one call:

```sage
L.central_jet(4)
# (L(1), L'(1), L''(1), L'''(1), L''''(1))

L.central_jet(4, completed=True)
# the corresponding derivatives of Lambda(C,s)
```

`L.value_ball(1)` exposes the Arb midpoint, arithmetic radius, accuracy, and
the separate analytic-refinement status. The Arb radius rigorously encloses
roundoff in the finite computation, but it does **not** yet enclose the two
infinite trapezoid discretization errors. Consequently the result continues
to say `rigorous=False` and is not a theorem-proving complex ball.

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
all requested `s` values and derivatives then share the grid. The production
path evaluates both Mellin grids with FLINT Arb/Acb. The
portable reference uses binary64 Lanczos gamma at ordinary precision and
`mpmath` at higher precision. Both paths run independent coarse and fine
coefficient/grid plans, and they are differential oracles for each other.

No PARI, Magma, lcalc, or standalone executable is used at runtime. Exact
coefficients come from the existing portable smalljac/rforest and certified
bad-reduction paths. PARI and Magma are development oracles only.

The engine currently requires the complete global reduction assembly to
succeed. In particular, bad reduction at 2 and odd reduction outside the
implemented almost-good/semistable envelope remain honest capability
boundaries.

## Quadratic-twist families

`quadratic_twists` scans fundamental quadratic discriminants in deterministic
order. Every discriminant produces a record: unsupported exact local data and
numerically indeterminate rows are retained rather than silently skipped.
The present segmented squarefree sieve accepts endpoints through `10^12` in
absolute value; analytic resource limits can still turn a very large twist
into an explicit unsupported row.
For `gcd(D,N)=1`, it uses the primitive-character identities

```text
N(C tensor chi_D) = N(C)*abs(D)^(2*g),
w(C tensor chi_D) = w(C)*chi_D((-1)^g*N(C)),
a_n(C tensor chi_D) = a_n(C)*chi_D(n).
```

Thus the scanner does not ask the general bad-reduction engine to rediscover
the standard ramified twist at every prime dividing `D`. Discriminants sharing
a prime with `N` remain explicit `unsupported` rows until the overlapping-local
formulas are implemented.

```sage
family = C.quadratic_twists(-1000, 1000, prec=32, max_order=1)
for row in family:
    if row.available:
        print(row.discriminant, row.conductor, row.root_number,
              row.central_derivatives)
    else:
        print(row.discriminant, row.status, row.reason)
```

The individual generalized twist model is also public:

```sage
C5 = C.quadratic_twist(5)
C5.hyperelliptic_polynomials()
```

Use `C.quadratic_twists(5, 5)` for its coprime conductor, sign, and central
jet. Direct `C5.global_reduction()` still goes through the general local model
classifier, whose supported reduction envelope is narrower than the coprime
twist theorem.

Long scans use canonical JSONL checkpoints. Integers are decimal strings, the
header contains the exact source model and numerical request, a partial final
line is safely truncated, and resume verifies every preceding fundamental
discriminant before appending:

```sage
scan = C.quadratic_twists(-10^6, 10^6, prec=53)
scan.export_jsonl("twists.jsonl", resume=True)
```

Progress and cancellation callbacks run only at safe discriminant boundaries.
All twists share one extendable exact coefficient prefix for the base curve;
each row applies its Kronecker character to that cache. A future bulk kernel
can sieve many characters and evaluate several twists together without
changing this checkpoint format. When only the central value is requested and
the certified sign is `-1`, the scanner records the exact functional-equation
zero without constructing a numerical grid.

For a reproducible stage-by-stage timing on the conductor-713 example, run

```bash
pnpm bench:hyperelliptic-lseries
```

On the Linux x64 development host with Node 26.7.0, a warm exact prefix of
5000 coefficients took 0.73 seconds, three 32-bit values sharing one native
grid took 0.23 seconds, and the 32-bit probable-rank computation took 0.24
seconds.
The benchmark prints its platform and all stage results as JSON; these numbers
are a reproducibility baseline, not a universal performance promise.
