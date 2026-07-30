"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    const composed = await session.evaluate(
      [
        "g = line([(0, 0), (1, 1)], color='red', thickness=2,",
        "         legend_label='diagonal')",
        "g = g + point((0, 1), color='black', size=12)",
        "g",
      ].join("\n"),
    );
    assert.equal(
      composed.repr,
      "Graphics object consisting of 2 graphics primitives",
    );
    assert.equal(composed.display?.mime, "application/vnd.plotly.v1+json");
    assert.deepEqual(composed.display?.data.data[0], {
      type: "scatter",
      mode: "lines",
      x: [0, 1],
      y: [0, 1],
      line: { color: "red", width: 2, dash: "solid" },
      opacity: 1,
      showlegend: true,
      name: "diagonal",
    });
    assert.equal(composed.display?.data.data[1].mode, "markers");
    assert.equal(composed.display?.data.data[1].marker.color, "black");
    assert.equal(composed.display?.data.layout.showlegend, true);
    assert.equal((await session.evaluate("len(g)")).repr, "2");
    assert.equal((await session.evaluate("g.xmin()")).repr, "0");
    assert.equal((await session.evaluate("g.xmax()")).repr, "1");
    assert.equal((await session.evaluate("g.ymin()")).repr, "0");
    assert.equal((await session.evaluate("g.ymax()")).repr, "1");
    assert.equal(
      (await session.evaluate("g[0]")).repr,
      "Line defined by 2 points",
    );
    assert.equal((await session.evaluate("g[0][1]")).repr, "(1, 1)");

    const sampled = await session.evaluate(
      [
        "plot(lambda x: x*x, (0, 2),",
        "     plot_points=3, adaptive_recursion=0, randomize=False,",
        "     title='Squares', axes_labels=['x', 'x^2'])",
      ].join("\n"),
    );
    assert.deepEqual(sampled.display?.data.data[0].x, [0, 1, 2]);
    assert.deepEqual(sampled.display?.data.data[0].y, [0, 1, 4]);
    assert.equal(sampled.display?.data.layout.title.text, "Squares");
    assert.equal(sampled.display?.data.layout.xaxis.title.text, "x");
    assert.equal(sampled.display?.data.layout.yaxis.title.text, "x^2");

    const listed = await session.evaluate(
      "list_plot([1, 4, 9], plotjoined=True)",
    );
    assert.deepEqual(listed.display?.data.data[0].x, [0, 1, 2]);
    assert.deepEqual(listed.display?.data.data[0].y, [1, 4, 9]);

    const shown = await session.evaluate(
      "show(plot(sin(x^2), (x, 0, pi)))",
    );
    assert.equal(shown.display?.mime, "application/vnd.plotly.v1+json");
    assert.equal(
      shown.repr,
      "Graphics object consisting of 1 graphics primitive",
    );
    const wolframPlot = await session.evaluate(
      "Plot[Sin[x^2],{x,0,Pi}]",
      { language: "wolfram" },
    );
    assert.equal(
      wolframPlot.display?.mime,
      "application/vnd.plotly.v1+json",
    );
    const wolframShow = await session.evaluate(
      "Show[Plot[Sin[x],{x,0,Pi}],Plot[Cos[x],{x,0,Pi}]]",
      { language: "wolfram" },
    );
    assert.equal(wolframShow.display?.data.data.length, 2);

    const labels = await session.evaluate(
      [
        "labels = graphics_array([[",
        "    text('A', (0, 1)), text('B', (1, 0))",
        "]])",
        "labels",
      ].join("\n"),
    );
    assert.equal(
      labels.repr,
      "Graphics Array of size 1 x 2",
    );
    assert.equal(labels.display?.data.layout.grid.columns, 2);
    assert.equal(labels.display?.data.data[0].mode, "text");
    assert.equal(labels.display?.data.data[0].text[0], "A");
    assert.equal(labels.display?.data.data[1].xaxis, "x2");
    assert.equal((await session.evaluate("len(list(labels))")).repr, "2");
    assert.equal(
      (await session.evaluate("labels[-1]")).repr,
      "Graphics object consisting of 1 graphics primitive",
    );

    const polygonPlot = await session.evaluate(
      "polygon([(0, 0), (1, 0), (0, 1)], color='green')",
    );
    assert.equal(polygonPlot.display?.data.data[0].fill, "toself");
    assert.equal(polygonPlot.display?.data.data[0].fillcolor, "green");

    const barPlot = await session.evaluate(
      "bar_chart([1, 3, 2], color='purple')",
    );
    assert.equal(barPlot.display?.data.data[0].type, "bar");
    assert.deepEqual(barPlot.display?.data.data[0].y, [1, 3, 2]);

    const arrowPlot = await session.evaluate(
      "arrow((0, 0), (2, 1), color='orange')",
    );
    assert.equal(arrowPlot.display?.data.data[0].mode, "lines+markers");
    assert.deepEqual(
      arrowPlot.display?.data.data[0].marker.symbol,
      ["circle", "arrow"],
    );

    const splinePlot = await session.evaluate(
      [
        "S = spline([(0, 0), (1, 1), (2, 0)])",
        "plot(S, (0, 2), plot_points=3,",
        "     adaptive_recursion=0, randomize=False)",
      ].join("\n"),
    );
    assert.deepEqual(splinePlot.display?.data.data[0].y, [0, 1, 0]);

    const timeSeries = await session.evaluate(
      "finance.TimeSeries([1, -1, 2]).sums().plot()",
    );
    assert.deepEqual(timeSeries.display?.data.data[0].y, [1, 0, 2]);
    const histogram = await session.evaluate(
      "finance.TimeSeries([1, 1, 2, 3]).plot_histogram(bins=2)",
    );
    assert.equal(histogram.display?.data.data[0].type, "histogram");
    assert.deepEqual(histogram.display?.data.data[0].x, [1, 1, 2, 3]);

    const plain = await session.evaluate("factor(12)");
    assert.equal(plain.display, undefined);
  } finally {
    await session.close();
  }

}

test("Sage-compatible graphics and rich display", {
  timeout: 30_000,
}, main);
