"""Sage `interact` compatibility built on upstream ipywidgets."""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Iterable, Iterator
from typing import Any

from ipywidgets.widgets import SelectionSlider, ToggleButtons, ValueWidget
from ipywidgets.widgets.interaction import interactive, signature
from sagejs.interacts.controls import input_grid
from sagejs.interacts.widgets import EvalText, SageColorPicker


def _looks_like_matrix(value: Any) -> bool:
    return all(hasattr(value, name) for name in ("nrows", "ncols", "list", "parent"))


def _looks_like_color(value: Any) -> bool:
    return hasattr(value, "html_color")


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

    def __repr__(self) -> str:
        prefix = "Manual interactive" if self.manual else "Interactive"
        widgets = [
            widget for widget in self.children if isinstance(widget, ValueWidget)
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
        if isinstance(abbreviation, Iterator):
            return SelectionSlider(options=list(abbreviation))
        return super().widget_from_iterable(abbreviation, *args, **kwargs)


interact = sage_interactive.factory()


__all__ = ["interact", "sage_interactive"]
