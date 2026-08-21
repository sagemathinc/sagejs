#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const examplesPath = path.join(root, "docs", "webassembly-examples.md");
const corpusPath = path.join(root, "test", "browser-wasm-parity-corpus.json");

function parityFences(source) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index].match(
      /^ {0,3}(`{3,}|~{3,})sage\s+test\s+browser-parity=([a-z0-9-]+)\s*$/,
    );
    if (!opening) continue;
    const marker = opening[1][0];
    const width = opening[1].length;
    const body = [];
    const line = index + 1;
    let closed = false;
    for (index += 1; index < lines.length; index += 1) {
      const closing = lines[index].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === marker && closing[1].length >= width) {
        closed = true;
        break;
      }
      body.push(lines[index]);
    }
    assert.ok(closed, `unclosed parity fence at ${examplesPath}:${line}`);
    result.push({ id: opening[2], line, source: body.join("\n") });
  }
  return result;
}

test("documented portable examples are exact browser-corpus sources", () => {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const byId = new Map(corpus.cases.map((item) => [item.id, item]));
  const examples = parityFences(fs.readFileSync(examplesPath, "utf8"));
  assert.ok(examples.length >= 5, "the showcase must retain representative slices");
  const seen = new Set();
  for (const example of examples) {
    assert.ok(!seen.has(example.id), `duplicate documented case ${example.id}`);
    seen.add(example.id);
    const item = byId.get(example.id);
    assert.ok(item, `unknown browser parity case ${example.id}`);
    assert.equal(
      example.source,
      item.source,
      `${example.id} at docs/webassembly-examples.md:${example.line} drifted from the shared Node/browser corpus`,
    );
  }
  assert.ok(seen.has("exact-big-integer"));
  assert.ok(seen.has("number-field-maximal-order-prime-zeta"));
  assert.ok(seen.has("riemann-zeta-batch"));
  assert.ok(seen.has("elliptic-lseries-complex-plot"));
});

test("WebAssembly documentation index exposes every production guide", () => {
  const index = fs.readFileSync(path.join(root, "docs", "index.md"), "utf8");
  for (const name of [
    "webassembly-browser-support.md",
    "webassembly-contributor-guide.md",
    "webassembly-packed-abi.md",
    "webassembly-reproducible-builds.md",
    "webassembly-examples.md",
    "webassembly-production-release-notes.md",
  ]) {
    assert.match(index, new RegExp(`\\(${name.replace(".", "\\.")}\\)`));
    assert.ok(fs.existsSync(path.join(root, "docs", name)), `${name} is missing`);
  }
});
