"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const website = path.join(root, "website");
const payload = JSON.parse(fs.readFileSync(path.join(website, "capabilities.json"), "utf8"));
const examplePayload = JSON.parse(fs.readFileSync(path.join(website, "examples.json"), "utf8"));
const html = fs.readFileSync(path.join(website, "index.html"), "utf8");
const script = fs.readFileSync(path.join(website, "app.js"), "utf8");

test("dashboard data has a stable, complete schema", () => {
  assert.equal(payload.schemaVersion, 1);
  assert.match(payload.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(payload.capabilities.length >= 30);

  const ids = new Set();
  const states = new Set(["available", "partial", "planned"]);
  const qualities = new Set(["certified", "tested", "prototype", "planned"]);
  const priorities = new Set(["now", "next", "later"]);
  const textFields = ["id", "area", "feature", "summary", "implementation", "evidence", "target"];

  for (const capability of payload.capabilities) {
    for (const field of textFields) {
      assert.equal(typeof capability[field], "string", `${capability.id || "entry"}.${field}`);
      assert.ok(capability[field].trim().length > 0, `${capability.id || "entry"}.${field} is empty`);
    }
    assert.match(capability.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(capability.id), `duplicate id ${capability.id}`);
    ids.add(capability.id);
    assert.ok(states.has(capability.state), `${capability.id}.state`);
    assert.ok(qualities.has(capability.quality), `${capability.id}.quality`);
    assert.ok(priorities.has(capability.priority), `${capability.id}.priority`);
    if (capability.state === "planned") assert.equal(capability.quality, "planned", `${capability.id} planned state must not overclaim quality`);
  }
});

test("verified examples form a searchable executable corpus", () => {
  assert.equal(examplePayload.schemaVersion, 1);
  assert.match(examplePayload.verified, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(examplePayload.runner, "Sage.js polyglot Jupyter kernel");
  assert.ok(examplePayload.examples.length >= 40);
  const capabilityIds = new Set(payload.capabilities.map((item) => item.id));
  const ids = new Set();
  const languages = new Set(["sage", "python", "magma", "macaulay2", "matlab", "maple", "wolfram"]);
  for (const example of examplePayload.examples) {
    assert.match(example.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(example.id), `duplicate example ${example.id}`);
    ids.add(example.id);
    assert.ok(capabilityIds.has(example.capability), `${example.id} references an unknown capability`);
    assert.ok(languages.has(example.language), `${example.id} has an unsupported language`);
    for (const field of ["title", "code", "expected"]) {
      assert.equal(typeof example[field], "string", `${example.id}.${field}`);
      assert.ok(example[field].trim(), `${example.id}.${field} is empty`);
    }
  }
});

test("dashboard covers the three questions and both install paths", () => {
  for (const id of ["install", "capabilities", "roadmap"]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /@sagemath\/sagejs/);
  assert.match(html, /releases\/latest\/download\/install\.sh/);
  assert.match(html, /--install-jupyter-kernel/);
  for (const hook of ["metric-total", "capability-list", "roadmap-columns", "area-filter", "example-search-results", "example-result-list"]) assert.match(html, new RegExp(`id=["']${hook}["']`));
});

test("dashboard JavaScript is self-contained and does not inject capability HTML", () => {
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|eval\s*\(/);
  assert.match(script, /fetch\(["']\.\/capabilities\.json["']\)/);
  assert.match(script, /fetch\(["']\.\/examples\.json["']\)/);
  assert.match(script, /CSS\.escape/);
});
