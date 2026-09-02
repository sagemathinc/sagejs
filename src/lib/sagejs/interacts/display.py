"""Sage-compatible HTML fragments and immediate rich display."""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime


def _math_parse(source: str) -> str:
    """Translate Sage's dollar-delimited HTML math to standard delimiters."""
    output = ""
    remaining = source
    while True:
        start = remaining.find("$")
        if start < 0:
            return output + remaining
        if start > 0 and remaining[start - 1] == "\\":
            output += remaining[: start - 1] + '<span class="sagejs-dollar">$</span>'
            remaining = remaining[start + 1 :]
            continue
        display_math = start + 1 < len(remaining) and remaining[start + 1] == "$"
        marker = "$$" if display_math else "$"
        marker_length = len(marker)
        end = remaining.find(marker, start + marker_length)
        if end < 0:
            return output + remaining
        formula = " ".join(remaining[start + marker_length : end].splitlines())
        opening = "\\[" if display_math else "\\("
        closing = "\\]" if display_math else "\\)"
        output += remaining[:start] + opening + formula + closing
        remaining = remaining[end + marker_length :]


class HtmlFragment:
    """An HTML fragment with a standard Jupyter MIME representation."""

    def __init__(self, value: Any) -> None:
        self._value = str(value)

    def __str__(self) -> str:
        return self._value

    __repr__ = __str__

    def __contains__(self, value: Any) -> bool:
        return str(value) in self._value

    def __eq__(self, other: Any) -> bool:
        return self._value == str(other)

    def __add__(self, other: Any) -> "HtmlFragment":
        return HtmlFragment(self._value + str(other))

    def __radd__(self, other: Any) -> "HtmlFragment":
        return HtmlFragment(str(other) + self._value)

    def _repr_mimebundle_(self) -> Any:
        return {
            "text/html": self._value,
            "text/plain": self._value,
        }


class HTMLFragmentFactory:
    """Construct Sage-compatible `HtmlFragment` values."""

    def __call__(
        self,
        obj: Any,
        concatenate: bool = True,
        strict: bool = False,
    ) -> HtmlFragment:
        del concatenate
        if isinstance(obj, str) and not strict:
            return HtmlFragment(_math_parse(obj))
        html_method = getattr(obj, "_html_", None)
        if callable(html_method):
            return HtmlFragment(str(html_method()))
        latex_function = runtime.reflect.get(runtime.global_object, "latex")
        rendered = runtime.reflect.apply(
            latex_function,
            runtime.undefined,
            [obj],
        )
        return HtmlFragment(r"\(\displaystyle " + str(rendered) + r"\)")

    def iframe(self, url: Any, height: int = 400, width: int = 800) -> HtmlFragment:
        """Return an iframe fragment using Sage's historical dimensions."""
        source = str(url)
        if source.startswith("/"):
            source = "file://" + source
        elif "://" not in source and not source.startswith("data:"):
            source = "https://" + source
        return HtmlFragment(
            '<iframe height="{}" width="{}" src="{}"></iframe>'.format(
                height,
                width,
                source,
            )
        )

    def __repr__(self) -> str:
        return "Create HTML output (see html? for details)"


html = HTMLFragmentFactory()


def pretty_print(*args: Any, **options: Any) -> None:
    """Publish arguments through the active rich-display backend."""
    if len(args) == 0:
        return
    display_module = __import__("IPython.display", fromlist=["display"])
    for value in args:
        if len(options) and hasattr(value, "set_extra_kwds"):
            value.set_extra_kwds(options)
        display_module.display(value)
