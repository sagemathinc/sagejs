import type { InternalRegionPlan } from "../types";
import type {
  ModularBatchExpression,
  ModularBatchOperation,
} from "../representations/modular-batch";
import type {
  LinearBatchQuantity,
  StructuralBatchCost,
  TargetedModularBatchProgram,
} from "../targets/modular-batch";

const SCHEMA = "sagejs.optimizing-mathematics/v1";
const PASS = "math.modular-batch-region.v1";
const LOWERING = "v8.modular-batch-loop.v1";
const KIND = "modular-batch-region";
const REPRESENTATION = "number-residue-complete-batch.v1";
const MAX_MODULUS = 94_906_266;
const MAX_CODE_BYTES = 32 * 1024;

function reject(message: string): never {
  throw new TypeError(`invalid modular batch plan: ${message}`);
}

function requireSafeInteger(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) reject(field);
  return Number(value);
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function sameObject(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface DerivedExpressionFacts {
  operations: Set<ModularBatchOperation>;
  constants: Set<number>;
  inputUses: number[];
  operationCost: number;
}

function verifyExpression(
  value: ModularBatchExpression,
  inputCount: number,
  facts: DerivedExpressionFacts,
): void {
  if (!value || typeof value !== "object") reject("expression-node");
  if (value.kind === "input") {
    const input = requireSafeInteger(value.input, "input-index");
    if (input >= inputCount) reject("input-index");
    facts.inputUses[input] += 1;
    return;
  }
  if (value.kind === "integer-constant") {
    requireSafeInteger(Math.abs(value.value), "integer-constant");
    if (!Number.isSafeInteger(value.value)) reject("integer-constant");
    facts.constants.add(value.value);
    facts.operations.add("coerce-integer");
    return;
  }
  if (value.kind === "neg") {
    facts.operationCost += 1;
    facts.operations.add("neg");
    verifyExpression(value.value, inputCount, facts);
    return;
  }
  if (value.kind !== "binary" || !["+", "-", "*"].includes(value.operator)) {
    reject("expression-kind");
  }
  facts.operationCost += 1;
  facts.operations.add(value.operator === "+" ? "add" :
    value.operator === "-" ? "sub" : "mul");
  verifyExpression(value.left, inputCount, facts);
  verifyExpression(value.right, inputCount, facts);
}

function expectedBounds(operations: readonly ModularBatchOperation[]): unknown {
  const used = new Set(operations);
  const residueMaximum = MAX_MODULUS - 1;
  const bounds = [
    ["add", "2 * (p - 1)", 2 * residueMaximum],
    ["sub", "2 * (p - 1)", 2 * residueMaximum],
    ["mul", "(p - 1) * (p - 1)", residueMaximum * residueMaximum],
    ["neg", "p - 1", residueMaximum],
  ].filter(([operation]) => used.has(operation as ModularBatchOperation))
    .map(([operation, formula, maximumAtAcceptedModulus]) => ({
      operation,
      formula,
      maximumAtAcceptedModulus,
    }));
  return {
    modulusMinimum: 2,
    modulusMaximum: MAX_MODULUS,
    canonicalResidueMinimum: 0,
    canonicalResidueMaximum: "p - 1",
    intermediates: bounds,
  };
}

function expectedMethodMask(operations: readonly ModularBatchOperation[]): number {
  const bits: Record<ModularBatchOperation, number> = {
    add: 1,
    sub: 2,
    mul: 4,
    neg: 8,
    "coerce-integer": 1024,
  };
  return 32 + operations.reduce((mask, operation) => mask | bits[operation], 0);
}

function linear(fixed: number, perElement: number): LinearBatchQuantity {
  return { fixed, perElement };
}

function expectedStructuralCost(
  kind: "v8" | "wasm" | "native" | "generic",
  inputCount: number,
  operationCost: number,
): StructuralBatchCost {
  if (kind === "generic") {
    return {
      arithmeticOperations: linear(0, operationCost),
      representationConversions: linear(0, 0),
      boundaryCrossings: linear(0, 0),
      copiedBytes: linear(0, 0),
      allocations: linear(0, operationCost),
      cleanupOperations: linear(0, 0),
      materializations: linear(0, 0),
      coldCompileEvents: 0,
      coldInstantiateEvents: 0,
      coldLoadEvents: 0,
    };
  }
  return {
    arithmeticOperations: linear(0, operationCost),
    representationConversions: linear(0, inputCount + 1),
    boundaryCrossings: linear(kind === "v8" ? 0 : 1, 0),
    copiedBytes: linear(0, 8 * (inputCount + 1)),
    allocations: linear(inputCount + 1, 1),
    cleanupOperations: linear(0, 0),
    materializations: linear(0, 1),
    coldCompileEvents: 1,
    coldInstantiateEvents: kind === "wasm" ? 1 : 0,
    coldLoadEvents: kind === "wasm" || kind === "native" ? 1 : 0,
  };
}

function expectedScore(cost: StructuralBatchCost): LinearBatchQuantity {
  return linear(
    cost.arithmeticOperations.fixed + 3 * cost.representationConversions.fixed +
      256 * cost.boundaryCrossings.fixed + cost.copiedBytes.fixed / 8 +
      8 * cost.allocations.fixed + 8 * cost.materializations.fixed,
    cost.arithmeticOperations.perElement +
      3 * cost.representationConversions.perElement +
      256 * cost.boundaryCrossings.perElement + cost.copiedBytes.perElement / 8 +
      8 * cost.allocations.perElement + 8 * cost.materializations.perElement,
  );
}

function expectedCodeBudget(operationCost: number, inputs: number, constants: number): number {
  return 512 + 256 * operationCost + 64 * inputs + 64 * constants;
}

/** Recompute every safety-critical recognition, range, alias, and cost claim. */
export function verifyModularBatchInternalRegionPlan(
  internal: InternalRegionPlan,
): void {
  if (internal?.schema !== SCHEMA || internal.passId !== PASS ||
      internal.loweringId !== LOWERING || internal.kind !== KIND ||
      typeof internal.id !== "string" || internal.id.length === 0 ||
      (internal.guardFailure !== "fallback" && internal.guardFailure !== "error")) {
    reject("identity-contract");
  }
  const plan = internal.operands as TargetedModularBatchProgram;
  if (plan?.version !== 1 || typeof plan.iteratorName !== "string" ||
      typeof plan.countName !== "string" || typeof plan.outputName !== "string" ||
      plan.iteratorName === plan.countName || plan.outputName === plan.countName ||
      plan.outputName === plan.iteratorName ||
      plan.iterator?.name !== plan.iteratorName || plan.count?.name !== plan.countName ||
      plan.output?.name !== plan.outputName ||
      plan.iterator?.python_lexical_binding !== true ||
      plan.count?.python_lexical_binding !== true ||
      plan.output?.python_lexical_binding !== true) reject("binding-contract");
  if (!Array.isArray(plan.inputs) || plan.inputs.length < 1 || plan.inputs.length > 4) {
    reject("input-count");
  }
  const inputNames = plan.inputs.map((input) => input?.name);
  if (inputNames.some((name, index) => typeof name !== "string" ||
      name.length === 0 || plan.inputs[index].node?.name !== name ||
      plan.inputs[index].node?.python_lexical_binding !== true) ||
      new Set(inputNames).size !== inputNames.length ||
      inputNames.includes(plan.outputName) || inputNames.includes(plan.countName) ||
      inputNames.includes(plan.iteratorName)) reject("input-bindings");

  const facts: DerivedExpressionFacts = {
    operations: new Set(),
    constants: new Set(),
    inputUses: new Array(plan.inputs.length).fill(0),
    operationCost: 0,
  };
  verifyExpression(plan.expression, plan.inputs.length, facts);
  if (facts.operationCost < 1 || facts.operationCost > 32 ||
      facts.inputUses.some((uses) => uses < 1)) reject("operation-graph");
  const expectedOperations = [...facts.operations].sort();
  const expectedConstants = [...facts.constants].sort((left, right) => left - right);
  if (!sameArray(plan.operations, expectedOperations) ||
      !sameArray(plan.integerConstants, expectedConstants) ||
      plan.operationCost !== facts.operationCost ||
      !sameArray(plan.inputs.map((input) => input.uses), facts.inputUses)) {
    reject("derived-expression-facts");
  }

  const proof = plan.aliasProof;
  if (proof?.kind !== "fresh-list-comprehension" ||
      proof.outputName !== plan.outputName ||
      proof.allocationCountName !== plan.countName ||
      requireSafeInteger(proof.allocationStatementIndex, "allocation-index") < 0 ||
      proof.inputInputAliasing !== "allowed-read-only" ||
      proof.publication !== "after-complete-validation-and-private-computation" ||
      !sameArray(proof.disjointInputNames, [...inputNames].sort())) {
    reject("alias-proof");
  }

  const representation = plan.representation;
  if (representation?.id !== REPRESENTATION ||
      representation.storage !== "float64-number-residues" ||
      representation.inputPolicy !== "fully-validate-and-pack-before-compute" ||
      representation.outputPolicy !== "private-float64-stage-then-publish-fresh-list" ||
      representation.aliasPolicy !== "fresh-output-disjoint-from-read-only-inputs" ||
      representation.methodGuardMask !== expectedMethodMask(expectedOperations) ||
      !sameObject(representation.exactBounds, expectedBounds(expectedOperations))) {
    reject("representation-proof");
  }
  for (const bound of representation.exactBounds.intermediates) {
    if (!Number.isSafeInteger(bound.maximumAtAcceptedModulus) ||
        bound.maximumAtAcceptedModulus > Number.MAX_SAFE_INTEGER) {
      reject("unsafe-intermediate-bound");
    }
  }

  const comparison = plan.targetComparison;
  if (comparison?.selected !== "v8-complete-modular-batch" ||
      comparison.policy !== "inclusive-unresident-boxed-batch-v1" ||
      comparison.dominanceReason !==
        "v8-avoids-isolated-boundary-with-equal-required-copy" ||
      !Array.isArray(comparison.estimates) || comparison.estimates.length !== 4 ||
      !Number.isSafeInteger(comparison.emittedV8Bytes) ||
      comparison.emittedV8Bytes < 1 || comparison.emittedV8Bytes > MAX_CODE_BYTES) {
    reject("target-comparison");
  }
  const expectedTargets = [
    ["v8-complete-modular-batch", "v8", "selected", null],
    ["wasm-resident-modular-batch", "wasm", "rejected",
      "isolated-modular-batch-wasm-lowering-not-registered"],
    ["native-coarse-modular-batch", "native", "rejected",
      "isolated-modular-batch-native-lowering-not-registered"],
    ["generic-modular-batch-fallback", "generic", "available", null],
  ] as const;
  for (let index = 0; index < expectedTargets.length; index += 1) {
    const estimate = comparison.estimates[index];
    const [id, kind, availability, rejectionReason] = expectedTargets[index];
    const cost = expectedStructuralCost(
      kind, plan.inputs.length, facts.operationCost,
    );
    if (estimate?.id !== id || estimate.kind !== kind ||
        estimate.availability !== availability ||
        estimate.rejectionReason !== rejectionReason ||
        !sameObject(estimate.structuralCost, cost) ||
        !sameObject(
          estimate.score,
          kind === "generic" ? "semantic-runtime-dependent" : expectedScore(cost),
        )) reject("target-cost");
  }
  const expectedBudget = expectedCodeBudget(
    facts.operationCost, plan.inputs.length, expectedConstants.length,
  );
  if (plan.targetCodeBytes !== expectedBudget ||
      plan.targetCodeBytes > MAX_CODE_BYTES ||
      comparison.emittedV8Bytes > plan.targetCodeBytes) reject("code-size-budget");
}
