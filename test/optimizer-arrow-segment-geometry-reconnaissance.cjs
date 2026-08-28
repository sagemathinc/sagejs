// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  arrowSegmentGeometryOperations,
  arrowSegmentGeometryProofGaps,
  ARROW_SEGMENT_GEOMETRY_REASONS,
  ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
} = require(
  "../dist/tools/python/optimizer/domains/arrow-segment-geometry/model.js"
);
const {
  recognizeArrowSegmentGeometryProgram,
} = require(
  "../dist/tools/python/optimizer/domains/arrow-segment-geometry/recognize.js"
);
const {
  verifyArrowSegmentGeometryReconnaissanceDecision,
} = require(
  "../dist/tools/python/optimizer/domains/arrow-segment-geometry/verify.js"
);
const {
  arrowSegmentGeometryReconnaissancePass,
  arrowSegmentGeometryReconnaissancePlugin,
} = require(
  "../dist/tools/python/optimizer/passes/arrow-segment-geometry-region.js"
);

const root = path.join(__dirname, "..");

function frontendOptions(filename) {
  return {
    filename,
    for_linting: true,
    libdir: path.join(root, "src/lib"),
    import_dirs: [],
    exact_integer_literals: true,
    strict_python_scopes: true,
    optimization_level: "O0",
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
  };
}

async function parse(source, filename = "arrow-segment-geometry-fixture.py") {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    return {
      compiler,
      ast: frontend.parse(source, frontendOptions(filename)),
    };
  } finally {
    frontend.close();
  }
}

function walk(compiler, rootNode, visitor) {
  const ignored = new Set([
    "start", "end", "scope", "thedef", "imports", "globals", "classes",
    "baselib", "optimization_ir", "optimization_region",
  ]);
  const seen = new Set();
  const visit = (node, ancestors) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) visit(child, ancestors);
      return;
    }
    if (!(node instanceof compiler.AST_Node)) return;
    visitor(node, ancestors);
    for (const [key, child] of Object.entries(node)) {
      if (ignored.has(key) || typeof child === "function") continue;
      visit(child, [...ancestors, node]);
    }
  };
  visit(rootNode, []);
}

function recognizedLoops(compiler, ast) {
  const result = [];
  walk(compiler, ast, (node, ancestors) => {
    if (!(node instanceof compiler.AST_ForIn)) return;
    const recognition = recognizeArrowSegmentGeometryProgram(
      compiler,
      node,
      ancestors,
    );
    if (recognition.recognized) result.push({ node, recognition });
  });
  return result;
}

function runPass(compiler, ast) {
  const observations = [];
  const candidates = [];
  arrowSegmentGeometryReconnaissancePass.run(ast, {
    compiler,
    controls: {
      level: "O2",
      disabledPasses: new Set(),
      requiredOptimizations: new Set(),
      explain: true,
      contractPolicy: "diagnose",
    },
    walk(value, visitor) {
      walk(compiler, value, visitor);
    },
    observe(observation) {
      observations.push(observation);
    },
    consider(candidate) {
      candidates.push(candidate);
    },
  });
  return { observations, candidates };
}

async function productionFieldLayers() {
  const filename = path.join(
    root,
    "src/lib/sagejs/plotting/field_layers.py",
  );
  return parse(fs.readFileSync(filename, "utf8"), filename);
}

const RENAMED_GEOMETRY = `
import math

def render_cells(abscissas, ordinates, horizontal_grid, vertical_grid,
                 limit, span, anchor, cap_length, cap_width):
    first_output = []
    second_output = []
    for row_number, ordinate in enumerate(ordinates):
        horizontal_row = horizontal_grid[row_number]
        vertical_row = vertical_grid[row_number]
        if not isinstance(horizontal_row, list) or not isinstance(vertical_row, list):
            raise TypeError("rows must be arrays")
        for column_number, abscissa in enumerate(abscissas):
            horizontal = horizontal_row[column_number]
            vertical = vertical_row[column_number]
            if horizontal is None or vertical is None:
                continue
            norm = math.hypot(float(horizontal), float(vertical))
            if norm == 0 or limit == 0:
                continue
            delta_x = float(horizontal) / limit * span
            delta_y = float(vertical) / limit * span
            if anchor == "middle":
                origin_x, origin_y = float(abscissa) - delta_x / 2, float(ordinate) - delta_y / 2
            elif anchor == "tip":
                origin_x, origin_y = float(abscissa) - delta_x, float(ordinate) - delta_y
            else:
                origin_x, origin_y = float(abscissa), float(ordinate)
            terminal_x, terminal_y = origin_x + delta_x, origin_y + delta_y
            first_output.extend((origin_x, terminal_x, None))
            second_output.extend((origin_y, terminal_y, None))
            if cap_width > 0 and cap_length > 0:
                direction_x, direction_y = float(horizontal) / norm, float(vertical) / norm
                rear_x = terminal_x - delta_x * cap_length
                rear_y = terminal_y - delta_y * cap_length
                cap_norm = math.hypot(delta_x, delta_y)
                offset_x = -direction_y * cap_norm * cap_width
                offset_y = direction_x * cap_norm * cap_width
                first_output.extend((rear_x + offset_x, terminal_x, rear_x - offset_x, None))
                second_output.extend((rear_y + offset_y, terminal_y, rear_y - offset_y, None))
    return first_output, second_output
`;

test("the production fused outer loop retains its exact profiled hot child", async () => {
  const parsed = await productionFieldLayers();
  const recognized = recognizedLoops(parsed.compiler, parsed.ast);
  assert.equal(recognized.length, 1);
  const [{ node, recognition }] = recognized;
  assert.deepEqual(
    [node.start.line, node.start.col, node.end.line, node.end.col],
    [925, 8, 952, 71],
  );
  assert.deepEqual(
    [recognition.outerLoop.start.line, recognition.outerLoop.end.line],
    [920, 952],
  );
  assert.deepEqual(recognition.program, {
    version: 1,
    kind: "closed-transactional-rectangular-binary64-dataflow",
    variant: "arrow-segment-stream",
    traversalKind: "nested-enumerated-parallel-grid-rows",
    requiredContext: "enclosing-outer-row-loop",
    selectionUnit: "two-level-transactional-loop-program",
    primaryRegionKind: "fused-outer-loop",
    hotChildRegionKind: "profiled-inner-loop",
    hotChildSource: {
      filename: node.start.file,
      line: 925,
      column: 8,
      endLine: 952,
      endColumn: 71,
    },
    publicationKind: "paired-segment-stream-candidate",
    xSequenceName: "x_values",
    ySequenceName: "y_values",
    uGridName: "u_values",
    vGridName: "v_values",
    xOutputName: "xs",
    yOutputName: "ys",
    pivotName: "pivot",
    operations: [...arrowSegmentGeometryOperations()],
    proofGaps: [...arrowSegmentGeometryProofGaps()],
  });
});

test("the pass emits exact target rejections and cannot lower or select", async () => {
  const parsed = await productionFieldLayers();
  const { observations, candidates } = runPass(parsed.compiler, parsed.ast);
  assert.equal(observations.length, 1);
  assert.deepEqual(candidates, []);
  assert.equal(arrowSegmentGeometryReconnaissancePlugin.loweringIds.length, 0);
  assert.equal(arrowSegmentGeometryReconnaissancePlugin.priority, 147);

  const decision = observations[0].decision;
  const program = recognizedLoops(parsed.compiler, parsed.ast)[0]
    .recognition.program;
  assert.equal(decision.passId, ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS);
  assert.deepEqual(
    [decision.source.line, decision.source.column, decision.source.endLine],
    [920, 4, 952],
  );
  assert.deepEqual(program.hotChildSource, {
    filename: path.join(root, "src/lib/sagejs/plotting/field_layers.py"),
    line: 925,
    column: 8,
    endLine: 952,
    endColumn: 71,
  });
  assert.equal(decision.target.kind, "generic");
  assert.equal(decision.target.lowering, "none; reconnaissance only");
  assert.equal(
    decision.target.selectedCandidate,
    "generic-rectangular-binary64-dataflow-fallback",
  );
  assert.deepEqual(decision.guards, ["no-executable-lowering"]);
  assert.deepEqual(observations[0].rejectionReasons, program.proofGaps);
  assert.deepEqual(
    decision.target.candidates.map((candidate) => [
      candidate.kind,
      candidate.availability,
      candidate.rejectionReason,
    ]),
    [
      ["v8", "rejected", ARROW_SEGMENT_GEOMETRY_REASONS.v8Lowering],
      ["wasm", "rejected", ARROW_SEGMENT_GEOMETRY_REASONS.wasmBoundary],
      ["native", "rejected", ARROW_SEGMENT_GEOMETRY_REASONS.nativeBoundary],
      [
        "library",
        "rejected",
        ARROW_SEGMENT_GEOMETRY_REASONS.libraryUnavailable,
      ],
      ["generic", "selected", null],
    ],
  );
  assert.match(decision.semantic.exceptionPolicy, /both loop-backedge interrupts/);
  assert.match(decision.target.policy, /untouched source loop nest/);
  verifyArrowSegmentGeometryReconnaissanceDecision(program, decision);
});

test("recognition is independent of application, function, path, and role names", async () => {
  const parsed = await parse(RENAMED_GEOMETRY, "unrelated/domain/consumer.py");
  const recognized = recognizedLoops(parsed.compiler, parsed.ast);
  assert.equal(recognized.length, 1);
  assert.deepEqual(
    {
      xSequenceName: recognized[0].recognition.program.xSequenceName,
      ySequenceName: recognized[0].recognition.program.ySequenceName,
      uGridName: recognized[0].recognition.program.uGridName,
      vGridName: recognized[0].recognition.program.vGridName,
      xOutputName: recognized[0].recognition.program.xOutputName,
      yOutputName: recognized[0].recognition.program.yOutputName,
      pivotName: recognized[0].recognition.program.pivotName,
    },
    {
      xSequenceName: "abscissas",
      ySequenceName: "ordinates",
      uGridName: "horizontal_grid",
      vGridName: "vertical_grid",
      xOutputName: "first_output",
      yOutputName: "second_output",
      pivotName: "anchor",
    },
  );
});

test("nearby aliases, callbacks, mutations, and partial publication reject", async () => {
  const cases = [
    [
      "locally shadowed enumerate",
      RENAMED_GEOMETRY.replace(
        "def render_cells(abscissas, ordinates, horizontal_grid, vertical_grid,",
        "def render_cells(abscissas, ordinates, horizontal_grid, vertical_grid, enumerate,",
      ),
    ],
    [
      "dynamic hypot receiver",
      RENAMED_GEOMETRY.replace(
        "def render_cells(abscissas, ordinates, horizontal_grid, vertical_grid,",
        "def render_cells(abscissas, ordinates, horizontal_grid, vertical_grid, metric,",
      ).replaceAll("math.hypot", "metric.hypot"),
    ],
    [
      "component callback",
      RENAMED_GEOMETRY.replace(
        "float(horizontal) / limit * span",
        "convert(horizontal) / limit * span",
      ),
    ],
    [
      "wrong parallel index",
      RENAMED_GEOMETRY.replace(
        "vertical = vertical_row[column_number]",
        "vertical = vertical_row[row_number]",
      ),
    ],
    [
      "reordered missing skip",
      RENAMED_GEOMETRY.replace(
        "horizontal is None or vertical is None",
        "vertical is None or horizontal is None",
      ),
    ],
    [
      "input mutation",
      RENAMED_GEOMETRY.replace(
        "vertical = vertical_row[column_number]",
        "vertical = vertical_row[column_number]\n            horizontal_row[column_number] = horizontal",
      ),
    ],
    [
      "partial publication callback",
      RENAMED_GEOMETRY.replace(
        "second_output.extend((origin_y, terminal_y, None))",
        "second_output.extend((origin_y, terminal_y, None))\n            consume(first_output)",
      ),
    ],
    [
      "reordered head output",
      RENAMED_GEOMETRY.replace(
        "rear_x + offset_x, terminal_x, rear_x - offset_x, None",
        "terminal_x, rear_x + offset_x, rear_x - offset_x, None",
      ),
    ],
    [
      "missing row validation",
      RENAMED_GEOMETRY.replace(
        "if not isinstance(horizontal_row, list) or not isinstance(vertical_row, list):",
        "if horizontal_row is None or vertical_row is None:",
      ),
    ],
  ];
  for (const [label, source] of cases) {
    const parsed = await parse(source, `${label.replaceAll(" ", "-")}.py`);
    assert.deepEqual(recognizedLoops(parsed.compiler, parsed.ast), [], label);
  }
});

test("runtime representation and transaction claims remain proof gaps", async () => {
  const parsed = await parse(RENAMED_GEOMETRY);
  const gaps = recognizedLoops(parsed.compiler, parsed.ast)[0]
    .recognition.program.proofGaps;
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.parallelGridShape));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.completePreflight));
  assert.ok(gaps.includes(
    ARROW_SEGMENT_GEOMETRY_REASONS.capturedIntrinsicIdentities,
  ));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.finalLoopTargets));
  assert.ok(gaps.includes(
    ARROW_SEGMENT_GEOMETRY_REASONS.fixedPairOrParallelGridRepresentation,
  ));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.strictBinary64));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.binary64ResultBoxing));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.mathHypotIdentity));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.optionalOrderedMax));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.inputStability));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.freshOutputs));
  assert.ok(gaps.includes(
    ARROW_SEGMENT_GEOMETRY_REASONS.privateIntermediateFusion,
  ));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.privatePublication));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.outputMaterialization));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.interruptSemantics));
  assert.ok(gaps.includes(
    ARROW_SEGMENT_GEOMETRY_REASONS.iterationAndCapacityBounds,
  ));
  assert.ok(gaps.includes(ARROW_SEGMENT_GEOMETRY_REASONS.restartFallback));
});

test("recognition and decisions are deterministic for identical source identity", async () => {
  const filename = "deterministic-arrow-consumer.py";
  const first = await parse(RENAMED_GEOMETRY, filename);
  const second = await parse(RENAMED_GEOMETRY, filename);
  const firstRecognition = recognizedLoops(first.compiler, first.ast)[0]
    .recognition;
  const secondRecognition = recognizedLoops(second.compiler, second.ast)[0]
    .recognition;
  assert.deepEqual(firstRecognition.program, secondRecognition.program);
  const firstDecision = runPass(first.compiler, first.ast).observations[0].decision;
  const secondDecision = runPass(second.compiler, second.ast).observations[0].decision;
  assert.deepEqual(firstDecision, secondDecision);
});

test("the verifier rejects target, context, and proof-gap tampering", async () => {
  const parsed = await parse(RENAMED_GEOMETRY);
  const program = recognizedLoops(parsed.compiler, parsed.ast)[0]
    .recognition.program;
  const decision = runPass(parsed.compiler, parsed.ast).observations[0].decision;

  const targetTampering = structuredClone(decision);
  targetTampering.target.candidates[0].availability = "selected";
  assert.throws(
    () => verifyArrowSegmentGeometryReconnaissanceDecision(
      program,
      targetTampering,
    ),
    /invalid arrow segment geometry reconnaissance decision/,
  );

  const contextTampering = {
    ...program,
    requiredContext: "inner-loop-only",
  };
  assert.throws(
    () => verifyArrowSegmentGeometryReconnaissanceDecision(
      contextTampering,
      decision,
    ),
    /invalid arrow segment geometry reconnaissance decision/,
  );

  const proofTampering = {
    ...program,
    proofGaps: program.proofGaps.slice(1),
  };
  assert.throws(
    () => verifyArrowSegmentGeometryReconnaissanceDecision(
      proofTampering,
      decision,
    ),
    /invalid arrow segment geometry reconnaissance decision/,
  );

  const childScopeTampering = {
    ...program,
    hotChildSource: {
      ...program.hotChildSource,
      line: decision.source.line - 1,
    },
  };
  assert.throws(
    () => verifyArrowSegmentGeometryReconnaissanceDecision(
      childScopeTampering,
      decision,
    ),
    /invalid arrow segment geometry reconnaissance decision/,
  );

  const semanticTampering = structuredClone(decision);
  semanticTampering.semantic.exceptionPolicy = "equivalent enough";
  assert.throws(
    () => verifyArrowSegmentGeometryReconnaissanceDecision(
      program,
      semanticTampering,
    ),
    /invalid arrow segment geometry reconnaissance decision/,
  );

  const candidateTampering = structuredClone(decision);
  candidateTampering.target.candidates[1].evidence = "boundary is cheap";
  assert.throws(
    () => verifyArrowSegmentGeometryReconnaissanceDecision(
      program,
      candidateTampering,
    ),
    /invalid arrow segment geometry reconnaissance decision/,
  );
});
