"""Exact rational quaternion algebras, orders, and ideal classes."""

from __future__ import annotations

from typing import Any

QuaternionAlgebra: Any
QuaternionElement: Any
QuaternionOrder: Any
QuaternionRightIdeal: Any
RationalQuaternionAlgebra: Any
EichlerIdealClassSet: Any
IdealClassMassCertificate: Any
eichler_mass: Any

__all__ = [
    "QuaternionAlgebra",
    "QuaternionElement",
    "QuaternionOrder",
    "QuaternionRightIdeal",
    "RationalQuaternionAlgebra",
    "EichlerIdealClassSet",
    "IdealClassMassCertificate",
    "eichler_mass",
]


def __getattr__(name: Any, runtime_name: Any = None) -> Any:
    if isinstance(runtime_name, str):
        name = runtime_name
    if name == "QuaternionRightIdeal":
        from . import ideals

        return getattr(ideals, name)
    if name in [
        "EichlerIdealClassSet",
        "IdealClassMassCertificate",
        "eichler_mass",
    ]:
        from . import class_set

        return getattr(class_set, name)
    if name in __all__:
        from . import algebra

        return getattr(algebra, name)
    raise AttributeError(name)
