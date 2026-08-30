"""Exact modular-form algorithms loaded outside the bootstrap runtime."""

from __future__ import annotations

from typing import Any

ExactModularForm: Any
LevelOneBasisCertificate: Any
ModularSymbolsQExpansionCertificate: Any
delta_form: Any
delta_qexp: Any
level_one_basis_certificate: Any
victor_miller_basis: Any

__all__ = [
    "ExactModularForm",
    "LevelOneBasisCertificate",
    "ModularSymbolsQExpansionCertificate",
    "delta_form",
    "delta_qexp",
    "level_one_basis_certificate",
    "victor_miller_basis",
]


def __getattr__(name: Any, runtime_name: Any = None) -> Any:
    """Load the exact level-one implementation on first attribute access."""
    if isinstance(runtime_name, str):
        name = runtime_name
    if name in __all__:
        from . import qexp

        return getattr(qexp, name)
    raise AttributeError(name)
