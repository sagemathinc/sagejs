"""Certified conductor and root numbers for supported hyperelliptic curves."""

from __future__ import annotations

from typing import Any

import sagejs as sage


class GlobalReductionUnsupportedError(NotImplementedError):
    """A candidate bad prime lies outside the certified local envelope."""

    def __init__(self, message: str, diagnostics: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)


class GlobalReductionData:
    """Certified global conductor and epsilon-factor metadata."""

    def __init__(
        self,
        curve: Any,
        candidate_primes: list[int],
        checked_rows: list[Any],
        discriminant: Any,
        excluded_denominator: Any,
    ) -> None:
        self.genus = int(curve.genus())
        self.candidate_primes = tuple(sage.ZZ(p) for p in candidate_primes)
        self.candidate_local_data = tuple(checked_rows)
        self.local_data = tuple(
            row for row in self.candidate_local_data if not row.curve_good_reduction
        )
        self.bad_primes = tuple(row.prime for row in self.local_data)
        conductor_value = sage.ZZ(1)
        finite_sign = 1
        for row in self.local_data:
            conductor_value *= row.prime**row.conductor_exponent
            finite_sign *= int(row.local_root_number)
        self.conductor = conductor_value
        self.finite_root_number = sage.ZZ(finite_sign)
        self.archimedean_root_number = sage.ZZ(-1 if self.genus % 2 else 1)
        self.root_number = self.finite_root_number * self.archimedean_root_number
        self.certified = True
        self.certificate = {
            "schema": "sagejs.hyperelliptic-global-reduction/v1",
            "theorem": (
                "odd primes outside the completed-branch discriminant and "
                "denominator support have good reduction"
            ),
            "completed_branch_discriminant": sage.ZZ(discriminant),
            "excluded_denominator": sage.ZZ(excluded_denominator),
            "candidate_primes": tuple(sage.ZZ(p) for p in candidate_primes),
            "bad_primes": self.bad_primes,
            "candidate_local_certificates": tuple(
                row.certificate for row in self.candidate_local_data
            ),
            "archimedean_sign_formula": "(-1)^genus",
        }

    def __repr__(self) -> str:
        return (
            "GlobalReductionData(conductor="
            + str(self.conductor)
            + ", root_number="
            + str(self.root_number)
            + ", bad_primes="
            + repr(self.bad_primes)
            + ")"
        )


def _bad_reduction_module() -> Any:
    return __import__(
        "sagejs.hyperelliptic_curves.bad_reduction",
        fromlist=["local_reduction"],
    )


def _integer_prime_support(value: Any) -> list[int]:
    integer = abs(sage.ZZ(value))
    if integer in (0, 1):
        return []
    answer = []
    for prime, _exponent in sage.factor(integer):
        answer.append(int(prime))
    return answer


def _candidate_support(curve: Any) -> tuple[list[int], Any, Any]:
    model = curve._smalljac_integral_model_data()
    ring = sage.PolynomialRing(sage.ZZ, "x_bad_support")
    f_value = ring(model["f_coefficients"])
    h_value = ring(model["h_coefficients"])
    completed = h_value * h_value + 4 * f_value
    discriminant = sage.ZZ(completed.discriminant())
    if discriminant == 0:
        raise ArithmeticError("the completed branch polynomial is not squarefree")
    denominator = sage.ZZ(model["excluded_denominator"])
    support = {2}
    support.update(_integer_prime_support(discriminant))
    support.update(_integer_prime_support(denominator))
    return sorted(support), discriminant, denominator


def global_reduction(curve: Any, algorithm: str = "auto") -> GlobalReductionData:
    """Return a complete certified conductor/root-number assembly.

    Every candidate prime is checked by `local_reduction`.  If even one of
    them is outside the implemented local theorem envelope, this function
    fails with the prime and the local diagnostics instead of returning a
    partial conductor.
    """
    if algorithm != "auto":
        raise ValueError("the global reduction algorithm must be 'auto'")
    cache = getattr(curve, "_global_arithmetic_cache", None)
    if cache is not None and "auto" in cache:
        return cache["auto"]
    candidates, discriminant, denominator = _candidate_support(curve)
    rows = []
    local_module = _bad_reduction_module()
    for prime in candidates:
        try:
            rows.append(local_module.local_reduction(curve, prime, "auto"))
        except local_module.LocalReductionUnsupportedError as error:
            raise GlobalReductionUnsupportedError(
                "global conductor/root-number assembly is unsupported at p="
                + str(prime),
                {
                    "prime": prime,
                    "candidate_primes": candidates,
                    "completed_branch_discriminant": discriminant,
                    "excluded_denominator": denominator,
                    "local_diagnostics": error.diagnostics,
                    "local_error": str(error),
                },
            ) from None
    result = GlobalReductionData(curve, candidates, rows, discriminant, denominator)
    if cache is not None:
        cache["auto"] = result
    return result


def bad_primes(curve: Any) -> Any:
    """Return every certified prime of bad reduction."""
    return global_reduction(curve).bad_primes


def conductor(curve: Any) -> Any:
    """Return the certified global conductor of the Jacobian."""
    return global_reduction(curve).conductor


def root_number(curve: Any) -> Any:
    """Return the certified global functional-equation sign."""
    return global_reduction(curve).root_number


__all__ = [
    "GlobalReductionData",
    "GlobalReductionUnsupportedError",
    "bad_primes",
    "conductor",
    "global_reduction",
    "root_number",
]
