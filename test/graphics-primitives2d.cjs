#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    join(
      root,
      "docs/sage-compatibility/plotting/oracle/primitives2d.json",
    ),
    "utf8",
  ),
);

const witness = String.raw`
import json
from sagejs.plotting.sage_primitives2d import (
    arrow_render_plan,
    hue_rgb,
    line_render_plan,
    marker_symbol,
    point_render_plan,
    polygon_render_plan,
    text_render_plan,
)

answer = {
    "arrow": arrow_render_plan({
        "head": 2,
        "arrowsize": 11,
        "arrowshorten": 14,
        "width": 4,
        "linestyle": "solid",
        "zorder": 2,
    }),
    "hues": [hue_rgb(0), hue_rgb(1 / 3), hue_rgb(2 / 3), hue_rgb(1)],
    "line": line_render_plan({
        "marker": "D",
        "markersize": 13,
        "markeredgecolor": "red",
        "markeredgewidth": 2.5,
        "markerfacecolor": "yellow",
        "linestyle": "steps-mid--",
        "zorder": 7,
    }),
    "markers": [marker_symbol(value) for value in ("o", "d", "H", "<", 6)],
    "point": point_render_plan({
        "marker": "d",
        "markeredgecolor": "red",
        "size": 20,
        "faceted": True,
        "zorder": 6,
    }),
    "polygon_fill": polygon_render_plan({
        "fill": True,
        "rgbcolor": "yellow",
        "edgecolor": "red",
        "thickness": 4,
        "zorder": 5,
    }),
    "polygon_outline": polygon_render_plan({
        "fill": False,
        "rgbcolor": "blue",
        "edgecolor": "red",
        "thickness": 4,
        "zorder": 5,
    }),
    "text": text_render_plan({
        "horizontal_alignment": "left",
        "vertical_alignment": "top",
        "rotation": 45,
        "axis_coords": True,
        "background_color": "yellow",
        "fontstyle": "italic",
        "fontweight": "bold",
        "fontsize": 17,
        "alpha": 0.4,
        "zorder": 3,
    }),
}
print(json.dumps(answer, sort_keys=True, separators=(",", ":")))
`;

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

function runCPython() {
  const prefix = String.raw`
import collections.abc, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "/usr/bin/python3");
  return run(executable, ["-I", "-c", prefix + witness]);
}

function runSagejs(source = witness) {
  const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
  const directory = mkdtempSync(join(tmpdir(), "sagejs-primitives2d-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    return run(process.execPath, [executable, filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("primitive render plans are CPython/Sage.js differential", () => {
  const cpython = runCPython();
  const sagejs = runSagejs();
  assert.equal(sagejs, cpython);
  const answer = JSON.parse(sagejs);
  assert.equal(answer.line.mode, "lines+markers");
  assert.equal(answer.line.line.shape, "hvh");
  assert.deepEqual(answer.line.marker.line, { color: "red", width: 2.5 });
  assert.deepEqual(answer.polygon_outline, {
    close_path: true,
    fill: false,
    fillcolor: null,
    line: { color: "blue", dash: "solid", width: 4 },
    opacity: 1,
    zorder: 5,
  });
  assert.equal(answer.arrow.arrowside, "end+start");
  assert.equal(answer.arrow.shorten_each, 7);
  assert.equal(answer.text.renderer, "annotation");
  assert.equal(answer.text.xref, "paper");
});

test("invalid or unrepresentable options fail instead of disappearing", () => {
  const source = String.raw`
from sagejs.plotting.sage_primitives2d import *

cases = [
    lambda: line_render_plan({"mystery": 1}),
    lambda: line_render_plan({"marker": "$x$"}),
    lambda: point_render_plan({"marker": "not-a-marker"}),
    lambda: arrow_render_plan({"head": 3}),
    lambda: arrow_render_plan({"thickness": 99}),
    lambda: arrow_render_plan({"head": 2, "linestyle": "dashed"}),
    lambda: text_render_plan({"clip": True}),
    lambda: text_render_plan({"bounding_box": {"boxstyle": "round"}}),
    lambda: text_render_plan({"rotation": 45, "zorder": 7}),
]
for case in cases:
    try:
        case()
    except (KeyError, NotImplementedError, ValueError):
        pass
    else:
        raise AssertionError("unsupported option was silently accepted")
print("ok")
`;
  assert.equal(runSagejs(source), "ok");
});

test("qualified Sage primitive modules resolve to the public objects", () => {
  const source = String.raw`
from sage.plot.line import Line, line, line2d
from sage.plot.point import Point, point, point2d
from sage.plot.polygon import Polygon, polygon, polygon2d
from sage.plot.arrow import Arrow, arrow, arrow2d
from sage.plot.text import Text, text

assert line is line2d and point is point2d
assert polygon is polygon2d and arrow is arrow2d
assert isinstance(line([(0, 0), (1, 1)])[0], Line)
assert isinstance(point((0, 0))[0], Point)
assert isinstance(polygon([(0, 0), (1, 0), (0, 1)])[0], Polygon)
assert isinstance(arrow((0, 0), (1, 1))[0], Arrow)
assert isinstance(text("x", (0, 0))[0], Text)
print("ok")
`;
  assert.equal(runSagejs(source), "ok");
});

test("Graphics lowers every targeted primitive without losing semantics", () => {
  const source = String.raw`
g = line([(0, 0), (1, 1)], marker="D", markersize=13,
         markeredgecolor="red", markeredgewidth=2.5,
         markerfacecolor="yellow", linestyle="steps-mid--",
         thickness=4, alpha=.4, zorder=7)
t = g.plotly()["data"][0]
assert t["mode"] == "lines+markers"
assert t["line"]["shape"] == "hvh" and t["line"]["dash"] == "dash"
assert t["line"]["width"] == 4 and t["zorder"] == 7
assert t["marker"]["symbol"] == "diamond"
assert t["marker"]["size"] == 13
assert t["marker"]["line"]["color"] == "red"
assert t["marker"]["line"]["width"] == 2.5

p = point([(0, 0), (1, 2)], marker="d", size=20.9,
          faceted=True, zorder=6.9)
pt = p.plotly()["data"][0]
assert pt["marker"]["symbol"] == "diamond-tall"
assert pt["marker"]["size"] == 20
assert pt["marker"]["line"]["color"] == "rgb(0,0,255)"
assert pt["zorder"] == 6

outline = polygon([(0, 0), (1, 0), (0, 1)], fill=False,
                  rgbcolor="blue", edgecolor="red", thickness=4,
                  linestyle="--", zorder=5.9)
poly = outline.plotly()["data"][0]
assert poly["x"] == [0, 1, 0, 0] and poly["y"] == [0, 0, 1, 0]
assert poly["fill"] == "none"
assert poly["line"]["color"] == "blue" and poly["line"]["width"] == 4
assert poly["line"]["dash"] == "dash"
assert poly["zorder"] == 5

a = arrow((0, 0), (2, 1), head=2, arrowshorten=14,
          arrowsize=10, width=4, color="orange")
af = a.plotly()
assert af["data"] == []
ann = af["layout"]["annotations"][0]
assert ann["arrowhead"] == 2 and ann["startarrowhead"] == 2
assert ann["standoff"] == 7 and ann["startstandoff"] == 7
assert ann["arrowwidth"] == 4 and ann["arrowsize"] == 2

label = text("agent", (.2, .8), horizontal_alignment="left",
             vertical_alignment="top", rotation=45, axis_coords=True,
             background_color="yellow", fontstyle="italic",
             fontweight="bold", fontsize=14.9, alpha=.25)
tf = label.plotly()
assert tf["data"] == []
ta = tf["layout"]["annotations"][0]
assert ta["xref"] == "paper" and ta["yref"] == "paper"
assert ta["xanchor"] == "left" and ta["yanchor"] == "top"
assert ta["textangle"] == 45 and ta["bgcolor"] == "yellow"
assert ta["font"]["size"] == 14 and ta["font"]["style"] == "italic"

ordered = line([(0, 0), (1, 0)], zorder=10) + point((0, 1), zorder=-1)
traces = ordered.plotly()["data"]
assert traces[0]["mode"] == "lines" and traces[0]["zorder"] == 10
assert traces[1]["mode"] == "markers" and traces[1]["zorder"] == -1
assert [layer.kind for layer in ordered.spec().layers] == ["line", "point"]

for make in (
    lambda: line([(0, 0), (1, 1)], frobnicate=True),
    lambda: point((0, 0), frobnicate=True),
    lambda: polygon([(0, 0), (1, 0), (0, 1)], frobnicate=True),
    lambda: arrow((0, 0), (1, 1), thickness=99),
    lambda: text("x", (0, 0), clip=True),
):
    try:
        make()
    except (KeyError, NotImplementedError, ValueError):
        pass
    else:
        raise AssertionError("unsupported constructor option was silently accepted")
print("ok")
`;
  assert.equal(runSagejs(source), "ok");
});

test("the Sage 10.9 oracle records every targeted primitive", () => {
  assert.equal(fixture.oracle.sage_version, "10.9.post1");
  for (const prefix of ["line", "point", "polygon", "arrow", "text"]) {
    assert.ok(
      Object.keys(fixture.cases).some((name) => name.startsWith(prefix)),
      `missing ${prefix} oracle`,
    );
  }
  assert.ok(fixture.intentional_plotly_translations.length >= 4);
});
