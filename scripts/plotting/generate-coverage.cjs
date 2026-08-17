#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const plottingDocs = path.join(root, "docs/sage-compatibility/plotting");
const sageSurfacePath = path.join(plottingDocs, "sage-surface.json");
const frontendSurfacePath = path.join(plottingDocs, "frontend-surface.json");
const coveragePath = path.join(plottingDocs, "coverage.json");

const CLASSIFICATIONS = [
  "faithful",
  "translated",
  "unsupported",
  "extension",
];

const PLOT_MISC_FAITHFUL = new Set([
  "sage.plot.misc.FastCallablePlotWrapper",
  "sage.plot.misc.get_matplotlib_linestyle",
  "sage.plot.misc.setup_for_eval_on_grid",
  "sage.plot.misc.unify_arguments",
]);

// These entries have focused executable Plotly/semantic coverage.  They are
// deliberately classified as translated, rather than faithful: the tests
// establish useful Plotly-backed behavior but do not certify every Sage
// option, coercion, warning, error, or documented import path.
const TRANSLATED_2D = new Set([
  "sage.plot.animate.animate",
  "sage.plot.arc.arc",
  "sage.plot.arrow.arrow",
  "sage.plot.arrow.arrow2d",
  "sage.plot.bar_chart.bar_chart",
  "sage.plot.bezier_path.bezier_path",
  "sage.plot.circle.circle",
  "sage.plot.colors.Color",
  "sage.plot.colors.rainbow",
  "sage.plot.complex_plot.complex_plot",
  "sage.plot.contour_plot.contour_plot",
  "sage.plot.contour_plot.implicit_plot",
  "sage.plot.contour_plot.region_plot",
  "sage.plot.density_plot.density_plot",
  "sage.plot.disk.disk",
  "sage.plot.ellipse.ellipse",
  "sage.plot.histogram.histogram",
  "sage.plot.hyperbolic_polygon.hyperbolic_triangle",
  "sage.plot.hyperbolic_regular_polygon.hyperbolic_regular_polygon",
  "sage.plot.line.line",
  "sage.plot.line.line2d",
  "sage.plot.matrix_plot.matrix_plot",
  "sage.plot.plot.graphics_array",
  "sage.plot.plot.list_plot",
  "sage.plot.plot.list_plot_loglog",
  "sage.plot.plot.multi_graphics",
  "sage.plot.plot.plot",
  "sage.plot.plot.polar_plot",
  "sage.plot.plot_field.plot_slope_field",
  "sage.plot.plot_field.plot_vector_field",
  "sage.plot.point.point",
  "sage.plot.point.point2d",
  "sage.plot.point.points",
  "sage.plot.polygon.polygon",
  "sage.plot.polygon.polygon2d",
  "sage.plot.scatter_plot.scatter_plot",
  "sage.plot.step.plot_step_function",
  "sage.plot.streamline_plot.streamline_plot",
  "sage.plot.text.text",
]);

const TRANSLATED_3D = new Set([
  "sage.plot.plot3d.base.Graphics3d",
  "sage.plot.plot3d.index_face_set.IndexFaceSet",
  "sage.plot.plot3d.implicit_plot3d.implicit_plot3d",
  "sage.plot.plot3d.list_plot3d.list_plot3d",
  "sage.plot.plot3d.parametric_plot3d.parametric_plot3d",
  "sage.plot.plot3d.platonic.cube",
  "sage.plot.plot3d.platonic.dodecahedron",
  "sage.plot.plot3d.platonic.icosahedron",
  "sage.plot.plot3d.platonic.octahedron",
  "sage.plot.plot3d.platonic.tetrahedron",
  "sage.plot.plot3d.plot3d.Cylindrical",
  "sage.plot.plot3d.plot3d.Spherical",
  "sage.plot.plot3d.plot3d.SphericalElevation",
  "sage.plot.plot3d.plot3d.axes",
  "sage.plot.plot3d.plot3d.cylindrical_plot3d",
  "sage.plot.plot3d.plot3d.plot3d",
  "sage.plot.plot3d.plot3d.spherical_plot3d",
  "sage.plot.plot3d.plot_field3d.plot_vector_field3d",
  "sage.plot.plot3d.revolution_plot3d.revolution_plot3d",
  "sage.plot.plot3d.shapes.arrow3d",
  "sage.plot.plot3d.shapes2.bezier3d",
  "sage.plot.plot3d.shapes2.frame3d",
  "sage.plot.plot3d.shapes2.frame_labels",
  "sage.plot.plot3d.shapes2.line3d",
  "sage.plot.plot3d.shapes2.point3d",
  "sage.plot.plot3d.shapes2.polygon3d",
  "sage.plot.plot3d.shapes2.polygons3d",
  "sage.plot.plot3d.shapes2.ruler",
  "sage.plot.plot3d.shapes2.ruler_frame",
  "sage.plot.plot3d.shapes2.sphere",
  "sage.plot.plot3d.shapes2.text3d",
]);

const TRANSLATED_METHODS = new Set([
  "sage.plot.plot3d.base.Graphics3d.bounding_box",
  "sage.plot.plot3d.base.Graphics3d.rotate",
  "sage.plot.plot3d.base.Graphics3d.rotateX",
  "sage.plot.plot3d.base.Graphics3d.rotateY",
  "sage.plot.plot3d.base.Graphics3d.rotateZ",
  "sage.plot.plot3d.base.Graphics3d.save",
  "sage.plot.plot3d.base.Graphics3d.scale",
  "sage.plot.plot3d.base.Graphics3d.show",
  "sage.plot.plot3d.base.Graphics3d.transform",
  "sage.plot.plot3d.base.Graphics3d.translate",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.edge_list",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.edges",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.face_list",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.faces",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.has_local_colors",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.index_faces",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.is_enclosed",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.vertex_list",
  "sage.plot.plot3d.index_face_set.IndexFaceSet.vertices",
]);

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function stableId(frontend, kind, qualifiedName) {
  return `${frontend}.${kind}.${qualifiedName}`;
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceDebt(entry) {
  const debt = [];
  const semanticTests = entry.semantic_tests ?? [];
  const plotlyTests = entry.plotly_tests ?? [];
  const visualTests = entry.visual_tests ?? [];
  if (semanticTests.length === 0) {
    debt.push({
      code: "semantic-evidence-missing",
      detail: "No focused executable semantic test is linked to this entry.",
    });
  }
  const nonRenderingHelper =
    entry.frontend === "sage" &&
    entry.qualified_name.startsWith("sage.plot.misc.");
  if (
    entry.classification !== "unsupported" &&
    !nonRenderingHelper &&
    plotlyTests.length === 0
  ) {
    debt.push({
      code: "plotly-evidence-missing",
      detail: "No focused Plotly-lowering test is linked to this supported entry.",
    });
  }
  if (
    entry.classification !== "unsupported" &&
    !nonRenderingHelper &&
    visualTests.length === 0
  ) {
    debt.push({
      code: "visual-evidence-missing",
      detail: "No stable rendering or visual-regression evidence is linked yet.",
    });
  }
  if (entry.platform_status === "not-assessed") {
    debt.push({
      code: "platform-evidence-missing",
      detail: "Platform behavior has not been assessed for this entry.",
    });
  }
  if (entry.performance_status === "not-assessed") {
    debt.push({
      code: "performance-evidence-missing",
      detail: "Performance and resource behavior have not been assessed.",
    });
  }
  return debt;
}

function sageClassification(qualifiedName, kind, dimension) {
  if (
    qualifiedName === "sage.plot.graphics.Graphics.matplotlib" ||
    qualifiedName === "sage.plot.multigraphics.MultiGraphics.matplotlib"
  ) {
    return {
      classification: "unsupported",
      support_state: "deliberate-renderer-boundary",
      translation_or_reason:
        "Sage.js is Plotly-native and deliberately does not return Matplotlib " +
        "objects. The method raises an actionable NotImplementedError; use " +
        "plotly(), PlotSpec inspection, save(\"figure.html\"), or configured " +
        "browser-assisted static export instead.",
      semantic_tests: ["test/graphics.cjs"],
      plotly_tests: [],
      visual_tests: [],
      platform_status: "all-supported-platforms",
      performance_status: "not-applicable",
    };
  }
  if (PLOT_MISC_FAITHFUL.has(qualifiedName)) {
    return {
      classification: "faithful",
      support_state: "evidence-backed",
      translation_or_reason:
        "The documented sage.plot.misc import and Sage-compatible semantics " +
        "are covered by focused executable regression cases.",
      semantic_tests: ["test/graphics-plot-misc.cjs"],
      plotly_tests: [],
      visual_tests: [],
      platform_status: "not-assessed",
      performance_status: "not-assessed",
    };
  }

  const translated =
    TRANSLATED_2D.has(qualifiedName) ||
    TRANSLATED_3D.has(qualifiedName) ||
    (kind === "method" && TRANSLATED_METHODS.has(qualifiedName));
  if (translated) {
    const test = dimension === "3d" ? "test/graphics3d.cjs" : "test/graphics.cjs";
    const semanticTests = [test];
    if (qualifiedName.endsWith(".save")) {
      semanticTests.push("test/graphics-export.cjs");
    }
    return {
      classification: "translated",
      support_state: "plotly-backed-subset",
      translation_or_reason:
        "A focused executable test covers a Plotly-backed Sage.js behavior " +
        "for this entry. This does not assert complete Sage option, error, " +
        "object-model, or qualified-import parity.",
      semantic_tests: semanticTests,
      plotly_tests: [test],
      visual_tests: [],
      platform_status: "not-assessed",
      performance_status: "not-assessed",
      extra_debt: [
        {
          code: "qualified-import-or-full-parity-unverified",
          detail:
            "The exact documented module import and complete Sage semantic " +
            "surface have not both been certified.",
        },
      ],
    };
  }

  if (qualifiedName.startsWith("sage.plot.plot3d.tachyon.")) {
    return {
      classification: "unsupported",
      support_state: "deliberate-renderer-boundary",
      translation_or_reason:
        "Tachyon-specific construction and renderer protocols are outside " +
        "the Plotly-native Sage.js architecture. Use semantic Sage.js " +
        "graphics and plotly()/save() instead.",
      semantic_tests: [],
      plotly_tests: [],
      visual_tests: [],
      platform_status: "not-applicable",
      performance_status: "not-applicable",
    };
  }

  return {
    classification: "unsupported",
    support_state: "not-advertised",
    translation_or_reason:
      "This exact qualified Sage entry is not part of the evidence-backed " +
      "Sage.js plotting surface for this release. Use an advertised " +
      "Plotly-backed constructor from this matrix, revise its PlotSpec, or " +
      "apply a validated Plotly override. The entry remains unsupported " +
      "until its exact import and semantics have focused executable tests.",
    semantic_tests: [],
    plotly_tests: [],
    visual_tests: [],
    platform_status: "not-assessed",
    performance_status: "not-assessed",
  };
}

function sageEntry(sageAuthority, moduleRecord, record, kind) {
  const qualifiedName = record.qualified_name;
  const classification = sageClassification(
    qualifiedName,
    kind,
    moduleRecord.dimension,
  );
  const entry = {
    id: stableId("sage", kind, qualifiedName),
    frontend: "sage",
    qualified_name: qualifiedName,
    dimension: moduleRecord.dimension,
    kind,
    signature_or_syntax: record.signature,
    source_authority: [
      `SageMath ${sageAuthority.version}:${moduleRecord.source.logical_path}`,
      `sha256(${moduleRecord.source.sha256_scope}):${moduleRecord.source.sha256}`,
    ],
    dependencies: [],
    classification: classification.classification,
    support_state: classification.support_state,
    translation_or_reason: classification.translation_or_reason,
    semantic_tests: classification.semantic_tests,
    plotly_tests: classification.plotly_tests,
    visual_tests: classification.visual_tests,
    platform_status: classification.platform_status,
    performance_status: classification.performance_status,
  };
  entry.evidence_debt = [
    ...evidenceDebt(entry),
    ...(classification.extra_debt ?? []),
  ];
  return entry;
}

function flattenSage(sageSurface) {
  const entries = [];
  for (const moduleRecord of sageSurface.modules) {
    for (const symbol of moduleRecord.symbols) {
      entries.push(
        sageEntry(sageSurface.authority, moduleRecord, symbol, symbol.kind),
      );
      for (const method of symbol.methods ?? []) {
        entries.push(
          sageEntry(sageSurface.authority, moduleRecord, method, "method"),
        );
      }
    }
  }
  return entries;
}

function frontendEntry(input) {
  const entry = {
    id: input.id,
    frontend: input.frontend,
    qualified_name: input.qualified_name,
    dimension: input.dimension,
    kind: input.kind,
    signature_or_syntax: input.signature_or_syntax,
    source_authority: input.source_authority,
    dependencies: input.dependencies,
    classification: input.classification,
    support_state: input.support_state,
    translation_or_reason: input.translation_or_reason,
    semantic_tests: input.semantic_tests,
    plotly_tests: input.plotly_tests,
    visual_tests: input.visual_tests,
    platform_status: input.platform_status,
    performance_status: input.performance_status,
    implementation_evidence: {
      grammar_recognized: input.grammar_recognized,
      plotting_lowerer_recognized: input.plotting_lowerer_recognized,
      runtime_export: input.runtime_export,
      lowering_target: input.lowering_target,
    },
  };
  entry.evidence_debt = evidenceDebt(entry);
  return entry;
}

function countBy(entries, key) {
  const result = {};
  for (const entry of entries) {
    const value = entry[key];
    result[value] = (result[value] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) =>
      lexicalCompare(left, right),
    ),
  );
}

function countClassifications(entries) {
  const result = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [classification, 0]),
  );
  for (const entry of entries) result[entry.classification] += 1;
  return result;
}

function buildCoverage(sageSurface, frontendSurface) {
  assert.equal(sageSurface.schema_version, 1, "unsupported sage surface schema");
  assert.equal(
    frontendSurface.schema_version,
    1,
    "unsupported frontend surface schema",
  );
  const entries = [
    ...flattenSage(sageSurface),
    ...frontendSurface.entries.map(frontendEntry),
  ].sort((left, right) => lexicalCompare(left.id, right.id));

  const coverage = {
    schema_version: 1,
    generated_by: "scripts/plotting/generate-coverage.cjs",
    policy: {
      classifications: CLASSIFICATIONS,
      statement:
        "Every inventoried entry has exactly one product classification. " +
        "Name presence alone is never evidence of faithfulness, and no " +
        "ambiguous partial classification is permitted.",
      pinned_sage_version: sageSurface.authority.version,
    },
    inputs: [
      {
        path: "docs/sage-compatibility/plotting/sage-surface.json",
        schema_version: sageSurface.schema_version,
      },
      {
        path: "docs/sage-compatibility/plotting/frontend-surface.json",
        schema_version: frontendSurface.schema_version,
      },
    ],
    summary: {
      total_entries: entries.length,
      by_classification: countClassifications(entries),
      by_frontend: countBy(entries, "frontend"),
      by_dimension: countBy(entries, "dimension"),
    },
    entries,
  };
  validateCoverage(coverage, sageSurface, frontendSurface);
  return coverage;
}

function evidencePathExists(value) {
  return fs.existsSync(path.join(root, value));
}

function validateCoverage(coverage, sageSurface, frontendSurface) {
  assert.deepEqual(
    coverage.policy.classifications,
    CLASSIFICATIONS,
    "the coverage policy must expose exactly the four product statuses",
  );
  const expectedSageEntries = sageSurface.modules.reduce(
    (total, moduleRecord) =>
      total +
      moduleRecord.symbols.reduce(
        (subtotal, symbol) => subtotal + 1 + (symbol.methods?.length ?? 0),
        0,
      ),
    0,
  );
  assert.equal(
    coverage.entries.length,
    expectedSageEntries + frontendSurface.entries.length,
    "coverage must contain every entry from both inventories",
  );
  assert.equal(
    new Set(coverage.entries.map((entry) => entry.id)).size,
    coverage.entries.length,
    "coverage IDs must be unique",
  );
  assert.deepEqual(
    coverage.entries.map((entry) => entry.id),
    coverage.entries.map((entry) => entry.id).toSorted(),
    "coverage entries must be deterministically sorted",
  );

  for (const entry of coverage.entries) {
    assert.ok(CLASSIFICATIONS.includes(entry.classification), `${entry.id}: status`);
    assert.notEqual(entry.classification, "partial", `${entry.id}: no partial state`);
    assert.ok(entry.translation_or_reason?.trim(), `${entry.id}: missing reason`);
    assert.ok(entry.source_authority?.length > 0, `${entry.id}: missing authority`);
    assert.ok(Array.isArray(entry.dependencies), `${entry.id}: dependencies`);
    assert.ok(Array.isArray(entry.evidence_debt), `${entry.id}: evidence debt`);
    for (const field of ["semantic_tests", "plotly_tests", "visual_tests"]) {
      assert.ok(Array.isArray(entry[field]), `${entry.id}: ${field}`);
      for (const evidence of entry[field]) {
        assert.ok(
          evidencePathExists(evidence),
          `${entry.id}: missing evidence path ${evidence}`,
        );
      }
    }
    if (entry.classification === "faithful") {
      assert.ok(entry.semantic_tests.length > 0, `${entry.id}: faithful evidence`);
    }
    if (entry.classification === "translated") {
      const implementationEvidence = entry.implementation_evidence;
      assert.ok(
        entry.semantic_tests.length > 0 ||
          entry.plotly_tests.length > 0 ||
          (implementationEvidence?.plotting_lowerer_recognized === true &&
            (implementationEvidence.runtime_export !== null ||
              implementationEvidence.lowering_target !== null)),
        `${entry.id}: translated evidence`,
      );
    }
  }

  assert.deepEqual(
    coverage.summary.by_classification,
    countClassifications(coverage.entries),
    "classification summary must be reproducible",
  );
  assert.equal(coverage.summary.total_entries, coverage.entries.length);
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const coverage = buildCoverage(readJson(sageSurfacePath), readJson(frontendSurfacePath));
  const generated = serialize(coverage);
  if (process.argv.includes("--check")) {
    assert.equal(
      fs.readFileSync(coveragePath, "utf8"),
      generated,
      "coverage.json is stale; run node scripts/plotting/generate-coverage.cjs",
    );
    process.stdout.write(
      `Plotting coverage is current (${coverage.entries.length} entries).\n`,
    );
    return;
  }
  fs.mkdirSync(plottingDocs, { recursive: true });
  fs.writeFileSync(coveragePath, generated);
  process.stdout.write(
    `Wrote ${path.relative(root, coveragePath)} (${coverage.entries.length} entries).\n`,
  );
}

if (require.main === module) main();

module.exports = {
  CLASSIFICATIONS,
  buildCoverage,
  validateCoverage,
};
