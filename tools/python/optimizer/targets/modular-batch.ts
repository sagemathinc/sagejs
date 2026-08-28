import type {
  CompleteTargetCost,
  TargetCandidatePlan,
} from "../types";
import type {
  ModularBatchExpression,
} from "../representations/modular-batch";
import type {
  RepresentedModularBatchProgram,
} from "../representations/modular-batch";

export type ModularBatchTargetId =
  | "v8-complete-modular-batch"
  | "wasm-resident-modular-batch"
  | "native-coarse-modular-batch"
  | "generic-modular-batch-fallback";

export interface LinearBatchQuantity {
  fixed: number;
  perElement: number;
}

export interface StructuralBatchCost {
  arithmeticOperations: LinearBatchQuantity;
  representationConversions: LinearBatchQuantity;
  boundaryCrossings: LinearBatchQuantity;
  copiedBytes: LinearBatchQuantity;
  allocations: LinearBatchQuantity;
  cleanupOperations: LinearBatchQuantity;
  materializations: LinearBatchQuantity;
  coldCompileEvents: number;
  coldInstantiateEvents: number;
  coldLoadEvents: number;
}

export interface ModularBatchTargetEstimate {
  id: ModularBatchTargetId;
  kind: "v8" | "wasm" | "native" | "generic";
  availability: "selected" | "available" | "rejected";
  rejectionReason: string | null;
  structuralCost: StructuralBatchCost;
  score: LinearBatchQuantity | "semantic-runtime-dependent";
  evidence: string;
}

export interface ModularBatchTargetComparison {
  selected: "v8-complete-modular-batch";
  policy: "inclusive-unresident-boxed-batch-v1";
  dominanceReason: "v8-avoids-isolated-boundary-with-equal-required-copy";
  estimates: ModularBatchTargetEstimate[];
  emittedV8Bytes: number;
}

export interface TargetedModularBatchProgram
  extends RepresentedModularBatchProgram {
  targetComparison: ModularBatchTargetComparison;
  targetCodeBytes: number;
}

function linear(fixed: number, perElement: number): LinearBatchQuantity {
  return { fixed, perElement };
}

function structuralCost(
  program: RepresentedModularBatchProgram,
  kind: "v8" | "wasm" | "native" | "generic",
): StructuralBatchCost {
  const inputCount = program.inputs.length;
  const packedBytes = 8 * (inputCount + 1);
  if (kind === "generic") {
    return {
      arithmeticOperations: linear(0, program.operationCost),
      representationConversions: linear(0, 0),
      boundaryCrossings: linear(0, 0),
      copiedBytes: linear(0, 0),
      allocations: linear(0, program.operationCost),
      cleanupOperations: linear(0, 0),
      materializations: linear(0, 0),
      coldCompileEvents: 0,
      coldInstantiateEvents: 0,
      coldLoadEvents: 0,
    };
  }
  return {
    arithmeticOperations: linear(0, program.operationCost),
    representationConversions: linear(0, inputCount + 1),
    boundaryCrossings: linear(kind === "v8" ? 0 : 1, 0),
    copiedBytes: linear(0, packedBytes),
    allocations: linear(inputCount + 1, 1),
    cleanupOperations: linear(0, 0),
    materializations: linear(0, 1),
    coldCompileEvents: 1,
    coldInstantiateEvents: kind === "wasm" ? 1 : 0,
    coldLoadEvents: kind === "native" || kind === "wasm" ? 1 : 0,
  };
}

function score(cost: StructuralBatchCost): LinearBatchQuantity {
  return linear(
    cost.arithmeticOperations.fixed +
      3 * cost.representationConversions.fixed +
      256 * cost.boundaryCrossings.fixed +
      cost.copiedBytes.fixed / 8 +
      8 * cost.allocations.fixed +
      8 * cost.materializations.fixed,
    cost.arithmeticOperations.perElement +
      3 * cost.representationConversions.perElement +
      256 * cost.boundaryCrossings.perElement +
      cost.copiedBytes.perElement / 8 +
      8 * cost.allocations.perElement +
      8 * cost.materializations.perElement,
  );
}

function publicCost(cost: StructuralBatchCost): CompleteTargetCost {
  return {
    arithmeticOperations: "runtime-dependent",
    representationConversions: "runtime-dependent",
    boundaryCrossings: cost.boundaryCrossings.fixed,
    copiedBytes: "runtime-dependent",
    allocations: "runtime-dependent",
    cleanupOperations: cost.cleanupOperations.fixed,
    compileMilliseconds: "runtime-dependent",
    instantiateMilliseconds: "runtime-dependent",
    loadMilliseconds: "runtime-dependent",
    materializations: "runtime-dependent",
    emittedBytes: "runtime-dependent",
    totalUnits: "runtime-dependent",
  };
}

export function modularBatchPublicCandidates(
  comparison: ModularBatchTargetComparison,
): TargetCandidatePlan[] {
  return comparison.estimates.map((estimate) => ({
    id: estimate.id,
    kind: estimate.kind,
    representation: estimate.kind === "generic"
      ? "boxed-sage-values"
      : "packed-number-residues",
    availability: estimate.availability,
    rejectionReason: estimate.rejectionReason,
    cost: {
      ...publicCost(estimate.structuralCost),
      emittedBytes: estimate.kind === "v8"
        ? comparison.emittedV8Bytes
        : "runtime-dependent",
    },
    evidence: estimate.evidence,
  }));
}

interface EmissionState {
  lines: string[];
  nextTemporary: number;
  constants: Map<number, number>;
}

function temporary(state: EmissionState, expression: string): string {
  const name = `t${state.nextTemporary}`;
  state.nextTemporary += 1;
  state.lines.push(`      const ${name} = ${expression};`);
  return name;
}

function emitExpression(
  value: ModularBatchExpression,
  state: EmissionState,
): string {
  if (value.kind === "input") return `inputs[${value.input}][index]`;
  if (value.kind === "integer-constant") {
    const position = state.constants.get(value.value);
    if (position === undefined) throw new TypeError("unplanned modular constant");
    return `constants[${position}]`;
  }
  if (value.kind === "neg") {
    const operand = emitExpression(value.value, state);
    return temporary(state, `${operand} === 0 ? 0 : modulus - ${operand}`);
  }
  const left = emitExpression(value.left, state);
  const right = emitExpression(value.right, state);
  if (value.operator === "*") {
    return temporary(state, `(${left} * ${right}) % modulus`);
  }
  if (value.operator === "+") {
    const sum = temporary(state, `${left} + ${right}`);
    return temporary(state, `${sum} >= modulus ? ${sum} - modulus : ${sum}`);
  }
  return temporary(
    state,
    `${left} >= ${right} ? ${left} - ${right} : ${left} + modulus - ${right}`,
  );
}

/** Emit an inspectable, isolated raw-residue kernel from the verified graph. */
export function emitV8ModularBatchKernel(
  program: RepresentedModularBatchProgram,
): string {
  const state: EmissionState = {
    lines: [],
    nextTemporary: 0,
    constants: new Map(program.integerConstants.map((value, index) => [value, index])),
  };
  const result = emitExpression(program.expression, state);
  return [
    "function sagejsModularBatchKernel(inputs, constants, modulus, count) {",
    "  const output = new Float64Array(count);",
    "  for (let index = 0; index < count; index += 1) {",
    ...state.lines,
    `      output[index] = ${result};`,
    "  }",
    "  return output;",
    "}",
  ].join("\n");
}

/** Compare all inclusive target costs; only the implemented V8 target is selectable. */
export function planModularBatchTargets(
  program: RepresentedModularBatchProgram,
): TargetedModularBatchProgram {
  const v8Cost = structuralCost(program, "v8");
  const wasmCost = structuralCost(program, "wasm");
  const nativeCost = structuralCost(program, "native");
  const genericCost = structuralCost(program, "generic");
  const emittedV8Bytes = emitV8ModularBatchKernel(program).length;
  const targetCodeBytes = 512 + 256 * program.operationCost +
    64 * program.inputs.length + 64 * program.integerConstants.length;
  const estimates: ModularBatchTargetEstimate[] = [
    {
      id: "v8-complete-modular-batch",
      kind: "v8",
      availability: "selected",
      rejectionReason: null,
      structuralCost: v8Cost,
      score: score(v8Cost),
      evidence: "complete input packing, private output staging, and publication are included",
    },
    {
      id: "wasm-resident-modular-batch",
      kind: "wasm",
      availability: "rejected",
      rejectionReason: "isolated-modular-batch-wasm-lowering-not-registered",
      structuralCost: wasmCost,
      score: score(wasmCost),
      evidence: "resident arithmetic still requires one boxed-input copy, one output copy, and one boundary",
    },
    {
      id: "native-coarse-modular-batch",
      kind: "native",
      availability: "rejected",
      rejectionReason: "isolated-modular-batch-native-lowering-not-registered",
      structuralCost: nativeCost,
      score: score(nativeCost),
      evidence: "coarse native arithmetic still requires one boxed-input copy, one output copy, and one boundary",
    },
    {
      id: "generic-modular-batch-fallback",
      kind: "generic",
      availability: "available",
      rejectionReason: null,
      structuralCost: genericCost,
      score: "semantic-runtime-dependent",
      evidence: "the untouched indexed Python loop is the exact dynamic fallback",
    },
  ];
  const comparison: ModularBatchTargetComparison = {
    selected: "v8-complete-modular-batch",
    policy: "inclusive-unresident-boxed-batch-v1",
    dominanceReason: "v8-avoids-isolated-boundary-with-equal-required-copy",
    estimates,
    emittedV8Bytes,
  };
  return {
    ...program,
    targetComparison: comparison,
    targetCodeBytes,
  };
}
