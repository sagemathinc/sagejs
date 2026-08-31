#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} = require("node:fs");
const { createServer } = require("node:http");
const { join, normalize, resolve, sep } = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = resolve(__dirname, "../../..");
const gallery = join(root, "docs/numerical-computing/gallery");
const evidencePath = join(gallery, "evidence.json");
const htmlPath = join(gallery, "index.html");
const cssPath = join(gallery, "gallery.css");
const modulePath = join(gallery, "gallery.mjs");
const plotlyPath = require.resolve("plotly.js-dist-min");
const generator = require("./generate-cross-domain-gallery.cjs");

const evidenceText = readFileSync(evidencePath, "utf8");
const bundle = JSON.parse(evidenceText);
let renderer;

test.before(async () => {
  renderer = await import(pathToFileURL(modulePath));
});

test("checked gallery is generated from current numerical contracts", async () => {
  await generator.main([]);
  assert.equal(bundle.schema, "sagejs.numerics.gallery.bundle/v1");
  assert.deepEqual(bundle.story_order, [
    "root-brent",
    "nonlinear-fit",
    "ode-adaptivity",
    "linear-refinement",
    "adaptive-quadrature",
    "runge-approximation",
    "spectral-conditioning",
    "optimization-path",
    "robust-regression",
  ]);
  assert.equal(bundle.measurements.story_count, 9);
  assert.equal(bundle.measurements.case_count, 18);
  assert.equal(bundle.measurements.animated_case_count, 13);
  const statuses = Object.fromEntries(bundle.stories.flatMap((story) =>
    story.cases.map((caseRecord) => [
      `${story.id}/${caseRecord.id}`,
      [caseRecord.kind, caseRecord.result.status, caseRecord.result.success],
    ]),
  ));
  assert.deepEqual(statuses["root-brent/jump-discontinuity"], [
    "failure", "converged", false,
  ]);
  assert.deepEqual(statuses["nonlinear-fit/model-domain-error"], [
    "failure", "callback_error", false,
  ]);
  assert.deepEqual(statuses["ode-adaptivity/stiff-explicit-budget"], [
    "failure", "maximum_evaluations", false,
  ]);
  assert.deepEqual(statuses["runge-approximation/runge-equispaced"], [
    "failure", "converged", true,
  ], "Runge is an approximation-design failure, not a false solver status");
  assert.deepEqual(statuses["spectral-conditioning/near-defective-basis"], [
    "failure", "validation_failed", false,
  ]);
});

test("resource receipts are exact, bounded, and fail closed", () => {
  const measurements = renderer.assertGalleryBudgets(bundle, evidenceText);
  assert.deepEqual(measurements, {
    bundle_bytes: Buffer.byteLength(evidenceText),
    story_count: 9,
    case_count: 18,
    animated_case_count: 13,
  });
  assert.ok(measurements.bundle_bytes < bundle.budgets.max_bundle_bytes);
  for (const story of bundle.stories) {
    assert.ok(story.measurements.story_bytes <= bundle.budgets.max_story_bytes);
    assert.ok(
      story.measurements.max_animation_frames <=
      bundle.budgets.max_animation_frames,
    );
    assert.ok(
      story.measurements.max_frame_scalars <=
      bundle.budgets.max_scalars_per_frame,
    );
  }

  const tooSmall = structuredClone(bundle);
  tooSmall.budgets.max_animation_frames = 1;
  assert.throws(
    () => renderer.assertGalleryBudgets(tooSmall),
    /max_animation_frames/,
  );
  const staleFrameReceipt = structuredClone(bundle);
  staleFrameReceipt.stories[0].measurements.max_animation_frames += 1;
  assert.throws(
    () => renderer.assertGalleryBudgets(staleFrameReceipt),
    /max_animation_frames measurement is stale/,
  );
  const stalePayloadReceipt = structuredClone(bundle);
  stalePayloadReceipt.stories[0].measurements.max_plotly_bytes = 1;
  assert.throws(
    () => renderer.assertGalleryBudgets(stalePayloadReceipt),
    /max_plotly_bytes measurement is stale/,
  );
  const changedText = `${evidenceText} `;
  assert.throws(
    () => renderer.assertGalleryBudgets(bundle, changedText),
    /bundle byte measurement is stale/,
  );
});

test("every presentation is computed evidence and callback counts stay frozen", () => {
  let presentations = 0;
  for (const story of bundle.stories) {
    for (const caseRecord of story.cases) {
      for (const pointer of caseRecord.evidence) {
        assert.notEqual(renderer.getPointer(caseRecord, pointer), undefined);
      }
      const presentation = caseRecord.presentation;
      if (!presentation) continue;
      presentations += 1;
      assert.equal(presentation.computed_evidence_only, true);
      assert.equal(presentation.callback_reevaluated, false);
      assert.equal(presentation.plotly.shared_lowering.status, "available");
      assert.equal(
        presentation.callback_count_before,
        presentation.callback_count_after,
      );
      assert.equal(presentation.plotly.schema, "plotly-compatible/v1");
      assert.ok(presentation.static_description.length > 40);
      if (!presentation.plot_animation) continue;
      assert.equal(presentation.plot_animation.controls.autoplay, false);
      assert.ok(presentation.plot_animation.frames.length >= 2);
      for (const frame of presentation.plot_animation.frames) {
        assert.notEqual(frame.metadata.interpolated, true);
      }
      assert.deepEqual(
        presentation.plotly.figure.frames.map((frame) => frame.name),
        presentation.plot_animation.frames.map((frame) => frame.id),
      );
    }
  }
  assert.equal(presentations, 17);

  const root = renderer.caseById(
    bundle,
    "root-brent",
    "cosine-fixed-point",
  ).caseRecord.presentation;
  assert.match(root.source, /retained-evidence/);
  assert.equal(root.public_surface_gap, null);
  assert.equal(root.plot_animation.metadata.callback_reevaluated, false);
  assert.equal(root.plot_animation.metadata.computed_evidence_only, true);

  const optimized = renderer.caseById(
    bundle,
    "optimization-path",
    "rosenbrock-convergence",
  ).caseRecord.presentation.plot_animation;
  assert.equal(optimized.frames.length, 32);
  assert.equal(optimized.metadata.gallery_decimated, true);
  assert.equal(optimized.metadata.source_frame_count, 128);
  assert.equal(optimized.metadata.source_progress_states, 157);
  assert.equal(optimized.metadata.retained_progress_states, 127);
  assert.deepEqual(
    optimized.metadata.selected_source_indices.slice(0, 2),
    [0, 4],
  );
  assert.equal(optimized.metadata.selected_source_indices.at(-1), 127);
  assert.equal(optimized.metadata.interpolation, "none");
});

test("failure stories cite real distinctions instead of cosmetic warnings", () => {
  const failures = bundle.stories.map((story) =>
    story.cases.find((item) => item.kind === "failure"),
  );
  assert.equal(failures.length, 9);
  assert.equal(failures.filter((item) => !item.result.success).length, 8);
  const discontinuity = failures.find((item) => item.id === "jump-discontinuity");
  assert.equal(discontinuity.result.validation.residual, 1);
  assert.equal(discontinuity.result.validation.passed, false);
  const runge = failures.find((item) => item.id === "runge-equispaced");
  assert.ok(runge.teaching_metrics.max_grid_error > 10);
  assert.equal(runge.result.validation.passed, true);
  assert.match(runge.static_description, /design failure/);
  const spectral = failures.find((item) => item.id === "near-defective-basis");
  assert.ok(spectral.result.diagnostics.some((item) =>
    item.code === "validation_failed"
  ));
});

test("static document is a complete accessible lesson before JavaScript", () => {
  const html = readFileSync(htmlPath, "utf8");
  const css = readFileSync(cssPath, "utf8");
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/class="gallery-story"/g) || []).length, 9);
  assert.equal((html.match(/class="gallery-case /g) || []).length, 18);
  assert.equal((html.match(/<caption>Structured numerical evidence/g) || []).length, 18);
  assert.equal((html.match(/data-gallery-plot=/g) || []).length, 17);
  assert.equal((html.match(/role="img"/g) || []).length, 17);
  assert.match(html, /<noscript>/);
  assert.match(html, /All explanations and result tables are already present/);
  assert.match(html, /Runge phenomenon/);
  assert.match(html, /nearly defective matrix/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /overflow-x: auto/);
});

test("PlotSpec, Plotly, and accessible HTML exports are detached and useful", () => {
  const plotSpec = JSON.parse(renderer.buildPlotSpecExport(
    bundle,
    "ode-adaptivity",
    "harmonic-oscillator",
  ));
  const plotly = JSON.parse(renderer.buildPlotlyExport(
    bundle,
    "ode-adaptivity",
    "harmonic-oscillator",
  ));
  const html = renderer.buildAccessibleExportHtml(
    bundle,
    "ode-adaptivity",
    "harmonic-oscillator",
  );
  assert.equal(plotSpec.kind, "plot-animation");
  assert.equal(plotSpec.frames.length, 32);
  assert.equal(plotly.frames.length, 32);
  assert.equal(plotly.layout.updatemenus[0].buttons[0].label, "Play");
  assert.equal(plotly.layout.updatemenus[0].buttons[1].label, "Pause");
  assert.equal(plotly.layout.sliders[0].steps.length, 32);
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /role="img"/);
  assert.match(html, /Structured numerical evidence/);
});

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
  if (filename.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filename.endsWith(".js")) return "text/javascript; charset=utf-8";
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
    if (filename === htmlPath) {
      const html = readFileSync(filename, "utf8").replace(
        "<script type=\"module\">",
        "<script src=\"/plotly.min.js\"></script><script type=\"module\">",
      );
      response.end(html);
      return;
    }
    createReadStream(filename).pipe(response);
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen)
  );
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolveClose, rejectClose) =>
      server.close((error) => error ? rejectClose(error) : resolveClose()),
    ),
  };
}

const chromiumPath = discoverChromium();

test(
  "Chromium renders all evidence figures with Plotly and preserves no-script access",
  { skip: !chromiumPath, timeout: 90_000 },
  async () => {
    const { chromium } = require("playwright-core");
    const host = await galleryServer();
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
    });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(host.url, { waitUntil: "networkidle" });
      await page.waitForSelector("html[data-gallery-ready='true']");
      assert.equal(
        await page.getAttribute("html", "data-gallery-rendered-count"),
        "17",
      );
      assert.equal(await page.locator(".js-plotly-plot").count(), 17);
      assert.equal(await page.locator(".gallery-story").count(), 9);
      assert.equal(await page.locator(".gallery-case").count(), 18);
      assert.equal(
        await page.locator(
          "#plot-optimization-path-rosenbrock-convergence .slider-container",
        ).count(),
        1,
      );
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth
      );
      assert.ok(overflow <= 1, `mobile page overflows by ${overflow}px`);
      assert.deepEqual(errors, []);
      await page.close();

      const reduced = await browser.newPage({ viewport: { width: 900, height: 700 } });
      await reduced.emulateMedia({ reducedMotion: "reduce" });
      await reduced.goto(host.url, { waitUntil: "networkidle" });
      await reduced.waitForSelector("html[data-gallery-ready='true']");
      assert.equal(
        await reduced.evaluate(() =>
          matchMedia("(prefers-reduced-motion: reduce)").matches
        ),
        true,
      );
      assert.equal(
        await reduced.getAttribute("html", "data-gallery-rendered-count"),
        "17",
      );
      await reduced.close();

      const context = await browser.newContext({ javaScriptEnabled: false });
      const noScript = await context.newPage();
      await noScript.goto(host.url, { waitUntil: "domcontentloaded" });
      assert.equal(await noScript.locator(".gallery-story").count(), 9);
      assert.equal(await noScript.locator(".gallery-case").count(), 18);
      assert.equal(await noScript.locator("table").count(), 18);
      assert.equal(await noScript.locator("[role='img']").count(), 17);
      assert.match(await noScript.locator("noscript").textContent(), /JavaScript is off/);
      await context.close();
    } finally {
      await browser.close();
      await host.close();
    }
  },
);
