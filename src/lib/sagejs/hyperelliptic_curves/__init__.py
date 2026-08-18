"""Exact hyperelliptic curves and local Frobenius data.

The curve model needs the Sage.js runtime boundary, while several exact helper modules
are intentionally usable from ordinary CPython.  Keep the model export lazy so
importing `hasse_witt` or `genus3_completion` does not pull in that boundary.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .model import (
        HyperellipticCurve,
        HyperellipticCurve_generic,
        HyperellipticCurvePoint,
    )

__all__ = [
    "HyperellipticCurve",
    "HyperellipticCurve_generic",
    "HyperellipticCurvePoint",
]


def __getattr__(name: str) -> Any:
    if name not in __all__:
        raise AttributeError(name)
    from . import model

    return getattr(model, name)
