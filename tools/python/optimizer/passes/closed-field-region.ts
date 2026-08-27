import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";
import { targetCandidate } from "../cost-model";
import { stableRegionIdentity } from "../identity";

export const CLOSED_RING_REGION_PASS = "math.closed-ring-region.v1";
const MAX_OPERATION_COST = 64;
const TARGET_CODE_BASE_BYTES = 1024;
const TARGET_CODE_BYTES_PER_UNIT = 128;
const MAX_TARGET_CODE_BYTES = 32768;

type ExpressionPlan =
  | { kind: "slot"; slot: number }
  | {
      kind: "sequence";
      sequence: number;
      indexOrder: "forward" | "reverse";
    }
  | { kind: "binary"; operator: "+" | "-" | "*"; left: ExpressionPlan; right: ExpressionPlan }
  | { kind: "neg"; value: ExpressionPlan }
  | { kind: "power"; exponent: number; value: ExpressionPlan };

type ConditionPlan = {
  kind: "comparison";
  operator: "==" | "!=";
  left: ExpressionPlan;
  right: ExpressionPlan;
};

type StatementPlan =
  | {
      kind: "assign";
      assignmentOperator: "=" | "+=" | "-=" | "*=";
      target: number;
      value: ExpressionPlan;
    }
  | { kind: "if"; condition: ConditionPlan; body: StatementPlan[]; alternative: StatementPlan[] };

function collectExpressionSlots(value: ExpressionPlan, slots: Set<number>): void {
  if (value.kind === "slot") {
    slots.add(value.slot);
  } else if (value.kind === "binary") {
    collectExpressionSlots(value.left, slots);
    collectExpressionSlots(value.right, slots);
  } else if (value.kind === "neg" || value.kind === "power") {
    collectExpressionSlots(value.value, slots);
  }
}

function statementDataFlow(statements: StatementPlan[], slotCount: number): {
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

function eliminateDeadStores(
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

function expressionStructuralKey(
  value: ExpressionPlan,
  versions?: number[],
): string {
  if (value.kind === "slot") {
    return `slot:${value.slot}@${versions?.[value.slot] ?? 0}`;
  }
  if (value.kind === "sequence") {
    return `sequence:${value.sequence}:${value.indexOrder}`;
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

function expressionOperationCost(
  value: ExpressionPlan,
  common: Set<string>,
  versions: number[],
): number {
  if (value.kind === "slot" || value.kind === "sequence") return 0;
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

function statementsOperationCost(
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

function expressionIsInvariant(
  value: ExpressionPlan,
  invariantSlots: Set<number>,
): boolean {
  if (value.kind === "slot") return invariantSlots.has(value.slot);
  if (value.kind === "sequence") return false;
  if (value.kind === "neg" || value.kind === "power") {
    return expressionIsInvariant(value.value, invariantSlots);
  }
  return expressionIsInvariant(value.left, invariantSlots) &&
    expressionIsInvariant(value.right, invariantSlots);
}

function hoistedExpressions(
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
    } else {
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
    } else {
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

/** Conservatively price one outlined degree-four target compilation unit. */
function expressionTargetCodeUnits(
  value: ExpressionPlan,
  common: Set<string>,
  versions: number[],
): number {
  if (value.kind === "slot" || value.kind === "sequence") return 0;
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

function estimatedTargetCodeBytes(
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

type AffineTargetPlan =
  | {
      kind: "fixed-increment";
      accumulatorSlot: number;
      multiplierSlot: number;
      incrementSlot: number;
    }
  | {
      kind: "sequence-increment";
      accumulatorSlot: number;
      multiplierSlot: number;
      incrementSequence: number;
      incrementOperator: "add" | "subtract";
    };

function affineTarget(
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

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function boundedPowerExponent(compiler: any, node: any): number | null {
  if (node instanceof compiler.AST_Number && Number.isSafeInteger(node.value) &&
      node.value >= 0) return node.value;
  if (!(node instanceof compiler.AST_Call) ||
      !(node.expression instanceof compiler.AST_SymbolRef) ||
      node.expression.name !== "Integer" || node.args?.length !== 1 ||
      node.args.starargs || node.args.kwargs?.length ||
      node.args.kwarg_items?.length ||
      !(node.args[0] instanceof compiler.AST_String)) return null;
  const spelling = node.args[0].value;
  if (!/^[0-9](?:_?[0-9])*$/.test(spelling)) return null;
  const exponent = Number(spelling.replaceAll("_", ""));
  return Number.isSafeInteger(exponent) ? exponent : null;
}

/**
 * Build a small target-neutral straight-line field program.  This deliberately
 * recognizes operations and data flow, not a benchmark spelling: any bounded
 * loop made solely from closed field assignments and equality branches maps to
 * the same operation graph.
 */
function recognize(compiler: any, loop: any): null | Record<string, any> {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      loop.optimization_region) return null;

  let iteratorKind: "range" | "sequence" | "zip";
  let count: any = null;
  let iterable: any = null;
  let zipCall: any = null;
  let zipStrict = false;
  let zipIterables: any[] = [];
  let zipTargets: any[] = [];
  let zipSequenceBindings: number[] = [];
  let iterationOrder: "forward" | "reverse" = "forward";
  let iteratorNames: string[];
  if (loop.init instanceof compiler.AST_SymbolRef &&
      loop.object instanceof compiler.AST_Call &&
      loop.object.expression instanceof compiler.AST_SymbolRef &&
      loop.object.expression.name === "range" &&
      loop.builtin_range !== false && loop.object.args?.length === 1 &&
      !loop.object.args.starargs && !loop.object.args.kwargs?.length &&
      !loop.object.args.kwarg_items?.length) {
    iteratorKind = "range";
    count = loop.object.args[0];
    iteratorNames = [loop.init.name];
  } else if (loop.init instanceof compiler.AST_SymbolRef &&
             loop.object instanceof compiler.AST_SymbolRef) {
    iteratorKind = "sequence";
    iterable = loop.object;
    iteratorNames = [loop.init.name];
  } else if (loop.init instanceof compiler.AST_SymbolRef &&
             loop.object instanceof compiler.AST_Call &&
             loop.object.direct_call === true &&
             loop.object.expression instanceof compiler.AST_SymbolRef &&
             loop.object.expression.name === "reversed" &&
             loop.object.args?.length === 1 &&
             !loop.object.args.starargs && !loop.object.args.kwargs?.length &&
             !loop.object.args.kwarg_items?.length &&
             loop.object.args[0] instanceof compiler.AST_SymbolRef) {
    iteratorKind = "sequence";
    iterable = loop.object.args[0];
    iterationOrder = "reverse";
    iteratorNames = [loop.init.name];
  } else if (loop.init instanceof compiler.AST_Array &&
             loop.init.elements?.length >= 2 &&
             loop.init.elements.length <= 4 &&
             loop.init.elements.every((target: any) =>
               target instanceof compiler.AST_SymbolRef) &&
             loop.object instanceof compiler.AST_Call &&
             loop.object.direct_call === true &&
             loop.object.expression instanceof compiler.AST_SymbolRef &&
             loop.object.expression.name === "zip" &&
             loop.object.args?.length === loop.init.elements.length &&
             loop.object.args.every((source: any) =>
               source instanceof compiler.AST_SymbolRef) &&
             !loop.object.args.starargs &&
             !loop.object.args.kwarg_items?.length) {
    const keywords = loop.object.args.kwargs ?? [];
    if (keywords.length > 1 ||
        (keywords.length === 1 &&
         (keywords[0]?.[0]?.name !== "strict" ||
          !(keywords[0][1] instanceof compiler.AST_Boolean)))) return null;
    iteratorKind = "zip";
    zipCall = loop.object;
    zipStrict = keywords.length === 1 && keywords[0][1].value === true;
    zipIterables = [...loop.object.args];
    zipTargets = [...loop.init.elements];
    iteratorNames = zipTargets.map((target: any) => target.name);
    if (new Set(iteratorNames).size !== iteratorNames.length) return null;
  } else {
    return null;
  }
  if (!(loop.body instanceof compiler.AST_BlockStatement) ||
      !loop.body.body?.length || loop.body.body.length > 32) return null;

  const slots: Array<{ name: string; node: any }> = [];
  const slotByName = new Map<string, number>();
  const sequences: Array<{ name: string; node: any }> = [];
  const sequenceByName = new Map<string, number>();
  const modified = new Set<string>();
  const operations = new Set<string>();
  const inplaceOperations = new Set<"add" | "sub" | "mul">();

  const assignment = (statement: any): any | null => {
    if (!(statement instanceof compiler.AST_SimpleStatement)) return null;
    const value = statement.body;
    if (!(value instanceof compiler.AST_Assign) ||
        !["=", "+=", "-=", "*="].includes(value.operator) ||
        !(value.left instanceof compiler.AST_SymbolRef)) return null;
    return value;
  };
  const collectTargets = (statements: any[]): boolean => {
    for (const statement of statements) {
      const value = assignment(statement);
      if (value) {
        if (iteratorNames.includes(value.left.name)) return false;
        modified.add(value.left.name);
        continue;
      }
      if (!(statement instanceof compiler.AST_If) ||
          !(statement.body instanceof compiler.AST_BlockStatement) ||
          (statement.alternative &&
           !(statement.alternative instanceof compiler.AST_BlockStatement)) ||
          !collectTargets(statement.body.body) ||
          (statement.alternative &&
           !collectTargets(statement.alternative.body))) return false;
    }
    return true;
  };
  if (!collectTargets(loop.body.body) || modified.size === 0 ||
      modified.size > 8) return null;

  const slot = (node: any, isRead: boolean): number => {
    let index = slotByName.get(node.name);
    if (index === undefined) {
      index = slots.length;
      slotByName.set(node.name, index);
      slots.push({ name: node.name, node });
    }
    return index;
  };
  const sequence = (node: any): number => {
    let index = sequenceByName.get(node.name);
    if (index === undefined) {
      index = sequences.length;
      sequenceByName.set(node.name, index);
      sequences.push({ name: node.name, node });
    }
    return index;
  };
  const iteratorBindings = new Map<string, {
    sequence: number;
    indexOrder: "forward" | "reverse";
  }>();
  if (iteratorKind === "sequence") {
    iteratorBindings.set(iteratorNames[0], {
      sequence: sequence(iterable),
      indexOrder: iterationOrder,
    });
  } else if (iteratorKind === "zip") {
    for (let index = 0; index < zipIterables.length; index += 1) {
      const sequenceIndex = sequence(zipIterables[index]);
      zipSequenceBindings.push(sequenceIndex);
      iteratorBindings.set(iteratorNames[index], {
        sequence: sequenceIndex,
        indexOrder: "forward",
      });
    }
  }

  const expression = (node: any): ExpressionPlan | null => {
    if (node instanceof compiler.AST_SymbolRef) {
      const binding = iteratorBindings.get(node.name);
      if (binding) {
        return {
          kind: "sequence",
          sequence: binding.sequence,
          indexOrder: binding.indexOrder,
        };
      }
      if (iteratorNames.includes(node.name)) return null;
      return { kind: "slot", slot: slot(node, true) };
    }
    if (node instanceof compiler.AST_ItemAccess &&
        iteratorKind === "range" &&
        node.expression instanceof compiler.AST_SymbolRef &&
        node.property instanceof compiler.AST_SymbolRef &&
        node.property.name === iteratorNames[0]) {
      return {
        kind: "sequence",
        sequence: sequence(node.expression),
        indexOrder: "forward",
      };
    }
    if (node instanceof compiler.AST_Binary &&
        ["+", "-", "*"].includes(node.operator)) {
      const left = expression(node.left);
      const right = expression(node.right);
      if (!left || !right) return null;
      operations.add(node.operator === "+" ? "add" :
        node.operator === "-" ? "sub" : "mul");
      return { kind: "binary", operator: node.operator, left, right };
    }
    if (node instanceof compiler.AST_Unary && node.operator === "-") {
      const value = expression(node.expression);
      if (!value) return null;
      operations.add("neg");
      return { kind: "neg", value };
    }
    if (node instanceof compiler.AST_Binary && node.operator === "**") {
      const exponent = boundedPowerExponent(compiler, node.right);
      const value = expression(node.left);
      if (exponent === null || !value) return null;
      operations.add("pow");
      return { kind: "power", exponent, value };
    }
    return null;
  };
  const condition = (node: any): ConditionPlan | null => {
    if (!(node instanceof compiler.AST_Binary) ||
        (node.operator !== "==" && node.operator !== "!=")) {
      return null;
    }
    const left = expression(node.left);
    const right = expression(node.right);
    if (!left || !right) return null;
    operations.add("equal");
    return { kind: "comparison", operator: node.operator, left, right };
  };
  const statements = (source: any[]): StatementPlan[] | null => {
    const output: StatementPlan[] = [];
    for (const statement of source) {
      const value = assignment(statement);
      if (value) {
        const target = slot(value.left, value.operator !== "=");
        const right = expression(value.right);
        if (!right) return null;
        let rhs = right;
        if (value.operator !== "=") {
          const operator = value.operator[0] as "+" | "-" | "*";
          const operation = operator === "+" ? "add" :
            operator === "-" ? "sub" : "mul";
          operations.add(operation);
          inplaceOperations.add(operation);
          rhs = {
            kind: "binary",
            operator,
            left: { kind: "slot", slot: target },
            right,
          };
        }
        if (!rhs) return null;
        output.push({
          kind: "assign",
          assignmentOperator: value.operator,
          target,
          value: rhs,
        });
        continue;
      }
      if (!(statement instanceof compiler.AST_If)) return null;
      const test = condition(statement.condition);
      const body = statements(statement.body.body);
      const alternative = statement.alternative
        ? statements(statement.alternative.body)
        : [];
      if (!test || !body || !alternative) return null;
      output.push({ kind: "if", condition: test, body, alternative });
    }
    return output;
  };
  const semanticProgram = statements(loop.body.body);
  if (!semanticProgram || operations.size === 0 || slots.length > 16 ||
      sequences.length > 4) return null;
  if ([...modified].some((name) => sequenceByName.has(name))) return null;

  const dataFlow = statementDataFlow(semanticProgram, slots.length);
  if (dataFlow.inputSlots.length === 0 || dataFlow.localSlots.some((slot) =>
    dataFlow.stateSlots.includes(slot) && !dataFlow.definitelyAssigned.has(slot))) {
    return null;
  }
  const { inputSlots, stateSlots, localSlots } = dataFlow;
  const deadStores = eliminateDeadStores(
    semanticProgram, new Set(stateSlots),
  );
  const program = deadStores.statements;
  const invariantSlots = new Set(
    inputSlots.filter((slot) => !stateSlots.includes(slot)),
  );
  const hoisted = hoistedExpressions(program, invariantSlots, slots.length);
  const available = new Set<string>();
  const versions = new Array(slots.length).fill(0);
  let preheaderOperationCost = 0;
  for (const expression of hoisted) {
    preheaderOperationCost += expressionOperationCost(
      expression, available, versions,
    );
  }
  const operationCost = statementsOperationCost(
    program,
    slots.length,
    versions,
    new Set(available),
    new Set(available),
  );
  if (preheaderOperationCost + operationCost > MAX_OPERATION_COST) return null;
  const targetCodeBytes = estimatedTargetCodeBytes(
    program, slots.length, hoisted,
  );
  if (targetCodeBytes > MAX_TARGET_CODE_BYTES) return null;
  const affine = inplaceOperations.size === 0
    ? affineTarget(program, stateSlots)
    : null;
  type SequenceAccess = {
    sequence: number;
    indexOrder: "forward" | "reverse";
    uses: number;
  };
  const summarizeSequenceUses = (source: StatementPlan[]) => {
    const uses = new Array(sequences.length).fill(0);
    const accessMap = new Map<string, SequenceAccess>();
    const countExpression = (value: ExpressionPlan): void => {
      if (value.kind === "sequence") {
        uses[value.sequence] += 1;
        const key = `${value.sequence}:${value.indexOrder}`;
        const access = accessMap.get(key);
        if (access) access.uses += 1;
        else accessMap.set(key, {
          sequence: value.sequence,
          indexOrder: value.indexOrder,
          uses: 1,
        });
      } else if (value.kind === "binary") {
        countExpression(value.left);
        countExpression(value.right);
      } else if (value.kind === "neg" || value.kind === "power") {
        countExpression(value.value);
      }
    };
    const countStatement = (statement: StatementPlan): void => {
      if (statement.kind === "assign") {
        countExpression(statement.value);
        return;
      }
      countExpression(statement.condition.left);
      countExpression(statement.condition.right);
      statement.body.forEach(countStatement);
      statement.alternative.forEach(countStatement);
    };
    source.forEach(countStatement);
    return { uses, accesses: [...accessMap.values()] };
  };
  // Sequence reads in eliminated pure assignments still belong to the source
  // transaction.  Streaming lowering validates these views before executing
  // the reduced graph so an invalid element restarts the untouched loop rather
  // than becoming unobservable merely because its result was overwritten.
  const semanticSequences = summarizeSequenceUses(semanticProgram);
  const loweredSequences = summarizeSequenceUses(program);
  const sequenceUses = semanticSequences.uses;
  const sequenceAccesses = semanticSequences.accesses;
  const loweredSequenceUses = loweredSequences.uses;
  const loweredSequenceAccesses = loweredSequences.accesses;
  const transactionalStream =
    sequenceAccesses.length > 0 &&
    sequenceAccesses.length <= 2 &&
    loweredSequenceUses.reduce((total, count) => total + count, 0) <= 8;
  const sequenceStrategy =
    affine?.kind === "sequence-increment" || transactionalStream
      ? "stream"
      : "pack";
  return {
    iteratorKind,
    iterationOrder,
    count,
    iterable,
    zipCall,
    zipStrict,
    zipIterables,
    zipTargets,
    zipSequenceBindings,
    iterator: loop.init,
    slots,
    sequences,
    inputSlots,
    stateSlots,
    localSlots,
    semanticStatements: semanticProgram,
    hoistedExpressions: hoisted,
    statements: program,
    eliminatedAssignments: deadStores.eliminatedAssignments,
    operations: [...operations].sort(),
    inplaceOperations: [...inplaceOperations].sort(),
    affine,
    sequenceUses,
    sequenceAccesses,
    loweredSequenceUses,
    loweredSequenceAccesses,
    sequenceStrategy,
    operationCost,
    preheaderOperationCost,
    targetCodeBytes,
  };
}

export const closedRingRegionPass: OptimizationPass = {
  id: CLOSED_RING_REGION_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: ["builtin-range", "lexical-binding", "structured-effects"],
  factsProduced: [
    "parent-identity", "parent-stable", "method-stability", "fixed-shape",
    "no-alias", "no-escape", "no-callback", "operation-closed", "exact-range",
    "commutative-ring", "referentially-transparent-used-operations",
    "inplace-fallback", "loop-invariant", "dead-store-free",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "sequential-assignment", "final-loop-target",
    "exceptions", "object-identity-on-zero-trip", "generic-fallback",
  ],
  guardsIntroduced: [
    "safe-iteration-count", "same-parent", "reviewed-representation",
    "prototype-and-used-method-identities", "canonical-values",
    "absent-inplace-methods", "sequence-prefix-bounds", "exact-machine-range",
  ],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: "verifyOptimizationDecision/v1",
  compilationCostBudget: 128,
  codeSizeBudget: MAX_TARGET_CODE_BYTES,
  requiredEvidence: [
    "generated-enabled-disabled-differential", "held-out-source-corpus",
    "guard-and-alias-adversarial", "node-and-three-browser-route",
    "public-workload-benchmark",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      const operands = recognize(context.compiler, node);
      if (!operands) return;
      const source = sourceRegion(node);
      const identity = stableRegionIdentity(CLOSED_RING_REGION_PASS, source, {
        kind: "closed-ring-region",
        iteratorKind: operands.iteratorKind,
        iterationOrder: operands.iterationOrder,
        zipStrict: operands.zipStrict,
        zipSequences: operands.iteratorKind === "zip"
          ? operands.zipIterables.map((source: any) => source.name)
          : [],
        zipTargets: operands.iteratorKind === "zip"
          ? operands.zipTargets.map((target: any) => target.name)
          : [],
        zipSequenceBindings: operands.zipSequenceBindings,
        slots: operands.slots.map((slot: any) => slot.name),
        sequences: operands.sequences.map((sequence: any) => sequence.name),
        inputSlots: operands.inputSlots,
        stateSlots: operands.stateSlots,
        localSlots: operands.localSlots,
        semanticStatements: operands.semanticStatements,
        hoistedExpressions: operands.hoistedExpressions,
        statements: operands.statements,
        eliminatedAssignments: operands.eliminatedAssignments,
        operations: operands.operations,
        inplaceOperations: operands.inplaceOperations,
        affine: operands.affine,
        sequenceUses: operands.sequenceUses,
        sequenceAccesses: operands.sequenceAccesses,
        loweredSequenceUses: operands.loweredSequenceUses,
        loweredSequenceAccesses: operands.loweredSequenceAccesses,
        sequenceStrategy: operands.sequenceStrategy,
        operationCost: operands.operationCost,
        preheaderOperationCost: operands.preheaderOperationCost,
        targetCodeBytes: operands.targetCodeBytes,
      });
      const id = identity.id;
      context.consider({
        minimumLevel: "O2",
        staticRejectionReasons: ancestors.some((ancestor) =>
          ancestor instanceof context.compiler.AST_Try && ancestor.bcatch
        ) ? ["catchable-interrupt-region"] : [],
        node,
        internal: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_RING_REGION_PASS,
          kind: "closed-ring-region",
          operands,
        },
        decision: {
          schema: OPTIMIZER_IR_SCHEMA,
          id,
          passId: CLOSED_RING_REGION_PASS,
          source,
          semantic: {
            level: "sage-semantic",
            revision: 1,
            kind: "sage.closed-ring-loop",
            operations: [
              "iterate", "sequential-assign", ...operands.operations.map(
                (operation: string) => `${operation}-dispatch`
              ),
              ...operands.inplaceOperations.map(
                (operation: string) => `inplace-${operation}-fallback-dispatch`
              ),
            ],
            observableExits: [
              ...operands.stateSlots.map((slot: number) => operands.slots[slot].name),
              "loop-target",
            ],
            exceptionPolicy: "entry guards precede optimized effects; exact loop fallback",
          },
          mathematical: {
            level: "mathematical",
            revision: 1,
            kind: "math.closed-commutative-ring-program",
            domain: "one guarded finite commutative ring or fixed finite-field parent",
            operations: operands.operations.map(
              (operation: string) => `math.ring.${operation}`
            ),
            exactness: "runtime parent/shape/method guards plus exact Number range",
          },
          facts: [
            { kind: "no-alias", authority: "static", evidence: "distinct lexical state bindings" },
            { kind: "no-escape", authority: "static", evidence: "only local state assignments and control flow occur in the region" },
            { kind: "no-callback", authority: "runtime-guard", evidence: "all used operator identities match reviewed immutable finite-field methods" },
            { kind: "referentially-transparent-used-operations", authority: "runtime-guard", evidence: "reviewed canonical ring operations are pure after parent, brand, and method-identity guards" },
            ...(operands.inplaceOperations.length ? [{ kind: "inplace-fallback", authority: "runtime-guard" as const, evidence: "every live-in and reviewed prototype chain lacks the corresponding Python __i*__ descriptor" }] : []),
            { kind: "parent-identity", authority: "runtime-guard", evidence: "all scalar and sequence values share one parent" },
            { kind: "fixed-shape", authority: "runtime-guard", evidence: "the selected parent advertises a reviewed fixed representation" },
            { kind: "exact-range", authority: "runtime-guard", evidence: "the selected representation validates canonical values and machine intermediates" },
            { kind: "commutative-ring", authority: "runtime-guard", evidence: "the selected machine parent explicitly advertises reviewed commutative multiplication" },
            ...(operands.eliminatedAssignments ? [{ kind: "dead-store-free", authority: "static" as const, evidence: "backward liveness over the semantic statement graph proves overwritten pure assignments unobservable" }] : []),
            ...(operands.hoistedExpressions.length ? [{ kind: "loop-invariant", authority: "static" as const, evidence: "hoisted expression slots are live-in and absent from the complete modified-slot set" }] : []),
          ],
          representation: {
            level: "representation",
            revision: 1,
            kind: "guarded-unboxed-ring-program",
            candidates: ["number-residue", "extension-tuple-number", "boxed-sage-value"],
            conversions: [
              operands.sequenceStrategy === "stream"
                ? "unbox live-ins and validate sequence elements while streaming"
                : "unbox live-ins and sequence prefixes",
              ...(operands.hoistedExpressions.length
                ? ["evaluate pure loop-invariant subgraphs once in the guarded preheader"]
                : []),
              ...(operands.eliminatedAssignments
                ? ["omit overwritten pure assignments from the lowered graph"]
                : []),
              "materialize modified live-outs",
            ],
            materializations: operands.stateSlots.length,
          },
          target: {
            level: "target",
            revision: 1,
            kind: operands.affine?.kind === "fixed-increment" ? "adaptive" : "v8",
            lowering: operands.affine?.kind === "fixed-increment"
              ? "trip-count-gated isolated affine target or monomorphic scalar operation graph"
              : operands.sequenceStrategy === "stream"
                ? "transactional streaming operation graph over guarded sequence elements"
              : "monomorphic scalar locals generated from target-neutral field operations",
            boundaryCrossings: operands.affine?.kind === "fixed-increment"
              ? "runtime-dependent"
              : 0,
            copiedBytes: "runtime-dependent",
            selectedCandidate: operands.affine?.kind === "fixed-increment"
              ? "runtime-adaptive"
              : "v8-closed-ring-program",
            policy: operands.affine?.kind === "fixed-increment"
              ? "guarded representation, trip count, and authenticated isolated-target availability"
              : operands.sequenceStrategy === "stream"
                ? "guarded streaming sequence with transactional materialization and exact restart fallback"
              : "bounded monomorphic scalar region with one entry validation",
            candidates: [
              targetCandidate({
                id: "v8-closed-ring-program",
                kind: "v8",
                representation: "number-residue or extension-tuple-number",
                availability: operands.affine?.kind === "fixed-increment"
                  ? "runtime-gated"
                  : "selected",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: "runtime-dependent",
                  boundaryCrossings: 0,
                  copiedBytes: "runtime-dependent",
                  allocations: "runtime-dependent",
                  cleanupOperations: 0,
                  compileMilliseconds: 0,
                  instantiateMilliseconds: 0,
                  loadMilliseconds: 0,
                  materializations: operands.stateSlots.length,
                  emittedBytes: "runtime-dependent",
                },
                evidence: "guarded monomorphic operation graph emitted as primitive locals",
              }),
              targetCandidate({
                id: "wasm-resident-ring-program",
                kind: "wasm",
                representation: "packed or resident field values",
                availability: operands.affine?.kind === "fixed-increment"
                  ? "runtime-gated"
                  : "rejected",
                rejectionReason: operands.affine?.kind === "fixed-increment"
                  ? null
                  : "resident-general-region-lowering-unimplemented",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: operands.affine?.kind === "fixed-increment"
                  ? "source-transparent packed quadratic kernel in the authenticated Wasm pack"
                  : "candidate retained for the same Mathematical IR; no general resident lowering yet",
              }),
              targetCandidate({
                id: "native-isolated-ring-program",
                kind: "native",
                representation: "packed fixed-shape field values",
                availability: operands.affine?.kind === "fixed-increment"
                  ? "runtime-gated"
                  : "rejected",
                rejectionReason: operands.affine?.kind === "fixed-increment"
                  ? null
                  : "general-operation-graph-native-lowering-unimplemented",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  boundaryCrossings: 1,
                  copiedBytes: "runtime-dependent",
                  materializations: operands.stateSlots.length,
                },
                evidence: operands.affine?.kind === "fixed-increment"
                  ? "source-transparent packed quadratic kernel in the production native pack"
                  : "isolated affine witness exists; general operation graph is not silently substituted",
              }),
              targetCandidate({
                id: "generic-ring-program-fallback",
                kind: "generic",
                representation: "boxed-sage-value",
                availability: "available",
                cost: {
                  arithmeticOperations: "runtime-dependent",
                  representationConversions: 0,
                  boundaryCrossings: 0,
                  copiedBytes: 0,
                  materializations: 0,
                  emittedBytes: 0,
                },
                evidence: "untouched semantic loop",
              }),
            ],
          },
          guards: [
            "safe-iteration-count", "same-parent", "reviewed-representation",
            "prototype-and-used-method-identities", "canonical-values",
            "absent-inplace-methods", "sequence-prefix-bounds",
            "zip-length-contract", "exact-machine-range",
          ],
          fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
          cacheIdentityInputs: [
            `schema:${OPTIMIZER_IR_SCHEMA}`,
            `pass:${CLOSED_RING_REGION_PASS}`,
            `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
            `operations:${operands.operations.join(",")}`,
            `slots:${operands.slots.map((slot: any) => slot.name).join(",")}`,
            `iterator:${operands.iteratorKind}`,
            `semantic-fingerprint:${identity.fingerprint}`,
            `level:${context.controls.level}`,
          ],
        },
      });
    });
  },
};
