#!/usr/bin/env node
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
const { execFileSync, spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const documented = JSON.parse(
  readFileSync(
    join(root, "docs/sage-compatibility/plotting/themes.json"),
    "utf8",
  ),
);

function commandPath(command) {
  try {
    const utility = process.platform === "win32" ? "where" : "which";
    return execFileSync(utility, [command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split(/\r?\n/, 1)[0];
  } catch {
    return undefined;
  }
}

function discoverChromium() {
  const configured = [
    process.env.SAGEJS_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.BROWSER_PATH,
  ];
  const candidates = process.platform === "win32"
    ? [
        ...configured,
        process.env.PROGRAMFILES &&
          `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
        process.env["PROGRAMFILES(X86)"] &&
          `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
      ]
    : process.platform === "darwin"
      ? [
          ...configured,
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : [
          ...configured,
          commandPath("chromium"),
          commandPath("chromium-browser"),
          commandPath("google-chrome"),
          commandPath("google-chrome-stable"),
        ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const chromiumPath = discoverChromium();

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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-themes-"));
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
from sagejs.plotting.styles import (
    color_channels,
    normalize_color,
    normalize_fill_style,
    normalize_line_dash,
    normalize_line_style,
    normalize_marker_style,
    normalize_opacity,
    normalize_text_style,
)
from sagejs.plotting.themes import (
    contrast_ratio,
    get_theme,
    theme_contrast,
    theme_names,
    theme_registry,
)

assert theme_names() == (
    "notebook", "presentation", "publication", "dark", "high-contrast"
)
metrics = {}
for name in theme_names():
    theme = get_theme(name)
    document = theme.to_dict()
    assert document["name"] == name
    assert document["schema_version"] == 1
    assert len(document["tokens"]["colorway"]) == 8
    assert document["layout"]["colorway"] == document["tokens"]["colorway"]
    assert document["layout"]["font"]["family"] == document["tokens"]["font_family"]
    assert document["layout"]["xaxis"]["gridcolor"] == document["tokens"]["grid"]
    assert document["layout"]["scene"]["camera"]["up"] == {"x": 0, "y": 0, "z": 1}
    assert document["trace_defaults"]["surface"]["lighting"]["ambient"] > 0
    assert document["trace_defaults"]["mesh3d"]["opacity"] == 1.0
    assert document["config"]["responsive"] is True
    assert document["config"]["displaylogo"] is False

    contrast = theme_contrast(name)
    assert contrast["foreground_on_paper"] >= 4.5
    assert contrast["foreground_on_plot"] >= 4.5
    assert contrast["axis_on_plot"] >= 3.0
    assert min(contrast["categorical_on_plot"]) >= 3.0
    if name == "high-contrast":
        assert contrast["grid_on_plot"] >= 3.0
    rounded_metrics = {}
    for key in contrast:
        value = contrast[key]
        if isinstance(value, list):
            rounded_metrics[key] = [round(item, 12) for item in value]
        else:
            rounded_metrics[key] = round(value, 12)
    metrics[name] = rounded_metrics

# Theme values are immutable by interface: every container accessor is detached.
theme = get_theme("notebook")
changed = theme.layout
changed["font"]["size"] = 99
changed["colorway"][0] = "#ffffff"
assert theme.layout["font"]["size"] == 14
assert theme.layout["colorway"][0] == "#0072b2"
assert get_theme("notebook") is not get_theme("notebook")

try:
    get_theme("missing")
except ValueError:
    pass
else:
    raise AssertionError("unknown theme was accepted")

assert round(contrast_ratio("#000000", "#ffffff"), 12) == 21.0
assert color_channels("#fff") == (1.0, 1.0, 1.0, 1.0)

style_cases = {
    "hex": normalize_color("#AbC").to_dict(),
    "tuple": normalize_color((0, 0.5, 1)).to_dict(),
    "bad_color": normalize_color(object()).to_dict(),
    "bad_rgb": normalize_color("rgb(nope)").to_dict(),
    "opacity": normalize_opacity("25%").to_dict(),
    "bad_opacity": normalize_opacity(2).to_dict(),
    "dash": normalize_line_dash("--").to_dict(),
    "line": normalize_line_style(
        {"color": (0, 0.5, 1), "dash": "--", "width": "2px", "mystery": 3}
    ).to_dict(),
    "marker": normalize_marker_style(
        {"color": "blue", "opacity": 0.5, "size": 9, "symbol": "^"}
    ).to_dict(),
    "fill": normalize_fill_style(
        {"color": "#0072b2", "opacity": 0.2, "mode": True}
    ).to_dict(),
    "text": normalize_text_style(
        {"color": "black", "family": "Inter", "size": "16px"}
    ).to_dict(),
}
assert style_cases["hex"]["status"] == "supported"
assert style_cases["hex"]["value"] == "#aabbcc"
assert style_cases["tuple"]["status"] == "translated"
assert style_cases["tuple"]["value"] == "#0080ff"
assert style_cases["bad_color"]["status"] == "unsupported"
assert style_cases["bad_color"]["input"] == "<object>"
assert style_cases["bad_rgb"]["status"] == "unsupported"
assert style_cases["opacity"]["value"] == 0.25
assert style_cases["bad_opacity"]["status"] == "unsupported"
assert style_cases["dash"]["value"] == "dash"
assert style_cases["line"]["status"] == "unsupported"
assert len(style_cases["line"]["options"]) == 4
assert [item["option"] for item in style_cases["line"]["options"]] == [
    "color", "dash", "mystery", "width"
]
assert style_cases["line"]["value"] == {
    "color": "#0080ff", "dash": "dash", "width": 2.0
}
assert style_cases["marker"]["value"]["symbol"] == "triangle-up"
assert style_cases["fill"]["value"]["mode"] == "tozeroy"
assert style_cases["text"]["value"]["size"] == 16.0

try:
    normalize_line_style({1: "not a named option"})
except TypeError:
    pass
else:
    raise AssertionError("non-string style key was accepted")

print(json.dumps({
    "themes": theme_registry(),
    "metrics": metrics,
    "styles": style_cases,
}, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
`;

test("themes and style decisions are exact across CPython and Sage.js", () => {
  const cpython = runCPython(witness);
  const sagejs = runSagejs(witness);
  assert.equal(sagejs, cpython);

  const result = JSON.parse(sagejs);
  assert.deepEqual(result.themes, documented.themes);
  assert.deepEqual(
    result.themes.map(({ name }) => name),
    documented.policy.canonical_names,
  );
  assert.equal(result.styles.line.status, "unsupported");
  assert.equal(result.styles.line.options.length, 4);
});

test("checked theme documentation records accessible deterministic defaults", () => {
  assert.equal(documented.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(documented.schema_version, 1);
  assert.equal(documented.themes.length, 5);
  for (const theme of documented.themes) {
    assert.equal(theme.schema_version, 1);
    assert.equal(theme.config.responsive, true);
    assert.equal(theme.config.displaylogo, false);
    assert.equal(theme.tokens.colorway.length, 8);
    assert.equal(theme.layout.colorway.length, 8);
    assert.ok(theme.layout.scene.camera.eye.z > 0);
    assert.ok(theme.trace_defaults.surface.lighting.ambient > 0);
  }
  assert.match(documented.policy.interaction_limits, /does not guarantee/);
});

test(
  "every theme key validates and renders through the installed Plotly",
  { skip: !chromiumPath },
  async () => {
    const { chromium } = require("playwright-core");
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
      for (const theme of documented.themes) {
        const result = await page.evaluate(async (current) => {
          const plotly = globalThis.Plotly;
          const schema = plotly.PlotSchema.get();
          const schemaErrors = [];
          function checkKeys(value, attributes, path) {
            for (const [key, item] of Object.entries(value)) {
              if (!Object.hasOwn(attributes, key)) {
                schemaErrors.push(`${path}.${key}`);
                continue;
              }
              const rule = attributes[key];
              if (
                item !== null &&
                typeof item === "object" &&
                !Array.isArray(item) &&
                rule &&
                !Object.hasOwn(rule, "valType")
              ) {
                checkKeys(item, rule, `${path}.${key}`);
              }
            }
          }
          checkKeys(current.layout, schema.layout.layoutAttributes, "layout");
          checkKeys(
            current.trace_defaults.line,
            schema.traces.scatter.attributes.line,
            "trace_defaults.line",
          );
          checkKeys(
            current.trace_defaults.marker,
            schema.traces.scatter.attributes.marker,
            "trace_defaults.marker",
          );
          checkKeys(
            current.trace_defaults.surface,
            schema.traces.surface.attributes,
            "trace_defaults.surface",
          );
          checkKeys(
            current.trace_defaults.mesh3d,
            schema.traces.mesh3d.attributes,
            "trace_defaults.mesh3d",
          );
          const color = current.layout.colorway[0];
          const data = [
            {
              type: "scatter",
              x: [0, 1],
              y: [0, 1],
              mode: "lines+markers",
              line: { ...current.trace_defaults.line, color },
              marker: { ...current.trace_defaults.marker, color },
            },
            {
              type: "surface",
              z: [[0, 1], [1, 0]],
              ...current.trace_defaults.surface,
              showscale: false,
            },
            {
              type: "mesh3d",
              x: [0, 1, 0],
              y: [0, 0, 1],
              z: [0, 0, 0],
              i: [0],
              j: [1],
              k: [2],
              color,
              ...current.trace_defaults.mesh3d,
            },
          ];
          const element = document.getElementById("plot");
          await plotly.newPlot(element, data, current.layout, current.config);
          const consumedConfig = {};
          for (const key of Object.keys(current.config)) {
            consumedConfig[key] = element._context[key];
          }
          await plotly.purge(element);
          return {
            schemaErrors,
            consumedConfig,
          };
        }, theme);
        assert.deepEqual(
          result.schemaErrors,
          [],
          `${theme.name}: ${result.schemaErrors}`,
        );
        for (const key of Object.keys(theme.config)) {
          assert.ok(
            Object.hasOwn(result.consumedConfig, key),
            `${theme.name} did not consume config.${key}`,
          );
        }
      }
    } finally {
      await browser.close();
    }
  },
);
