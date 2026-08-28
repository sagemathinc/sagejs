import {
  ScalarAffineTarget as AffineTargetPlan,
  ScalarExpression as ExpressionPlan,
  ScalarStatement as StatementPlan,
} from "../ir/scalar-program";

export function affineTarget(
  statements: StatementPlan[],
  stateSlots: number[],
): AffineTargetPlan | null {
  if (statements.length !== 1 || stateSlots.length !== 1) return null;
  const statement = statements[0];
  if (statement.kind !== "assign" || statement.target !== stateSlots[0]) return null;
  const combination = statement.value;
  if (combination.kind !== "binary" ||
      (combination.operator !== "+" && combination.operator !== "-")) return null;

  const multiplicationWithAccumulator = (candidate: ExpressionPlan) => {
    if (candidate.kind !== "binary" || candidate.operator !== "*" ||
        candidate.left.kind !== "slot" || candidate.right.kind !== "slot") {
      return null;
    }
    if (candidate.left.slot === statement.target &&
        candidate.right.slot !== statement.target) return candidate.right.slot;
    if (candidate.right.slot === statement.target &&
        candidate.left.slot !== statement.target) return candidate.left.slot;
    return null;
  };

  let multiplierSlot = multiplicationWithAccumulator(combination.left);
  let increment = combination.right;
  let incrementOperator: "add" | "subtract" =
    combination.operator === "+" ? "add" : "subtract";
  if (multiplierSlot === null && combination.operator === "+") {
    multiplierSlot = multiplicationWithAccumulator(combination.right);
    increment = combination.left;
    incrementOperator = "add";
  }
  if (multiplierSlot === null ||
      (increment.kind !== "slot" && increment.kind !== "sequence")) return null;
  if (increment.kind === "sequence") {
    return {
      kind: "sequence-increment",
      accumulatorSlot: statement.target,
      multiplierSlot,
      incrementSequence: increment.sequence,
      incrementOperator,
    };
  }
  // The isolated recurrence ABI currently implements `x*a+b`.  Other fixed
  // affine signs remain in the general operation graph until that ABI has an
  // explicit signed-increment contract.
  if (incrementOperator !== "add") return null;
  const slots = [statement.target, multiplierSlot, increment.slot];
  if (new Set(slots).size !== slots.length) return null;
  return {
    kind: "fixed-increment",
    accumulatorSlot: statement.target,
    multiplierSlot,
    incrementSlot: increment.slot,
  };
}

