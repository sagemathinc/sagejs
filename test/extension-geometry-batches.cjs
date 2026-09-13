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
  assert.equal(batches.length, 29);
  assert.equal(new Set(batches.map(batch => batch.label)).size, 29);
  for (const [name, fields, stages] of [
    ["extension-ideals", [4, 8, 9, 27, 65519 ** 2], [null]],
    ["extension-geometry", [4, 9, 27], [null]],
    ["extension-zero-dimensional", [4, 9],
      ["frobenius1", "frobenius2", "components", "nonsplit", "separator"]],
  ]) {
    for (const field of fields) for (const stage of stages) {
      if (field === 9 && stage === "frobenius2") {
        for (const operation of ["radical", "is_radical", "primary", "associated"]) {
          const label = `${name}/GF(${field})/${stage}/${operation}`;
          const batch = batches.find(candidate => candidate.label === label);
          assert.ok(batch, label);
          assert.ok(batch.source.startsWith(`_extension_field_selection = ${field}\n`));
          assert.ok(batch.source.includes(`_extension_zero_stage = "${stage}"\n`));
          assert.ok(batch.source.includes(`_extension_zero_operation = "${operation}"\n`));
        }
        continue;
      }
      const label = `${name}/GF(${field})${stage ? `/${stage}` : ""}`;
      const batch = batches.find(candidate => candidate.label === label);
      assert.ok(batch, label);
      assert.ok(batch.source.startsWith(`_extension_field_selection = ${field}\n`));
      assert.ok(batch.source.includes(
        `_extension_zero_stage = ${stage ? JSON.stringify(stage) : "None"}\n`,
      ));
      assert.ok(batch.source.includes("_extension_zero_operation = None\n"));
    }
  }
  assert.equal(batches.filter(batch => batch.label.startsWith("independent-Sage")).length, 8);
  for (const field of [4, 9]) for (const stage of ["radical", "joined", "nonsplit", "points"]) {
    const batch = batches.find(candidate =>
      candidate.label === `independent-Sage-geometry/GF(${field})/${stage}`);
    assert.ok(batch);
    assert.ok(batch.source.includes(`_extension_geometry_oracle_stage = "${stage}"\n`));
  }
});
