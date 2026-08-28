// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const { default: createCompiler } = require("../dist/tools/compiler.js");
const {
  createPythonCompilerFrontend,
} = require("../dist/tools/python/compiler-frontend.js");
const {
  FIXED_EXTENSION_CONSTRUCTION_CONTEXT,
  FIXED_EXTENSION_CONSTRUCTION_CONTEXT_PROPERTY,
  FIXED_EXTENSION_DEGREES,
  FIXED_EXTENSION_MODULUS_IDENTITY_AUTHENTICATION,
  FIXED_EXTENSION_REGION_PASS,
  authenticatesFixedExtensionConstructionContext,
  exactIntermediateMaximum,
  theoreticalMaximumPrime,
} = require(
  "../dist/tools/python/optimizer/domains/fixed-extension/index.js"
);
const {
  fixedExtensionRegionPass,
} = require(
  "../dist/tools/python/optimizer/passes/fixed-extension-region.js"
);
const {
  planV8FixedExtensionTarget,
} = require(
  "../dist/tools/python/optimizer/targets/v8-fixed-extension.js"
);
const {
  verifyFixedExtensionInternalRegionPlan,
} = require(
  "../dist/tools/python/optimizer/verifiers/fixed-extension.js"
);
const {
  verifyOptimizationDecision,
  verifyOptimizationPass,
} = require("../dist/tools/python/optimizer/verifier.js");

const parserOptions = {
  filename: "fixed-extension-contract.sage",
  for_linting: true,
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

function walkAst(compiler, root, visitor) {
  const ignored = new Set([
    "start", "end", "scope", "thedef", "imports", "globals", "classes",
    "baselib", "optimization_ir", "optimization_region",
    "optimization_contract",
  ]);
  const seen = new Set();
  const visit = (value, ancestors) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, ancestors);
      return;
    }
    if (!(value instanceof compiler.AST_Node)) return;
    visitor(value, ancestors);
    const childAncestors = [...ancestors, value];
    for (const [key, child] of Object.entries(value)) {
      if (!ignored.has(key) && typeof child !== "function") {
        visit(child, childAncestors);
      }
    }
  };
  visit(root, []);
}

async function fixedExtensionCandidate(source) {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, "sage");
  try {
    const ast = frontend.parse(source, parserOptions);
    let definition;
    walkAst(compiler, ast, (node) => {
      if (!definition && node instanceof compiler.AST_Function) definition = node;
    });
    assert.ok(definition);
    definition.optimization_contract = {
      requiredPassId: FIXED_EXTENSION_REGION_PASS,
    };
    const candidates = [];
    fixedExtensionRegionPass.run(ast, {
      compiler,
      controls: {
        level: "O2",
        disabledPasses: new Set(),
        requiredOptimizations: new Set(),
        explain: false,
      },
      walk(root, visitor) {
        walkAst(compiler, root, visitor);
      },
      consider(candidate) {
        candidates.push(candidate);
      },
      observe() {
        throw new Error("fixed-extension pass must not emit observations");
      },
    });
    assert.equal(candidates.length, 1);
    return candidates[0];
  } finally {
    frontend.close();
  }
}

test("degree-specific exactness proofs reach the exact Number boundary", () => {
  assert.deepEqual(FIXED_EXTENSION_DEGREES, [2, 3, 4]);
  for (const degree of FIXED_EXTENSION_DEGREES) {
    const prime = theoreticalMaximumPrime(degree);
    assert.ok(
      exactIntermediateMaximum(degree, prime) <= Number.MAX_SAFE_INTEGER,
    );
    assert.throws(
      () => exactIntermediateMaximum(degree, prime + 1),
      /exceeds exact Number range/,
    );
  }
});

test("the explicit pass isolates and independently budgets every degree", async () => {
  const candidate = await fixedExtensionCandidate(`
def program(count, value, factor, alias):
    for index in range(count):
        square = value^2
        if square == alias:
            value = square + factor
        else:
            value = value^3 - factor
        alias = alias*factor + value
    return value, alias
`);
  assert.equal(candidate.internal.passId, FIXED_EXTENSION_REGION_PASS);
  assert.equal(candidate.internal.kind, "fixed-extension-region");
  assert.equal(candidate.decision.mathematical.kind, "math.fixed-extension-program");
  assert.ok(candidate.decision.facts.some((fact) =>
    fact.kind === "immutable-construction-context"
  ));
  assert.ok(candidate.decision.facts.some((fact) =>
    fact.kind === "construction-time-modulus-identity"
  ));
  assert.ok(candidate.decision.guards.includes(
    "construction-time-modulus-identity",
  ));
  assert.equal(
    candidate.internal.operands.fixedExtension.representation.runtimeContext
      .runtimeHelper,
    "runtime.machine_extension_context_matches",
  );
  assert.equal(
    candidate.internal.operands.fixedExtension.representation.runtimeContext
      .intrinsic,
    "ρσ_machine_extension_context_matches",
  );
  assert.deepEqual(
    candidate.internal.operands.fixedExtension.target.variants.map(
      (variant) => variant.degree,
    ),
    [2, 3, 4],
  );
  for (const variant of candidate.internal.operands.fixedExtension.target.variants) {
    assert.ok(variant.emittedBytes <= variant.codeBudgetBytes);
    assert.ok(variant.compileCostUnits <= variant.compileBudgetUnits);
    assert.match(variant.outlineId, new RegExp(`degree-${variant.degree}`));
  }
  assert.doesNotThrow(() =>
    verifyFixedExtensionInternalRegionPlan(candidate.internal)
  );
  assert.doesNotThrow(() => verifyOptimizationPass(fixedExtensionRegionPass));
  assert.doesNotThrow(() => verifyOptimizationDecision({
    ...candidate.decision,
    functionId: null,
    selected: true,
    rejectionReasons: [],
  }));
});

test("the independent verifier rejects mutated shape, bound, and budget claims", async () => {
  const candidate = await fixedExtensionCandidate(`
def recurrence(count, value, factor):
    for index in range(count):
        value = value*factor + value^19
    return value
`);
  const internal = candidate.internal;
  const fixed = internal.operands.fixedExtension;
  const representations = fixed.representation.variants;
  const targets = fixed.target.variants;

  const badShape = {
    ...internal,
    operands: {
      ...internal.operands,
      fixedExtension: {
        ...fixed,
        representation: {
          ...fixed.representation,
          variants: [
            { ...representations[0], tupleWidth: 3 },
            ...representations.slice(1),
          ],
        },
      },
    },
  };
  assert.throws(
    () => verifyFixedExtensionInternalRegionPlan(badShape),
    /stale representation shape/,
  );

  const badBound = {
    ...internal,
    operands: {
      ...internal.operands,
      fixedExtension: {
        ...fixed,
        representation: {
          ...fixed.representation,
          variants: [
            representations[0],
            {
              ...representations[1],
              exactness: {
                ...representations[1].exactness,
                exactIntermediateMaximum:
                  representations[1].exactness.exactIntermediateMaximum - 1,
              },
            },
            representations[2],
          ],
        },
      },
    },
  };
  assert.throws(
    () => verifyFixedExtensionInternalRegionPlan(badBound),
    /stale exactness proof/,
  );

  const badBudget = {
    ...internal,
    operands: {
      ...internal.operands,
      fixedExtension: {
        ...fixed,
        target: {
          ...fixed.target,
          variants: [
            ...targets.slice(0, 2),
            { ...targets[2], emittedBytes: targets[2].emittedBytes - 1 },
          ],
        },
      },
    },
  };
  assert.throws(
    () => verifyFixedExtensionInternalRegionPlan(badBudget),
    /stale target budgets/,
  );

  const badConstructionContext = {
    ...internal,
    operands: {
      ...internal.operands,
      fixedExtension: {
        ...fixed,
        representation: {
          ...fixed.representation,
          runtimeContext: {
            ...fixed.representation.runtimeContext,
            machineModulusIdentity: "same-shape-value-equality",
          },
        },
      },
    },
  };
  assert.throws(
    () => verifyFixedExtensionInternalRegionPlan(badConstructionContext),
    /stale construction context guard/,
  );
});

test("construction context rejects a hostile same-shape modulus replacement", () => {
  const sourceModulus = Object.freeze([1n, 1n, 0n, 1n]);
  const machineModulus = Object.freeze([1, 1, 0]);
  const constructionContext = Object.freeze({
    id: FIXED_EXTENSION_CONSTRUCTION_CONTEXT,
    degree: 3,
    prime: 5,
    sourceModulusCoefficients: sourceModulus,
    machineModulusCoefficients: machineModulus,
  });
  const parent = {
    _modulusCoefficients: sourceModulus,
    _machineExtensionModulusCoefficients: machineModulus,
  };
  Object.defineProperty(
    parent,
    FIXED_EXTENSION_CONSTRUCTION_CONTEXT_PROPERTY,
    {
      value: constructionContext,
      writable: false,
      configurable: false,
    },
  );
  const prepared = {
    degree: 3,
    modulus: 5,
    modulusCoefficients: machineModulus,
    constructionContext,
    modulusIdentityAuthentication:
      FIXED_EXTENSION_MODULUS_IDENTITY_AUTHENTICATION,
  };
  assert.equal(
    authenticatesFixedExtensionConstructionContext(parent, prepared),
    true,
  );

  const hostileSameShape = Object.freeze([2, 1, 0]);
  parent._machineExtensionModulusCoefficients = hostileSameShape;
  assert.equal(
    authenticatesFixedExtensionConstructionContext(parent, {
      ...prepared,
      modulusCoefficients: hostileSameShape,
    }),
    false,
  );
});

test("an over-budget degree-four body keeps the whole region dynamic", () => {
  const slot = (index) => ({ kind: "slot", slot: index });
  const statements = Array.from({ length: 8 }, () => ({
    kind: "assign",
    assignmentOperator: "=",
    target: 0,
    value: {
      kind: "binary",
      operator: "*",
      left: slot(0),
      right: slot(1),
    },
  }));
  const program = {
    slots: [{ name: "left" }, { name: "right" }],
    statements,
    hoistedExpressions: [],
  };
  assert.equal(planV8FixedExtensionTarget(program), null);
  assert.ok(planV8FixedExtensionTarget({
    ...program,
    statements: statements.slice(0, 7),
  }));
});

function canonical(value, prime) {
  const result = value % prime;
  return result < 0 ? result + prime : result;
}

function multiply(left, right, prime, modulus) {
  const degree = modulus.length;
  const product = Array(2 * degree - 1).fill(0);
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      product[i + j] = canonical(
        product[i + j] + left[i] * right[j],
        prime,
      );
    }
  }
  for (let exponent = 2 * degree - 2; exponent >= degree; exponent -= 1) {
    const factor = product[exponent];
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      product[target] = canonical(
        product[target] - factor * modulus[index],
        prime,
      );
    }
  }
  return product.slice(0, degree);
}

function power(value, exponent, prime, modulus) {
  const one = Array(value.length).fill(0);
  one[0] = 1;
  let answer = one;
  let factor = value;
  while (exponent > 0) {
    if (exponent % 2 === 1) {
      answer = multiply(answer, factor, prime, modulus);
    }
    exponent = Math.floor(exponent / 2);
    if (exponent > 0) factor = multiply(factor, factor, prime, modulus);
  }
  return answer;
}

function add(left, right, prime) {
  return left.map((value, index) => canonical(value + right[index], prime));
}

function subtract(left, right, prime) {
  return left.map((value, index) => canonical(value - right[index], prime));
}

function programOracle(item, count) {
  let value = [...item.value];
  const factor = [...item.factor];
  const offset = [...item.offset];
  let alias = value;
  for (let index = 0; index < count; index += 1) {
    const powered = power(value, 3, item.prime, item.modulus);
    value = powered.every((entry, coordinate) => entry === alias[coordinate])
      ? add(powered, offset, item.prime)
      : subtract(powered, factor, item.prime);
    alias = add(
      multiply(alias, factor, item.prime, item.modulus),
      value,
      item.prime,
    );
  }
  return { value, alias };
}

const runtimeCases = [
  {
    name: "quadratic-a",
    prime: 5,
    degree: 2,
    polynomial: "x^2+2",
    modulus: [2, 0],
    setup: [
      "value = K(1)+2*a",
      "factor = K(2)+a",
      "offset = K(3)+4*a",
    ],
    value: [1, 2],
    factor: [2, 1],
    offset: [3, 4],
  },
  {
    name: "quadratic-b",
    prime: 5,
    degree: 2,
    polynomial: "x^2+x+1",
    modulus: [1, 1],
    setup: [
      "value = K(1)+2*a",
      "factor = K(2)+a",
      "offset = K(3)+4*a",
    ],
    value: [1, 2],
    factor: [2, 1],
    offset: [3, 4],
  },
  {
    name: "cubic-a",
    prime: 5,
    degree: 3,
    polynomial: "x^3+x+1",
    modulus: [1, 1, 0],
    setup: [
      "aa = a*a",
      "value = K(1)+2*a+3*aa",
      "factor = K(2)+a+4*aa",
      "offset = K(3)+4*a+aa",
    ],
    value: [1, 2, 3],
    factor: [2, 1, 4],
    offset: [3, 4, 1],
  },
  {
    name: "cubic-b",
    prime: 5,
    degree: 3,
    polynomial: "x^3+2*x+1",
    modulus: [1, 2, 0],
    setup: [
      "aa = a*a",
      "value = K(1)+2*a+3*aa",
      "factor = K(2)+a+4*aa",
      "offset = K(3)+4*a+aa",
    ],
    value: [1, 2, 3],
    factor: [2, 1, 4],
    offset: [3, 4, 1],
  },
  {
    name: "quartic-a",
    prime: 3,
    degree: 4,
    polynomial: "x^4+x+2",
    modulus: [2, 1, 0, 0],
    setup: [
      "aa = a*a",
      "aaa = aa*a",
      "value = K(1)+2*a+aa+2*aaa",
      "factor = K(2)+a+2*aa+aaa",
      "offset = K(1)+a+aa+aaa",
    ],
    value: [1, 2, 1, 2],
    factor: [2, 1, 2, 1],
    offset: [1, 1, 1, 1],
  },
  {
    name: "quartic-b",
    prime: 2,
    degree: 4,
    polynomial: "x^4+x+1",
    modulus: [1, 1, 0, 0],
    setup: [
      "aa = a*a",
      "aaa = aa*a",
      "value = K(1)+a+aa",
      "factor = K(1)+aa+aaa",
      "offset = a+aaa",
    ],
    value: [1, 1, 1, 0],
    factor: [1, 0, 1, 1],
    offset: [0, 1, 0, 1],
  },
];

function runtimeSource(item, count) {
  return `
P.<x> = PolynomialRing(GF(${item.prime}))
K.<a> = GF(${item.prime}^${item.degree}, modulus=${item.polynomial})
def program(count):
${item.setup.map((line) => `    ${line}`).join("\n")}
    alias = value
    for index in range(count):
        powered = value^3
        if powered == alias:
            value = powered + offset
        else:
            value = powered - factor
        alias = alias*factor + value
    return value, alias, index

K._lastCompilerOptimizationRoute = 'initial'
answer = program(${count})
print(tuple(answer[0]._machineCoordinates), tuple(answer[1]._machineCoordinates), answer[2], K._lastCompilerOptimizationRoute)
saved_mul = K._machineExtensionMul
K._machineExtensionMul = None
K._lastCompilerOptimizationRoute = 'mutation-fallback'
mutated = program(${count})
print(tuple(mutated[0]._machineCoordinates), tuple(mutated[1]._machineCoordinates), mutated[2], K._lastCompilerOptimizationRoute)
K._machineExtensionMul = saved_mul

def zero_trip():
${item.setup.map((line) => `    ${line}`).join("\n")}
    alias = value
    for index in range(0):
        value = value*factor + offset
    return value is alias
print(zero_trip())
`;
}

async function sessionAtLevel(level) {
  const previous = process.env.SAGEJS_OPT_LEVEL;
  process.env.SAGEJS_OPT_LEVEL = level;
  try {
    return await createSage();
  } finally {
    if (previous === undefined) delete process.env.SAGEJS_OPT_LEVEL;
    else process.env.SAGEJS_OPT_LEVEL = previous;
  }
}

test("powers, branches, aliases, mutation, zero trips, degrees, and modulus shapes match O0", async () => {
  const optimized = await sessionAtLevel("O2");
  const generic = await sessionAtLevel("O0");
  try {
    for (const item of runtimeCases) {
      const count = 29;
      const expected = programOracle(item, count);
      const [fast, slow] = await Promise.all([
        optimized.evaluate(runtimeSource(item, count)),
        generic.evaluate(runtimeSource(item, count)),
      ]);
      const lines = fast.stdout.trim().split("\n");
      const slowLines = slow.stdout.trim().split("\n");
      const answer = `(${expected.value.join(", ")}) (${expected.alias.join(", ")}) ${count - 1}`;
      assert.equal(lines[0], `${answer} v8-extension-tuple-region`, item.name);
      assert.equal(slowLines[0], `${answer} initial`, item.name);
      assert.equal(lines[1], `${answer} mutation-fallback`, item.name);
      assert.equal(slowLines[1], `${answer} mutation-fallback`, item.name);
      assert.equal(lines[2], "True", item.name);
      assert.equal(slowLines[2], "True", item.name);
    }
  } finally {
    await Promise.all([optimized.close(), generic.close()]);
  }
});
