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

    def table(
        self,
        rows: Any,
        header_row: bool = False,
        header_column: bool = False,
    ) -> HtmlFragment:
        """Return the rich HTML form of a Sage teaching table."""
        return HtmlFragment(
            Table(rows, header_row=header_row, header_column=header_column)._html_()
        )

    def __repr__(self) -> str:
        return "Create HTML output (see html? for details)"


html = HTMLFragmentFactory()


def _escape_html(value: Any) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


class Table:
    """A compact Sage-compatible plain-text and rich HTML table."""

    def __init__(
        self,
        rows: Any,
        header_row: bool = False,
        header_column: bool = False,
    ) -> None:
        self._rows = [list(row) for row in rows]
        self._header_row = bool(header_row)
        self._header_column = bool(header_column)
        width = 0 if len(self._rows) == 0 else len(self._rows[0])
        for row in self._rows:
            if len(row) != width:
                raise ValueError("table rows must all have the same length")

    def __repr__(self) -> str:
        if len(self._rows) == 0:
            return ""
        text = [[str(value) for value in row] for row in self._rows]
        widths = []
        for column in range(len(text[0])):
            widths.append(max(len(row[column]) for row in text))

        def render(row: list[str]) -> str:
            return (
                "  "
                + "   ".join(
                    row[column].ljust(widths[column]) for column in range(len(row))
                ).rstrip()
            )

        output = [render(text[0])]
        if self._header_row:
            output.append("├" + "┼".join("─" * (width + 2) for width in widths) + "┤")
        output.extend(render(row) for row in text[1:])
        return "\n".join(output)

    __str__ = __repr__

    def _html_(self) -> str:
        output = ['<div class="notruncate">', '<table class="table_form">', "<tbody>"]
        latex_function = runtime.reflect.get(runtime.global_object, "latex")
        for row_index, row in enumerate(self._rows):
            output.append("<tr>")
            for column_index, value in enumerate(row):
                header = (self._header_row and row_index == 0) or (
                    self._header_column and column_index == 0
                )
                tag = "th" if header else "td"
                if header:
                    contents = _escape_html(value)
                else:
                    rendered = runtime.reflect.apply(
                        latex_function,
                        runtime.undefined,
                        [value],
                    )
                    contents = r"\(" + _escape_html(rendered) + r"\)"
                output.append(
                    '<{} style="text-align:left">{}</{}>'.format(
                        tag,
                        contents,
                        tag,
                    )
                )
            output.append("</tr>")
        output.extend(["</tbody>", "</table>", "</div>"])
        return "\n".join(output)

    def _repr_mimebundle_(self) -> Any:
        return {
            "text/html": self._html_(),
            "text/plain": repr(self),
        }


def table(
    rows: Any,
    header_row: bool = False,
    header_column: bool = False,
) -> Table:
    """Construct a Sage-compatible table from an iterable of rows."""
    return Table(rows, header_row=header_row, header_column=header_column)


def pretty_print(*args: Any, **options: Any) -> None:
    """Publish arguments through the active rich-display backend."""
    if len(args) == 0:
        return
    display_module = __import__("IPython.display", fromlist=["display"])
    for value in args:
        if len(options) and hasattr(value, "set_extra_kwds"):
            value.set_extra_kwds(options)
        display_module.display(value)
