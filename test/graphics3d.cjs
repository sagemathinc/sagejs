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
    assert.equal(surface.display?.data.data.length, 2);
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
    });
    assert.equal(surface.display?.data.data[1].type, "scatter3d");
    assert.equal(surface.display?.data.data[1].mode, "lines");
    assert.equal(surface.display?.data.data[1].x.length, 48);
    assert.ok(surface.display?.data.data[1].z[0] < 0);
    assert.ok(surface.display?.data.data[1].z[24] > 0);
    assert.equal(surface.display?.data.data[1].line.color, "black");
    assert.equal(surface.display?.data.data[1].line.width, 1);
    assert.equal(surface.display?.data.data[1].opacity, 0.8);
    assert.equal(surface.display?.data.layout.title.text, "A saddle");
    assert.equal(surface.display?.data.layout.scene.xaxis.title.text, "u");
    assert.equal(surface.display?.data.layout.scene.yaxis.title.text, "v");
    assert.equal(surface.display?.data.layout.scene.zaxis.title.text, "z");
    assert.equal(surface.display?.data.layout.scene.xaxis.visible, false);
    const sizedSurface = await session.evaluate(
      "plot3d(lambda u,v: u+v, (-1,1), (-1,1), " +
        "plot_points=2, figsize=5)",
    );
    assert.equal(sizedSurface.display?.data.layout.width, 500);
    assert.equal(sizedSurface.display?.data.layout.height, 375);
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
      ["surface", "scatter3d", "surface"],
    );
    assert.equal(composed.display?.data.data[2].colorscale[0][1], "red");
    assert.equal(composed.display?.data.data[2].opacity, 0.5);
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

    const implicitEquality = await session.evaluate(
      [
        "implicit_plot3d(x^2 + y^2 + z^2 == 1,",
        "    [x, -1, 1], [y, -1, 1], [z, -1, 1],",
        "    plot_points=3)",
      ].join("\n"),
    );
    assert.deepEqual(
      implicitEquality.display?.data.data[0].value,
      implicit.display?.data.data[0].value,
    );

    assert.equal(
      (
        await session.evaluate(
          "sum([sphere((-1,0,0)), sphere((1,0,0))])",
        )
      ).display?.data.data.length,
      2,
    );

    const polygonMesh = await session.evaluate(
      "polygon3d([(0,0,0),(1,0,0),(0,1,0)], " +
        "color='red', opacity=.5)",
    );
    assert.equal(polygonMesh.display?.data.data[0].type, "mesh3d");
    assert.deepEqual(polygonMesh.display?.data.data[0].i, [0]);
    assert.deepEqual(polygonMesh.display?.data.data[0].j, [1]);
    assert.deepEqual(polygonMesh.display?.data.data[0].k, [2]);
    assert.equal(polygonMesh.display?.data.data[0].color, "red");
    assert.equal(polygonMesh.display?.data.data[0].opacity, 0.5);
    assert.equal(
      (await session.evaluate(
        "polygon3d([(0,0,0),(1,0,0),(0,1,0)])[0]",
      )).repr,
      "3D mesh with 3 vertices and 1 faces",
    );

    const label3d = await session.evaluate(
      "text3d('Sage', (1,2,3), color='green', fontsize=20)",
    );
    assert.equal(label3d.display?.data.data[0].mode, "text");
    assert.deepEqual(label3d.display?.data.data[0].text, ["Sage"]);
    assert.equal(label3d.display?.data.data[0].textfont.color, "green");
    assert.equal(label3d.display?.data.data[0].textfont.size, 20);

    const directed = await session.evaluate(
      "arrow3d((0,0,0),(1,2,3),color='orange',head_len=.3)",
    );
    assert.deepEqual(
      directed.display?.data.data.map((trace) => trace.type),
      ["scatter3d", "cone"],
    );
    assert.equal(directed.display?.data.data[1].anchor, "tip");
    assert.equal(directed.display?.data.data[1].sizeref, 0.3);
    assert.equal(directed.display?.data.data[1].colorscale[0][1], "orange");
    const arrowLine = await session.evaluate(
      "line3d([(0,0,0),(1,0,0)],arrow_head=True,color='purple')",
    );
    assert.deepEqual(
      arrowLine.display?.data.data.map((trace) => trace.type),
      ["scatter3d", "cone"],
    );

    const coloredCube = await session.evaluate(
      "cube((1,2,3),size=2,color=['red','green','blue'])",
    );
    assert.equal(coloredCube.display?.data.data[0].type, "mesh3d");
    assert.equal(coloredCube.display?.data.data[0].facecolor.length, 12);
    assert.equal(coloredCube.display?.data.data[0].facecolor[0], "red");
    assert.equal(coloredCube.display?.data.data[0].facecolor[2], "green");
    assert.equal(Math.min(...coloredCube.display?.data.data[0].x), 0);
    assert.equal(Math.max(...coloredCube.display?.data.data[0].x), 2);
    assert.deepEqual(
      coloredCube.display?.data.layout.scene.aspectratio,
      { x: 1, y: 1, z: 1 },
    );

    const meshedIcosahedron = await session.evaluate(
      "icosahedron(color='green', figsize=10, mesh=True, thickness=5)",
    );
    assert.deepEqual(
      meshedIcosahedron.display?.data.data.map((trace) => trace.type),
      ["mesh3d", "scatter3d"],
    );
    assert.equal(meshedIcosahedron.display?.data.data[0].color, "green");
    assert.equal(
      meshedIcosahedron.display?.data.data[1].line.color,
      "black",
    );
    assert.equal(meshedIcosahedron.display?.data.data[1].line.width, 5);
    assert.equal(meshedIcosahedron.display?.data.layout.width, 1000);
    assert.equal(meshedIcosahedron.display?.data.layout.height, 750);

    const translatedIcosahedra = await session.evaluate(
      "icosahedron(mesh=True, opacity=0.4) + " +
        "icosahedron(color='red', mesh=True, opacity=0.5)." +
        "translate((0,0,.5))",
    );
    assert.deepEqual(
      translatedIcosahedra.display?.data.data.map((trace) => trace.type),
      ["mesh3d", "scatter3d", "mesh3d", "scatter3d"],
    );
    const originalMesh = translatedIcosahedra.display?.data.data[0];
    const shiftedMesh = translatedIcosahedra.display?.data.data[2];
    assert.equal(originalMesh.opacity, 0.4);
    assert.equal(shiftedMesh.opacity, 0.5);
    assert.equal(shiftedMesh.color, "red");
    assert.deepEqual(shiftedMesh.x, originalMesh.x);
    assert.deepEqual(shiftedMesh.y, originalMesh.y);
    assert.deepEqual(
      shiftedMesh.z,
      originalMesh.z.map((value) => value + 0.5),
    );
    const originalWire = translatedIcosahedra.display?.data.data[1];
    const shiftedWire = translatedIcosahedra.display?.data.data[3];
    assert.deepEqual(shiftedWire.x, originalWire.x);
    assert.deepEqual(shiftedWire.y, originalWire.y);
    assert.deepEqual(
      shiftedWire.z,
      originalWire.z.map((value) => value === null ? null : value + 0.5),
    );

    const translatedArrow = await session.evaluate(
      "line3d([(0,0,0),(1,2,3)], arrow_head=True).translate(4,5,6)",
    );
    assert.deepEqual(translatedArrow.display?.data.data[0].x, [4, 5]);
    assert.deepEqual(translatedArrow.display?.data.data[0].y, [5, 7]);
    assert.deepEqual(translatedArrow.display?.data.data[0].z, [6, 9]);
    assert.deepEqual(translatedArrow.display?.data.data[1].x, [5]);
    assert.deepEqual(translatedArrow.display?.data.data[1].y, [7]);
    assert.deepEqual(translatedArrow.display?.data.data[1].z, [9]);
    assert.deepEqual(translatedArrow.display?.data.data[1].u, [1 / 14 ** 0.5]);
    const translatedSurface = await session.evaluate(
      "plot3d(lambda u,v: u+v, (0,1), (0,1), plot_points=2)." +
        "translate((1,2,3))",
    );
    assert.deepEqual(translatedSurface.display?.data.data[0].x, [
      [1, 2], [1, 2],
    ]);
    assert.deepEqual(translatedSurface.display?.data.data[0].y, [
      [2, 2], [3, 3],
    ]);
    assert.deepEqual(translatedSurface.display?.data.data[0].z, [
      [3, 4], [4, 5],
    ]);
    const composedTranslation = await session.evaluate(
      "point3d((0,0,0)).translate(vector((1,2,3)))." +
        "translate(-1,-1,-1)",
    );
    assert.deepEqual(composedTranslation.display?.data.data[0].x, [0]);
    assert.deepEqual(composedTranslation.display?.data.data[0].y, [1]);
    assert.deepEqual(composedTranslation.display?.data.data[0].z, [2]);
    assert.match(
      (await session.evaluate("Graphics3d.translate.__doc__")).repr,
      /translated by a three-dimensional vector/,
    );
    await assert.rejects(
      session.evaluate("icosahedron().translate((1,2))"),
      /exactly three coordinates/,
    );

    assert.equal(
      (await session.evaluate(
        "[len(tetrahedron()[0].faces),len(cube()[0].faces)," +
          "len(octahedron()[0].faces),len(dodecahedron()[0].faces)," +
          "len(icosahedron()[0].faces)]",
      )).repr,
      "[4, 6, 8, 12, 20]",
    );
    assert.equal(
      (await session.evaluate(
        "[len(tetrahedron()[0].vertices),len(cube()[0].vertices)," +
          "len(octahedron()[0].vertices),len(dodecahedron()[0].vertices)," +
          "len(icosahedron()[0].vertices)]",
      )).repr,
      "[4, 8, 6, 20, 12]",
    );
    assert.equal(
      (await session.evaluate("len(frame3d((0,0,0),(1,1,1)))")).repr,
      "12",
    );
    assert.match(
      (await session.evaluate("dodecahedron.__doc__")).repr,
      /regular dodecahedron/,
    );

    const spherical = await session.evaluate(
      [
        "theta, phi = var('theta phi')",
        "spherical_plot3d(2, (theta,0,2*pi), (phi,0,pi),",
        "    plot_points=(3,3), color='cyan')",
      ].join("\n"),
    );
    assert.equal(spherical.display?.data.data[0].type, "surface");
    assert.equal(
      spherical.display?.data.data[0].x[0].every(
        (value) => Math.abs(value) < 1e-12,
      ),
      true,
    );
    assert.ok(Math.abs(spherical.display?.data.data[0].x[1][0] - 2) < 1e-12);
    assert.ok(Math.abs(spherical.display?.data.data[0].x[1][1] + 2) < 1e-12);
    assert.ok(Math.abs(spherical.display?.data.data[0].z[0][0] - 2) < 1e-12);
    assert.ok(Math.abs(spherical.display?.data.data[0].z[2][0] + 2) < 1e-12);

    const transformed = await session.evaluate(
      [
        "C = Cylindrical('radius', ['azimuth','height'])",
        "plot3d(2, (theta,0,pi), (z,-1,1), transformation=C,",
        "    plot_points=(3,2))",
      ].join("\n"),
    );
    assert.deepEqual(transformed.display?.data.data[0].z, [
      [-1, -1, -1],
      [1, 1, 1],
    ]);
    assert.ok(Math.abs(transformed.display?.data.data[0].x[0][0] - 2) < 1e-12);
    assert.ok(Math.abs(transformed.display?.data.data[0].x[0][2] + 2) < 1e-12);
    assert.equal(
      (await session.evaluate("C")).repr,
      "Cylindrical coordinate transform (radius in terms of azimuth, height)",
    );
    assert.equal(
      (await session.evaluate(
        "r=var('r'); Spherical('radius',['azimuth','inclination'])." +
          "transform(radius=r,azimuth=theta,inclination=phi)",
      )).repr,
      "(r*sin(phi)*cos(theta), r*sin(phi)*sin(theta), r*cos(phi))",
    );
    assert.equal(
      (await session.evaluate(
        "SphericalElevation('radius',['azimuth','elevation'])." +
          "transform(radius=r,azimuth=theta,elevation=phi)",
      )).repr,
      "(r*cos(phi)*cos(theta), r*sin(theta)*cos(phi), r*sin(phi))",
    );
    await assert.rejects(
      session.evaluate("Spherical('radius',['azimuth','height'])"),
      /variables were specified incorrectly/,
    );

    const listedGrid = await session.evaluate(
      "list_plot3d([[1,2,3],[4,5,6]], color='gold', mesh=True)",
    );
    assert.deepEqual(listedGrid.display?.data.data[0].x, [
      [0, 0, 0],
      [1, 1, 1],
    ]);
    assert.deepEqual(listedGrid.display?.data.data[0].y, [
      [0, 1, 2],
      [0, 1, 2],
    ]);
    assert.deepEqual(listedGrid.display?.data.data[0].z, [
      [1, 2, 3],
      [4, 5, 6],
    ]);
    assert.equal(listedGrid.display?.data.data[0].colorscale[0][1], "gold");
    assert.equal(listedGrid.display?.data.data[1].type, "scatter3d");

    const listedMatrix = await session.evaluate(
      "list_plot3d(matrix([[1,2],[3,4]]))",
    );
    assert.deepEqual(listedMatrix.display?.data.data[0].z, [
      [1, 2],
      [3, 4],
    ]);

    const listedPoints = await session.evaluate(
      "list_plot3d([(0,0,0),(1,0,1),(0,1,2)], color='red')",
    );
    assert.equal(listedPoints.display?.data.data[0].type, "mesh3d");
    assert.deepEqual(listedPoints.display?.data.data[0].x, [0, 1, 0]);
    assert.equal(listedPoints.display?.data.data[0].alphahull, -1);
    assert.equal(listedPoints.display?.data.data[0].delaunayaxis, "z");
    assert.equal(listedPoints.display?.data.data[0].color, "red");
    assert.equal(
      (await session.evaluate("len(list_plot3d([]))")).repr,
      "0",
    );
    assert.equal(
      (await session.evaluate("list_plot3d([(1,2,3)])[0]")).repr,
      "3D point set defined by 1 point(s)",
    );
    assert.equal(
      (await session.evaluate(
        "list_plot3d([[0,0,0],[1,0,1],[0,1,2]], point_list=True)[0]",
      )).repr,
      "3D surface triangulated from 3 points",
    );
    await assert.rejects(
      session.evaluate("list_plot3d([(0,0,1),(0,0,2),(1,0,0)])"),
      /same x,y coordinates and different z coordinates/,
    );
    await assert.rejects(
      session.evaluate(
        "list_plot3d([(0,0,0),(1,0,1),(0,1,2)], " +
          "interpolation_type='clough')",
      ),
      /clough list_plot3d interpolation is not implemented yet/,
    );

    const revolution = await session.evaluate(
      "t=var('t'); revolution_plot3d(t^2,(t,0,1),plot_points=(3,3))",
    );
    assert.deepEqual(revolution.display?.data.data[0].x[0], [0, 0.5, 1]);
    assert.deepEqual(revolution.display?.data.data[0].z, [
      [0, 0.25, 1],
      [0, 0.25, 1],
      [0, 0.25, 1],
    ]);
    assert.ok(
      Math.abs(revolution.display?.data.data[0].x[1][2] + 1) < 1e-12,
    );
    const translatedRevolution = await session.evaluate(
      "revolution_plot3d((t,0,t),(t,0,1),parallel_axis='x'," +
        "axis=(1,2),plot_points=(2,3),show_curve=True)",
    );
    assert.deepEqual(
      translatedRevolution.display?.data.data.map((trace) => trace.type),
      ["surface", "scatter3d"],
    );
    assert.deepEqual(translatedRevolution.display?.data.data[0].x, [
      [0, 1],
      [0, 1],
      [0, 1],
    ]);
    assert.equal(translatedRevolution.display?.data.data[1].line.color,
      "rgb(255,0,0)");
    assert.match(
      (await session.evaluate("list_plot3d.__doc__")).repr,
      /matrix, rectangular array/,
    );
    await assert.rejects(
      session.evaluate(
        "revolution_plot3d(t,(t,0,1),parallel_axis='diagonal')",
      ),
      /parallel_axis must be either/,
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
