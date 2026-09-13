#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sweep-presentation-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const witness = String.raw`
import math
from sagejs.numerics.sweeps import run_parameter_sweep
from sagejs.plotting import lower_plot_animation, lower_plot_spec

calls = [0]

def solve(rate, context):
    calls[0] += 1
    context.emit("model", {"rate": rate, "final_time": 1.0})
    if rate == 4.0:
        raise ArithmeticError("intentional teaching failure")
    final = math.exp(-rate)
    return {
        "status": "converged",
        "success": True,
        "value": [final],
        "validation": {
            "passed": True,
            "truth_level": "validated_approximate",
            "residual": abs(final - math.exp(-rate)),
        },
    }

result = run_parameter_sweep(
    [0.25, 0.5, 1.0, 2.0, 4.0],
    solve,
    callback_record={
        "kind": "teaching_decay_model",
        "name": "y'=-rate*y",
        "replayable": True,
    },
)
frozen = calls[0]

explanation = result.explanation()
assert calls[0] == frozen
assert explanation["kind"] == "sweep-explanation"
assert explanation["outcome"]["status"] == "completed_with_failures"
assert explanation["outcome"]["counts"] == {
    "planned": 5,
    "completed": 5,
    "failed": 1,
    "skipped": 0,
}
assert explanation["evidence"]["validated_item_count"] == 4
assert explanation["evidence"]["validation_failed_item_count"] == 0
assert explanation["evidence"]["completed_unvalidated_item_count"] == 0
assert explanation["evidence"]["failures"][0]["index"] == 4
assert explanation["provenance"] == {
    "source": "retained SweepResult records",
    "computed_evidence_only": True,
    "callback_reevaluated": False,
}
assert "item 4 failed with callback_error" in result.explain()

spec = result.to_plot_spec(
    x_path="/parameter",
    y_path="/value/value/0",
    x_label="decay rate",
    y_label="retained y(1)",
)
assert calls[0] == frozen
assert spec.layers[0].data == {
    "x": [0.25, 0.5, 1.0, 2.0],
    "y": [math.exp(-0.25), math.exp(-0.5), math.exp(-1.0), math.exp(-2.0)],
}
metadata = spec.provenance["metadata"]
assert metadata["source_item_indices"] == [0, 1, 2, 3]
assert metadata["failed_item_indices"] == [4]
assert metadata["computed_evidence_only"] is True
assert metadata["callback_reevaluated"] is False
assert "not as invented plot coordinates" in spec.alt_text()
figure = lower_plot_spec(spec)
assert len(figure["data"]) == 2

animation = result.to_animation(
    x_path="/parameter",
    y_path="/value/value/0",
    x_label="decay rate",
    y_label="retained y(1)",
    max_frames=4,
)
assert calls[0] == frozen
animation_record = animation.to_dict()
assert animation_record["metadata"]["selected_completed_item_counts"] == [0, 1, 3, 5]
assert animation_record["metadata"]["gallery_decimated"] is True
assert animation_record["metadata"]["interpolation"] == "none"
assert animation_record["metadata"]["computed_evidence_only"] is True
assert animation_record["metadata"]["callback_reevaluated"] is False
assert [frame["metadata"]["interpolated"] for frame in animation_record["frames"]] == [False] * 4
assert animation_record["frames"][-1]["metadata"]["source_item_status"] == "callback_error"
assert animation_record["controls"]["autoplay"] is False
assert animation_record["controls"]["loop"] is False
for control in ("play", "pause", "step", "restart", "speed", "slider"):
    assert animation_record["controls"][control] is True
plotly = lower_plot_animation(animation)
assert [frame["name"] for frame in plotly["frames"]] == [
    frame["id"] for frame in animation_record["frames"]
]
assert plotly["layout"]["meta"]["sagejs_animation_controls"]["computed_frames_only"] is True

try:
    result.to_plot_spec(x_path="/parameter", y_path="/value/missing")
except KeyError:
    pass
else:
    raise AssertionError("a missing retained evidence path did not fail closed")
try:
    result.to_plot_spec(x_path="/parameter", y_path="/value/~2invalid")
except ValueError:
    pass
else:
    raise AssertionError("an invalid RFC 6901 escape did not fail closed")
try:
    result.to_animation(
        x_path="/parameter",
        y_path="/value/value/0",
        x_label="",
    )
except TypeError:
    pass
else:
    raise AssertionError("an empty animation axis label did not fail closed")
assert calls[0] == frozen

print("sweep presentation contract passed")
`;

test("sweep explanation and retained-evidence presentation agree in CPython", () => {
  assert.equal(runCPython(witness), "sweep presentation contract passed");
});

test("sweep explanation and retained-evidence presentation run in Sage.js", () => {
  assert.equal(runSagejs(witness), "sweep presentation contract passed");
});
