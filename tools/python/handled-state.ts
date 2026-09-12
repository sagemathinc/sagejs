import type { Node as SyntaxNode } from "web-tree-sitter";

// This is deliberately a proof of absence of owned handlers, not liveness
// analysis. Even a try whose handler exits before yield remains wrapped.
// Unknown syntax must not silently acquire an exemption when lowering grows.
const handlerFreeNodes = new Set([
  "block", "expression_statement", "return_statement", "raise_statement",
  "pass_statement", "break_statement", "continue_statement", "assert_statement",
  "delete_statement", "global_statement", "nonlocal_statement",
  "if_statement", "elif_clause", "else_clause", "while_statement", "for_statement",
  "assignment", "augmented_assignment", "named_expression", "yield", "await",
  "identifier", "integer", "float", "true", "false", "none", "ellipsis",
  "binary_operator", "unary_operator", "boolean_operator", "not_operator",
  "comparison_operator", "conditional_expression", "parenthesized_expression",
  "call", "argument_list", "keyword_argument", "attribute", "subscript", "slice",
  "tuple", "list", "set", "dictionary", "pair", "expression_list",
  "pattern_list", "tuple_pattern", "list_pattern", "list_splat_pattern",
  "list_splat", "dictionary_splat", "dictionary_splat_pattern",
  "list_comprehension", "set_comprehension", "dictionary_comprehension",
  "generator_expression", "for_in_clause", "if_clause",
  "parameters", "lambda_parameters", "default_parameter", "typed_parameter",
  "typed_default_parameter", "type", "decorated_definition", "decorator",
  "comment", "line_continuation",
]);

/** Missing/unknown/raw syntax retains ownership wrapping. */
export function generatorNeedsHandledState(body: SyntaxNode | null): boolean {
  if (!body) return true;
  const visit = (node: SyntaxNode): boolean => {
    if (node.type === "function_definition" || node.type === "lambda") {
      // Nested bodies own their own decision. Defaults, decorators and other
      // definition-time expressions still execute in the enclosing scope.
      const nestedBody = node.childForFieldName("body");
      return node.namedChildren.some(child =>
        child.id !== nestedBody?.id && visit(child)
      );
    }
    // Ordinary strings could contain escape syntax or evolve into native
    // emission. Keep all strings/f-strings conservative in this first tranche.
    // Try, with (including async with), class bodies, imports and new syntax
    // are likewise intentionally outside the narrow proof.
    if (!handlerFreeNodes.has(node.type)) return true;
    return node.namedChildren.some(visit);
  };
  return visit(body);
}
