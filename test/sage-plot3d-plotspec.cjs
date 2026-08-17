"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

async function withSession(nativeDisabled, callback) {
  const saved = process.env.SAGEJS_NATIVE_DISABLE;
  if (nativeDisabled) process.env.SAGEJS_NATIVE_DISABLE = "1";
  else delete process.env.SAGEJS_NATIVE_DISABLE;
  const session = await createSage();
  try {
    await callback(session);
  } finally {
    await session.close();
    if (saved === undefined) delete process.env.SAGEJS_NATIVE_DISABLE;
    else process.env.SAGEJS_NATIVE_DISABLE = saved;
  }
}

test("guarded Sage surfaces and meshes expose semantic PlotSpec layers", async () => {
  await withSession(false, async (session) => {
    const surfaceDisplay = await session.evaluate(
      [
        "surface_semantic = plot3d(lambda x,y: x+y, (0,1), (0,1),",
        "  plot_points=(2,3), color='purple', opacity=.75, legend_label='sum')",
        "surface_semantic",
      ].join("\n"),
    );
    assert.deepEqual(surfaceDisplay.display?.data.data[0], {
      type: "surface",
      x: [[0, 1], [0, 1], [0, 1]],
      y: [[0, 0], [0.5, 0.5], [1, 1]],
      z: [[0, 1], [0.5, 1.5], [1, 2]],
      colorscale: [[0, "purple"], [1, "purple"]],
      showscale: false,
      opacity: 0.75,
      showlegend: true,
      name: "sum",
    });
    await session.evaluate(
      [
        "surface_spec = surface_semantic.with_plot_spec_context(",
        "  provenance={'frontend':'sage','constructor':'plot3d'},",
        "  source_intent={'expression':'x+y'}).spec()",
        "triangle_semantic = IndexFaceSet([",
        "  [(0,0,0),(1,0,0),(0,1,0)],",
        "  [(0,0,0),(0,1,0),(0,0,1)]], texture_list=['red','blue'])",
        "polygon_semantic = polygon3d([",
        "  (0,0,0),(2,0,0),(2,1,0),(0,1,0)], color='gold')",
        "combined_semantic_spec = (surface_semantic + triangle_semantic + polygon_semantic).spec()",
      ].join("\n"),
    );
    assert.equal(
      (await session.evaluate("surface_spec.layers[0].kind")).repr,
      "'surface'",
    );
    assert.equal(
      (await session.evaluate("surface_spec.layers[0].id")).repr,
      "'layer-0'",
    );
    assert.equal(
      (await session.evaluate("surface_spec.layers[0].source_intent['expression']")).repr,
      "'x+y'",
    );
    assert.equal(
      (await session.evaluate("surface_spec.provenance['frontend']")).repr,
      "'sage'",
    );
    assert.equal(
      (await session.evaluate("surface_spec.bounds()")).repr,
      "{'x': [0.0, 1.0], 'y': [0.0, 1.0], 'z': [0.0, 2.0]}",
    );
    assert.equal(
      (
        await session.evaluate(
          "[(d.code,d.layer_ids) for d in surface_spec.validate(max_samples=3,require_alt_text=False)]",
        )
      ).repr,
      "[('PLOT_RESOURCE_EXCESSIVE_SAMPLES', ('layer-0',))]",
    );
    assert.equal(
      (
        await session.evaluate(
          "[(layer.id,layer.kind) for layer in combined_semantic_spec.layers]",
        )
      ).repr,
      "[('layer-0', 'surface'), ('layer-1', 'mesh'), ('layer-2', 'polygon')]",
    );
    assert.equal(
      (await session.evaluate("triangle_semantic.spec().layers[0].style['face_colors']")).repr,
      "['red', 'blue']",
    );
    assert.equal(
      (await session.evaluate("polygon_semantic.spec().layers[0].metadata['geometry']")).repr,
      "'convex-planar-polygon'",
    );
  });
});

test("unsupported companion, transform, and polygon cases retain raw traces", async () => {
  await withSession(false, async (session) => {
    const checks = [
      [
        "plot3d(lambda x,y:x+y,(0,1),(0,1),plot_points=2,mesh=True).spec()",
        "wireframe-companion-trace",
        2,
      ],
      [
        "plot3d(lambda x,y:x+y,(0,1),(0,1),plot_points=2,dots=True).spec()",
        "dot-companion-trace",
        2,
      ],
      [
        "plot3d(lambda x,y:x+y,(0,1),(0,1),plot_points=2).translate(1,2,3).spec()",
        "translation-not-representable",
        1,
      ],
      [
        "polygons3d([[0,1,2,3],[0,1,4,3]],[(0,0,0),(1,0,0),(1,1,0),(0,1,0),(1,1,1)]).spec()",
        "multi-face-polygonal-mesh-requires-explicit-triangulation",
        1,
      ],
      [
        "polygon3d([(0,0,0),(2,0,0),(1,.2,0),(2,1,0),(0,1,0)]).spec()",
        "mesh-geometry-or-style-not-losslessly-representable",
        1,
      ],
    ];
    for (let index = 0; index < checks.length; index += 1) {
      const [source, reason, traceCount] = checks[index];
      await session.evaluate(`fallback_spec_${index} = ${source}`);
      assert.equal(
        (await session.evaluate(`fallback_spec_${index}.layers[0].kind`)).repr,
        "'plotly-trace'",
      );
      assert.equal(
        (
          await session.evaluate(
            `fallback_spec_${index}.layers[0].metadata['fallback_reason']`,
          )
        ).repr,
        `'${reason}'`,
      );
      assert.equal(
        (
          await session.evaluate(
            `len(fallback_spec_${index}.layers[0].data['traces'])`,
          )
        ).repr,
        String(traceCount),
      );
    }
  });
});

test("surface resource errors are explicit and native-disabled behavior matches", async () => {
  await withSession(true, async (session) => {
    await session.evaluate(
      [
        "native_disabled_surface = plot3d(lambda x,y:x-y,(0,1),(0,1),plot_points=2)",
        "native_disabled_mesh = polygon3d([(0,0,0),(1,0,0),(0,1,0)])",
      ].join("\n"),
    );
    assert.equal(
      (
        await session.evaluate(
          "(native_disabled_surface.spec().layers[0].kind,native_disabled_mesh.spec().layers[0].kind)",
        )
      ).repr,
      "('surface', 'mesh')",
    );

    await session.evaluate(
      [
        "import sagejs.plotting.surface_layers as _surface_limits",
        "_saved_surface_limit = _surface_limits.MAX_SURFACE_SAMPLES",
        "_surface_limits.MAX_SURFACE_SAMPLES = 3",
      ].join("\n"),
    );
    await assert.rejects(
      session.evaluate("native_disabled_surface.spec()"),
      /surface exceeds the sample limit of 3/,
    );
    await session.evaluate(
      "_surface_limits.MAX_SURFACE_SAMPLES = _saved_surface_limit",
    );
  });
});
