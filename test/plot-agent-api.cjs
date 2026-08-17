#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-plot-agent-"));
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
from sagejs.plotting import Diagnostic, PlotSpec, Provenance, make_layer

line = make_layer(
    "line",
    {"x": [-1, 0, 2, 3], "y": [1, None, 3, 4]},
    ordinal=0,
    style={"color": "blue", "width": 2},
    legend={"label": "signal", "show": True},
)
empty = make_layer("point", {"x": [], "y": []}, ordinal=1)
bad = make_layer("line", {"x": [None], "y": [None]}, ordinal=2)
label = make_layer(
    "text", {"position": [5, 6], "text": "peak"}, ordinal=3
)
unknown = make_layer("image", {"pixels": [[1, 2], [3, 4]]}, ordinal=4)
source_diagnostic = Diagnostic(
    "PLOT_OPTION_TRANSLATED",
    layer_ids=[line.id],
    details={"option": "frame"},
)
spec = PlotSpec(
    2,
    [line, empty, bad, label, unknown],
    axes_or_scene={"xaxis": {"type": "log"}, "y": {"scale": "linear"}},
    provenance=Provenance(
        "sage", constructor="plot", metadata={"request_id": "r-1"}
    ),
    diagnostics=[source_diagnostic],
    plotly_overrides={"layout": {"hovermode": "closest"}},
)

assert spec.layer("layer-0").kind == "line"
try:
    spec.layer("missing")
except KeyError:
    pass
else:
    raise AssertionError("unknown layer ID was accepted")
assert [item.id for item in spec.select_layers(kind="line")] == ["layer-0", "layer-2"]
assert [item.id for item in spec.select_layers(["layer-3", "layer-0"])] == ["layer-0", "layer-3"]
assert [item.id for item in spec.select_layers(visible=True)] == [
    "layer-0", "layer-1", "layer-2", "layer-3", "layer-4"
]

detached = spec.data("layer-0")
detached["x"][0] = 100
assert spec.data("layer-0")["x"][0] == -1
assert spec.bounds() == {"x": [-1.0, 5.0], "y": [1.0, 6.0]}
assert spec.bounds("layer-3") == {"x": [5.0, 5.0], "y": [6.0, 6.0]}
assert spec.bounds("layer-4") == {}

structured = spec.description()
assert structured["dimension"] == 2
assert structured["layer_count"] == 5
assert structured["kinds"] == {
    "image": 1, "line": 2, "point": 1, "text": 1
}
assert structured["layer_ids"] == [
    "layer-0", "layer-1", "layer-2", "layer-3", "layer-4"
]
assert spec.describe() == (
    "2D plot with 5 layers: 1 image, 2 line layers, 1 point and 1 text. "
    "Bounds: x from -1 to 5; y from 1 to 6. Source frontend: sage."
)
assert spec.alt_text() == spec.describe()

diagnostics = spec.validate(max_samples=3, max_payload_bytes=1)
codes = [item.code for item in diagnostics]
assert codes == [
    "PLOT_OPTION_TRANSLATED",
    "PLOT_DATA_PARTIAL_NONFINITE",
    "PLOT_AXIS_LOG_NONPOSITIVE",
    "PLOT_DATA_EMPTY",
    "PLOT_DATA_ALL_NONFINITE",
    "PLOT_RESOURCE_EXCESSIVE_SAMPLES",
    "PLOT_RESOURCE_EXCESSIVE_PAYLOAD",
    "PLOT_ALT_TEXT_MISSING",
]
assert diagnostics[1].details["nonfinite_coordinate_count"] == 1
assert diagnostics[2].details == {
    "axes": ["x"], "nonpositive_coordinate_count": 2
}
assert diagnostics[5].details == {"limit": 3, "sample_count": 6}
assert len(spec.diagnostics) == 1

provided = spec.revise(
    annotations=[{"kind": "alt_text", "text": "A supplied accessible summary."}]
)
assert provided.alt_text() == "A supplied accessible summary."
assert "PLOT_ALT_TEXT_MISSING" not in [
    item.code for item in provided.validate(max_samples=None, max_payload_bytes=None)
]

clone = spec.clone()
assert clone is not spec
assert clone.to_json() == spec.to_json()
revised = spec.revise_layer(
    "layer-0", style={"color": "red"}, visibility=False
)
assert revised.layer("layer-0").id == line.id
assert revised.layer("layer-0").style == {"color": "red"}
assert revised.layer("layer-0").visibility is False
assert spec.layer("layer-0").style == {"color": "blue", "width": 2}
assert spec.layer("layer-0").visibility is True
assert revised.provenance == spec.provenance

added_layer = make_layer("point", {"x": [9], "y": [10]}, ordinal=9)
added = revised.add_layer(added_layer, index=1)
assert [item.id for item in added.layers][1] == "layer-9"
removed = added.remove_layer("layer-0")
assert [item.id for item in removed.layers] == [
    "layer-9", "layer-1", "layer-2", "layer-3", "layer-4"
]
assert all("layer-0" not in item.layer_ids for item in removed.diagnostics)
assert removed.provenance == spec.provenance
themed = removed.with_theme("publication")
assert themed.theme == "publication" and removed.theme == "notebook"
overridden = themed.with_plotly_overrides(
    {"layout": {"title": {"text": "Revised"}}, "config": {"responsive": True}}
)
assert overridden.plotly_overrides["layout"]["title"]["text"] == "Revised"
assert themed.plotly_overrides == spec.plotly_overrides
validated = spec.revise(
    diagnostics=spec.validate(max_samples=None, max_payload_bytes=None)
)
assert len(validated.diagnostics) == 6
limited = spec.revise(diagnostics=spec.validate(max_samples=3, max_payload_bytes=1))
limited_again = limited.revise(
    diagnostics=limited.validate(max_samples=3, max_payload_bytes=1)
)
assert limited_again.to_json() == limited.to_json()

for invalid in (
    lambda: PlotSpec(2, plotly_overrides={"data": []}),
    lambda: PlotSpec(2, plotly_overrides={"layout": []}),
    lambda: PlotSpec(2, plotly_overrides={"layout": {"__proto__": {}}}),
    lambda: PlotSpec(2, plotly_overrides={"layout": {"bad": object()}}),
    lambda: spec.add_layer(line),
    lambda: spec.add_layer(added_layer, index=-1),
    lambda: spec.validate(max_samples=-1),
):
    try:
        invalid()
    except (IndexError, TypeError, ValueError):
        pass
    else:
        raise AssertionError("unsafe or invalid agent revision was accepted")

three = PlotSpec(
    3,
    [
        make_layer(
            "line",
            {"points": [[0, 1, 2], [3, None, 5], [float("inf"), 4, -1]]},
        ),
        make_layer("text", {"position": [10, 20, 30]}, ordinal=1),
    ],
    annotations=[{"kind": "alt_text", "text": "Three-dimensional witness."}],
)
assert three.bounds() == {
    "x": [0.0, 10.0], "y": [1.0, 20.0], "z": [-1.0, 30.0]
}
assert [item.code for item in three.validate()] == [
    "PLOT_DATA_PARTIAL_NONFINITE"
]

print(json.dumps({
    "description": structured,
    "natural": spec.describe(),
    "diagnostics": [item.to_dict() for item in diagnostics],
    "revised": json.loads(overridden.to_json()),
    "three_bounds": three.bounds(),
}, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
`;

test("PlotSpec agent APIs are differential across CPython and Sage.js", () => {
  const cpython = runCPython(witness);
  const sagejs = runSagejs(witness);
  assert.equal(sagejs, cpython);

  const result = JSON.parse(sagejs);
  assert.equal(result.description.dimension, 2);
  assert.equal(result.description.layer_ids[0], "layer-0");
  assert.equal(result.revised.theme, "publication");
  assert.deepEqual(result.three_bounds.z, [-1, 30]);
});
