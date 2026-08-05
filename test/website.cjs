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
const stdlibCoverage = JSON.parse(
  fs.readFileSync(path.join(website, "coverage/python-stdlib.json"), "utf8"),
);

test("dashboard data has a stable, complete schema", () => {
  assert.equal(payload.schemaVersion, 2);
  assert.match(payload.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(payload.capabilities.length >= 30);

  const ids = new Set();
  const states = new Set(["available", "partial", "planned"]);
  const qualities = new Set(["certified", "tested", "prototype", "planned"]);
  const priorities = new Set(["now", "next", "later"]);
  const coverageLevels = new Set(["broad", "substantial", "focused", "foundational", "planned"]);
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
    assert.ok(coverageLevels.has(capability.coverage?.level), `${capability.id}.coverage.level`);
    for (const field of ["label", "summary"]) {
      assert.equal(typeof capability.coverage?.[field], "string", `${capability.id}.coverage.${field}`);
      assert.ok(capability.coverage[field].trim(), `${capability.id}.coverage.${field} is empty`);
    }
    assert.ok(Array.isArray(capability.coverage.includes), `${capability.id}.coverage.includes`);
    assert.ok(capability.coverage.includes.length > 0, `${capability.id}.coverage.includes is empty`);
    for (const family of capability.coverage.includes) {
      assert.equal(typeof family, "string", `${capability.id}.coverage.includes item`);
      assert.ok(family.trim(), `${capability.id}.coverage.includes has an empty item`);
    }
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

test("published coverage scores have explicit denominators or estimate labels", () => {
  const scored = payload.capabilities.filter((item) => item.coverage.score);
  assert.ok(scored.length >= 2);
  for (const capability of scored) {
    const score = capability.coverage.score;
    assert.ok(["measured", "estimated"].includes(score.kind));
    assert.equal(typeof score.value, "number");
    assert.ok(score.value >= 0 && score.value <= 100);
    for (const field of ["unit", "reference", "method", "audited"]) {
      assert.equal(typeof score[field], "string", `${capability.id}.coverage.score.${field}`);
      assert.ok(score[field].trim());
    }
    if (score.kind === "measured") {
      assert.ok(Number.isInteger(score.numerator) && score.numerator >= 0);
      assert.ok(Number.isInteger(score.denominator) && score.denominator > 0);
      assert.equal(score.value, Math.round((1000 * score.numerator) / score.denominator) / 10);
    }
  }
  const stdlib = payload.capabilities.find((item) => item.id === "stdlib").coverage.score;
  assert.equal(stdlib.numerator, stdlibCoverage.metric.numerator);
  assert.equal(stdlib.denominator, stdlibCoverage.metric.denominator);
  assert.equal(stdlib.value, stdlibCoverage.metric.percentage);
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
  assert.match(script, /function revealCapability/);
  assert.match(script, /url\.searchParams\.delete\("q"\)/);
  assert.match(script, /link\.addEventListener\("click"/);
});
