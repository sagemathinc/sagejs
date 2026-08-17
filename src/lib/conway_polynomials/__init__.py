"""Portable loader for Frank Lübeck's Conway polynomial database.

This module is derived from `conway-polynomials` 0.10, copyright
2023 The Sage Developers and distributed under GPL-3.0-or-later. The
preferred-source database and complete notices are shipped beside this file.
"""

from __future__ import annotations

import os
from typing import Callable

_fast_load: Callable[[str], dict[int, dict[int, tuple[int, ...]]]] | None
try:
    from sagejs_serialization import load_integer_tuple_table as _host_fast_load
except ImportError:
    _fast_load = None
else:
    _fast_load = _host_fast_load


_conway_dict: dict[int, dict[int, tuple[int, ...]]] | None = None
_UNAVAILABLE = "Conway polynomial database data is unavailable in this runtime" + "."


def _load_portable_json(path: str) -> dict[int, dict[int, tuple[int, ...]]]:
    """Load the compact table with ordinary CPython-compatible operations."""
    import json

    try:
        with open(path, encoding="utf-8") as source:
            encoded = json.load(source)
    except (OSError, NotImplementedError) as error:
        raise RuntimeError(_UNAVAILABLE) from error
    return {
        int(prime): {
            int(degree): tuple(coefficients) for degree, coefficients in degrees.items()
        }
        for prime, degrees in encoded.items()
    }


def database() -> dict[int, dict[int, tuple[int, ...]]]:
    """Load once and return the shared mutable Conway coefficient mapping."""
    global _conway_dict

    if _conway_dict is not None:
        return _conway_dict

    path = os.path.join(os.path.dirname(__file__), "conway_polynomials.json")
    if _fast_load is not None:
        try:
            loaded = _fast_load(path)
            _conway_dict = loaded
            return loaded
        except NotImplementedError:
            pass

    _conway_dict = _load_portable_json(path)
    return _conway_dict


__all__ = ["database"]
