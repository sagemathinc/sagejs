import {
  ScalarExpression,
  ScalarStatement,
} from "../ir/scalar-program";

export const STRICT_FLOAT_ARRAY_CODE_SIZE_BUDGET = 16_384;

export interface V8StrictFloatArrayTargetPlan {
  readonly targetPlanId: "target.v8-strict-float-array.v1";
  readonly sourceOperationNodes: number;
  readonly emittedOperationNodes: number;
  readonly targetCodeBytes: number;
  readonly validatesElementsBeforePublication: true;
  readonly fastMath: false;
  readonly reassociation: false;
  readonly contraction: false;
}

interface StrictFloatArrayTargetInput {
  readonly semanticStatements: readonly ScalarStatement[];
  readonly statements: readonly ScalarStatement[];
  readonly slots: readonly unknown[];
  readonly stateSlots: readonly number[];
}

function expressionOperations(expression: ScalarExpression): number {
  if (expression.kind === "slot" || expression.kind === "sequence" ||
      expression.kind === "integer-constant") return 0;
  if (expression.kind === "neg" || expression.kind === "power") {
    return 1 + expressionOperations(expression.value);
  }
  return 1 + expressionOperations(expression.left) +
    expressionOperations(expression.right);
}

function statementOperations(statements: readonly ScalarStatement[]): number {
  let total = 0;
  for (const statement of statements) {
    if (statement.kind === "assign") {
      total += expressionOperations(statement.value);
    } else {
      total += 1 + expressionOperations(statement.condition.left) +
        expressionOperations(statement.condition.right) +
        statementOperations(statement.body) +
        statementOperations(statement.alternative);
    }
  }
  return total;
}

/** Price the isolated V8 emitter without applying algebraic rewrites. */
export function planV8StrictFloatArrayTarget(
  program: StrictFloatArrayTargetInput,
): V8StrictFloatArrayTargetPlan | null {
  const sourceOperationNodes = statementOperations(program.semanticStatements);
  const emittedOperationNodes = statementOperations(program.statements);
  const targetCodeBytes = 1_536 + program.slots.length * 64 +
    emittedOperationNodes * 128 + program.stateSlots.length * 96;
  if (targetCodeBytes > STRICT_FLOAT_ARRAY_CODE_SIZE_BUDGET) return null;
  return Object.freeze({
    targetPlanId: "target.v8-strict-float-array.v1",
    sourceOperationNodes,
    emittedOperationNodes,
    targetCodeBytes,
    validatesElementsBeforePublication: true,
    fastMath: false,
    reassociation: false,
    contraction: false,
  });
}
