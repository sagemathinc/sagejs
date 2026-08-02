"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const { plotlyHtmlFallback } = require("../dist/tools/jupyter-kernel.js");

async function main() {
  const { renderSageDisplay } = await import(
    "../packages/flint-wasm/plotly-renderer.mjs"
  );
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

    const sized = await session.evaluate(
      "plot(x^2, (x, 0, 1), figsize=5)",
    );
    assert.equal(sized.display?.data.layout.width, 500);
    assert.equal(sized.display?.data.layout.height, 375);
    const sizedHtml = plotlyHtmlFallback(sized.display?.data);
    assert.match(sizedHtml, /width:500px;height:375px;max-width:100%/);
    const renderElement = { style: {} };
    let renderedFigure;
    await renderSageDisplay(renderElement, sized.display, {
      async react(_element, data, layout, config) {
        renderedFigure = { data, layout, config };
      },
    });
    assert.equal(renderElement.style.width, "500px");
    assert.equal(renderElement.style.height, "375px");
    assert.equal(renderElement.style.maxWidth, "100%");
    assert.equal(renderedFigure.layout.width, 500);
    const resized = await session.evaluate(
      "show(line([(0,0), (1,1)]), figsize=[4, 2])",
    );
    assert.equal(resized.display?.data.layout.width, 400);
    assert.equal(resized.display?.data.layout.height, 200);
    await assert.rejects(
      session.evaluate("plot(x, (x, 0, 1), figsize=0)"),
      /figsize should be positive/,
    );

    const layoutOptions = await session.evaluate(
      [
        "layout_plot = line([(-1,0), (1,2)], legend_label='L')",
        "layout_plot.show(",
        "    axes=False, frame=True, axes_labels=['u','v'],",
        "    axes_labels_size=2, fontsize=12,",
        "    xmin=-2, xmax=3, ymin=-1, ymax=4, flip_x=True,",
        "    ticks=[[-1,0,1], [0,2]],",
        "    tick_formatter=[['minus','zero','plus'], ['low','high']],",
        "    gridlines=[[-0.5,0.5], [1]],",
        "    gridlinesstyle={'color':'gray','linestyle':':'},",
        "    title='Layout', title_pos=(0.25,0.9),",
        "    transparent=True, show_legend=True,",
        "    legend_options={'loc':'lower left','back_color':'yellow',",
        "                    'title':'Legend'},",
        "    figsize=(4,2), dpi=120)",
      ].join("\n"),
    );
    const layout = layoutOptions.display?.data.layout;
    assert.equal(layout.width, 480);
    assert.equal(layout.height, 240);
    assert.equal(layout.xaxis.visible, true);
    assert.equal(layout.xaxis.showline, true);
    assert.equal(layout.xaxis.zeroline, false);
    assert.deepEqual(layout.xaxis.range, [3, -2]);
    assert.deepEqual(layout.xaxis.tickvals, [-1, 0, 1]);
    assert.deepEqual(layout.xaxis.ticktext, ["minus", "zero", "plus"]);
    assert.equal(layout.xaxis.title.font.size, 24);
    assert.equal(layout.shapes.length, 3);
    assert.equal(layout.shapes[0].line.dash, "dot");
    assert.equal(layout.title.x, 0.25);
    assert.equal(layout.paper_bgcolor, "rgba(0,0,0,0)");
    assert.equal(layout.legend.x, 0);
    assert.equal(layout.legend.y, 0);
    assert.equal(layout.legend.bgcolor, "yellow");
    assert.equal(layout.legend.title.text, "Legend");

    const graphicsMethods = await session.evaluate(
      [
        "gm = line([(0,0),(1,1)])",
        "gm.fontsize(14)",
        "gm.axes_labels_size(1.5)",
        "gm.axes_labels(['horizontal','vertical'])",
        "gm.set_flip(flip_y=True)",
        "gm.set_legend_options(loc='upper left')",
        "gm",
      ].join("\n"),
    );
    assert.equal(graphicsMethods.display?.data.layout.font.size, 14);
    assert.equal(
      graphicsMethods.display?.data.layout.yaxis.autorange,
      "reversed",
    );
    assert.equal(graphicsMethods.display?.data.layout.legend.x, 0);
    assert.equal(graphicsMethods.display?.data.layout.legend.y, 1);

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

    const directHistogram = await session.evaluate(
      "histogram([1, 1, 2, 3], bins=2, density=True, " +
        "cumulative=True, color='teal', label='samples')",
    );
    assert.equal(directHistogram.display?.data.data[0].histnorm,
      "probability density");
    assert.equal(directHistogram.display?.data.data[0].cumulative.enabled,
      true);
    assert.equal(directHistogram.display?.data.data[0].showlegend, true);

    const scattered = await session.evaluate(
      "scatter_plot([(0,1), (2,3)], marker='s', markersize=20, " +
        "facecolor='pink', edgecolor='black')",
    );
    assert.equal(scattered.display?.data.data[0].marker.symbol, "square");
    assert.equal(scattered.display?.data.data[0].marker.size, 20);
    assert.equal(scattered.display?.data.data[0].marker.color, "pink");

    const geometric = await session.evaluate(
      [
        "e = ellipse((1,2), 3, 1, angle=pi/2, color='red')",
        "a = arc((0,0), 2, 1, sector=(0,pi/2))",
        "d = disk((0,0), (2,1), (0,pi/2), color='gold')",
        "e + a + d",
      ].join("\n"),
    );
    assert.equal(geometric.display?.data.data.length, 3);
    assert.equal(geometric.display?.data.data[2].fill, "toself");
    assert.equal(geometric.display?.data.layout.yaxis.scaleanchor, "x");
    assert.ok(
      Math.abs(geometric.display?.data.data[0].x[0] - 1) < 1e-12,
    );
    assert.ok(
      Math.abs(geometric.display?.data.data[0].y[0] - 5) < 1e-12,
    );

    const bezier = await session.evaluate(
      "bezier_path([[(0,0), (1,1), (2,0)], [(3,-1), (4,0)]], " +
        "plot_points=2)",
    );
    assert.deepEqual(bezier.display?.data.data[0].x, [0, 1, 2, 3, 4]);
    assert.deepEqual(bezier.display?.data.data[0].y, [0, 0.5, 0, -0.5, 0]);

    const stepped = await session.evaluate(
      "plot_step_function([(2, 4), (0, 1), (1, 3)])",
    );
    assert.deepEqual(stepped.display?.data.data[0].x, [0, 1, 1, 2, 2]);
    assert.deepEqual(stepped.display?.data.data[0].y, [1, 1, 3, 3, 4]);

    const logarithmic = await session.evaluate(
      "list_plot_loglog([(1,1), (10,100)], plotjoined=True)",
    );
    assert.equal(logarithmic.display?.data.layout.xaxis.type, "log");
    assert.equal(logarithmic.display?.data.layout.yaxis.type, "log");

    const polar = await session.evaluate(
      "polar_plot(lambda t: 1, (0, pi/2), plot_points=2, " +
        "adaptive_recursion=0, randomize=False)",
    );
    assert.ok(Math.abs(polar.display?.data.data[0].x[0] - 1) < 1e-12);
    assert.ok(Math.abs(polar.display?.data.data[0].y[1] - 1) < 1e-12);

    const density = await session.evaluate(
      "x,y=var('x y'); density_plot(x-y, (x,0,1), (y,0,1), " +
        "plot_points=(3,2), cmap='Viridis')",
    );
    assert.equal(density.display?.data.data[0].type, "heatmap");
    assert.deepEqual(density.display?.data.data[0].x, [0, 0.5, 1]);
    assert.deepEqual(density.display?.data.data[0].y, [0, 1]);
    assert.deepEqual(density.display?.data.data[0].z, [
      [0, 0.5, 1],
      [-1, -0.5, 0],
    ]);
    assert.equal(density.display?.data.data[0].colorscale, "Viridis");
    assert.equal(density.display?.data.data[0].zsmooth, "best");
    assert.equal(
      (await session.evaluate(
        "density_plot(x-y,(x,0,1),(y,0,1),plot_points=2)[0]",
      )).repr,
      "DensityPlot defined by a 2 x 2 data grid",
    );

    const contour = await session.evaluate(
      "contour_plot(x^2+y^2, (x,-1,1), (y,-1,1), " +
        "plot_points=3, contours=[0,1], fill=False, color='red')",
    );
    const contourTrace = contour.display?.data.data[0];
    assert.equal(contourTrace.type, "contour");
    assert.equal(contourTrace.autocontour, false);
    assert.equal(contourTrace.contours.start, 0);
    assert.equal(contourTrace.contours.end, 1);
    assert.equal(contourTrace.contours.size, 1);
    assert.equal(contourTrace.contours.coloring, "lines");
    assert.equal(contourTrace.line.color, "red");

    const implicit = await session.evaluate(
      "implicit_plot(x^2+y^2-1, (x,-1,1), (y,-1,1), plot_points=3)",
    );
    assert.equal(implicit.display?.data.data[0].contours.start, 0);
    assert.equal(implicit.display?.data.data[0].contours.end, 0);
    assert.equal(implicit.display?.data.data[0].contours.coloring, "lines");
    assert.equal(implicit.display?.data.data[0].showscale, false);

    const region = await session.evaluate(
      "region_plot([x>=0,y>=0], (x,-1,1), (y,-1,1), " +
        "plot_points=3, incol='orange')",
    );
    assert.equal(region.display?.data.data[0].type, "heatmap");
    assert.deepEqual(region.display?.data.data[0].z, [
      [0, 0, 0],
      [0, 1, 1],
      [0, 1, 1],
    ]);
    assert.equal(region.display?.data.data[0].colorscale[2][1], "orange");

    const matrixPlot = await session.evaluate(
      "matrix_plot(matrix([[1,2],[3,4]]))",
    );
    assert.equal(matrixPlot.display?.data.data[0].type, "heatmap");
    assert.deepEqual(matrixPlot.display?.data.data[0].z, [[1, 2], [3, 4]]);
    assert.equal(matrixPlot.display?.data.layout.yaxis.autorange, "reversed");
    assert.equal(matrixPlot.display?.data.layout.xaxis.visible, true);

    assert.equal((await session.evaluate("line2d is line")).repr, "True");
    assert.equal((await session.evaluate("point2d is point")).repr, "True");
    assert.match(
      (await session.evaluate("histogram.__doc__")).repr,
      /Compute and draw a histogram/,
    );
    assert.match(
      (await session.evaluate("implicit_plot.__doc__")).repr,
      /plane curve/,
    );

    const plain = await session.evaluate("factor(12)");
    assert.equal(plain.display, undefined);
  } finally {
    await session.close();
  }

}

test("Sage-compatible graphics and rich display", {
  timeout: 30_000,
}, main);
