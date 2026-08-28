export {
  MAX_EXACT_NUMBER,
} from "../../ir/bounded-integer";
export type {
  BoundedIntegerAnnotationWitness,
  BoundedIntegerExecutionResult,
  BoundedIntegerPlan,
  BoundedIntegerRangeFact,
} from "../../ir/bounded-integer";

export const BOUNDED_INTEGER_REGION_PASS =
  "math.bounded-integer-region.v1";
export const BOUNDED_INTEGER_DOMAIN = "bounded-exact-integer";
export const BOUNDED_INTEGER_LOWERING = "v8.bounded-integer-loop.v1";
export const BOUNDED_INTEGER_INTERNAL_KIND = "bounded-integer-region";
export const BOUNDED_INTEGER_VERIFIER = "verify.bounded-integer-plan.v1";

export const BOUNDED_INTEGER_PLUGIN_PRIORITY = 300;
export const BOUNDED_INTEGER_OPERATION_BUDGET = 32;
export const BOUNDED_INTEGER_CODE_SIZE_BUDGET = 16_384;

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
