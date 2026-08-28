import {
  CanonicalScalarProgram,
  RecognizedScalarProgram,
  ScalarExpression as ExpressionPlan,
  ScalarStatement as StatementPlan,
} from "../ir/scalar-program";
import { expressionStructuralKey } from "../analyses/scalar-program";

const TARGET_CODE_BASE_BYTES = 1024;
const TARGET_CODE_BYTES_PER_UNIT = 128;
export const MAX_TARGET_CODE_BYTES = 32768;

/** Attach a V8-specific emitted-code estimate to target-neutral scalar IR. */
export function planV8ScalarCost(
  program: CanonicalScalarProgram,
): RecognizedScalarProgram {
  return {
    ...program,
    targetCodeBytes: estimatedTargetCodeBytes(
      program.statements,
      program.slots.length,
      program.hoistedExpressions,
    ),
  };
}

export function powerProductCount(exponent: number): number {
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

/** Conservatively price one outlined degree-four target compilation unit. */
function expressionTargetCodeUnits(
  value: ExpressionPlan,
  common: Set<string>,
  versions: number[],
): number {
  if (value.kind === "slot" || value.kind === "sequence" ||
      value.kind === "integer-constant") return 0;
  const key = expressionStructuralKey(value, versions);
  if (common.has(key)) return 0;
  common.add(key);
  if (value.kind === "neg") {
    return 4 + expressionTargetCodeUnits(value.value, common, versions);
  }
  if (value.kind === "binary") {
    return (value.operator === "*" ? 32 : 4) +
      expressionTargetCodeUnits(value.left, common, versions) +
      expressionTargetCodeUnits(value.right, common, versions);
  }
  const products = powerProductCount(value.exponent);
  return (products > 1 ? 8 : 32 * products) +
    expressionTargetCodeUnits(value.value, common, versions);
}

function statementsTargetCodeUnits(
  statements: StatementPlan[],
  slotCount: number,
  versions = new Array(slotCount).fill(0),
  common = new Set<string>(),
  persistent = new Set<string>(),
): number {
  let total = 0;
  for (const statement of statements) {
    if (statement.kind === "assign") {
      total += expressionTargetCodeUnits(statement.value, common, versions);
      versions[statement.target] += 1;
      continue;
    }
    total += 4 + expressionTargetCodeUnits(
      statement.condition.left, common, versions,
    ) + expressionTargetCodeUnits(statement.condition.right, common, versions);
    const bodyVersions = [...versions];
    const alternativeVersions = [...versions];
    total += statementsTargetCodeUnits(
      statement.body, slotCount, bodyVersions, new Set(common), persistent,
    );
    total += statementsTargetCodeUnits(
      statement.alternative, slotCount, alternativeVersions, new Set(common), persistent,
    );
    for (let slot = 0; slot < slotCount; slot += 1) {
      versions[slot] = Math.max(bodyVersions[slot], alternativeVersions[slot]);
    }
    common.clear();
    for (const key of persistent) common.add(key);
  }
  return total;
}

export function estimatedTargetCodeBytes(
  statements: StatementPlan[],
  slotCount: number,
  hoisted: ExpressionPlan[] = [],
): number {
  const common = new Set<string>();
  let units = 0;
  const versions = new Array(slotCount).fill(0);
  for (const expression of hoisted) {
    units += expressionTargetCodeUnits(expression, common, versions);
  }
  const persistent = new Set(common);
  units += statementsTargetCodeUnits(
    statements, slotCount, versions, new Set(common), persistent,
  );
  return TARGET_CODE_BASE_BYTES +
    TARGET_CODE_BYTES_PER_UNIT * units;
}
