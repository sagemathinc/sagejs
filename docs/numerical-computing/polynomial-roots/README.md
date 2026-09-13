# Numerical polynomial roots

`sagejs.numerics.approximation.polynomial_roots` computes every finite complex
root of a univariate polynomial from real or complex binary64 coefficients. It
returns a `PolynomialRootsResult`, not a bare list, because a list cannot say
whether its roots were independently checked or whether a close group is an
ill-conditioned numerical cluster.

```python
from sagejs.numerics.approximation.polynomial_roots import polynomial_roots

result = polynomial_roots([1, -6, 11, -6])
result.roots
# ((approximately 1), (approximately 2), (approximately 3))

result.validation.to_dict()
result.value["root_backward_errors"]
result.value["root_relative_condition_estimates"]
result.clusters
result.explain()
```

Coefficients are in descending-power order unless `order="ascending"` is
explicitly requested. Leading zero coefficients are ignored. Exact trailing
zeros are stripped before iteration and restored as exact zero roots. The zero
polynomial returns `invalid_problem`; a nonzero constant succeeds with an empty
root set.

## Algorithm and backend survey

This slice deliberately starts with an ordinary CPython-parseable algorithm.
The relevant established choices were surveyed before selecting it:

- [NumPy `polyroots`](https://numpy.org/doc/stable/reference/generated/numpy.polynomial.polynomial.polyroots.html)
  computes companion-matrix eigenvalues. It is an excellent independent oracle
  because it reaches mature LAPACK-class eigensolvers through a mathematically
  different route. NumPy's documentation also warns that distant and multiple
  roots can have large forward errors. Sage.js does not yet have one qualified
  dense-eigen backend in every browser and release runtime, so importing this
  design today would add a large hidden prerequisite.
- [mpmath `polyroots`](https://mpmath.org/doc/current/calculus/polynomials.html)
  uses Durand--Kerner simultaneous iteration and arbitrary precision. It is a
  useful high-precision oracle, but the current Sage.js mpmath surface is not a
  qualified production multiprecision root pack. Durand--Kerner also lacks the
  Newton correction used by Aberth--Ehrlich.
- [Jenkins--Traub Algorithm 419](https://doi.org/10.1145/361254.361262) is a
  mature, historically reliable variable-shift/deflation algorithm. A faithful
  port would be substantial new specialist code and would still need the same
  scaling, validation, browser, and maintenance work.
- [MPSolve](https://numpi.dm.unipi.it/scientific-computing-libraries/mpsolve/)
  is the compelling future backend for difficult or high-precision problems.
  Its design combines simultaneous Aberth iterations, adaptive precision, root
  neighborhoods, and explicit cluster handling. The maintained implementation
  is GPL-3.0 and has not yet been qualified as a Sage.js browser/Windows pack;
  this binary64 slice therefore does not make MPSolve-level claims.

The selected primary method is scaled simultaneous **Aberth--Ehrlich**. It
avoids a dense companion matrix and avoids routine deflation. A bounded
**Laguerre plus synthetic-deflation** pass is the same-source rescue for a
stalled simultaneous iteration, followed by simultaneous polishing when the
budget permits. Both paths are `O(n^2)` per complete sweep and are capped at
degree 64. This is an interactive/classroom envelope, not an industrial or
multiprecision polynomial solver.

## Scaling and validation

The implementation chooses a variable scale directly from logarithms of the
original coefficient magnitudes and then forms a monic scaled polynomial.
Doing this before any common floating-point normalization matters: dividing a
`1e-308` leading coefficient by a `1e308` constant would silently turn the
leading coefficient into zero. Logarithmic scaling supports examples at both
ends of binary64 whenever the roots themselves remain finite. If finite
coefficients imply a root outside binary64, the result is a structured
`validation_failed`, never a serialized infinity.

Solver termination is not accepted as mathematical truth. Every returned root
is re-evaluated against the original coefficients using a scale-safe
coefficientwise backward error

```text
|p(z)| / sum_k |a_k| |z|^(n-k).
```

The validator computes every term's logarithmic magnitude, factors out the
largest term, and sums the independently scaled complex terms. This keeps the
validation finite across approximately 616 decimal orders of coefficient
range without reusing the solver's Horner recurrence. The complete root set is
also multiplied back into a monic polynomial and independently compared
coefficient-by-coefficient with the scaled input (a Vieta reconstruction
check). A result is
`validated_approximate` only when root count and both checks pass.

The per-root condition indicator is based on

```text
sum_k |a_k| |z|^(n-k) / (|z| |p'(z)|).
```

It is a first-order relative sensitivity indicator, not a forward-error bound.
Near repeated roots make `p'(z)` small, so the indicator becomes large and the
result carries `ill_conditioned`.

## Multiplicity policy

Binary64 values do **not** certify algebraic multiplicity. A repeated root may
appear as several nearby values because perturbations at rounding scale split
the root. When a severe unresolved cluster has better complete Vieta evidence
after replacing it by a common numerical representative, that replacement is
accepted only if every root also retains its backward-error bound.
`result.clusters` groups values whose separation is consistent with their
condition indicators, but labels them
`numerical_cluster_not_certified_multiplicity`. Even an apparent cluster of
size four is not a claim that the exact input polynomial has a root of
multiplicity four.

Use MPSolve or another interval/multiprecision root-isolation system when
certified multiplicity, disjoint root disks, or reliable forward digits for a
cluster are required.

## Resource and failure semantics

`ResourceBudget` bounds iterations, polynomial evaluations, elapsed time, trace
events, and trace bytes. A cancellation callback is checked during every
quadratic sweep. Stable shared statuses include:

- `converged` -- the selected path terminated and independent validation passed;
- `maximum_iterations`, `maximum_evaluations`, or `maximum_elapsed_time` -- a
  hard budget stopped work;
- `cancelled` -- the cancellation callback requested termination;
- `stagnation` -- the algorithm did not produce a validated complete root set;
- `validation_failed` -- the solver terminated but independent evidence did
  not support its answer; and
- `invalid_problem` -- for example, the zero polynomial.

All outward roots are finite `{real, imag}` JSON records. `result.roots`
provides a detached complex-number view, while `to_json()` remains portable.

## Evidence and current claim boundary

The focused corpus covers zero and constant polynomials, leading and trailing
zeros, real and complex coefficients, conjugate symmetry, repeated and tightly
clustered roots, coefficient multipliers of `1e-300` and `1e300`, a quadratic
root pair separated by 300 decimal orders, coefficients spanning about 616
decimal orders with roots near `1e-308` and `1e308`, unrepresentable roots,
malformed inputs, cancellation, and budget exhaustion. Differential tests
compare deterministic random and adversarial sets with NumPy and
high-precision mpmath.

The implementation and focused corpus pass locally in CPython and Sage.js
Python mode. Browser, SEA, Linux ARM64, macOS ARM64, and Windows x64 remain
explicitly pending integration receipts; the capability record does not claim
them prematurely.
