#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { createServer } = require("node:http");
const os = require("node:os");
const { join, normalize, resolve, sep } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = resolve(__dirname, "../..");
const gallery = join(root, "docs/numerical-computing/gallery");
const evidencePath = join(gallery, "evidence.json");
const htmlPath = join(gallery, "index.html");
const plotlyPath = require.resolve("plotly.js-dist-min");
const sourcePath = join(
  root,
  "test/numerics/gallery/generate-cross-domain-evidence.py",
);
const rendererPath = join(gallery, "gallery.mjs");

function elapsed(start) {
  return Math.round((performance.now() - start) * 1000) / 1000;
}

function digest(paths) {
  const hash = createHash("sha256");
  for (const filename of paths) {
    hash.update(filename.slice(root.length));
    hash.update("\0");
    hash.update(readFileSync(filename));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function discoverChromium() {
  const candidates = [
    process.env.SAGEJS_CHROMIUM_PATH,
    process.env.CHROME_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function contentType(filename) {
  if (filename.endsWith(".html")) return "text/html; charset=utf-8";
  if (filename.endsWith(".css")) return "text/css; charset=utf-8";
  if (filename.endsWith(".mjs") || filename.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filename.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function galleryServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (pathname === "/plotly.min.js") {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      createReadStream(plotlyPath).pipe(response);
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const filename = normalize(join(gallery, relative));
    if (
      !filename.startsWith(`${gallery}${sep}`) ||
      !existsSync(filename) ||
      !statSync(filename).isFile()
    ) {
      response.writeHead(404).end("not found");
      return;
    }
    response.setHeader("content-type", contentType(filename));
    response.setHeader("cache-control", "no-store");
    createReadStream(filename).pipe(response);
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolveClose, rejectClose) =>
      server.close((error) => error ? rejectClose(error) : resolveClose()),
    ),
  };
}

async function browserMeasurement(chromiumPath) {
  if (!chromiumPath) return { status: "skipped", reason: "Chromium not found" };
  const { chromium } = require("playwright-core");
  const host = await galleryServer();
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const started = performance.now();
    await page.goto(host.url, { waitUntil: "networkidle" });
    await page.waitForSelector("html[data-gallery-ready='true']");
    const wall = elapsed(started);
    const browserRecord = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        ready_at_ms: Math.round(performance.now() * 1000) / 1000,
        dom_content_loaded_ms: Math.round(navigation.domContentLoadedEventEnd * 1000) / 1000,
        load_event_ms: Math.round(navigation.loadEventEnd * 1000) / 1000,
        transfer_bytes: navigation.transferSize,
        decoded_body_bytes: navigation.decodedBodySize,
        rendered_figures: Number(document.documentElement.dataset.galleryRenderedCount),
        hydration_ms: Number(document.documentElement.dataset.galleryHydrationMs),
        maximum_single_plot_render_ms: Number(
          document.documentElement.dataset.galleryMaxRenderMs,
        ),
        plotly_nodes: document.querySelectorAll(".js-plotly-plot").length,
      };
    });
    await page.close();
    return { status: "measured", wall_ms: wall, ...browserRecord };
  } finally {
    await browser.close();
    await host.close();
  }
}

async function measure() {
  const renderer = await import(pathToFileURL(rendererPath));
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const generationStarted = performance.now();
  const generated = spawnSync(executable, ["-I", sourcePath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONHASHSEED: "0",
      SAGEJS_NATIVE_DISABLE: "1",
    },
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (generated.error) throw generated.error;
  if (generated.status !== 0) throw new Error(generated.stderr || generated.stdout);
  const generationMs = elapsed(generationStarted);

  const validationStarted = performance.now();
  const bundle = JSON.parse(generated.stdout);
  renderer.assertTimingBudget(
    bundle,
    "max_evidence_generation_ms",
    generationMs,
  );
  const validation = renderer.assertGalleryBudgets(bundle, generated.stdout);
  const parseValidateMs = elapsed(validationStarted);
  renderer.assertTimingBudget(
    bundle,
    "max_parse_and_budget_validation_ms",
    parseValidateMs,
  );

  const htmlStarted = performance.now();
  const html = renderer.buildGalleryDocument(bundle);
  const staticHtmlMs = elapsed(htmlStarted);
  renderer.assertTimingBudget(
    bundle,
    "max_static_html_generation_ms",
    staticHtmlMs,
  );

  const exportStarted = performance.now();
  let exportBytes = 0;
  let exportCount = 0;
  for (const story of bundle.stories) {
    for (const caseRecord of story.cases) {
      if (!caseRecord.presentation) continue;
      exportBytes += Buffer.byteLength(
        renderer.buildPlotSpecExport(bundle, story.id, caseRecord.id),
      );
      exportBytes += Buffer.byteLength(
        renderer.buildPlotlyExport(bundle, story.id, caseRecord.id),
      );
      exportBytes += Buffer.byteLength(
        renderer.buildAccessibleExportHtml(bundle, story.id, caseRecord.id),
      );
      exportCount += 3;
    }
  }
  const exportMs = elapsed(exportStarted);
  renderer.assertTimingBudget(
    bundle,
    "max_all_exports_generation_ms",
    exportMs,
  );
  const chromiumPath = discoverChromium();
  const browser = await browserMeasurement(chromiumPath);
  return {
    schema: "sagejs.numerics.gallery.benchmark/v1",
    source_digest_sha256: digest([
      sourcePath,
      rendererPath,
      join(gallery, "gallery.css"),
      evidencePath,
    ]),
    host: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      cpu: os.cpus()[0]?.model || "unknown",
      logical_cpus: os.cpus().length,
      memory_bytes: os.totalmem(),
      chromium: chromiumPath || null,
    },
    payload: {
      evidence_bytes: statSync(evidencePath).size,
      static_html_bytes: Buffer.byteLength(html),
      css_bytes: statSync(join(gallery, "gallery.css")).size,
      renderer_bytes: statSync(rendererPath).size,
      plotly_distribution_bytes: statSync(plotlyPath).size,
      all_export_bytes: exportBytes,
      ...validation,
    },
    timing: {
      evidence_generation_ms: generationMs,
      parse_and_budget_validation_ms: parseValidateMs,
      static_html_generation_ms: staticHtmlMs,
      all_exports_generation_ms: exportMs,
      export_count: exportCount,
      browser,
    },
    interpretation: {
      solver_and_visualization_generation: "included in evidence_generation_ms",
      browser_wall_scope:
        `navigation, evidence fetch/validation, ${browser.rendered_figures || "bounded"} ` +
        "Plotly renders, and frame registration",
      cache_policy: "one cold browser page in a fresh context; no network CDN",
      claim: "release ceilings are enforced; measurements are not optimization targets",
    },
  };
}

async function main(argv = process.argv.slice(2)) {
  const result = await measure();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  const writeIndex = argv.indexOf("--write");
  if (writeIndex !== -1) {
    const filename = argv[writeIndex + 1];
    if (!filename) throw new Error("--write requires an explicit result path");
    writeFileSync(resolve(process.cwd(), filename), output);
  }
  process.stdout.write(output);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { measure };
