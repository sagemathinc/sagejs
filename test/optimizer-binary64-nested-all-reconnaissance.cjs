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
  binary64NestedAllProofGaps,
  BINARY64_NESTED_ALL_REASONS,
  BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
} = require(
  "../dist/tools/python/optimizer/domains/binary64-nested-all/model.js"
);
const {
  recognizeBinary64NestedAllProgram,
} = require(
  "../dist/tools/python/optimizer/domains/binary64-nested-all/recognize.js"
);
const {
  verifyBinary64NestedAllReconnaissanceDecision,
} = require(
  "../dist/tools/python/optimizer/domains/binary64-nested-all/verify.js"
);
const {
  binary64NestedAllReconnaissancePass,
  binary64NestedAllReconnaissancePlugin,
} = require(
  "../dist/tools/python/optimizer/passes/binary64-nested-all-region.js"
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

async function parse(source, filename = "binary64-nested-all-fixture.py") {
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

function recognizedCalls(compiler, ast) {
  const result = [];
  walk(compiler, ast, (node) => {
    if (!(node instanceof compiler.AST_Call)) return;
    const recognition = recognizeBinary64NestedAllProgram(compiler, node);
    if (recognition.recognized) result.push({ node, recognition });
  });
  return result;
}

function runPass(compiler, ast) {
  const observations = [];
  const candidates = [];
  binary64NestedAllReconnaissancePass.run(ast, {
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

async function productionGridSampling() {
  const filename = path.join(
    root,
    "src/lib/sagejs/plotting/grid_sampling.py",
  );
  return parse(fs.readFileSync(filename, "utf8"), filename);
}

test("production scalar and fixed-pair reductions have exact structural IR", async () => {
  const parsed = await productionGridSampling();
  const recognized = recognizedCalls(parsed.compiler, parsed.ast);
  assert.equal(recognized.length, 2);
  const [scalar, pair] = recognized;
  assert.deepEqual(
    [scalar.node.start.line, scalar.node.start.col, scalar.node.end.line],
    [195, 42, 197],
  );
  assert.deepEqual(scalar.recognition.program, {
    version: 1,
    kind: "nested-binary64-all",
    traversalKind: "two-clause-generator-under-builtin-all",
    predicateKind: "scalar-isfinite",
    outerSequenceName: "numeric_values",
    outerElementName: "row",
    innerElementName: "value",
    pairIndices: [],
    operations: [
      "builtin-all", "iterate-outer", "iterate-inner",
      "call-math-isfinite", "short-circuit",
    ],
    proofGaps: [...binary64NestedAllProofGaps("scalar-isfinite")],
  });
  assert.deepEqual(
    [pair.node.start.line, pair.node.start.col, pair.node.end.line],
    [288, 41, 292],
  );
  assert.deepEqual(pair.recognition.program, {
    version: 1,
    kind: "nested-binary64-all",
    traversalKind: "two-clause-generator-under-builtin-all",
    predicateKind: "fixed-pair-isfinite",
    outerSequenceName: "numeric_pairs",
    outerElementName: "row",
    innerElementName: "pair",
    pairIndices: [0, 1],
    operations: [
      "builtin-all", "iterate-outer", "iterate-inner", "getitem-0",
      "call-math-isfinite", "boolean-and", "getitem-1",
      "call-math-isfinite-second", "short-circuit",
    ],
    proofGaps: [...binary64NestedAllProofGaps("fixed-pair-isfinite")],
  });
});

test("the pass emits exact explain-only decisions and no lowering", async () => {
  const parsed = await productionGridSampling();
  const { observations, candidates } = runPass(parsed.compiler, parsed.ast);
  assert.equal(observations.length, 2);
  assert.deepEqual(candidates, []);
  assert.equal(binary64NestedAllReconnaissancePlugin.loweringIds.length, 0);
  assert.equal(binary64NestedAllReconnaissancePlugin.priority, 145);

  for (const observation of observations) {
    const decision = observation.decision;
    const program = recognizedCalls(parsed.compiler, observation.node)[0]
      .recognition.program;
    assert.equal(decision.passId, BINARY64_NESTED_ALL_RECONNAISSANCE_PASS);
    assert.equal(decision.target.kind, "generic");
    assert.equal(decision.target.lowering, "none; reconnaissance only");
    assert.equal(decision.target.selectedCandidate, "generic-nested-all-fallback");
    assert.deepEqual(decision.guards, ["no-executable-lowering"]);
    assert.deepEqual(observation.rejectionReasons, program.proofGaps);
    assert.deepEqual(
      decision.target.candidates.map((candidate) => [
        candidate.kind,
        candidate.availability,
        candidate.rejectionReason,
      ]),
      [
        ["v8", "rejected", BINARY64_NESTED_ALL_REASONS.v8Lowering],
        ["wasm", "rejected", BINARY64_NESTED_ALL_REASONS.wasmBoundary],
        ["native", "rejected", BINARY64_NESTED_ALL_REASONS.nativeBoundary],
        ["generic", "selected", null],
      ],
    );
    assert.match(
      decision.target.candidates[3].evidence,
      /untouched source expression/,
    );
    verifyBinary64NestedAllReconnaissanceDecision(program, decision);
  }
});

test("recognition is independent of application and lexical variable names", async () => {
  const parsed = await parse(`
import math

def verify_cells(table):
    return all(math.isfinite(atom) for stripe in table for atom in stripe)

def certify_vectors(blocks):
    return all(
        math.isfinite(entry[0]) and math.isfinite(entry[1])
        for bucket in blocks
        for entry in bucket
    )
`);
  const recognized = recognizedCalls(parsed.compiler, parsed.ast);
  assert.deepEqual(recognized.map((item) => ({
    predicateKind: item.recognition.program.predicateKind,
    outerSequenceName: item.recognition.program.outerSequenceName,
    outerElementName: item.recognition.program.outerElementName,
    innerElementName: item.recognition.program.innerElementName,
  })), [
    {
      predicateKind: "scalar-isfinite",
      outerSequenceName: "table",
      outerElementName: "stripe",
      innerElementName: "atom",
    },
    {
      predicateKind: "fixed-pair-isfinite",
      outerSequenceName: "blocks",
      outerElementName: "bucket",
      innerElementName: "entry",
    },
  ]);
});

test("identity, representation, ordering, interrupts, and restart remain gaps", async () => {
  const parsed = await parse(`
import math
math = replacement_math

def scan(rows):
    return all(math.isfinite(value) for row in rows for value in row)
`);
  const recognized = recognizedCalls(parsed.compiler, parsed.ast);
  assert.equal(recognized.length, 1);
  const gaps = recognized[0].recognition.program.proofGaps;
  assert.deepEqual(gaps, [
    BINARY64_NESTED_ALL_REASONS.builtinAllIdentity,
    BINARY64_NESTED_ALL_REASONS.innerExactListIteration,
    BINARY64_NESTED_ALL_REASONS.interruptSemantics,
    BINARY64_NESTED_ALL_REASONS.mathIsfiniteIdentity,
    BINARY64_NESTED_ALL_REASONS.outerExactListIteration,
    BINARY64_NESTED_ALL_REASONS.restartFallback,
    BINARY64_NESTED_ALL_REASONS.scalarRepresentation,
    BINARY64_NESTED_ALL_REASONS.shortCircuitOrder,
  ].sort());
  const { observations } = runPass(parsed.compiler, parsed.ast);
  assert.equal(observations.length, 1);
  assert.match(observations[0].decision.semantic.exceptionPolicy, /interrupts/);
  assert.match(observations[0].decision.semantic.exceptionPolicy, /untouched fallback/);
});

test("nearby generators and identity/order adversaries do not recognize", async () => {
  const cases = [
    ["locally shadowed all", `
import math
def scan(all, rows):
    return all(math.isfinite(value) for row in rows for value in row)
`],
    ["locally shadowed math", `
def scan(math, rows):
    return all(math.isfinite(value) for row in rows for value in row)
`],
    ["list comprehension", `
import math
def scan(rows):
    return all([math.isfinite(value) for row in rows for value in row])
`],
    ["one traversal", `
import math
def scan(row):
    return all(math.isfinite(value) for value in row)
`],
    ["three traversals", `
import math
def scan(cubes):
    return all(math.isfinite(value) for plane in cubes for row in plane for value in row)
`],
    ["filtered inner traversal", `
import math
def scan(rows):
    return all(math.isfinite(value) for row in rows for value in row if value)
`],
    ["unrelated inner iterable", `
import math
def scan(rows, values):
    return all(math.isfinite(value) for row in rows for value in values)
`],
    ["isfinite alias", `
from math import isfinite
def scan(rows):
    return all(isfinite(value) for row in rows for value in row)
`],
    ["reversed pair reads", `
import math
def scan(rows):
    return all(math.isfinite(pair[1]) and math.isfinite(pair[0]) for row in rows for pair in row)
`],
    ["eager or", `
import math
def scan(rows):
    return all(math.isfinite(pair[0]) or math.isfinite(pair[1]) for row in rows for pair in row)
`],
    ["duplicate pair index", `
import math
def scan(rows):
    return all(math.isfinite(pair[0]) and math.isfinite(pair[0]) for row in rows for pair in row)
`],
    ["third pair predicate", `
import math
def scan(rows):
    return all(math.isfinite(pair[0]) and math.isfinite(pair[1]) and math.isfinite(pair[2]) for row in rows for pair in row)
`],
    ["method named all", `
import math
def scan(checks, rows):
    return checks.all(math.isfinite(value) for row in rows for value in row)
`],
  ];
  for (const [label, source] of cases) {
    const parsed = await parse(source, `${label.replaceAll(" ", "-")}.py`);
    assert.deepEqual(recognizedCalls(parsed.compiler, parsed.ast), [], label);
  }
});

test("the verifier rejects target and semantic-proof tampering", async () => {
  const parsed = await parse(`
import math
def scan(rows):
    return all(math.isfinite(value) for row in rows for value in row)
`);
  const recognized = recognizedCalls(parsed.compiler, parsed.ast)[0];
  const { observations } = runPass(parsed.compiler, parsed.ast);
  const decision = observations[0].decision;

  const targetTampering = structuredClone(decision);
  targetTampering.target.candidates[0].availability = "selected";
  assert.throws(
    () => verifyBinary64NestedAllReconnaissanceDecision(
      recognized.recognition.program,
      targetTampering,
    ),
    /invalid binary64 nested all reconnaissance decision/,
  );

  const proofTampering = {
    ...recognized.recognition.program,
    proofGaps: recognized.recognition.program.proofGaps.slice(1),
  };
  assert.throws(
    () => verifyBinary64NestedAllReconnaissanceDecision(
      proofTampering,
      decision,
    ),
    /invalid binary64 nested all reconnaissance decision/,
  );
});
