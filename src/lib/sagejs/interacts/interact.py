"""Sage `interact` compatibility built on upstream ipywidgets."""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Iterable
from typing import Any

from ipywidgets.widgets import (
    HBox,
    SelectionSlider,
    ToggleButtons,
    ValueWidget,
    VBox,
)
from ipywidgets.widgets.interaction import interactive, signature
from sagejs.interacts.controls import input_grid
from sagejs.interacts.widgets import EvalText, SageColorPicker


def _looks_like_matrix(value: Any) -> bool:
    return all(hasattr(value, name) for name in ("nrows", "ncols", "list", "parent"))


def _looks_like_color(value: Any) -> bool:
    return hasattr(value, "html_color")


def _is_iterator(value: Any) -> bool:
    """Test the Python iterator contract without relying on runtime ABCs."""
    try:
        return iter(value) is value
    except TypeError:
        return False


def _looks_like_sage_real(value: Any) -> bool:
    name = getattr(type(value), "__name__", "")
    return name in {"RealLiteral", "RealNumber", "RealNumberElement"}


def _layout_rows(
    rows: Any,
    widgets: dict[str, Any],
    placed: set[str],
) -> list[Any]:
    if not isinstance(rows, (list, tuple)):
        raise TypeError("interact layout regions must be lists of rows")
    result = []
    for row in rows:
        names = row if isinstance(row, (list, tuple)) else [row]
        row_widgets = []
        for name in names:
            if not isinstance(name, str):
                raise TypeError("interact layout entries must be parameter names")
            if name not in widgets:
                raise ValueError("unknown interact layout parameter {!r}".format(name))
            if name in placed:
                raise ValueError(
                    "duplicate interact layout parameter {!r}".format(name)
                )
            placed.add(name)
            row_widgets.append(widgets[name])
        result.append(HBox(children=row_widgets))
    return result


class sage_interactive(interactive):
    """ipywidgets interactive with Sage control inference and conversions."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        arguments = list(args)
        if not arguments:
            raise TypeError("sage_interactive requires a function")
        if len(arguments) < 2:
            function = arguments[0]
            options: dict[str, Any] = {}
        else:
            function, supplied_options = arguments
            options = supplied_options.copy()

        custom_layout = kwargs.pop("layout", None)
        function_signature = signature(function)
        parameters = OrderedDict(function_signature.parameters)
        try:
            auto_update = parameters.pop("auto_update")
        except KeyError:
            pass
        else:
            options["manual"] = auto_update.default is False

        self._sagejs_signature = function_signature.replace(
            parameters=list(parameters.values())
        )
        super().__init__(function, options, **kwargs)
        if self.manual:
            self.update()
        else:
            for widget in self.kwargs_widgets:
                if isinstance(widget, ToggleButtons):
                    widget.on_msg(self.update)
        if custom_layout is not None:
            self._apply_custom_layout(custom_layout)

    def _apply_custom_layout(self, layout: Any) -> None:
        if not isinstance(layout, dict):
            raise TypeError("interact layout must be a dictionary")
        allowed = {"top", "left", "right", "bottom"}
        unknown = set(layout).difference(allowed)
        if unknown:
            raise ValueError(
                "unknown interact layout region{}: {}".format(
                    "s" if len(unknown) != 1 else "",
                    ", ".join(sorted(unknown)),
                )
            )

        widgets = {widget._kwarg: widget for widget in self.kwargs_widgets}
        placed: set[str] = set()
        top = _layout_rows(layout.get("top", []), widgets, placed)
        left = _layout_rows(layout.get("left", []), widgets, placed)
        right = _layout_rows(layout.get("right", []), widgets, placed)
        bottom = _layout_rows(layout.get("bottom", []), widgets, placed)
        remaining = [widget for name, widget in widgets.items() if name not in placed]
        if remaining:
            top.append(HBox(children=remaining))
        if self.manual:
            bottom.append(HBox(children=[self.manual_button]))

        middle_children = []
        if left:
            middle_children.append(VBox(children=left))
        middle_children.append(self.out)
        if right:
            middle_children.append(VBox(children=right))
        children = []
        if top:
            children.append(VBox(children=top))
        children.append(HBox(children=middle_children))
        if bottom:
            children.append(VBox(children=bottom))
        self.children = children

    def __repr__(self) -> str:
        prefix = "Manual interactive" if self.manual else "Interactive"
        widgets = [
            widget for widget in self.kwargs_widgets if isinstance(widget, ValueWidget)
        ]
        count = len(widgets)
        answer = "{} function {!r} with {} widget{}".format(
            prefix,
            self.f,
            count,
            "" if count == 1 else "s",
        )
        for widget in widgets:
            untyped_widget: Any = widget
            answer += "\n  {}: {}".format(untyped_widget._kwarg, widget)
        return answer

    def signature(self) -> Any:
        return self._sagejs_signature

    @classmethod
    def widget_from_single_value(
        cls, abbreviation: Any, *args: Any, **kwargs: Any
    ) -> Any:
        if _looks_like_matrix(abbreviation):
            return input_grid(
                abbreviation.nrows(),
                abbreviation.ncols(),
                default=abbreviation.list(),
                to_value=abbreviation.parent(),
            )
        if _looks_like_color(abbreviation):
            return SageColorPicker(value=abbreviation.html_color())
        if _looks_like_sage_real(abbreviation):
            return super().widget_from_single_value(float(abbreviation))
        if _is_iterator(abbreviation):
            return SelectionSlider(options=list(abbreviation))
        widget = super().widget_from_single_value(abbreviation, *args, **kwargs)
        if widget is not None or isinstance(abbreviation, Iterable):
            return widget
        return EvalText(value=str(abbreviation))

    @classmethod
    def widget_from_tuple(cls, abbreviation: Any, *args: Any, **kwargs: Any) -> Any:
        if len(abbreviation) == 2 and isinstance(abbreviation[0], str):
            widget = cls.widget_from_abbrev(abbreviation[1])
            if widget is None:
                return None
            untyped_widget: Any = widget
            untyped_widget.description = abbreviation[0]
            return widget
        if len(abbreviation) == 2 and isinstance(abbreviation[1], Iterable):
            widget = cls.widget_from_abbrev(abbreviation[1])
            if widget is None:
                return None
            untyped_widget: Any = widget
            untyped_widget.value = abbreviation[0]
            return widget

        def approximate(value: Any) -> Any:
            method = getattr(value, "numerical_approx", None)
            return method() if method is not None else value

        return super().widget_from_tuple(
            tuple(approximate(value) for value in abbreviation),
            *args,
            **kwargs,
        )

    @classmethod
    def widget_from_iterable(cls, abbreviation: Any, *args: Any, **kwargs: Any) -> Any:
        if _is_iterator(abbreviation):
            return SelectionSlider(options=list(abbreviation))
        return super().widget_from_iterable(abbreviation, *args, **kwargs)


interact = sage_interactive.factory()


__all__ = ["interact", "sage_interactive"]
