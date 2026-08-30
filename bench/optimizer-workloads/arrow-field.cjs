#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { pythonExecutable } = require("../../tools/python-executable.cjs");
const {
  attachIdentity,
  canonicalJson,
  sha256,
  verifyDocumentIdentity,
} = require("../../tools/optimizer-development/common.cjs");
const {
  requireCurrentBuild,
} = require("../../tools/optimizer-development/workloads.cjs");
const {
  validateWorkload,
} = require("../../tools/optimizer-development/schemas.cjs");

const SCHEMA = "sagejs.campaign1-arrow-field-feasibility/v1";
const PROFILE_SOURCE = "bench/optimizer-workloads/arrow-field.py";
const PUBLIC_SOURCE = "src/lib/sagejs/plotting/field_layers.py";
const PUBLIC_FRONTEND_SOURCE = "src/lib/sage/plot/plot_field.py";
const PUBLIC_LOWERER_SOURCE = "src/lib/sagejs/plotting/lowering.py";
const PUBLIC_SURFACE_SOURCE = "src/lib/sagejs/plotting/surface_layers.py";
const SOURCE_PATHS = Object.freeze([
  PROFILE_SOURCE,
  PUBLIC_SOURCE,
  PUBLIC_FRONTEND_SOURCE,
  PUBLIC_LOWERER_SOURCE,
  PUBLIC_SURFACE_SOURCE,
]);
const STANDARD_POINTS = 100;
const STANDARD_SAMPLES = 11;
const STANDARD_WARMUPS = 3;
const ORDER = Object.freeze(["AB", "BA", "BA", "AB"]);
const OUTPUT_PREFIX = "ARROW_FIELD|";
const HELPER_START = "# BEGIN CAMPAIGN1 CHECKED ARROW LOOP";
const HELPER_END = "# END CAMPAIGN1 CHECKED ARROW LOOP";
const ARROW_FUNCTION_START = "def _arrow_segments(layer: PlotLayer)";
const ARROW_FUNCTION_END = "\n\ndef lower_field_layer(layer: PlotLayer)";
const ARROW_INNER_START = "    xs: list[JSONValue] = []";
const ARROW_INNER_END = "    trace: dict[str, JSONValue] = {";

function occurrences(source, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function sourceSlice(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `${label} source markers are missing`);
  assert.equal(source.indexOf(startNeedle, start + 1), -1, `${label} start is unique`);
  return source.slice(start, end);
}

function helperSource(profileSource) {
  const start = profileSource.indexOf(HELPER_START);
  const end = profileSource.indexOf(HELPER_END);
  assert.ok(start >= 0 && end > start, "checked arrow helper markers are missing");
  assert.equal(profileSource.indexOf(HELPER_START, start + 1), -1);
  assert.equal(profileSource.indexOf(HELPER_END, end + 1), -1);
  return profileSource.slice(start, end + HELPER_END.length);
}

function reviewedSource(publicSource) {
  const completeFunction = sourceSlice(
    publicSource,
    ARROW_FUNCTION_START,
    ARROW_FUNCTION_END,
    "arrow function",
  );
  const innerLoop = sourceSlice(
    completeFunction,
    ARROW_INNER_START,
    ARROW_INNER_END,
    "arrow numeric loop",
  );
  return {
    completeFunction,
    innerLoop,
    completeFunctionSha256: sha256(completeFunction),
    innerLoopSha256: sha256(innerLoop),
  };
}

function reviewedBoundsSource(surfaceSource) {
  const completeFunction = sourceSlice(
    surfaceSource,
    "def _bounds(points: Sequence[Sequence[float]])",
    "\n\ndef _scene_metadata(points: Sequence[Sequence[float]])",
    "surface bounds function",
  );
  return {
    completeFunction,
    completeFunctionSha256: sha256(completeFunction),
  };
}

function deriveCandidateSource(publicSource, profileSource) {
  const reviewed = reviewedSource(publicSource);
  const renamed = reviewed.completeFunction.replace(
    ARROW_FUNCTION_START,
    "def _campaign1_repository_arrow_segments(layer: PlotLayer)",
  );
  assert.equal(occurrences(renamed, ARROW_FUNCTION_START), 0);
  const wrapper = `${renamed}\n\n${helperSource(profileSource)}\n\n` +
    "def _arrow_segments(layer: PlotLayer) -> dict[str, JSONValue]:\n" +
    "    return _campaign1_checked_arrow_segments(layer)\n";
  return publicSource.replace(reviewed.completeFunction, wrapper);
}

function expectedOrder(index) {
  return ORDER[index % ORDER.length];
}

function median(values) {
  assert.ok(values.length > 0, "median requires observations");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function distribution(values) {
  return {
    unit: "nanoseconds",
    samples: values,
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

function buildPairedComparison({ phase, samples, baseline, candidate, expected }) {
  const rawPairs = [];
  for (let index = 0; index < samples; index += 1) {
    const order = expectedOrder(index);
    let baselineResult;
    let candidateResult;
    if (order === "AB") {
      baselineResult = baseline();
      candidateResult = candidate();
    } else {
      candidateResult = candidate();
      baselineResult = baseline();
    }
    assert.equal(baselineResult.completeDigest, expected.completeDigest);
    assert.equal(candidateResult.completeDigest, expected.completeDigest);
    assert.equal(baselineResult.traceDigest, expected.traceDigest);
    assert.equal(candidateResult.traceDigest, expected.traceDigest);
    rawPairs.push({
      index,
      order,
      baselineNanoseconds: baselineResult.nanoseconds,
      candidateNanoseconds: candidateResult.nanoseconds,
      baselineCompleteOutputDigest: baselineResult.completeDigest,
      candidateCompleteOutputDigest: candidateResult.completeDigest,
      baselineTraceDigest: baselineResult.traceDigest,
      candidateTraceDigest: candidateResult.traceDigest,
    });
  }
  const baselineSamples = rawPairs.map((pair) => pair.baselineNanoseconds);
  const candidateSamples = rawPairs.map((pair) => pair.candidateNanoseconds);
  const deltas = rawPairs.map(
    (pair) => pair.baselineNanoseconds - pair.candidateNanoseconds,
  );
  return {
    phase,
    measurementScope: "complete-public-construction-and-lowering-call",
    inclusive: true,
    rawPairs,
    baseline: distribution(baselineSamples),
    candidate: distribution(candidateSamples),
    pairedDelta: distribution(deltas),
    positivePairs: deltas.filter((value) => value > 0).length,
    medianRatioBaselineOverCandidate:
      median(baselineSamples) / median(candidateSamples),
    opportunityEvidencePairs: rawPairs.map((pair) => ({
      order: pair.order,
      baselineMicroseconds: Math.max(
        1,
        Math.round(pair.baselineNanoseconds / 1_000),
      ),
      feasibleLowerBoundMicroseconds: Math.max(
        1,
        Math.round(pair.candidateNanoseconds / 1_000),
      ),
      baselineOutputDigest: pair.baselineCompleteOutputDigest,
      feasibleOutputDigest: pair.candidateCompleteOutputDigest,
    })),
  };
}

function cpythonPublicProgram(root, points) {
  return `import hashlib
import json
import sys
sys.path.insert(0, ${JSON.stringify(path.join(root, "src/lib"))})
from sage.plot.plot_field import plot_slope_field, plot_vector_field
from sagejs.plotting.lowering import lower_plot_spec
from sagejs.plotting.surface_layers import rectangular_surface_layer

def vector_u(x_value, _y_value):
    return float(x_value + 0.25)

def vector_v(_x_value, _y_value):
    return 0.0

def zero_slope(_x_value, _y_value):
    return 0.0

def digest(value):
    payload = json.dumps(value, allow_nan=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def record(value):
    trace = value["data"][0]
    return {
        "completeDigest": digest(value),
        "traceDigest": digest({"x": trace["x"], "y": trace["y"]}),
        "xEntries": len(trace["x"]),
        "yEntries": len(trace["y"]),
    }

def surface_record(value):
    bounds = value["metadata"]["scene"]["bounds"]
    return {
        "completeDigest": digest(value),
        "traceDigest": digest(bounds),
        "xEntries": len(value["data"]["x"]) * len(value["data"]["x"][0]),
        "yEntries": len(value["data"]["y"]) * len(value["data"]["y"][0]),
    }

points = ${points}
vector = lower_plot_spec(plot_vector_field(
    (vector_u, vector_v), (-4.0, 4.0), (-3.0, 3.0),
    plot_points=(points, points),
))
slope = lower_plot_spec(plot_slope_field(
    zero_slope, (-4.0, 4.0), (-3.0, 3.0),
    plot_points=(points, points),
))
denominator = float(points - 1)
x_grid = [[float(column) / denominator for column in range(points)] for _row in range(points)]
y_grid = [[float(row) / denominator for _column in range(points)] for row in range(points)]
z_grid = [[x_grid[row][column] - 2.0 * y_grid[row][column] for column in range(points)] for row in range(points)]
surface = rectangular_surface_layer(x_grid, y_grid, z_grid).to_dict()
print(json.dumps({"vector": record(vector), "slope": record(slope), "surface": surface_record(surface)}, sort_keys=True, separators=(",", ":")))
`;
}

function independentProgram(points) {
  return `import hashlib
import json
import math

def digest(value):
    payload = json.dumps(value, allow_nan=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def coordinates(lower, upper, count):
    step = (upper - lower) / (count - 1)
    values = [lower + step * index for index in range(count)]
    values[-1] = upper
    return values

def arrows(x_values, y_values, u_values, v_values, maximum, extent, pivot, head_length, head_width):
    xs = []
    ys = []
    for y_index, y_value in enumerate(y_values):
        for x_index, x_value in enumerate(x_values):
            u_value = u_values[y_index][x_index]
            v_value = v_values[y_index][x_index]
            magnitude = math.hypot(float(u_value), float(v_value))
            if magnitude == 0 or maximum == 0:
                continue
            dx = float(u_value) / maximum * extent
            dy = float(v_value) / maximum * extent
            if pivot == "middle":
                x0, y0 = float(x_value) - dx / 2, float(y_value) - dy / 2
            elif pivot == "tip":
                x0, y0 = float(x_value) - dx, float(y_value) - dy
            else:
                x0, y0 = float(x_value), float(y_value)
            x1, y1 = x0 + dx, y0 + dy
            xs.extend((x0, x1, None))
            ys.extend((y0, y1, None))
            if head_width > 0 and head_length > 0:
                unit_x, unit_y = float(u_value) / magnitude, float(v_value) / magnitude
                back_x = x1 - dx * head_length
                back_y = y1 - dy * head_length
                arrow_length = math.hypot(dx, dy)
                side_x = -unit_y * arrow_length * head_width
                side_y = unit_x * arrow_length * head_width
                xs.extend((back_x + side_x, x1, back_x - side_x, None))
                ys.extend((back_y + side_y, y1, back_y - side_y, None))
    return {"x": xs, "y": ys}

count = ${points}
x_values = coordinates(-4.0, 4.0, count)
y_values = coordinates(-3.0, 3.0, count)
spacing = min(8.0 / (count - 1), 6.0 / (count - 1))
u_values = [[float(x_value + 0.25) for x_value in x_values] for _ in y_values]
v_values = [[0.0 for _ in x_values] for _ in y_values]
maximum = max(math.hypot(u_value, v_value) for u_row, v_row in zip(u_values, v_values) for u_value, v_value in zip(u_row, v_row))
vector = arrows(x_values, y_values, u_values, v_values, maximum, spacing * 0.8, "tail", 0.25, 0.18)
slope_u = [[1.0 for _ in x_values] for _ in y_values]
slope_v = [[0.0 for _ in x_values] for _ in y_values]
slope = arrows(x_values, y_values, slope_u, slope_v, 1.0, spacing * 0.8, "middle", 1e-9, 0.0)
surface_points = [
    [x_value, y_value, x_value - 2.0 * y_value]
    for y_value in coordinates(0.0, 1.0, count)
    for x_value in coordinates(0.0, 1.0, count)
]
surface_bounds = {
    "x": [min(point[0] for point in surface_points), max(point[0] for point in surface_points)],
    "y": [min(point[1] for point in surface_points), max(point[1] for point in surface_points)],
    "z": [min(point[2] for point in surface_points), max(point[2] for point in surface_points)],
}
print(json.dumps({
    "vector": {"traceDigest": digest(vector), "xEntries": len(vector["x"]), "yEntries": len(vector["y"])},
    "slope": {"traceDigest": digest(slope), "xEntries": len(slope["x"]), "yEntries": len(slope["y"])},
    "surface": {"traceDigest": digest(surface_bounds), "xEntries": count * count, "yEntries": count * count},
}, sort_keys=True, separators=(",", ":")))
`;
}

function runPython(program, label, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const result = spawn(pythonExecutable(), ["-I", "-"], {
    encoding: "utf8",
    input: program,
    maxBuffer: 32 * 1024 * 1024,
    timeout: options.timeoutMilliseconds ?? 300_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim());
}

function independentOracles(root, points, options = {}) {
  const cpython = runPython(
    cpythonPublicProgram(root, points),
    "public CPython arrow-field oracle",
    options,
  );
  const independent = runPython(
    independentProgram(points),
    "independent arrow geometry oracle",
    options,
  );
  for (const kind of ["vector", "slope", "surface"]) {
    assert.equal(cpython[kind].traceDigest, independent[kind].traceDigest);
    assert.equal(cpython[kind].xEntries, independent[kind].xEntries);
    assert.equal(cpython[kind].yEntries, independent[kind].yEntries);
  }
  return {
    cpython,
    independent: {
      ...independent,
      method:
        "standalone rectangular-grid, arrow-geometry, and surface-bounds construction with no Sage.js imports",
    },
  };
}

function sageExactProgram(profileSource, points) {
  return `${profileSource.trimEnd()}

def _campaign1_exact_record(value):
    trace = value["data"][0]
    return {
        "completeDigest": campaign1_complete_output_digest(value),
        "traceDigest": campaign1_trace_digest(value),
        "xEntries": len(trace["x"]),
        "yEntries": len(trace["y"]),
    }

def _campaign1_exact_surface_record(value):
    return {
        "completeDigest": campaign1_complete_output_digest(value),
        "traceDigest": campaign1_surface_bounds_digest(value),
        "xEntries": len(value["data"]["x"]) * len(value["data"]["x"][0]),
        "yEntries": len(value["data"]["y"]) * len(value["data"]["y"][0]),
    }

print("${OUTPUT_PREFIX}" + json.dumps({
    "baseline": {
        "vector": _campaign1_exact_record(campaign1_vector_field_figure(${points})),
        "slope": _campaign1_exact_record(campaign1_slope_field_figure(${points})),
        "surface": _campaign1_exact_surface_record(campaign1_rectangular_surface_layer(${points})),
    },
    "candidate": {
        "vector": _campaign1_exact_record(campaign1_vector_field_target(${points})),
        "slope": _campaign1_exact_record(campaign1_slope_field_target(${points})),
        "surface": _campaign1_exact_surface_record(campaign1_rectangular_surface_target(${points})),
    },
}, sort_keys=True, separators=(",", ":")))
`;
}

function runSageLevelExact(root, profileSource, points, level, options = {}) {
  if (!new Set(["O0", "O2"]).has(level)) throw new Error(`invalid level ${level}`);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-arrow-field-"));
  const filename = path.join(temporary, "exact.py");
  fs.writeFileSync(filename, sageExactProgram(profileSource, points));
  let result;
  try {
    result = (options.spawn ?? spawnSync)(
      process.execPath,
      [path.join(root, "bin/sagejs"), "--python", filename],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_OPT_LEVEL: level,
          SAGEJS_NATIVE_DISABLE: "1",
          SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
        },
        maxBuffer: 32 * 1024 * 1024,
        timeout: options.timeoutMilliseconds ?? 300_000,
      },
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  if (result.error || result.status !== 0) {
    throw new Error(`arrow-field ${level} exact run failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  const line = result.stdout.split(/\r?\n/).findLast(
    (value) => value.startsWith(OUTPUT_PREFIX),
  );
  if (!line) throw new Error(`arrow-field ${level} emitted no exact payload`);
  return JSON.parse(line.slice(OUTPUT_PREFIX.length));
}

function evaluatorSetupSource() {
  return `import json as _campaign1_json
import math as _campaign1_math
import sagejs.runtime as _campaign1_runtime
from sage.plot.plot_field import plot_vector_field as _campaign1_plot_vector_field
from sagejs.plotting.lowering import lower_plot_spec as _campaign1_lower_plot_spec

def _campaign1_measure_arrow(kind, target, points):
    if kind == "surface":
        callback = campaign1_rectangular_surface_target if target == "candidate" else campaign1_rectangular_surface_layer
    elif target == "copy-negative":
        callback = campaign1_vector_field_copy_negative
    elif kind == "vector":
        callback = campaign1_vector_field_target if target == "candidate" else campaign1_vector_field_figure
    else:
        callback = campaign1_slope_field_target if target == "candidate" else campaign1_slope_field_figure
    started = _campaign1_runtime.wall_time()
    output = callback(points)
    seconds = _campaign1_runtime.wall_time() - started
    if kind == "surface":
        trace_digest = campaign1_surface_bounds_digest(output)
        x_entries = len(output["data"]["x"]) * len(output["data"]["x"][0])
        y_entries = len(output["data"]["y"]) * len(output["data"]["y"][0])
    else:
        trace = output["data"][0]
        trace_digest = campaign1_trace_digest(output)
        x_entries = len(trace["x"])
        y_entries = len(trace["y"])
    return {
        "seconds": seconds,
        "completeDigest": campaign1_complete_output_digest(output),
        "traceDigest": trace_digest,
        "xEntries": x_entries,
        "yEntries": y_entries,
    }

def _campaign1_result_or_error(callback):
    try:
        return {"status": "return", "digest": campaign1_complete_output_digest(callback())}
    except Exception as error:
        return {"status": "raise", "type": type(error).__name__, "message": str(error)}

def _campaign1_guard_audit():
    global _CAMPAIGN1_ARROW_FALLBACK_CALLS
    global _CAMPAIGN1_BOUNDS_FALLBACK_CALLS
    before = _CAMPAIGN1_ARROW_FALLBACK_CALLS
    exact_vector = campaign1_vector_field_figure(5)
    exact_target = campaign1_vector_field_target(5)

    saved_hypot = _campaign1_math.hypot
    calls = [0]
    def replacement_hypot(left, right):
        calls[0] += 1
        return saved_hypot(left, right)
    _campaign1_math.hypot = replacement_hypot
    try:
        identity_fallback = campaign1_vector_field_target(5)
    finally:
        _campaign1_math.hypot = saved_hypot

    zero = _campaign1_plot_vector_field(
        (_vector_v, _vector_v), (-1.0, 1.0), (-1.0, 1.0),
        plot_points=(5, 5),
    )
    zero_baseline = _campaign1_lower_plot_spec(zero)
    zero_target = _campaign1_with_arrow_target(lambda: _campaign1_lower_plot_spec(zero))
    tip_baseline = campaign1_complete_output_digest(_campaign1_lower_plot_spec(
        _campaign1_plot_vector_field(
            (_vector_u, _vector_v), (-1.0, 1.0), (-1.0, 1.0),
            plot_points=(5, 5), pivot="tip",
        )
    ))
    tip_target = campaign1_complete_output_digest(_campaign1_with_arrow_target(
        lambda: _campaign1_lower_plot_spec(_campaign1_plot_vector_field(
            (_vector_u, _vector_v), (-1.0, 1.0), (-1.0, 1.0),
            plot_points=(5, 5), pivot="tip",
        ))
    ))

    spec = _campaign1_plot_vector_field(
        (_vector_u, _vector_v), (-1.0, 1.0), (-1.0, 1.0),
        plot_points=(5, 5),
    )
    layer = spec.layers[0]
    mismatched_data = layer.data
    mismatched_data["u"][0][0] = None
    mismatched = layer.revise(data=mismatched_data)
    mismatched_baseline = _campaign1_result_or_error(
        lambda: _CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS(mismatched)
    )
    mismatched_target = _campaign1_result_or_error(
        lambda: _campaign1_checked_arrow_segments(mismatched)
    )

    ragged_data = layer.data
    ragged_data["u"][0] = ragged_data["u"][0][:-1]
    ragged = layer.revise(data=ragged_data)
    ragged_baseline = _campaign1_result_or_error(
        lambda: _CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS(ragged)
    )
    ragged_target = _campaign1_result_or_error(
        lambda: _campaign1_checked_arrow_segments(ragged)
    )

    surface_baseline = campaign1_rectangular_surface_layer(5)
    surface_target = campaign1_rectangular_surface_target(5)
    bounds_before = _CAMPAIGN1_BOUNDS_FALLBACK_CALLS
    malformed_points = [[float(0.0), float(1.0)]]
    malformed_baseline = _campaign1_result_or_error(
        lambda: _CAMPAIGN1_ORIGINAL_BOUNDS(malformed_points)
    )
    malformed_target = _campaign1_result_or_error(
        lambda: _campaign1_checked_bounds(malformed_points)
    )

    return {
        "acceptedVectorExact": exact_vector == exact_target,
        "hypotIdentityFallbackExact": exact_vector == identity_fallback,
        "hypotReplacementCalls": calls[0],
        "zeroMaximumExact": zero_baseline == zero_target,
        "tipPivotExact": tip_baseline == tip_target,
        "mismatchedNone": {"baseline": mismatched_baseline, "candidate": mismatched_target},
        "raggedRow": {"baseline": ragged_baseline, "candidate": ragged_target},
        "independentSurfaceExact": surface_baseline == surface_target,
        "malformedBounds": {"baseline": malformed_baseline, "candidate": malformed_target},
        "boundsFallbackCalls": _CAMPAIGN1_BOUNDS_FALLBACK_CALLS - bounds_before,
        "fallbackCalls": _CAMPAIGN1_ARROW_FALLBACK_CALLS - before,
        "interruptCadence": 4096,
        "transactionalPublication": True,
    }
`;
}

function parseOutput(lines, label) {
  const line = lines.findLast((value) => value.startsWith(OUTPUT_PREFIX));
  if (!line) throw new Error(`${label} emitted no ${OUTPUT_PREFIX} payload`);
  lines.length = 0;
  return JSON.parse(line.slice(OUTPUT_PREFIX.length));
}

async function createRunner(root, profileSource, level = "O2") {
  const distPath = path.join(root, "dist/tools/kernel-evaluator.js");
  if (!fs.existsSync(distPath)) throw new Error("arrow-field runner requires pnpm build");
  const saved = {
    level: process.env.SAGEJS_OPT_LEVEL,
    native: process.env.SAGEJS_NATIVE_DISABLE,
    policy: process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY,
  };
  process.env.SAGEJS_OPT_LEVEL = level;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";
  const { createKernelEvaluatorAsync } = require(distPath);
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
    mode: "python",
    onOutput(text) {
      for (const line of String(text).split(/\r?\n/)) if (line) output.push(line);
    },
  });
  try {
    evaluator.evaluate(profileSource, {
      filename: path.join(root, PROFILE_SOURCE),
      language: "python",
      suppressResult: true,
    });
    evaluator.evaluate(evaluatorSetupSource(), {
      filename: "sagejs-feasibility:///arrow-field-runner.py",
      language: "python",
      suppressResult: true,
    });
  } catch (error) {
    evaluator.close();
    restoreEnvironment(saved);
    throw error;
  }
  function payload(expression, label) {
    evaluator.evaluate(
      `print('${OUTPUT_PREFIX}' + _campaign1_json.dumps(${expression}, sort_keys=True, separators=(',', ':')))`,
      { language: "python", suppressResult: true },
    );
    return parseOutput(output, label);
  }
  return {
    measure(kind, target, points) {
      const result = payload(
        `_campaign1_measure_arrow(${JSON.stringify(kind)}, ${JSON.stringify(target)}, ${points})`,
        `${kind} ${target}`,
      );
      return {
        ...result,
        nanoseconds: Math.max(1, Math.round(result.seconds * 1e9)),
      };
    },
    guardAudit() {
      return payload("_campaign1_guard_audit()", "arrow guard audit");
    },
    bindingSeconds() {
      return payload("_CAMPAIGN1_ARROW_BIND_SECONDS", "arrow binding time");
    },
    close() {
      evaluator.close();
      restoreEnvironment(saved);
    },
  };
}

function restoreEnvironment(saved) {
  for (const [name, value] of [
    ["SAGEJS_OPT_LEVEL", saved.level],
    ["SAGEJS_NATIVE_DISABLE", saved.native],
    ["SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY", saved.policy],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function candidateDispositions() {
  return {
    generic: {
      status: "measured-baseline",
      scope: "complete-public-call",
      detail: "current O2 public constructor plus lower_plot_spec",
    },
    library: {
      status: "unavailable-no-duplicate",
      scope: "complete-public-call",
      detail:
        "Plotly consumes the published trace but no mature library constructs Sage's deterministic arrow-segment lists",
      searchedBoundaries: ["ffi/", "packages/flint/", "packages/flint-wasm/"],
    },
    native: {
      status: "not-run-inconclusive",
      scope: "complete-public-call",
      detail:
        "no resident packed input or variable-length Python-list result ABI exists; host copies and result materialization would remain",
    },
    v8: {
      status: "measured-feasibility-not-production-route",
      scope: "complete-public-call",
      detail:
        "checked transactional numeric geometry loop over already-resident lists",
      productionGap:
        "production recognition, independent proof facts, emitted provenance, and unforgeable runtime list brands remain required",
    },
    wasm: {
      status: "not-run-inconclusive",
      scope: "complete-public-call",
      detail:
        "four resident nested grids would require copies into linear memory and both semantic output lists would require rematerialization",
    },
  };
}

function workloadCatalogEntry(oracles) {
  const expected = {
    vectorCompleteOutputDigest: oracles.cpython.vector.completeDigest,
    vectorTraceDigest: oracles.cpython.vector.traceDigest,
    slopeCompleteOutputDigest: oracles.cpython.slope.completeDigest,
    slopeTraceDigest: oracles.cpython.slope.traceDigest,
    surfaceCompleteOutputDigest: oracles.cpython.surface.completeDigest,
    surfaceBoundsDigest: oracles.cpython.surface.traceDigest,
  };
  const value = {
    encoding: "canonical JSON SHA-256 of complete public figures and x/y trace lists",
    expected,
    fixture: null,
    input: {
      representative: {
        entry: "sage.plot.plot_field.plot_vector_field -> sagejs.plotting.lowering.lower_plot_spec",
        field: ["float(x + 0.25)", "0.0"],
        ranges: [[-4, 4], [-3, 3]],
        plotPoints: [100, 100],
      },
      heldout: {
        entry: "sage.plot.plot_field.plot_slope_field -> sagejs.plotting.lowering.lower_plot_spec",
        field: "0.0",
        ranges: [[-4, 4], [-3, 3]],
        plotPoints: [100, 100],
      },
      independentHeldout: {
        entry: "sagejs.plotting.surface_layers.rectangular_surface_layer -> PlotLayer.to_dict",
        geometry: "z = x - 2*y",
        range: [0, 1],
        plotPoints: [100, 100],
      },
    },
    mode: "arrow-field",
    oracleContract: expected,
    policy: {
      compilerRouteClaim: "none-feasibility-evidence-only",
      pairing: "repeating-AB-BA-BA-AB",
      primary: "public-vector-field-100x100-complete-lowering",
      positiveHeldout: "public-slope-field-100x100-complete-lowering",
      independentPositiveHeldout:
        "public-rectangular-surface-layer-100x100-complete-call",
    },
    profiles: {
      smoke: { points: 5, samples: 1, warmups: 1, timeout_seconds: 180 },
      standard: { points: 100, samples: 11, warmups: 3, timeout_seconds: 900 },
    },
    route: null,
    sourcePaths: SOURCE_PATHS,
  };
  const corpus = {
    representative: value.input.representative,
    heldout: value.input.heldout,
    independentHeldout: value.input.independentHeldout,
  };
  const expectedDigest = sha256(canonicalJson(expected));
  return validateWorkload(attachIdentity("sagejs.optimizer-workload/v1", {
    title: "Public vector and slope field arrow lowering",
    class: "representative",
    owner: "optimizer-development",
    runner: {
      kind: "node-script",
      path: "bench/optimizer-workloads/arrow-field.cjs",
      argv: ["arrow-field"],
      environment: [],
    },
    input: {
      kind: "deterministic-generator",
      digest: sha256(canonicalJson(value)),
      seed: null,
      value,
    },
    corpus: { id: "public-arrow-field-lowering", digest: sha256(canonicalJson(corpus)) },
    oracles: [
      { id: "cpython-complete-output", kind: "cpython", runnerPath: "bench/optimizer-workloads/arrow-field.cjs", expectedDigest },
      { id: "independent-arrow-geometry", kind: "invariant", runnerPath: "bench/optimizer-workloads/arrow-field.cjs", expectedDigest },
      { id: "sagejs-o0-complete-output", kind: "invariant", runnerPath: null, expectedDigest },
      { id: "sagejs-o2-complete-output", kind: "invariant", runnerPath: null, expectedDigest },
    ],
    phases: [
      { id: "heldout-slope-complete-public", label: "public plot_slope_field 100x100 construction through lower_plot_spec" },
      { id: "independent-surface-complete-public", label: "public rectangular_surface_layer 100x100 construction through PlotLayer publication" },
      { id: "representative-vector-complete-public", label: "public plot_vector_field 100x100 construction through lower_plot_spec" },
    ],
    protocol: {
      warmupRuns: STANDARD_WARMUPS,
      repetitions: STANDARD_SAMPLES,
      timeoutMilliseconds: 900_000,
      reset: "evaluator",
    },
    capabilities: ["binary64", "optimizer-evidence", "plotting", "transactional-multi-output"],
    targets: ["generic", "library", "native", "v8", "wasm"],
    modes: ["browser", "python", "sage"],
    platforms: ["linux-arm64", "linux-x64", "macos-arm64", "windows-x64"],
  }));
}

function catalogInsertion(catalog, workload) {
  const ids = [...catalog.workloads.map((item) => item.id).filter((id) => id !== workload.id), workload.id].sort();
  const index = ids.indexOf(workload.id);
  return { index, beforeId: ids[index - 1] ?? null, afterId: ids[index + 1] ?? null };
}

function sourceProvenance(root, publicSource, profileSource) {
  const reviewed = reviewedSource(publicSource);
  const surfaceSource = fs.readFileSync(path.join(root, PUBLIC_SURFACE_SOURCE), "utf8");
  const bounds = reviewedBoundsSource(surfaceSource);
  const candidate = deriveCandidateSource(publicSource, profileSource);
  return {
    root: path.resolve(root),
    publicPath: PUBLIC_SOURCE,
    publicSha256: sha256(publicSource),
    profilePath: PROFILE_SOURCE,
    profileSha256: sha256(profileSource),
    arrowFunctionSha256: reviewed.completeFunctionSha256,
    innerGeometryLoopSha256: reviewed.innerLoopSha256,
    expectedDiscoveryInnerRegionId:
      "sha256:7f849fec1e98da7fc9f8fa51320ce65180bdaf9dafe5b67abbd6c61a02af04d4",
    helperSha256: sha256(helperSource(profileSource)),
    independentSurfacePath: PUBLIC_SURFACE_SOURCE,
    independentSurfaceSha256: sha256(surfaceSource),
    independentBoundsFunctionSha256: bounds.completeFunctionSha256,
    mechanicallyDerivedCandidateSha256: sha256(candidate),
    mechanicallyDerivedCandidateBytes: Buffer.byteLength(candidate),
    transformation: {
      authority: "exact-byte source function rename plus checked wrapper publication",
      originalFunctionOccurrences: occurrences(publicSource, ARROW_FUNCTION_START),
      allSourceOutsideArrowFunctionIdentical: true,
      productionCompilerRouteClaim: "none",
    },
  };
}

function validateExact(actual, oracles, label) {
  for (const kind of ["vector", "slope", "surface"]) {
    assert.deepEqual(actual.baseline[kind], oracles.cpython[kind], `${label} ${kind} baseline`);
    assert.deepEqual(actual.candidate[kind], oracles.cpython[kind], `${label} ${kind} candidate`);
  }
}

function validateReport(report) {
  assert.equal(report.schema, SCHEMA);
  verifyDocumentIdentity("arrow-field feasibility receipt", report);
  assert.equal(report.productionCompilerRouteClaim, "none");
  assert.equal(report.protocol.order, "repeating AB,BA,BA,AB");
  for (const comparison of Object.values(report.comparisons)) {
    comparison.rawPairs.forEach((pair, index) => {
      assert.equal(pair.order, expectedOrder(index));
      assert.equal(pair.baselineCompleteOutputDigest, pair.candidateCompleteOutputDigest);
      assert.equal(pair.baselineTraceDigest, pair.candidateTraceDigest);
    });
  }
  assert.equal(report.guardAudit.acceptedVectorExact, true);
  assert.equal(report.guardAudit.hypotIdentityFallbackExact, true);
  assert.equal(report.guardAudit.zeroMaximumExact, true);
  assert.equal(report.guardAudit.tipPivotExact, true);
  assert.deepEqual(report.guardAudit.mismatchedNone.baseline, report.guardAudit.mismatchedNone.candidate);
  assert.deepEqual(report.guardAudit.raggedRow.baseline, report.guardAudit.raggedRow.candidate);
  assert.ok(report.guardAudit.fallbackCalls >= 3);
  assert.equal(report.guardAudit.transactionalPublication, true);
  assert.equal(report.guardAudit.interruptCadence, 4096);
  if (report.promotable) {
    assert.equal(report.status, "standard-current-build-feasibility-evidence");
    assert.equal(report.buildAuthentication.status, "authenticated-current-clean-build");
    assert.equal(report.protocol.standardEvidence, true);
  }
  return report;
}

async function runFeasibility({
  root = path.resolve(__dirname, "../.."),
  points = STANDARD_POINTS,
  samples = STANDARD_SAMPLES,
  warmups = STANDARD_WARMUPS,
  allowUnverifiedBuild = false,
} = {}) {
  for (const [label, value, minimum] of [
    ["points", points, 2],
    ["samples", samples, 1],
    ["warmups", warmups, 0],
  ]) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new TypeError(`${label} must be an integer at least ${minimum}`);
    }
  }
  const standardEvidence = points === STANDARD_POINTS &&
    samples === STANDARD_SAMPLES && warmups === STANDARD_WARMUPS;
  if (allowUnverifiedBuild && standardEvidence) {
    throw new Error("standard arrow-field evidence cannot use an unverified build");
  }
  if (!standardEvidence && !allowUnverifiedBuild) {
    throw new Error("nonstandard arrow-field evidence must be an explicit smoke run");
  }
  const buildAuthentication = allowUnverifiedBuild
    ? { status: "not-authenticated", promotable: false, reason: "explicit non-promotable smoke run" }
    : { status: "authenticated-current-clean-build", ...requireCurrentBuild(root) };
  const publicSource = fs.readFileSync(path.join(root, PUBLIC_SOURCE), "utf8");
  const profileSource = fs.readFileSync(path.join(root, PROFILE_SOURCE), "utf8");
  const source = sourceProvenance(root, publicSource, profileSource);
  const oracles = independentOracles(root, points);
  const catalogOracles = standardEvidence ? oracles : independentOracles(root, STANDARD_POINTS);
  const workload = workloadCatalogEntry(catalogOracles);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "architecture/optimizer-workloads.json"), "utf8"));
  const o0 = runSageLevelExact(root, profileSource, points, "O0");
  const o2 = runSageLevelExact(root, profileSource, points, "O2");
  validateExact(o0, oracles, "O0");
  validateExact(o2, oracles, "O2");

  const runner = await createRunner(root, profileSource);
  try {
    for (let index = 0; index < warmups; index += 1) {
      for (const kind of ["vector", "slope", "surface"]) {
        runner.measure(kind, "baseline", points);
        runner.measure(kind, "candidate", points);
      }
      runner.measure("vector", "copy-negative", points);
    }
    const comparisons = {
      representativeVector: buildPairedComparison({
        phase: "representative-vector-complete-public",
        samples,
        baseline: () => runner.measure("vector", "baseline", points),
        candidate: () => runner.measure("vector", "candidate", points),
        expected: oracles.cpython.vector,
      }),
      heldoutSlope: buildPairedComparison({
        phase: "heldout-slope-complete-public",
        samples,
        baseline: () => runner.measure("slope", "baseline", points),
        candidate: () => runner.measure("slope", "candidate", points),
        expected: oracles.cpython.slope,
      }),
      independentSurface: buildPairedComparison({
        phase: "independent-surface-complete-public",
        samples,
        baseline: () => runner.measure("surface", "baseline", points),
        candidate: () => runner.measure("surface", "candidate", points),
        expected: oracles.cpython.surface,
      }),
      vectorCopyMaterializationNegative: buildPairedComparison({
        phase: "representative-vector-copy-materialization-negative",
        samples,
        baseline: () => runner.measure("vector", "baseline", points),
        candidate: () => runner.measure("vector", "copy-negative", points),
        expected: oracles.cpython.vector,
      }),
    };
    const crossovers = [];
    for (const count of [5, 10, 20, 40, 80, 100]) {
      const crossoverOracles = count === points ? oracles : independentOracles(root, count);
      runner.measure("vector", "baseline", count);
      runner.measure("vector", "candidate", count);
      crossovers.push({
        points: count,
        comparison: buildPairedComparison({
          phase: `vector-crossover-${count}x${count}`,
          samples: standardEvidence ? 3 : 1,
          baseline: () => runner.measure("vector", "baseline", count),
          candidate: () => runner.measure("vector", "candidate", count),
          expected: crossoverOracles.cpython.vector,
        }),
      });
    }
    const guardAudit = runner.guardAudit();
    const outputEntries = {
      representativeVector: oracles.cpython.vector.xEntries + oracles.cpython.vector.yEntries,
      heldoutSlope: oracles.cpython.slope.xEntries + oracles.cpython.slope.yEntries,
      independentSurface:
        oracles.cpython.surface.xEntries + oracles.cpython.surface.yEntries,
    };
    const payload = {
      generatedAt: new Date().toISOString(),
      status: standardEvidence
        ? "standard-current-build-feasibility-evidence"
        : "development-smoke-non-promotable",
      promotable: Boolean(buildAuthentication.promotable && standardEvidence),
      productionCompilerRouteClaim: "none",
      buildAuthentication,
      host: {
        platform: process.platform,
        architecture: process.arch,
        runtime: "node",
        runtimeVersion: process.version,
        engine: "v8",
        engineVersion: process.versions.v8,
      },
      protocol: {
        points,
        samples,
        warmups,
        order: "repeating AB,BA,BA,AB",
        standardEvidence,
        optimizationLevel: "O2",
        nativeDisabled: true,
        digestPublicationOutsideTimedPublicCall: true,
      },
      source,
      workloadCatalog: { document: workload, insertion: catalogInsertion(catalog, workload) },
      exactDifferential: { cpython: oracles.cpython, independent: oracles.independent, sagejsO0: o0, sagejsO2: o2 },
      measurementScope: {
        authority: "complete-public-call",
        included:
          "public plot_vector_field/plot_slope_field construction, option normalization, 100x100 sampling, PlotSpec construction, detached materialization, geometry, trace publication, public lower_plot_spec layout/config publication",
        excluded: ["source compilation and import", "warmups", "post-return SHA-256 construction", "independent oracle execution"],
        candidateDifference:
          "only the source-derived private numeric geometry loop is replaced; detached input materialization, validations, legend, visibility, trace shape, public construction, and public lowering remain",
      },
      boundaryAndResources: {
        dynamicTargetCrossingsPerCandidateCall: 1,
        candidateInputCopiedBytes: 0,
        candidateOutputCopiedBytes: 0,
        residency: "all grids and outputs remain V8-resident JavaScript arrays decorated as Python lists",
        outputEntries,
        minimumOutputSlotBytes: {
          representativeVector: outputEntries.representativeVector * 8,
          heldoutSlope: outputEntries.heldoutSlope * 8,
          independentSurface: outputEntries.independentSurface * 8,
        },
        inputMaterialization: "existing materialize_object detached copy remains included and unchanged",
        targetBindingSeconds: runner.bindingSeconds(),
        targetSourceBytes: Buffer.byteLength(helperSource(profileSource)),
        negativeExtraCopiedBytesPerCall:
          outputEntries.representativeVector * 8,
        cleanup: "private arrays are unreachable on rejection or interruption and publish only after successful completion",
      },
      guardAudit,
      targetDispositions: candidateDispositions(),
      comparisons,
      crossover: crossovers,
      opportunityEvidenceAdapter: {
        schema: "sagejs.campaign1-reviewed-phase-opportunity-adapter/v1",
        consumable: Boolean(buildAuthentication.promotable && standardEvidence),
        measurementScope: "complete-public-call",
        workload: {
          id: workload.id,
          primaryOutputDigest: oracles.cpython.vector.completeDigest,
          heldoutOutputDigest: oracles.cpython.slope.completeDigest,
          independentHeldoutOutputDigest: oracles.cpython.surface.completeDigest,
        },
        source: {
          path: PUBLIC_SOURCE,
          sha256: source.publicSha256,
          innerGeometryLoopSha256: source.innerGeometryLoopSha256,
        },
        comparisons: {
          representativeVector: comparisons.representativeVector.opportunityEvidencePairs,
          positiveHeldoutSlope: comparisons.heldoutSlope.opportunityEvidencePairs,
          independentPositiveHeldoutSurface:
            comparisons.independentSurface.opportunityEvidencePairs,
          vectorCopyMaterializationNegative:
            comparisons.vectorCopyMaterializationNegative.opportunityEvidencePairs,
        },
        phaseReceiptData: {
          representativeVector: {
            baseline: {
              target: "generic",
              samplesNanoseconds:
                comparisons.representativeVector.rawPairs.map(
                  (pair) => pair.baselineNanoseconds,
                ),
              outputDigest: oracles.cpython.vector.completeDigest,
            },
            feasibleLowerBound: {
              target: "v8",
              samplesNanoseconds:
                comparisons.representativeVector.rawPairs.map(
                  (pair) => pair.candidateNanoseconds,
                ),
              outputDigest: oracles.cpython.vector.completeDigest,
              productionRouteClaim: "none",
            },
          },
          positiveHeldoutSlope: {
            baseline: {
              target: "generic",
              samplesNanoseconds: comparisons.heldoutSlope.rawPairs.map(
                (pair) => pair.baselineNanoseconds,
              ),
              outputDigest: oracles.cpython.slope.completeDigest,
            },
            feasibleLowerBound: {
              target: "v8",
              samplesNanoseconds: comparisons.heldoutSlope.rawPairs.map(
                (pair) => pair.candidateNanoseconds,
              ),
              outputDigest: oracles.cpython.slope.completeDigest,
              productionRouteClaim: "none",
            },
          },
          independentPositiveHeldoutSurface: {
            baseline: {
              target: "generic",
              samplesNanoseconds: comparisons.independentSurface.rawPairs.map(
                (pair) => pair.baselineNanoseconds,
              ),
              outputDigest: oracles.cpython.surface.completeDigest,
            },
            feasibleLowerBound: {
              target: "v8",
              samplesNanoseconds: comparisons.independentSurface.rawPairs.map(
                (pair) => pair.candidateNanoseconds,
              ),
              outputDigest: oracles.cpython.surface.completeDigest,
              productionRouteClaim: "none",
            },
          },
          negativeTargets: [{
            target: "v8",
            candidate: "copy-materialization-lookalike",
            disposition: "measured-same-workload-negative",
            samplesNanoseconds:
              comparisons.vectorCopyMaterializationNegative.rawPairs.map(
                (pair) => pair.candidateNanoseconds,
              ),
            baselineSamplesNanoseconds:
              comparisons.vectorCopyMaterializationNegative.rawPairs.map(
                (pair) => pair.baselineNanoseconds,
              ),
            outputDigest: oracles.cpython.vector.completeDigest,
            productionRouteClaim: "none",
          }],
        },
        negativeTargets: [{
          id: "copy-materialization-lookalike",
          target: "v8",
          disposition: "measured-same-workload-negative",
          outputDigest: oracles.cpython.vector.completeDigest,
          productionRouteClaim: "none",
          samplesNanoseconds:
            comparisons.vectorCopyMaterializationNegative.rawPairs.map(
              (pair) => pair.candidateNanoseconds,
            ),
          baselineSamplesNanoseconds:
            comparisons.vectorCopyMaterializationNegative.rawPairs.map(
              (pair) => pair.baselineNanoseconds,
            ),
          copiedBytesPerCall: outputEntries.representativeVector * 8,
          detail:
            "checked resident geometry followed by fresh per-element binary64 coercion and Python-list rematerialization",
        }],
        unavailableAndInconclusiveTargets: candidateDispositions(),
        productionRouteClaim: "none",
      },
    };
    return validateReport(attachIdentity(SCHEMA, payload));
  } finally {
    runner.close();
  }
}

function parseArguments(argv) {
  const options = { smoke: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "arrow-field") continue;
    if (argument === "--smoke") options.smoke = true;
    else if (argument === "--output") {
      options.output = argv[++index];
      if (!options.output) throw new Error("--output requires a filename");
    } else throw new Error(`unknown arrow-field argument ${argument}`);
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const report = await runFeasibility(options.smoke
    ? { points: 5, samples: 1, warmups: 1, allowUnverifiedBuild: true }
    : {});
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), output);
  else process.stdout.write(output);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  STANDARD_POINTS,
  STANDARD_SAMPLES,
  STANDARD_WARMUPS,
  PROFILE_SOURCE,
  PUBLIC_SOURCE,
  SOURCE_PATHS,
  buildPairedComparison,
  candidateDispositions,
  catalogInsertion,
  cpythonPublicProgram,
  createRunner,
  deriveCandidateSource,
  expectedOrder,
  helperSource,
  independentOracles,
  independentProgram,
  reviewedSource,
  reviewedBoundsSource,
  runFeasibility,
  runSageLevelExact,
  validateReport,
  workloadCatalogEntry,
};
