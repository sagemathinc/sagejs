# Mixed-quartic class-group assembly result

This lane connects an authentic nontrivial mixed quartic through the
post-collector portion of PARI 2.17.4 `class_group_gen` without runtime PARI
tapes or answer-derived generator inputs.

The initially considered frozen quartic `x^4 - 20018*x - 20034` has trivial
class group, so it cannot exercise generator reconstruction. The existing
frozen field-3 neighbor

```text
x^4 - 2000022*x - 2000042
```

is the smallest useful connected target. It has signature `(2, 1)`, relation
HNF `diag(2, 2)`, class group `[2, 2]`, and class number `4`. Its two authentic
`Uir` columns are `-e_1` and `-e_2`. PARI's signed `genback` therefore takes
the direct inverse-prime branch for the source-order primes `13` and `3`:

```text
G_j  = ZM_hnfmodid(pr_get_tau(P_j), p_j)
Ge_j = [1 / p_j, 1]
```

The generated factors are positive rationals. PARI's `famat_cxlog` ignores
them, so `Ga` is exact zero for all three archimedean places. The Smith result
also has exact-zero `M2`; consequently `ga` is exact zero while `GD = C*M1`.
These zero branches are validated before publication rather than passed into
the prepared logarithm transform, whose generic all-integer case is
intentionally outside that transform's contract.

The pristine-PARI oracle independently checks, for both generators,

```text
idealhnf(G_j * nffactorback(Ge_j))
    == idealhnf(P_j^(-1))
```

and checks `Uir_j * D_j = W * M1_j`. The source-mode replay matches PARI's
Smith matrices, class invariants, two quartic HNF ideals, factors, `Ga`, `GD`,
`ga`, and final publication state exactly.

This is a narrow but genuine generic-degree advance: the composite-modulus HNF
construction is degree four and both nontrivial class generators are derived
from ordinary prime descriptors. It does **not** yet port the general quartic
signed-exponent reduction tree. The next exact boundary is a mixed-quartic
fixture whose `Uir` column requires prime powers or products, followed by
non-scalar T2/LLL candidates. A non-scalar mixed-signature factor will also
require the complex-norm low-precision branch of `nf_cxlog`; neither dependency
is hidden by this fixture.
