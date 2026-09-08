# Rational irreducibility without public factor reconstruction

This implements the first opportunity from the
[public constructor profile](cubic-constructor-costs.md). It changes the
public rational-polynomial predicate, not the closed cubic class-group
algorithm, its bounds, GRH assumptions, or receipts.

## Mathematical contract

For $0\ne f\in\mathbb Q[x]$ of positive degree, write its complete irreducible
factorization as $f=u\prod_{i=1}^r p_i^{e_i}$, with $u\in\mathbb Q^\times$,
distinct nonconstant irreducible $p_i$, and positive integer $e_i$. Then
$f$ is irreducible if and only if $r=1$ and $e_1=1$. The factorization of the
primitive integer numerator supplies the same factors and exponents over
$\mathbb Q$; rational content is a unit. Zero and constant polynomials return
`False`, without asking FLINT to factor zero. This fixes the previous zero
case, which could raise from `factor()` instead of returning a Boolean.

The new path trusts FLINT's complete-factorization contract, as `factor()`
already does. It does not independently certify FLINT's irreducibility tests.
The removed reconstruction equality was a useful redundant consistency check
against some possible implementation faults, but not a proof that returned
factors were irreducible. We make that trust boundary explicit rather than
claiming identical fault-detection coverage.

This criterion is deliberately scoped to `QQ`. Integer-polynomial content
has different unit semantics; the `ZZ` path and finite-field dispatch are
unchanged.

## Implementation and ownership

`PolynomialElement.is_irreducible()` delegates rational inputs to the lazy
`public_structural.rational_is_irreducible` helper. On resource-backed inputs,
ordinary Python calls the existing generated factorization binding and reads
its count and, only when needed, first exponent. No factor coefficient bytes,
public factor polynomials, products or reconstruction comparisons are made.

The factorization is owned by a `with` block, which closes on true, false and
exceptional exits. The input polynomial is borrowed, not closed or mutated.
No new external library, handwritten mathematical C, native boundary or
resource allowance is introduced. Resource-unavailable inputs retain the
previous factorization/reconstruction fallback, except that zero/constants
are handled before that branch.

## Compiler obstruction remains explicit

An attempted `@native` implementation of the same resource context manager
fails in IR 40: `AST_With` currently handles native vectors, matrices and
arenas, not ordinary owned FFI constructors. The diagnostic error is
`NativeIntegerVector() requires capacity and memory_limit` for
`with fmpq_polynomial_factor_resource(source) as factors:`.

The working implementation is ordinary Python using existing generated FFI,
not a claimed closed native predicate. This follows the architecture's
ordinary-Python-first rule while removing the measured reconstruction cost.
A future compiler extension must implement the real lexical lifetime:
fallthrough, return, errors, ownership escape and borrowed-input lifetime.
It must not merely delay all closes to function exit and claim general
context-manager semantics. The cubic polynomial-to-class-group native core
itself remains unchanged and closed.

## Verification scope

The focused test covers Eisenstein polynomials in degrees 2 through 9,
nonmonic and rationally scaled inputs, large coefficients, translated
polynomials, repeated factors and reducible products. An independent exact
rational-root criterion supplies expected results for 150 monic cubics and
their rational rescalings. Metadata exceptions are injected to check
deterministic closure, short-circuit rejection and borrowed-source survival.
A synthetic no-resource fixture verifies the retained fallback dispatch; it
is not a browser mathematics qualification.

The rebuilt public runtime passes all three focused tests, the existing
exact-polynomial-resource regression suite, the full build, strict Python
checks (382 modules), and `pnpm architecture:check`. Public cubic smoke tests
return class groups of orders 5, 2 and 3 for $x^3+9x-55$,
$x^3-x^2+3x-4$ and $x^3-x^2-11x-63$, respectively, with authenticated receipts
and successful independent exact replay.

Controlled performance measurements are pending. Local timings overlapping
other validation jobs are not performance evidence. This is not a new
1,000-field corpus or browser qualification.
