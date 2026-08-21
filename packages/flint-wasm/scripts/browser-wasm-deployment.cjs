#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
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

async function validateDeployedOrigin(origin) {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("deployed execution origin must use HTTPS");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`deployment returned HTTP ${response.status}`);
  const failures = [];
  for (const [name, expected] of REQUIRED_HEADERS) {
    if (response.headers.get(name)?.toLowerCase() !== expected) {
      failures.push(`${name} response header must be ${expected}`);
    }
  }
  if (response.headers.has("set-cookie")) failures.push("execution origin must not set cookies");
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
    if (!headersPath && !origin) throw new Error("pass --headers FILE and/or --origin URL");
    const failures = [];
    if (headersPath) {
      failures.push(...validateHeadersRules(parseHeadersFile(fs.readFileSync(path.resolve(headersPath), "utf8"))));
    }
    if (origin) failures.push(...await validateDeployedOrigin(origin));
    if (failures.length) throw new Error(`deployment validation failed:\n${failures.join("\n")}`);
    console.log("Browser Wasm deployment security policy passed");
  })().catch((error) => {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  });
}

module.exports = { parseHeadersFile, validateDeployedOrigin, validateHeadersRules };
