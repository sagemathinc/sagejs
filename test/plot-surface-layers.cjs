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
      "docs/sage-compatibility/plotting/oracle/surface-layers.json",
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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-surface-layers-"));
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
from sagejs.plotting import make_layer
from sagejs.plotting._json import canonical_json
from sagejs.plotting.surface_layers import (
    layer_payload,
    lower_3d_geometry_layer,
    lower_3d_geometry_payload,
    polygon_layer,
    rectangular_surface_layer,
    triangular_mesh_layer,
)

u = [0.0, 0.5, 1.0]
v = [0.0, 2.0 / 3.0, 4.0 / 3.0, 2.0]
x = [[uvalue for _vvalue in v] for uvalue in u]
y = [[vvalue for vvalue in v] for _uvalue in u]
z = [[uvalue + vvalue for vvalue in v] for uvalue in u]
surface = rectangular_surface_layer(
    x,
    y,
    z,
    ordinal=7,
    namespace="sage.surface",
    style={
        "color": "steelblue",
        "opacity": 0.75,
        "material": {
            "ambient": 0.65,
            "diffuse": 0.75,
            "specular": 0.2,
            "roughness": 0.7,
            "fresnel": 0.1,
        },
        "light_position": [100, 200, 300],
    },
    legend_label="x + y",
    source_intent={
        "frontend": "sage",
        "expression": "x + y",
        "ranges": [["x", 0, 1], ["y", 0, 2]],
        "sampling": {"plot_points": [3, 4]},
    },
)
assert surface.id == "sage.surface-7"
assert surface.kind == "surface"
assert surface.data["shape"] == [3, 4]
assert surface.metadata["resource"] == {
    "sample_count": 12,
    "triangle_count": 12,
}
assert surface.metadata["scene"]["bounds"] == {
    "x": [0.0, 1.0], "y": [0.0, 2.0], "z": [0.0, 3.0]
}
assert surface.metadata["scene"]["camera_target"] == [0.5, 1.0, 1.5]
assert surface.source_intent["expression"] == "x + y"
surface_trace = lower_3d_geometry_layer(surface)[0]
assert surface_trace["type"] == "surface"
assert surface_trace["colorscale"] == [[0, "steelblue"], [1, "steelblue"]]
assert surface_trace["lighting"]["roughness"] == 0.7
assert surface_trace["lightposition"] == {"x": 100.0, "y": 200.0, "z": 300.0}
assert surface_trace["showlegend"] is True
assert surface_trace["name"] == "x + y"
assert lower_3d_geometry_payload(layer_payload(surface)) == [surface_trace]

vertices = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
    [0, 1, 0],
]
mesh = triangular_mesh_layer(
    vertices,
    [[0, 1, 2], [0, 2, 3]],
    ordinal=2,
    style={"color": "blue", "face_colors": ["red", "green"]},
    source_intent={"frontend": "sage", "enclosed": False},
)
assert mesh.id == "layer-2"
assert mesh.metadata["scene"]["bounds"] == {
    "x": [0.0, 1.0], "y": [0.0, 1.0], "z": [0.0, 1.0]
}
mesh_trace = lower_3d_geometry_layer(mesh)[0]
assert mesh_trace["type"] == "mesh3d"
assert mesh_trace["i"] == [0, 0]
assert mesh_trace["j"] == [1, 2]
assert mesh_trace["k"] == [2, 3]
assert mesh_trace["facecolor"] == ["red", "green"]
assert "color" not in mesh_trace

polygon = polygon_layer(
    [(0, 0, 0), (2, 0, 0), (2, 1, 0), (0, 1, 0)],
    ordinal=4,
    style={"color": "red", "opacity": 0.5, "face_colors": ["red"]},
)
assert polygon.id == "layer-4"
assert polygon.data["triangles"] == [[0, 1, 2], [0, 2, 3]]
assert polygon.metadata["geometry"] == "convex-planar-polygon"
assert polygon.metadata["scene"]["degenerate_axes"] == ["z"]
polygon_trace = lower_3d_geometry_layer(polygon)[0]
assert polygon_trace["facecolor"] == ["red", "red"]
assert polygon_trace["opacity"] == 0.5

# Every failure here is an intentional capability boundary, not a fallback.
invalid = (
    lambda: rectangular_surface_layer(
        [[0, 1], [0]], [[0, 0], [1, 1]], [[0, 1], [1, 2]]
    ),
    lambda: rectangular_surface_layer(
        [[0, 1], [0, 1]], [[0, 0], [1, 1]], [[0, 1], [1, float("nan")]]
    ),
    lambda: rectangular_surface_layer(
        [[0, 1], [0, 1]], [[0, 0], [1, 1]], [[0, 1], [1, 2]], max_samples=3
    ),
    lambda: triangular_mesh_layer(vertices, [[0, 1, 2, 3]]),
    lambda: triangular_mesh_layer(vertices, [[0, 1, 9]]),
    lambda: triangular_mesh_layer([(0, 0, 0), (1, 0, 0), (2, 0, 0)], [[0, 1, 2]]),
    lambda: polygon_layer([(0, 0, 0), (1, 0, 0), (1, 1, 1), (0, 1, 0)]),
    lambda: polygon_layer([(0, 0, 0), (2, 0, 0), (1, 0.2, 0), (2, 1, 0), (0, 1, 0)]),
    lambda: polygon_layer([(0, 0, 0), (1, 1, 0), (0, 1, 0), (1, 0, 0)]),
    lambda: polygon_layer([(0, 0, 0), (1, 0, 0), (0, 1, 0)], style={"texture": "wood"}),
    lambda: polygon_layer([(0, 0, 0), (1, 0, 0), (0, 1, 0)], style={"material": {"shininess": 20}}),
    lambda: lower_3d_geometry_layer(
        surface.revise(data={"x": [[0, 1], [0, 1]], "y": [[0, 0], [1, 1]], "z": [[0, 1], [1, 2]], "shape": [9, 9]})
    ),
    lambda: lower_3d_geometry_layer(make_layer("raw-plotly", {"trace": {}})),
)
errors = []
for operation in invalid:
    try:
        operation()
    except (IndexError, TypeError, ValueError) as error:
        errors.append(str(error))
    else:
        raise AssertionError("unsupported 3D geometry was accepted")
assert len(errors) == len(invalid)

print(canonical_json({
    "surface": surface.to_dict(),
    "surface_trace": surface_trace,
    "mesh": mesh.to_dict(),
    "mesh_trace": mesh_trace,
    "polygon": polygon.to_dict(),
    "polygon_trace": polygon_trace,
    "errors": errors,
}))
`;

test("surface and mesh planning is differential across CPython and Sage.js", () => {
  const cpython = runCPython(witness);
  const sagejs = runSagejs(witness);
  assert.equal(sagejs, cpython);

  const result = JSON.parse(sagejs);
  assert.equal(result.surface.id, "sage.surface-7");
  assert.equal(result.surface.metadata.resource.sample_count, 12);
  assert.equal(result.surface_trace.type, "surface");
  assert.equal(result.mesh_trace.type, "mesh3d");
  assert.deepEqual(result.polygon.data.triangles, [[0, 1, 2], [0, 2, 3]]);
  assert.equal(result.errors.length, 13);
});

test("checked Sage 10.9 surface and indexed-face oracle stays pinned", () => {
  assert.equal(oracle.sage_version, "10.9.post1");
  assert.deepEqual(oracle.surface.parameter_grid, [
    [0, 0.5, 1],
    [0, 2 / 3, 4 / 3, 2],
  ]);
  assert.deepEqual(oracle.surface.bounds, [[0, 0, 0], [1, 2, 3]]);
  assert.deepEqual(oracle.mesh.index_faces, [[0, 1, 2], [0, 2, 3]]);
  assert.deepEqual(oracle.polygon.faces, [oracle.polygon.vertices]);
  assert.deepEqual(oracle.polygon.bounds, [[0, 0, 0], [2, 1, 0]]);
});
