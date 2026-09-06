# Cubic splitting by a Frobenius remainder

Status: candidate mechanism; public-call performance qualification pending.

The complex-cubic analytic certificate needs the residue degrees of primes,
not their root coordinates. Previously its ordinary-index branch evaluated
the defining cubic at every residue modulo each rational prime below the
analytic cutoff. This document justifies replacing that enumeration; it does
not change the analytic theorem, its GRH assumptions, or the stopping rule.

## Mathematical argument

Let $p$ be a proven prime and let
$f=x^3+bx^2+ax+c\in\mathbf F_p[x]$. Compute

$$
g=(x^p-x)\bmod f.
$$

The polynomial $x^p-x$ is the product of the distinct linear factors
$x-r$ for $r\in\mathbf F_p$: every residue satisfies $r^p=r$, and its
derivative is $-1$. Consequently

$$
\#\{r\in\mathbf F_p:f(r)=0\}=\deg\gcd(f,g).
$$

Binary powering in $\mathbf F_p[x]/(f)$ computes the remainder in
$O(\log p)$ fixed-size polynomial products, with no root search. Products
have degree at most four. Subtracting their leading coefficient times $xf$
and then the new cubic coefficient times $f$ gives the three stored residues.

The remaining Euclidean calculation has only three cases:

- If $g=0$, the gcd has degree three.
- If $g$ is linear, its unique root is common precisely when substitution
  in $f$ vanishes. A nonzero constant has no common root.
- If $g$ is quadratic, normalize it to $x^2+ux+v$. Then
  $f\bmod g=(u^2-v-bu+a)x+(uv-bv+c)$. A zero remainder gives gcd degree
  two; otherwise substitute the root of this linear remainder in $g$.

The certificate planner also needs the sum of multiplicities of rational
roots. Three distinct roots have total multiplicity three. Two distinct
rational roots of a cubic leave another rational linear factor, hence total
multiplicity three as well. With a single root $r$, a nonzero derivative
means multiplicity one. A zero derivative means a repeated root; dividing
by $(x-r)^2$ leaves a rational linear factor, which must be $x-r$ because
there is only one distinct root. Its multiplicity is therefore three.
This includes inseparable cubics in characteristic three. No characteristic
two or three exception to the gcd argument is needed.

The remaining irreducible degree is three minus this multiplicity sum. Thus
the distinct-root count and multiplicity sum reproduce the old planner's
linear, quadratic and cubic Euler-factor contributions exactly, including
ramified primes. This is an equality of its complete finite prime-power
plan, not merely agreement of its final class number.

## Preconditions and machine bounds

`cubic_root_multiplicity_counts` requires a proven prime $2\leq p\leq65535$
and canonical residues $0\leq a,b,c<p$. The planner already proves primality
by trial division and reduces its coefficients. Its two existing analytic
cutoffs, 997 and 1494, fit strictly inside this machine envelope.

All products are reduced before further multiplication. The largest sums
are bounded by $3p^2$, strictly below $2^{64}$ throughout the envelope.
Subtractions add one or two moduli first to avoid unsigned underflow. Inverses
are computed only for nonzero residues, by exponentiation to $p-2$.
Invalid bounds return the impossible counts $(4,4)$, which the caller rejects.
This is not a primality test; no contract is asserted for composite moduli.

The routine owns no heap object or foreign resource. Its state is a bounded
collection of word scalars and fixed tuples, lowered from ordinary Python.
The maximal-order branch at primes dividing the basis denominator remains
unchanged. Polynomial factorization there is not substituted for certified
maximal-order prime decomposition.

## PARI comparison and scope

The locally retained PARI 2.17.4 source uses `buch2.c:get_fs` to request
`Flx_degfact` away from equation-index primes, and `idealprimedec` otherwise.
`cache_prime_dec` retains these degree patterns for its generator and residue
calculations. `FpX_factor.c:Flx_degfact` delegates to the degree-factorization
path of Cantor factorization. Sage.js need not copy that implementation:
degree three admits the explicit remainder calculation above.

PARI's residue approximation and Sage.js's rigorous Belabas--Friedman
enclosure are separate algorithms. This change does not replace the latter
with floating-point evidence. See the existing
[class-group correctness argument](complex-cubic-native-class-group-proof.md)
and [PARI's number-field documentation](https://pari.math.u-bordeaux.fr/dochtml/html/General_number_fields.html).

## Qualification

The focused regression compares ordinary CPython, actual generated JavaScript,
tagged, GMP, and automatic native execution with an independent exhaustive root/Hasse
derivative oracle. It enumerates every monic cubic modulo 2, 3, 5, 7, 11 and
13; adds deterministic samples through the prime 65521; and explicitly tests
triple roots, double roots and invalid word-envelope inputs: 4,667 valid
polynomials per backend, plus invalid-envelope cases on generated backends.

On the dedicated `opt` host, a fixed-effort-five comparison of the frozen
1,000-field survey and twelve controls produced 940 successful computations,
72 matching declines, and no errors. Every successful pair had identical
64-slot outputs, including class number and invariant factors; every decline
had the same phase code. These are **native fixed-budget** outcomes, not the
public API's coverage: the public driver can retry other efforts. This census
does not itself independently replay the mathematical certificates.

The full build, strict Python checks and architecture audit passed. Focused
class-group tests exercised authenticated receipts, independent exact replay,
the nontrivial LMFDB corpus, large regulators, resumed certification, the
direct fmpz call graph, resource exhaustion and subsequent reuse. Existing
arena and source allowances were not increased. The generic finite-field
primitive belongs to the polynomial-kernel package, not the number-field
package; its explicit dependency is recorded in the package graph.

An alternating native-core diagnostic on fourteen exposed fields found about
0.2 ms improvement on the ordinary analytic cases. For $x^3+9x-55$, the
retained medians were 3.034 ms before and 2.801 ms after. The two smallest
cases were effectively unchanged. This is not a public-call comparison or
the frozen ABBA/BAAB promotion protocol, and **does not establish PARI parity**.
See [the campaign checkpoint](cubic-next-regime-checkpoint.md) for identities,
negative experiments and remaining gates.

Complete transcript comparison and independent mathematical replay across the
full survey, current-source public timings on `opt`, and held-out neighbor
qualification remain separate campaign gates. This proof alone is not a
measured PARI win or a release qualification.
