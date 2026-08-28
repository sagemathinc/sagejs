import {
  boundedModularFoldProofGaps,
  ModularSequenceRecognition,
  nestedBoundedModularScanProofGaps,
  TRANSACTIONAL_SEQUENCE_TRANSFORM_PROOF_GAPS,
} from "./model";

function lexicalSymbol(compiler: any, node: any): node is any {
  return node instanceof compiler.AST_SymbolRef &&
    node.python_lexical_binding === true &&
    typeof node.name === "string" && node.name.length > 0;
}

function exactCallArguments(node: any, count: number): boolean {
  return Array.isArray(node?.args) && node.args.length === count &&
    !node.args.starargs && !node.args.kwargs?.length &&
    !node.args.kwarg_items?.length;
}

function builtinIteratorCall(
  compiler: any,
  node: any,
  name: "enumerate" | "range" | "reversed",
): any | null {
  if (!(node instanceof compiler.AST_Call) ||
      !(node.expression instanceof compiler.AST_SymbolRef) ||
      node.expression.name !== name ||
      node.expression.python_identifier === false ||
      node.expression.python_lexical_binding !== false ||
      node.expression.python_resolution_provenance !== "module" ||
      exactCallArguments(node, 1) === false) return null;
  return node.args[0];
}

function exactIntegerLiteral(compiler: any, node: any, expected: string): boolean {
  return node instanceof compiler.AST_Call &&
    node.expression instanceof compiler.AST_SymbolRef &&
    node.expression.name === "Integer" &&
    exactCallArguments(node, 1) &&
    node.args[0] instanceof compiler.AST_String &&
    node.args[0].value === expected;
}

function simpleAssignment(compiler: any, statement: any): any | null {
  if (!(statement instanceof compiler.AST_SimpleStatement) ||
      !(statement.body instanceof compiler.AST_Assign) ||
      statement.body.operator !== "=") return null;
  return statement.body;
}

function oneStatementBody(compiler: any, block: any): any | null {
  if (!(block instanceof compiler.AST_BlockStatement) ||
      !Array.isArray(block.body) || block.body.length !== 1) return null;
  return block.body[0];
}

function owningStatementIndex(ownerFunction: any, loop: any): number {
  if (!ownerFunction || !Array.isArray(ownerFunction.body)) return -1;
  return ownerFunction.body.indexOf(loop);
}

interface ModularFoldComponents {
  sequence: any;
  elementName: string;
  stateName: string;
  multiplierName: string;
  modulusName: string;
}

function modularFoldComponents(
  compiler: any,
  loop: any,
): ModularFoldComponents | null {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      !lexicalSymbol(compiler, loop.init)) return null;
  const sequence = builtinIteratorCall(compiler, loop.object, "reversed");
  if (!sequence) return null;
  const bodyStatement = oneStatementBody(compiler, loop.body);
  const assignment = simpleAssignment(compiler, bodyStatement);
  if (!assignment || !lexicalSymbol(compiler, assignment.left)) return null;
  const remainder = assignment.right;
  if (!(remainder instanceof compiler.AST_Binary) ||
      remainder.operator !== "%" || !lexicalSymbol(compiler, remainder.right)) {
    return null;
  }
  const addition = remainder.left;
  if (!(addition instanceof compiler.AST_Binary) || addition.operator !== "+" ||
      !lexicalSymbol(compiler, addition.right) ||
      addition.right.name !== loop.init.name) return null;
  const multiplication = addition.left;
  if (!(multiplication instanceof compiler.AST_Binary) ||
      multiplication.operator !== "*" ||
      !lexicalSymbol(compiler, multiplication.left) ||
      multiplication.left.name !== assignment.left.name ||
      !lexicalSymbol(compiler, multiplication.right)) return null;
  const names = [
    loop.init.name,
    assignment.left.name,
    multiplication.right.name,
    remainder.right.name,
  ];
  if (new Set(names).size !== names.length) return null;
  return {
    sequence,
    elementName: loop.init.name,
    stateName: assignment.left.name,
    multiplierName: multiplication.right.name,
    modulusName: remainder.right.name,
  };
}

function recognizeBoundedModularFold(
  compiler: any,
  loop: any,
  ownerFunction: any,
): ModularSequenceRecognition | null {
  const fold = modularFoldComponents(compiler, loop);
  if (!fold) return null;

  const statementIndex = owningStatementIndex(ownerFunction, loop);
  if (statementIndex <= 0) return null;
  const initializer = simpleAssignment(
    compiler,
    ownerFunction.body[statementIndex - 1],
  );
  if (!initializer || !lexicalSymbol(compiler, initializer.left) ||
      initializer.left.name !== fold.stateName ||
      !exactIntegerLiteral(compiler, initializer.right, "0")) return null;

  let sequencePreparation:
    | "inline-call-must-execute-before-iterator"
    | "staged-call-result-already-evaluated-before-loop"
    | "lexical-sequence-already-evaluated-before-loop"
    | null = null;
  if (fold.sequence instanceof compiler.AST_Call) {
    sequencePreparation = "inline-call-must-execute-before-iterator";
  } else if (lexicalSymbol(compiler, fold.sequence)) {
    const preparation = statementIndex >= 2
      ? simpleAssignment(compiler, ownerFunction.body[statementIndex - 2])
      : null;
    sequencePreparation = preparation &&
        lexicalSymbol(compiler, preparation.left) &&
        preparation.left.name === fold.sequence.name &&
        preparation.right instanceof compiler.AST_Call
      ? "staged-call-result-already-evaluated-before-loop"
      : "lexical-sequence-already-evaluated-before-loop";
  }
  if (!sequencePreparation) return null;
  return {
    recognized: true,
    program: {
      version: 1,
      kind: "bounded-modular-fold",
      iteratorKind: "reversed-one-argument",
      initializerStatementIndex: statementIndex - 1,
      elementName: fold.elementName,
      stateName: fold.stateName,
      multiplierName: fold.multiplierName,
      modulusName: fold.modulusName,
      sequencePreparation,
      operations: ["multiply", "add", "remainder"],
      proofGaps: [...boundedModularFoldProofGaps(sequencePreparation)],
    },
  };
}

function zeroTest(
  compiler: any,
  statement: any,
  stateName: string,
): any | null {
  if (!(statement instanceof compiler.AST_If) || statement.alternative ||
      !(statement.condition instanceof compiler.AST_Binary) ||
      statement.condition.operator !== "==" ||
      !lexicalSymbol(compiler, statement.condition.left) ||
      statement.condition.left.name !== stateName ||
      !exactIntegerLiteral(compiler, statement.condition.right, "0")) return null;
  return statement;
}

function isPowAccumulateTail(
  compiler: any,
  statements: any[],
  stateName: string,
  modulusName: string,
): boolean {
  if (statements.length !== 5) return false;
  const zeroBranch = zeroTest(compiler, statements[2], stateName);
  if (!zeroBranch ||
      !(oneStatementBody(compiler, zeroBranch.body) instanceof compiler.AST_Continue)) {
    return false;
  }
  const power = simpleAssignment(compiler, statements[3]);
  if (!power || !lexicalSymbol(compiler, power.left) ||
      !(power.right instanceof compiler.AST_Call) ||
      !(power.right.expression instanceof compiler.AST_SymbolRef) ||
      power.right.expression.name !== "pow" ||
      power.right.expression.python_lexical_binding !== false ||
      power.right.expression.python_resolution_provenance !== "module" ||
      !exactCallArguments(power.right, 3) ||
      !lexicalSymbol(compiler, power.right.args[0]) ||
      power.right.args[0].name !== stateName ||
      !lexicalSymbol(compiler, power.right.args[2]) ||
      power.right.args[2].name !== modulusName) return false;
  const exponent = power.right.args[1];
  if (!(exponent instanceof compiler.AST_Binary) || exponent.operator !== "//" ||
      !(exponent.left instanceof compiler.AST_Binary) ||
      exponent.left.operator !== "-" ||
      !lexicalSymbol(compiler, exponent.left.left) ||
      exponent.left.left.name !== modulusName ||
      !exactIntegerLiteral(compiler, exponent.left.right, "1") ||
      !exactIntegerLiteral(compiler, exponent.right, "2")) return false;
  const accumulation = statements[4];
  if (!(accumulation instanceof compiler.AST_SimpleStatement) ||
      !(accumulation.body instanceof compiler.AST_Assign) ||
      accumulation.body.operator !== "+=" ||
      !lexicalSymbol(compiler, accumulation.body.left) ||
      !(accumulation.body.right instanceof compiler.AST_Conditional)) return false;
  const conditional = accumulation.body.right;
  return conditional.condition instanceof compiler.AST_Binary &&
    conditional.condition.operator === "==" &&
    lexicalSymbol(compiler, conditional.condition.left) &&
    conditional.condition.left.name === power.left.name &&
    exactIntegerLiteral(compiler, conditional.condition.right, "1") &&
    exactIntegerLiteral(compiler, conditional.consequent, "1") &&
    conditional.alternative instanceof compiler.AST_UnaryPrefix &&
    conditional.alternative.operator === "-" &&
    exactIntegerLiteral(compiler, conditional.alternative.expression, "1");
}

function isPublishAndBreakBranch(
  compiler: any,
  statements: any[],
  stateName: string,
  outerIndexName: string,
): boolean {
  if (statements.length !== 3) return false;
  const zeroBranch = zeroTest(compiler, statements[2], stateName);
  if (!zeroBranch || !(zeroBranch.body instanceof compiler.AST_BlockStatement) ||
      zeroBranch.body.body?.length !== 2) return false;
  const publication = simpleAssignment(compiler, zeroBranch.body.body[0]);
  return publication !== null &&
    lexicalSymbol(compiler, publication.left) &&
    lexicalSymbol(compiler, publication.right) &&
    publication.right.name === outerIndexName &&
    publication.left.name !== stateName &&
    zeroBranch.body.body[1] instanceof compiler.AST_Break;
}

function recognizeNestedBoundedModularScan(
  compiler: any,
  loop: any,
): ModularSequenceRecognition | null {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      !lexicalSymbol(compiler, loop.init) ||
      !(loop.body instanceof compiler.AST_BlockStatement)) return null;
  const modulus = builtinIteratorCall(compiler, loop.object, "range");
  if (!lexicalSymbol(compiler, modulus)) return null;
  const statements = loop.body.body;
  if (!Array.isArray(statements) || statements.length < 3) return null;
  const initializer = simpleAssignment(compiler, statements[0]);
  if (!initializer || !lexicalSymbol(compiler, initializer.left) ||
      !exactIntegerLiteral(compiler, initializer.right, "0")) return null;
  const innerLoop = statements[1];
  const fold = modularFoldComponents(compiler, innerLoop);
  if (!fold || !lexicalSymbol(compiler, fold.sequence) ||
      fold.stateName !== initializer.left.name ||
      fold.multiplierName !== loop.init.name ||
      fold.modulusName !== modulus.name) return null;
  const zeroBranch = isPowAccumulateTail(
    compiler,
    statements,
    fold.stateName,
    fold.modulusName,
  ) ? "continue-then-pow-accumulate" as const :
    isPublishAndBreakBranch(
      compiler,
      statements,
      fold.stateName,
      loop.init.name,
    ) ? "publish-index-and-break" as const : null;
  if (!zeroBranch) return null;
  const names = [
    loop.init.name,
    fold.elementName,
    fold.sequence.name,
    fold.stateName,
    modulus.name,
  ];
  if (new Set(names).size !== names.length) return null;
  return {
    recognized: true,
    program: {
      version: 1,
      kind: "nested-bounded-modular-scan",
      iteratorKind: "range-containing-reversed-fold",
      outerIndexName: loop.init.name,
      elementName: fold.elementName,
      sequenceName: fold.sequence.name,
      stateName: fold.stateName,
      modulusName: modulus.name,
      zeroBranch,
      operations: zeroBranch === "continue-then-pow-accumulate"
        ? ["range", "reversed", "multiply", "add", "remainder", "equal", "pow", "accumulate"]
        : ["range", "reversed", "multiply", "add", "remainder", "equal", "publish", "break"],
      proofGaps: [...nestedBoundedModularScanProofGaps(zeroBranch)],
    },
  };
}

function appendArgument(
  compiler: any,
  statement: any,
  outputName: string,
): any | null {
  if (!(statement instanceof compiler.AST_SimpleStatement) ||
      !(statement.body instanceof compiler.AST_Call) ||
      !exactCallArguments(statement.body, 1) ||
      !(statement.body.expression instanceof compiler.AST_Dot) ||
      statement.body.expression.property !== "append" ||
      !lexicalSymbol(compiler, statement.body.expression.expression) ||
      statement.body.expression.expression.name !== outputName) return null;
  return statement.body.args[0];
}

function containsSymbol(compiler: any, root: any, name: string): boolean {
  const seen = new Set<any>();
  const visit = (value: any): boolean => {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    if (value instanceof compiler.AST_SymbolRef && value.name === name) return true;
    if (Array.isArray(value)) return value.some(visit);
    for (const [key, child] of Object.entries(value)) {
      if (["start", "end", "scope", "thedef", "imports", "globals",
           "classes", "baselib", "optimization_ir", "optimization_region"].includes(key) ||
          typeof child === "function") continue;
      if (visit(child)) return true;
    }
    return false;
  };
  return visit(root);
}

function recognizeTransactionalSequenceTransform(
  compiler: any,
  loop: any,
  ownerFunction: any,
): ModularSequenceRecognition | null {
  if (!(loop instanceof compiler.AST_ForIn) || loop.alternative ||
      !(loop.init instanceof compiler.AST_Array) ||
      !Array.isArray(loop.init.elements) || loop.init.elements.length !== 2 ||
      !lexicalSymbol(compiler, loop.init.elements[0]) ||
      !lexicalSymbol(compiler, loop.init.elements[1])) return null;
  const [index, element] = loop.init.elements;
  const sequence = builtinIteratorCall(compiler, loop.object, "enumerate");
  if (!lexicalSymbol(compiler, sequence)) return null;
  const branch = oneStatementBody(compiler, loop.body);
  if (!(branch instanceof compiler.AST_If) || !branch.alternative) return null;
  const condition = branch.condition;
  if (!(condition instanceof compiler.AST_Binary) || condition.operator !== "==" ||
      !lexicalSymbol(compiler, condition.left) ||
      condition.left.name !== element.name ||
      !lexicalSymbol(compiler, condition.right)) return null;
  const sentinel = condition.right;

  const statementIndex = owningStatementIndex(ownerFunction, loop);
  if (statementIndex <= 0 || statementIndex + 1 >= ownerFunction.body.length ||
      !(ownerFunction.body[statementIndex + 1] instanceof compiler.AST_Return)) {
    return null;
  }
  const initializer = simpleAssignment(
    compiler,
    ownerFunction.body[statementIndex - 1],
  );
  if (!initializer || !lexicalSymbol(compiler, initializer.left) ||
      !(initializer.right instanceof compiler.AST_Array) ||
      initializer.right.is_tuple === true ||
      initializer.right.elements?.length !== 1 ||
      !lexicalSymbol(compiler, initializer.right.elements[0]) ||
      initializer.right.elements[0].name !== sentinel.name) return null;
  const outputName = initializer.left.name;
  if (!containsSymbol(
    compiler,
    ownerFunction.body[statementIndex + 1].value,
    outputName,
  )) return null;

  const whenEqual = appendArgument(
    compiler,
    oneStatementBody(compiler, branch.body),
    outputName,
  );
  const whenUnequal = appendArgument(
    compiler,
    oneStatementBody(compiler, branch.alternative),
    outputName,
  );
  if (!lexicalSymbol(compiler, whenEqual) || whenEqual.name !== sentinel.name ||
      !(whenUnequal instanceof compiler.AST_Call) ||
      !exactCallArguments(whenUnequal, 2) ||
      !lexicalSymbol(compiler, whenUnequal.expression) ||
      !lexicalSymbol(compiler, whenUnequal.args[0]) ||
      whenUnequal.args[0].name !== element.name) return null;
  const denominator = whenUnequal.args[1];
  if (!(denominator instanceof compiler.AST_Binary) || denominator.operator !== "+" ||
      !lexicalSymbol(compiler, denominator.left) ||
      denominator.left.name !== index.name ||
      !exactIntegerLiteral(compiler, denominator.right, "1")) return null;

  const names = [
    index.name,
    element.name,
    sequence.name,
    outputName,
    sentinel.name,
    whenUnequal.expression.name,
  ];
  if (new Set(names).size !== names.length) return null;
  return {
    recognized: true,
    program: {
      version: 1,
      kind: "transactional-sequence-transform",
      iteratorKind: "enumerate-one-argument",
      initializerStatementIndex: statementIndex - 1,
      indexName: index.name,
      elementName: element.name,
      sequenceName: sequence.name,
      outputName,
      sentinelName: sentinel.name,
      callbackName: whenUnequal.expression.name,
      branchShape: "sentinel-or-callback-append",
      callbackArguments: ["element", "index-plus-one"],
      publication: "return-after-loop",
      operations: ["equal", "append", "callback", "add"],
      proofGaps: [...TRANSACTIONAL_SEQUENCE_TRANSFORM_PROOF_GAPS],
    },
  };
}

/**
 * Recognize two general source shapes found by the first measured campaign.
 *
 * This is intentionally reconnaissance only.  It records exact syntax and
 * missing proofs; it neither trusts application function names nor claims an
 * executable representation.
 */
export function recognizeModularSequenceProgram(
  compiler: any,
  loop: any,
  ownerFunction: any,
): ModularSequenceRecognition {
  if (!(loop instanceof compiler.AST_ForIn)) {
    return { recognized: false, reason: "not-for-sequence-region" };
  }
  return recognizeNestedBoundedModularScan(compiler, loop) ??
    recognizeBoundedModularFold(compiler, loop, ownerFunction) ??
    recognizeTransactionalSequenceTransform(compiler, loop, ownerFunction) ??
    { recognized: false, reason: "not-canonical-modular-sequence-shape" };
}
