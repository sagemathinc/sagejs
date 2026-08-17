import assert from "node:assert/strict";
import test from "node:test";

import {
  browserGraphicsExportCapabilities,
  sageDisplayToImageBytes,
} from "../plotly-renderer.mjs";

const display = {
  mime: "application/vnd.plotly.v1+json",
  data: {
    data: [{ type: "scatter", x: [0, 1], y: [0, 1] }],
    layout: { width: 320, height: 240 },
    config: { displaylogo: false },
  },
};

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
