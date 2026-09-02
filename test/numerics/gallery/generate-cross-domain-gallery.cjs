#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = resolve(__dirname, "../../..");
const gallery = join(root, "docs/numerical-computing/gallery");
const evidencePath = join(gallery, "evidence.json");
const htmlPath = join(gallery, "index.html");
const sourcePath = join(__dirname, "generate-cross-domain-evidence.py");
const modulePath = join(gallery, "gallery.mjs");
const cssPath = join(gallery, "gallery.css");
const website = join(root, "website/numerical-computing");
const publicEvidencePath = join(website, "evidence.json");
const publicHtmlPath = join(website, "index.html");
const publicModulePath = join(website, "gallery.mjs");
const publicCssPath = join(website, "gallery.css");
const publicManifestPath = join(website, "gallery-manifest.json");
const publicPlotlyPath = join(website, "plotly.min.js");
const publicPlotlyLicensePath = join(website, "plotly.LICENSE.txt");
const plotlyPath = require.resolve("plotly.js-dist-min");
const plotlyDirectory = resolve(plotlyPath, "..");
const plotlyLicensePath = join(plotlyDirectory, "LICENSE");
const plotlyPackage = require(join(plotlyDirectory, "package.json"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function publicManifest(bundle, html) {
  const plotly = readFileSync(plotlyPath);
  const galleryBytes =
    bundle.measurements.bundle_bytes +
    Buffer.byteLength(html) +
    readFileSync(modulePath).byteLength +
    readFileSync(cssPath).byteLength +
    plotly.byteLength;
  return {
    schema_version: 2,
    kind: "sagejs-numerical-gallery",
    title: "Numerical methods, with evidence",
    description:
      "Nine interactive teaching stories built from bounded Sage.js numerical results, traces, validation checks, and semantic plots.",
    entrypoint: "./index.html",
    evidence: "./evidence.json",
    renderer: "./gallery.mjs",
    stylesheet: "./gallery.css",
    plotly: {
      href: "./plotly.min.js",
      package: "plotly.js-dist-min",
      version: plotlyPackage.version,
      license: "./plotly.LICENSE.txt",
      bytes: plotly.byteLength,
      sha256: sha256(plotly),
    },
    budgets: bundle.budgets,
    deployment_budgets: {
      max_plotly_distribution_bytes: 6_000_000,
      max_gallery_runtime_bytes: 10_000_000,
    },
    measurements: {
      story_count: bundle.measurements.story_count,
      case_count: bundle.measurements.case_count,
      animated_case_count: bundle.measurements.animated_case_count,
      gallery_runtime_bytes: galleryBytes,
    },
    story_order: bundle.story_order,
    stories: bundle.stories.map((story) => ({
      id: story.id,
      title: story.title,
      domain: story.domain,
      operation: story.operation,
      status: "complete",
      entrypoint: `./index.html#${story.id}`,
      case_ids: story.cases.map((caseRecord) => caseRecord.id),
      capabilities: [
        "method-assumptions",
        "success-and-failure-narratives",
        "bounded-trace-evidence",
        "manual-animation",
        "static-fallback",
        "plotspec-json-export",
        "plotly-json-export",
        "accessible-html-export",
        "fresh-sagejs-example",
      ],
    })),
  };
}

function pythonEvidence() {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(executable, ["-I", sourcePath], {
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
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { bundle: JSON.parse(result.stdout), evidence: result.stdout };
}

async function artifacts() {
  const renderer = await import(pathToFileURL(modulePath));
  const { bundle, evidence } = pythonEvidence();
  renderer.assertGalleryBudgets(bundle, evidence);
  const html = renderer.buildGalleryDocument(bundle);
  return {
    bundle,
    evidence,
    html,
    manifest: `${JSON.stringify(publicManifest(bundle, html), null, 2)}\n`,
  };
}

async function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write");
  const generated = await artifacts();
  if (write) {
    writeFileSync(evidencePath, generated.evidence);
    writeFileSync(htmlPath, generated.html);
    writeFileSync(publicEvidencePath, generated.evidence);
    writeFileSync(publicHtmlPath, generated.html);
    copyFileSync(modulePath, publicModulePath);
    copyFileSync(cssPath, publicCssPath);
    copyFileSync(plotlyPath, publicPlotlyPath);
    copyFileSync(plotlyLicensePath, publicPlotlyLicensePath);
    writeFileSync(publicManifestPath, generated.manifest);
    process.stdout.write(
      `wrote ${evidencePath} (${Buffer.byteLength(generated.evidence)} bytes)\n` +
      `wrote ${htmlPath} (${Buffer.byteLength(generated.html)} bytes)\n` +
      `published the checked gallery to ${website}\n`,
    );
    return generated;
  }
  assert.ok(existsSync(evidencePath), `${evidencePath} is missing; run with --write`);
  assert.ok(existsSync(htmlPath), `${htmlPath} is missing; run with --write`);
  assert.equal(
    readFileSync(evidencePath, "utf8"),
    generated.evidence,
    "cross-domain gallery evidence is stale; regenerate with --write",
  );
  assert.equal(
    readFileSync(htmlPath, "utf8"),
    generated.html,
    "cross-domain gallery HTML is stale; regenerate with --write",
  );
  for (const [filename, expected, label] of [
    [publicEvidencePath, generated.evidence, "public gallery evidence"],
    [publicHtmlPath, generated.html, "public gallery HTML"],
    [publicManifestPath, generated.manifest, "public gallery manifest"],
    [publicModulePath, readFileSync(modulePath), "public gallery renderer"],
    [publicCssPath, readFileSync(cssPath), "public gallery stylesheet"],
    [publicPlotlyPath, readFileSync(plotlyPath), "public Plotly distribution"],
    [publicPlotlyLicensePath, readFileSync(plotlyLicensePath), "public Plotly license"],
  ]) {
    assert.ok(existsSync(filename), `${label} is missing; run with --write`);
    assert.deepEqual(
      readFileSync(filename),
      Buffer.isBuffer(expected) ? expected : Buffer.from(expected),
      `${label} is stale; regenerate with --write`,
    );
  }
  return generated;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { artifacts, main, publicManifest };
