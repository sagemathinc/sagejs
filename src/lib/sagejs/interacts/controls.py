"""Legacy Sage interact control constructors backed by ipywidgets."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from numbers import Integral, Real
from typing import Any, Callable

from ipywidgets.widgets import (
    Checkbox,
    Dropdown,
    FloatRangeSlider,
    FloatSlider,
    IntRangeSlider,
    IntSlider,
    SelectionSlider,
    ToggleButtons,
)
from ipywidgets.widgets.interaction import _get_min_max_value
from sagejs.interacts.widgets import (
    EvalText,
    EvalTextarea,
    Grid,
    HTMLText,
    SageColorPicker,
    TransformFloatRangeSlider,
    TransformFloatSlider,
    TransformIntRangeSlider,
    TransformIntSlider,
    TransformText,
    TransformTextarea,
    _sage_color,
)

text_control = HTMLText


def _parent(value: Any) -> Any:
    method = getattr(value, "parent", None)
    return method() if method is not None else type(value)


def _numeric_approximation(value: Any) -> Any:
    method = getattr(value, "numerical_approx", None)
    return method() if method is not None else value


def _is_rational_parent(parent_value: Any) -> bool:
    return str(parent_value) == "Rational Field"


def _is_real_value(value: Any) -> bool:
    return isinstance(value, Real) or type(value).__name__ == "RealNumber"


def input_box(
    default: Any = None,
    label: str | None = None,
    type: Callable[[Any], Any] | None = None,
    width: int = 80,
    height: int = 1,
) -> Any:
    """Return a one-line or multiline Sage expression input control."""
    kwargs: dict[str, Any] = {}
    if type is str:
        kwargs["transform"] = str
        widget_class = TransformTextarea if height > 1 else TransformText
    else:
        kwargs["transform"] = type
        widget_class = EvalTextarea if height > 1 else EvalText
    if default is not None:
        kwargs["value"] = str(default)
    if label is not None:
        kwargs["description"] = label
    widget = widget_class(**kwargs)
    widget.layout.max_width = str(width + 1) + "em"
    return widget


def _selection_default(options: list[Any], default: Any) -> Any:
    def distance(value: Any) -> tuple[int, Any]:
        if value is default:
            return (-1, 0)
        try:
            if value == default:
                return (0, 0)
            return (0, abs(value - default))
        except Exception:
            return (1, 0)

    return min(options, key=distance)


def _rational_options(
    minimum: Any,
    maximum: Any,
    step: Any,
) -> list[Any]:
    if step is None:
        step = _parent(minimum)(1)
    if step <= 0:
        raise ValueError("step_size must be positive")
    options = []
    value = minimum
    while value <= maximum:
        options.append(value)
        value += step
    return options


def slider(
    vmin: Any,
    vmax: Any = None,
    step_size: Any = None,
    default: Any = None,
    label: str | None = None,
    display_value: bool = True,
    _range: bool = False,
) -> Any:
    """Return a Sage-compatible numeric or selection slider."""
    kwargs: dict[str, Any] = {"readout": display_value}
    if label:
        kwargs["description"] = label

    if isinstance(vmin, Iterable):
        if vmax is not None:
            raise TypeError("unexpected argument 'vmax' for a selection slider")
        if step_size is not None:
            raise TypeError("unexpected argument 'step_size' for a selection slider")
        if _range:
            raise NotImplementedError("range_slider does not support a list of values")
        options = list(vmin)
        kwargs["options"] = options
        if default is not None:
            kwargs["value"] = _selection_default(options, default)
        return SelectionSlider(**kwargs)

    approximated = [_numeric_approximation(value) for value in (vmin, vmax, step_size)]
    if approximated != [vmin, vmax, step_size]:
        vmin, vmax, step_size = approximated
    sample = sum(value for value in (vmin, vmax, step_size) if value is not None)
    parent_value = _parent(sample)

    if vmin is not None:
        vmin = parent_value(vmin)
    if vmax is not None:
        vmax = parent_value(vmax)
    if step_size is not None:
        step_size = parent_value(step_size)
    if default is not None:
        default = (
            tuple(parent_value(value) for value in default)
            if _range
            else parent_value(default)
        )
        kwargs["value"] = default

    zero = parent_value()
    if isinstance(zero, Integral):
        if parent_value is int:
            widget_class = IntRangeSlider if _range else IntSlider
        elif _range:

            def transform_integer_pair(pair: Any) -> tuple[Any, ...]:
                return tuple(parent_value(value) for value in pair)

            kwargs["transform"] = transform_integer_pair
            widget_class = TransformIntRangeSlider
        else:
            kwargs["transform"] = parent_value
            widget_class = TransformIntSlider
    elif _is_rational_parent(parent_value):
        if _range:
            raise NotImplementedError("range_slider does not support rational numbers")
        minimum, maximum, value = _get_min_max_value(vmin, vmax, default, step_size)
        kwargs["options"] = _rational_options(minimum, maximum, step_size)
        kwargs["value"] = value
        return SelectionSlider(**kwargs)
    elif _is_real_value(zero):
        if parent_value is float:
            widget_class = FloatRangeSlider if _range else FloatSlider
        elif _range:

            def transform_real_pair(pair: Any) -> tuple[Any, ...]:
                return tuple(parent_value(value) for value in pair)

            kwargs["transform"] = transform_real_pair
            widget_class = TransformFloatRangeSlider
        else:
            kwargs["transform"] = parent_value
            widget_class = TransformFloatSlider
    else:
        raise TypeError("unknown parent {!r} for slider".format(parent_value))

    kwargs["min"] = vmin
    if vmax is not None:
        kwargs["max"] = vmax
    if step_size is not None:
        kwargs["step"] = step_size
    return widget_class(**kwargs)


def range_slider(*args: Any, **kwargs: Any) -> Any:
    """Return a slider selecting two values from one numeric interval."""
    kwargs["_range"] = True
    return slider(*args, **kwargs)


def checkbox(default: Any = True, label: str | None = None) -> Checkbox:
    """Return a checkbox with Sage's legacy defaults."""
    kwargs: dict[str, Any] = {"value": bool(default)}
    if label is not None:
        kwargs["description"] = label
    return Checkbox(**kwargs)


def selector(
    values: Any,
    label: str | None = None,
    default: Any = None,
    nrows: int | None = None,
    ncols: int | None = None,
    width: Any = None,
    buttons: bool = False,
) -> Any:
    """Return a dropdown or button selection control."""
    del width
    if isinstance(values, Sequence):
        values = list(values)
        if values and isinstance(values[0], tuple) and len(values[0]) == 2:
            values = [(str(item_label), value) for value, item_label in values]
    kwargs: dict[str, Any] = {"options": values}
    widget_class = (
        ToggleButtons if buttons or nrows is not None or ncols is not None else Dropdown
    )
    if default is not None:
        kwargs["value"] = default
    if label is not None:
        kwargs["description"] = label
    return widget_class(**kwargs)


def input_grid(
    nrows: int,
    ncols: int,
    default: Any = None,
    label: str | None = None,
    to_value: Callable[[Any], Any] | None = None,
    width: int = 4,
) -> Grid:
    """Return a rectangular grid of Sage expression input boxes."""
    if not isinstance(default, list):
        rows = [[default for _ in range(ncols)] for _ in range(nrows)]
    elif all(isinstance(element, list) for element in default):
        rows = default
    else:
        rows = [
            [default[row * ncols + column] for column in range(ncols)]
            for row in range(nrows)
        ]

    def make_widget(row: int, column: int) -> Any:
        return input_box(str(rows[row][column]), width=width)

    return Grid(
        nrows,
        ncols,
        make_widget,
        description="" if label is None else label,
        transform=to_value,
    )


def color_selector(
    default: Any = (0, 0, 1),
    label: str | None = None,
    widget: Any = None,
    hide_box: bool = False,
) -> SageColorPicker:
    """Return an HTML color picker whose callback value is a Sage Color."""
    del widget
    kwargs: dict[str, Any] = {
        "value": _sage_color(default).html_color(),
        "concise": hide_box,
    }
    if label is not None:
        kwargs["description"] = label
    return SageColorPicker(**kwargs)


__all__ = [
    "checkbox",
    "color_selector",
    "input_box",
    "input_grid",
    "range_slider",
    "selector",
    "slider",
    "text_control",
]
