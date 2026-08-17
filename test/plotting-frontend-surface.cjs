"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const generator = require("../tools/foreign/plotting-surface.cjs");
const artifactPath = resolve(root, generator.OUTPUT);

test("checked-in frontend plotting surface is deterministic", () => {
  const actual = readFileSync(artifactPath, "utf8");
  assert.equal(actual, generator.rendered(generator.generateSurface(root)));

  const check = spawnSync(
    process.execPath,
    [resolve(root, "tools/foreign/plotting-surface.cjs"), "--check"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(check.status, 0, check.stderr);
});

test("surface separates plotting evidence from generic call syntax", () => {
  const surface = generator.generateSurface(root);
  const ids = surface.entries.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(surface.summary.total_entries, surface.entries.length);
  assert.deepEqual(surface.policy.classifications, [
    "faithful",
    "translated",
    "unsupported",
    "extension",
  ]);
  assert.equal(surface.policy.proprietary_runtime_dependencies, false);

  for (const entry of surface.entries) {
    for (const field of [
      "id",
      "frontend",
      "qualified_name",
      "dimension",
      "kind",
      "signature_or_syntax",
      "source_authority",
      "dependencies",
      "classification",
      "translation_or_reason",
      "semantic_tests",
      "plotly_tests",
      "visual_tests",
      "platform_status",
      "performance_status",
    ]) {
      assert.ok(Object.hasOwn(entry, field), `${entry.id} lacks ${field}`);
    }
    assert.equal(entry.grammar_recognized, true);
    assert.equal(
      entry.plotting_lowerer_recognized,
      entry.support_state === "implemented",
    );
  }

  const wolframImplemented = surface.entries.filter(
    ({ frontend, support_state }) =>
      frontend === "wolfram" && support_state === "implemented",
  );
  assert.ok(wolframImplemented.length > 50);
  assert.ok(
    wolframImplemented.every(({ classification }) =>
      classification === "translated"
    ),
  );

  const matlabPlot = surface.entries.find(
    ({ id }) => id === "matlab.plot-function.plot",
  );
  assert.equal(matlabPlot.signature_or_syntax, "plot(x, y)");
  assert.equal(matlabPlot.classification, "translated");
  assert.equal(matlabPlot.lowering_target, "_matlab.plot");

  for (const name of [
    "scatter",
    "surf",
    "subplot",
  ]) {
    const entry = surface.entries.find(
      ({ frontend, qualified_name }) =>
        frontend === "matlab" && qualified_name === name,
    );
    assert.equal(entry.classification, "unsupported", name);
    assert.equal(entry.plotting_lowerer_recognized, false, name);
    assert.equal(entry.runtime_export, null, name);
  }
  for (const name of [
    "plot.LineSpec",
    "hold",
    "xlabel",
    "grid",
    "legend",
    "set",
    "handle.Property",
  ]) {
    const entry = surface.entries.find(
      ({ frontend, qualified_name }) =>
        frontend === "matlab" && qualified_name === name,
    );
    assert.equal(entry.classification, "translated", name);
    assert.equal(entry.plotting_lowerer_recognized, true, name);
    assert.ok(entry.runtime_export, name);
  }
  assert.ok(surface.frontends.matlab.plotting_runtime_exports.includes("plot"));
  assert.ok(surface.frontends.matlab.plotting_runtime_exports.includes("hold"));
  assert.deepEqual(surface.frontends.matlab.session_model, {
    shared_module_namespace_across_cells: true,
    persistent_figure_axes_state: true,
    graphics_handles: true,
    evidence: ["tools/kernel.ts", "tools/matlab/frontend.ts", "src/lib/matlab.py"],
  });
});

test("every parser-advertised Wolfram graphics head has a runtime export", () => {
  const surface = generator.generateSurface(root);
  const runtimeExports = new Set(
    surface.frontends.wolfram.runtime_exports.map(({ name }) => name),
  );
  for (const name of surface.frontends.wolfram.parser_graphics_heads) {
    assert.ok(runtimeExports.has(name), name);
    const entry = surface.entries.find(
      ({ frontend, qualified_name, support_state, runtime_export }) =>
        frontend === "wolfram" &&
        qualified_name === name &&
        support_state === "implemented" &&
        runtime_export === name,
    );
    assert.equal(entry.runtime_export, name);
  }
});
