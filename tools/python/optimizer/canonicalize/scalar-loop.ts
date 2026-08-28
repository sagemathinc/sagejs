import {
  eliminateDeadStores,
  expressionContainsRingValue,
  expressionOperationCost,
  hoistedExpressions,
  statementDataFlow,
  statementsOperationCost,
} from "../analyses/scalar-program";
import { affineTarget } from "../analyses/scalar-affine";
import {
  CanonicalScalarProgram,
  ScalarCondition as ConditionPlan,
  ScalarExpression as ExpressionPlan,
  ScalarSequenceAccess as SequenceAccess,
  ScalarStatement as StatementPlan,
} from "../ir/scalar-program";

const MAX_OPERATION_COST = 64;

function boundedPowerExponent(compiler: any, node: any): number | null {
  if (node instanceof compiler.AST_Number && Number.isSafeInteger(node.value) &&
      node.value >= 0) return node.value;
  if (!(node instanceof compiler.AST_Call) ||
      !(node.expression instanceof compiler.AST_SymbolRef) ||
      node.expression.name !== "Integer" ||
      node.expression.python_identifier === true || node.args?.length !== 1 ||
      node.args.starargs || node.args.kwargs?.length ||
      node.args.kwarg_items?.length ||
      !(node.args[0] instanceof compiler.AST_String)) return null;
  const spelling = node.args[0].value;
  if (!/^[0-9](?:_?[0-9])*$/.test(spelling)) return null;
  const exponent = Number(spelling.replaceAll("_", ""));
  return Number.isSafeInteger(exponent) ? exponent : null;
}

/** Recognize only compiler-created exact integer literals, never a live call. */
function exactIntegerLiteral(compiler: any, node: any): number | null {
  if (!(node instanceof compiler.AST_Call) ||
      !(node.expression instanceof compiler.AST_SymbolRef) ||
      node.expression.name !== "Integer" ||
      node.expression.python_identifier === true || node.args?.length !== 1 ||
      node.args.starargs || node.args.kwargs?.length ||
      node.args.kwarg_items?.length ||
      !(node.args[0] instanceof compiler.AST_String)) return null;
  const spelling = node.args[0].value;
  if (!/^[0-9](?:_?[0-9])*$/.test(spelling)) return null;
  const value = Number(spelling.replaceAll("_", ""));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Build a small target-neutral straight-line field program.  This deliberately
 * recognizes operations and data flow, not a benchmark spelling: any bounded
 * loop made solely from closed field assignments and equality branches maps to
 * the same operation graph.
 */
export function recognizeClosedScalarProgram(
  compiler: any,
  loop: any,
): CanonicalScalarProgram | null {
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
    const literal = exactIntegerLiteral(compiler, node);
    if (literal !== null) {
      operations.add("coerce-integer");
      return { kind: "integer-constant", value: literal };
    }
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
      if (left.kind === "integer-constant" &&
          right.kind === "integer-constant") {
        const folded = node.operator === "+" ? left.value + right.value :
          node.operator === "-" ? left.value - right.value :
          left.value * right.value;
        return Number.isSafeInteger(folded)
          ? { kind: "integer-constant", value: folded }
          : null;
      }
      operations.add(node.operator === "+" ? "add" :
        node.operator === "-" ? "sub" : "mul");
      return { kind: "binary", operator: node.operator, left, right };
    }
    if (node instanceof compiler.AST_Unary && node.operator === "-") {
      const value = expression(node.expression);
      if (!value) return null;
      if (value.kind === "integer-constant") {
        const folded = -value.value;
        return Number.isSafeInteger(folded)
          ? { kind: "integer-constant", value: folded }
          : null;
      }
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
    if (!left || !right ||
        (!expressionContainsRingValue(left) &&
         !expressionContainsRingValue(right))) return null;
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
        if (!rhs || !expressionContainsRingValue(rhs)) return null;
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
  const affine = inplaceOperations.size === 0
    ? affineTarget(program, stateSlots)
    : null;
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
  const integerConstants = new Set<number>();
  const collectIntegerConstants = (value: ExpressionPlan): void => {
    if (value.kind === "integer-constant") {
      integerConstants.add(value.value);
    } else if (value.kind === "binary") {
      collectIntegerConstants(value.left);
      collectIntegerConstants(value.right);
    } else if (value.kind === "neg" || value.kind === "power") {
      collectIntegerConstants(value.value);
    }
  };
  const collectStatementConstants = (statement: StatementPlan): void => {
    if (statement.kind === "assign") {
      collectIntegerConstants(statement.value);
      return;
    }
    collectIntegerConstants(statement.condition.left);
    collectIntegerConstants(statement.condition.right);
    statement.body.forEach(collectStatementConstants);
    statement.alternative.forEach(collectStatementConstants);
  };
  semanticProgram.forEach(collectStatementConstants);
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
    integerConstants: [...integerConstants].sort((left, right) => left - right),
    operationCost,
    preheaderOperationCost,
  };
}
