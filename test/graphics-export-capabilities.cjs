// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const { discoverChromium } = require(
  "../dist/tools/chromium-discovery.js",
);
const {
  createNodeGraphicsExportCapabilities,
  GRAPHICS_EXPORT_LIMITS,
  GraphicsExportError,
  requireGraphicsExportFormat,
  validateGraphicsImageRequest,
} = require("../dist/tools/graphics-export-contract.js");
const {
  nodeGraphicsExportCapabilities,
  saveGraphic,
} = require("../dist/tools/graphics-export.js");

function testExportCapabilities() {
  const windowsEdge =
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe";
  const windowsDiscovery = discoverChromium({
    platform: "win32",
    env: {
      PROGRAMFILES: "C:\\Program Files",
      "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
      LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
    },
    exists: (filename) => filename === windowsEdge,
    commandPath: () => undefined,
  });
  assert.deepEqual(windowsDiscovery, {
    available: true,
    executablePath: windowsEdge,
    source: "conventional-path",
  });

  const commandDiscovery = discoverChromium({
    platform: "linux",
    env: {},
    exists: (filename) => filename === "/opt/chromium",
    commandPath: (command) =>
      command === "chromium" ? "/opt/chromium" : undefined,
  });
  assert.equal(commandDiscovery.source, "command");
  assert.equal(commandDiscovery.executablePath, "/opt/chromium");

  const invalidConfigured = discoverChromium({
    platform: "linux",
    env: { SAGEJS_CHROMIUM_PATH: "/missing/chromium" },
    exists: () => false,
    commandPath: () => "/usr/bin/chromium",
  });
  assert.deepEqual(invalidConfigured, {
    available: false,
    configuredBy: "SAGEJS_CHROMIUM_PATH",
    reason: "configured-path-missing",
  });

  const missing = createNodeGraphicsExportCapabilities(
    { available: false, reason: "not-found" },
    false,
  );
  assert.equal(missing.schema_version, 1);
  assert.equal(missing.host, "node");
  assert.equal(missing.formats.json.available, true);
  assert.equal(missing.formats.html.available, true);
  assert.equal(missing.formats.png.available, false);
  assert.equal(
    missing.formats.png.unavailable.code,
    "SAGEJS_GRAPHICS_BROWSER_UNAVAILABLE",
  );
  assert.equal(JSON.stringify(missing).includes("executablePath"), false);
  assert.throws(
    () => requireGraphicsExportFormat("png", missing),
    (error) =>
      error instanceof GraphicsExportError &&
      error.code === "SAGEJS_GRAPHICS_BROWSER_UNAVAILABLE" &&
      error.alternatives.includes("html") &&
      /SAGEJS_CHROMIUM_PATH/.test(error.message),
  );

  const directory = mkdtempSync(join(tmpdir(), "sagejs-export-contract-"));
  const previousChromiumPath = process.env.SAGEJS_CHROMIUM_PATH;
  process.env.SAGEJS_CHROMIUM_PATH = "/definitely/missing/chromium";
  try {
    const graphic = {
      _rich_repr_() {
        return {
          mime: "application/vnd.plotly.v1+json",
          data: { data: [], layout: {} },
        };
      },
    };
    const jsonFilename = join(directory, "browser-free.json");
    const htmlFilename = join(directory, "browser-free.html");
    const pngFilename = join(directory, "unavailable.png");
    saveGraphic(graphic, jsonFilename);
    saveGraphic(graphic, htmlFilename);
    assert.deepEqual(JSON.parse(readFileSync(jsonFilename, "utf8")).data, []);
    assert.match(readFileSync(htmlFilename, "utf8"), /Plotly\.newPlot/);
    assert.throws(
      () => saveGraphic(graphic, pngFilename),
      (error) =>
        error instanceof GraphicsExportError &&
        error.code === "SAGEJS_GRAPHICS_BROWSER_UNAVAILABLE" &&
        error.message.includes("SAGEJS_CHROMIUM_PATH") &&
        error.alternatives.includes("json"),
    );
    assert.equal(existsSync(pngFilename), false);
  } finally {
    if (previousChromiumPath === undefined) {
      delete process.env.SAGEJS_CHROMIUM_PATH;
    } else {
      process.env.SAGEJS_CHROMIUM_PATH = previousChromiumPath;
    }
    rmSync(directory, { recursive: true, force: true });
  }

  const limitDirectory = mkdtempSync(join(tmpdir(), "sagejs-export-limit-"));
  process.env.SAGEJS_CHROMIUM_PATH = process.execPath;
  try {
    const oversizedFilename = join(limitDirectory, "oversized.png");
    assert.throws(
      () =>
        saveGraphic(
          {
            _rich_repr_() {
              return {
                mime: "application/vnd.plotly.v1+json",
                data: { data: [], layout: {} },
              };
            },
          },
          oversizedFilename,
          { width: GRAPHICS_EXPORT_LIMITS.max_dimension + 1 },
        ),
      (error) =>
        error instanceof GraphicsExportError &&
        error.code === "SAGEJS_GRAPHICS_EXPORT_LIMIT" &&
        error.message.includes("width"),
    );
    assert.equal(existsSync(oversizedFilename), false);
  } finally {
    if (previousChromiumPath === undefined) {
      delete process.env.SAGEJS_CHROMIUM_PATH;
    } else {
      process.env.SAGEJS_CHROMIUM_PATH = previousChromiumPath;
    }
    rmSync(limitDirectory, { recursive: true, force: true });
  }

  const present = createNodeGraphicsExportCapabilities(
    {
      available: true,
      executablePath: "/opt/chromium",
      source: "command",
    },
    false,
  );
  assert.equal(present.formats.png.available, true);
  assert.equal(present.formats.svg.available, true);
  assert.match(present.formats.svg.caveats[0], /WebGL/);
  assert.equal(requireGraphicsExportFormat("png", present).backend, "chromium");

  const sea = createNodeGraphicsExportCapabilities(
    { available: true, executablePath: "/opt/chromium" },
    true,
  );
  assert.equal(sea.formats.html.available, true);
  assert.equal(sea.formats.png.available, false);
  assert.equal(
    sea.formats.png.unavailable.code,
    "SAGEJS_GRAPHICS_STATIC_EXPORT_UNAVAILABLE_SEA",
  );

  assert.deepEqual(
    validateGraphicsImageRequest(
      { layout: { width: 640, height: 480 } },
      "png",
      { scale: 2 },
      1024,
    ),
    { format: "png", width: 640, height: 480, scale: 2 },
  );
  for (const [figure, options, requestBytes, fragment] of [
    [{ layout: { width: 8193 } }, {}, 0, "width"],
    [{ layout: {} }, { scale: 5 }, 0, "scale"],
    [
      { layout: { width: 8192, height: 8192 } },
      { scale: 2 },
      0,
      "rendered pixels",
    ],
    [
      { layout: {} },
      {},
      GRAPHICS_EXPORT_LIMITS.max_request_bytes + 1,
      "serialized plot",
    ],
  ]) {
    assert.throws(
      () =>
        validateGraphicsImageRequest(
          figure,
          "png",
          options,
          requestBytes,
        ),
      (error) =>
        error instanceof GraphicsExportError &&
        error.code === "SAGEJS_GRAPHICS_EXPORT_LIMIT" &&
        error.message.includes(fragment),
    );
  }

  const local = nodeGraphicsExportCapabilities();
  assert.equal(local.formats.json.available, true);
  assert.equal(local.formats.html.available, true);
  return local;
}

if (require.main === module) {
  testExportCapabilities();
  console.log("Graphics export capability tests passed");
}

module.exports = { testExportCapabilities };
