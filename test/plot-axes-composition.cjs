#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const schema = JSON.parse(
  readFileSync(
    join(root, "docs/sage-compatibility/plotting/presentation-schema.json"),
    "utf8",
  ),
);

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-plot-presentation-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "/usr/bin/python3");
  const prefix = String.raw`
import collections.abc, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import json
from sagejs.plotting import PlotSpec, make_layer
from sagejs.plotting.axes import (
    AnnotationSettings,
    Axes2DSettings,
    AxisSettings,
    LegendSettings,
    Scene3DSettings,
    UnsupportedPresentationError,
    lower_annotations,
    lower_axes_2d,
    lower_legend,
    lower_scene_3d,
    unsupported_option_diagnostic,
)
from sagejs.plotting.composition import (
    Panel2D,
    PanelComposition2D,
    lower_panel_figure,
    panel_axis_references,
    qualified_layer_id,
    stable_panel_id,
)
from sagejs.plotting.lowering import lower_plot_spec

x_axis = AxisSettings(
    scale="log",
    range=(-2, 3),
    autorange=False,
    label="frequency",
    tick_mode="array",
    tick_values=(0, 1, 2),
    tick_labels=("1", "10", "100"),
    tick_format=".2g",
    tick_angle=-30,
    show_grid=True,
    grid_color="#cccccc",
    grid_width=0.5,
)
y_axis = AxisSettings(
    label="amplitude",
    tick_mode="linear",
    tick_start=0,
    tick_step=0.5,
    zero_line=False,
)
axes = Axes2DSettings(x_axis, y_axis, equal_aspect=True)
lowered_axes = lower_axes_2d(axes)
assert lowered_axes["xaxis"]["range"] == [-2, 3]
assert lowered_axes["xaxis"]["type"] == "log"
assert lowered_axes["yaxis"]["scaleanchor"] == "x"
assert lowered_axes["yaxis"]["scaleratio"] == 1

annotation = AnnotationSettings(
    "peak",
    "peak",
    1,
    2,
    show_arrow=True,
    x_anchor="center",
    y_anchor="bottom",
    font={"color": "#112233", "size": 14},
)
annotations = lower_annotations([annotation])
assert annotations[0]["text"] == "peak" and "id" not in annotations[0]
legend = lower_legend(LegendSettings(title="Series", orientation="h", x=0.5))
assert legend["showlegend"] is True
assert legend["legend"]["title"]["text"] == "Series"

scene = Scene3DSettings(
    AxisSettings(label="x"),
    AxisSettings(label="y"),
    AxisSettings(label="z"),
    aspect_mode="manual",
    aspect_ratio={"x": 1, "y": 2, "z": 3},
    camera={"eye": {"x": 1.2, "y": 1.2, "z": 0.8}},
)
assert lower_scene_3d(scene)["scene"]["aspectratio"] == {"x": 1, "y": 2, "z": 3}

line = make_layer(
    "line",
    {"x": [0, 1, 2], "y": [0, 1, 4]},
    ordinal=0,
    style={"color": "#3366cc", "width": 2, "dash": "solid", "opacity": 0.8},
    legend={"show": True, "label": "quadratic"},
    metadata={"semantic": True, "zorder": 7},
)
point = make_layer(
    "point",
    {"x": [1], "y": [1]},
    ordinal=1,
    style={
        "color": "#cc3333",
        "size": 8,
        "symbol": "circle",
        "edge": {"color": "#000000", "width": 1},
        "opacity": 1,
    },
    legend={"show": False, "label": None},
    metadata={"semantic": True},
)
text = make_layer(
    "text",
    {"text": "origin", "position": [0, 0]},
    ordinal=2,
    style={"color": "#222222", "font_size": 12, "position": "top center", "opacity": 1},
    metadata={"semantic": True},
)
raw = make_layer(
    "plotly-trace",
    {"traces": [{"type": "bar", "x": [0], "y": [2]}]},
    ordinal=3,
    metadata={"semantic": False},
)
spec = PlotSpec(
    2,
    [line, point, text, raw],
    axes_or_scene=axes.to_dict(),
    annotations=[annotation.to_dict(), {"kind": "alt_text", "text": "A plot"}],
)
figure = lower_plot_spec(spec)
assert [trace["type"] for trace in figure["data"]] == ["scatter", "scatter", "scatter", "bar"]
assert figure["data"][0]["legendrank"] == 7
assert figure["data"][1]["marker"]["line"]["width"] == 1
assert figure["data"][2]["hoverinfo"] == "skip"
assert figure["layout"]["annotations"][0]["text"] == "peak"
assert figure["config"] == {
    "displaylogo": False,
    "responsive": True,
    "displayModeBar": True,
    "scrollZoom": True,
    "doubleClick": "reset+autosize",
}

# Full legacy layout+config overrides are authoritative for exact parity.
legacy = spec.revise(
    axes_or_scene={
        "coordinate_system": "cartesian",
        "xaxis": {"mirror": True, "showline": True},
        "yaxis": {"mirror": True, "showline": True},
    },
    annotations=[],
    plotly_overrides={
        "layout": {"width": 640, "xaxis": {"range": [0, 2]}, "showlegend": True},
        "config": {"displaylogo": False, "responsive": False},
    },
)
legacy_figure = lower_plot_spec(legacy)
assert legacy_figure["layout"] == {"width": 640, "xaxis": {"range": [0, 2]}, "showlegend": True}
assert legacy_figure["config"] == {"displaylogo": False, "responsive": False}

left_spec = PlotSpec(2, [line], axes_or_scene=Axes2DSettings().to_dict())
right_line = line.revise(data={"x": [0, 1], "y": [1, 0]})
right_spec = PlotSpec(2, [right_line], axes_or_scene=Axes2DSettings().to_dict())
left = Panel2D("left", left_spec, 0, 0, title="Left")
right = Panel2D("right", right_spec, 0, 1, title="Right")
composition = PanelComposition2D(1, 2, [right, left], horizontal_gap=0.1)
assert [panel.id for panel in composition.panels] == ["left", "right"]
assert stable_panel_id(3) == "panel-3"
assert qualified_layer_id("left", "layer-0") == "left.layer-0"
references = panel_axis_references(composition)
assert references["left"]["x_trace"] == "x"
assert references["right"]["x_trace"] == "x2"
panel_figure = lower_panel_figure(
    composition,
    {
        "left": lower_plot_spec(left_spec)["data"],
        "right": lower_plot_spec(right_spec)["data"],
    },
)
assert panel_figure["layout"]["xaxis"]["domain"] == [0.0, 0.45]
assert panel_figure["layout"]["xaxis2"]["domain"] == [0.55, 1.0]
assert panel_figure["data"][0]["uid"] == "left.layer-0"
assert panel_figure["data"][1]["uid"] == "right.layer-0"
assert panel_figure["data"][1]["xaxis"] == "x2"

# Public records are detached.
axis_record = x_axis.to_dict()
axis_record["range"][0] = 99
assert x_axis.to_dict()["range"] == [-2, 3]
composition_record = composition.to_dict()
composition_record["panels"][0]["spec"]["layers"][0]["data"]["x"][0] = 99
assert composition.panels[0].spec.layers[0].data["x"][0] == 0

failures = (
    lambda: AxisSettings(scale="symlog"),
    lambda: AxisSettings(range=(0, 1)),
    lambda: AxisSettings(tick_mode="array", tick_values=(1, 2), tick_labels=("one",)),
    lambda: AnnotationSettings("bad-reference", "bad", 0, 0, x_reference="y"),
    lambda: PanelComposition2D(1, 1, [left, Panel2D("overlap", left_spec, 0, 0)]),
)
for fail in failures:
    try:
        fail()
    except (TypeError, ValueError, UnsupportedPresentationError):
        pass
    else:
        raise AssertionError("invalid presentation input was accepted")

diagnostic = unsupported_option_diagnostic("Frame", True, reason="no portable frame primitive")
assert diagnostic.code == "PLOT_OPTION_IGNORED"

print(json.dumps({
    "axes": axes.to_dict(),
    "scene": scene.to_dict(),
    "figure": figure,
    "composition": composition.to_dict(),
    "panel_figure": panel_figure,
}, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
`;

test("presentation and composition are differential across CPython and Sage.js", () => {
  const cpython = runCPython(witness);
  const sagejs = runSagejs(witness);
  assert.equal(sagejs, cpython);
  const result = JSON.parse(sagejs);
  assert.equal(result.figure.data.length, 4);
  assert.equal(result.panel_figure.data[1].uid, "right.layer-0");
});

test("checked presentation contract documents Plotly-native boundaries", () => {
  assert.equal(schema.schema_version, 1);
  assert.equal(schema.coordinate_semantics.log_range, "base-10-exponents");
  assert.deepEqual(schema.axis.scale, ["linear", "log"]);
  assert.equal(schema.composition.order, "row-column-panel-id");
  assert.equal(schema.lowering.entry_point, "sagejs.plotting.lowering.lower_plot_spec");
  assert.equal(schema.unsupported.policy, "raise-or-diagnose-never-silently-ignore");
});

const performanceWitness = String.raw`
import json, time
from sagejs.plotting import PlotSpec, make_layer
from sagejs.plotting.axes import Axes2DSettings
from sagejs.plotting.lowering import lower_plot_spec

count = 20000
values = list(range(count))
layer = make_layer(
    "line",
    {"x": values, "y": values},
    style={"color": "#3366cc", "width": 1, "dash": "solid", "opacity": 1},
    legend={"show": False, "label": None},
    metadata={"semantic": True, "zorder": None},
)
spec = PlotSpec(2, [layer], axes_or_scene=Axes2DSettings().to_dict())
start = time.perf_counter()
for _ in range(8):
    figure = lower_plot_spec(spec)
elapsed = time.perf_counter() - start
assert len(figure["data"][0]["x"]) == count
assert elapsed < 15
print(json.dumps({"samples": count, "iterations": 8, "elapsed": elapsed}, sort_keys=True))
`;

test("PlotSpec lowering has a bounded large-line performance sanity check", () => {
  const sagejs = JSON.parse(runSagejs(performanceWitness));
  const cpython = JSON.parse(runCPython(performanceWitness));
  assert.equal(sagejs.samples, cpython.samples);
  assert.equal(sagejs.iterations, cpython.iterations);
  assert.ok(sagejs.elapsed < 15, `Sage.js lowering took ${sagejs.elapsed}s`);
  assert.ok(cpython.elapsed < 15, `CPython lowering took ${cpython.elapsed}s`);
});
