#!/usr/bin/env python3
"""Generate deterministic CPython ipywidgets protocol publications.

The selected upstream Python packages run unchanged. Only the `comm` transport
is replaced with an in-memory recorder so model state, metadata, ordering and
binary buffer identities can be checked without starting a Jupyter server.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import comm
from comm.base_comm import BaseComm, CommManager
import ipywidgets as widgets
from IPython.display import Math
from traitlets import Bytes, Unicode
import traitlets


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "upstream-tests" / "ipywidgets" / "protocol-corpus.json"
EXPECTED_VERSIONS = {
    "comm": "0.2.3",
    "ipywidgets": "8.1.9",
    "traitlets": "5.15.1",
}


def normalize(value: Any) -> Any:
    if isinstance(value, memoryview):
        value = value.tobytes()
    if isinstance(value, (bytes, bytearray)):
        raw = bytes(value)
        return {
            "$binary": {
                "length": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        }
    if isinstance(value, dt.datetime):
        return {"$datetime": value.isoformat()}
    if isinstance(value, dict):
        return {str(key): normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return {"$repr": repr(value), "$type": type(value).__name__}


class Recorder:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.manager = CommManager()
        self.counter = 0

    def create_comm(self, *args: Any, **kwargs: Any) -> "RecordingComm":
        self.counter += 1
        kwargs.setdefault("comm_id", f"model-{self.counter:04d}")
        return RecordingComm(self, *args, **kwargs)

    def publish(
        self,
        owner: "RecordingComm",
        msg_type: str,
        data: dict[str, Any] | None,
        metadata: dict[str, Any] | None,
        buffers: list[bytes] | None,
        keys: dict[str, Any],
    ) -> None:
        event = {
            "type": msg_type,
            "comm_id": owner.comm_id,
            "data": normalize(data or {}),
            "metadata": normalize(metadata or {}),
            "buffers": [normalize(buffer) for buffer in (buffers or [])],
        }
        if keys:
            event["keys"] = normalize(keys)
        self.events.append(event)


class RecordingComm(BaseComm):
    def __init__(self, recorder: Recorder, *args: Any, **kwargs: Any) -> None:
        self._recorder = recorder
        super().__init__(*args, **kwargs)

    def publish_msg(
        self,
        msg_type: str,
        data: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        buffers: list[bytes] | None = None,
        **keys: Any,
    ) -> None:
        self._recorder.publish(self, msg_type, data, metadata, buffers, keys)


def view_bundle(widget: widgets.Widget) -> dict[str, Any]:
    return normalize(widget._repr_mimebundle_())


def frontend_message(
    widget: widgets.Widget, data: dict[str, Any], buffers=None
) -> None:
    widget.comm.handle_msg(
        {
            "header": {"msg_id": "frontend-message"},
            "parent_header": {"msg_id": "frontend-parent"},
            "metadata": {},
            "content": {"data": data},
            "buffers": list(buffers or []),
        }
    )


def scalar_controls() -> dict[str, Any]:
    slider = widgets.IntSlider(
        value=3,
        min=-2,
        max=10,
        step=1,
        description="integer",
        continuous_update=True,
    )
    interval = widgets.FloatRangeSlider(
        value=(0.25, 1.25), min=-1.0, max=2.0, step=0.25
    )
    text = widgets.Text(value="alpha", description="name")
    choice = widgets.Dropdown(
        options=(("Alpha", "a"), ("Beta", "b"), ("Gamma", "g")),
        value="b",
        description="choice",
    )
    bundles = [view_bundle(item) for item in (slider, interval, text, choice)]
    slider.value = 4
    interval.value = (0.5, 1.5)
    text.value = "beta"
    choice.value = "g"
    frontend_message(
        slider,
        {"method": "update", "state": {"value": 5}, "buffer_paths": []},
    )
    frontend_message(slider, {"method": "request_state"})
    return {
        "view_bundles": bundles,
        "final_values": {
            "choice": choice.value,
            "interval": interval.value,
            "slider": slider.value,
            "text": text.value,
        },
    }


def nested_layouts() -> dict[str, Any]:
    left = widgets.IntSlider(value=2, description="left")
    right = widgets.Text(value="right")
    row = widgets.HBox(
        (left, right),
        layout=widgets.Layout(
            align_items="center", display="flex", gap="0.5rem", width="90%"
        ),
    )
    formula = widgets.HTMLMath(value=r"\(x^2+y^2=1\)")
    panel = widgets.VBox((row, formula))
    panel.add_class("teaching-panel")
    left.style.handle_color = "#336699"
    return {
        "panel_bundle": view_bundle(panel),
        "children": [child.model_id for child in panel.children],
        "row_children": [child.model_id for child in row.children],
    }


def output_capture_model() -> dict[str, Any]:
    output = widgets.Output(layout=widgets.Layout(border="1px solid #888"))
    output.append_stdout("ordinary output\n")
    output.append_stderr("diagnostic output\n")
    output.append_display_data(Math(r"\int_0^1 x^2\,dx=\frac13"))
    return {
        "bundle": view_bundle(output),
        "outputs": normalize(output.outputs),
    }


def binary_media() -> dict[str, Any]:
    png_bytes = b"\x89PNG\r\n\x1a\nSage.js widget fixture"
    image = widgets.Image(value=png_bytes, format="png", width=64, height=32)
    upload = widgets.FileUpload(accept=".txt")
    upload.value = [
        {
            "name": "example.txt",
            "type": "text/plain",
            "size": 15,
            "last_modified": dt.datetime(2026, 8, 30, 12, 0, 0, tzinfo=dt.timezone.utc),
            "content": memoryview(b"widget payload\n"),
        }
    ]
    return {
        "image_bundle": view_bundle(image),
        "image_sha256": hashlib.sha256(png_bytes).hexdigest(),
        "upload_state": normalize(upload.get_state("value")),
    }


def links_and_custom_messages() -> dict[str, Any]:
    left = widgets.IntSlider(value=1, min=0, max=20)
    right = widgets.IntSlider(value=8, min=0, max=20)
    kernel_link = widgets.link((left, "value"), (right, "value"))
    left.value = 13

    custom_messages: list[Any] = []
    right.on_msg(
        lambda _widget, content, buffers: custom_messages.append((content, buffers))
    )
    frontend_message(
        right,
        {"method": "custom", "content": {"action": "ping", "count": 2}},
        [memoryview(b"custom-buffer")],
    )
    right.send({"action": "pong", "count": 3}, buffers=[b"reply-buffer"])
    kernel_link.unlink()
    return {
        "custom_messages": normalize(custom_messages),
        "linked_value": right.value,
    }


def control_channel_and_fixture() -> dict[str, Any]:
    @widgets.register
    class FixtureWidget(widgets.DOMWidget):
        _model_name = Unicode("FixtureModel").tag(sync=True)
        _model_module = Unicode("@sagejs/widget-fixture").tag(sync=True)
        _model_module_version = Unicode("1.0.0").tag(sync=True)
        _view_name = Unicode("FixtureView").tag(sync=True)
        _view_module = Unicode("@sagejs/widget-fixture").tag(sync=True)
        _view_module_version = Unicode("1.0.0").tag(sync=True)
        label = Unicode("fixture").tag(sync=True)
        payload = Bytes(b"initial-payload").tag(sync=True)

    fixture = FixtureWidget()
    fixture.payload = b"updated-payload"
    recorder = _active_recorder
    control = RecordingComm(
        recorder,
        target_name="jupyter.widget.control",
        comm_id="control-0001",
        primary=False,
    )
    recorder.manager.register_comm(control)
    widgets.Widget.handle_control_comm_opened(
        control,
        {
            "metadata": {"version": "1.0.0"},
            "content": {"data": {}},
            "buffers": [],
        },
    )
    control.handle_msg(
        {
            "header": {"msg_id": "control-request"},
            "content": {"data": {"method": "request_states"}},
            "buffers": [],
        }
    )
    control.close()
    return {
        "fixture_bundle": view_bundle(fixture),
        "fixture_model_id": fixture.model_id,
    }


CASES = (
    ("scalar-controls", scalar_controls),
    ("nested-layouts", nested_layouts),
    ("output-capture-model", output_capture_model),
    ("binary-media", binary_media),
    ("links-and-custom-messages", links_and_custom_messages),
    ("control-channel-and-fixture", control_channel_and_fixture),
)


_active_recorder = Recorder()


def capture_case(name: str, function) -> dict[str, Any]:
    global _active_recorder
    widgets.Widget.close_all()
    _active_recorder = Recorder()
    comm.create_comm = _active_recorder.create_comm
    comm.get_comm_manager = lambda: _active_recorder.manager
    observations = function()
    widgets.Widget.close_all()
    return {
        "name": name,
        "observations": normalize(observations),
        "events": _active_recorder.events,
    }


def generate() -> dict[str, Any]:
    versions = {
        "comm": comm.__version__,
        "ipywidgets": widgets.__version__,
        "traitlets": traitlets.__version__,
    }
    if versions != EXPECTED_VERSIONS:
        raise RuntimeError(
            "wrong upstream package versions: "
            + json.dumps(versions, sort_keys=True)
            + "; expected "
            + json.dumps(EXPECTED_VERSIONS, sort_keys=True)
        )
    return {
        "schema": "sagejs.ipywidgets-protocol-corpus/v1",
        "authority": "CPython",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "packages": versions,
        "protocols": {
            "control": "1.0.0",
            "widget": "2.1.0",
        },
        "normalization": {
            "binary": "SHA-256 and byte length",
            "comm_ids": "model-NNNN per case",
            "omitted": ["timestamps", "Jupyter parent message UUIDs"],
        },
        "cases": [capture_case(name, function) for name, function in CASES],
    }


def encoded_corpus() -> str:
    return json.dumps(generate(), indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed corpus")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    actual = encoded_corpus()
    if args.check:
        expected = args.output.read_text(encoding="utf-8")
        if actual != expected:
            print(f"ipywidgets corpus is stale: {args.output}", file=sys.stderr)
            return 1
        print(f"ipywidgets corpus is current: {args.output}")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(actual, encoding="utf-8")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
