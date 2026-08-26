// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.SAGEJS_NATIVE_DISABLE = "1";

const { createForeignFrontend } = require("../dist/tools/foreign");
const { createSage } = require("../dist/tools/kernel.js");

let session;

test.before(async () => {
  session = await createSage();
});

test.after(async () => {
  await session.close();
});

async function plotSpec(session, name = "g") {
  const result = await session.evaluate([
    "import json",
    `print(${name}.spec().to_json())`,
  ].join("\n"));
  return JSON.parse(result.stdout.trim());
}

test("Wolfram lowering preserves ordered rules and source intent", async () => {
  const frontend = await createForeignFrontend("wolfram");
  const source = [
    "Plot[Sin[x],{x,0,1},PlotStyle->Red,",
    "     PlotStyle:>Blue,PlotLegends->{\"sine\"}]",
  ].join("\n");
  const lowering = frontend.lower(source, {
    captureResult: true,
    filename: "ordered-options.wl",
  });

  assert.match(lowering.source, /_wolfram\.PlotCall\(/);
  assert.match(lowering.source, /"rule": "Rule"/);
  assert.match(lowering.source, /"rule": "RuleDelayed"/);
  assert.match(lowering.source, /"filename": "ordered-options\.wl"/);
  assert.match(lowering.source, /"ranges": \["\{x,0,1\}"\]/);
  assert.match(lowering.source, /"source_span": \{"start":/);
  assert.doesNotMatch(lowering.source, /color=.*color=/);

  assert.doesNotThrow(() =>
    frontend.lower(
      "Graphics[{Circle[]},Axes->True,PlotRange->All]",
      { captureResult: true },
    )
  );
  assert.doesNotThrow(() =>
    frontend.lower(
      "Show[Graphics[Circle[]],PlotRange->{{-1,1},{-1,1}}]",
      { captureResult: true },
    )
  );
  assert.doesNotThrow(() =>
    frontend.lower(
      "Graphics3D[{Sphere[]},Boxed->False,Lighting->\"Neutral\"]",
      { captureResult: true },
    )
  );
});

test("Wolfram plots retain PlotSpec context and diagnose ignored options", {
  timeout: 60_000,
}, async () => {
  await session.evaluate(
    [
      "g = Plot[Sin[x],{x,0,Pi},PlotStyle->Red,",
      "         PlotStyle:>Blue,PlotLegends->{\"sine\"}];",
    ].join("\n"),
    { language: "wolfram" },
  );
  const rendered = await session.evaluate("g");
  assert.equal(rendered.display?.data.data[0].line.color, "blue");

  const spec = await plotSpec(session);
  assert.equal(spec.provenance.frontend, "wolfram");
  assert.equal(spec.provenance.source_language, "wolfram");
  assert.equal(spec.provenance.constructor, "Plot");
  assert.equal(spec.layers.length, 1);
  assert.equal(spec.layers[0].id, "layer-0");
  assert.equal(spec.layers[0].source_intent.frontend, "wolfram");
  assert.equal(spec.layers[0].source_intent.head, "Plot");
  assert.equal(spec.layers[0].source_intent.ranges[0], "{x,0,Pi}");
  assert.equal(spec.layers[0].source_intent.expression, "sin(x)");
  assert.match(
    spec.layers[0].source_intent.frontend_expression,
    /^Plot\[Sin\[x\]/,
  );

  const ordered = spec.layers[0].source_intent.ordered_options;
  assert.deepEqual(ordered.map(({ name }) => name), [
    "PlotStyle",
    "PlotStyle",
    "PlotLegends",
  ]);
  assert.deepEqual(ordered.map(({ rule }) => rule), [
    "Rule",
    "RuleDelayed",
    "Rule",
  ]);
  assert.equal(ordered[0].translation.target, "color");
  assert.equal(ordered[2].translation.classification, "unsupported");
  assert.equal(spec.diagnostics.length, 1);
  assert.equal(spec.diagnostics[0].code, "PLOT_OPTION_IGNORED");
  assert.equal(spec.diagnostics[0].details.option, "PlotLegends");
});

test("Wolfram Show preserves child IDs and lexical directive scope", {
  timeout: 60_000,
}, async () => {
  await session.evaluate(
    [
      "a = Plot[Sin[x],{x,0,Pi}];",
      "b = Plot[Cos[x],{x,0,Pi}];",
      "g = Show[a,b,PlotRange->{{0,Pi},{-1,1}}];",
    ].join("\n"),
    { language: "wolfram" },
  );
  const shown = await session.evaluate("g");
  assert.equal(shown.display?.data.data.length, 2);
  const shownSpec = await plotSpec(session);
  assert.deepEqual(shownSpec.layers.map(({ id }) => id), [
    "layer-0",
    "layer-1",
  ]);
  assert.equal(shownSpec.provenance.frontend, "wolfram");
  assert.equal(shownSpec.provenance.constructor, "Show");
  assert.deepEqual(
    shownSpec.layers.map(({ source_intent: intent }) => intent.head),
    ["Show", "Show"],
  );
  assert.deepEqual(
    shownSpec.layers.map(
      ({ source_intent: intent }) => intent.child_context.head
    ),
    ["Plot", "Plot"],
  );

  await session.evaluate(
    [
      "g = Graphics[{Red,Circle[],",
      "    {Blue,Opacity[.4],Disk[{1,0},.5]},Circle[{2,0},.5]},",
      "    Axes->False,FutureOption->7];",
    ].join("\n"),
    { language: "wolfram" },
  );
  const scoped = await session.evaluate("g");
  assert.deepEqual(
    scoped.display?.data.data.map((trace) =>
      trace.line?.color || trace.fillcolor
    ),
    ["red", "blue", "red"],
  );
  assert.equal(scoped.display?.data.data[1].opacity, 0.4);
  const scopedSpec = await plotSpec(session);
  assert.equal(scopedSpec.provenance.constructor, "Graphics");
  assert.equal(scopedSpec.diagnostics[0].code, "PLOT_OPTION_IGNORED");
  assert.equal(scopedSpec.diagnostics[0].details.option, "FutureOption");

  await session.evaluate(
    [
      "g = Graphics3D[{Red,Sphere[]},Boxed->False,",
      "    Lighting->\"Neutral\"];",
    ].join("\n"),
    { language: "wolfram" },
  );
  const solid = await session.evaluate("g");
  assert.equal(solid.display?.data.data[0].type, "surface");
  assert.equal(solid.display?.data.layout.scene.xaxis.visible, false);
  const solidSpec = await plotSpec(session);
  assert.equal(solidSpec.dimension, 3);
  assert.equal(solidSpec.provenance.constructor, "Graphics3D");
  assert.equal(solidSpec.layers[0].source_intent.head, "Graphics3D");
  assert.equal(solidSpec.diagnostics[0].details.option, "Lighting");
});

test("Wolfram Graphics preserves its Axes default and explicit override", {
  timeout: 60_000,
}, async () => {
  await session.evaluate("g = Graphics[{Line[{{0,0},{1,1}}]}];", {
    language: "wolfram",
  });
  const hidden = await plotSpec(session);
  assert.equal(hidden.axes_or_scene.xaxis.visible, false);
  assert.equal(hidden.axes_or_scene.yaxis.visible, false);

  await session.evaluate(
    "g = Graphics[{Line[{{0,0},{1,1}}]},Axes->True];",
    { language: "wolfram" },
  );
  const shown = await plotSpec(session);
  assert.equal(shown.axes_or_scene.xaxis.visible, true);
  assert.equal(shown.axes_or_scene.yaxis.visible, true);
  assert.equal(
    shown.layers[0].source_intent.ordered_options[0].translation.target,
    "axes",
  );
});
