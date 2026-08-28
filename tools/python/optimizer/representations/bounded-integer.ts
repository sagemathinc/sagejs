import {
  BoundedIntegerPlan,
  MAX_EXACT_NUMBER,
} from "../domains/bounded-integer/model";

export const BOUNDED_INTEGER_REPRESENTATION =
  "checked-javascript-number";

export interface BoundedIntegerRepresentationPlan {
  id: typeof BOUNDED_INTEGER_REPRESENTATION;
  exactLower: number;
  exactUpper: number;
  entryConversions: number;
  resultMaterializations: number;
  copiedBytes: 0;
  boundaryCrossings: 0;
  publication: "transactional";
  overflowPolicy: "restart-exact-fallback";
}

/** Derive representation costs only from a complete semantic plan. */
export function boundedIntegerRepresentation(
  plan: BoundedIntegerPlan,
): BoundedIntegerRepresentationPlan {
  return Object.freeze({
    id: BOUNDED_INTEGER_REPRESENTATION,
    exactLower: -MAX_EXACT_NUMBER,
    exactUpper: MAX_EXACT_NUMBER,
    entryConversions: plan.estimatedConversions,
    resultMaterializations: plan.estimatedMaterializations,
    copiedBytes: 0,
    boundaryCrossings: 0,
    publication: "transactional",
    overflowPolicy: "restart-exact-fallback",
  });
}

/**
 * Authenticate a primitive exact Number without relying on a mutable runtime
 * intrinsic such as `Number.isSafeInteger`.
 */
export function isBoundedExactNumber(value: unknown): value is number {
  return typeof value === "number" && value === value && value % 1 === 0 &&
    value >= -MAX_EXACT_NUMBER && value <= MAX_EXACT_NUMBER &&
    1 / value !== -Infinity;
}
