#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const GENERATED_BY = "tools/foreign/plotting-surface.cjs";
const OUTPUT = "docs/sage-compatibility/plotting/frontend-surface.json";
const SOURCE_FILES = [
  "tools/wolfram/frontend.ts",
  "src/lib/wolfram.py",
  "tools/matlab/frontend.ts",
  "src/lib/matlab.py",
  "tools/kernel.ts",
  "test/graphics.cjs",
];

const WOLFRAM_SIGNATURES = {
  Plot: "Plot[expr, {x, xmin, xmax}, options...]",
  ParametricPlot: "ParametricPlot[{x(t), y(t)}, {t, tmin, tmax}, options...]",
  PolarPlot: "PolarPlot[r(t), {t, tmin, tmax}, options...]",
  ListPlot: "ListPlot[data, options...]",
  ListLinePlot: "ListLinePlot[data, options...]",
  DensityPlot: "DensityPlot[expr, {x, xmin, xmax}, {y, ymin, ymax}, options...]",
  ContourPlot: "ContourPlot[expr, {x, xmin, xmax}, {y, ymin, ymax}, options...]",
  RegionPlot: "RegionPlot[predicate, {x, xmin, xmax}, {y, ymin, ymax}, options...]",
  StreamPlot: "StreamPlot[{vx, vy}, {x, xmin, xmax}, {y, ymin, ymax}, options...]",
  VectorPlot: "VectorPlot[{vx, vy}, {x, xmin, xmax}, {y, ymin, ymax}, options...]",
  Plot3D: "Plot3D[expr, {x, xmin, xmax}, {y, ymin, ymax}, options...]",
  SphericalPlot3D: "SphericalPlot3D[r, {u, umin, umax}, {v, vmin, vmax}, options...]",
  VectorPlot3D: "VectorPlot3D[{vx, vy, vz}, {x, xmin, xmax}, {y, ymin, ymax}, {z, zmin, zmax}, options...]",
  RevolutionPlot3D: "RevolutionPlot3D[curve, {t, tmin, tmax}, options...]",
  ParametricPlot3D: "ParametricPlot3D[coordinates, {u, umin, umax}, optional second range, options...]",
  ContourPlot3D: "ContourPlot3D[expr, {x, xmin, xmax}, {y, ymin, ymax}, {z, zmin, zmax}, options...]",
  ListPlot3D: "ListPlot3D[data, options...]",
};

const WOLFRAM_TARGETS = {
  Plot: "plot",
  ParametricPlot: "parametric_plot",
  PolarPlot: "polar_plot",
  ListPlot: "list_plot",
  ListLinePlot: "list_plot(plotjoined=True)",
  DensityPlot: "density_plot",
  ContourPlot: "contour_plot",
  RegionPlot: "region_plot",
  StreamPlot: "streamline_plot",
  VectorPlot: "plot_vector_field",
  Plot3D: "plot3d",
  SphericalPlot3D: "spherical_plot3d",
  VectorPlot3D: "plot_vector_field3d",
  RevolutionPlot3D: "revolution_plot3d",
  ParametricPlot3D: "parametric_plot3d",
  ContourPlot3D: "implicit_plot3d",
  ListPlot3D: "list_plot3d",
};

const WOLFRAM_GAPS = [
  ["ArrayPlot", "2d", "ArrayPlot[array, options...]"],
  ["BarChart", "2d", "BarChart[data, options...]"],
  ["ComplexPlot", "2d", "ComplexPlot[f, {z, zmin, zmax}, options...]"],
  ["Histogram", "2d", "Histogram[data, options...]"],
  ["ListContourPlot", "2d", "ListContourPlot[data, options...]"],
  ["ListDensityPlot", "2d", "ListDensityPlot[data, options...]"],
  ["LogLinearPlot", "2d", "LogLinearPlot[expr, {x, xmin, xmax}, options...]"],
  ["LogLogPlot", "2d", "LogLogPlot[expr, {x, xmin, xmax}, options...]"],
  ["LogPlot", "2d", "LogPlot[expr, {x, xmin, xmax}, options...]"],
  ["MatrixPlot", "2d", "MatrixPlot[matrix, options...]"],
  ["ListLinePlot3D", "3d", "ListLinePlot3D[data, options...]"],
  ["ListPointPlot3D", "3d", "ListPointPlot3D[data, options...]"],
  ["RegionPlot3D", "3d", "RegionPlot3D[predicate, ranges..., options...]"],
  ["StreamPlot3D", "3d", "StreamPlot3D[field, ranges..., options...]"],
  ["Cuboid.non_cubic", "3d", "Cuboid[{{x0,y0,z0},{x1,y1,z1}}] with unequal side lengths"],
  ["Legended", "2d-or-3d", "Legended[graphic, legend]"],
  ["PlotLegends", "2d-or-3d", "PlotLegends -> specification"],
  ["PlotTheme", "2d-or-3d", "PlotTheme -> theme"],
  ["Prolog", "2d-or-3d", "Prolog -> primitives"],
  ["Epilog", "2d-or-3d", "Epilog -> primitives"],
];

const WOLFRAM_GAP_REASONS = {
  "Cuboid.non_cubic": "The parser and Cuboid runtime adapter exist, but the runtime deliberately raises NotImplementedError for unequal side lengths.",
  Prolog: "The generic rule syntax parses, but plot-option lowering has no Prolog mapping and currently ignores it.",
  Epilog: "The generic rule syntax parses, but plot-option lowering has no Epilog mapping and currently ignores it.",
};

const MATLAB_TARGETS = [
  ["plot", "2d", "plot(x, y)"],
  ["plot.LineSpec", "2d", "plot(x, y, LineSpec)"],
  ["scatter", "2d", "scatter(x, y, ...)"],
  ["bar", "2d", "bar(data, ...)"],
  ["histogram", "2d", "histogram(data, ...)"],
  ["contour", "2d", "contour(X, Y, Z, ...)"],
  ["imagesc", "2d", "imagesc(data, ...)"],
  ["surf", "3d", "surf(X, Y, Z, ...)"],
  ["mesh", "3d", "mesh(X, Y, Z, ...)"],
  ["figure", "2d-or-3d", "figure(...)"],
  ["axes", "2d-or-3d", "axes(...)"],
  ["hold", "2d-or-3d", "hold on/off"],
  ["xlabel", "2d-or-3d", "xlabel(text)"],
  ["ylabel", "2d-or-3d", "ylabel(text)"],
  ["zlabel", "3d", "zlabel(text)"],
  ["title", "2d-or-3d", "title(text)"],
  ["legend", "2d-or-3d", "legend(...)"],
  ["xlim", "2d-or-3d", "xlim(limits)"],
  ["ylim", "2d-or-3d", "ylim(limits)"],
  ["zlim", "3d", "zlim(limits)"],
  ["grid", "2d-or-3d", "grid on/off"],
  ["view", "3d", "view(...)"],
  ["colormap", "2d-or-3d", "colormap(...)"],
  ["subplot", "2d-or-3d", "subplot(...)"],
  ["tiledlayout", "2d-or-3d", "tiledlayout(...)"],
  ["nexttile", "2d-or-3d", "nexttile(...)"],
  ["set", "2d-or-3d", "set(handle, property, value, ...)"],
  ["handle.Property", "2d-or-3d", "handle.Property"],
];

const MATLAB_GAP_REASONS = {
  "plot.LineSpec": "Only the exact two-argument plot(x, y) form is special-cased; a LineSpec becomes a generic call/index expression and fails rather than being silently accepted.",
  hold: "MATLAB command syntax with arguments is explicitly rejected, and no persistent figure/axes hold state exists.",
  grid: "MATLAB command syntax with arguments is explicitly rejected, and no grid-state adapter exists.",
  xlabel: "The generic call grammar lowers xlabel(...) through an unresolved name, producing NameError rather than an axes label.",
  "handle.Property": "Tree-sitter recognizes field_expression syntax, but the MATLAB AST builder explicitly rejects that node type; graphics-handle property access is absent.",
};

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function readSources(root) {
  return Object.fromEntries(
    SOURCE_FILES.map((filename) => [filename, readFileSync(resolve(root, filename), "utf8")]),
  );
}

function objectKeys(source, propertyName) {
  const marker = `${propertyName}: Record<string, string> = {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${propertyName} source table`);
  const end = source.indexOf("\n    };", start);
  assert.notEqual(end, -1, `unterminated ${propertyName} source table`);
  const result = [];
  for (const match of source.slice(start, end).matchAll(/^\s+([A-Za-z][A-Za-z0-9]*):/gm)) {
    result.push(match[1]);
  }
  return result;
}

function objectEntries(source, propertyName) {
  const marker = `${propertyName}: Record<string, string> = {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${propertyName} source table`);
  const end = source.indexOf("\n    };", start);
  assert.notEqual(end, -1, `unterminated ${propertyName} source table`);
  const entries = [];
  for (const match of source.slice(start, end).matchAll(/^\s+([A-Za-z][A-Za-z0-9]*):\s*"([^"]+)",/gm)) {
    entries.push([match[1], match[2]]);
  }
  return entries;
}

function pythonAliases(source) {
  return [...source.matchAll(/^([A-Z][A-Za-z0-9_]*)\s*=\s*([a-z_][A-Za-z0-9_]*)$/gm)]
    .map((match) => ({ name: match[1], implementation: match[2] }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function wolframPlotHeads(source) {
  const start = source.indexOf("  private call(expression: CallExpression)");
  const end = source.indexOf("  private iterator(", start);
  assert.notEqual(start, -1, "missing Wolfram call lowerer");
  assert.notEqual(end, -1, "missing Wolfram iterator lowerer");
  const names = [...source.slice(start, end).matchAll(/if \(head === "([A-Za-z0-9]+)"\)/g)]
    .map((match) => match[1])
    .filter((name) => name !== "Table");
  for (const name of names) {
    assert.ok(WOLFRAM_SIGNATURES[name], `classify new Wolfram plotting head ${name}`);
    assert.ok(WOLFRAM_TARGETS[name], `record lowering target for Wolfram plotting head ${name}`);
  }
  return names;
}

function wolframDimension(name) {
  if (["Directive", "GrayLevel", "Hue", "Opacity", "PointSize", "RGBColor", "Style", "Thickness"].includes(name)) {
    return "2d-or-3d";
  }
  if (["Arrow", "Line", "Point", "Polygon", "Text"].includes(name)) return "2d-or-3d";
  if (["Cone", "Cuboid", "Cylinder", "Graphics3D", "Sphere", "Torus"].includes(name)) return "3d";
  return "2d";
}

function graphicsSyntax(name) {
  const narrowed = {
    Arrow: "Arrow[{start, end}]",
    Cuboid: "Cuboid[{{x0,y0,z0},{x1,y1,z1}}] with equal side lengths",
    Cylinder: "Cylinder[{start, end}, radius]",
    Cone: "Cone[{start, end}, radius]",
    Rectangle: "Rectangle[lower, upper]",
    Text: "Text[value, position]",
    Torus: "Torus[center, {minor, major}]",
  };
  return narrowed[name] ?? `${name}[...]`;
}

function record({ frontend, name, dimension, kind, syntax, state, reason, authorities, runtimeExport = null, target = null, semanticTests = [], plotlyTests = [] }) {
  return {
    id: `${frontend}.${kind}.${name}`,
    frontend,
    qualified_name: name,
    dimension,
    kind,
    signature_or_syntax: syntax,
    source_authority: authorities,
    dependencies: state === "implemented" ? ["Sage.js graphics", "Plotly"] : [],
    classification: state === "implemented" ? "translated" : "unsupported",
    support_state: state,
    grammar_recognized: true,
    plotting_lowerer_recognized: state === "implemented",
    runtime_export: runtimeExport,
    lowering_target: target,
    translation_or_reason: reason,
    semantic_tests: semanticTests,
    plotly_tests: plotlyTests,
    visual_tests: [],
    platform_status: "not-assessed",
    performance_status: "not-assessed",
  };
}

function generateSurface(root = resolve(__dirname, "../..")) {
  const sources = readSources(root);
  const wolframFrontend = sources["tools/wolfram/frontend.ts"];
  const wolframRuntime = sources["src/lib/wolfram.py"];
  const matlabFrontend = sources["tools/matlab/frontend.ts"];
  const matlabRuntime = sources["src/lib/matlab.py"];
  const kernelSource = sources["tools/kernel.ts"];
  const graphicsTests = sources["test/graphics.cjs"];

  function wolframEvidence(name) {
    const tested = graphicsTests.includes(`${name}[`) ||
      graphicsTests.includes(`${name}->`);
    return tested ? ["test/graphics.cjs"] : [];
  }

  const plotHeads = wolframPlotHeads(wolframFrontend);
  const graphicsHeads = objectKeys(wolframFrontend, "graphicsHeads");
  const plotOptionEntries = objectEntries(wolframFrontend, "keywordMap");
  const plotOptionTargets = Object.fromEntries(plotOptionEntries);
  const plotOptions = plotOptionEntries.map(([name]) => name);
  assert.match(wolframFrontend, /name === "PlotRange"/, "PlotRange lowering disappeared");
  plotOptions.push("PlotRange");
  const wolframExports = pythonAliases(wolframRuntime);
  const wolframExportNames = new Set(wolframExports.map(({ name }) => name));
  assert.match(wolframRuntime, /non-cubic Wolfram Cuboid dimensions are not implemented yet/, "Cuboid limitation changed");
  for (const name of graphicsHeads) {
    assert.ok(wolframExportNames.has(name), `parser head ${name} has no Wolfram runtime export`);
  }

  const entries = [];
  for (const name of plotHeads) {
    entries.push(record({
      frontend: "wolfram",
      name,
      dimension: name.includes("3D") ? "3d" : "2d",
      kind: "plot-function",
      syntax: WOLFRAM_SIGNATURES[name],
      state: "implemented",
      reason: "Parser lowering translates this supported syntax to the shared Sage.js sampler and Plotly graphics pipeline.",
      authorities: ["tools/wolfram/frontend.ts"],
      target: WOLFRAM_TARGETS[name],
      semanticTests: wolframEvidence(name),
      plotlyTests: wolframEvidence(name),
    }));
  }
  for (const name of graphicsHeads) {
    entries.push(record({
      frontend: "wolfram",
      name,
      dimension: wolframDimension(name),
      kind: ["Directive", "GrayLevel", "Hue", "Opacity", "PointSize", "RGBColor", "Style", "Thickness"].includes(name) ? "style-directive" : "graphics-primitive",
      syntax: graphicsSyntax(name),
      state: "implemented",
      reason: "The parser emits the matching Wolfram runtime adapter, which translates to Sage.js graphics and Plotly.",
      authorities: ["tools/wolfram/frontend.ts", "src/lib/wolfram.py"],
      runtimeExport: name,
      target: `_wolfram.${name}`,
      semanticTests: wolframEvidence(name),
      plotlyTests: wolframEvidence(name),
    }));
  }
  entries.push(record({
    frontend: "wolfram", name: "Show", dimension: "2d-or-3d", kind: "composition",
    syntax: "Show[graphics...]", state: "implemented",
    reason: "The parser lowers Show directly to the shared Sage.js graphics composition entry point.",
    authorities: ["tools/wolfram/frontend.ts"], target: "show",
    semanticTests: wolframEvidence("Show"), plotlyTests: wolframEvidence("Show"),
  }));
  for (const name of plotOptions.sort()) {
    entries.push(record({
      frontend: "wolfram", name, dimension: "2d-or-3d", kind: "plot-option",
      syntax: name === "PlotRange"
        ? "PlotRange -> {ymin,ymax} or {{xmin,xmax},{ymin,ymax}}"
        : `${name} -> value`,
      state: "implemented",
      reason: "This option has an explicit parser mapping to a Sage.js/Plotly option; other Wolfram options are not claimed.",
      authorities: ["tools/wolfram/frontend.ts"],
      target: name === "PlotRange" ? "xmin/xmax/ymin/ymax" : plotOptionTargets[name],
      semanticTests: wolframEvidence(name),
      plotlyTests: wolframEvidence(name),
    }));
  }
  const supportedWolfram = new Set(entries.filter((entry) => entry.frontend === "wolfram").map((entry) => entry.qualified_name));
  for (const [name, dimension, syntax] of WOLFRAM_GAPS) {
    if (supportedWolfram.has(name)) continue;
    entries.push(record({
      frontend: "wolfram",
      name,
      dimension,
      kind: name === "Legended"
        ? "composition"
        : name.startsWith("Cuboid.")
        ? "graphics-primitive"
        : name.includes("Plot") || name.endsWith("Chart") || name === "Histogram"
        ? "plot-function"
        : "plot-option",
      syntax, state: "emerging-gap",
      reason: WOLFRAM_GAP_REASONS[name] ?? "This planned Wolfram plotting construct has no explicit plotting lowerer/runtime adapter yet.",
      authorities: name === "Cuboid.non_cubic"
        ? ["src/lib/wolfram.py", "tools/wolfram/frontend.ts"]
        : ["agents/sage-2d-plotting-coverage-plan.md", "tools/wolfram/frontend.ts"],
    }));
  }

  const matlabPlotImplemented = /name === "plot"\s*&&\s*expression\.arguments\.length === 2/.test(matlabFrontend);
  assert.ok(matlabPlotImplemented, "MATLAB plot(x, y) special lowering disappeared");
  assert.match(matlabFrontend, /if \(!commandName \|\| commandArguments\.length\)/, "MATLAB command rejection boundary changed");
  assert.doesNotMatch(matlabFrontend, /case "field_expression"/, "MATLAB field/property support must be classified before advertising it");
  assert.match(kernelSource, /persistent Sage\.js execution session/, "persistent session contract changed");
  const matlabExports = [...matlabRuntime.matchAll(/^def ([a-z][A-Za-z0-9_]*)\(/gm)]
    .map((match) => match[1])
    .filter((name) => !name.startsWith("_"))
    .sort();
  if (/^ALL\s*=/m.test(matlabRuntime)) matlabExports.unshift("ALL");
  for (const [name, dimension, syntax] of MATLAB_TARGETS) {
    const implemented = name === "plot" && matlabPlotImplemented;
    entries.push(record({
      frontend: "matlab", name, dimension,
      kind: ["figure", "axes", "hold", "subplot", "tiledlayout", "nexttile"].includes(name) ? "session-state" : name === "set" ? "handle-update" : ["xlabel", "ylabel", "zlabel", "title", "legend", "xlim", "ylim", "zlim", "grid", "view", "colormap"].includes(name) ? "axes-operation" : "plot-function",
      syntax, state: implemented ? "implemented" : "emerging-gap",
      reason: implemented
        ? "Exactly two arguments are explicitly lowered to a Sage.js line graphic; LineSpec and MATLAB figure/axes/handle state are not implied."
        : MATLAB_GAP_REASONS[name] ?? "The generic MATLAB call grammar recognizes this spelling, but there is no plotting-specific lowerer or MATLAB runtime export, so it is not advertised as working.",
      authorities: implemented ? ["tools/matlab/frontend.ts"] : ["agents/sage-2d-plotting-coverage-plan.md", "tools/matlab/frontend.ts"],
      target: implemented ? "line" : null,
    }));
  }

  entries.sort((left, right) => left.id.localeCompare(right.id));
  const counts = (frontend, classification) => entries.filter((entry) => entry.frontend === frontend && entry.classification === classification).length;
  return {
    schema_version: 1,
    generated_by: GENERATED_BY,
    policy: {
      classifications: ["faithful", "translated", "unsupported", "extension"],
      statement: "Inventory actual parser/runtime evidence; generic grammar recognition alone never establishes plotting support.",
      proprietary_runtime_dependencies: false,
    },
    sources: SOURCE_FILES.map((path) => ({ path, sha256: sha256(sources[path]) })),
    summary: {
      total_entries: entries.length,
      wolfram: { translated: counts("wolfram", "translated"), unsupported: counts("wolfram", "unsupported") },
      matlab: { translated: counts("matlab", "translated"), unsupported: counts("matlab", "unsupported") },
    },
    frontends: {
      wolfram: {
        parser_plot_heads: plotHeads.sort(),
        parser_graphics_heads: graphicsHeads.sort(),
        parser_plot_options: plotOptions.sort(),
        runtime_exports: wolframExports,
      },
      matlab: {
        parser_call_model: "Generic function_call syntax plus one plotting-specific plot(x, y) lowering",
        parser_plot_heads: matlabPlotImplemented ? ["plot"] : [],
        runtime_exports: matlabExports,
        plotting_runtime_exports: [],
        session_model: {
          shared_module_namespace_across_cells: true,
          persistent_figure_axes_state: false,
          graphics_handles: false,
          evidence: ["tools/kernel.ts", "tools/matlab/frontend.ts", "src/lib/matlab.py"],
        },
      },
    },
    entries,
  };
}

function rendered(surface) {
  return `${JSON.stringify(surface, null, 2)}\n`;
}

function main() {
  const root = resolve(__dirname, "../..");
  const output = resolve(root, OUTPUT);
  const expected = rendered(generateSurface(root));
  if (process.argv.includes("--check")) {
    const actual = readFileSync(output, "utf8");
    if (actual !== expected) {
      console.error(`${OUTPUT} is stale; run node ${GENERATED_BY}`);
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(output, expected);
  console.log(`wrote ${OUTPUT}`);
}

module.exports = { OUTPUT, generateSurface, rendered };

if (require.main === module) main();
