// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const fixtureRoot = join(root, "upstream-tests", "ipywidgets");

function load(name) {
  return JSON.parse(readFileSync(join(fixtureRoot, name), "utf8"));
}

test("ipywidgets upstream identities and protocols are pinned", () => {
  const manifest = load("manifest.json");
  assert.equal(manifest.schema, "sagejs.ipywidgets-upstream/v1");
  assert.equal(manifest.semanticAuthority, "CPython with the pinned Python wheels");
  assert.deepEqual(
    manifest.python.packages.map(({ name, version }) => [name, version]),
    [
      ["traitlets", "5.15.1"],
      ["comm", "0.2.3"],
      ["ipywidgets", "8.1.9"],
    ],
  );
  for (const dependency of manifest.python.packages) {
    assert.match(dependency.revision, /^[0-9a-f]{40}$/);
    assert.match(dependency.wheelSha256, /^[0-9a-f]{64}$/);
    assert.equal(dependency.license, "BSD-3-Clause");
  }
  assert.deepEqual(manifest.protocols, {
    widget: "2.1.0",
    control: "1.0.0",
    baseModule: "2.0.0",
    controlsModule: "2.0.0",
    outputModule: "1.0.0",
    viewMime: "application/vnd.jupyter.widget-view+json",
  });
  assert.equal(manifest.browser.manager.name, "@cocalc/widgets");
  assert.equal(manifest.browser.manager.version, "1.3.0");
  assert.equal(manifest.secondaryReference.authority, false);
});

test("every selected upstream runtime suite has a disposition", () => {
  const inventory = load("test-inventory.json");
  assert.equal(inventory.schema, "sagejs.ipywidgets-test-inventory/v1");
  assert.deepEqual(
    inventory.sources.map((source) => source.package),
    ["traitlets", "comm", "ipywidgets"],
  );
  for (const source of inventory.sources) {
    assert.ok(source.rules.length > 0, `${source.package} has no test rules`);
    for (const rule of source.rules) {
      assert.ok(rule.glob);
      assert.ok(rule.category);
      assert.ok(rule.disposition);
    }
  }
});

test("normalized CPython widget corpus covers the primary protocol shapes", () => {
  const corpus = load("protocol-corpus.json");
  assert.equal(corpus.schema, "sagejs.ipywidgets-protocol-corpus/v1");
  assert.equal(corpus.authority, "CPython");
  assert.deepEqual(corpus.packages, {
    comm: "0.2.3",
    ipywidgets: "8.1.9",
    traitlets: "5.15.1",
  });
  assert.deepEqual(
    corpus.cases.map(({ name }) => name),
    [
      "scalar-controls",
      "nested-layouts",
      "output-capture-model",
      "binary-media",
      "links-and-custom-messages",
      "control-channel-and-fixture",
    ],
  );

  const events = corpus.cases.flatMap(({ events }) => events);
  const eventTypes = new Set(events.map(({ type }) => type));
  assert.ok(eventTypes.has("comm_open"));
  assert.ok(eventTypes.has("comm_msg"));
  assert.ok(eventTypes.has("comm_close"));
  assert.ok(events.some(({ metadata }) => metadata.version === "2.1.0"));
  assert.ok(events.some(({ buffers }) => buffers.length > 0));

  for (const event of events) {
    assert.match(event.comm_id, /^(model-\d{4}|control-0001)$/);
    for (const buffer of event.buffers) {
      assert.match(buffer.$binary.sha256, /^[0-9a-f]{64}$/);
      assert.ok(Number.isSafeInteger(buffer.$binary.length));
    }
  }
});
