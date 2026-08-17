# Composite local overorders

Sage.js uses a fail-closed Buchmann--Lenstra path when discriminant discovery
leaves a pairwise-coprime component whose integer factorization is not known.
The path does **not** construct a finite field from a composite number.

The first implemented slice follows Hecke's
`dedekind_test_composite` and `_gcd_with_failure` routines. Polynomial gcds
are computed over `ZZ/qZZ`; whenever Euclidean division needs to invert a
nonunit coefficient, the algorithm returns the exact split
`gcd(coefficient, q) * (q/gcd(coefficient, q))`. The affected local branch is
then restarted on the children. This is useful arithmetic evidence, not a
probabilistic factor guess.

For an equation order, a successful composite Dedekind step constructs

```text
Z[a] + (U(a)/q) Z[a]
```

as an integer row-HNF numerator over denominator `q`. Sage.js checks the
index-square discriminant identity and independently verifies that the basis
contains `1`, contains the equation order, and is closed under multiplication.
If the new discriminant is coprime to `q`, this also proves local maximality at
every prime dividing `q` without finding those primes.

The degree-8 `T(8, 2^32)` regression is the motivating case. Its 777-bit
reduced-resultant component produces an index-`q` overorder directly; the new
discriminant is `-105226698752`, coprime to `q`. Thus the expensive component
is completely discharged without integer factorization. The remaining index
factor `7` belongs to the ordinary proven-prime local path.

## API and current boundary

`buchmann_lenstra_overorder(coefficients, component)` accepts low-to-high
coefficients and a shared `DiscriminantComponent`. It returns a
`BuchmannLenstraResult` with one of these states:

- `split`: exact `ComponentSplit` evidence was found;
- `complete`: the returned `OrderBasis` is certified locally maximal at the
  whole component;
- `enlarged`: a certified overorder was found, but another radical/multiplier
  cycle is still required;
- `stalled`: the general-order adapter must continue the cycle;
- `certification-error`: an exact identity needed by the construction failed.

Only `complete` means locally maximal. `enlarged` deliberately adapts to a
common `LocalOrderResult` as `not-applicable`, so orchestration cannot mistake
progress for a proof. `check_buchmann_lenstra_result` replays structural,
index, discriminant, and local-coprimality checks.

The present concrete arithmetic adapter is limited to the equation-order
composite Dedekind step. A nonidentity input basis returns `stalled` with the
integration hook `q-radical-multiplier-cycle`; the generic Buchmann--Lenstra
cycle driver supplies that later adapter. This limitation is explicit rather
than silently sending a composite modulus to a prime-only Round-2 routine.
