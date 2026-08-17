#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const root = resolve(__dirname, "../..");
const galleryDirectory = join(
  root,
  "docs/sage-compatibility/plotting/gallery",
);
const fixturePath = join(galleryDirectory, "fixtures.json");
const expectationPath = join(galleryDirectory, "visual-expectations.json");
const performancePath = join(galleryDirectory, "performance.json");
const evidencePath = join(galleryDirectory, "render-evidence.json");

const themes = [
  "notebook",
  "presentation",
  "publication",
  "dark",
  "high-contrast",
];
const viewports = [
  { id: "mobile", width: 360, height: 480 },
  { id: "notebook", width: 800, height: 600 },
  { id: "presentation", width: 1280, height: 720 },
];

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function checkedJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function writeOrCheck(filename, value, write) {
  const text = stableJson(value);
  if (write) {
    mkdirSync(galleryDirectory, { recursive: true });
    writeFileSync(filename, text);
    return;
  }
  assert.equal(
    readFileSync(filename, "utf8"),
    text,
    `${filename} is stale; run node scripts/plotting/generate-gallery.cjs --write`,
  );
}

function pythonFixtures() {
  const source = String.raw`
import json, math, sys
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})

from sagejs.plotting import (
    PlotSpec,
    Provenance,
    color_channels,
    contrast_ratio,
    get_theme,
    lower_plot_spec,
    make_layer,
    rectangular_surface_layer,
    theme_contrast,
    theme_names,
)

THEMES = ("notebook", "presentation", "publication", "dark", "high-contrast")
assert theme_names() == THEMES

line_layer = make_layer(
    kind="line",
    data={"x": [-2.0, -1.0, 0.0, 1.0, 2.0], "y": [4.0, 1.0, 0.0, 1.0, 4.0]},
    ordinal=0,
    source_intent={"frontend": "sage", "constructor": "line", "expression": "y=x^2"},
    style={"color": "#0072b2", "width": 2.0, "dash": "solid", "opacity": 1.0},
    legend={"show": True, "label": "y = x^2"},
    metadata={"semantic": True, "sample_count": 5},
)
point_layer = make_layer(
    kind="point",
    data={"x": [-1.0, 0.0, 1.0], "y": [1.0, 0.0, 1.0]},
    ordinal=1,
    source_intent={"frontend": "sage", "constructor": "point"},
    style={"color": "#d55e00", "size": 9.0, "symbol": "circle", "opacity": 1.0},
    legend={"show": True, "label": "samples"},
    metadata={"semantic": True, "sample_count": 3},
)
text_layer = make_layer(
    kind="text",
    data={"position": [0.0, 0.0], "text": "minimum"},
    ordinal=2,
    source_intent={"frontend": "sage", "constructor": "text"},
    style={"color": "#1f2937", "font_size": 14.0, "position": "top center", "opacity": 1.0},
    metadata={"semantic": True},
)
base_2d = PlotSpec(
    2,
    [line_layer, point_layer, text_layer],
    axes_or_scene={
        "coordinate_system": "cartesian",
        "xaxis": {"title": {"text": "x"}, "range": [-2.2, 2.2], "autorange": False},
        "yaxis": {"title": {"text": "y"}, "range": [-0.4, 4.4], "autorange": False},
    },
    viewport={"responsive": True},
    annotations=[{
        "kind": "alt_text",
        "text": "A parabola y equals x squared from negative two to two, with three highlighted samples and its minimum labeled at the origin.",
    }],
    provenance=Provenance(
        "sage",
        source_language="sage",
        constructor="line + point + text",
        source="line([(-2,4),..., (2,4)]) + point([(-1,1),(0,0),(1,1)]) + text('minimum',(0,0))",
    ),
)

count = 17
angles = [2.0 * math.pi * index / (count - 1) for index in range(count)]
line_3d = make_layer(
    kind="line",
    data={
        "x": [math.cos(value) for value in angles],
        "y": [math.sin(value) for value in angles],
        "z": [value / (2.0 * math.pi) for value in angles],
    },
    ordinal=0,
    source_intent={"frontend": "sage", "constructor": "line3d", "expression": "(cos(t),sin(t),t/(2*pi))"},
    style={"color": "#d55e00", "width": 6.0, "opacity": 1.0},
    legend={"show": True, "label": "helix"},
    metadata={"semantic": True, "sample_count": count},
)
point_3d = make_layer(
    kind="point",
    data={"x": [0.0], "y": [0.0], "z": [0.0]},
    ordinal=1,
    source_intent={"frontend": "sage", "constructor": "point3d"},
    style={"color": "#0072b2", "size": 7.0, "symbol": "circle", "opacity": 1.0},
    legend={"show": True, "label": "origin"},
    metadata={"semantic": True, "sample_count": 1},
)
text_3d = make_layer(
    kind="text",
    data={"position": [0.0, 0.0, 0.0], "text": "origin"},
    ordinal=2,
    source_intent={"frontend": "sage", "constructor": "text3d"},
    style={"color": "#1f2937", "font_size": 14.0, "opacity": 1.0},
    metadata={"semantic": True},
)
surface = rectangular_surface_layer(
    [[-1.0, 0.0, 1.0], [-1.0, 0.0, 1.0], [-1.0, 0.0, 1.0]],
    [[-1.0, -1.0, -1.0], [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]],
    [[0.0, 0.25, 0.0], [0.25, 0.5, 0.25], [0.0, 0.25, 0.0]],
    ordinal=3,
    style={"color": "#007f5f", "opacity": 0.8, "colorbar": False},
    source_intent={"frontend": "sage", "expression": "0.5-(x^2+y^2)/4"},
)
base_3d = PlotSpec(
    3,
    [line_3d, point_3d, text_3d, surface],
    axes_or_scene={
        "coordinate_system": "cartesian",
        "scene": {
            "xaxis": {"title": {"text": "x"}},
            "yaxis": {"title": {"text": "y"}},
            "zaxis": {"title": {"text": "z"}},
            "aspectmode": "data",
        },
    },
    viewport={"responsive": True},
    annotations=[{
        "kind": "alt_text",
        "text": "A three-dimensional orange helix rises one turn above a translucent green sampled surface; the blue origin is labeled.",
    }],
    provenance=Provenance(
        "sage",
        source_language="sage",
        constructor="line3d + point3d + text3d + parametric_plot3d",
        source="line3d(helix) + point3d((0,0,0)) + text3d('origin',(0,0,0)) + parametric_plot3d(surface)",
        sampling={"helix_points": count, "surface_shape": [3, 3]},
    ),
)

records = []
for base, dimension, name, title in (
    (base_2d, 2, "semantic-2d", "Sage semantic 2D primitives"),
    (base_3d, 3, "semantic-3d", "Sage semantic 3D primitives and surface"),
):
    for theme in THEMES:
        theme_document = get_theme(theme)
        tokens = theme_document.tokens
        palette = tokens["colorway"]
        layers = list(base.layers)
        colors = (
            (palette[0], palette[1], tokens["foreground"])
            if dimension == 2
            else (palette[1], palette[0], tokens["foreground"], palette[2])
        )
        themed_layers = []
        for layer, color in zip(layers, colors):
            style = layer.style
            style["color"] = color
            themed_layers.append(layer.revise(style=style))
        spec = base.revise(theme=theme, layers=themed_layers)
        figure = lower_plot_spec(spec)
        layer_contrast = []
        for layer in spec.layers:
            style = layer.style
            red, green, blue, _alpha = color_channels(style["color"])
            opacity = style.get("opacity", 1.0)
            layer_contrast.append(
                contrast_ratio(
                    (red, green, blue, opacity), tokens["plot_background"]
                )
            )
        assert min(layer_contrast) >= 3.0
        records.append({
            "id": "sage-" + name + "-" + theme,
            "frontend": "sage",
            "classification": "translated",
            "dimension": dimension,
            "theme": theme,
            "title": title,
            "source": spec.provenance["source"],
            "alt_text": spec.alt_text(),
            "bounds": spec.bounds(),
            "validation_codes": [item.code for item in spec.validate()],
            "plot_spec": spec.to_dict(),
            "plotly": figure,
            "contrast": theme_contrast(theme),
            "layer_contrast": layer_contrast,
        })

print(json.dumps(records, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
`;
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "/usr/bin/python3");
  const result = spawnSync(executable, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const cssNames = {
  black: "#000000",
  blue: "#0000ff",
  red: "#ff0000",
  white: "#ffffff",
};

function colorChannels(value) {
  assert.equal(typeof value, "string", `unsupported gallery color ${value}`);
  const source = (cssNames[value.toLowerCase()] || value).trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(source)) {
    return [1, 2, 3].map((index) =>
      Number.parseInt(source[index] + source[index], 16) / 255
    );
  }
  if (/^#[0-9a-f]{6}$/.test(source)) {
    return [1, 3, 5].map((index) =>
      Number.parseInt(source.slice(index, index + 2), 16) / 255
    );
  }
  const rgb = source.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
  assert.ok(rgb, `unsupported gallery color ${value}`);
  return rgb.slice(1, 4).map((channel) => Number(channel) / 255);
}

function linearChannel(channel) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color, background = "#ffffff", opacity = 1) {
  const foreground = colorChannels(color);
  const behind = colorChannels(background);
  return [0.2126, 0.7152, 0.0722].reduce((total, weight, index) => {
    const channel = foreground[index] * opacity + behind[index] * (1 - opacity);
    return total + weight * linearChannel(channel);
  }, 0);
}

function contrastRatio(foreground, background, opacity = 1) {
  const first = relativeLuminance(foreground, background, opacity);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function traceColor(trace) {
  if (typeof trace.line?.color === "string") return trace.line.color;
  if (typeof trace.marker?.color === "string") return trace.marker.color;
  if (typeof trace.textfont?.color === "string") return trace.textfont.color;
  if (typeof trace.color === "string") return trace.color;
  if (Array.isArray(trace.colorscale) && typeof trace.colorscale[0]?.[1] === "string") {
    return trace.colorscale[0][1];
  }
  return "#2a3f5f";
}

function renderedContrast(figure) {
  const background = figure.layout?.scene?.bgcolor ||
    figure.layout?.plot_bgcolor || figure.layout?.paper_bgcolor || "#ffffff";
  const foreground = figure.layout?.font?.color || "#2a3f5f";
  const axis = figure.layout?.xaxis?.color ||
    figure.layout?.scene?.xaxis?.color || foreground;
  const grid = figure.layout?.xaxis?.gridcolor ||
    figure.layout?.scene?.xaxis?.gridcolor || "#eeeeee";
  const layerContrast = figure.data.map((trace) =>
    contrastRatio(traceColor(trace), background, trace.opacity ?? 1)
  );
  return {
    contrast: {
      foreground_on_paper: contrastRatio(
        foreground,
        figure.layout?.paper_bgcolor || "#ffffff",
      ),
      foreground_on_plot: contrastRatio(foreground, background),
      axis_on_plot: contrastRatio(axis, background),
      grid_on_plot: contrastRatio(grid, background),
      categorical_on_plot: layerContrast,
    },
    layer_contrast: layerContrast,
    contrast_basis: {
      background,
      foreground,
      axis,
      grid,
      trace_colors: figure.data.map(traceColor),
    },
  };
}

function finiteValues(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) finiteValues(item, output);
  } else if (typeof value === "number" && Number.isFinite(value)) {
    output.push(value);
  }
  return output;
}

function plotlyBounds(figure, dimension) {
  const answer = {};
  for (const coordinate of dimension === 3 ? ["x", "y", "z"] : ["x", "y"]) {
    const values = figure.data.flatMap((trace) => finiteValues(trace[coordinate]));
    if (values.length > 0) answer[coordinate] = [Math.min(...values), Math.max(...values)];
  }
  return answer;
}

async function inspectSpec(session, expression) {
  const result = await session.evaluate([
    `gallery_spec = ${expression}`,
    "import json",
    "print(json.dumps({",
    "  'plot_spec': json.loads(gallery_spec.to_json()),",
    "  'alt_text': gallery_spec.alt_text(),",
    "  'bounds': gallery_spec.bounds(),",
    "  'validation_codes': [item.code for item in gallery_spec.validate()],",
    "}, sort_keys=True, separators=(',', ':'), ensure_ascii=False))",
  ].join("\n"), { language: "python" });
  return JSON.parse(result.stdout.trim());
}

async function actualFrontendFixture(definition) {
  const { createSage } = require("../../dist/tools/kernel.js");
  const session = await createSage();
  try {
    await session.evaluate(definition.source, { language: definition.frontend });
    const rendered = await session.evaluate(definition.result_expression, {
      language: definition.frontend,
    });
    assert.equal(rendered.display?.mime, "application/vnd.plotly.v1+json");
    const inspected = await inspectSpec(session, definition.spec_expression);
    const plotSpec = inspected.plot_spec;
    assert.equal(plotSpec.provenance.frontend, definition.frontend);
    const figure = rendered.display.data;
    const semanticBounds = inspected.bounds;
    const hasSemanticBounds = Object.keys(semanticBounds).length > 0;
    return {
      id: definition.id,
      frontend: definition.frontend,
      classification: "translated",
      dimension: plotSpec.dimension,
      theme: plotSpec.theme,
      title: definition.title,
      source: definition.source,
      alt_text: inspected.alt_text,
      alt_text_origin: plotSpec.annotations.some((item) => item.kind === "alt_text")
        ? "explicit"
        : "generated",
      bounds: hasSemanticBounds ? semanticBounds : plotlyBounds(figure, plotSpec.dimension),
      bounds_origin: hasSemanticBounds ? "plotspec-semantic" : "plotly-trace",
      validation_codes: inspected.validation_codes,
      plot_spec: plotSpec,
      plotly: figure,
      frontend_evidence: {
        execution: "createSage.evaluate",
        language: definition.frontend,
        spec_expression: definition.spec_expression,
      },
      ...renderedContrast(figure),
    };
  } finally {
    await session.close();
  }
}

async function frontendFixtures() {
  const previous = process.env.SAGEJS_NATIVE_DISABLE;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  try {
    const definitions = [
      {
        id: "wolfram-semantic-2d-notebook",
        frontend: "wolfram",
        title: "Wolfram Graphics semantic 2D primitives",
        source: "g=Graphics[{Blue,Line[{{0,0},{1,1},{2,0}}],Red,Point[{{1,1}}],Black,Text[\"peak\",{1,1}]}];",
        result_expression: "g",
        spec_expression: "g.spec()",
      },
      {
        id: "wolfram-semantic-3d-notebook",
        frontend: "wolfram",
        title: "Wolfram Graphics3D sphere",
        source: "g=Graphics3D[{Red,Sphere[{0,0,0},1]},Boxed->False];",
        result_expression: "g",
        spec_expression: "g.spec()",
      },
      {
        id: "matlab-semantic-2d-notebook",
        frontend: "matlab",
        title: "MATLAB stateful quadratic plot",
        source: "h=plot([0 1 2],[0 1 4],'b-o','LineWidth',3); xlabel('x'); ylabel('y'); title('quadratic'); legend('quadratic'); grid on; snapshot=plotspec(h);",
        result_expression: "gcf()",
        spec_expression: "snapshot",
      },
    ];
    const records = [];
    for (const definition of definitions) {
      records.push(await actualFrontendFixture(definition));
    }
    return records;
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = previous;
  }
}

function fixtureDocument(records) {
  return {
    schema_version: 1,
    product: "sagejs-plotly-gallery",
    renderer: {
      target: "Plotly",
      package: "plotly.js-dist-min",
      version: require("plotly.js-dist-min/package.json").version,
    },
    scope: {
      statement:
        "Sage fixtures exercise checked semantic PlotSpec/Plotly lowering. Wolfram and MATLAB fixtures are executed by their integrated frontends and capture the resulting live PlotSpec and rich Plotly display.",
      frontends: ["sage", "wolfram", "matlab"],
      dimensions: [2, 3],
      themes,
      sage_layer_kinds: ["line", "point", "text", "surface"],
      frontend_fixture_counts: {
        sage: records.filter((record) => record.frontend === "sage").length,
        wolfram: records.filter((record) => record.frontend === "wolfram").length,
        matlab: records.filter((record) => record.frontend === "matlab").length,
      },
    },
    placeholders: [],
    fixtures: records,
  };
}

function geometryExpectation(record) {
  return {
    layer_ids: record.plot_spec.layers.map((layer) => layer.id),
    layer_kinds: record.plot_spec.layers.map((layer) => layer.kind),
    trace_types: record.plotly.data.map((trace) => trace.type),
    bounds: record.bounds,
    trace_count: record.plotly.data.length,
  };
}

function expectationDocument(records) {
  return {
    schema_version: 1,
    policy: {
      pixel_hashes: "forbidden",
      reason:
        "Geometry, semantic structure, responsive layout, and image-container properties survive harmless renderer and font rasterization changes better than pixel hashes.",
      contrast: {
        normal_text_minimum: 4.5,
        axis_and_marks_minimum: 3.0,
        grid_minimum_only_for_high_contrast: 3.0,
      },
      alt_text:
        "Every fixture exposes nonempty semantic alt text. Sage gallery specifications include explicit alt-text annotations; current Wolfram and MATLAB specifications expose generated text and honestly retain PLOT_ALT_TEXT_MISSING until the frontends attach it.",
      browser_dom_boundary:
        "PlotSpec alt text is available, but the current Plotly display bridge does not attach it as a DOM accessible name. Browser evidence records that debt; a future display-lane change must connect the two.",
    },
    viewports,
    static_export_probes: [
      "sage-semantic-2d-notebook",
      "sage-semantic-3d-notebook",
      "wolfram-semantic-2d-notebook",
      "wolfram-semantic-3d-notebook",
      "matlab-semantic-2d-notebook",
    ],
    fixtures: records.map((record) => ({
      id: record.id,
      geometry: geometryExpectation(record),
      accessibility: {
        alt_text_minimum_characters: 40,
        expected_validation_codes: record.alt_text_origin === "generated"
          ? ["PLOT_ALT_TEXT_MISSING"]
          : [],
        foreground_contrast_minimum: 4.5,
        axis_contrast_minimum: 3.0,
        categorical_contrast_minimum: 3.0,
        layer_contrast_minimum: 3.0,
        grid_contrast_minimum:
          record.frontend === "sage" && record.theme === "high-contrast"
            ? 3.0
            : null,
      },
      responsive: {
        expected_widths: viewports.map((viewport) => viewport.width),
        expected_heights: viewports.map((viewport) => viewport.height),
        maximum_overflow_pixels: 1,
        responsive_config: true,
      },
    })),
    static_export: {
      viewport: { width: 800, height: 600 },
      svg: {
        root_element: "svg",
        expected_view_box: "0 0 800 600",
        minimum_bytes: 1000,
        two_dimensional_minimum_paths: 4,
        three_dimensional_minimum_embedded_images: 1,
      },
      png: {
        signature_hex: "89504e470d0a1a0a",
        width: 800,
        height: 600,
        allowed_color_types: [2, 6],
        minimum_bytes: 5000,
      },
    },
  };
}

function performanceDocument(records) {
  const text = stableJson(fixtureDocument(records));
  return {
    schema_version: 1,
    methodology:
      "Budgets are deliberately broad cross-platform regression ceilings, not benchmark claims. Generator timings are printed but are not checked in because host load is not deterministic.",
    workloads: [
      {
        id: "semantic-gallery-generation",
        fixture_count: records.length,
        max_wall_ms: 15000,
        max_checked_fixture_bytes: 500000,
        observed_checked_fixture_bytes: Buffer.byteLength(text),
      },
      {
        id: "warm-browser-responsive-layout",
        fixture_count: records.length,
        viewport_count: viewports.length,
        max_wall_ms: 30000,
        browser_optional: true,
      },
      {
        id: "representative-static-exports",
        fixture_count: 5,
        formats: ["svg", "png"],
        max_wall_ms: 45000,
        max_output_bytes_each: 8000000,
        browser_optional: true,
      },
    ],
  };
}

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
          `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
        commandPath("chrome"),
        commandPath("msedge"),
        commandPath("chromium"),
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

function dataUriBytes(uri) {
  const comma = uri.indexOf(",");
  assert.ok(comma > 0, "Plotly.toImage did not return a data URI");
  const header = uri.slice(0, comma);
  const body = uri.slice(comma + 1);
  return header.includes(";base64")
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");
}

function pngProperties(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return {
    signature_hex: bytes.subarray(0, 8).toString("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bit_depth: bytes[24],
    color_type: bytes[25],
    byte_length: bytes.length,
  };
}

function svgProperties(bytes) {
  const text = bytes.toString("utf8");
  const root = text.match(/<svg\b[^>]*>/)?.[0] || "";
  const attribute = (name) =>
    root.match(new RegExp(`\\b${name}=["']([^"']+)["']`))?.[1] || null;
  return {
    root_element: root.startsWith("<svg") ? "svg" : null,
    width: attribute("width"),
    height: attribute("height"),
    view_box: attribute("viewBox"),
    path_count: (text.match(/<path\b/g) || []).length,
    text_count: (text.match(/<text\b/g) || []).length,
    image_count: (text.match(/<image\b/g) || []).length,
    byte_length: bytes.length,
  };
}

function assertContrast(record, expected) {
  assert.ok(record.alt_text.length >= expected.alt_text_minimum_characters);
  assert.deepEqual(record.validation_codes, expected.expected_validation_codes);
  assert.ok(
    record.contrast.foreground_on_plot >= expected.foreground_contrast_minimum,
  );
  assert.ok(record.contrast.axis_on_plot >= expected.axis_contrast_minimum);
  assert.ok(
    Math.min(...record.contrast.categorical_on_plot) >=
      expected.categorical_contrast_minimum,
  );
  assert.ok(Math.min(...record.layer_contrast) >= expected.layer_contrast_minimum);
  if (expected.grid_contrast_minimum !== null) {
    assert.ok(
      record.contrast.grid_on_plot >= expected.grid_contrast_minimum,
    );
  }
}

async function renderEvidence(records, expectations) {
  const executablePath = discoverChromium();
  if (!executablePath) return null;
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch({ executablePath, headless: true });
  const started = performance.now();
  try {
    const page = await browser.newPage();
    await page.setContent(
      "<!doctype html><style>html,body,#plot{margin:0;width:100%;height:100%;overflow:hidden}</style><div id='plot'></div>",
    );
    await page.addScriptTag({
      path: require.resolve("plotly.js-dist-min/plotly.min.js"),
    });
    const responsive = [];
    for (const record of records) {
      const measurements = [];
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        const measurement = await page.evaluate(async ({ figure, altText }) => {
          const element = document.querySelector("#plot");
          await globalThis.Plotly.react(
            element,
            figure.data,
            figure.layout,
            figure.config,
          );
          const box = element.getBoundingClientRect();
          const svg = element.querySelector("svg.main-svg");
          const canvas = element.querySelector("canvas");
          const accessibleName =
            element.getAttribute("aria-label") ||
            svg?.getAttribute("aria-label") ||
            canvas?.getAttribute("aria-label") ||
            null;
          return {
            width: Math.round(box.width),
            height: Math.round(box.height),
            overflow_x: Math.max(0, document.documentElement.scrollWidth - innerWidth),
            overflow_y: Math.max(0, document.documentElement.scrollHeight - innerHeight),
            modebar_buttons: element.querySelectorAll(".modebar-btn").length,
            plotly_dom_accessible_name: accessibleName,
            semantic_alt_text_present: altText.length > 0,
          };
        }, { figure: record.plotly, altText: record.alt_text });
        measurements.push({ viewport: viewport.id, ...measurement });
      }
      responsive.push({ id: record.id, measurements });
    }

    const staticExports = [];
    for (const id of expectations.static_export_probes) {
      const record = records.find((candidate) => candidate.id === id);
      assert.ok(record, `missing static export fixture ${id}`);
      await page.setViewportSize(expectations.static_export.viewport);
      const images = await page.evaluate(async (figure) => {
        const element = document.querySelector("#plot");
        await globalThis.Plotly.react(
          element,
          figure.data,
          figure.layout,
          figure.config,
        );
        return {
          svg: await globalThis.Plotly.toImage(element, {
            format: "svg",
            width: 800,
            height: 600,
          }),
          png: await globalThis.Plotly.toImage(element, {
            format: "png",
            width: 800,
            height: 600,
          }),
        };
      }, record.plotly);
      staticExports.push({
        id,
        svg: svgProperties(dataUriBytes(images.svg)),
        png: pngProperties(dataUriBytes(images.png)),
      });
    }
    return {
      schema_version: 1,
      renderer: "Plotly.toImage in locally discovered Chromium",
      pixel_hashes_recorded: false,
      responsive,
      static_exports: staticExports,
      elapsed_ms: Math.round((performance.now() - started) * 10) / 10,
    };
  } finally {
    await browser.close();
  }
}

function validateDocuments(records, expectations, performanceBudgets) {
  assert.equal(records.length, themes.length * 2 + 3);
  assert.deepEqual(
    records.map((record) => record.id),
    [
      ...["semantic-2d", "semantic-3d"].flatMap((name) =>
        themes.map((theme) => `sage-${name}-${theme}`),
      ),
      "wolfram-semantic-2d-notebook",
      "wolfram-semantic-3d-notebook",
      "matlab-semantic-2d-notebook",
    ],
  );
  for (const record of records) {
    const expected = expectations.fixtures.find((item) => item.id === record.id);
    assert.ok(expected, `missing expectations for ${record.id}`);
    assertContrast(record, expected.accessibility);
    assert.deepEqual(geometryExpectation(record), expected.geometry);
    assert.equal(record.plotly.config.responsive, true);
    if (record.frontend === "sage") {
      assert.equal(record.plotly.layout.autosize, true);
      assert.ok(record.plot_spec.annotations.some((item) => item.kind === "alt_text"));
      assert.equal(record.alt_text_origin, undefined);
    } else {
      assert.equal(record.frontend_evidence.execution, "createSage.evaluate");
      assert.equal(record.plot_spec.provenance.frontend, record.frontend);
      assert.equal(record.alt_text_origin, "generated");
    }
  }
  const generation = performanceBudgets.workloads.find(
    (item) => item.id === "semantic-gallery-generation",
  );
  assert.ok(generation.observed_checked_fixture_bytes <= generation.max_checked_fixture_bytes);
}

function validateRenderEvidence(evidence, records, expectations) {
  if (evidence === null) return;
  const byId = new Map(expectations.fixtures.map((item) => [item.id, item]));
  for (const result of evidence.responsive) {
    const expected = byId.get(result.id).responsive;
    assert.deepEqual(
      result.measurements.map((item) => item.width),
      expected.expected_widths,
    );
    assert.deepEqual(
      result.measurements.map((item) => item.height),
      expected.expected_heights,
    );
    for (const measurement of result.measurements) {
      assert.ok(measurement.overflow_x <= expected.maximum_overflow_pixels);
      assert.ok(measurement.overflow_y <= expected.maximum_overflow_pixels);
      assert.ok(measurement.modebar_buttons > 0);
      assert.equal(measurement.semantic_alt_text_present, true);
      // This is an explicit product debt, not a false accessibility pass.
      assert.equal(measurement.plotly_dom_accessible_name, null);
    }
  }
  const staticExpected = expectations.static_export;
  for (const output of evidence.static_exports) {
    assert.equal(output.svg.root_element, staticExpected.svg.root_element);
    assert.equal(output.svg.view_box, staticExpected.svg.expected_view_box);
    assert.ok(output.svg.byte_length >= staticExpected.svg.minimum_bytes);
    if (output.id.includes("-2d-")) {
      assert.ok(
        output.svg.path_count >= staticExpected.svg.two_dimensional_minimum_paths,
      );
    } else {
      assert.ok(
        output.svg.image_count >=
          staticExpected.svg.three_dimensional_minimum_embedded_images,
      );
    }
    assert.equal(output.png.signature_hex, staticExpected.png.signature_hex);
    assert.equal(output.png.width, staticExpected.png.width);
    assert.equal(output.png.height, staticExpected.png.height);
    assert.ok(staticExpected.png.allowed_color_types.includes(output.png.color_type));
    assert.ok(output.png.byte_length >= staticExpected.png.minimum_bytes);
  }
  assert.equal(
    evidence.static_exports.length,
    expectations.static_export_probes.length,
  );
  assert.equal(evidence.responsive.length, records.length);
}

async function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write");
  const skipRender = argv.includes("--skip-render");
  const render = !skipRender && (write || argv.includes("--render"));
  const generationStarted = performance.now();
  const records = [...pythonFixtures(), ...await frontendFixtures()];
  const fixtures = fixtureDocument(records);
  const expectations = expectationDocument(records);
  const performanceBudgets = performanceDocument(records);
  validateDocuments(records, expectations, performanceBudgets);
  writeOrCheck(fixturePath, fixtures, write);
  writeOrCheck(expectationPath, expectations, write);
  writeOrCheck(performancePath, performanceBudgets, write);

  let evidence = null;
  if (render) {
    evidence = await renderEvidence(records, expectations);
    if (evidence === null) {
      process.stderr.write(
        "gallery: Chromium unavailable; deterministic semantic checks passed and static rendering was skipped\n",
      );
    } else {
      validateRenderEvidence(evidence, records, expectations);
      const browserBudgets = performanceBudgets.workloads.filter(
        (item) => item.browser_optional,
      );
      assert.ok(
        evidence.elapsed_ms <=
          browserBudgets.reduce((total, item) => total + item.max_wall_ms, 0),
        `warm gallery rendering took ${evidence.elapsed_ms}ms`,
      );
      const exportBudget = browserBudgets.find(
        (item) => item.id === "representative-static-exports",
      );
      for (const output of evidence.static_exports) {
        assert.ok(output.svg.byte_length <= exportBudget.max_output_bytes_each);
        assert.ok(output.png.byte_length <= exportBudget.max_output_bytes_each);
      }
      const checkedEvidence = { ...evidence };
      delete checkedEvidence.elapsed_ms;
      if (write) writeOrCheck(evidencePath, checkedEvidence, true);
      else {
        // The checked file records a representative observation. Live output
        // is validated against ranges, not byte counts or pixel hashes.
        validateRenderEvidence(checkedJson(evidencePath), records, expectations);
      }
    }
  } else if (!write) {
    validateRenderEvidence(checkedJson(evidencePath), records, expectations);
  }
  const generationElapsed = performance.now() - generationStarted;
  const budget = performanceBudgets.workloads.find(
    (item) => item.id === "semantic-gallery-generation",
  );
  assert.ok(
    generationElapsed <= budget.max_wall_ms + (evidence?.elapsed_ms || 0),
    `gallery generation took ${generationElapsed.toFixed(1)}ms`,
  );
  process.stdout.write(JSON.stringify({
    fixture_count: records.length,
    semantic_generation_ms: Math.round((generationElapsed - (evidence?.elapsed_ms || 0)) * 10) / 10,
    rendered: evidence !== null,
    render_ms: evidence?.elapsed_ms || null,
  }) + "\n");
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  dataUriBytes,
  discoverChromium,
  fixtureDocument,
  frontendFixtures,
  geometryExpectation,
  main,
  pngProperties,
  pythonFixtures,
  renderEvidence,
  svgProperties,
  validateDocuments,
  validateRenderEvidence,
};
