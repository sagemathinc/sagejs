import {
  eliminateDeadStores,
  statementDataFlow,
  statementsOperationCost,
} from "../analyses/scalar-program";
import {
  estimatedTargetCodeBytes,
} from "../targets/v8-scalar-cost";
import { InternalRegionPlan, OPTIMIZER_IR_SCHEMA } from "../types";
import {
  BOUNDED_INTEGER_CODE_SIZE_BUDGET,
  BOUNDED_INTEGER_INTERNAL_KIND,
  BOUNDED_INTEGER_LOWERING,
  BOUNDED_INTEGER_OPERATION_BUDGET,
  BOUNDED_INTEGER_REGION_PASS,
  MAX_EXACT_NUMBER,
} from "../domains/bounded-integer/model";

function requireIndex(value: unknown, length: number, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= length) {
    throw new TypeError(`bounded-integer ${field} is out of range`);
  }
  return Number(value);
}

function verifyExpression(
  value: any,
  slotCount: number,
  operations: Set<string>,
  constants: Set<number>,
): void {
  if (!value || typeof value !== "object") {
    throw new TypeError("bounded-integer expression must be an object");
  }
  if (value.kind === "slot") {
    requireIndex(value.slot, slotCount, "slot");
    return;
  }
  if (value.kind === "integer-constant") {
    if (!Number.isSafeInteger(value.value)) {
      throw new TypeError("bounded-integer literal exceeds the exact Number range");
    }
    constants.add(value.value);
    operations.add("coerce-integer");
    return;
  }
  if (value.kind === "neg") {
    operations.add("neg");
    verifyExpression(value.value, slotCount, operations, constants);
    return;
  }
  if (value.kind === "binary" && ["+", "-", "*"].includes(value.operator)) {
    operations.add(value.operator === "+" ? "add" :
      value.operator === "-" ? "sub" : "mul");
    verifyExpression(value.left, slotCount, operations, constants);
    verifyExpression(value.right, slotCount, operations, constants);
    return;
  }
  throw new TypeError(
    `bounded-integer expression ${value.kind ?? "<missing>"} is unhandled`,
  );
}

function verifyStatements(
  statements: any,
  slotCount: number,
  operations: Set<string>,
  constants: Set<number>,
  inplace: Set<string>,
): void {
  if (!Array.isArray(statements)) {
    throw new TypeError("bounded-integer statements must be an array");
  }
  for (const statement of statements) {
    if (statement?.kind === "assign") {
      requireIndex(statement.target, slotCount, "assignment target");
      if (!["=", "+=", "-=", "*="].includes(statement.assignmentOperator)) {
        throw new TypeError("bounded-integer assignment operator is unhandled");
      }
      if (statement.assignmentOperator !== "=") {
        const symbol = statement.assignmentOperator[0];
        const operation = symbol === "+" ? "add" : symbol === "-" ? "sub" : "mul";
        if (statement.value?.kind !== "binary" ||
            statement.value.operator !== symbol ||
            statement.value.left?.kind !== "slot" ||
            statement.value.left.slot !== statement.target) {
          throw new TypeError("bounded-integer augmented assignment is stale");
        }
        inplace.add(operation);
      }
      verifyExpression(statement.value, slotCount, operations, constants);
      continue;
    }
    if (statement?.kind !== "if" || statement.condition?.kind !== "comparison" ||
        !["==", "!="].includes(statement.condition.operator)) {
      throw new TypeError("bounded-integer control flow is unhandled");
    }
    operations.add("equal");
    verifyExpression(statement.condition.left, slotCount, operations, constants);
    verifyExpression(statement.condition.right, slotCount, operations, constants);
    verifyStatements(statement.body, slotCount, operations, constants, inplace);
    verifyStatements(statement.alternative, slotCount, operations, constants, inplace);
  }
}

function exactArray(value: unknown, expected: readonly number[], field: string): void {
  if (!Array.isArray(value) || value.length !== expected.length ||
      value.some((item, index) => item !== expected[index])) {
    throw new TypeError(`bounded-integer plan has stale ${field}`);
  }
}

/** Independently recompute every executable bounded-integer safety claim. */
export function verifyBoundedIntegerPlan(plan: InternalRegionPlan): void {
  if (plan?.schema !== OPTIMIZER_IR_SCHEMA ||
      plan.passId !== BOUNDED_INTEGER_REGION_PASS ||
      plan.loweringId !== BOUNDED_INTEGER_LOWERING ||
      plan.kind !== BOUNDED_INTEGER_INTERNAL_KIND) {
    throw new TypeError("bounded-integer plan has an invalid contract identity");
  }
  if (typeof plan.id !== "string" || plan.id.length === 0 ||
      (plan.functionId !== null && typeof plan.functionId !== "string") ||
      !["fallback", "error"].includes(plan.guardFailure)) {
    throw new TypeError("bounded-integer plan has invalid public identity fields");
  }
  const operands = plan.operands;
  if (!operands || operands.iteratorKind !== "range" ||
      !Array.isArray(operands.slots) || operands.slots.length === 0) {
    throw new TypeError("bounded-integer plan is not a scalar range region");
  }
  const slotNames = operands.slots.map((slot: any) => slot?.name);
  if (slotNames.some((name: unknown) => typeof name !== "string" || !name) ||
      new Set(slotNames).size !== slotNames.length) {
    throw new TypeError("bounded-integer plan has invalid scalar slots");
  }
  const operations = new Set<string>();
  const constants = new Set<number>();
  const inplace = new Set<string>();
  verifyStatements(
    operands.semanticStatements,
    operands.slots.length,
    operations,
    constants,
    inplace,
  );
  const loweredOperations = new Set<string>();
  const loweredConstants = new Set<number>();
  const loweredInplace = new Set<string>();
  verifyStatements(
    operands.statements,
    operands.slots.length,
    loweredOperations,
    loweredConstants,
    loweredInplace,
  );
  const observedOperations = [...operations].sort();
  if (!Array.isArray(operands.operations) ||
      JSON.stringify(operands.operations) !== JSON.stringify(observedOperations)) {
    throw new TypeError("bounded-integer plan has stale operations");
  }
  const observedConstants = [...constants].sort((left, right) => left - right);
  if (!Array.isArray(operands.integerConstants) ||
      JSON.stringify(operands.integerConstants) !== JSON.stringify(observedConstants)) {
    throw new TypeError("bounded-integer plan has stale integer constants");
  }
  if (!Array.isArray(operands.inplaceOperations) ||
      JSON.stringify([...operands.inplaceOperations].sort()) !==
        JSON.stringify([...inplace].sort())) {
    throw new TypeError("bounded-integer plan has stale in-place operations");
  }

  const dataFlow = statementDataFlow(
    operands.semanticStatements,
    operands.slots.length,
  );
  exactArray(operands.inputSlots, dataFlow.inputSlots, "input slots");
  exactArray(operands.stateSlots, dataFlow.stateSlots, "state slots");
  exactArray(operands.localSlots, dataFlow.localSlots, "local slots");
  if (dataFlow.inputSlots.length === 0 || dataFlow.localSlots.some((slot) =>
    dataFlow.stateSlots.includes(slot) && !dataFlow.definitelyAssigned.has(slot))) {
    throw new TypeError("bounded-integer plan has unsafe local data flow");
  }
  const deadStores = eliminateDeadStores(
    operands.semanticStatements,
    new Set(dataFlow.stateSlots),
  );
  if (JSON.stringify(operands.statements) !== JSON.stringify(deadStores.statements)) {
    throw new TypeError("bounded-integer plan has stale dead-store elimination");
  }
  const operationCost = statementsOperationCost(
    operands.statements,
    operands.slots.length,
  );
  if (operands.operationCost !== operationCost ||
      operationCost > BOUNDED_INTEGER_OPERATION_BUDGET) {
    throw new TypeError("bounded-integer plan has stale or excessive operation cost");
  }
  const targetCodeBytes = estimatedTargetCodeBytes(
    operands.statements,
    operands.slots.length,
  );
  // The shared planner may account for statically hoisted expressions too.
  // A larger claim is conservative for this emitter; a smaller one is stale.
  if (!Number.isSafeInteger(operands.targetCodeBytes) ||
      operands.targetCodeBytes < targetCodeBytes ||
      operands.targetCodeBytes > BOUNDED_INTEGER_CODE_SIZE_BUDGET) {
    throw new TypeError("bounded-integer plan has stale or excessive target size");
  }
  const annotations = operands.annotatedIntegerArguments;
  if (!Array.isArray(annotations) || annotations.length !== dataFlow.inputSlots.length ||
      annotations.some((witness: any, index: number) => {
        const slot = dataFlow.inputSlots[index];
        return witness?.slot !== slot ||
          witness.argument?.name !== operands.slots[slot].name ||
          witness.argument?.annotation?.name !== "int" ||
          witness.argument?.annotation_text !== "int";
      })) {
    throw new TypeError("bounded-integer plan has stale exact-int annotations");
  }
  if (operands.estimatedConversions !== dataFlow.inputSlots.length ||
      operands.estimatedMaterializations !== dataFlow.stateSlots.length) {
    throw new TypeError("bounded-integer plan has stale conversion costs");
  }
  if (!Array.isArray(operands.rangeFacts) ||
      operands.rangeFacts.length !== dataFlow.inputSlots.length + 1 ||
      operands.rangeFacts.some((fact: any) =>
        fact?.lower !== -MAX_EXACT_NUMBER || fact?.upper !== MAX_EXACT_NUMBER ||
        fact?.authority !== "runtime-guard" ||
        typeof fact?.subject !== "string" || typeof fact?.evidence !== "string")) {
    throw new TypeError("bounded-integer plan has stale exact-range facts");
  }
}
