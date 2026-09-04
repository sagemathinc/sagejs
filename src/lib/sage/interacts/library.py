"""A focused library of Sage teaching interacts.

These applications use Sage's historical public entry points while relying on
the standard ipywidgets protocol. Widget constructors stay lazy so importing
the module neither opens comms nor adds startup work.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from random import random
from typing import Any

from IPython.display import HTML, display
from sagejs.interacts import input_box, interact, range_slider, slider, text_control
from sagejs.interacts.widgets import evaluate_user_expression


def _sage_global(name: str) -> Any:
    return evaluate_user_expression(name)


def library_interact(
    decorator_target: Callable[..., Any] | None = None,
    **widgets: Callable[[], Any],
) -> Any:
    """Decorate a zero-argument teaching application with lazy controls."""

    def decorator(function: Callable[..., Any]) -> Callable[[], Any]:
        @wraps(function)
        def library_wrapper() -> None:
            constructed = {name: constructor() for name, constructor in widgets.items()}
            interact(function, **constructed)

        untyped_wrapper: Any = library_wrapper
        untyped_wrapper._widgets = widgets
        return library_wrapper

    if decorator_target is None:
        return decorator
    return decorator(decorator_target)


def html(obj: Any) -> None:
    """Publish an HTML fragment through the active rich-display host."""
    display(HTML(str(obj)))


@library_interact(n=lambda: slider(range(10)), m=lambda: slider(range(10)))
def demo(n: int, m: int) -> None:
    """Display the sum of two selected integers."""
    print(n + m)


@library_interact(
    title=lambda: text_control(value="<h2>Taylor polynomial</h2>"),
    f=lambda: input_box("sin(x)*exp(-x)", label="$f(x)=$"),
    order=lambda: slider(range(1, 13)),
)
def taylor_polynomial(title: Any, f: Any, order: int) -> None:
    """Plot a function together with its Taylor polynomial at zero."""
    del title
    x = _sage_global("x")
    plot = _sage_global("plot")
    point = _sage_global("point")
    show = _sage_global("show")
    latex = _sage_global("latex")
    polynomial = f.taylor(x, 0, order)
    function_plot = plot(f, (x, -1, 5), thickness=2)
    approximation_plot = plot(polynomial, (x, -1, 5), color="green", thickness=2)
    marker = point((0, f(x=0)), pointsize=80, color="red")
    html(r"$f(x)=%s$" % latex(f))
    html(r"$T_{%s}(x)=%s$" % (order, latex(polynomial)))
    show(marker + function_plot + approximation_plot, ymin=-0.5, ymax=1)


@library_interact(
    title=lambda: text_control(value="<h2>Derivative grapher</h2>"),
    function=lambda: input_box("x^5-3*x^3+1", label="Function:"),
    x_range=lambda: range_slider(-15, 15, 0.1, default=(-2, 2), label="Range (x)"),
    y_range=lambda: range_slider(-15, 15, 0.1, default=(-8, 6), label="Range (y)"),
)
def function_derivative(
    title: Any,
    function: Any,
    x_range: Any,
    y_range: Any,
) -> None:
    """Plot a function and its first two derivatives."""
    del title
    x = _sage_global("x")
    derivative = _sage_global("derivative")
    plot = _sage_global("plot")
    show = _sage_global("show")
    latex = _sage_global("latex")
    first = derivative(function, x)
    second = derivative(first, x)
    domain = (x, x_range[0], x_range[1])
    plots = (
        plot(function, domain, thickness=1.5)
        + plot(first, domain, color="green")
        + plot(second, domain, color="red")
    )
    show(
        plots,
        xmin=x_range[0],
        xmax=x_range[1],
        ymin=y_range[0],
        ymax=y_range[1],
    )
    html(r"$f(x)=%s$" % latex(function))
    html(r"$f'(x)=%s$" % latex(first))
    html(r"$f''(x)=%s$" % latex(second))


@library_interact(
    A=lambda: slider(-7, 7, 1, 1),
    B=lambda: slider(-7, 7, 1, 1),
    C=lambda: slider(-7, 7, 1, -2),
)
def quadratic_equation(A: int, B: int, C: int) -> None:
    """Plot a quadratic and display its symbolic solutions."""
    x = _sage_global("x")
    plot = _sage_global("plot")
    show = _sage_global("show")
    solve = _sage_global("solve")
    latex = _sage_global("latex")
    polynomial = A * x**2 + B * x + C
    show(plot(polynomial, (x, -10, 10)), ymin=-10, ymax=10, aspect_ratio=1)
    html(r"$%s=0$" % latex(polynomial))
    html(r"$%s$" % latex(solve(polynomial == 0, x)))


@library_interact(
    n=lambda: slider(2, 10000, 100, default=1000, label="Number of Tosses"),
    interval=lambda: range_slider(
        0.0, 1.0, default=(0.45, 0.55), label="Plotting range (y)"
    ),
)
def coin(n: int, interval: Any) -> None:
    """Plot the running average from a sequence of random samples."""
    points = []
    total = 0.0
    for index in range(1, n + 1):
        total += random()
        points.append((index, total / index))
    point = _sage_global("point")
    show = _sage_global("show")
    show(point(points[1:], pointsize=1), ymin=interval[0], ymax=interval[1])


__all__ = [
    "coin",
    "demo",
    "function_derivative",
    "html",
    "library_interact",
    "quadratic_equation",
    "taylor_polynomial",
]
