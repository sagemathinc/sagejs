import type {
  CanonicalModularBatchProgram,
  ModularBatchOperation,
} from "../domains/modular-batch/ir";

export type {
  ModularBatchExpression,
  ModularBatchOperation,
} from "../domains/modular-batch/ir";

export const MODULAR_BATCH_REPRESENTATION = "number-residue-complete-batch.v1";
export const MAX_EXACT_MODULAR_PRODUCT_MODULUS = 94_906_266;
export const MAX_MODULAR_BATCH_CODE_BYTES = 32 * 1024;

export interface ModularIntermediateBound {
  operation: "add" | "sub" | "mul" | "neg";
  formula: string;
  maximumAtAcceptedModulus: number;
}

export interface ModularBatchExactBounds {
  modulusMinimum: 2;
  modulusMaximum: number;
  canonicalResidueMinimum: 0;
  canonicalResidueMaximum: "p - 1";
  intermediates: ModularIntermediateBound[];
}

export interface ModularBatchRepresentationPlan {
  id: typeof MODULAR_BATCH_REPRESENTATION;
  storage: "float64-number-residues";
  inputPolicy: "fully-validate-and-pack-before-compute";
  outputPolicy: "private-float64-stage-then-publish-fresh-list";
  aliasPolicy: "fresh-output-disjoint-from-read-only-inputs";
  methodGuardMask: number;
  exactBounds: ModularBatchExactBounds;
}

export interface RepresentedModularBatchProgram
  extends CanonicalModularBatchProgram {
  representation: ModularBatchRepresentationPlan;
}

function arithmeticOperations(
  operations: readonly ModularBatchOperation[],
): Array<"add" | "sub" | "mul" | "neg"> {
  return operations.filter((operation): operation is "add" | "sub" | "mul" | "neg" =>
    operation !== "coerce-integer"
  );
}

export function modularMethodGuardMask(
  operations: readonly ModularBatchOperation[],
): number {
  const bits: Record<ModularBatchOperation, number> = {
    add: 1,
    sub: 2,
    mul: 4,
    neg: 8,
    "coerce-integer": 1024,
  };
  // STREAM prevents the shared guard from mutating route state or packing
  // inputs. This plugin performs its own complete validation before writes.
  return 32 + operations.reduce((mask, operation) => mask | bits[operation], 0);
}

export function modularIntermediateBounds(
  operations: readonly ModularBatchOperation[],
): ModularBatchExactBounds {
  const used = new Set(arithmeticOperations(operations));
  const modulusMaximum = MAX_EXACT_MODULAR_PRODUCT_MODULUS;
  const residueMaximum = modulusMaximum - 1;
  const candidates: Record<string, ModularIntermediateBound> = {
    add: {
      operation: "add",
      formula: "2 * (p - 1)",
      maximumAtAcceptedModulus: 2 * residueMaximum,
    },
    sub: {
      operation: "sub",
      formula: "2 * (p - 1)",
      maximumAtAcceptedModulus: 2 * residueMaximum,
    },
    mul: {
      operation: "mul",
      formula: "(p - 1) * (p - 1)",
      maximumAtAcceptedModulus: residueMaximum * residueMaximum,
    },
    neg: {
      operation: "neg",
      formula: "p - 1",
      maximumAtAcceptedModulus: residueMaximum,
    },
  };
  return {
    modulusMinimum: 2,
    modulusMaximum,
    canonicalResidueMinimum: 0,
    canonicalResidueMaximum: "p - 1",
    intermediates: ["add", "sub", "mul", "neg"]
      .filter((operation) => used.has(operation as any))
      .map((operation) => candidates[operation]),
  };
}

/** Choose the one exact, transactional representation admitted by v1. */
export function planModularBatchRepresentation(
  program: CanonicalModularBatchProgram,
): RepresentedModularBatchProgram {
  return {
    ...program,
    representation: {
      id: MODULAR_BATCH_REPRESENTATION,
      storage: "float64-number-residues",
      inputPolicy: "fully-validate-and-pack-before-compute",
      outputPolicy: "private-float64-stage-then-publish-fresh-list",
      aliasPolicy: "fresh-output-disjoint-from-read-only-inputs",
      methodGuardMask: modularMethodGuardMask(program.operations),
      exactBounds: modularIntermediateBounds(program.operations),
    },
  };
}
