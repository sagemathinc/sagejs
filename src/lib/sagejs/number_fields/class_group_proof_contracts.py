"""Canonical named hypotheses for class-group proof contracts.

These strings are part of public mathematical receipts.  Producers and
independent checkers import the same constants so a broad policy label such as
`proof=False` cannot silently stand in for a different theorem hypothesis.
"""

BDF_CLASS_CHARACTER_GRH = (
    "GRH: L(s, chi) is nonzero whenever Re(s) > 1/2 for every nontrivial "
    "character chi of Cl(K)"
)

BELABAS_FRIEDMAN_ZETA_GRH = (
    "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2"
)


def analytic_class_unit_assumptions(
    factor_base_theorem: str,
    factor_base_assumptions: tuple[str, ...],
) -> tuple[str, ...]:
    """Return the exact hypotheses used by BF analytic index completion."""
    if "belabas--diaz y diaz--friedman" in factor_base_theorem.lower():
        if factor_base_assumptions != (BDF_CLASS_CHARACTER_GRH,):
            raise ArithmeticError(
                "the BDF factor-base plan lost its class-character GRH contract"
            )
    elif "minkowski" in factor_base_theorem.lower() and factor_base_assumptions:
        raise ArithmeticError("the Minkowski factor-base plan recorded an assumption")
    return tuple(sorted(set(factor_base_assumptions) | {BELABAS_FRIEDMAN_ZETA_GRH}))


def analytic_class_unit_assumption_statement(
    factor_base_theorem: str,
    factor_base_assumptions: tuple[str, ...],
) -> str:
    """Return the canonical conjunction used by singular-assumption schemas."""
    return " AND ".join(
        analytic_class_unit_assumptions(
            factor_base_theorem,
            factor_base_assumptions,
        )
    )


__all__ = [
    "BDF_CLASS_CHARACTER_GRH",
    "BELABAS_FRIEDMAN_ZETA_GRH",
    "analytic_class_unit_assumption_statement",
    "analytic_class_unit_assumptions",
]
