// sagejs-test-tier: unit
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("Wasm geometry batches cover every field and decomposition stage", async () => {
  const {extensionGeometryBatches} = await import(
    "../packages/flint-wasm/test/extension-geometry-fixtures.mjs"
  );
  const batches = [];
  for await (const batch of extensionGeometryBatches()) batches.push(batch);
  assert.equal(batches.length, 20);
  assert.equal(new Set(batches.map(batch => batch.label)).size, 20);
  for (const [name, fields, stages] of [
    ["extension-ideals", [4, 8, 9, 27, 65519 ** 2], [null]],
    ["extension-geometry", [4, 9, 27], [null]],
    ["extension-zero-dimensional", [4, 9],
      ["frobenius1", "frobenius2", "components", "nonsplit", "separator"]],
  ]) {
    for (const field of fields) for (const stage of stages) {
      const label = `${name}/GF(${field})${stage ? `/${stage}` : ""}`;
      const batch = batches.find(candidate => candidate.label === label);
      assert.ok(batch, label);
      assert.ok(batch.source.startsWith(`_extension_field_selection = ${field}\n`));
      assert.ok(batch.source.includes(
        `_extension_zero_stage = ${stage ? JSON.stringify(stage) : "None"}\n`,
      ));
    }
  }
  assert.equal(batches.filter(batch => batch.label.startsWith("independent-Sage")).length, 2);
});
