import assert from "node:assert/strict";
import test from "node:test";

import {
  browserGraphicsExportCapabilities,
  renderSageDisplay,
  sageDisplayToImageBytes,
  stabilizePlotlyFigure,
} from "../plotly-renderer.mjs";

const display = {
  mime: "application/vnd.plotly.v1+json",
  data: {
    data: [{ type: "scatter", x: [0, 1], y: [0, 1] }],
    layout: { width: 320, height: 240 },
    config: { displaylogo: false },
  },
};

test("symmetric zero-centered meshes avoid Plotly GL3D normalization failure", () => {
  const trace = {
    type: "mesh3d",
    x: [-1, 0, 1],
    y: [-2, 0, 2],
    z: [-3, 0, 3],
    i: [0],
    j: [1],
    k: [2],
  };
  const figure = { data: [trace], layout: {} };
  const stabilized = stabilizePlotlyFigure(figure);
  assert.notEqual(stabilized, figure);
  assert.notEqual(stabilized.data[0], trace);
  for (const axis of ["x", "y", "z"]) {
    assert.equal(stabilized.data[0][axis].includes(0), false);
    const offset = stabilized.data[0][axis][1];
    assert.ok(offset > 0 && offset < 1e-10);
    assert.deepEqual(
      stabilized.data[0][axis].map((value) => value - offset),
      trace[axis],
    );
  }
  assert.equal(figure.data[0], trace, "the mathematical display payload stays immutable");
  const nonsymmetric = { data: [{ type: "mesh3d", x: [-1, 0, 2] }] };
  assert.equal(stabilizePlotlyFigure(nonsymmetric), nonsymmetric);
});

test("boxed and arbitrary-size numeric display values become Plotly primitives", () => {
  const boxedZero = new Number(0);
  const figure = {
    data: [{
      type: "surface",
      x: [[boxedZero, new Number(1)]],
      y: [[0n, 1n]],
      z: [[new Number(-1), boxedZero]],
    }],
    layout: { width: new Number(320) },
  };
  const normalized = stabilizePlotlyFigure(figure);
  assert.deepEqual(normalized, {
    data: [{
      type: "surface",
      x: [[0, 1]],
      y: [[0, 1]],
      z: [[-1, 0]],
    }],
    layout: { width: 320 },
  });
  assert.equal(typeof normalized.data[0].x[0][0], "number");
  assert.equal(figure.data[0].x[0][0], boxedZero);
  assert.equal(typeof figure.data[0].y[0][0], "bigint");
});

test("LaTeX displays render locally through KaTeX", async () => {
  const calls = [];
  const classes = [];
  const element = {
    classList: { add: (name) => classes.push(name) },
  };
  const katex = {
    render(source, target, options) {
      calls.push({ source, target, options });
    },
  };
  await renderSageDisplay(
    element,
    { mime: "text/latex", data: "$\\displaystyle \\frac{2}{3}$" },
    null,
    katex,
  );
  assert.deepEqual(calls, [{
    source: "\\displaystyle \\frac{2}{3}",
    target: element,
    options: { displayMode: true, throwOnError: false, strict: "warn" },
  }]);
  assert.deepEqual(classes, ["sagejs-latex-display"]);
});

async function withFakeDocument(callback) {
  const previous = globalThis.document;
  const state = { appended: 0, removed: 0 };
  globalThis.document = {
    createElement() {
      return {
        style: {},
        remove() {
          state.removed += 1;
        },
      };
    },
    body: {
      append() {
        state.appended += 1;
      },
    },
  };
  try {
    return await callback(state);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

function fakePlotly(url) {
  const state = { purged: 0, imageOptions: undefined };
  return {
    state,
    async react() {},
    async toImage(_element, options) {
      state.imageOptions = options;
      return url;
    },
    purge() {
      state.purged += 1;
    },
  };
}

test("browser export capabilities require rendering and image operations", () => {
  assert.deepEqual(browserGraphicsExportCapabilities(null), {
    backend: "plotly-browser",
    available: false,
    formats: [],
    dataUrl: false,
    bytes: false,
    missing: ["react", "toImage"],
  });
  assert.deepEqual(browserGraphicsExportCapabilities({ toImage() {} }), {
    backend: "plotly-browser",
    available: false,
    formats: [],
    dataUrl: false,
    bytes: false,
    missing: ["react"],
  });
  assert.deepEqual(
    browserGraphicsExportCapabilities({ react() {}, toImage() {} }),
    {
      backend: "plotly-browser",
      available: true,
      formats: ["png", "jpeg", "webp", "svg"],
      dataUrl: true,
      bytes: true,
      missing: [],
    },
  );
});

test("browser image export returns base64 bytes and defaults to PNG", async () => {
  const plotly = fakePlotly("data:image/png;base64,iVBORw0KGgo=");
  await withFakeDocument(async (documentState) => {
    const bytes = await sageDisplayToImageBytes(display, {}, plotly);
    assert.deepEqual([...bytes], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.deepEqual(plotly.state.imageOptions, { format: "png" });
    assert.equal(plotly.state.purged, 1);
    assert.deepEqual(documentState, { appended: 1, removed: 1 });
  });
});

test("browser image export accepts canonical formats and the JPG alias", async () => {
  for (const [requested, canonical] of [
    ["png", "png"],
    ["jpeg", "jpeg"],
    ["jpg", "jpeg"],
    ["webp", "webp"],
    ["svg", "svg"],
  ]) {
    const plotly = fakePlotly("data:application/octet-stream;base64,AA%3D%3D");
    await withFakeDocument(async () => {
      assert.deepEqual(
        [...await sageDisplayToImageBytes(display, { format: requested }, plotly)],
        [0],
      );
      assert.deepEqual(plotly.state.imageOptions, { format: canonical });
    });
  }
});

test("browser image export decodes percent-encoded SVG without form semantics", async () => {
  const plotly = fakePlotly(
    "data:image/svg+xml,%3Csvg%3Ea+b%20%E2%9C%93%3C%2Fsvg%3E",
  );
  await withFakeDocument(async () => {
    const bytes = await sageDisplayToImageBytes(
      display,
      { filename: "figure.svg", width: 640, scale: 2 },
      plotly,
    );
    assert.equal(new TextDecoder().decode(bytes), "<svg>a+b ✓</svg>");
    assert.deepEqual(plotly.state.imageOptions, {
      format: "svg",
      width: 640,
      scale: 2,
    });
  });
});

test("browser image export rejects malformed data URLs and still cleans up", async () => {
  for (const url of [
    "https://example.test/image.png",
    "data:image/png;base64",
    "data:image/png;base64,",
    "data:image/svg+xml,%xy",
    "data:image/png;base64,AAAA=AAA",
    "data:image/png;base64,%FF",
  ]) {
    const plotly = fakePlotly(url);
    await withFakeDocument(async (documentState) => {
      await assert.rejects(
        sageDisplayToImageBytes(display, {}, plotly),
        /data URL|percent escape|base64/,
      );
      assert.equal(plotly.state.purged, 1);
      assert.deepEqual(documentState, { appended: 1, removed: 1 });
    });
  }
});
