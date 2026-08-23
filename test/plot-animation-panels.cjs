#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
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
const documented = JSON.parse(
  readFileSync(
    join(root, "docs/sage-compatibility/plotting/animation.json"),
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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-plot-animation-"));
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

function commandPath(command) {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(locator, [command], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  return result.stdout.trim().split(/\r?\n/, 1)[0];
}

function discoverChromium() {
  const configured = process.env.SAGEJS_CHROMIUM_PATH;
  if (configured && existsSync(configured)) return configured;
  const candidates = process.platform === "win32"
    ? [
      join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
      join(process.env.PROGRAMFILES || "", "Microsoft/Edge/Application/msedge.exe"),
    ]
    : process.platform === "darwin"
      ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
      : [
        commandPath("google-chrome"),
        commandPath("chromium"),
        commandPath("chromium-browser"),
        commandPath("microsoft-edge"),
      ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const witness = String.raw`
import json
from sagejs.plotting.animation import (
    AnimationControls,
    AnimationFrame,
    AnimationResourceError,
    AnimationResourceLimits,
    AnimationTiming,
    PlotAnimation,
    PlotExportCapabilityError,
    UnsupportedAnimationError,
    animation_frame_figure,
    lower_plot_animation,
    plot_export_capabilities,
    prepare_plot_export,
    stable_frame_id,
)
from sagejs.plotting.axes import Axes2DSettings, Scene3DSettings
from sagejs.plotting.composition import Panel2D, PanelComposition2D
from sagejs.plotting.model import PlotSpec, make_layer

def line_spec(values, *, dimension=2, metadata=None, overrides=None):
    coordinates = {"x": [0, 1, 2], "y": values}
    if dimension == 3:
        coordinates["z"] = [0, 0.5, 1]
    return PlotSpec(
        dimension,
        [make_layer(
            "line",
            coordinates,
            ordinal=0,
            style={
                "color": "#3366cc",
                "width": 3,
                "dash": "solid",
                "opacity": 1,
            },
            legend={"show": True, "label": "trajectory"},
            metadata={"semantic": True, "zorder": None},
        )],
        axes_or_scene=(
            Axes2DSettings().to_dict()
            if dimension == 2
            else Scene3DSettings().to_dict()
        ),
        annotations=[{"kind": "alt_text", "text": "Animated trajectory"}],
        provenance={"frontend": "sage", "metadata": metadata or {}},
        plotly_overrides=overrides,
    )

frames = [
    AnimationFrame(stable_frame_id(0), line_spec([0, 1, 0]), label="start"),
    AnimationFrame(stable_frame_id(1), line_spec([1, 0, 1]), label="finish"),
]
timing = AnimationTiming(
    frame_duration_ms=120,
    transition_duration_ms=30,
    easing="cubic",
    redraw=True,
)
animation = PlotAnimation(
    frames,
    timing=timing,
    controls=AnimationControls(slider_prefix="Time: "),
    metadata={"purpose": "differential witness"},
)
semantic = animation.to_dict()
figure = lower_plot_animation(animation)
assert semantic["schema_version"] == 1
assert semantic["dimension"] == 2
assert semantic["frames"][0]["layer_ids"] == ["layer-0"]
assert [frame["name"] for frame in figure["frames"]] == ["frame-0", "frame-1"]
assert figure["data"][0]["uid"] == "layer-0"
assert figure["frames"][1]["data"][0]["y"] == [1, 0, 1]
assert figure["frames"][1]["traces"] == [0]
assert figure["layout"]["sliders"][0]["steps"][1]["label"] == "finish"
assert figure["layout"]["updatemenus"][0]["buttons"][0]["method"] == "animate"
figure["frames"][0]["traces"][0] = 99
assert figure["frames"][1]["traces"] == [0]
figure["frames"][0]["traces"][0] = 0

# The public records are detached.
semantic["frames"][0]["state"]["value"]["layers"][0]["data"]["y"][0] = 999
assert animation.frames[0].state.layers[0].data["y"][0] == 0

# Three-dimensional states use the same semantic frame contract.
animation_3d = PlotAnimation([
    AnimationFrame("space-0", line_spec([0, 1, 0], dimension=3)),
    AnimationFrame("space-1", line_spec([1, 0, 1], dimension=3)),
])
figure_3d = lower_plot_animation(animation_3d)
assert figure_3d["data"][0]["type"] == "scatter3d"
assert animation_3d.dimension == 3

# Multi-panel animation reuses PanelComposition2D and its qualified IDs.
def panels(left_values, right_values):
    left = Panel2D("left", line_spec(left_values), 0, 0, title="Left")
    right = Panel2D("right", line_spec(right_values), 0, 1, title="Right")
    return PanelComposition2D(1, 2, [right, left], horizontal_gap=0.1)

panel_animation = PlotAnimation([
    AnimationFrame("panels-0", panels([0, 1, 0], [1, 0, 1])),
    AnimationFrame("panels-1", panels([1, 0, 1], [0, 1, 0])),
])
panel_figure = lower_plot_animation(panel_animation)
assert panel_animation.frames[0].layer_ids == ("left.layer-0", "right.layer-0")
assert [trace["uid"] for trace in panel_figure["data"]] == [
    "left.layer-0",
    "right.layer-0",
]
assert panel_figure["layout"]["xaxis"]["domain"] == [0.0, 0.45]
assert panel_figure["frames"][1]["data"][1]["xaxis"] == "x2"
panel_state = panels([0, 1, 0], [1, 0, 1])
panel_capabilities = plot_export_capabilities(
    panel_state, static_image_available=True
)
assert panel_capabilities["subject"] == "panel-composition-2d"
assert panel_capabilities["formats"]["png"]["requires_frame"] is False
assert prepare_plot_export(panel_state, "json")["mode"] == "semantic-json"
assert prepare_plot_export(panel_state, "html")["mode"] == "interactive-plotly"
assert prepare_plot_export(
    panel_state, "png", static_image_available=True
)["mode"] == "static-plotly"

# JSON/HTML preserve the whole animation. Static output requires one frame and
# an available Chromium backend.
without_browser = plot_export_capabilities(animation)
with_browser = plot_export_capabilities(animation, static_image_available=True)
assert without_browser["formats"]["html"]["available"] is True
assert without_browser["formats"]["png"]["available"] is False
assert with_browser["formats"]["png"]["requires_frame"] is True
assert prepare_plot_export(animation, "json")["mode"] == "semantic-json"
assert prepare_plot_export(animation, "html")["mode"] == "interactive-plotly"
static = prepare_plot_export(
    animation,
    "png",
    frame_id="frame-1",
    static_image_available=True,
)
assert static["mode"] == "static-frame-plotly"
assert static["payload"]["data"][0]["y"] == [1, 0, 1]
assert animation_frame_figure(animation, "frame-0")["data"][0]["y"] == [0, 1, 0]

def must_fail(function, expected, code=None):
    try:
        function()
    except expected as error:
        if code is not None:
            assert error.code == code
        return
    raise AssertionError("invalid animation input was accepted")

# Cross-dimensional frames and every form of topology drift fail closed.
must_fail(
    lambda: PlotAnimation([
        AnimationFrame("a", line_spec([0, 1, 0])),
        AnimationFrame("b", line_spec([0, 1, 0], dimension=3)),
    ]),
    UnsupportedAnimationError,
)
must_fail(
    lambda: PlotAnimation([
        AnimationFrame("a", line_spec([0, 1, 0])),
        AnimationFrame("b", PlotSpec(2, [])),
    ]),
    UnsupportedAnimationError,
)
must_fail(
    lambda: PlotAnimation([
        AnimationFrame("a", panels([0, 1, 0], [1, 0, 1])),
        AnimationFrame(
            "b",
            PanelComposition2D(
                2,
                1,
                [Panel2D("left", line_spec([1, 0, 1]), 0, 0)],
            ),
        ),
    ]),
    UnsupportedAnimationError,
)
must_fail(lambda: AnimationControls(loop=True), UnsupportedAnimationError)
must_fail(lambda: AnimationControls(autoplay=True), UnsupportedAnimationError)
must_fail(
    lambda: PlotAnimation(frames, limits=AnimationResourceLimits(max_frames=1)),
    AnimationResourceError,
)
must_fail(
    lambda: PlotAnimation(
        frames,
        limits=AnimationResourceLimits(max_total_samples=1),
    ),
    AnimationResourceError,
)
must_fail(
    lambda: prepare_plot_export(animation, "png"),
    PlotExportCapabilityError,
    "SAGEJS_GRAPHICS_ANIMATION_FRAME_REQUIRED",
)
must_fail(
    lambda: prepare_plot_export(
        animation,
        "png",
        frame_id="frame-0",
    ),
    PlotExportCapabilityError,
    "SAGEJS_GRAPHICS_BROWSER_UNAVAILABLE",
)
must_fail(
    lambda: prepare_plot_export(
        animation,
        "png",
        frame_id="missing-frame",
        static_image_available=True,
    ),
    PlotExportCapabilityError,
    "SAGEJS_GRAPHICS_ANIMATION_FRAME_INVALID",
)
must_fail(
    lambda: prepare_plot_export(animation, "html", frame_id="frame-0"),
    PlotExportCapabilityError,
    "SAGEJS_GRAPHICS_ANIMATION_FRAME_INVALID",
)
must_fail(
    lambda: prepare_plot_export(panel_state, "json", frame_id="frame-0"),
    PlotExportCapabilityError,
    "SAGEJS_GRAPHICS_ANIMATION_FRAME_INVALID",
)
must_fail(
    lambda: prepare_plot_export(animation, "gif"),
    PlotExportCapabilityError,
    "SAGEJS_GRAPHICS_FORMAT_UNSUPPORTED",
)

# Existing controls are not silently overwritten.
conflicting = PlotAnimation([
    AnimationFrame("conflict-0", line_spec([0, 1, 0], overrides={"layout": {"sliders": []}})),
    AnimationFrame("conflict-1", line_spec([1, 0, 1], overrides={"layout": {"sliders": []}})),
])
must_fail(lambda: lower_plot_animation(conflicting), UnsupportedAnimationError)

# A raw layer whose trace count changes retains semantic IDs but has unstable
# Plotly trace topology and is therefore rejected during lowering.
raw_one = PlotSpec(2, [make_layer("plotly-trace", {"traces": [{"type": "bar", "x": [0], "y": [1]}]})])
raw_two = PlotSpec(2, [make_layer("plotly-trace", {"traces": [
    {"type": "bar", "x": [0], "y": [1]},
    {"type": "bar", "x": [1], "y": [2]},
]})])
unstable = PlotAnimation([
    AnimationFrame("raw-0", raw_one),
    AnimationFrame("raw-1", raw_two),
])
must_fail(lambda: lower_plot_animation(unstable), UnsupportedAnimationError)

print(json.dumps({
    "semantic": animation.to_dict(),
    "figure": figure,
    "panel_semantic": panel_animation.to_dict(),
    "panel_figure": panel_figure,
    "figure_3d": figure_3d,
    "capabilities": without_browser,
}, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
`;

test("semantic animations and panels are differential across CPython and Sage.js", () => {
  const cpython = runCPython(witness);
  const sagejs = runSagejs(witness);
  assert.equal(sagejs, cpython);
  const result = JSON.parse(sagejs);
  assert.equal(result.figure.frames.length, 2);
  assert.equal(result.panel_figure.data[1].uid, "right.layer-0");
  assert.equal(result.figure_3d.data[0].type, "scatter3d");
});

test("animation contract documents deterministic limits and export boundaries", () => {
  assert.equal(documented.schema_version, 1);
  assert.equal(documented.semantic_model.cross_dimension_animation, "unsupported");
  assert.equal(documented.resource_limits.max_frames, 500);
  assert.equal(documented.resource_limits.max_payload_bytes, 64 * 1024 * 1024);
  assert.equal(documented.export.html.animation, "interactive Plotly frames and controls");
  assert.equal(documented.export.png.animation, "explicit single frame");
  assert.match(documented.export.gif, /unsupported/);
  assert.equal(
    documented.error_codes.SAGEJS_GRAPHICS_ANIMATION_FRAME_REQUIRED,
    "A static animation export did not identify one stable frame.",
  );
});

const performanceWitness = String.raw`
import json, time
from sagejs.plotting.animation import AnimationFrame, PlotAnimation, lower_plot_animation, stable_frame_id
from sagejs.plotting.axes import Axes2DSettings
from sagejs.plotting.model import PlotSpec, make_layer

count = 500
x = list(range(count))
frames = []
for frame_index in range(60):
    y = [value + frame_index for value in x]
    spec = PlotSpec(2, [make_layer(
        "line",
        {"x": x, "y": y},
        style={"color": "#3366cc", "width": 1, "dash": "solid", "opacity": 1},
        legend={"show": False, "label": None},
        metadata={"semantic": True, "zorder": None},
    )], axes_or_scene=Axes2DSettings().to_dict())
    frames.append(AnimationFrame(stable_frame_id(frame_index), spec))
start = time.perf_counter()
animation = PlotAnimation(frames)
figure = lower_plot_animation(animation)
elapsed = time.perf_counter() - start
print(json.dumps({
    "elapsed": elapsed,
    "frames": len(figure["frames"]),
    "points": count * len(frames),
    "bytes": len(animation.to_json().encode("utf-8")),
}, sort_keys=True))
`;

test("bounded animation construction and lowering avoids a performance cliff", () => {
  const result = JSON.parse(runSagejs(performanceWitness));
  assert.equal(result.frames, 60);
  assert.equal(result.points, 30_000);
  assert.ok(result.bytes < 2_000_000, result.bytes);
  assert.ok(result.elapsed < 15, result.elapsed);
});

const chromiumPath = discoverChromium();

test(
  "Plotly validates and animates lowered frames in real Chromium",
  { skip: !chromiumPath },
  async () => {
    const { chromium } = require("playwright-core");
    const result = JSON.parse(runSagejs(witness));
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
    });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent('<!doctype html><div id="plot"></div>');
      await page.addScriptTag({
        path: require.resolve("plotly.js-dist-min/plotly.min.js"),
      });
      const observed = await page.evaluate(async (figure) => {
        const plotly = globalThis.Plotly;
        const element = document.getElementById("plot");
        const validation = plotly.validate(figure.data, figure.layout);
        await plotly.newPlot(element, figure.data, figure.layout, figure.config);
        await plotly.addFrames(element, figure.frames);
        await plotly.animate(element, ["frame-1"], {
          frame: { duration: 0, redraw: true },
          transition: { duration: 0 },
          mode: "immediate",
        });
        const answer = {
          validation,
          frameCount: element._transitionData._frames.length,
          y: Array.from(element.data[0].y),
          sliderCount: element.layout.sliders.length,
          buttonCount: element.layout.updatemenus[0].buttons.length,
          uid: element.data[0].uid,
        };
        await plotly.purge(element);
        return answer;
      }, result.figure);
      // Plotly reports dynamic method arguments as reset-to-the-same-value
      // notices, and the shared theme carries an unused 3D scene into a 2D
      // figure. Neither is a schema error or a rendering failure.
      assert.ok(
        observed.validation.every((item) =>
          item.code === "dynamic" ||
          (item.code === "unused" && item.astr === "scene")
        ),
        JSON.stringify(observed.validation),
      );
      assert.equal(observed.frameCount, 2);
      assert.deepEqual(observed.y, [1, 0, 1]);
      assert.equal(observed.sliderCount, 1);
      assert.equal(observed.buttonCount, 2);
      assert.equal(observed.uid, "layer-0");
    } finally {
      await browser.close();
    }
  },
);
