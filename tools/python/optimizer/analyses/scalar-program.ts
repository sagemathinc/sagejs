import {
  ScalarExpression as ExpressionPlan,
  ScalarStatement as StatementPlan,
} from "../ir/scalar-program";

export function collectExpressionSlots(value: ExpressionPlan, slots: Set<number>): void {
  if (value.kind === "slot") {
    slots.add(value.slot);
  } else if (value.kind === "binary") {
    collectExpressionSlots(value.left, slots);
    collectExpressionSlots(value.right, slots);
  } else if (value.kind === "neg" || value.kind === "power") {
    collectExpressionSlots(value.value, slots);
  }
}

export function expressionContainsRingValue(value: ExpressionPlan): boolean {
  if (value.kind === "slot" || value.kind === "sequence") return true;
  if (value.kind === "integer-constant") return false;
  if (value.kind === "neg" || value.kind === "power") {
    return expressionContainsRingValue(value.value);
  }
  return expressionContainsRingValue(value.left) ||
    expressionContainsRingValue(value.right);
}

export function statementDataFlow(statements: StatementPlan[], slotCount: number): {
  inputSlots: number[];
  stateSlots: number[];
  localSlots: number[];
  definitelyAssigned: Set<number>;
} {
  const inputs = new Set<number>();
  const modified = new Set<number>();
  const analyze = (source: StatementPlan[], incoming: Set<number>): Set<number> => {
    let assigned = new Set(incoming);
    const readExpression = (value: ExpressionPlan): void => {
      const reads = new Set<number>();
      collectExpressionSlots(value, reads);
      for (const slot of reads) {
        if (!assigned.has(slot)) inputs.add(slot);
      }
    };
    for (const statement of source) {
      if (statement.kind === "assign") {
        readExpression(statement.value);
        modified.add(statement.target);
        assigned.add(statement.target);
        continue;
      }
      readExpression(statement.condition.left);
      readExpression(statement.condition.right);
      const body = analyze(statement.body, assigned);
      const alternative = analyze(statement.alternative, assigned);
      assigned = new Set([...body].filter((slot) => alternative.has(slot)));
    }
    return assigned;
  };
  const definitelyAssigned = analyze(statements, new Set());
  const inputSlots = [...inputs].sort((left, right) => left - right);
  const stateSlots = [...modified].sort((left, right) => left - right);
  const localSlots = Array.from({ length: slotCount }, (_value, slot) => slot)
    .filter((slot) => !inputs.has(slot));
  return { inputSlots, stateSlots, localSlots, definitelyAssigned };
}

export function eliminateDeadStores(
  statements: StatementPlan[],
  liveOut: Set<number>,
): {
  statements: StatementPlan[];
  liveIn: Set<number>;
  eliminatedAssignments: number;
} {
  let live = new Set(liveOut);
  const output: StatementPlan[] = [];
  let eliminatedAssignments = 0;
  const addReads = (value: ExpressionPlan, target: Set<number>): void => {
    collectExpressionSlots(value, target);
  };
  for (let index = statements.length - 1; index >= 0; index -= 1) {
    const statement = statements[index];
    if (statement.kind === "assign") {
      if (!live.has(statement.target)) {
        eliminatedAssignments += 1;
        continue;
      }
      live.delete(statement.target);
      addReads(statement.value, live);
      output.unshift(statement);
      continue;
    }
    const body = eliminateDeadStores(statement.body, live);
    const alternative = eliminateDeadStores(statement.alternative, live);
    eliminatedAssignments += body.eliminatedAssignments +
      alternative.eliminatedAssignments;
    if (body.statements.length === 0 && alternative.statements.length === 0) {
      continue;
    }
    live = new Set([...body.liveIn, ...alternative.liveIn]);
    addReads(statement.condition.left, live);
    addReads(statement.condition.right, live);
    output.unshift({
      ...statement,
      body: body.statements,
      alternative: alternative.statements,
    });
  }
  return { statements: output, liveIn: live, eliminatedAssignments };
}

export function expressionStructuralKey(
  value: ExpressionPlan,
  versions?: number[],
): string {
  if (value.kind === "slot") {
    return `slot:${value.slot}@${versions?.[value.slot] ?? 0}`;
  }
  if (value.kind === "sequence") {
    return `sequence:${value.sequence}:${value.indexOrder}`;
  }
  if (value.kind === "integer-constant") {
    return `integer:${value.value}`;
  }
  if (value.kind === "neg") {
    return `neg(${expressionStructuralKey(value.value, versions)})`;
  }
  if (value.kind === "power") {
    return `power:${value.exponent}(${expressionStructuralKey(value.value, versions)})`;
  }
  if (value.operator === "+" || value.operator === "*") {
    const operands: string[] = [];
    const collect = (operand: ExpressionPlan): void => {
      if (operand.kind === "binary" && operand.operator === value.operator) {
        collect(operand.left);
        collect(operand.right);
      } else {
        operands.push(expressionStructuralKey(operand, versions));
      }
    };
    collect(value.left);
    collect(value.right);
    operands.sort();
    return `associative:${value.operator}(${operands.join(",")})`;
  }
  const left = expressionStructuralKey(value.left, versions);
  const right = expressionStructuralKey(value.right, versions);
  return `binary:${value.operator}(${left},${right})`;
}

export function expressionOperationCost(
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
    return 1 + expressionOperationCost(value.value, common, versions);
  }
  if (value.kind === "binary") {
    return 1 + expressionOperationCost(value.left, common, versions) +
      expressionOperationCost(value.right, common, versions);
  }
  let exponent = value.exponent;
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
  return products + expressionOperationCost(value.value, common, versions);
}

export function statementsOperationCost(
  statements: StatementPlan[],
  slotCount: number,
  versions = new Array(slotCount).fill(0),
  common = new Set<string>(),
  persistent = new Set<string>(),
): number {
  let total = 0;
  for (const statement of statements) {
    if (statement.kind === "assign") {
      total += expressionOperationCost(statement.value, common, versions);
      versions[statement.target] += 1;
      continue;
    }
    total += 1 + expressionOperationCost(
      statement.condition.left, common, versions,
    ) + expressionOperationCost(statement.condition.right, common, versions);
    const bodyVersions = [...versions];
    const alternativeVersions = [...versions];
    total += statementsOperationCost(
      statement.body, slotCount, bodyVersions, new Set(common), persistent,
    );
    total += statementsOperationCost(
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

export function expressionIsInvariant(
  value: ExpressionPlan,
  invariantSlots: Set<number>,
): boolean {
  if (value.kind === "slot") return invariantSlots.has(value.slot);
  if (value.kind === "sequence") return false;
  if (value.kind === "integer-constant") return true;
  if (value.kind === "neg" || value.kind === "power") {
    return expressionIsInvariant(value.value, invariantSlots);
  }
  return expressionIsInvariant(value.left, invariantSlots) &&
    expressionIsInvariant(value.right, invariantSlots);
}

export function hoistedExpressions(
  statements: StatementPlan[],
  invariantSlots: Set<number>,
  slotCount: number,
): ExpressionPlan[] {
  const answer: ExpressionPlan[] = [];
  const seen = new Set<string>();
  const persistent = new Set<string>();
  const markExpression = (
    value: ExpressionPlan,
    target: Set<string>,
    versions: number[],
  ): void => {
    if (value.kind === "slot" || value.kind === "sequence") return;
    const key = expressionStructuralKey(value, versions);
    if (target.has(key)) return;
    target.add(key);
    if (value.kind === "binary") {
      markExpression(value.left, target, versions);
      markExpression(value.right, target, versions);
    } else if (value.kind !== "integer-constant") {
      markExpression(value.value, target, versions);
    }
  };
  const visitExpression = (
    value: ExpressionPlan,
    common: Set<string>,
    versions: number[],
  ): void => {
    if (value.kind === "slot" || value.kind === "sequence") return;
    const key = expressionStructuralKey(value, versions);
    if (common.has(key)) return;
    common.add(key);
    if (expressionIsInvariant(value, invariantSlots)) {
      if (!seen.has(key)) {
        seen.add(key);
        answer.push(value);
      }
      markExpression(value, persistent, versions);
      for (const persistentKey of persistent) common.add(persistentKey);
      return;
    }
    if (value.kind === "binary") {
      visitExpression(value.left, common, versions);
      visitExpression(value.right, common, versions);
    } else if (value.kind !== "integer-constant") {
      visitExpression(value.value, common, versions);
    }
  };
  const visitStatements = (
    source: StatementPlan[],
    versions: number[],
    common: Set<string>,
  ): void => {
    for (const statement of source) {
      if (statement.kind === "assign") {
        visitExpression(statement.value, common, versions);
        versions[statement.target] += 1;
        continue;
      }
      visitExpression(statement.condition.left, common, versions);
      visitExpression(statement.condition.right, common, versions);
      const bodyVersions = [...versions];
      const alternativeVersions = [...versions];
      visitStatements(statement.body, bodyVersions, new Set(common));
      visitStatements(statement.alternative, alternativeVersions, new Set(common));
      for (let slot = 0; slot < slotCount; slot += 1) {
        versions[slot] = Math.max(bodyVersions[slot], alternativeVersions[slot]);
      }
      common.clear();
      for (const key of persistent) common.add(key);
    }
  };
  visitStatements(
    statements, new Array(slotCount).fill(0), new Set<string>(),
  );
  return answer;
}

