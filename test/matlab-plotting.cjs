"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createForeignFrontend } = require("../dist/tools/foreign");
const { createSage } = require("../dist/tools/kernel.js");

async function evaluateMatlab(session, source) {
  return session.evaluate(source, { language: "matlab" });
}

test("MATLAB parser lowers plotting calls, commands, and properties", async () => {
  const frontend = await createForeignFrontend("matlab");
  const source = [
    "h = plot([1 2 3], 'r--o', 'LineWidth', 2);",
    "hold on",
    "grid off",
    "h.Color = 'k';",
    "h.LineWidth",
    "figure",
    "",
  ].join("\n");
  const lowering = frontend.lower(source, { captureResult: true });
  assert.equal(lowering.ast.kind, "program");
  assert.equal(lowering.ast.body[3].target.kind, "field");
  assert.deepEqual(lowering.ast.body[3].target.fields, ["Color"]);
  assert.match(lowering.source, /_matlab\.plot\(/);
  assert.doesNotMatch(lowering.source, /line\(list\(zip/);
  assert.match(lowering.source, /_matlab\.hold\("on"\)/);
  assert.match(lowering.source, /_matlab\.grid\("off"\)/);
  assert.match(
    lowering.source,
    /_matlab\.set_property\(h, "Color", 'k'\)/,
  );
  assert.match(
    lowering.source,
    /_matlab\.get_property\(h, "LineWidth"\)/,
  );
  assert.match(lowering.source, /_matlab\.figure\(\)/);
  assert.equal(lowering.hasResult, false);
});

test("MATLAB plotting state persists across cells with stable live handles", async () => {
  const previousNativeDisable = process.env.SAGEJS_NATIVE_DISABLE;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  const session = await createSage();
  const isolated = await createSage();
  try {
    await evaluateMatlab(
      session,
      "h = plot([10 20 15], 'r--o', 'LineWidth', 2);",
    );
    const first = await evaluateMatlab(session, "h");
    assert.equal(first.display?.mime, "application/vnd.plotly.v1+json");
    assert.equal(first.display?.data.data.length, 1);
    assert.deepEqual(first.display?.data.data[0].x, [1, 2, 3]);
    assert.deepEqual(first.display?.data.data[0].y, [10, 20, 15]);
    assert.equal(first.display?.data.data[0].line.color, "#d62728");
    assert.equal(first.display?.data.data[0].line.width, 2);
    assert.equal(first.display?.data.data[0].line.dash, "dash");
    assert.equal(first.display?.data.data[0].mode, "lines+markers");
    assert.equal((await evaluateMatlab(session, "get(h,'HandleId')")).repr, "'matlab.line-0'");

    await evaluateMatlab(session, "h.LineWidth = 4;");
    assert.equal((await evaluateMatlab(session, "h.LineWidth")).repr, "4.0");
    await evaluateMatlab(session, "set(h, 'Color', 'k', 'DisplayName', 'up');");
    assert.equal((await evaluateMatlab(session, "get(h,'Color')")).repr, "'#111111'");

    await evaluateMatlab(session, "hold on");
    assert.equal((await evaluateMatlab(session, "ishold()")).repr, "True");
    await evaluateMatlab(
      session,
      "h2 = plot([1 2 3], [3 2 1], 'b:');",
    );
    assert.equal((await evaluateMatlab(session, "get(h2,'HandleId')")).repr, "'matlab.line-1'");
    await evaluateMatlab(session, "xlabel('time'); ylabel('value');");
    await evaluateMatlab(session, "title('Persistent MATLAB state');");
    await evaluateMatlab(session, "xlim([0 4]); ylim([0 25]);");
    await evaluateMatlab(session, "legend('up','down');");
    await evaluateMatlab(session, "grid on");
    const held = await evaluateMatlab(session, "gcf()");
    assert.equal(held.display?.data.data.length, 2);
    assert.deepEqual(
      held.display?.data.data.map((trace) => trace.uid),
      ["matlab.line-0", "matlab.line-1"],
    );
    assert.deepEqual(
      held.display?.data.data.map((trace) => trace.name),
      ["up", "down"],
    );
    assert.equal(held.display?.data.layout.showlegend, true);
    assert.equal(held.display?.data.layout.xaxis.title.text, "time");
    assert.equal(held.display?.data.layout.yaxis.title.text, "value");
    assert.deepEqual(held.display?.data.layout.xaxis.range, [0, 4]);
    assert.deepEqual(held.display?.data.layout.yaxis.range, [0, 25]);
    assert.equal(held.display?.data.layout.xaxis.showgrid, true);
    assert.equal(held.display?.data.layout.title.text, "Persistent MATLAB state");
    const axesDisplay = await evaluateMatlab(session, "gca()");
    assert.equal(axesDisplay.display?.data.data.length, 2);
    await evaluateMatlab(session, "ax = gca();");
    assert.equal((await evaluateMatlab(session, "xlim(ax)")).repr, "[0.0, 4.0]");

    await evaluateMatlab(session, "snapshot = plotspec(h2);");
    const serialized = await session.evaluate(
      "print(snapshot.to_json())",
      { language: "python" },
    );
    const spec = JSON.parse(serialized.stdout.trim());
    assert.equal(spec.dimension, 2);
    assert.deepEqual(
      spec.layers.map((layer) => layer.id),
      ["matlab.line-0", "matlab.line-1"],
    );
    assert.equal(spec.layers[1].kind, "line");
    assert.equal(spec.layers[1].metadata.matlab_axes, "matlab.axes-0");
    assert.equal(spec.provenance.frontend, "matlab");
    assert.equal(spec.provenance.metadata.hold, true);
    assert.deepEqual(spec.axes_or_scene.xaxis.range, [0, 4]);

    await evaluateMatlab(session, "hold off");
    const replacement = await evaluateMatlab(
      session,
      "plot([0 1], [7 8], 'm-', 'LineWidth', 3)",
    );
    assert.equal(replacement.display?.data.data.length, 1);
    assert.equal(replacement.display?.data.data[0].uid, "matlab.line-2");
    assert.equal(replacement.display?.data.layout.showlegend, false);
    assert.equal(replacement.display?.data.layout.title, undefined);
    assert.equal(replacement.display?.data.layout.xaxis.title, undefined);
    assert.equal(replacement.display?.data.layout.xaxis.range, undefined);
    assert.equal(replacement.display?.data.layout.xaxis.showgrid, false);
    await assert.rejects(
      evaluateMatlab(session, "get(h,'Color')"),
      /stale MATLAB graphics handle matlab\.line-0/,
    );

    const repeated = await evaluateMatlab(
      session,
      "handles = plot([0 1],[1 2],'r--o',[0 1],[2 1],'b:','LineWidth',5); handles",
    );
    assert.equal(repeated.display?.data.data.length, 2);
    assert.deepEqual(
      repeated.display?.data.data.map((trace) => trace.uid),
      ["matlab.line-3", "matlab.line-4"],
    );
    assert.deepEqual(
      repeated.display?.data.data.map((trace) => trace.line.width),
      [5, 5],
    );
    assert.deepEqual(
      repeated.display?.data.data.map((trace) => trace.line.color),
      ["#d62728", "#1f77b4"],
    );
    assert.equal(
      (await evaluateMatlab(session, "handles(1).Color")).repr,
      "'#d62728'",
    );
    assert.equal(
      (await evaluateMatlab(session, "get(handles(2),'HandleId')")).repr,
      "'matlab.line-4'",
    );

    await evaluateMatlab(session, "temporary = plot([4 5]);");
    assert.equal(
      (await evaluateMatlab(session, "get(temporary,'HandleId')")).repr,
      "'matlab.line-5'",
    );
    await evaluateMatlab(session, "delete(temporary);");
    assert.equal(
      (await evaluateMatlab(session, "get(temporary,'Valid')")).repr,
      "False",
    );
    assert.equal((await evaluateMatlab(session, "gcf()")).display?.data.data.length, 0);

    await evaluateMatlab(session, "f1 = gcf(); f2 = figure(); plot([8 9]);");
    assert.equal((await evaluateMatlab(session, "get(gcf(),'Number')")).repr, "2");
    await evaluateMatlab(session, "figure(f1);");
    assert.equal((await evaluateMatlab(session, "get(gcf(),'Number')")).repr, "1");
    await assert.rejects(
      evaluateMatlab(session, "axes()"),
      /multiple axes.*positioned-panel PlotSpec support/,
    );

    await assert.rejects(
      evaluateMatlab(session, "subplot(2,1,1)"),
      /subplot requires shared multi-panel PlotSpec support/,
    );
    await assert.rejects(
      evaluateMatlab(session, "surf([1 2; 3 4])"),
      /surf requires the shared semantic surface\/3D PlotSpec layer/,
    );

    const isolatedFigure = await evaluateMatlab(isolated, "gcf()");
    assert.equal(isolatedFigure.display?.data.data.length, 0);
    assert.equal(
      (await evaluateMatlab(isolated, "get(gcf(),'Number')")).repr,
      "1",
    );
  } finally {
    await session.close();
    await isolated.close();
    if (previousNativeDisable === undefined) {
      delete process.env.SAGEJS_NATIVE_DISABLE;
    } else {
      process.env.SAGEJS_NATIVE_DISABLE = previousNativeDisable;
    }
  }
});
