#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { join, normalize } = require("node:path");
const { spawn } = require("node:child_process");

const root = join(__dirname, "..", "website");
const candidates = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);
const browser = candidates.find(existsSync);

if (!browser) {
  const message = "Chromium/Chrome is unavailable; skipped reference browser test";
  if (process.env.SAGEJS_REQUIRE_REFERENCE_BROWSER === "1") {
    throw new Error(message);
  }
  console.log(message);
  process.exit(0);
}

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function contentType(filename) {
  const suffix = filename.slice(filename.lastIndexOf("."));
  return mime[suffix] ?? "application/octet-stream";
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const relative = pathname === "/" ? "reference.html" : pathname.slice(1);
  const filename = normalize(join(root, relative));
  if (!filename.startsWith(`${normalize(root)}/`) || !existsSync(filename)) {
    response.writeHead(404).end("not found");
    return;
  }
  response.setHeader("content-type", contentType(filename));
  response.end(readFileSync(filename));
});

function runBrowser(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--dump-dom",
      "--virtual-time-budget=5000",
      url,
    ]);
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => output += chunk);
    child.stderr.setEncoding("utf8").on("data", (chunk) => errors += chunk);
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("reference browser test timed out"));
    }, 20_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`browser exited ${code}: ${errors}`));
      } else {
        resolve(output);
      }
    });
  });
}

async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const html = await runBrowser(
      `http://127.0.0.1:${port}/reference.html?q=RandomGNP`,
    );
    assert.match(html, /data-reference-ready="true"/);
    assert.match(html, /<div class="example-label">Input<\/div>/);
    assert.match(html, /<pre data-example-role="input" class="language-python"[^>]*><code class="language-python">/);
    assert.match(html, />graphs<span class="token punctuation">\.<\/span>RandomGNP/);
    assert.match(html, /<span class="token number">5<\/span>/);
    assert.match(html, /<span class="token punctuation">\.<\/span>RandomGNP/);
    assert.match(html, /<div class="example-label">Expected output<\/div>/);
    assert.match(html, /<pre data-example-role="output"><code>0<\/code><\/pre>/);
    const explanation = html.indexOf(
      "The endpoints <code>p=0</code> and <code>p=1</code> are deterministic:",
    );
    const inlineCode = html.indexOf(
      '<pre data-example-role="input" class="language-python"',
      explanation,
    );
    const additional = html.indexOf("additional executable examples", explanation);
    assert.ok(explanation >= 0);
    assert.ok(inlineCode > explanation);
    assert.ok(additional > inlineCode);
    assert.match(html, /<div class="doc-examples"><section class="example">/);
    assert.doesNotMatch(html, />23 executable examples</);
    assert.match(html, /<pre class="line-numbers language-python" data-start="\d+"[^>]*>/);
    assert.match(html, /class="line-numbers-rows"/);
    assert.match(html, /class="source-file-link" href="https:\/\/github\.com\/sagemathinc\/sagejs\/blob\/main\/src\/baselib\/graphs\.py#L\d+"/);
    assert.match(html, />Open full file on GitHub<\/span>/);
    const visualHtml = await runBrowser(
      `http://127.0.0.1:${port}/reference.html?q=Graph.plot#Graph.plot`,
    );
    assert.match(visualHtml, /class="example-visual"/);
    assert.match(visualHtml, /Verified graphical output · Petersen graph/);
    const dashboardHtml = await runBrowser(
      `http://127.0.0.1:${port}/index.html?q=matrix`,
    );
    assert.match(dashboardHtml, /data-dashboard-ready="true"/);
    assert.match(dashboardHtml, /<pre class="example-code language-sage"[^>]*><code class="language-sage">/);
    assert.match(dashboardHtml, /<span class="token operator">=<\/span>/);
    assert.match(dashboardHtml, /<span class="token number">1<\/span>/);
    console.log("Browser test: dashboard and reference examples are syntax highlighted");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
