import {
  binary64NestedAllProofGaps,
  Binary64NestedAllPredicateKind,
  Binary64NestedAllRecognition,
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

function structuralBuiltinAllGenerator(compiler: any, node: any): any | null {
  if (!(node instanceof compiler.AST_Call) ||
      !(node.expression instanceof compiler.AST_SymbolRef) ||
      node.expression.name !== "all" ||
      node.expression.python_identifier === false ||
      node.expression.python_lexical_binding !== false ||
      node.expression.python_resolution_provenance !== "module" ||
      !exactCallArguments(node, 1) ||
      !(node.args[0] instanceof compiler.AST_GeneratorComprehension)) {
    return null;
  }
  return node.args[0];
}

function structuralMathIsfiniteArgument(
  compiler: any,
  node: any,
): any | null {
  if (!(node instanceof compiler.AST_Call) || !exactCallArguments(node, 1) ||
      !(node.expression instanceof compiler.AST_Dot) ||
      node.expression.property !== "isfinite" ||
      !(node.expression.expression instanceof compiler.AST_SymbolRef) ||
      node.expression.expression.name !== "math" ||
      node.expression.expression.python_identifier === false ||
      node.expression.expression.python_lexical_binding !== true ||
      node.expression.expression.python_resolution_provenance !== "module") {
    return null;
  }
  return node.args[0];
}

function exactIntegerLiteral(
  compiler: any,
  node: any,
  expected: string,
): boolean {
  return node instanceof compiler.AST_Call &&
    node.expression instanceof compiler.AST_SymbolRef &&
    node.expression.name === "Integer" &&
    exactCallArguments(node, 1) &&
    node.args[0] instanceof compiler.AST_String &&
    node.args[0].value === expected;
}

function indexedElement(
  compiler: any,
  node: any,
  elementName: string,
  index: "0" | "1",
): boolean {
  return node instanceof compiler.AST_ItemAccess && node.assignment == null &&
    lexicalSymbol(compiler, node.expression) &&
    node.expression.name === elementName &&
    exactIntegerLiteral(compiler, node.property, index);
}

function predicateKind(
  compiler: any,
  statement: any,
  innerElementName: string,
): Binary64NestedAllPredicateKind | null {
  const scalarArgument = structuralMathIsfiniteArgument(compiler, statement);
  if (lexicalSymbol(compiler, scalarArgument) &&
      scalarArgument.name === innerElementName) {
    return "scalar-isfinite";
  }
  if (!(statement instanceof compiler.AST_Binary) ||
      statement.operator !== "&&" || statement.native_operator === true) {
    return null;
  }
  const left = structuralMathIsfiniteArgument(compiler, statement.left);
  const right = structuralMathIsfiniteArgument(compiler, statement.right);
  if (!indexedElement(compiler, left, innerElementName, "0") ||
      !indexedElement(compiler, right, innerElementName, "1")) return null;
  return "fixed-pair-isfinite";
}

/**
 * Recognize only the syntax shared by the production scalar and vector-grid
 * finiteness scans.  The result deliberately proves neither callable identity
 * nor representation/iteration semantics and therefore cannot lower code.
 */
export function recognizeBinary64NestedAllProgram(
  compiler: any,
  node: any,
): Binary64NestedAllRecognition {
  const generator = structuralBuiltinAllGenerator(compiler, node);
  const clauses = generator?.clauses;
  if (!Array.isArray(clauses) || clauses.length !== 2 ||
      generator.condition != null) {
    return { recognized: false, reason: "not-nested-binary64-all-shape" };
  }
  const [outer, inner] = clauses;
  if (outer?.is_async || inner?.is_async || outer?.name != null ||
      inner?.name != null || !Array.isArray(outer?.conditions) ||
      outer.conditions.length !== 0 || !Array.isArray(inner?.conditions) ||
      inner.conditions.length !== 0 ||
      !lexicalSymbol(compiler, outer.init) ||
      !lexicalSymbol(compiler, outer.object) ||
      !lexicalSymbol(compiler, inner.init) ||
      !lexicalSymbol(compiler, inner.object) ||
      inner.object.name !== outer.init.name) {
    return { recognized: false, reason: "not-nested-binary64-all-shape" };
  }
  const names = [outer.object.name, outer.init.name, inner.init.name];
  if (new Set(names).size !== names.length) {
    return { recognized: false, reason: "not-nested-binary64-all-shape" };
  }
  const recognizedPredicate = predicateKind(
    compiler,
    generator.statement,
    inner.init.name,
  );
  if (!recognizedPredicate) {
    return { recognized: false, reason: "not-nested-binary64-all-shape" };
  }
  return {
    recognized: true,
    program: {
      version: 1,
      kind: "nested-binary64-all",
      traversalKind: "two-clause-generator-under-builtin-all",
      predicateKind: recognizedPredicate,
      outerSequenceName: outer.object.name,
      outerElementName: outer.init.name,
      innerElementName: inner.init.name,
      pairIndices: recognizedPredicate === "fixed-pair-isfinite" ? [0, 1] : [],
      operations: recognizedPredicate === "fixed-pair-isfinite"
        ? [
          "builtin-all", "iterate-outer", "iterate-inner", "getitem-0",
          "call-math-isfinite", "boolean-and", "getitem-1",
          "call-math-isfinite-second", "short-circuit",
        ]
        : [
          "builtin-all", "iterate-outer", "iterate-inner",
          "call-math-isfinite", "short-circuit",
        ],
      proofGaps: [...binary64NestedAllProofGaps(recognizedPredicate)],
    },
  };
}
