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
  ARROW_SEGMENT_GEOMETRY_LOWERING,
  ARROW_SEGMENT_GEOMETRY_PASS,
} = require(
  "../dist/tools/python/optimizer/domains/arrow-segment-geometry/model.js"
);
const {
  verifyArrowSegmentGeometryDecision,
} = require(
  "../dist/tools/python/optimizer/domains/arrow-segment-geometry/verify-executable.js"
);
const {
  arrowSegmentGeometryPass,
  arrowSegmentGeometryPlugin,
} = require(
  "../dist/tools/python/optimizer/passes/arrow-segment-geometry-executable.js"
);
const {
  verifyArrowSegmentGeometryPlan,
} = require(
  "../dist/tools/python/optimizer/verifiers/arrow-segment-geometry.js"
);

const root = path.join(__dirname, "..");
const filename = path.join(root, "src/lib/sagejs/plotting/field_layers.py");
const source = fs.readFileSync(filename, "utf8");

function options(level) {
  return {
    filename,
    basedir: path.dirname(filename),
    libdir: path.join(root, "src/lib"),
    import_dirs: [],
    for_linting: true,
    runtime_imports: true,
    exact_integer_literals: true,
    strict_python_scopes: true,
    optimization_level: level,
    optimization_explain: true,
    optimization_contract_policy: "diagnose",
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
  };
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

async function parsed(level = "O0") {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "python");
  try {
    return { compiler, ast: frontend.parse(source, options(level)) };
  } finally {
    frontend.close();
  }
}

test("the executable pass selects exactly the fused production outer loop", async () => {
  const { compiler, ast } = await parsed();
  const candidates = [];
  arrowSegmentGeometryPass.run(ast, {
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
    observe() {
      throw new Error("executable pass must submit a candidate");
    },
    consider(candidate) {
      candidates.push(candidate);
    },
  });
  assert.equal(candidates.length, 1);
  const [candidate] = candidates;
  assert.equal(candidate.internal.passId, ARROW_SEGMENT_GEOMETRY_PASS);
  assert.equal(candidate.internal.loweringId, ARROW_SEGMENT_GEOMETRY_LOWERING);
  assert.deepEqual(
    [candidate.node.start.line, candidate.node.start.col, candidate.node.end.line],
    [920, 4, 952],
  );
  assert.equal(candidate.decision.target.kind, "v8");
  assert.equal(
    candidate.decision.target.selectedCandidate,
    "v8-rectangular-binary64-dataflow",
  );
  verifyArrowSegmentGeometryPlan(candidate.internal);
  verifyArrowSegmentGeometryDecision(
    candidate.internal.operands.program,
    candidate.decision,
  );
  assert.throws(
    () => verifyArrowSegmentGeometryPlan({
      ...candidate.internal,
      operands: { ...candidate.internal.operands, maximumOutputEntries: 1 },
    }),
    /target facts are stale/,
  );
  assert.deepEqual(arrowSegmentGeometryPlugin.loweringIds, [
    ARROW_SEGMENT_GEOMETRY_LOWERING,
  ]);
});

test("integrated O2 emits the verified helper and O0 retains source loops", async () => {
  const optimized = await parsed("O2");
  const generic = await parsed("O0");
  const emit = ({ compiler, ast }) => {
    const output = new compiler.OutputStream({
      omit_baselib: true,
      write_name: false,
      private_scope: false,
      beautify: true,
      keep_docstrings: true,
      exact_integers: true,
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
    });
    ast.print(output);
    return output.get();
  };
  const optimizedJavascript = emit(optimized);
  const genericJavascript = emit(generic);
  assert.match(
    optimizedJavascript,
    /ρσ_fast_arrow_segment_geometry_region\(/,
  );
  assert.match(optimizedJavascript, /\.ok === true/);
  assert.doesNotMatch(genericJavascript, /ρσ_fast_arrow_segment_geometry_region\(/);
});
