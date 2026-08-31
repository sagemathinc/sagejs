"""Sage-compatible widget value transformations.

These classes adapt upstream ipywidgets controls without introducing a
Sage.js-specific frontend protocol.  They intentionally remain ordinary
Python so the same objects work in Jupyter clients and the browser app.
"""

from __future__ import annotations

import builtins
from typing import Any, Callable

from ipywidgets.widgets import (
    ColorPicker,
    FloatRangeSlider,
    FloatSlider,
    HBox,
    HTMLMath,
    IntRangeSlider,
    IntSlider,
    Label,
    Text,
    Textarea,
    ValueWidget,
    VBox,
)
from traitlets import List, Unicode, link

import __main__


def evaluate_user_expression(source: str) -> Any:
    """Evaluate a control value in the live Sage user namespace."""
    sage_eval: Any = builtins.__dict__["sage_eval"]
    return sage_eval(source, locals=__main__.__dict__)


class HTMLText(HTMLMath):
    """HTML text used as an unlabeled legacy Sage interact control."""

    @property
    def description(self) -> str:
        return ""

    @description.setter
    def description(self, value: Any) -> None:
        del value


class TransformWidget:
    """Mixin applying an optional conversion to a widget value."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_value(self) -> Any:
        untyped_self: Any = self
        return untyped_self.value

    def get_interact_value(self) -> Any:
        value = self.get_value()
        transform = self._sagejs_transform
        return value if transform is None else transform(value)


class EvalWidget(TransformWidget):
    """Mixin evaluating text in the live Sage user namespace."""

    def get_value(self) -> Any:
        untyped_self: Any = self
        return evaluate_user_expression(untyped_self.value)


def _transformed_value(widget: Any, evaluate: bool = False) -> Any:
    value = evaluate_user_expression(widget.value) if evaluate else widget.value
    transform = widget._sagejs_transform
    return value if transform is None else transform(value)


class TransformIntSlider(IntSlider):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self)


class TransformFloatSlider(FloatSlider):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self)


class TransformIntRangeSlider(IntRangeSlider):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self)


class TransformFloatRangeSlider(FloatRangeSlider):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self)


class TransformText(Text):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self)


class TransformTextarea(Textarea):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self)


class EvalText(Text):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self, evaluate=True)


class EvalTextarea(Textarea):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._sagejs_transform = kwargs.pop("transform", None)
        super().__init__(*args, **kwargs)

    def get_interact_value(self) -> Any:
        return _transformed_value(self, evaluate=True)


def _sage_color(value: Any) -> Any:
    """Construct a Sage color through the live mathematical namespace."""
    color_constructor = __main__.__dict__.get("Color")
    if color_constructor is None:
        try:
            color_constructor = evaluate_user_expression("Color")
        except (NameError, KeyError):
            raise RuntimeError(  # noqa: B904
                "Sage Color is unavailable in this session"
            )
    return color_constructor(value)


class SageColorPicker(ColorPicker):
    """An ipywidgets color picker whose callback value is a Sage Color."""

    def get_interact_value(self) -> Any:
        return _sage_color(self.value)


class Grid(HBox, ValueWidget):
    """Rectangular grid of value widgets used by `input_grid`."""

    value = List()
    description = Unicode()

    def __init__(
        self,
        nrows: int,
        ncols: int,
        make_widget: Callable[[int, int], Any],
        description: str = "",
        transform: Callable[[Any], Any] | None = None,
    ) -> None:
        if nrows < 1 or ncols < 1:
            raise ValueError("Grid requires a positive number of rows and columns")
        self._sagejs_transform = transform
        super().__init__()

        label = Label(description)
        link((label, "value"), (self, "description"))
        self.cols = []
        for column_index in range(ncols):
            column = VBox()
            children = []
            for row_index in range(nrows):
                widget = make_widget(row_index, column_index)
                widget.observe(self._update, names="value")
                children.append(widget)
            column.children = children
            self.cols.append(column)
        self.children = [label] + self.cols
        self._update()

    def _update(self, *args: Any) -> None:
        del args
        rows: list[list[Any]] = []
        for column in self.cols:
            for row_index, widget in enumerate(column.children):
                if row_index == len(rows):
                    rows.append([])
                rows[row_index].append(widget.get_interact_value())
        self.value = rows

    def get_interact_value(self) -> Any:
        transform = self._sagejs_transform
        return self.value if transform is None else transform(self.value)


__all__ = [
    "EvalText",
    "EvalTextarea",
    "Grid",
    "HTMLText",
    "SageColorPicker",
    "TransformFloatRangeSlider",
    "TransformFloatSlider",
    "TransformIntRangeSlider",
    "TransformIntSlider",
    "TransformText",
    "TransformTextarea",
    "TransformWidget",
    "evaluate_user_expression",
]
