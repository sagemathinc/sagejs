"""Pinned SageMath oracle for the initial modular-abelian-variety corpus."""

from sage.all import J0


for level in [11, 33, 37, 43, 67, 97]:
    jacobian = J0(level)
    print(
        "SAGEJS_ABVAR_SAGE",
        level,
        jacobian.dimension(),
        [factor.dimension() for factor in jacobian.decomposition()],
        jacobian.hecke_polynomial(2),
        jacobian.hecke_polynomial(3),
    )
