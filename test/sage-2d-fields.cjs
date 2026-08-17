#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const oracle = JSON.parse(
  readFileSync(
    join(
      root,
      "docs/sage-compatibility/plotting/oracle/field-grids.json",
    ),
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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-2d-fields-"));
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

function assertEquivalent(actual, expected, path = "$") {
  if (typeof actual === "number" && typeof expected === "number") {
    const tolerance = Math.max(
      1e-15,
      1e-14 * Math.max(Math.abs(actual), Math.abs(expected)),
    );
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${path}: ${actual} != ${expected}`,
    );
    return;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    assert.ok(Array.isArray(actual) && Array.isArray(expected), path);
    assert.equal(actual.length, expected.length, path);
    for (let index = 0; index < actual.length; index += 1) {
      assertEquivalent(actual[index], expected[index], `${path}[${index}]`);
    }
    return;
  }
  if (actual !== null && expected !== null &&
      typeof actual === "object" && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(actual)) {
      assertEquivalent(actual[key], expected[key], `${path}.${key}`);
    }
    return;
  }
  assert.deepEqual(actual, expected, path);
}

const witness = String.raw`
import json, math
from sage.plot.contour_plot import ContourPlot, contour_plot, implicit_plot, region_plot
from sage.plot.density_plot import DensityPlot, density_plot
from sage.plot.plot_field import PlotField, plot_slope_field, plot_vector_field
from sagejs.plotting.field_layers import (
    contour_field_layer,
    lower_field_layer,
    normalize_scalar_field_options,
)
from sagejs.plotting.grid_sampling import (
    deterministic_levels,
    normalize_plot_points,
    sample_scalar_grid,
)

oracle = json.loads(${JSON.stringify(JSON.stringify(oracle))})
cases = oracle["cases"]

contour = contour_plot(
    lambda x, y: x + 2*y,
    (0, 2),
    (-1, 2),
    plot_points=(3, 4),
    contours=[-1, 0, 3],
    fill=False,
)
contour_layer = contour.layers[0]
assert contour_layer.id == "sage.field-0"
assert contour_layer.kind == "contour-field"
assert contour_layer.data["shape"] == [4, 3]
assert contour_layer.data["z"] == cases["affine_scalar_3_by_4"]["z"]
assert contour_layer.data["finite_mask"] == [[True]*3 for _ in range(4)]
assert contour_layer.data["levels"] == [-1.0, 0.0, 3.0]
assert contour_layer.metadata["resource"]["sample_count"] == 12
assert contour.provenance["frontend"] == "sage"
assert contour.provenance["constructor"] == "contour_plot"
assert len(lower_field_layer(contour_layer)) == 3
assert all(trace["type"] == "contour" for trace in lower_field_layer(contour_layer))
assert [trace["contours"]["start"] for trace in lower_field_layer(contour_layer)] == [-1.0, 0.0, 3.0]

density = density_plot(
    lambda x, y: x + 2*y, (0, 2), (-1, 2), plot_points=(3, 4)
)
density_layer = density.layers[0]
assert density_layer.data["z"] == cases["affine_scalar_3_by_4"]["z"]
density_trace = lower_field_layer(density_layer)[0]
assert density_trace["type"] == "heatmap"
assert density_trace["zsmooth"] == "best"
assert density_trace["colorscale"] == "Greys"

implicit = implicit_plot(
    lambda x, y: x*x + y*y - 1, (-1, 1), (-1, 1), plot_points=3
)
implicit_layer = implicit.layers[0]
assert implicit_layer.data["z"] == cases["circle_implicit_3_by_3"]["z"]
assert implicit_layer.data["levels"] == [0.0]
implicit_trace = lower_field_layer(implicit_layer)[0]
assert implicit_trace["contours"]["start"] == 0.0
assert implicit_trace["contours"]["end"] == 0.0
implicit_alias = implicit_plot(
    lambda x, y: x-y,
    (-1, 1),
    (-1, 1),
    plot_points=3,
    color="red",
    linewidth=2,
    linestyle="dashed",
)
assert implicit_alias.layers[0].style["colorscale"] == [[0.0, "red"], [1.0, "red"]]
assert implicit_alias.layers[0].style["line_width"] == 2.0
assert implicit_alias.layers[0].style["line_dash"] == "dash"

region = region_plot(
    [lambda x, y: x, lambda x, y: y], (-1, 1), (-1, 1), plot_points=3
)
region_layer = region.layers[0]
assert region_layer.data["z"] == cases["negative_intersection_region_3_by_3"]["z"]
assert lower_field_layer(region_layer)[0]["type"] == "contour"

vector = plot_vector_field(
    (lambda x, y: x + y, lambda x, y: x - y),
    (0, 2),
    (-1, 1),
    plot_points=3,
)
vector_layer = vector.layers[0]
vector_case = cases["affine_vector_3_by_3"]
def flatten_x_major(matrix):
    return [matrix[y][x] for x in range(len(matrix[0])) for y in range(len(matrix))]
assert flatten_x_major(vector_layer.data["u"]) == vector_case["u"]
assert flatten_x_major(vector_layer.data["v"]) == vector_case["v"]
assert vector_layer.data["maximum_magnitude"] == math.sqrt(10)
vector_trace = lower_field_layer(vector_layer)[0]
assert vector_trace["type"] == "scatter"
assert vector_trace["mode"] == "lines"
assert None in vector_trace["x"]
assert vector_layer.metadata["style_decisions"]["status"] == "translated"

slope = plot_slope_field(
    lambda x, y: x + y, (0, 2), (-1, 1), plot_points=3
)
slope_case = cases["affine_slope_3_by_3"]
for actual, expected in zip(flatten_x_major(slope.layers[0].data["u"]), slope_case["u"]):
    assert abs(actual - expected) <= max(1e-15, 1e-14 * abs(expected))
for actual, expected in zip(flatten_x_major(slope.layers[0].data["v"]), slope_case["v"]):
    assert abs(actual - expected) <= max(1e-15, 1e-14 * abs(expected))
assert slope.layers[0].style["pivot"] == "middle"

def with_holes(x, y):
    if x == 0 and y == 0:
        return float("nan")
    if x == -1 and y == -1:
        return float("inf")
    if x == 1 and y == 1:
        return 1 / 0
    return x - y

holes = sample_scalar_grid(with_holes, (-1, 1), (-1, 1), plot_points=3)
assert holes["sampling"]["finite_count"] == 6
assert holes["sampling"]["masked_count"] == 3
assert holes["z"][0][0] is None
assert holes["z"][1][1] is None
assert holes["z"][2][2] is None
assert holes["finite_mask"][1][1] is False
assert holes["sampling"]["masked_reasons"] == {
    "evaluation-error:ZeroDivisionError": 1,
    "non-finite": 2,
}
vector_holes = plot_vector_field(
    (
        lambda x, y: float("nan") if x == 0 and y == 0 else x,
        lambda x, y: float("inf") if x == 1 and y == 1 else y,
    ),
    (-1, 1),
    (-1, 1),
    plot_points=3,
)
vector_hole_data = vector_holes.layers[0].data
assert vector_hole_data["sampling"]["finite_count"] == 7
assert vector_hole_data["sampling"]["masked_count"] == 2
assert vector_hole_data["finite_mask"][1][1] is False
assert vector_hole_data["finite_mask"][2][2] is False
assert vector_hole_data["u"][2][2] is None
assert vector_hole_data["v"][1][1] is None
hole_layer = contour_field_layer(
    with_holes, (-1, 1), (-1, 1), options={"plot_points": 3}
)
from sagejs.plotting.field_layers import field_plot_spec
hole_spec = field_plot_spec(hole_layer)
assert [item.code for item in hole_spec.diagnostics] == [
    "PLOT_DATA_PARTIAL_NONFINITE",
    "PLOT_OPTION_TRANSLATED",
]

uniform = sample_scalar_grid(lambda x, y: x + y, (0, 1), (0, 1), plot_points=2)
assert deterministic_levels(uniform, 3) == [0.0, 1.0, 2.0]
assert deterministic_levels(uniform, [-2, 0, 5]) == [-2.0, 0.0, 5.0]
assert normalize_plot_points((3, 4), max_samples=12) == (3, 4)

failures = (
    lambda: normalize_plot_points(1),
    lambda: normalize_plot_points((3, 4), max_samples=11),
    lambda: deterministic_levels(uniform, [0, 0]),
    lambda: contour_plot(lambda x, y: x+y, (0, 1), (0, 1), mystery=True),
    lambda: contour_plot(lambda x, y: x+y, (0, 1), (0, 1), region=lambda x,y: x),
    lambda: contour_plot(lambda x, y: x+y, (0, 1), (0, 1), contours=[0, 1, 3], fill=True),
    lambda: density_plot(lambda x, y: x+y, (0, 1), (0, 1), interpolation="sinc"),
    lambda: plot_vector_field([lambda x,y:x], (0, 1), (0, 1)),
)
errors = []
for operation in failures:
    try:
        operation()
    except (TypeError, ValueError, NotImplementedError) as error:
        errors.append(type(error).__name__ + ":" + str(error))
assert len(errors) == len(failures)
assert any("no field-layer representation" in error for error in errors)
assert any("filled contours require uniformly spaced levels" in error for error in errors)

decisions = normalize_scalar_field_options("density", {"interpolation": "nearest"})
assert decisions["status"] == "translated"
assert decisions["value"]["zsmooth"] is False
unsupported_decisions = normalize_scalar_field_options(
    "density", {"interpolation": "sinc", "mystery": 5}, reject_unsupported=False
)
assert unsupported_decisions["status"] == "unsupported"
unsupported_names = [
    item["option"] for item in unsupported_decisions["options"]
    if item["status"] == "unsupported"
]
assert unsupported_names == ["mystery", "interpolation"]

primitive = ContourPlot([[1, 2], [3, 4]], (0, 2), (-1, 1), {"fill": True})
assert primitive.get_minmax_data() == {"xmin": 0.0, "xmax": 2.0, "ymin": -1.0, "ymax": 1.0}
assert DensityPlot([[1]], (0, 2), (-1, 1), {}).xy_array_row == 1
field_primitive = PlotField([0, 1], [-1, 2], [2, 3], [4, 5], {})
assert field_primitive.get_minmax_data() == {"xmin": 0.0, "xmax": 1.0, "ymin": -1.0, "ymax": 2.0}

print(json.dumps({
    "contour": contour_layer.to_dict(),
    "density": density_layer.to_dict(),
    "implicit": implicit_layer.to_dict(),
    "region": region_layer.to_dict(),
    "vector": vector_layer.to_dict(),
    "slope": slope.layers[0].to_dict(),
    "errors": errors,
}, sort_keys=True, separators=(",", ":")))
`;

test("Sage 2D field grids match pinned Sage and CPython semantics", () => {
  const cpython = runCPython(witness);
  const sagejs = runSagejs(witness);
  const parsed = JSON.parse(sagejs);
  assertEquivalent(parsed, JSON.parse(cpython));
  assert.equal(parsed.contour.kind, "contour-field");
  assert.equal(parsed.vector.kind, "vector-field");
  assert.equal(parsed.errors.length, 8);
});
