import type {
  ScalarStatement,
} from "../../ir/scalar-program";

export const BOUNDED_INTEGER_REGION_PASS =
  "math.bounded-integer-region.v1";
export const BOUNDED_INTEGER_DOMAIN = "bounded-exact-integer";
export const BOUNDED_INTEGER_LOWERING = "v8.bounded-integer-loop.v1";
export const BOUNDED_INTEGER_INTERNAL_KIND = "bounded-integer-region";
export const BOUNDED_INTEGER_VERIFIER = "verify.bounded-integer-plan.v1";

export const BOUNDED_INTEGER_PLUGIN_PRIORITY = 300;
export const BOUNDED_INTEGER_OPERATION_BUDGET = 32;
export const BOUNDED_INTEGER_CODE_SIZE_BUDGET = 16_384;
export const MAX_EXACT_NUMBER = 9_007_199_254_740_991;

export const BOUNDED_INTEGER_REASONS = Object.freeze({
  annotation: "bounded-integer.unproved-live-in",
  buffer: "bounded-integer.mutable-buffer-access",
  call: "bounded-integer.dynamic-call",
  control: "bounded-integer.unsupported-control-flow",
  iterator: "bounded-integer.unsupported-iterator",
  operation: "bounded-integer.unsupported-operation",
  power: "bounded-integer.unsupported-power",
  sequence: "bounded-integer.unproved-sequence",
  size: "bounded-integer.code-size-budget",
  catchableInterrupt: "catchable-interrupt-region",
} as const);

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

export interface BoundedIntegerObservation {
  operations: string[];
  unsupportedOperations: string[];
  annotatedInputs: string[];
  mutableAccesses: number;
  dynamicCalls: number;
  estimatedConversions: number | "runtime-dependent";
  estimatedMaterializations: number | "runtime-dependent";
  estimatedCopiedBytes: number | "runtime-dependent";
  reasons: string[];
}

export interface BoundedIntegerExecutionResult {
  ok: boolean;
  reason: string | null;
  values: unknown[];
  iterations: number;
}
