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
  MODULAR_SEQUENCE_REASONS,
  MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
} = require(
  "../dist/tools/python/optimizer/domains/modular-sequence/model.js"
);
const {
  recognizeModularSequenceProgram,
} = require(
  "../dist/tools/python/optimizer/domains/modular-sequence/recognize.js"
);
const {
  verifyModularSequenceReconnaissanceDecision,
} = require(
  "../dist/tools/python/optimizer/domains/modular-sequence/verify.js"
);
const {
  modularSequenceReconnaissancePass,
  modularSequenceReconnaissancePlugin,
} = require(
  "../dist/tools/python/optimizer/passes/modular-sequence-region.js"
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

async function parse(source, filename = "modular-sequence-fixture.py") {
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

function functionAndLoop(compiler, ast, functionName) {
  const definition = ast.body.find((node) =>
    node instanceof compiler.AST_Function && node.name?.name === functionName
  );
  assert.ok(definition, `missing function ${functionName}`);
  const loop = definition.body.find((node) => node instanceof compiler.AST_ForIn);
  assert.ok(loop, `missing loop in ${functionName}`);
  return { definition, loop };
}

function loopAtLine(compiler, definition, line) {
  const seen = new Set();
  let result = null;
  const visit = (value) => {
    if (result || !value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    if (value instanceof compiler.AST_ForIn && value.start?.line === line) {
      result = value;
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if ([
        "start", "end", "scope", "thedef", "imports", "globals", "classes",
        "baselib", "optimization_ir", "optimization_region",
      ].includes(key) || typeof child === "function") continue;
      visit(child);
    }
  };
  visit(definition.body);
  assert.ok(result, `missing loop at line ${line}`);
  return result;
}

function exactFixture(relative, functionName) {
  const filename = path.join(root, relative);
  return {
    filename,
    source: fs.readFileSync(filename, "utf8"),
    functionName,
  };
}

async function recognitionForFixture(fixture) {
  const parsed = await parse(fixture.source, fixture.filename);
  const located = functionAndLoop(
    parsed.compiler,
    parsed.ast,
    fixture.functionName,
  );
  return {
    ...parsed,
    ...located,
    recognition: recognizeModularSequenceProgram(
      parsed.compiler,
      located.loop,
      located.definition,
    ),
  };
}

function runPass(compiler, ast) {
  const observations = [];
  const candidates = [];
  const ignored = new Set([
    "start", "end", "scope", "thedef", "imports", "globals", "classes",
    "baselib", "optimization_ir", "optimization_region",
  ]);
  modularSequenceReconnaissancePass.run(ast, {
    compiler,
    controls: {
      level: "O2",
      disabledPasses: new Set(),
      requiredOptimizations: new Set(),
      explain: true,
      contractPolicy: "diagnose",
    },
    walk(value, visitor) {
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
      visit(value, []);
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

test("the measured public Horner loop is exact inline-call reconnaissance", async () => {
  const parsed = await recognitionForFixture(exactFixture(
    "src/lib/sagejs/polynomial_algorithms/arbitrary_prime_contract.py",
    "polynomial_evaluate_mod",
  ));
  assert.equal(parsed.loop.start.line, 253);
  assert.equal(parsed.loop.end.line, 254);
  assert.equal(parsed.recognition.recognized, true);
  assert.deepEqual(parsed.recognition.program, {
    version: 1,
    kind: "bounded-modular-fold",
    iteratorKind: "reversed-one-argument",
    initializerStatementIndex: 2,
    elementName: "coefficient",
    stateName: "answer",
    multiplierName: "point",
    modulusName: "prime",
    sequencePreparation: "inline-call-must-execute-before-iterator",
    operations: ["multiply", "add", "remainder"],
    proofGaps: [
      MODULAR_SEQUENCE_REASONS.elementRepresentation,
      MODULAR_SEQUENCE_REASONS.inlineSequencePreparation,
      MODULAR_SEQUENCE_REASONS.iteratorSemantics,
      MODULAR_SEQUENCE_REASONS.machineRange,
      MODULAR_SEQUENCE_REASONS.operationDispatch,
    ].sort(),
  });

  const { observations, candidates } = runPass(parsed.compiler, parsed.ast);
  const observation = observations.find((item) => item.node === parsed.loop);
  assert.ok(observation);
  assert.deepEqual(candidates, []);
  assert.equal(observation.decision.passId, MODULAR_SEQUENCE_RECONNAISSANCE_PASS);
  assert.equal(observation.decision.source.line, 253);
  assert.equal(observation.decision.source.endLine, 254);
  assert.equal(observation.decision.target.kind, "generic");
  assert.equal(observation.decision.target.lowering, "none; reconnaissance only");
  assert.deepEqual(
    observation.decision.target.candidates.map((candidate) => [
      candidate.kind,
      candidate.availability,
    ]),
    [
      ["v8", "rejected"],
      ["wasm", "rejected"],
      ["native", "rejected"],
      ["generic", "selected"],
    ],
  );
});

test("a staged normalization is preserved as a distinct proof state", async () => {
  const parsed = await parse(`
def evaluate(coefficients, point, prime):
    normalized = normalized_residues(coefficients, prime)
    answer = 0
    for coefficient in reversed(normalized):
        answer = (answer * point + coefficient) % prime
    return answer
`);
  const { definition, loop } = functionAndLoop(parsed.compiler, parsed.ast, "evaluate");
  const recognition = recognizeModularSequenceProgram(
    parsed.compiler,
    loop,
    definition,
  );
  assert.equal(recognition.recognized, true);
  assert.equal(
    recognition.program.sequencePreparation,
    "staged-call-result-already-evaluated-before-loop",
  );
  assert.equal(
    recognition.program.proofGaps.includes(
      MODULAR_SEQUENCE_REASONS.stagedSequenceBinding,
    ),
    true,
  );
  assert.equal(
    recognition.program.proofGaps.includes(
      MODULAR_SEQUENCE_REASONS.inlineSequencePreparation,
    ),
    false,
  );
});

test("a held-out lexical modular fold receives the same domain decision", async () => {
  const parsed = await recognitionForFixture(exactFixture(
    "src/lib/sagejs/hyperelliptic_curves/deficiency.py",
    "_evaluate_mod",
  ));
  assert.equal(parsed.loop.start.line, 652);
  assert.equal(parsed.loop.end.line, 653);
  assert.equal(parsed.recognition.recognized, true);
  assert.equal(parsed.recognition.program.kind, "bounded-modular-fold");
  assert.equal(
    parsed.recognition.program.sequencePreparation,
    "lexical-sequence-already-evaluated-before-loop",
  );
  assert.equal(
    parsed.recognition.program.proofGaps.includes(
      MODULAR_SEQUENCE_REASONS.lexicalSequenceBinding,
    ),
    true,
  );
  const { observations, candidates } = runPass(parsed.compiler, parsed.ast);
  const observation = observations.find((item) => item.node === parsed.loop);
  assert.ok(observation);
  assert.deepEqual(candidates, []);
  assert.equal(observation.decision.passId, MODULAR_SEQUENCE_RECONNAISSANCE_PASS);
  assert.equal(
    observation.decision.mathematical.kind,
    "math.bounded-modular-fold-candidate",
  );
  assert.equal(
    observation.decision.fallbackId,
    `semantic:${parsed.loop.start.file}:652:4`,
  );
});

test("the production hyperelliptic outer scan is one hoistable region", async () => {
  const fixture = exactFixture(
    "src/lib/sagejs/hyperelliptic_curves/bad_reduction.py",
    "_normalization_factor",
  );
  const parsed = await parse(fixture.source, fixture.filename);
  const definition = parsed.ast.body.find((node) =>
    node instanceof parsed.compiler.AST_Function &&
    node.name?.name === fixture.functionName
  );
  const loop = loopAtLine(parsed.compiler, definition, 1436);
  const recognition = recognizeModularSequenceProgram(
    parsed.compiler,
    loop,
    definition,
  );
  assert.equal(loop.end.line, 1443);
  assert.deepEqual(recognition.program, {
    version: 1,
    kind: "nested-bounded-modular-scan",
    iteratorKind: "range-containing-reversed-fold",
    outerIndexName: "x_value",
    elementName: "coefficient",
    sequenceName: "values",
    stateName: "evaluation",
    modulusName: "prime",
    zeroBranch: "continue-then-pow-accumulate",
    operations: [
      "range", "reversed", "multiply", "add", "remainder", "equal", "pow",
      "accumulate",
    ],
    proofGaps: [
      MODULAR_SEQUENCE_REASONS.elementRepresentation,
      MODULAR_SEQUENCE_REASONS.guardHoisting,
      MODULAR_SEQUENCE_REASONS.iteratorSemantics,
      MODULAR_SEQUENCE_REASONS.lexicalSequenceBinding,
      MODULAR_SEQUENCE_REASONS.machineRange,
      MODULAR_SEQUENCE_REASONS.operationDispatch,
      MODULAR_SEQUENCE_REASONS.outerRangeSemantics,
      MODULAR_SEQUENCE_REASONS.powSemantics,
    ].sort(),
  });
  const { observations, candidates } = runPass(parsed.compiler, parsed.ast);
  const observation = observations.find((item) => item.node === loop);
  assert.ok(observation);
  assert.deepEqual(candidates, []);
  assert.equal(
    observation.decision.mathematical.kind,
    "math.nested-bounded-modular-scan-candidate",
  );
  assert.equal(
    observation.decision.facts.some((fact) =>
      fact.kind === "shared-outer-modulus-and-multiplier"
    ),
    true,
  );
  assert.equal(
    observation.decision.fallbackId,
    `semantic:${loop.start.file}:1436:8`,
  );
});

test("the number-field early-exit scan has the same composite domain", async () => {
  const fixture = exactFixture(
    "src/lib/sagejs/number_fields/om_types.py",
    "factor_cubic_mod_prime",
  );
  const parsed = await parse(fixture.source, fixture.filename);
  const definition = parsed.ast.body.find((node) =>
    node instanceof parsed.compiler.AST_Function &&
    node.name?.name === fixture.functionName
  );
  const loop = loopAtLine(parsed.compiler, definition, 679);
  const recognition = recognizeModularSequenceProgram(
    parsed.compiler,
    loop,
    definition,
  );
  assert.equal(loop.end.line, 685);
  assert.equal(recognition.recognized, true);
  assert.equal(recognition.program.kind, "nested-bounded-modular-scan");
  assert.equal(recognition.program.zeroBranch, "publish-index-and-break");
  assert.equal(
    recognition.program.proofGaps.includes(
      MODULAR_SEQUENCE_REASONS.earlyExitPublication,
    ),
    true,
  );
  assert.equal(
    recognition.program.proofGaps.includes(
      MODULAR_SEQUENCE_REASONS.guardHoisting,
    ),
    true,
  );
  const { observations, candidates } = runPass(parsed.compiler, parsed.ast);
  const observation = observations.find((item) => item.node === loop);
  assert.ok(observation);
  assert.deepEqual(candidates, []);
  assert.equal(observation.decision.passId, MODULAR_SEQUENCE_RECONNAISSANCE_PASS);
});

test("the measured dense antiderivative is transactional transform evidence", async () => {
  const parsed = await recognitionForFixture(exactFixture(
    "src/lib/sagejs/polynomial_algorithms/structural_calculus.py",
    "dense_integral",
  ));
  assert.equal(parsed.loop.start.line, 155);
  assert.equal(parsed.loop.end.line, 159);
  assert.equal(parsed.recognition.recognized, true);
  assert.deepEqual(parsed.recognition.program, {
    version: 1,
    kind: "transactional-sequence-transform",
    iteratorKind: "enumerate-one-argument",
    initializerStatementIndex: 2,
    indexName: "index",
    elementName: "coefficient",
    sequenceName: "normalized",
    outputName: "answer",
    sentinelName: "zero",
    callbackName: "divide_by_integer",
    branchShape: "sentinel-or-callback-append",
    callbackArguments: ["element", "index-plus-one"],
    publication: "return-after-loop",
    operations: ["equal", "append", "callback", "add"],
    proofGaps: [
      MODULAR_SEQUENCE_REASONS.callbackEffects,
      MODULAR_SEQUENCE_REASONS.elementRepresentation,
      MODULAR_SEQUENCE_REASONS.iteratorSemantics,
      MODULAR_SEQUENCE_REASONS.machineRange,
      MODULAR_SEQUENCE_REASONS.operationDispatch,
    ].sort(),
  });

  const { observations, candidates } = runPass(parsed.compiler, parsed.ast);
  const observation = observations.find((item) => item.node === parsed.loop);
  assert.ok(observation);
  assert.deepEqual(candidates, []);
  assert.equal(
    observation.rejectionReasons.includes(
      MODULAR_SEQUENCE_REASONS.callbackEffects,
    ),
    true,
  );
  assert.equal(
    observation.decision.facts.some((fact) =>
      fact.kind === "fresh-private-list-output"
    ),
    true,
  );
});

test("unrelated recurrence and append lookalikes are not claimed", async () => {
  const sources = [
    `
def lookalike(values, point, prime):
    answer = 0
    for coefficient in values:
        answer = (answer * point + coefficient) % prime
    return answer
`,
    `
def lookalike(values, point, prime):
    answer = 0
    for coefficient in reversed(values):
        answer = answer * point + coefficient % prime
    return answer
`,
    `
def lookalike(values, point, prime):
    answer = 0
    notify()
    for coefficient in reversed(values):
        answer = (answer * point + coefficient) % prime
    return answer
`,
    `
def lookalike(values, zero, callback):
    output = [zero]
    for index, value in enumerate(values):
        if value == zero:
            output.append(zero)
        else:
            other.append(callback(value, index + 1))
    return output
`,
    `
def lookalike(values, zero, callback):
    output = [zero]
    for index, value in enumerate(values):
        if value == zero:
            output.append(zero)
        else:
            output.append(callback(value, index + 2))
    return output
`,
    `
def lookalike(values, point, prime, reversed):
    answer = 0
    for coefficient in reversed(values):
        answer = (answer * point + coefficient) % prime
    return answer
`,
    `
def lookalike(values, prime, other):
    total = 0
    for sample in range(prime):
        value = 0
        for coefficient in reversed(values):
            value = (value * sample + coefficient) % other
        if value == 0:
            continue
        character = pow(value, (prime - 1) // 2, prime)
        total += 1 if character == 1 else -1
    return total
`,
    `
def lookalike(values, prime):
    root = None
    for sample in range(prime):
        value = 0
        for coefficient in reversed(values):
            value = (value * sample + coefficient) % prime
        if value == 0:
            root = sample
    return root
`,
  ];
  for (const source of sources) {
    const parsed = await parse(source);
    const { definition, loop } = functionAndLoop(
      parsed.compiler,
      parsed.ast,
      "lookalike",
    );
    const recognition = recognizeModularSequenceProgram(
      parsed.compiler,
      loop,
      definition,
    );
    assert.deepEqual(recognition, {
      recognized: false,
      reason: "not-canonical-modular-sequence-shape",
    });
    assert.deepEqual(runPass(parsed.compiler, parsed.ast), {
      observations: [],
      candidates: [],
    });
  }
});

test("the verifier rejects a forged executable target and the plugin owns no lowering", async () => {
  const parsed = await recognitionForFixture(exactFixture(
    "src/lib/sagejs/polynomial_algorithms/arbitrary_prime_contract.py",
    "polynomial_evaluate_mod",
  ));
  const { observations } = runPass(parsed.compiler, parsed.ast);
  const decision = observations.find((item) => item.node === parsed.loop).decision;
  verifyModularSequenceReconnaissanceDecision(
    parsed.recognition.program,
    decision,
  );
  const forged = JSON.parse(JSON.stringify(decision));
  forged.target.candidates[0].availability = "selected";
  forged.target.kind = "v8";
  forged.target.selectedCandidate = forged.target.candidates[0].id;
  assert.throws(
    () => verifyModularSequenceReconnaissanceDecision(
      parsed.recognition.program,
      forged,
    ),
    /invalid modular sequence reconnaissance decision/,
  );
  assert.equal(modularSequenceReconnaissancePlugin.id,
    MODULAR_SEQUENCE_RECONNAISSANCE_PASS);
  assert.deepEqual([...modularSequenceReconnaissancePlugin.loweringIds], []);
});
