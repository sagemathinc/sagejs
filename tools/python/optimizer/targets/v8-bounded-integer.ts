import type {
  ScalarExpression,
  ScalarStatement,
} from "../ir/scalar-program";
import {
  BoundedIntegerExecutionResult,
  BoundedIntegerPlan,
} from "../domains/bounded-integer/model";
import {
  boundedIntegerRepresentation,
  isBoundedExactNumber,
} from "../representations/bounded-integer";

export interface BoundedIntegerExecutionOptions {
  pollInterrupt?: () => void;
  interruptInterval?: number;
}

export function planV8BoundedIntegerTarget(plan: BoundedIntegerPlan) {
  const representation = boundedIntegerRepresentation(plan);
  return Object.freeze({
    id: "v8-checked-bounded-integer",
    representation,
    arithmeticOperations: plan.operationCost,
    emittedBytes: plan.targetCodeBytes,
    guards: Object.freeze([
      "primitive-exact-number-live-ins",
      "checked-exact-intermediates",
      "transactional-publication",
    ]),
  });
}

/**
 * Executable model of the V8 target contract used by differential and
 * adversarial tests.  The production emitter consumes the same verified plan.
 */
export function runCheckedBoundedIntegerPlan(
  plan: BoundedIntegerPlan,
  count: unknown,
  inputValues: readonly unknown[],
  options: BoundedIntegerExecutionOptions = {},
): BoundedIntegerExecutionResult {
  if (!isBoundedExactNumber(count) || count < 0) {
    return { ok: false, reason: "invalid-iteration-count", values: [...inputValues], iterations: 0 };
  }
  if (count === 0) {
    return { ok: true, reason: null, values: [...inputValues], iterations: 0 };
  }
  if (inputValues.length !== plan.inputSlots.length ||
      inputValues.some((value) => !isBoundedExactNumber(value))) {
    return { ok: false, reason: "live-in-not-exact-number", values: [...inputValues], iterations: 0 };
  }
  const slots: unknown[] = new Array(plan.slots.length);
  for (let index = 0; index < plan.inputSlots.length; index += 1) {
    slots[plan.inputSlots[index]] = inputValues[index];
  }
  let valid = true;
  let reason: string | null = null;
  const reject = (failure: string): number => {
    valid = false;
    reason ??= failure;
    return 0;
  };
  const expression = (value: ScalarExpression): number => {
    if (value.kind === "slot") {
      const current = slots[value.slot];
      return isBoundedExactNumber(current)
        ? current
        : reject("uninitialized-local");
    }
    if (value.kind === "integer-constant") return value.value;
    if (value.kind === "sequence") return reject("unverified-sequence");
    if (value.kind === "power") return reject("unverified-power");
    if (value.kind === "neg") {
      const result = -expression(value.value);
      return valid && isBoundedExactNumber(result)
        ? result
        : reject("intermediate-overflow");
    }
    const left = expression(value.left);
    const right = expression(value.right);
    const result = value.operator === "+" ? left + right :
      value.operator === "-" ? left - right : left * right;
    return valid && isBoundedExactNumber(result)
      ? result
      : reject("intermediate-overflow");
  };
  const statements = (source: readonly ScalarStatement[]): void => {
    for (const statement of source) {
      if (!valid) return;
      if (statement.kind === "assign") {
        const result = expression(statement.value);
        if (valid) slots[statement.target] = result;
        continue;
      }
      const left = expression(statement.condition.left);
      const right = expression(statement.condition.right);
      if (!valid) return;
      const matches = left === right;
      statements(
        statement.condition.operator === "==" ?
          (matches ? statement.body : statement.alternative) :
          (matches ? statement.alternative : statement.body),
      );
    }
  };
  const interval = options.interruptInterval ?? 256;
  let completed = 0;
  for (; completed < count && valid; completed += 1) {
    if (options.pollInterrupt && (completed + 1) % interval === 0) {
      options.pollInterrupt();
    }
    statements(plan.statements);
  }
  if (!valid) {
    return {
      ok: false,
      reason,
      values: [...inputValues],
      iterations: completed,
    };
  }
  return {
    ok: true,
    reason: null,
    values: plan.stateSlots.map((slot) => slots[slot]),
    iterations: completed,
  };
}
