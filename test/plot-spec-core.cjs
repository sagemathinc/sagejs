#!/usr/bin/env node
// sagejs-test-tier: integration
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
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const schema = JSON.parse(
  readFileSync(
    join(root, "docs/sage-compatibility/plotting/plotspec.schema.json"),
    "utf8",
  ),
);
const documentedDiagnostics = JSON.parse(
  readFileSync(
    join(root, "docs/sage-compatibility/plotting/diagnostics.json"),
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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-plotspec-"));
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
  const executable = pythonExecutable();
  const prefix = String.raw`
import collections.abc, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

function resolveSchema(rootSchema, candidate) {
  if (!candidate.$ref) return candidate;
  assert.match(candidate.$ref, /^#\//);
  return candidate.$ref
    .slice(2)
    .split("/")
    .reduce((value, key) => value[key], rootSchema);
}

function validateSchema(value, candidate, path = "$") {
  const definition = resolveSchema(schema, candidate);
  if (Object.hasOwn(definition, "const")) {
    assert.deepEqual(value, definition.const, `${path} violates const`);
  }
  if (definition.enum) {
    assert.ok(definition.enum.includes(value), `${path} violates enum`);
  }
  if (definition.type === "object") {
    assert.ok(
      value !== null && typeof value === "object" && !Array.isArray(value),
      `${path} must be an object`,
    );
    for (const key of definition.required || []) {
      assert.ok(Object.hasOwn(value, key), `${path}.${key} is required`);
    }
    if (definition.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        assert.ok(
          Object.hasOwn(definition.properties, key),
          `${path}.${key} is not allowed`,
        );
      }
    }
    for (const [key, propertySchema] of Object.entries(
      definition.properties || {},
    )) {
      if (Object.hasOwn(value, key)) {
        validateSchema(value[key], propertySchema, `${path}.${key}`);
      }
    }
  } else if (definition.type === "array") {
    assert.ok(Array.isArray(value), `${path} must be an array`);
    for (let index = 0; index < value.length; index += 1) {
      if (definition.items) {
        validateSchema(value[index], definition.items, `${path}[${index}]`);
      }
    }
    if (definition.uniqueItems) {
      assert.equal(
        new Set(value.map((item) => JSON.stringify(item))).size,
        value.length,
        `${path} items must be unique`,
      );
    }
  } else if (definition.type === "string") {
    assert.equal(typeof value, "string", `${path} must be a string`);
    if (definition.minLength !== undefined) {
      assert.ok(value.length >= definition.minLength, `${path} is too short`);
    }
    if (definition.pattern) {
      assert.match(value, new RegExp(definition.pattern), `${path} pattern`);
    }
  } else if (definition.type === "boolean") {
    assert.equal(typeof value, "boolean", `${path} must be a boolean`);
  }
}

const witness = String.raw`
import json
from sagejs.plotting import (
    Diagnostic,
    PlotSpec,
    Provenance,
    diagnostic_registry,
    make_layer,
    next_layer_id,
    stable_layer_id,
)

assert stable_layer_id(0) == "layer-0"
assert stable_layer_id(3, "wolfram.group") == "wolfram.group-3"
assert next_layer_id(["layer-0", "layer-2"]) == "layer-1"

line = make_layer(
    "line",
    {"x": (0, 1, 2), "y": [0.0, float("nan"), float("inf")]},
    ordinal=0,
    source_intent={"head": "Plot", "expression": "Sin[x]"},
    style={"color": "#3366cc", "width": 2},
    legend={"label": "sin(x)", "show": True},
    metadata={"group_path": [0, 1]},
)
source_coordinates = [10.0, float("nan"), 12.0]
detached_input = make_layer("line", {"x": source_coordinates, "y": (1, 2, 3)}, ordinal=9)
source_coordinates[0] = 99.0
assert detached_input.data == {"x": [10.0, None, 12.0], "y": [1, 2, 3]}
point = make_layer(
    "point",
    {"x": [1], "y": [2]},
    ordinal=1,
    visibility=False,
)
provenance = Provenance(
    "wolfram",
    source_language="Wolfram Language",
    constructor="Plot",
    source={"text": "Plot[Sin[x], {x, 0, 2}]", "span": [0, 27]},
    ranges=[{"variable": "x", "min": 0, "max": 2}],
    sampling={"method": "adaptive", "samples": 3},
    approximations=[{"kind": "sampling", "reason": "rendering"}],
    translation_events=[{"option": "PlotStyle", "result": "line.color"}],
    metadata={
        "ordered_options": [
            {"head": "Rule", "name": "PlotStyle", "value": "Blue"}
        ],
        "source_file": "agent-input.wl",
    },
)
diagnostic = Diagnostic(
    "PLOT_DATA_PARTIAL_NONFINITE",
    layer_ids=[line.id],
    details={"normalized_to": None, "count": 2},
)
spec = PlotSpec(
    2,
    [line, point],
    axes_or_scene={"x": {"label": "x"}, "y": {"label": "sin(x)"}},
    viewport={"responsive": True},
    provenance=provenance,
    diagnostics=[diagnostic],
    plotly_overrides={"layout": {"hovermode": "closest"}},
)

# Existing PlotLayer values are safe to reuse internally: all public
# container-valued accessors remain detached.
layer_view = spec.layers[0].data
layer_view["x"][0] = 88
assert spec.layers[0].data["x"][0] == 0

materialized = spec.to_dict()
assert materialized["layers"][0]["data"]["x"] == [0, 1, 2]
assert materialized["layers"][0]["data"]["y"] == [0.0, None, None]
assert PlotSpec.from_json(spec.to_json()).to_json() == spec.to_json()

# All container-valued public results are detached from internal state.
materialized["layers"][0]["data"]["x"][0] = 99
materialized["provenance"]["metadata"]["source_file"] = "changed"
assert spec.layers[0].data["x"][0] == 0
assert spec.provenance["metadata"]["source_file"] == "agent-input.wl"

for invalid in (
    lambda: PlotSpec(4),
    lambda: PlotSpec(2, [line, line]),
    lambda: PlotSpec(2, [line], diagnostics=[Diagnostic("PLOT_DATA_EMPTY", layer_ids=["missing"])]),
    lambda: make_layer("line", {"bad": object()}),
    lambda: Diagnostic("PLOT_UNKNOWN"),
):
    try:
        invalid()
    except (TypeError, ValueError):
        pass
    else:
        raise AssertionError("invalid PlotSpec input was accepted")

print(json.dumps({
    "spec": json.loads(spec.to_json()),
    "registry": diagnostic_registry(),
}, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
`;

test("PlotSpec is deterministic and differential across CPython and Sage.js", () => {
  const cpython = runCPython(witness);
  const sagejs = runSagejs(witness);
  assert.equal(sagejs, cpython);

  const result = JSON.parse(sagejs);
  validateSchema(result.spec, schema);
  assert.deepEqual(result.registry, documentedDiagnostics.diagnostics);
  assert.equal(result.spec.schema_version, 1);
  assert.deepEqual(
    result.spec.layers.map((layer) => layer.id),
    ["layer-0", "layer-1"],
  );
  assert.deepEqual(result.spec.layers[0].data.y, [0, null, null]);
});

test("checked PlotSpec schema and diagnostic registry remain synchronized", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schema_version.const, 1);
  assert.equal(documentedDiagnostics.schema_version, 1);

  const registryCodes = documentedDiagnostics.diagnostics.map(({ code }) => code);
  const schemaCodes = schema.$defs.diagnostic.properties.code.enum;
  assert.deepEqual(registryCodes, [...registryCodes].sort());
  assert.deepEqual(schemaCodes, registryCodes);
  assert.equal(new Set(registryCodes).size, registryCodes.length);
  for (const entry of documentedDiagnostics.diagnostics) {
    assert.match(entry.code, /^PLOT_[A-Z0-9_]+$/);
    assert.ok(["info", "warning", "error"].includes(entry.severity));
    assert.ok(entry.phase.length > 0);
    assert.ok(entry.message.length > 0);
    assert.ok(entry.suggested_repairs.length > 0);
  }
});

const performanceWitness = String.raw`
import json, time

count = 100000
points = [(float(index), float(index * index)) for index in range(count)]
graphic = line(points)
_ = graphic.spec()
spec_times = []
detach_times = []
for _ in range(3):
    start = time.perf_counter()
    spec = graphic.spec()
    middle = time.perf_counter()
    document = spec.to_dict()
    stop = time.perf_counter()
    spec_times.append(middle - start)
    detach_times.append(stop - middle)
assert len(document["layers"][0]["data"]["x"]) == count
print(json.dumps({
    "points": count,
    "spec_seconds": min(spec_times),
    "detach_seconds": min(detach_times),
}, sort_keys=True))
`;

test("100k-point Graphics.spec materialization remains bounded", () => {
  const result = JSON.parse(runSagejs(performanceWitness));
  assert.equal(result.points, 100_000);
  assert.ok(
    result.spec_seconds < 3,
    `100k-point Graphics.spec took ${result.spec_seconds}s`,
  );
  assert.ok(
    result.detach_seconds < 2,
    `100k-point PlotSpec.to_dict took ${result.detach_seconds}s`,
  );
});
