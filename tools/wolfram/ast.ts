import { SourceSpan } from "../foreign/tree-sitter";

interface NodeBase {
  span: SourceSpan;
}

export interface SymbolExpression extends NodeBase {
  kind: "symbol";
  name: string;
}

export interface LiteralExpression extends NodeBase {
  kind: "literal";
  value: string;
  literalKind: "integer" | "real" | "string";
}

export interface ListExpression extends NodeBase {
  kind: "list";
  elements: WolframExpression[];
}

export interface CallExpression extends NodeBase {
  kind: "call";
  head: WolframExpression;
  arguments: WolframExpression[];
}

export interface UnaryExpression extends NodeBase {
  kind: "unary";
  operator: string;
  operand: WolframExpression;
}

export interface BinaryExpression extends NodeBase {
  kind: "binary";
  operator: string;
  left: WolframExpression;
  right: WolframExpression;
}

export interface PatternExpression extends NodeBase {
  kind: "pattern";
  name: string;
}

export interface SuppressedExpression extends NodeBase {
  kind: "suppressed";
  expression: WolframExpression;
}

export type WolframExpression =
  | SymbolExpression
  | LiteralExpression
  | ListExpression
  | CallExpression
  | UnaryExpression
  | BinaryExpression
  | PatternExpression
  | SuppressedExpression;

export interface WolframProgram extends NodeBase {
  kind: "program";
  body: WolframExpression[];
}
