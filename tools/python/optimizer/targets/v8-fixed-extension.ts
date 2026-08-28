import { expressionStructuralKey } from "../analyses/scalar-program";
import {
  RecognizedScalarProgram,
  ScalarExpression,
  ScalarStatement,
} from "../ir/scalar-program";
import {
  FixedExtensionRepresentationPlan,
  FixedExtensionRepresentationVariant,
  planFixedExtensionRepresentation,
} from "../representations/fixed-extension";

type FixedExtensionDegree = FixedExtensionRepresentationVariant["degree"];

export const FIXED_EXTENSION_VARIANT_CODE_BUDGET_BYTES = 32 * 1024;
export const FIXED_EXTENSION_TOTAL_CODE_BUDGET_BYTES = 100 * 1024;
export const FIXED_EXTENSION_VARIANT_COMPILE_BUDGET_UNITS = 128;

const VARIANT_BASE_BYTES = 1024;
const BYTES_PER_CODE_UNIT = 128;
const BYTES_PER_COMPILE_UNIT = 256;
const DISPATCH_BYTES = 1536;

export interface FixedExtensionV8Variant {
  readonly id: string;
  readonly degree: FixedExtensionDegree;
  readonly representationId: string;
  readonly modulusShapeId: string;
  readonly outlineId: string;
  readonly exactIntermediateMaximum: number;
  readonly admittedMaximumPrime: number;
  readonly codeUnits: number;
  readonly emittedBytes: number;
  readonly codeBudgetBytes: number;
  readonly compileCostUnits: number;
  readonly compileBudgetUnits: number;
}

export interface FixedExtensionV8TargetPlan {
  readonly id: "v8.fixed-extension-target-plan.v1";
  readonly loweringId: "v8.fixed-extension-loop.v1";
  readonly dispatch: "entry-guarded-degree-switch";
  readonly variants: readonly FixedExtensionV8Variant[];
  readonly dispatchBytes: number;
  readonly totalEmittedBytes: number;
  readonly totalCodeBudgetBytes: number;
}

function powerProductCount(exponent: number): number {
  let products = 0;
  let hasResult = false;
  while (exponent > 0) {
    if (exponent % 2 === 1) {
      if (hasResult) products += 1;
      hasResult = true;
    }
    exponent = Math.floor(exponent / 2);
    if (exponent > 0) products += 1;
  }
  return products;
}

function expressionCodeUnits(
  value: ScalarExpression,
  degree: FixedExtensionDegree,
  common: Set<string>,
  versions: number[],
): number {
  if (value.kind === "slot" || value.kind === "sequence" ||
      value.kind === "integer-constant") return 0;
  const key = expressionStructuralKey(value, versions);
  if (common.has(key)) return 0;
  common.add(key);
  if (value.kind === "neg") {
    return degree + expressionCodeUnits(value.value, degree, common, versions);
  }
  if (value.kind === "binary") {
    const operationUnits = value.operator === "*"
      ? 2 * degree * degree
      : degree;
    return operationUnits +
      expressionCodeUnits(value.left, degree, common, versions) +
      expressionCodeUnits(value.right, degree, common, versions);
  }
  const products = powerProductCount(value.exponent);
  // Multi-product powers call one bounded helper rather than duplicating the
  // complete scalar multiplication schedule for every exponent bit.
  const operationUnits = products > 1
    ? 2 * degree
    : 2 * degree * degree * products;
  return operationUnits +
    expressionCodeUnits(value.value, degree, common, versions);
}

function statementsCodeUnits(
  statements: readonly ScalarStatement[],
  degree: FixedExtensionDegree,
  slotCount: number,
  versions: number[],
  common: Set<string>,
  persistent: Set<string>,
): number {
  let total = 0;
  for (const statement of statements) {
    if (statement.kind === "assign") {
      total += expressionCodeUnits(statement.value, degree, common, versions);
      versions[statement.target] += 1;
      continue;
    }
    total += 2 * degree +
      expressionCodeUnits(statement.condition.left, degree, common, versions) +
      expressionCodeUnits(statement.condition.right, degree, common, versions);
    const bodyVersions = [...versions];
    const alternativeVersions = [...versions];
    total += statementsCodeUnits(
      statement.body,
      degree,
      slotCount,
      bodyVersions,
      new Set(common),
      persistent,
    );
    total += statementsCodeUnits(
      statement.alternative,
      degree,
      slotCount,
      alternativeVersions,
      new Set(common),
      persistent,
    );
    for (let slot = 0; slot < slotCount; slot += 1) {
      versions[slot] = Math.max(bodyVersions[slot], alternativeVersions[slot]);
    }
    common.clear();
    for (const key of persistent) common.add(key);
  }
  return total;
}

export function fixedExtensionVariantCodeUnits(
  program: RecognizedScalarProgram,
  degree: FixedExtensionDegree,
): number {
  const common = new Set<string>();
  const versions = new Array(program.slots.length).fill(0);
  let units = 0;
  for (const expression of program.hoistedExpressions) {
    units += expressionCodeUnits(expression, degree, common, versions);
  }
  units += statementsCodeUnits(
    program.statements,
    degree,
    program.slots.length,
    versions,
    new Set(common),
    new Set(common),
  );
  return units;
}

function targetVariant(
  program: RecognizedScalarProgram,
  representation: FixedExtensionRepresentationVariant,
): FixedExtensionV8Variant {
  const codeUnits = fixedExtensionVariantCodeUnits(program, representation.degree);
  const emittedBytes = VARIANT_BASE_BYTES + BYTES_PER_CODE_UNIT * codeUnits;
  return Object.freeze({
    id: `v8.fixed-extension.degree-${representation.degree}.v1`,
    degree: representation.degree,
    representationId: representation.representationId,
    modulusShapeId: representation.id,
    outlineId: `v8-fixed-extension-degree-${representation.degree}-outline-v1`,
    exactIntermediateMaximum: representation.exactness.exactIntermediateMaximum,
    admittedMaximumPrime: representation.exactness.admittedMaximumPrime,
    codeUnits,
    emittedBytes,
    codeBudgetBytes: FIXED_EXTENSION_VARIANT_CODE_BUDGET_BYTES,
    compileCostUnits: Math.ceil(emittedBytes / BYTES_PER_COMPILE_UNIT),
    compileBudgetUnits: FIXED_EXTENSION_VARIANT_COMPILE_BUDGET_UNITS,
  });
}

/**
 * Plan separately outlined monomorphic V8 bodies.  `null` means the complete
 * source region stays dynamic; no over-budget subset of degrees is emitted.
 */
export function planV8FixedExtensionTarget(
  program: RecognizedScalarProgram,
  representation: FixedExtensionRepresentationPlan =
    planFixedExtensionRepresentation(),
): FixedExtensionV8TargetPlan | null {
  const variants = representation.variants.map((variant) =>
    targetVariant(program, variant)
  );
  if (variants.some((variant) =>
    variant.emittedBytes > variant.codeBudgetBytes ||
    variant.compileCostUnits > variant.compileBudgetUnits
  )) return null;
  const totalEmittedBytes = DISPATCH_BYTES + variants.reduce(
    (total, variant) => total + variant.emittedBytes,
    0,
  );
  if (totalEmittedBytes > FIXED_EXTENSION_TOTAL_CODE_BUDGET_BYTES) return null;
  return Object.freeze({
    id: "v8.fixed-extension-target-plan.v1" as const,
    loweringId: "v8.fixed-extension-loop.v1" as const,
    dispatch: "entry-guarded-degree-switch" as const,
    variants: Object.freeze(variants),
    dispatchBytes: DISPATCH_BYTES,
    totalEmittedBytes,
    totalCodeBudgetBytes: FIXED_EXTENSION_TOTAL_CODE_BUDGET_BYTES,
  });
}
