import type { ScalarStatement } from "./scalar-program";

export const MAX_EXACT_NUMBER = 9_007_199_254_740_991;

export interface BoundedIntegerAnnotationWitness {
  slot: number;
  argument: any;
}

export interface BoundedIntegerRangeFact {
  subject: string;
  lower: number | "runtime-dependent";
  upper: number | "runtime-dependent";
  authority: "static" | "runtime-guard";
  evidence: string;
}

/** Target-independent executable schema for one proved exact-integer region. */
export interface BoundedIntegerPlan {
  iteratorKind: "range";
  count: any;
  iterator: any;
  slots: Array<{ name: string; node: any }>;
  inputSlots: number[];
  stateSlots: number[];
  localSlots: number[];
  semanticStatements: ScalarStatement[];
  statements: ScalarStatement[];
  operations: string[];
  integerConstants: number[];
  inplaceOperations: Array<"add" | "sub" | "mul">;
  annotatedIntegerArguments: BoundedIntegerAnnotationWitness[];
  rangeFacts: BoundedIntegerRangeFact[];
  operationCost: number;
  targetCodeBytes: number;
  estimatedConversions: number;
  estimatedMaterializations: number;
}

export interface BoundedIntegerExecutionResult {
  ok: boolean;
  reason: string | null;
  values: unknown[];
  iterations: number;
}
