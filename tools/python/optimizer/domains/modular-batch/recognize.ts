import {
  CanonicalModularBatchProgram,
  ModularBatchExpression,
  ModularBatchOperation,
  ModularBatchRecognition,
} from "./ir";

const MAX_INPUTS = 4;
const MAX_OPERATION_COST = 32;

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

function isExactRange(
  compiler: any,
  call: any,
  countName?: string,
): boolean {
  return call instanceof compiler.AST_Call &&
    call.expression instanceof compiler.AST_SymbolRef &&
    call.expression.name === "range" && call.builtin_range !== false &&
    call.args?.length === 1 && !call.args.starargs &&
    !call.args.kwargs?.length && !call.args.kwarg_items?.length &&
    call.args[0] instanceof compiler.AST_SymbolRef &&
    call.args[0].python_lexical_binding === true &&
    (countName === undefined || call.args[0].name === countName);
}

function freshOutputAllocation(
  compiler: any,
  statement: any,
  countName: string,
): { outputName: string; output: any } | null {
  if (!(statement instanceof compiler.AST_SimpleStatement) ||
      !(statement.body instanceof compiler.AST_Assign) ||
      statement.body.operator !== "=" ||
      !(statement.body.left instanceof compiler.AST_SymbolRef) ||
      statement.body.left.python_lexical_binding !== true) return null;
  const comprehension = statement.body.right;
  if (!(comprehension instanceof compiler.AST_ListComprehension) ||
      !(comprehension.statement instanceof compiler.AST_Null) ||
      comprehension.condition || comprehension.alternative ||
      !(comprehension.init instanceof compiler.AST_SymbolRef) ||
      !isExactRange(compiler, comprehension.object, countName)) return null;
  return {
    outputName: statement.body.left.name,
    output: statement.body.left,
  };
}

function bodyIndexedAssignment(
  compiler: any,
  loop: any,
  outputName: string,
  iteratorName: string,
): any | null {
  if (!(loop.body instanceof compiler.AST_BlockStatement) ||
      loop.body.body?.length !== 1 ||
      !(loop.body.body[0] instanceof compiler.AST_SimpleStatement)) return null;
  const item = loop.body.body[0].body;
  if (!(item instanceof compiler.AST_ItemAccess) || !item.assignment ||
      !(item.expression instanceof compiler.AST_SymbolRef) ||
      item.expression.name !== outputName ||
      !(item.property instanceof compiler.AST_SymbolRef) ||
      item.property.name !== iteratorName) return null;
  return item.assignment;
}

/**
 * Recognize a complete, independently indexed modular batch.
 *
 * The output must be a fresh list comprehension immediately before the loop.
 * This is the static alias proof: arbitrary passed-in or previously escaping
 * mutable containers are never admitted as indexed outputs.
 */
export function recognizeModularBatchProgram(
  compiler: any,
  loop: any,
  ownerFunction: any,
): ModularBatchRecognition {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      loop.optimization_region ||
      !(loop.init instanceof compiler.AST_SymbolRef) ||
      loop.init.python_lexical_binding !== true ||
      !isExactRange(compiler, loop.object)) {
    return { accepted: false, reasons: ["not-complete-range-batch"] };
  }
  const count = loop.object.args[0];
  const countName = count.name;
  const iteratorName = loop.init.name;
  if (iteratorName === countName || !ownerFunction ||
      !Array.isArray(ownerFunction.body)) {
    return { accepted: false, reasons: ["not-top-level-contracted-batch"] };
  }
  const statementIndex = ownerFunction.body.indexOf(loop);
  if (statementIndex <= 0) {
    return { accepted: false, reasons: ["output-allocation-not-proven"] };
  }
  const allocation = freshOutputAllocation(
    compiler, ownerFunction.body[statementIndex - 1], countName,
  );
  if (!allocation) {
    return { accepted: false, reasons: ["output-allocation-not-proven"] };
  }
  if (allocation.outputName === iteratorName ||
      allocation.outputName === countName) {
    return { accepted: false, reasons: ["indexed-output-alias-unproven"] };
  }
  const assigned = bodyIndexedAssignment(
    compiler, loop, allocation.outputName, iteratorName,
  );
  if (!assigned) {
    return { accepted: false, reasons: ["indexed-output-shape-unsupported"] };
  }

  const inputs: Array<{ name: string; node: any; uses: number }> = [];
  const inputByName = new Map<string, number>();
  const operations = new Set<ModularBatchOperation>();
  let operationCost = 0;
  let invalidReason: string | null = null;

  const input = (node: any): ModularBatchExpression | null => {
    const name = node.expression.name;
    if (name === allocation.outputName) {
      invalidReason = "indexed-output-alias-unproven";
      return null;
    }
    let index = inputByName.get(name);
    if (index === undefined) {
      if (inputs.length === MAX_INPUTS) {
        invalidReason = "too-many-indexed-inputs";
        return null;
      }
      index = inputs.length;
      inputByName.set(name, index);
      inputs.push({ name, node: node.expression, uses: 0 });
    }
    inputs[index].uses += 1;
    return { kind: "input", input: index };
  };

  const expression = (node: any): ModularBatchExpression | null => {
    const literal = exactIntegerLiteral(compiler, node);
    if (literal !== null) {
      operations.add("coerce-integer");
      return { kind: "integer-constant", value: literal };
    }
    if (node instanceof compiler.AST_ItemAccess && !node.assignment &&
        node.expression instanceof compiler.AST_SymbolRef &&
        node.expression.python_lexical_binding === true &&
        node.property instanceof compiler.AST_SymbolRef &&
        node.property.name === iteratorName) return input(node);
    if (node instanceof compiler.AST_Unary && node.operator === "-") {
      const value = expression(node.expression);
      if (!value) return null;
      if (value.kind === "integer-constant") {
        if (!Number.isSafeInteger(-value.value)) return null;
        return { kind: "integer-constant", value: -value.value };
      }
      operationCost += 1;
      operations.add("neg");
      return { kind: "neg", value };
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
        if (!Number.isSafeInteger(folded)) return null;
        return { kind: "integer-constant", value: folded };
      }
      operationCost += 1;
      const operation = node.operator === "+" ? "add" :
        node.operator === "-" ? "sub" : "mul";
      operations.add(operation);
      return { kind: "binary", operator: node.operator, left, right };
    }
    return null;
  };

  const graph = expression(assigned);
  if (!graph || inputs.length === 0 || invalidReason) {
    return {
      accepted: false,
      reasons: [invalidReason ?? "modular-expression-unsupported"],
    };
  }
  if (operationCost === 0) {
    return { accepted: false, reasons: ["modular-operation-required"] };
  }
  if (operationCost > MAX_OPERATION_COST) {
    return { accepted: false, reasons: ["batch-operation-budget-exceeded"] };
  }
  const inputNames = inputs.map(({ name }) => name);
  if (new Set(inputNames).size !== inputNames.length ||
      inputNames.includes(countName) || inputNames.includes(iteratorName)) {
    return { accepted: false, reasons: ["indexed-input-binding-unstable"] };
  }
  const integerConstants = new Set<number>();
  const collectConstants = (value: ModularBatchExpression): void => {
    if (value.kind === "integer-constant") {
      integerConstants.add(value.value);
    } else if (value.kind === "binary") {
      collectConstants(value.left);
      collectConstants(value.right);
    } else if (value.kind === "neg") {
      collectConstants(value.value);
    }
  };
  collectConstants(graph);
  if (integerConstants.size === 0) operations.delete("coerce-integer");
  return {
    accepted: true,
    program: {
      version: 1,
      iteratorName,
      iterator: loop.init,
      countName,
      count,
      outputName: allocation.outputName,
      output: allocation.output,
      inputs,
      expression: graph,
      operations: [...operations].sort(),
      integerConstants: [...integerConstants].sort((left, right) => left - right),
      operationCost,
      aliasProof: {
        kind: "fresh-list-comprehension",
        outputName: allocation.outputName,
        allocationStatementIndex: statementIndex - 1,
        allocationCountName: countName,
        disjointInputNames: [...inputNames].sort(),
        inputInputAliasing: "allowed-read-only",
        publication: "after-complete-validation-and-private-computation",
      },
    },
  };
}
