# Sage-compatible elementary piecewise functions.
#
# Copyright (C) 2026 Sage.js contributors
# License: GPL-3.0-only

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _latex_display(value: Any) -> Any:
    record = runtime.object.create(None)
    runtime.reflect.set(record, "mime", "text/latex")
    runtime.reflect.set(record, "data", "$\\displaystyle " + str(value) + "$")
    return record


@runtime.callable_instance_class
class PiecewiseFunction:
    """A finite real piecewise function used by calculus and plotting."""

    def __init__(self, pieces: Any, variable: Any = None) -> None:
        values = []
        for piece in pieces:
            if not isinstance(piece, (list, tuple)) or len(piece) != 2:
                raise TypeError("each piece must be (domain, expression)")
            domain, expression = piece
            if not isinstance(domain, (list, tuple)) or len(domain) != 2:
                raise TypeError("a piecewise domain must be (lower, upper)")
            lower, upper = domain
            if lower > upper:
                raise ValueError("a piecewise interval must have lower <= upper")
            values.append(((lower, upper), expression))
        if len(values) == 0:
            raise ValueError("piecewise() needs at least one piece")
        if variable is None:
            for _domain, expression in values:
                if hasattr(expression, "variables"):
                    variables = expression.variables()
                    if len(variables) == 1:
                        variable = variables[0]
                        break
        if variable is None:
            variable = "x"
        self._pieces = runtime.math_tuple(values)
        self._variable = variable
        runtime.object.freeze(self)

    def pieces(self) -> Any:
        return self._pieces

    def variable(self) -> Any:
        return self._variable

    def __call__(self, value: Any) -> Any:
        for domain, expression in self._pieces:
            lower, upper = domain
            coordinate = float(value)
            if float(lower) <= coordinate and coordinate <= float(upper):
                if callable(expression):
                    return expression(value)
                if hasattr(expression, "subs"):
                    return expression.subs({self._variable: value})
                return expression
        raise ValueError(str(value) + " is outside the piecewise domain")

    def _latex_(self) -> str:
        rows = []
        variable = _latex_text(self._variable)
        for domain, expression in self._pieces:
            lower, upper = domain
            rows.append(
                _latex_text(expression)
                + r" & \text{if } "
                + _latex_text(lower)
                + " \\le "
                + variable
                + " \\le "
                + _latex_text(upper)
            )
        return r"\begin{cases}" + r" \\ ".join(rows) + r"\end{cases}"

    def _rich_repr_(self) -> Any:
        return _latex_display(self._latex_())

    def __repr__(self) -> str:
        parts = []
        for domain, expression in self._pieces:
            parts.append(
                str(self._variable) + " |--> " + str(expression) + " on " + str(domain)
            )
        return "piecewise(" + ", ".join(parts) + "; " + str(self._variable) + ")"

    __str__ = __repr__
    toString = __repr__


def piecewise(
    pieces: Any,
    variable: Any = None,
    **options: Any,
) -> PiecewiseFunction:
    """Construct a real piecewise function from interval-expression pairs."""
    if "var" in options:
        if variable is not None:
            raise TypeError("piecewise() variable specified twice")
        variable = options.pop("var")
    if len(options):
        raise TypeError("unsupported piecewise() option")
    return PiecewiseFunction(pieces, variable)


def _latex_text(value: Any) -> str:
    if hasattr(value, "_latex_"):
        return str(value._latex_())
    return str(value)
