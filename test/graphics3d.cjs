"use strict";

const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    const surface = await session.evaluate(
      [
        "u, v = var('u v')",
        "g = plot3d(u^2 - v^2, (u, -1, 1), (v, -1, 1),",
        "           plot_points=(3, 3), color='purple', opacity=0.8,",
        "           mesh=True, frame=False,",
        "           title='A saddle', axes_labels=['u', 'v', 'z'])",
        "g",
      ].join("\n"),
    );
    assert.equal(surface.repr, "Graphics3d Object");
    assert.equal(surface.display?.mime, "application/vnd.plotly.v1+json");
    assert.equal(surface.display?.data.data.length, 1);
    assert.deepEqual(surface.display?.data.data[0], {
      type: "surface",
      x: [
        [-1, 0, 1],
        [-1, 0, 1],
        [-1, 0, 1],
      ],
      y: [
        [-1, -1, -1],
        [0, 0, 0],
        [1, 1, 1],
      ],
      z: [
        [0, -1, 0],
        [1, 0, 1],
        [0, -1, 0],
      ],
      colorscale: [
        [0, "purple"],
        [1, "purple"],
      ],
      showscale: false,
      opacity: 0.8,
      showlegend: false,
      contours: {
        x: { show: true, highlight: false, color: "black" },
        y: { show: true, highlight: false, color: "black" },
      },
    });
    assert.equal(surface.display?.data.layout.title.text, "A saddle");
    assert.equal(surface.display?.data.layout.scene.xaxis.title.text, "u");
    assert.equal(surface.display?.data.layout.scene.yaxis.title.text, "v");
    assert.equal(surface.display?.data.layout.scene.zaxis.title.text, "z");
    assert.equal(surface.display?.data.layout.scene.xaxis.visible, false);
    assert.equal((await session.evaluate("len(g)")).repr, "1");
    assert.equal(
      (await session.evaluate("g[0]")).repr,
      "3D surface defined by a 3 x 3 grid",
    );

    const composed = await session.evaluate(
      [
        "s = sphere((0, 0, 1), size=0.25, color='red',",
        "           opacity=0.5, plot_points=(5, 3))",
        "h = g + s",
        "h",
      ].join("\n"),
    );
    assert.equal(composed.repr, "Graphics3d Object");
    assert.deepEqual(
      composed.display?.data.data.map((trace) => trace.type),
      ["surface", "surface"],
    );
    assert.equal(composed.display?.data.data[1].colorscale[0][1], "red");
    assert.equal(composed.display?.data.data[1].opacity, 0.5);
    assert.deepEqual(
      composed.display?.data.layout.scene.aspectratio,
      { x: 1, y: 1, z: 1 },
    );

    const curve = await session.evaluate(
      [
        "c = parametric_plot3d(",
        "    (sin(u), cos(u), u/10), (u, 0, 2*pi),",
        "    plot_points=5, color='green', thickness=4)",
        "c",
      ].join("\n"),
    );
    assert.equal(curve.display?.data.data[0].type, "scatter3d");
    assert.equal(curve.display?.data.data[0].mode, "lines");
    const curveX = curve.display?.data.data[0].x;
    const expectedCurveX = [
      0,
      1,
      0,
      -1,
      0,
    ];
    assert.equal(curveX.length, expectedCurveX.length);
    for (let index = 0; index < curveX.length; index += 1) {
      assert.ok(Math.abs(curveX[index] - expectedCurveX[index]) < 1e-12);
    }
    const curveZ = curve.display?.data.data[0].z;
    const expectedCurveZ = [
      0,
      Math.PI / 20,
      Math.PI / 10,
      (3 * Math.PI) / 20,
      Math.PI / 5,
    ];
    assert.equal(curveZ.length, expectedCurveZ.length);
    for (let index = 0; index < curveZ.length; index += 1) {
      assert.ok(Math.abs(curveZ[index] - expectedCurveZ[index]) < 1e-12);
    }
    assert.equal(curve.display?.data.data[0].line.color, "green");
    assert.equal(curve.display?.data.data[0].line.width, 4);

    const parametricSurface = await session.evaluate(
      [
        "p = parametric_plot3d(",
        "    (u, v, u*v), (u, 0, 1), (v, 0, 1),",
        "    plot_points=(2, 2), color='gold')",
        "p",
      ].join("\n"),
    );
    assert.deepEqual(parametricSurface.display?.data.data[0].x, [
      [0, 1],
      [0, 1],
    ]);
    assert.deepEqual(parametricSurface.display?.data.data[0].y, [
      [0, 0],
      [1, 1],
    ]);
    assert.deepEqual(parametricSurface.display?.data.data[0].z, [
      [0, 0],
      [0, 1],
    ]);

    const pointsAndLine = await session.evaluate(
      [
        "q = line3d([(0, 0, 0), (1, 2, 3)], color='orange')",
        "q += point3d((1, 1, 1), color='black', size=8)",
        "q",
      ].join("\n"),
    );
    assert.deepEqual(
      pointsAndLine.display?.data.data.map((trace) => trace.mode),
      ["lines", "markers"],
    );
    assert.equal((await session.evaluate("q[0][1]")).repr, "(1, 2, 3)");

    const constant = await session.evaluate(
      "plot3d(pi, (-1, 1), (-1, 1), plot_points=2)",
    );
    assert.deepEqual(constant.display?.data.data[0].z, [
      [Math.PI, Math.PI],
      [Math.PI, Math.PI],
    ]);

    const implicit = await session.evaluate(
      [
        "x, y, z = var('x,y,z')",
        "implicit_plot3d(x^2 + y^2 + z^2 - 1,",
        "    (x, -1, 1), (y, -1, 1), (z, -1, 1),",
        "    plot_points=3)",
      ].join("\n"),
    );
    assert.equal(implicit.repr, "Graphics3d Object");
    assert.equal(implicit.display?.data.data[0].type, "isosurface");
    assert.equal(implicit.display?.data.data[0].value.length, 27);
    assert.equal(implicit.display?.data.data[0].value[13], -1);

    assert.equal(
      (
        await session.evaluate(
          "sum([sphere((-1,0,0)), sphere((1,0,0))])",
        )
      ).display?.data.data.length,
      2,
    );

    await assert.rejects(
      session.evaluate(
        "plot3d(lambda u,v: u+v, (-1,1), (-1,1), adaptive=True)",
      ),
      /adaptive plot3d refinement is not implemented yet/,
    );
  } finally {
    await session.close();
  }

  console.log("Sage-compatible three-dimensional graphics tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
