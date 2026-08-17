"""Bounded semantic animation for PlotSpec and 2D panel compositions.

Animation is represented as immutable, fully materialized semantic states.  A
frame retains the stable layer IDs of its PlotSpec (or the qualified stable
IDs of its PanelComposition2D).  Plotly lowering is deterministic, but the
semantic document remains independent of a browser and export backend.

This first contract deliberately requires identical frame topology.  Adding,
removing, reordering, or changing the kind of a layer, changing dimensions,
or changing the placement of panels raises an actionable error instead of
guessing how Plotly trace indices should be remapped.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, TypeAlias

from ._json import JSONValue, canonical_json, materialize_object
from .composition import Panel2D, PanelComposition2D, lower_panel_figure
from .lowering import lower_layer, lower_plot_spec
from .model import PlotSpec

ANIMATION_SCHEMA_VERSION = 1
DEFAULT_MAX_ANIMATION_FRAMES = 500
DEFAULT_MAX_ANIMATION_PANELS = 64
DEFAULT_MAX_ANIMATION_LAYERS = 128
DEFAULT_MAX_ANIMATION_SAMPLES = 5_000_000
DEFAULT_MAX_ANIMATION_PAYLOAD_BYTES = 64 * 1024 * 1024
DEFAULT_MAX_ANIMATION_DURATION_MS = 60 * 60 * 1000

_EASINGS = (
    "linear",
    "quad",
    "cubic",
    "sin",
    "exp",
    "circle",
    "elastic",
    "back",
    "bounce",
)
_STATIC_IMAGE_FORMATS = ("png", "jpeg", "webp", "svg")
_INTERACTIVE_FORMATS = ("json", "html")
_FORMAT_ALIASES = {"htm": "html", "jpg": "jpeg"}


class UnsupportedAnimationError(ValueError):
    """An animation request cannot preserve the declared semantic contract."""


class AnimationResourceError(ValueError):
    """A materialized animation exceeds an explicit resource budget."""


class PlotExportCapabilityError(RuntimeError):
    """An animation or panel export is unavailable or ambiguous."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__("[" + code + "] " + message)


def _identifier(value: Any, name: str) -> str:
    if not isinstance(value, str) or value == "":
        raise TypeError(name + " must be a nonempty string")
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    for character in value:
        if character not in allowed:
            raise ValueError(
                name + " may contain only letters, digits, '-', '_', and '.'"
            )
    return value


def _positive_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(name + " must be a positive integer")
    return value


def _nonnegative_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    return value


def _boolean(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise TypeError(name + " must be a bool")
    return value


def stable_frame_id(ordinal: int) -> str:
    """Return the deterministic stable frame ID for a nonnegative ordinal."""
    return "frame-" + str(_nonnegative_integer(ordinal, "frame ordinal"))


class AnimationTiming:
    """Validated Plotly-compatible transition timing."""

    def __init__(
        self,
        *,
        frame_duration_ms: int = 250,
        transition_duration_ms: int = 0,
        easing: Any = "linear",
        redraw: bool = True,
    ) -> None:
        self._frame_duration_ms = _positive_integer(
            frame_duration_ms, "frame_duration_ms"
        )
        self._transition_duration_ms = _nonnegative_integer(
            transition_duration_ms, "transition_duration_ms"
        )
        if not isinstance(easing, str):
            raise TypeError("animation easing must be a string")
        if easing not in _EASINGS:
            raise ValueError("animation easing must be one of " + ", ".join(_EASINGS))
        self._easing = easing
        self._redraw = _boolean(redraw, "animation redraw")

    @property
    def frame_duration_ms(self) -> int:
        return self._frame_duration_ms

    @property
    def transition_duration_ms(self) -> int:
        return self._transition_duration_ms

    @property
    def easing(self) -> str:
        return self._easing

    @property
    def redraw(self) -> bool:
        return self._redraw

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "frame_duration_ms": self._frame_duration_ms,
            "transition_duration_ms": self._transition_duration_ms,
            "easing": self._easing,
            "redraw": self._redraw,
        }


class AnimationControls:
    """Declarative play, pause, and slider controls.

    Plotly figures do not encode a portable loop or autoplay lifecycle.
    Those behaviors therefore remain explicit unsupported boundaries rather
    than hidden JavaScript callbacks in a renderer-neutral PlotSpec.
    """

    def __init__(
        self,
        *,
        play: bool = True,
        pause: bool = True,
        slider: bool = True,
        from_current: bool = True,
        slider_prefix: Any = "Frame: ",
        autoplay: bool = False,
        loop: bool = False,
    ) -> None:
        self._play = _boolean(play, "animation play control")
        self._pause = _boolean(pause, "animation pause control")
        self._slider = _boolean(slider, "animation slider control")
        self._from_current = _boolean(from_current, "animation from_current")
        if not isinstance(slider_prefix, str):
            raise TypeError("animation slider_prefix must be a string")
        self._slider_prefix = slider_prefix
        autoplay_value = _boolean(autoplay, "animation autoplay")
        loop_value = _boolean(loop, "animation loop")
        if autoplay_value:
            raise UnsupportedAnimationError(
                "autoplay requires a host lifecycle and is not portable Plotly figure data"
            )
        if loop_value:
            raise UnsupportedAnimationError(
                "looping requires a host callback and is not portable Plotly figure data"
            )
        if not (self._play or self._pause or self._slider):
            raise ValueError("animation must expose at least one control")

    @property
    def play(self) -> bool:
        return self._play

    @property
    def pause(self) -> bool:
        return self._pause

    @property
    def slider(self) -> bool:
        return self._slider

    @property
    def from_current(self) -> bool:
        return self._from_current

    @property
    def slider_prefix(self) -> str:
        return self._slider_prefix

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "play": self._play,
            "pause": self._pause,
            "slider": self._slider,
            "from_current": self._from_current,
            "slider_prefix": self._slider_prefix,
            "autoplay": False,
            "loop": False,
        }


class AnimationResourceLimits:
    """Hard materialization limits checked before lowering or rendering."""

    def __init__(
        self,
        *,
        max_frames: int = DEFAULT_MAX_ANIMATION_FRAMES,
        max_panels: int = DEFAULT_MAX_ANIMATION_PANELS,
        max_layers_per_frame: int = DEFAULT_MAX_ANIMATION_LAYERS,
        max_total_samples: int = DEFAULT_MAX_ANIMATION_SAMPLES,
        max_payload_bytes: int = DEFAULT_MAX_ANIMATION_PAYLOAD_BYTES,
        max_duration_ms: int = DEFAULT_MAX_ANIMATION_DURATION_MS,
    ) -> None:
        self._max_frames = _positive_integer(max_frames, "max_frames")
        self._max_panels = _positive_integer(max_panels, "max_panels")
        self._max_layers_per_frame = _positive_integer(
            max_layers_per_frame, "max_layers_per_frame"
        )
        self._max_total_samples = _positive_integer(
            max_total_samples, "max_total_samples"
        )
        self._max_payload_bytes = _positive_integer(
            max_payload_bytes, "max_payload_bytes"
        )
        self._max_duration_ms = _positive_integer(max_duration_ms, "max_duration_ms")

    @property
    def max_frames(self) -> int:
        return self._max_frames

    @property
    def max_panels(self) -> int:
        return self._max_panels

    @property
    def max_layers_per_frame(self) -> int:
        return self._max_layers_per_frame

    @property
    def max_total_samples(self) -> int:
        return self._max_total_samples

    @property
    def max_payload_bytes(self) -> int:
        return self._max_payload_bytes

    @property
    def max_duration_ms(self) -> int:
        return self._max_duration_ms

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "max_frames": self._max_frames,
            "max_panels": self._max_panels,
            "max_layers_per_frame": self._max_layers_per_frame,
            "max_total_samples": self._max_total_samples,
            "max_payload_bytes": self._max_payload_bytes,
            "max_duration_ms": self._max_duration_ms,
        }


PlotState: TypeAlias = PlotSpec | PanelComposition2D


def _detach_panel_composition(value: PanelComposition2D) -> PanelComposition2D:
    panels: list[Panel2D] = []
    for panel in value.panels:
        panels.append(
            Panel2D(
                panel.id,
                panel.spec,
                panel.row,
                panel.column,
                row_span=panel.row_span,
                column_span=panel.column_span,
                title=panel.title,
            )
        )
    return PanelComposition2D(
        value.rows,
        value.columns,
        panels,
        horizontal_gap=value.horizontal_gap,
        vertical_gap=value.vertical_gap,
    )


def _detach_state(value: Any) -> PlotState:
    if isinstance(value, PlotSpec):
        return PlotSpec.from_dict(value.to_dict())
    if isinstance(value, PanelComposition2D):
        return _detach_panel_composition(value)
    raise TypeError("animation state must be a PlotSpec or PanelComposition2D")


def _state_record(value: PlotState) -> dict[str, JSONValue]:
    if isinstance(value, PlotSpec):
        return {"kind": "plot-spec", "value": value.to_dict()}
    return {"kind": "panel-composition-2d", "value": value.to_dict()}


def _spec_has_nested_animation(spec: PlotSpec) -> bool:
    value = spec.to_dict()["animation"]
    return isinstance(value, dict) and bool(value)


def _ensure_no_nested_animation(value: PlotState) -> None:
    if isinstance(value, PlotSpec):
        if _spec_has_nested_animation(value):
            raise UnsupportedAnimationError("nested PlotSpec animation is unsupported")
        return
    for panel in value.panels:
        if _spec_has_nested_animation(panel.spec):
            raise UnsupportedAnimationError(
                "nested panel PlotSpec animation is unsupported"
            )


def _state_dimension(value: PlotState) -> int:
    return value.dimension if isinstance(value, PlotSpec) else 2


def _state_layer_ids(value: PlotState) -> tuple[str, ...]:
    if isinstance(value, PlotSpec):
        return tuple(layer.id for layer in value.layers)
    answer: list[str] = []
    for panel in value.panels:
        for layer in panel.spec.layers:
            answer.append(panel.id + "." + layer.id)
    return tuple(answer)


def _state_topology(value: PlotState) -> dict[str, JSONValue]:
    layers: list[JSONValue] = []
    if isinstance(value, PlotSpec):
        for layer in value.layers:
            layers.append({"id": layer.id, "kind": layer.kind})
        return {
            "state_kind": "plot-spec",
            "dimension": value.dimension,
            "layers": layers,
            "panels": [],
        }
    panels: list[JSONValue] = []
    for panel in value.panels:
        panels.append(
            {
                "id": panel.id,
                "row": panel.row,
                "column": panel.column,
                "row_span": panel.row_span,
                "column_span": panel.column_span,
            }
        )
        for layer in panel.spec.layers:
            layers.append({"id": panel.id + "." + layer.id, "kind": layer.kind})
    return {
        "state_kind": "panel-composition-2d",
        "dimension": 2,
        "rows": value.rows,
        "columns": value.columns,
        "layers": layers,
        "panels": panels,
    }


def _data_scalar_count(value: JSONValue) -> int:
    if isinstance(value, list):
        return sum(_data_scalar_count(item) for item in value)
    if isinstance(value, dict):
        return sum(_data_scalar_count(value[key]) for key in value)
    return 1


def _state_sample_count(value: PlotState) -> int:
    if isinstance(value, PlotSpec):
        return sum(_data_scalar_count(layer.data) for layer in value.layers)
    return sum(_state_sample_count(panel.spec) for panel in value.panels)


def _state_panel_count(value: PlotState) -> int:
    return len(value.panels) if isinstance(value, PanelComposition2D) else 1


class AnimationFrame:
    """One immutable named semantic state in an animation."""

    def __init__(
        self,
        frame_id: str,
        state: PlotState,
        *,
        label: Any = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        self._id = _identifier(frame_id, "frame ID")
        if label is not None and not isinstance(label, str):
            raise TypeError("frame label must be a string or None")
        self._label = self._id if label is None else label
        self._state = _detach_state(state)
        _ensure_no_nested_animation(self._state)
        self._metadata = materialize_object(metadata, "$.frame.metadata")

    @property
    def id(self) -> str:
        return self._id

    @property
    def label(self) -> str:
        return self._label

    @property
    def state(self) -> PlotState:
        return self._state

    @property
    def layer_ids(self) -> tuple[str, ...]:
        return _state_layer_ids(self._state)

    @property
    def metadata(self) -> dict[str, JSONValue]:
        return materialize_object(self._metadata, "$.frame.metadata")

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "id": self._id,
            "label": self._label,
            "layer_ids": list(self.layer_ids),
            "state": _state_record(self._state),
            "metadata": self.metadata,
        }


class PlotAnimation:
    """An immutable, topology-stable, resource-bounded semantic animation."""

    def __init__(
        self,
        frames: Sequence[Any],
        *,
        timing: Any = None,
        controls: Any = None,
        limits: Any = None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        if len(frames) < 2:
            raise ValueError("an animation requires at least two frames")
        self._timing = AnimationTiming() if timing is None else timing
        self._controls = AnimationControls() if controls is None else controls
        self._limits = AnimationResourceLimits() if limits is None else limits
        if not isinstance(self._timing, AnimationTiming):
            raise TypeError("animation timing must be AnimationTiming")
        if not isinstance(self._controls, AnimationControls):
            raise TypeError("animation controls must be AnimationControls")
        if not isinstance(self._limits, AnimationResourceLimits):
            raise TypeError("animation limits must be AnimationResourceLimits")
        if len(frames) > self._limits.max_frames:
            raise AnimationResourceError(
                "animation has "
                + str(len(frames))
                + " frames, exceeding max_frames="
                + str(self._limits.max_frames)
            )
        detached: list[AnimationFrame] = []
        identifiers: dict[str, bool] = {}
        baseline: dict[str, JSONValue] | None = None
        total_samples = 0
        for frame in frames:
            if not isinstance(frame, AnimationFrame):
                raise TypeError("animation frames must be AnimationFrame instances")
            if frame.id in identifiers:
                raise ValueError("duplicate animation frame ID: " + frame.id)
            identifiers[frame.id] = True
            current = AnimationFrame(
                frame.id,
                frame.state,
                label=frame.label,
                metadata=frame.metadata,
            )
            topology = _state_topology(current.state)
            if baseline is None:
                baseline = topology
            elif canonical_json(topology) != canonical_json(baseline):
                raise UnsupportedAnimationError(
                    "all frames must have the same state kind, dimension, panel placement, layer IDs, order, and kinds"
                )
            layer_count = len(current.layer_ids)
            if layer_count > self._limits.max_layers_per_frame:
                raise AnimationResourceError(
                    "animation frame "
                    + current.id
                    + " has "
                    + str(layer_count)
                    + " layers, exceeding max_layers_per_frame="
                    + str(self._limits.max_layers_per_frame)
                )
            panel_count = _state_panel_count(current.state)
            if panel_count > self._limits.max_panels:
                raise AnimationResourceError(
                    "animation frame "
                    + current.id
                    + " has "
                    + str(panel_count)
                    + " panels, exceeding max_panels="
                    + str(self._limits.max_panels)
                )
            total_samples += _state_sample_count(current.state)
            detached.append(current)
        if total_samples > self._limits.max_total_samples:
            raise AnimationResourceError(
                "animation materializes "
                + str(total_samples)
                + " data scalars, exceeding max_total_samples="
                + str(self._limits.max_total_samples)
            )
        duration = len(detached) * self._timing.frame_duration_ms
        if duration > self._limits.max_duration_ms:
            raise AnimationResourceError(
                "animation duration "
                + str(duration)
                + "ms exceeds max_duration_ms="
                + str(self._limits.max_duration_ms)
            )
        self._frames = tuple(detached)
        self._topology = {} if baseline is None else baseline
        self._metadata = materialize_object(metadata, "$.animation.metadata")
        payload_bytes = len(self.to_json().encode("utf-8"))
        if payload_bytes > self._limits.max_payload_bytes:
            raise AnimationResourceError(
                "animation JSON requires "
                + str(payload_bytes)
                + " bytes, exceeding max_payload_bytes="
                + str(self._limits.max_payload_bytes)
            )

    @property
    def frames(self) -> tuple[AnimationFrame, ...]:
        return self._frames

    @property
    def timing(self) -> AnimationTiming:
        return self._timing

    @property
    def controls(self) -> AnimationControls:
        return self._controls

    @property
    def limits(self) -> AnimationResourceLimits:
        return self._limits

    @property
    def dimension(self) -> int:
        return _state_dimension(self._frames[0].state)

    @property
    def topology(self) -> dict[str, JSONValue]:
        return materialize_object(self._topology, "$.animation.topology")

    def frame(self, frame_id: str) -> AnimationFrame:
        for frame in self._frames:
            if frame.id == frame_id:
                return frame
        raise KeyError(frame_id)

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "schema_version": ANIMATION_SCHEMA_VERSION,
            "kind": "plot-animation",
            "dimension": self.dimension,
            "topology": self.topology,
            "timing": self._timing.to_dict(),
            "controls": self._controls.to_dict(),
            "limits": self._limits.to_dict(),
            "frames": [frame.to_dict() for frame in self._frames],
            "metadata": materialize_object(self._metadata, "$.animation.metadata"),
        }

    def to_json(self) -> str:
        return canonical_json(self.to_dict())


def _lower_spec_with_stable_uids(spec: PlotSpec) -> dict[str, JSONValue]:
    figure = lower_plot_spec(spec)
    data = figure["data"]
    if not isinstance(data, list):
        raise TypeError("lowered Plotly data must be a sequence")
    offset = 0
    for layer in spec.layers:
        trace_count = len(lower_layer(layer, spec.dimension))
        for local_index in range(trace_count):
            trace = data[offset + local_index]
            if not isinstance(trace, dict):
                raise TypeError("lowered Plotly traces must be mappings")
            trace["uid"] = (
                layer.id
                if trace_count == 1
                else layer.id + ".trace-" + str(local_index)
            )
        offset += trace_count
    if offset != len(data):
        raise UnsupportedAnimationError(
            "lowered trace count is not stable for the semantic layer topology"
        )
    return figure


def _lower_panel_state(value: PanelComposition2D) -> dict[str, JSONValue]:
    traces: dict[str, Sequence[Mapping[str, Any]]] = {}
    for panel in value.panels:
        figure = lower_plot_spec(panel.spec)
        data = figure["data"]
        if not isinstance(data, list):
            raise TypeError("lowered panel Plotly data must be a sequence")
        panel_traces: list[dict[str, JSONValue]] = []
        for raw_trace in data:
            if not isinstance(raw_trace, dict):
                raise TypeError("lowered panel Plotly traces must be mappings")
            panel_traces.append(materialize_object(raw_trace, "$.data[]"))
        traces[panel.id] = panel_traces
    return lower_panel_figure(value, traces)


def lower_plot_state(value: Any) -> dict[str, JSONValue]:
    """Lower one detached semantic state and attach deterministic trace UIDs."""
    if isinstance(value, PlotSpec):
        return _lower_spec_with_stable_uids(value)
    if isinstance(value, PanelComposition2D):
        return _lower_panel_state(value)
    raise TypeError("plot state must be a PlotSpec or PanelComposition2D")


def _trace_signature(figure: Mapping[str, Any]) -> tuple[str, ...]:
    materialized_figure = materialize_object(figure, "$.figure")
    raw_data = materialized_figure.get("data")
    if not isinstance(raw_data, Sequence):
        raise TypeError("lowered Plotly data must be a sequence")
    output: list[str] = []
    identifiers: dict[str, bool] = {}
    for raw_trace in raw_data:
        if not isinstance(raw_trace, Mapping):
            raise TypeError("lowered Plotly traces must be mappings")
        trace = materialize_object(raw_trace, "$.data[]")
        uid = trace.get("uid")
        if not isinstance(uid, str) or uid == "":
            raise UnsupportedAnimationError(
                "every animated Plotly trace requires a stable semantic UID"
            )
        if uid in identifiers:
            raise UnsupportedAnimationError("duplicate animated Plotly UID: " + uid)
        identifiers[uid] = True
        output.append(
            canonical_json(
                {
                    "uid": uid,
                    "type": trace.get("type", "scatter"),
                    "xaxis": trace.get("xaxis"),
                    "yaxis": trace.get("yaxis"),
                    "scene": trace.get("scene"),
                    "subplot": trace.get("subplot"),
                }
            )
        )
    return tuple(output)


def _frame_options(timing: AnimationTiming, duration: int) -> dict[str, JSONValue]:
    return {
        "frame": {"duration": duration, "redraw": timing.redraw},
        "transition": {
            "duration": timing.transition_duration_ms,
            "easing": timing.easing,
        },
        "mode": "immediate",
    }


def _animation_controls(animation: PlotAnimation) -> dict[str, JSONValue]:
    timing = animation.timing
    controls = animation.controls
    answer: dict[str, JSONValue] = {}
    buttons: list[JSONValue] = []
    if controls.play:
        play_options = _frame_options(timing, timing.frame_duration_ms)
        play_options["fromcurrent"] = controls.from_current
        buttons.append(
            {
                "label": "Play",
                "method": "animate",
                "args": [None, play_options],
            }
        )
    if controls.pause:
        buttons.append(
            {
                "label": "Pause",
                "method": "animate",
                "args": [
                    [None],
                    {
                        "frame": {"duration": 0, "redraw": timing.redraw},
                        "transition": {"duration": 0},
                        "mode": "immediate",
                    },
                ],
            }
        )
    if buttons:
        answer["updatemenus"] = [
            {
                "type": "buttons",
                "direction": "left",
                "showactive": False,
                "x": 0.0,
                "y": 0.0,
                "xanchor": "left",
                "yanchor": "top",
                "buttons": buttons,
            }
        ]
    if controls.slider:
        steps: list[JSONValue] = []
        for frame in animation.frames:
            steps.append(
                {
                    "label": frame.label,
                    "method": "animate",
                    "args": [
                        [frame.id],
                        _frame_options(timing, timing.frame_duration_ms),
                    ],
                }
            )
        answer["sliders"] = [
            {
                "active": 0,
                "currentvalue": {"prefix": controls.slider_prefix},
                "pad": {"t": 50},
                "steps": steps,
            }
        ]
    return answer


def lower_plot_animation(animation: Any) -> dict[str, JSONValue]:
    """Lower a semantic animation to Plotly data, layout, config, and frames."""
    if not isinstance(animation, PlotAnimation):
        raise TypeError("lower_plot_animation requires a PlotAnimation")
    figures = [lower_plot_state(frame.state) for frame in animation.frames]
    baseline = _trace_signature(figures[0])
    baseline_config = canonical_json(figures[0]["config"])
    for index in range(1, len(figures)):
        if _trace_signature(figures[index]) != baseline:
            raise UnsupportedAnimationError(
                "all frames must lower to identical Plotly trace UIDs, types, and subplot references"
            )
        if canonical_json(figures[index]["config"]) != baseline_config:
            raise UnsupportedAnimationError(
                "per-frame Plotly config changes are unsupported"
            )
    layout = materialize_object(figures[0]["layout"], "$.layout")
    for reserved in ("updatemenus", "sliders"):
        if reserved in layout:
            raise UnsupportedAnimationError(
                "animation controls conflict with an existing Plotly layout." + reserved
            )
    layout.update(_animation_controls(animation))
    plotly_frames: list[JSONValue] = []
    for index in range(len(animation.frames)):
        plotly_frames.append(
            {
                "name": animation.frames[index].id,
                "data": figures[index]["data"],
                "traces": list(range(len(baseline))),
                "layout": figures[index]["layout"],
            }
        )
    return {
        "data": figures[0]["data"],
        "layout": layout,
        "config": figures[0]["config"],
        "frames": plotly_frames,
    }


def animation_frame_figure(animation: Any, frame_id: str) -> dict[str, JSONValue]:
    """Return one named frame as a standalone deterministic Plotly figure."""
    if not isinstance(animation, PlotAnimation):
        raise TypeError("animation_frame_figure requires a PlotAnimation")
    return lower_plot_state(animation.frame(frame_id).state)


def normalize_plot_export_format(value: Any) -> str:
    """Normalize the portable plot export format and its documented aliases."""
    result = str(value).lower()
    return _FORMAT_ALIASES.get(result, result)


def plot_export_capabilities(
    value: Any,
    *,
    static_image_available: bool = False,
) -> dict[str, JSONValue]:
    """Return JSON-safe export boundaries without launching a browser."""
    if not isinstance(value, (PlotAnimation, PanelComposition2D)):
        raise TypeError(
            "export capability subject must be PlotAnimation or PanelComposition2D"
        )
    static_available = _boolean(static_image_available, "static_image_available")
    animated = isinstance(value, PlotAnimation)
    formats: dict[str, JSONValue] = {
        "json": {
            "available": True,
            "backend": "builtin",
            "animation": "interactive" if animated else "not-applicable",
            "requires_frame": False,
            "caveats": [],
        },
        "html": {
            "available": True,
            "backend": "builtin",
            "animation": "interactive" if animated else "not-applicable",
            "requires_frame": False,
            "caveats": [],
        },
    }
    for format_name in _STATIC_IMAGE_FORMATS:
        caveats: list[JSONValue] = []
        if animated:
            caveats.append("Static output requires an explicit animation frame ID.")
        if format_name == "svg":
            caveats.append("WebGL and 3D traces are rasterized in SVG output.")
        formats[format_name] = {
            "available": static_available,
            "backend": "chromium",
            "animation": "single-frame" if animated else "not-applicable",
            "requires_frame": animated,
            "caveats": caveats,
        }
    for format_name in ("gif", "mp4", "pdf"):
        formats[format_name] = {
            "available": False,
            "backend": "unsupported",
            "animation": "unsupported" if animated else "not-applicable",
            "requires_frame": False,
            "caveats": [
                "Use interactive HTML or JSON, or export explicit static frames."
            ],
        }
    return {
        "schema_version": 1,
        "subject": "animation" if animated else "panel-composition-2d",
        "formats": formats,
    }


def prepare_plot_export(
    value: PlotAnimation | PanelComposition2D,
    format_name: Any,
    *,
    frame_id: str | None = None,
    static_image_available: bool = False,
) -> dict[str, JSONValue]:
    """Prepare an unambiguous semantic or Plotly payload for an export backend."""
    normalized = normalize_plot_export_format(format_name)
    capabilities = plot_export_capabilities(
        value, static_image_available=static_image_available
    )
    formats = capabilities["formats"]
    if not isinstance(formats, dict):
        raise TypeError("export formats capability must be a mapping")
    capability = formats.get(normalized)
    if not isinstance(capability, dict):
        raise PlotExportCapabilityError(
            "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED",
            "Unsupported graphics format "
            + repr(normalized)
            + "; use PNG, JPEG, WebP, SVG, HTML, or JSON.",
        )
    if capability.get("backend") == "unsupported":
        raise PlotExportCapabilityError(
            "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED",
            normalized.upper()
            + " export is unsupported; use interactive HTML or JSON, or export explicit static frames.",
        )
    animated = isinstance(value, PlotAnimation)
    if normalized in _STATIC_IMAGE_FORMATS and animated and frame_id is None:
        raise PlotExportCapabilityError(
            "SAGEJS_GRAPHICS_ANIMATION_FRAME_REQUIRED",
            "Static animation export requires an explicit stable frame ID.",
        )
    if frame_id is not None and (
        not animated or normalized not in _STATIC_IMAGE_FORMATS
    ):
        raise PlotExportCapabilityError(
            "SAGEJS_GRAPHICS_ANIMATION_FRAME_INVALID",
            "frame_id is valid only for a static animation export.",
        )
    if animated and frame_id is not None:
        try:
            value.frame(frame_id)
        except KeyError as error:
            raise PlotExportCapabilityError(
                "SAGEJS_GRAPHICS_ANIMATION_FRAME_INVALID",
                "Unknown stable animation frame ID: " + frame_id,
            ) from error
    if normalized in _STATIC_IMAGE_FORMATS and not capability.get("available"):
        raise PlotExportCapabilityError(
            "SAGEJS_GRAPHICS_BROWSER_UNAVAILABLE",
            normalized.upper()
            + " export requires configured Chrome, Chromium, or Edge; use HTML or JSON instead.",
        )
    if normalized == "json":
        payload = value.to_dict()
        mode = "semantic-json"
    elif normalized == "html":
        payload = (
            lower_plot_animation(value)
            if isinstance(value, PlotAnimation)
            else lower_plot_state(value)
        )
        mode = "interactive-plotly"
    elif isinstance(value, PlotAnimation):
        if frame_id is None:
            raise AssertionError("static animation frame validation failed")
        payload = animation_frame_figure(value, frame_id)
        mode = "static-frame-plotly"
    else:
        payload = lower_plot_state(value)
        mode = "static-plotly"
    return {
        "format": normalized,
        "mode": mode,
        "frame_id": frame_id,
        "payload": payload,
    }
