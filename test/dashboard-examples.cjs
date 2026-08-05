"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const {
  parsePolyglotCell,
  prepareSubmittedPolyglotCell,
} = require("../dist/tools/polyglot.js");

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "website", "examples.json"), "utf8"),
);

function output(result) {
  return [result.stdout?.trim(), result.repr]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join("\n")
    .trim();
}

function notebookSource(example) {
  return example.language === "sage"
    ? example.code
    : `%%${example.language}\n${example.code}`;
}

for (const example of payload.examples) {
  test(`dashboard example: ${example.id}`, async () => {
    const cell = prepareSubmittedPolyglotCell(
      parsePolyglotCell(notebookSource(example)),
    );
    assert.equal(cell.language, example.language);
    const session = await createSage({ mode: cell.language === "python" ? "python" : "sage" });
    try {
      const result = await session.evaluate(cell.source, {
        language: cell.language,
        timeout: example.timeout || 30_000,
      });
      assert.equal(output(result), example.expected);
    } finally {
      await session.close();
    }
  });
}
