#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "../..");

const witness = String.raw`
import json
from sagejs.plotting.animation import (
    AnimationControls,
    AnimationFrame,
    PlotAnimation,
    lower_plot_animation,
)
from sagejs.plotting.model import PlotSpec, make_layer

def state(ordinal):
    return PlotSpec(2, [make_layer(
        "point",
        {"x": [ordinal], "y": [ordinal * ordinal]},
        ordinal=0,
        style={"color": "#3366cc", "size": 8},
    )])

animation = PlotAnimation(
    [AnimationFrame("iteration-" + str(i), state(i), label="iteration " + str(i)) for i in range(3)],
    controls=AnimationControls(
        speed_multipliers=[0.25, 1, 4],
        default_speed=1,
    ),
    metadata={"callback_reevaluated": False, "computed_evidence_only": True},
)
semantic = animation.to_dict()
figure = lower_plot_animation(animation)

invalid_messages = []
for factory in (
    lambda: AnimationControls(speed_multipliers=[]),
    lambda: AnimationControls(speed_multipliers=[1, 1]),
    lambda: AnimationControls(speed_multipliers=[0, 1]),
    lambda: AnimationControls(speed_multipliers=[1], default_speed=2),
    lambda: AnimationControls(
        play=False,
        pause=False,
        step=False,
        restart=False,
        speed=False,
        slider=False,
    ),
):
    try:
        factory()
    except (TypeError, ValueError) as error:
        invalid_messages.append(str(error))
    else:
        raise AssertionError("an invalid animation-control contract was accepted")

print(json.dumps({
    "semantic": semantic["controls"],
    "button_groups": [menu["buttons"] for menu in figure["layout"]["updatemenus"]],
    "slider_steps": figure["layout"]["sliders"][0]["steps"],
    "host": figure["layout"]["meta"]["sagejs_animation_controls"],
    "frames": [frame["name"] for frame in figure["frames"]],
    "invalid_messages": invalid_messages,
}, sort_keys=True))
`;

function execute(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function cpython() {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = `import collections.abc, json, math, sys, typing\nsys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})\n`;
  return execute(executable, ["-I", "-c", prefix + witness]);
}

function sagejs() {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-animation-controls-"));
  const path = join(directory, "witness.py");
  try {
    writeFileSync(path, witness);
    return execute(process.execPath, [join(root, "bin/sagejs"), path]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function check(record) {
  assert.deepEqual(record.frames, ["iteration-0", "iteration-1", "iteration-2"]);
  assert.deepEqual(
    record.button_groups.map((group) => group.map((button) => button.label)),
    [["Play", "Pause"], ["Restart"]],
  );
  assert.deepEqual(
    record.slider_steps.map((step) => step.label),
    ["iteration 0", "iteration 1", "iteration 2"],
  );
  assert.equal(record.semantic.play, true);
  assert.equal(record.semantic.pause, true);
  assert.equal(record.semantic.step, true);
  assert.equal(record.semantic.restart, true);
  assert.equal(record.semantic.speed, true);
  assert.equal(record.semantic.slider, true);
  assert.deepEqual(record.semantic.speed_multipliers, [0.25, 1, 4]);
  assert.equal(record.semantic.default_speed, 1);
  assert.equal(record.semantic.autoplay, false);
  assert.equal(record.semantic.loop, false);
  assert.equal(record.host.computed_frames_only, true);
  assert.equal(record.host.capabilities.step.route, "host-relative-frame-controller");
  assert.equal(record.host.capabilities.speed.route, "host-duration-controller");
  assert.equal(record.host.capabilities.restart.route, "plotly-layout");
  assert.equal(record.invalid_messages.length, 5);
}

test("CPython and Sage.js lower the complete animation-control contract identically", () => {
  const python = cpython();
  const compiled = sagejs();
  assert.deepEqual(compiled, python);
  check(compiled);
});
