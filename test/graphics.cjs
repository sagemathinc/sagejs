"use strict";

const assert = require("node:assert/strict");

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

    const plain = await session.evaluate("factor(12)");
    assert.equal(plain.display, undefined);
  } finally {
    await session.close();
  }

  console.log("Sage-compatible graphics tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
