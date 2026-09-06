"""Global Sage-compatible proof preferences.

The flags state whether algorithms in each subsystem must, by default, return
unconditional results.  Individual operations may still accept an explicit
`proof` argument, which takes precedence over these process-local defaults.
"""

from __future__ import annotations

from typing import Any

_SUBSYSTEMS = (
    "arithmetic",
    "elliptic_curve",
    "linear_algebra",
    "number_field",
    "polynomial",
    "other",
)


class _WithProof:
    """Temporarily change one proof preference inside a `with` block."""

    def __init__(
        self,
        preferences: _ProofPreferences,
        subsystem: str,
        value: Any,
    ) -> None:
        subsystem = str(subsystem)
        if subsystem not in preferences._require_proof:
            raise ValueError("unknown proof subsystem: " + subsystem)
        self._preferences = preferences
        self._subsystem = subsystem
        self._value = bool(value)
        self._original = preferences._require_proof[subsystem]

    def __enter__(self) -> None:
        self._preferences._require_proof[self._subsystem] = self._value

    def __exit__(self, *_arguments: Any) -> None:
        self._preferences._require_proof[self._subsystem] = self._original


class _ProofPreferences:
    """Hold the process-local proof defaults exposed as the global `proof`."""

    def __init__(self, value: Any = True) -> None:
        self._require_proof = {}
        for subsystem in _SUBSYSTEMS:
            self._require_proof[subsystem] = bool(value)

    def _preference(self, subsystem: str, value: Any = None) -> Any:
        if value is None:
            return self._require_proof[subsystem]
        self._require_proof[subsystem] = bool(value)
        return None

    def arithmetic(self, value: Any = None) -> Any:
        """Get or set the default proof requirement for arithmetic."""
        return self._preference("arithmetic", value)

    def elliptic_curve(self, value: Any = None) -> Any:
        """Get or set the default proof requirement for elliptic curves."""
        return self._preference("elliptic_curve", value)

    def linear_algebra(self, value: Any = None) -> Any:
        """Get or set the default proof requirement for linear algebra."""
        return self._preference("linear_algebra", value)

    def number_field(self, value: Any = None) -> Any:
        """Get or set the default proof requirement for number fields."""
        return self._preference("number_field", value)

    def polynomial(self, value: Any = None) -> Any:
        """Get or set the default proof requirement for polynomials."""
        return self._preference("polynomial", value)

    def other(self, value: Any = None) -> Any:
        """Get or set the default proof requirement for other subsystems."""
        return self._preference("other", value)

    def all(self, value: Any = None) -> Any:
        """Return all proof flags, or set every flag to one truth value."""
        if value is None:
            return dict(self._require_proof)
        selected = bool(value)
        for subsystem in _SUBSYSTEMS:
            self._require_proof[subsystem] = selected
        return None

    def WithProof(self, subsystem: str, value: Any) -> _WithProof:
        """Return a context manager that temporarily changes one flag."""
        return _WithProof(self, subsystem, value)

    def __repr__(self) -> str:
        return "Proof preferences " + repr(self.all())


proof = _ProofPreferences(True)


def resolve_polynomial_proof(value: Any = None) -> bool:
    """Resolve a local polynomial proof request against the global policy."""
    if value is None:
        return bool(proof.polynomial())
    if not isinstance(value, bool):
        raise TypeError("polynomial proof flag must be a boolean or None")
    return value
