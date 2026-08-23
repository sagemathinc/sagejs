#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");

const REQUIRED_HEADERS = new Map([
  ["cross-origin-opener-policy", "same-origin"],
  ["cross-origin-embedder-policy", "require-corp"],
  ["cross-origin-resource-policy", "same-origin"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "no-referrer"],
]);

function parseHeadersFile(source) {
  const rules = [];
  let current;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: line.trim(), headers: new Map() };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error("header occurs before a path pattern");
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    if (!match) throw new Error(`invalid _headers line ${JSON.stringify(raw)}`);
    current.headers.set(match[1].toLowerCase(), match[2]);
  }
  return rules;
}

function validateHeadersRules(rules) {
  const failures = [];
  const application = rules.find((rule) => rule.pattern === "/*" || rule.pattern.endsWith("/*"));
  if (!application) return ["no application-wide header rule was found"];
  for (const [name, expected] of REQUIRED_HEADERS) {
    if (application.headers.get(name)?.toLowerCase() !== expected) {
      failures.push(`${name} must be ${expected}`);
    }
  }
  const csp = application.headers.get("content-security-policy") ?? "";
  for (const directive of ["default-src 'none'", "object-src 'none'", "frame-ancestors 'none'"]) {
    if (!csp.toLowerCase().includes(directive)) failures.push(`CSP lacks ${directive}`);
  }
  if (!/connect-src\s+(?:'none'|'self')(?:\s*;|$)/i.test(csp)) {
    failures.push("CSP connect-src must be none or same-origin only");
  }
  if (!csp.includes("'unsafe-eval'")) {
    failures.push("CSP must deliberately document unsafe-eval for compiled user source");
  }
  return failures;
}

async function fetchDeployedAsset(origin, pathname, encoding) {
  const url = new URL(pathname, origin);
  const response = await fetch(url, {
    headers: { "Accept-Encoding": encoding },
  });
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return {
    body: Buffer.from(await response.arrayBuffer()),
    response,
  };
}

function parseJsonBody(body, pathname, failures) {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    failures.push(`${pathname} did not decode to JSON`);
    return undefined;
  }
}

async function validateDeployedOrigin(origin, { expectedRuntime } = {}) {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("deployed execution origin must use HTTPS");
  }
  const root = await fetchDeployedAsset(url, "/", "identity");
  const failures = [];
  for (const [name, expected] of REQUIRED_HEADERS) {
    if (root.response.headers.get(name)?.toLowerCase() !== expected) {
      failures.push(`${name} response header must be ${expected}`);
    }
  }
  if (root.response.headers.has("set-cookie")) failures.push("execution origin must not set cookies");
  if (root.response.headers.has("content-encoding")) {
    failures.push("identity root response must not be content-encoded");
  }
  if (!root.body.toString("utf8").toLowerCase().startsWith("<!doctype html>")) {
    failures.push("identity root response did not decode to the application shell");
  }

  const identity = await fetchDeployedAsset(url, "/runtime-version.json", "identity");
  const brotli = await fetchDeployedAsset(url, "/runtime-version.json", "br");
  if (identity.response.headers.has("content-encoding")) {
    failures.push("identity runtime response must not be content-encoded");
  }
  if (brotli.response.headers.get("content-encoding")?.toLowerCase() !== "br") {
    failures.push("Brotli runtime response must declare content-encoding br");
  }
  if (!identity.body.equals(brotli.body)) {
    failures.push("identity and Brotli runtime responses decode to different bytes");
  }
  const runtime = parseJsonBody(identity.body, "runtime-version.json", failures);
  const assetResponse = await fetchDeployedAsset(url, "/asset-manifest.json", "identity");
  const assetManifest = parseJsonBody(assetResponse.body, "asset-manifest.json", failures);
  if (runtime?.schema !== "org.sagejs.web/runtime-v1") {
    failures.push("runtime-version.json has an invalid schema");
  }
  if (assetManifest?.schema !== "org.sagejs.web/assets-v2") {
    failures.push("asset-manifest.json has an invalid schema");
  }
  const immutableSample = assetManifest?.assets
    ?.filter((record) => typeof record?.path === "string" && record.path.startsWith("./assets/"))
    .sort((left, right) => (right.bytes ?? 0) - (left.bytes ?? 0))[0];
  if (immutableSample) {
    const pathname = new URL(immutableSample.path, url).pathname;
    const immutableIdentity = await fetchDeployedAsset(url, pathname, "identity");
    const immutableBrotli = await fetchDeployedAsset(url, pathname, "br");
    if (immutableIdentity.response.headers.has("content-encoding")) {
      failures.push("identity immutable response must not be content-encoded");
    }
    if (immutableBrotli.response.headers.get("content-encoding")?.toLowerCase() !== "br") {
      failures.push("Brotli immutable response must declare content-encoding br");
    }
    if (!immutableIdentity.body.equals(immutableBrotli.body)) {
      failures.push("identity and Brotli immutable responses decode to different bytes");
    }
    if (
      immutableIdentity.body.length !== immutableSample.bytes
      || createHash("sha256").update(immutableIdentity.body).digest("hex") !== immutableSample.sha256
    ) {
      failures.push("live immutable response differs from its asset-manifest byte contract");
    }
  } else {
    failures.push("asset-manifest.json has no immutable asset to validate");
  }
  if (runtime && assetManifest && runtime.artifactIdentity !== assetManifest.artifactIdentity) {
    failures.push("runtime and asset manifests identify different artifacts");
  }
  if (expectedRuntime) {
    if (runtime?.revision !== expectedRuntime.revision) {
      failures.push("live runtime source revision differs from the staged release");
    }
    if (runtime?.artifactIdentity !== expectedRuntime.artifactIdentity) {
      failures.push("live runtime artifact identity differs from the staged release");
    }
  }
  const release = assetManifest?.release;
  if (typeof release !== "string" || !/^[a-f0-9]{64}$/.test(release)) {
    failures.push("asset-manifest.json has an invalid release identity");
  } else {
    for (const response of [root.response, identity.response, brotli.response, assetResponse.response]) {
      if (response.headers.get("x-sagejs-release") !== release) {
        failures.push("live response release header differs from asset-manifest.json");
        break;
      }
    }
  }
  return failures;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

if (require.main === module) {
  void (async () => {
    const headersPath = argument("--headers");
    const origin = argument("--origin");
    const expectedRuntimePath = argument("--expected-runtime");
    if (!headersPath && !origin) throw new Error("pass --headers FILE and/or --origin URL");
    const failures = [];
    if (headersPath) {
      failures.push(...validateHeadersRules(parseHeadersFile(fs.readFileSync(path.resolve(headersPath), "utf8"))));
    }
    const expectedRuntime = expectedRuntimePath
      ? JSON.parse(fs.readFileSync(path.resolve(expectedRuntimePath), "utf8"))
      : undefined;
    if (origin) failures.push(...await validateDeployedOrigin(origin, { expectedRuntime }));
    if (failures.length) throw new Error(`deployment validation failed:\n${failures.join("\n")}`);
    console.log("Browser Wasm deployment security policy passed");
  })().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}

module.exports = { parseHeadersFile, validateDeployedOrigin, validateHeadersRules };
