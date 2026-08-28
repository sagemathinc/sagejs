import { InternalRegionPlan, OPTIMIZER_IR_SCHEMA } from "../types";
import { verifyScalarInternalRegionPlan } from "./scalar-plan";

const PASS_ID = "math.fixed-extension-region.v1";
const LOWERING_ID = "v8.fixed-extension-loop.v1";
const DEGREES = [2, 3, 4] as const;
const RUNTIME_MAX_PRIME = 200_000;
const VARIANT_BASE_BYTES = 1024;
const BYTES_PER_CODE_UNIT = 128;
const BYTES_PER_COMPILE_UNIT = 256;
const VARIANT_CODE_BUDGET = 32 * 1024;
const VARIANT_COMPILE_BUDGET = 128;
const DISPATCH_BYTES = 1536;
const TOTAL_CODE_BUDGET = 100 * 1024;
const CONSTRUCTION_CONTEXT = "finite-field-extension-construction-context.v1";
const CONSTRUCTION_CONTEXT_PROPERTY = "_machineExtensionImmutableContext";
const MODULUS_IDENTITY_AUTHENTICATION =
  "construction-time-modulus-identity.v1";
const CONTEXT_RUNTIME_HELPER = "runtime.machine_extension_context_matches";
const CONTEXT_INTRINSIC = "ρσ_machine_extension_context_matches";

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`fixed-extension ${field} must be a nonempty string`);
  }
}

function integerSquareRoot(value: bigint): bigint {
  if (value < 2n) return value;
  let current = 1n << (BigInt(value.toString(2).length) + 1n) / 2n;
  while (true) {
    const next = (current + value / current) / 2n;
    if (next >= current) return current;
    current = next;
  }
}

function structuralKey(expression: any, versions: number[]): string {
  if (expression.kind === "slot") {
    return `slot:${expression.slot}@${versions[expression.slot] ?? 0}`;
  }
  if (expression.kind === "sequence") {
    return `sequence:${expression.sequence}:${expression.indexOrder}`;
  }
  if (expression.kind === "integer-constant") {
    return `integer:${expression.value}`;
  }
  if (expression.kind === "neg") {
    return `neg(${structuralKey(expression.value, versions)})`;
  }
  if (expression.kind === "power") {
    return `power:${expression.exponent}(${structuralKey(expression.value, versions)})`;
  }
  if (expression.kind === "binary" &&
      (expression.operator === "+" || expression.operator === "*")) {
    const operands: string[] = [];
    const collect = (operand: any): void => {
      if (operand.kind === "binary" && operand.operator === expression.operator) {
        collect(operand.left);
        collect(operand.right);
      } else {
        operands.push(structuralKey(operand, versions));
      }
    };
    collect(expression.left);
    collect(expression.right);
    operands.sort();
    return `associative:${expression.operator}(${operands.join(",")})`;
  }
  if (expression.kind === "binary" && expression.operator === "-") {
    return `binary:-(${structuralKey(expression.left, versions)},${structuralKey(expression.right, versions)})`;
  }
  throw new TypeError("fixed-extension verifier found an unknown expression");
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
  expression: any,
  degree: number,
  common: Set<string>,
  versions: number[],
): number {
  if (expression.kind === "slot" || expression.kind === "sequence" ||
      expression.kind === "integer-constant") return 0;
  const key = structuralKey(expression, versions);
  if (common.has(key)) return 0;
  common.add(key);
  if (expression.kind === "neg") {
    return degree + expressionCodeUnits(
      expression.value,
      degree,
      common,
      versions,
    );
  }
  if (expression.kind === "binary") {
    return (expression.operator === "*" ? 2 * degree * degree : degree) +
      expressionCodeUnits(expression.left, degree, common, versions) +
      expressionCodeUnits(expression.right, degree, common, versions);
  }
  if (expression.kind !== "power") {
    throw new TypeError("fixed-extension verifier found an unknown operation");
  }
  const products = powerProductCount(expression.exponent);
  return (products > 1 ? 2 * degree : 2 * degree * degree * products) +
    expressionCodeUnits(expression.value, degree, common, versions);
}

function statementsCodeUnits(
  statements: any[],
  degree: number,
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
    if (statement.kind !== "if") {
      throw new TypeError("fixed-extension verifier found an unknown statement");
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

function independentlyEstimatedCodeUnits(operands: any, degree: number): number {
  const common = new Set<string>();
  const versions = new Array(operands.slots.length).fill(0);
  let total = 0;
  for (const expression of operands.hoistedExpressions) {
    total += expressionCodeUnits(expression, degree, common, versions);
  }
  return total + statementsCodeUnits(
    operands.statements,
    degree,
    operands.slots.length,
    versions,
    new Set(common),
    new Set(common),
  );
}

function verifyRepresentationVariant(variant: any, degree: number): void {
  const theoreticalMaximumPrime = Number(
    integerSquareRoot(BigInt(Number.MAX_SAFE_INTEGER) / BigInt(degree)) + 1n,
  );
  const admittedMaximumPrime = Math.min(
    RUNTIME_MAX_PRIME,
    theoreticalMaximumPrime,
  );
  const coefficientWidth = BigInt(admittedMaximumPrime - 1);
  const exactIntermediateMaximum = Number(
    BigInt(degree) * coefficientWidth * coefficientWidth,
  );
  if (variant?.id !==
      `extension-tuple-number.degree-${degree}.monic-polynomial-basis.v1` ||
      variant.representationId !== "extension-tuple-number.fixed-shape.v1" ||
      variant.degree !== degree || variant.tupleWidth !== degree ||
      variant.modulusShape?.basis !== "polynomial" ||
      variant.modulusShape?.leadingCoefficient !== 1 ||
      variant.modulusShape?.storedCoefficientCount !== degree ||
      variant.modulusShape?.coefficientOrder !== "ascending") {
    throw new TypeError(`fixed-extension degree ${degree} has a stale representation shape`);
  }
  const proof = variant.exactness;
  if (proof?.degree !== degree || proof.coefficientMinimum !== 0 ||
      proof.coefficientMaximum !== admittedMaximumPrime - 1 ||
      proof.convolutionTermCount !== degree ||
      proof.reductionCorrectionCount !== degree * (degree - 1) ||
      proof.exactIntermediateMaximum !== exactIntermediateMaximum ||
      proof.theoreticalMaximumPrime !== theoreticalMaximumPrime ||
      proof.admittedMaximumPrime !== admittedMaximumPrime ||
      proof.derivation !==
        "degree * (prime - 1)^2 <= Number.MAX_SAFE_INTEGER" ||
      BigInt(exactIntermediateMaximum) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`fixed-extension degree ${degree} has a stale exactness proof`);
  }
}

function verifyTargetVariant(variant: any, operands: any, degree: number): number {
  const codeUnits = independentlyEstimatedCodeUnits(operands, degree);
  const emittedBytes = VARIANT_BASE_BYTES + BYTES_PER_CODE_UNIT * codeUnits;
  const compileCostUnits = Math.ceil(emittedBytes / BYTES_PER_COMPILE_UNIT);
  const representation = operands.fixedExtension.representation.variants.find(
    (candidate: any) => candidate.degree === degree,
  );
  if (variant?.id !== `v8.fixed-extension.degree-${degree}.v1` ||
      variant.degree !== degree ||
      variant.representationId !== "extension-tuple-number.fixed-shape.v1" ||
      variant.modulusShapeId !== representation?.id ||
      variant.outlineId !==
        `v8-fixed-extension-degree-${degree}-outline-v1` ||
      variant.exactIntermediateMaximum !==
        representation?.exactness?.exactIntermediateMaximum ||
      variant.admittedMaximumPrime !==
        representation?.exactness?.admittedMaximumPrime ||
      variant.codeUnits !== codeUnits || variant.emittedBytes !== emittedBytes ||
      variant.codeBudgetBytes !== VARIANT_CODE_BUDGET ||
      variant.compileCostUnits !== compileCostUnits ||
      variant.compileBudgetUnits !== VARIANT_COMPILE_BUDGET) {
    throw new TypeError(`fixed-extension degree ${degree} has stale target budgets`);
  }
  if (emittedBytes > VARIANT_CODE_BUDGET ||
      compileCostUnits > VARIANT_COMPILE_BUDGET) {
    throw new TypeError(`fixed-extension degree ${degree} exceeds its target budget`);
  }
  return emittedBytes;
}

/** Independently validate the scalar graph, shape proofs, and every outline. */
export function verifyFixedExtensionInternalRegionPlan(
  plan: InternalRegionPlan,
): void {
  if (plan?.schema !== OPTIMIZER_IR_SCHEMA || plan.passId !== PASS_ID ||
      plan.loweringId !== LOWERING_ID || plan.kind !== "fixed-extension-region") {
    throw new TypeError("fixed-extension plan has an invalid contract identity");
  }
  requireString(plan.id, "internal.id");
  if (plan.functionId !== null) requireString(plan.functionId, "internal.functionId");
  if (plan.guardFailure !== "fallback" && plan.guardFailure !== "error") {
    throw new TypeError("fixed-extension plan has an invalid guard policy");
  }
  if (!plan.operands || typeof plan.operands !== "object") {
    throw new TypeError("fixed-extension plan has no operands");
  }

  // The scalar verifier remains independently responsible for source graph,
  // liveness, alias, power-cost, sequence, and control-flow claims.  Rebinding
  // only the plugin identity lets that verifier inspect the unchanged graph;
  // the fixed-extension-specific proof is recomputed below.
  verifyScalarInternalRegionPlan({
    ...plan,
    passId: "math.closed-ring-region.v1",
    loweringId: "v8.closed-ring-loop.v1",
    kind: "closed-ring-region",
  });

  const fixed = plan.operands.fixedExtension;
  const representation = fixed?.representation;
  if (representation?.id !== "fixed-extension-representation-plan.v1" ||
      representation.dispatch !== "guarded-degree-before-effects" ||
      !Array.isArray(representation.variants) ||
      representation.variants.length !== DEGREES.length) {
    throw new TypeError("fixed-extension plan has an invalid representation table");
  }
  const runtimeContext = representation.runtimeContext;
  if (runtimeContext?.id !== CONSTRUCTION_CONTEXT ||
      runtimeContext.parentProperty !== CONSTRUCTION_CONTEXT_PROPERTY ||
      runtimeContext.descriptor !==
        "own-nonwritable-nonconfigurable-data" ||
      runtimeContext.sourceModulusIdentity !==
        "construction-list-object-identity" ||
      runtimeContext.machineModulusIdentity !==
        "construction-tuple-object-identity" ||
      runtimeContext.preparedContextProperty !== "constructionContext" ||
      runtimeContext.preparedAuthenticationProperty !==
        "modulusIdentityAuthentication" ||
      runtimeContext.preparedAuthenticationValue !==
        MODULUS_IDENTITY_AUTHENTICATION ||
      runtimeContext.runtimeHelper !== CONTEXT_RUNTIME_HELPER ||
      runtimeContext.intrinsic !== CONTEXT_INTRINSIC) {
    throw new TypeError("fixed-extension plan has a stale construction context guard");
  }
  for (let index = 0; index < DEGREES.length; index += 1) {
    verifyRepresentationVariant(representation.variants[index], DEGREES[index]);
  }

  const target = fixed.target;
  if (target?.id !== "v8.fixed-extension-target-plan.v1" ||
      target.loweringId !== LOWERING_ID ||
      target.dispatch !== "entry-guarded-degree-switch" ||
      target.dispatchBytes !== DISPATCH_BYTES ||
      target.totalCodeBudgetBytes !== TOTAL_CODE_BUDGET ||
      !Array.isArray(target.variants) ||
      target.variants.length !== DEGREES.length) {
    throw new TypeError("fixed-extension plan has an invalid target table");
  }
  let totalEmittedBytes = DISPATCH_BYTES;
  for (let index = 0; index < DEGREES.length; index += 1) {
    totalEmittedBytes += verifyTargetVariant(
      target.variants[index],
      plan.operands,
      DEGREES[index],
    );
  }
  if (target.totalEmittedBytes !== totalEmittedBytes ||
      totalEmittedBytes > TOTAL_CODE_BUDGET) {
    throw new TypeError("fixed-extension plan has a stale total code-size budget");
  }
}
