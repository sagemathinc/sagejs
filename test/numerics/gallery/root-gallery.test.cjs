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
const { spawnSync } = require("node:child_process");
const { join, normalize, resolve, sep } = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = resolve(__dirname, "../../..");
const website = join(root, "website/numerical-computing");
const manifestPath = join(website, "gallery-manifest.json");
const storyPath = join(website, "stories/root-finding.json");
const htmlPath = join(website, "index.html");
const cssPath = join(website, "gallery.css");
const modulePath = join(website, "gallery.mjs");
const generator = require("./generate-root-story.cjs");

function json(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

const manifest = json(manifestPath);
const story = json(storyPath);
let galleryModule;

test.before(async () => {
  galleryModule = await import(pathToFileURL(modulePath));
});

test("root story stays generated from current numerical evidence", () => {
  generator.main([]);
  assert.deepEqual(
    story.cases.map(({ id, result }) => ({
      id,
      status: result.status,
      success: result.success,
      validation: result.validation.passed,
      diagnostics: result.diagnostics.map((item) => item.code),
    })),
    [
      { id: "cosine-fixed-point", status: "converged", success: true, validation: true, diagnostics: [] },
      { id: "jump-discontinuity", status: "converged", success: false, validation: false, diagnostics: ["validation_failed"] },
      { id: "invalid-bracket", status: "invalid_bracket", success: false, validation: false, diagnostics: ["invalid_bracket"] },
      { id: "newton-two-cycle", status: "maximum_iterations", success: false, validation: false, diagnostics: ["maximum_iterations"] },
    ],
  );
  const success = story.cases[0];
  assert.equal(success.result.method, "brent");
  assert.equal(success.result.backend, "ordinary-python");
  assert.ok(Math.abs(success.result.value - 0.7390851332151607) < 1e-14);
  assert.equal(success.result.validation.truth_level, "validated_approximate");
  assert.ok(success.result.validation.residual < 1e-12);
  assert.equal(success.verification.method, "bisection");
  assert.equal(success.verification.success, true);
  assert.ok(Math.abs(success.verification.value - success.result.value) < 1e-12);
  const discontinuity = story.cases[1].result;
  assert.equal(discontinuity.status, "converged");
  assert.equal(discontinuity.success, false);
  assert.equal(discontinuity.validation.residual, 1);
  assert.equal(
    discontinuity.trace.events.at(-1).kind,
    "failure",
    "failed validation must override a solver convergence label",
  );
  assert.deepEqual(
    story.cases[3].result.trace.events
      .filter((event) => event.kind === "iteration")
      .map((event) => event.data.candidate),
    [1, 0, 1, 0, 1, 0, 1, 0],
  );
});

test("manifest and story expose an extensible, versioned domain contract", () => {
  const manifestSchema = json(join(
    root,
    "docs/numerical-computing/gallery/manifest.schema.json",
  ));
  const storySchema = json(join(
    root,
    "docs/numerical-computing/gallery/story.schema.json",
  ));
  const resultSchema = json(join(root, "docs/numerical-computing/result.schema.json"));
  assert.equal(manifestSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(storySchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(manifest.kind, "sagejs-numerical-gallery");
  assert.equal(manifest.stories[0].href, "./stories/root-finding.json");
  assert.ok(manifest.stories[0].capabilities.includes("plotspec-json-export"));
  assert.ok(manifest.stories[0].capabilities.includes("plotly-json-export"));
  assert.equal(story.id, manifest.stories[0].id);
  assert.equal(story.operation, manifest.stories[0].operation);
  assert.deepEqual(
    story.cases.map((item) => item.id),
    manifest.stories[0].case_ids,
  );
  assert.deepEqual(
    story.method_assumptions.map((item) => item.method),
    ["bisection", "brent", "secant", "newton"],
  );
  for (const required of storySchema.required) {
    assert.ok(required in story, `story is missing ${required}`);
  }
  for (const caseRecord of story.cases) {
    for (const required of resultSchema.required) {
      assert.ok(required in caseRecord.result, `${caseRecord.id} is missing result.${required}`);
    }
    assert.deepEqual(
      {
        status: caseRecord.result.status,
        success: caseRecord.result.success,
        validation_passed: caseRecord.result.validation.passed,
        diagnostic_codes: caseRecord.result.diagnostics.map((item) => item.code),
      },
      caseRecord.evidence_expectations,
    );
  }
  assert.deepEqual(story.provenance.placeholders, []);
});

test("diagnostic and action prose is selected only through cited evidence", () => {
  const keys = story.cases.map((caseRecord) =>
    galleryModule.buildCaseNarrative(story, caseRecord).key,
  );
  assert.deepEqual(keys, [
    "success",
    "validation_failed",
    "invalid_bracket",
    "maximum_iterations",
  ]);
  for (const caseRecord of story.cases) {
    const narrative = galleryModule.buildCaseNarrative(story, caseRecord);
    assert.ok(narrative.heading.length > 20);
    assert.ok(narrative.action.length > 30);
    assert.ok(narrative.evidence.length >= 4);
    for (const evidence of narrative.evidence) {
      assert.equal(
        evidence.value,
        galleryModule.getPointer(caseRecord, evidence.pointer),
      );
    }
  }
  const mutated = structuredClone(story.cases[0]);
  mutated.result.success = false;
  mutated.result.validation.passed = false;
  mutated.result.diagnostics = [{ code: "validation_failed" }];
  assert.equal(
    galleryModule.buildCaseNarrative(story, mutated).key,
    "validation_failed",
    "changing structured evidence must change the selected narrative",
  );
  assert.throws(
    () => galleryModule.getPointer(story.cases[0], "/result/not_a_field"),
    /missing narrative evidence/,
  );
});

test("trace, frame, sample, story, and animation payload ceilings fail closed", () => {
  const serialized = readFileSync(storyPath, "utf8");
  const measurements = galleryModule.assertStoryBudgets(
    manifest,
    story,
    serialized,
  );
  assert.equal(measurements.story_bytes, Buffer.byteLength(serialized));
  assert.equal(
    measurements.semantic_animation_bytes,
    story.visualization.budget_measurements.semantic_payload_bytes,
  );
  assert.equal(
    measurements.plotly_animation_bytes,
    story.visualization.budget_measurements.plotly_payload_bytes,
  );
  assert.deepEqual(
    measurements.trace_records,
    story.visualization.budget_measurements.trace_records,
  );
  assert.ok(measurements.story_bytes <= manifest.budgets.max_story_bytes);
  assert.equal(measurements.trace_records.length, 5);
  for (const trace of measurements.trace_records) {
    assert.ok(trace.retained_events <= manifest.budgets.max_trace_events_per_result);
    assert.ok(trace.payload_bytes <= manifest.budgets.max_trace_payload_bytes_per_result);
  }
  const tooManyTraceEvents = structuredClone(manifest);
  tooManyTraceEvents.budgets.max_trace_events_per_result = 2;
  assert.throws(
    () => galleryModule.assertStoryBudgets(tooManyTraceEvents, story, serialized),
    /max_trace_events_per_result/,
  );
  const tooManyTraceBytes = structuredClone(manifest);
  tooManyTraceBytes.budgets.max_trace_payload_bytes_per_result = 1000;
  assert.throws(
    () => galleryModule.assertStoryBudgets(tooManyTraceBytes, story, serialized),
    /max_trace_payload_bytes_per_result/,
  );
  const tooSmall = structuredClone(manifest);
  tooSmall.budgets.max_animation_frames = 1;
  assert.throws(
    () => galleryModule.assertStoryBudgets(tooSmall, story, serialized),
    /max_animation_frames/,
  );
  const tooFewSamples = structuredClone(manifest);
  tooFewSamples.budgets.max_samples_per_frame = 100;
  assert.throws(
    () => galleryModule.assertStoryBudgets(tooFewSamples, story, serialized),
    /max_samples_per_frame/,
  );
  const stale = structuredClone(story);
  stale.visualization.budget_measurements.plotly_payload_bytes += 1;
  assert.throws(
    () => galleryModule.assertStoryBudgets(manifest, stale),
    /measurements are stale/,
  );
  const staleTrace = structuredClone(story);
  staleTrace.visualization.budget_measurements.trace_records[0].payload_bytes += 1;
  assert.throws(
    () => galleryModule.assertStoryBudgets(manifest, staleTrace),
    /trace payload measurement is stale/,
  );
  const staleSamples = structuredClone(story);
  staleSamples.visualization.budget_measurements.max_samples_per_frame += 1;
  assert.throws(
    () => galleryModule.assertStoryBudgets(manifest, staleSamples),
    /frame or sample measurements are stale/,
  );
});

test("PlotSpec and Plotly records preserve stable topology and explicit controls", () => {
  const semantic = story.visualization.plot_spec_animation;
  const plotly = story.visualization.plotly;
  assert.equal(semantic.kind, "plot-animation");
  assert.equal(semantic.controls.autoplay, false);
  assert.equal(semantic.controls.loop, false);
  assert.equal(semantic.controls.play, true);
  assert.equal(semantic.controls.pause, true);
  assert.equal(semantic.controls.slider, true);
  assert.equal(semantic.frames.length, 6);
  assert.deepEqual(semantic.topology.layers, [
    { id: "layer-0", kind: "line" },
    { id: "layer-1", kind: "point" },
    { id: "layer-2", kind: "point" },
  ]);
  for (const frame of semantic.frames) {
    assert.deepEqual(frame.layer_ids, ["layer-0", "layer-1", "layer-2"]);
    assert.deepEqual(
      frame.state.value.layers.map(({ id, kind }) => ({ id, kind })),
      semantic.topology.layers,
    );
  }
  assert.equal(plotly.schema, "plotly-compatible/v1");
  assert.equal(plotly.figure.frames.length, semantic.frames.length);
  assert.deepEqual(plotly.figure.layout.meta.stable_layer_ids, [
    "layer-0",
    "layer-1",
    "layer-2",
  ]);
  assert.deepEqual(
    plotly.figure.frames.map((frame) => frame.name),
    semantic.frames.map((frame) => frame.id),
  );
  assert.deepEqual(
    plotly.figure.frames[0].data.map((trace) => trace.uid),
    ["layer-0", "layer-1", "layer-2"],
  );
  assert.equal(plotly.shared_lowering.status, "blocked");
  assert.match(plotly.shared_lowering.message, /axes field='x'/);
  assert.match(plotly.shared_lowering.integration_request, /xaxis\/yaxis/);
});

test("all language examples are exact frontend syntax and Python executes", () => {
  assert.deepEqual(Object.keys(story.language_examples), [
    "sage",
    "python",
    "matlab",
    "wolfram",
  ]);
  assert.match(story.language_examples.sage.source, /cos\(x\) - x/);
  assert.match(story.language_examples.python.source, /import math/);
  assert.equal(
    story.language_examples.matlab.source,
    "result = fzero(@(x) cos(x) - x, [0 1]);",
  );
  assert.equal(
    story.language_examples.wolfram.source,
    "result = FindRoot[Cos[x] == x, {x, 0, 1}]",
  );
  const source = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
${story.language_examples.python.source}
assert result.success
assert abs(result.value - 0.7390851332151607) < 1e-14
`;
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const execution = spawnSync(executable, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 120_000,
  });
  if (execution.error) throw execution.error;
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
});

test("static HTML remains a complete, accessible no-animation lesson", () => {
  const html = readFileSync(htmlPath, "utf8");
  const css = readFileSync(cssPath, "utf8");
  assert.match(html, /<main id="root-finding">/);
  assert.match(html, /<svg id="root-plot"[^>]+role="img"[^>]+aria-labelledby=/);
  assert.match(html, /<desc id="root-plot-description">[^<]{100,}<\/desc>/);
  assert.match(html, /<caption>Every retained Brent iteration/);
  assert.equal((html.match(/<tr><th scope="row">[1-6]<\/th>/g) || []).length, 6);
  assert.match(html, /<noscript>/);
  assert.match(html, /id="play-animation"[^>]+disabled/);
  assert.match(html, /id="iteration-slider"[^>]+disabled/);
  assert.match(html, /id="export-plotspec"[^>]+disabled/);
  assert.match(html, /Read all examples without the tab interface/);
  assert.match(html, /fzero\(@\(x\) cos\(x\) - x, \[0 1\]\)/);
  assert.match(html, /FindRoot\[Cos\[x\] == x, \{x, 0, 1\}\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /overflow-x: auto/);
  assert.doesNotMatch(html, /autoplay/i);
});

test("exports remain quantitative, static, and portable", () => {
  const html = galleryModule.buildAccessibleExportHtml(story, 5);
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /role="img"/);
  assert.match(html, /<desc id="export-plot-desc">/);
  assert.match(html, /Every retained iteration/);
  assert.equal((html.match(/<tr><th scope="row">/g) || []).length, 6);
  const plotly = JSON.parse(galleryModule.buildPlotlyExport(story));
  const plotSpec = JSON.parse(galleryModule.buildPlotSpecExport(story));
  assert.deepEqual(plotSpec, story.visualization.plot_spec_animation);
  assert.equal(plotSpec.kind, "plot-animation");
  assert.equal(plotly.frames.length, 6);
  assert.equal(plotly.config.responsive, true);
  assert.equal(plotly.layout.updatemenus[0].buttons[0].label, "Play");
  assert.equal(plotly.layout.updatemenus[0].buttons[1].label, "Pause");
  assert.equal(plotly.layout.sliders[0].steps.length, 6);
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
  if (filename.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function galleryServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const filename = normalize(join(website, relative));
    if (!filename.startsWith(`${website}${sep}`) || !existsSync(filename) || !statSync(filename).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.setHeader("content-type", contentType(filename));
    response.setHeader("cache-control", "no-store");
    createReadStream(filename).pipe(response);
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
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
  "Chromium renders interaction, reduced motion, and the no-script fallback",
  { skip: !chromiumPath, timeout: 45_000 },
  async () => {
    const { chromium } = require("playwright-core");
    const host = await galleryServer();
    const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 360, height: 760 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(host.url, { waitUntil: "networkidle" });
      await page.waitForSelector("html[data-gallery='ready']");
      assert.equal(await page.locator("#root-plot path.plot-function").count(), 1);
      assert.equal(await page.locator("#root-plot circle.plot-bracket").count(), 2);
      assert.equal(await page.locator("#root-plot polygon.plot-candidate").count(), 1);
      await page.locator("#iteration-slider").fill("5");
      assert.match(await page.locator("#frame-output").textContent(), /Iteration 6 of 6/);
      await page.locator("[data-case='jump-discontinuity']").click();
      assert.match(await page.locator("#narrative-heading").textContent(), /not a validated root/i);
      assert.match(await page.locator("#narrative-evidence").textContent(), /validation\/passed/);
      assert.equal(await page.locator("#export-plotly").isEnabled(), true);
      assert.equal(await page.locator("#export-plotspec").isEnabled(), true);
      assert.equal(await page.locator("#export-html").isEnabled(), true);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth,
      );
      assert.ok(overflow <= 0, `mobile page overflows by ${overflow}px`);
      assert.deepEqual(errors, []);
      await page.close();

      const reduced = await browser.newPage({ viewport: { width: 800, height: 700 } });
      await reduced.emulateMedia({ reducedMotion: "reduce" });
      await reduced.goto(host.url, { waitUntil: "networkidle" });
      await reduced.waitForSelector("html[data-gallery='ready']");
      assert.equal(await reduced.locator("#play-animation").isDisabled(), true);
      assert.equal(await reduced.locator("#iteration-slider").isEnabled(), true);
      await reduced.close();

      const noScriptContext = await browser.newContext({ javaScriptEnabled: false });
      const noScript = await noScriptContext.newPage();
      await noScript.goto(host.url, { waitUntil: "domcontentloaded" });
      assert.equal(await noScript.locator("#trace-body tr").count(), 6);
      assert.equal(await noScript.locator("#root-plot desc").count(), 1);
      assert.equal(await noScript.locator("#play-animation").isDisabled(), true);
      assert.match(await noScript.locator("noscript").textContent(), /JavaScript is off/);
      await noScriptContext.close();
    } finally {
      await browser.close();
      await host.close();
    }
  },
);
