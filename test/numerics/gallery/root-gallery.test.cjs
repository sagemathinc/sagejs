#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
} = require("node:fs");
const { createServer } = require("node:http");
const { join, normalize, resolve, sep } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const Ajv2020 = require("ajv/dist/2020").default;

const root = resolve(__dirname, "../../..");
const canonical = join(root, "docs/numerical-computing/gallery");
const website = join(root, "website/numerical-computing");
const evidenceText = readFileSync(join(website, "evidence.json"), "utf8");
const bundle = JSON.parse(evidenceText);
const manifest = JSON.parse(
  readFileSync(join(website, "gallery-manifest.json"), "utf8"),
);
const generator = require("./generate-cross-domain-gallery.cjs");
const rootStoryGenerator = require("./generate-root-story.cjs");
let renderer;

function rootStorySchemaValidator() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: false,
  });
  for (const name of ["diagnostic", "trace"]) {
    const schema = JSON.parse(readFileSync(
      join(root, "docs/numerical-computing", `${name}.schema.json`),
      "utf8",
    ));
    ajv.addSchema({ ...schema, $id: `https://sagejs.org/${name}.schema.json` });
  }
  const resultSchema = JSON.parse(readFileSync(
    join(root, "docs/numerical-computing/result.schema.json"),
    "utf8",
  ));
  ajv.addSchema({
    ...resultSchema,
    $id: "https://sagejs.org/result.schema.json",
  });
  const storySchema = JSON.parse(readFileSync(
    join(canonical, "story.schema.json"),
    "utf8",
  ));
  return ajv.compile(storySchema);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function decodeOpenUrl(value) {
  const url = new URL(value);
  assert.equal(url.origin, "https://app.sagejs.org");
  const encoded = new URLSearchParams(url.hash.slice(1)).get("code");
  assert.ok(encoded, "Open in Sage.js URL has no source");
  return Buffer.from(encoded, "base64url").toString("utf8");
}

test.before(async () => {
  renderer = await import(pathToFileURL(join(website, "gallery.mjs")));
});

test("public assets are exact generated copies of the checked gallery", async () => {
  await generator.main([]);
  for (const filename of ["evidence.json", "index.html", "gallery.mjs", "gallery.css"]) {
    assert.deepEqual(
      readFileSync(join(website, filename)),
      readFileSync(join(canonical, filename)),
      `${filename} diverged from the checked gallery`,
    );
  }
});

test("public manifest inventories every story and pins deployment resources", () => {
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.kind, "sagejs-numerical-gallery");
  assert.deepEqual(manifest.story_order, bundle.story_order);
  assert.equal(manifest.stories.length, 9);
  assert.equal(manifest.measurements.story_count, 9);
  assert.equal(manifest.measurements.case_count, 18);
  assert.equal(manifest.measurements.animated_case_count, 13);
  assert.deepEqual(manifest.budgets, bundle.budgets);
  for (const [entry, story] of manifest.stories.map((entry, index) => [
    entry,
    bundle.stories[index],
  ])) {
    assert.equal(entry.id, story.id);
    assert.equal(entry.entrypoint, `./index.html#${story.id}`);
    assert.deepEqual(entry.case_ids, story.cases.map((item) => item.id));
    assert.ok(entry.capabilities.includes("fresh-sagejs-example"));
    assert.ok(
      entry.capabilities.includes(
        "play-pause-step-restart-speed-iteration-controls",
      ),
    );
  }

  const plotly = readFileSync(join(website, "plotly.min.js"));
  assert.equal(manifest.plotly.package, "plotly.js-dist-min");
  assert.equal(manifest.plotly.version, "3.7.0");
  assert.equal(manifest.plotly.bytes, plotly.byteLength);
  assert.equal(manifest.plotly.sha256, sha256(plotly));
  assert.ok(
    plotly.byteLength <=
      manifest.deployment_budgets.max_plotly_distribution_bytes,
  );
  assert.ok(
    manifest.measurements.gallery_runtime_bytes <=
      manifest.deployment_budgets.max_gallery_runtime_bytes,
  );
  assert.match(
    readFileSync(join(website, "plotly.LICENSE.txt"), "utf8"),
    /MIT License/,
  );
  const rootEntry = manifest.stories.find((entry) => entry.id === "root-brent");
  assert.ok(rootEntry.capabilities.includes("retained-reference-method-comparison"));
  for (const entry of manifest.stories.filter((entry) => entry.id !== "root-brent")) {
    assert.equal(
      entry.capabilities.includes("retained-reference-method-comparison"),
      false,
    );
  }
});

test("the detailed root story retains its independent bisection result", () => {
  const story = rootStoryGenerator.main([]);
  const validate = rootStorySchemaValidator();
  assert.equal(validate(story), true, JSON.stringify(validate.errors));
  const success = story.cases.find((item) => item.id === "cosine-fixed-point");
  const comparison = success.reference_comparison;
  const reference = comparison.reference_result;

  assert.equal(comparison.schema, "sagejs.numerics.reference-comparison/v1");
  assert.equal(comparison.primary.method, "brent");
  assert.equal(comparison.reference.method, "bisection");
  assert.equal(success.verification, undefined);
  assert.equal(comparison.primary.value, success.result.value);
  assert.equal(comparison.reference.value, reference.value);
  assert.equal(comparison.primary.residual, success.result.validation.residual);
  assert.equal(comparison.reference.residual, reference.validation.residual);
  assert.equal(
    comparison.agreement.absolute_value_difference,
    Math.abs(success.result.value - reference.value),
  );
  assert.equal(comparison.agreement.threshold, 1e-12);
  assert.equal(comparison.agreement.passed, true);
  assert.deepEqual(comparison.execution, {
    independent_runs: true,
    callback_reevaluated_for_presentation: false,
  });

  const malformed = structuredClone(story);
  malformed.cases[0].reference_comparison.agreement.passed = false;
  assert.equal(validate(malformed), false);
});

test("every public Open in Sage.js link carries its complete fresh-cell source", () => {
  const html = readFileSync(join(website, "index.html"), "utf8");
  const links = [...html.matchAll(/class="open-in-sage" href="([^"]+)"/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"));
  assert.equal(links.length, bundle.stories.length);
  assert.deepEqual(links.map(decodeOpenUrl), bundle.stories.map(
    (story) => story.canonical_python,
  ));
  for (const story of bundle.stories) {
    assert.match(story.canonical_python, /from sagejs\.numerics/);
    assert.match(story.canonical_python, /\nresult$/);
  }
});

test(
  "every advertised fresh-cell source is independently executable Python",
  { timeout: 30_000 },
  () => {
    const script = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, sys.argv[2])
bundle = json.load(open(sys.argv[1], encoding="utf-8"))
for story in bundle["stories"]:
    namespace = {}
    exec(story["canonical_python"], namespace, namespace)
    result = namespace["result"]
    if not result.success:
        raise RuntimeError(story["id"] + " did not produce a successful result")
    `;
    const python = process.env.PYTHON ||
      (process.platform === "win32" ? "python" : "python3");
    const result = spawnSync(
      python,
      ["-I", "-c", script, join(website, "evidence.json"), join(root, "src/lib")],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
        maxBuffer: 4 * 1024 * 1024,
        timeout: 25_000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
  },
);

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

async function publicServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const filename = normalize(join(website, relative));
    if (
      !filename.startsWith(`${website}${sep}`) ||
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

const chromiumPath = discoverChromium();

test(
  "the deployed page renders all figures from local bounded assets",
  { skip: !chromiumPath, timeout: 45_000 },
  async () => {
    const { chromium } = require("playwright-core");
    const host = await publicServer();
    const browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const externalRequests = [];
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== new URL(host.url).origin) {
          externalRequests.push(request.url());
        }
      });
      await page.goto(host.url, { waitUntil: "networkidle" });
      await page.waitForSelector("html[data-gallery-ready='true']");
      assert.equal(await page.locator(".js-plotly-plot").count(), 17);
      assert.equal(await page.locator(".open-in-sage").count(), 9);
      assert.deepEqual(externalRequests, []);
      const timing = await page.evaluate(() => ({
        hydration: Number(document.documentElement.dataset.galleryHydrationMs),
        single: Number(document.documentElement.dataset.galleryMaxRenderMs),
      }));
      assert.ok(timing.hydration <= bundle.budgets.max_browser_hydration_ms);
      assert.ok(timing.single <= bundle.budgets.max_single_plot_render_ms);
    } finally {
      await browser.close();
      await host.close();
    }
  },
);

test("timing ceilings reject missing, non-finite, and over-budget measurements", () => {
  assert.equal(
    renderer.assertTimingBudget(bundle, "max_static_html_generation_ms", 10),
    10,
  );
  assert.throws(
    () => renderer.assertTimingBudget(
      bundle,
      "max_static_html_generation_ms",
      bundle.budgets.max_static_html_generation_ms + 1,
    ),
    /exceeded/,
  );
  assert.throws(
    () => renderer.assertTimingBudget(bundle, "not_a_budget", 1),
    /is missing/,
  );
  assert.throws(
    () => renderer.assertTimingBudget(bundle, "max_static_html_generation_ms", NaN),
    /finite and nonnegative/,
  );
});
