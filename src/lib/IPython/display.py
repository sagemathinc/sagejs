"""Jupyter-compatible rich display publication for Sage.js evaluators."""

from __future__ import annotations

import json
from typing import Any

import sagejs.runtime as runtime


def _host_function(name: str) -> Any:
    function = runtime.reflect.get(runtime.global_object, name)
    if not runtime.strict_equal(runtime.jstype(function), "function"):
        raise RuntimeError(
            "rich display requires a Sage.js interactive evaluator; "
            + name
            + " is unavailable"
        )
    return function


class DisplayHandle:
    """Handle which can update or redisplay one display id."""

    def __init__(self, display_id: str | None = None) -> None:
        self.display_id = display_id

    def display(self, obj: Any, **kwargs: Any) -> Any:
        return display(obj, display_id=self.display_id, **kwargs)

    def update(self, obj: Any, **kwargs: Any) -> Any:
        return update_display(obj, display_id=self.display_id, **kwargs)


def display(
    *objs: Any,
    include: Any = None,
    exclude: Any = None,
    metadata: Any = None,
    transient: Any = None,
    display_id: Any = None,
    raw: bool = False,
    clear: bool = False,
    **kwargs: Any,
) -> DisplayHandle | None:
    """Publish objects immediately as ordered Jupyter display events."""
    del include, exclude, metadata, transient, raw, kwargs
    if clear:
        clear_output(wait=True)
    publish = _host_function("__sagejs_display_publish__")
    resolved_id = display_id
    for obj in objs:
        value = runtime.reflect.apply(
            publish,
            runtime.undefined,
            [obj, resolved_id, False],
        )
        if value is not runtime.undefined and value is not None:
            resolved_id = value
    return DisplayHandle(resolved_id) if display_id else None


def update_display(obj: Any, *, display_id: str, **kwargs: Any) -> None:
    """Publish an update for a previously assigned display id."""
    del kwargs
    runtime.reflect.apply(
        _host_function("__sagejs_display_publish__"),
        runtime.undefined,
        [obj, display_id, True],
    )


def clear_output(wait: bool = False) -> None:
    """Publish a Jupyter `clear_output` event."""
    runtime.reflect.apply(
        _host_function("__sagejs_clear_output__"), runtime.undefined, [wait]
    )


class DisplayObject:
    """Base object carrying display data and optional metadata."""

    mimetype = "text/plain"

    def __init__(
        self,
        data: Any = None,
        url: str | None = None,
        filename: str | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        del kwargs
        self.data = data if data is not None else (url if url is not None else filename)
        self.url = url
        self.filename = filename
        self.metadata = {} if metadata is None else metadata

    def _repr_mimebundle_(self, include: Any = None, exclude: Any = None) -> Any:
        del include, exclude
        return {self.mimetype: self.data}, {self.mimetype: self.metadata}


class TextDisplayObject(DisplayObject):
    def __init__(self, data: Any = None, **kwargs: Any) -> None:
        super().__init__("" if data is None else str(data), **kwargs)


class Pretty(TextDisplayObject):
    mimetype = "text/plain"


class HTML(TextDisplayObject):
    mimetype = "text/html"


class Markdown(TextDisplayObject):
    mimetype = "text/markdown"


class Math(TextDisplayObject):
    mimetype = "text/latex"


class Latex(Math):
    pass


class SVG(TextDisplayObject):
    mimetype = "image/svg+xml"


class Javascript(TextDisplayObject):
    mimetype = "application/javascript"


class JSON(DisplayObject):
    mimetype = "application/json"

    def __init__(self, data: Any = None, **kwargs: Any) -> None:
        if isinstance(data, str):
            data = json.loads(data)
        super().__init__(data, **kwargs)


class Image(DisplayObject):
    """Embedded image payload used by standard widget output tests."""

    def __init__(
        self,
        data: Any = None,
        url: str | None = None,
        filename: str | None = None,
        format: str | None = None,
        embed: bool | None = None,
        **kwargs: Any,
    ) -> None:
        del embed
        super().__init__(data=data, url=url, filename=filename, **kwargs)
        self.format = (format or "png").lower()
        self.mimetype = "image/" + (
            "jpeg" if self.format in ("jpg", "jpeg") else self.format
        )


def publish_display_data(data: Any, metadata: Any = None, **kwargs: Any) -> None:
    del metadata, kwargs
    display(_RawBundle(data))


class _RawBundle:
    def __init__(self, data: Any) -> None:
        self.data = data

    def _repr_mimebundle_(self) -> Any:
        return self.data


__all__ = [
    "DisplayHandle",
    "DisplayObject",
    "HTML",
    "Image",
    "JSON",
    "Javascript",
    "Latex",
    "Markdown",
    "Math",
    "Pretty",
    "SVG",
    "TextDisplayObject",
    "clear_output",
    "display",
    "publish_display_data",
    "update_display",
]
