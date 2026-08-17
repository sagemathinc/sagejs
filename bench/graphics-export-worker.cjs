"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const {
  discoverChromium,
} = require("../dist/tools/chromium-discovery.js");
const {
  GRAPHICS_EXPORT_LIMITS,
} = require("../dist/tools/graphics-export-contract.js");
const {
  SynchronousPlotlyRenderer,
} = require("../dist/tools/plotly-renderer-client.js");

const RUNS = 3;
const figure = {
  data: [
    {
      type: "scatter",
      mode: "lines+markers",
      x: [0, 1, 2, 3, 4],
      y: [0, 1, 4, 9, 16],
    },
  ],
  layout: { title: { text: "Persistent renderer benchmark" } },
  config: { staticPlot: true },
};
const request = JSON.stringify({
  figure,
  options: { format: "png", width: 640, height: 400, scale: 1 },
});
const svgRequest = JSON.stringify({
  figure,
  options: { format: "svg", width: 640, height: 400, scale: 1 },
});

const coldHelper = join(__dirname, "../dist/tools/plotly-image-renderer.js");
const workerEntry = join(__dirname, "../dist/tools/plotly-renderer-worker.js");
assert.equal(existsSync(coldHelper), true, "cold helper was not compiled");
assert.equal(existsSync(workerEntry), true, "worker entry was not compiled");

const childFigure = JSON.stringify({
  figure: {
    data: figure.data,
    layout: figure.layout,
    config: figure.config,
  },
});

function milliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function assertPng(bytes) {
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
}

function assertIdentical(images) {
  for (const image of images) {
    assertPng(image);
    assert.deepEqual(image, images[0]);
  }
}

function coldImages(executablePath) {
  const images = [];
  const start = process.hrtime.bigint();
  for (let index = 0; index < RUNS; index += 1) {
    const result = spawnSync(process.execPath, [coldHelper], {
      input: request,
      maxBuffer: GRAPHICS_EXPORT_LIMITS.max_output_bytes,
      timeout: GRAPHICS_EXPORT_LIMITS.timeout_ms,
      env: { ...process.env, SAGEJS_CHROMIUM_PATH: executablePath },
    });
    assert.ifError(result.error);
    assert.equal(
      result.status,
      0,
      result.stderr.toString("utf8") || `cold renderer status ${result.status}`,
    );
    images.push(result.stdout);
  }
  return { images, elapsedMs: milliseconds(start) };
}

function warmImages(executablePath) {
  const renderer = new SynchronousPlotlyRenderer({ executablePath });
  const images = [];
  const start = process.hrtime.bigint();
  try {
    for (let index = 0; index < RUNS; index += 1) {
      images.push(renderer.render(request));
    }
    const elapsedMs = milliseconds(start);
    const svg = renderer.render(svgRequest);
    return {
      images,
      svg,
      elapsedMs,
      stats: renderer.stats(),
    };
  } finally {
    renderer.dispose();
  }
}

function beforeExitLifecycle(executablePath) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-renderer-exit-"));
  const filename = join(directory, "exit.png");
  const graphicsExport = join(__dirname, "../dist/tools/graphics-export.js");
  const script = `
const { installNodeGraphicsSaveHook, saveGraphic } = require(${JSON.stringify(graphicsExport)});
const figure = ${childFigure};
installNodeGraphicsSaveHook();
saveGraphic(
  { _rich_repr_() { return { mime: "application/vnd.plotly.v1+json", data: figure.figure }; } },
  process.argv[1],
  { width: 320, height: 240 }
);
`;
  const start = process.hrtime.bigint();
  try {
    const result = spawnSync(process.execPath, ["-e", script, filename], {
      timeout: 15_000,
      env: { ...process.env, SAGEJS_CHROMIUM_PATH: executablePath },
      encoding: "utf8",
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assertPng(readFileSync(filename));
    return milliseconds(start);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const discovery = discoverChromium();
if (!discovery.executablePath) {
  console.log(
    JSON.stringify({
      skipped: true,
      reason: "Chrome, Chromium, or Edge is not installed",
    }),
  );
  process.exit(0);
}

const cold = coldImages(discovery.executablePath);
const warm = warmImages(discovery.executablePath);
assertIdentical(cold.images);
assertIdentical(warm.images);
for (let index = 0; index < RUNS; index += 1) {
  assert.deepEqual(warm.images[index], cold.images[index]);
}
assert.equal(warm.stats.workers_created, 1);
assert.equal(warm.stats.renderer_restarts, 0);
assert.match(warm.svg.toString("utf8"), /^<svg/);
const beforeExitMs = beforeExitLifecycle(discovery.executablePath);

console.log(
  JSON.stringify(
    {
      runs: RUNS,
      bytes_per_image: warm.images[0].length,
      cold_ms: Number(cold.elapsedMs.toFixed(1)),
      warm_ms: Number(warm.elapsedMs.toFixed(1)),
      speedup: Number((cold.elapsedMs / warm.elapsedMs).toFixed(2)),
      identical: true,
      svg_bytes: warm.svg.length,
      before_exit_shutdown_ms: Number(beforeExitMs.toFixed(1)),
      stats: warm.stats,
    },
    null,
    2,
  ),
);
