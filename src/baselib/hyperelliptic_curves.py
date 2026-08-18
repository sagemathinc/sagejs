# Public bootstrap for hyperelliptic curves.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

_hyperelliptic_module_cache = runtime.undefined


def _hyperelliptic_module() -> Any:
    """Load the ordinary-Python hyperelliptic implementation lazily."""
    global _hyperelliptic_module_cache
    if _hyperelliptic_module_cache is runtime.undefined:
        _hyperelliptic_module_cache = __import__(
            "sagejs.hyperelliptic_curves.model",
            fromlist=["HyperellipticCurve"],
        )
    return _hyperelliptic_module_cache


def HyperellipticCurve(
    f: Any,
    h: Any = 0,
    names: Any = None,
    check_squarefree: bool = True,
) -> Any:
    """Construct a genus-2 or genus-3 hyperelliptic curve.

    The equation is `y^2 + h(x)y = f(x)`. Substantial model validation,
    point counting, and Frobenius arithmetic live in the lazy
    `sagejs.hyperelliptic_curves` package.

    ```sage
    sage: R.<x> = PolynomialRing(GF(5))
    sage: C = HyperellipticCurve(x^5 + x + 1)
    sage: C.genus()
    2
    ```
    """
    module = _hyperelliptic_module()
    return module.HyperellipticCurve(f, h, names, check_squarefree)


runtime.register_doc(
    "HyperellipticCurve",
    HyperellipticCurve,
    {
        "kind": "function",
        "module": "sage.schemes.hyperelliptic_curves.constructor",
        "tags": [
            "hyperelliptic curves",
            "finite fields",
            "point counting",
            "L-polynomials",
        ],
        "backends": ["Sage.js exact arithmetic"],
        "sage_compatibility": {
            "status": "partial",
            "notes": (
                "Genus-2 and genus-3 models over QQ and finite fields, "
                "with an exact exhaustive finite-field Frobenius fallback."
            ),
        },
        "provenance": [
            {
                "kind": "sage-derived",
                "source": "SageMath hyperelliptic curves API",
                "url": (
                    "https://doc.sagemath.org/html/en/reference/"
                    "arithmetic_curves/sage/schemes/hyperelliptic_curves/"
                ),
                "license": "GPL-2.0-or-later",
            }
        ],
        "limitations": [
            (
                "The exhaustive reference algorithm is intended for modest "
                "finite fields. Genus-2 local factors use native smalljac; the "
                "genus-3 rforest backend currently exposes modular development "
                "diagnostics rather than public completed local factors."
            )
        ],
    },
)
