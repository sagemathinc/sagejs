import { SourceSpan } from "../foreign/tree-sitter";

interface NodeBase {
  span: SourceSpan;
}

export interface NameExpression extends NodeBase {
  kind: "name";
  name: string;
}

export interface LiteralExpression extends NodeBase {
  kind: "literal";
  value: string;
  literalKind: "integer" | "float" | "string";
}

export interface CollectionExpression extends NodeBase {
  kind: "collection";
  collectionKind: "array" | "list" | "sequence";
  elements: Macaulay2Expression[];
}

export interface UnaryExpression extends NodeBase {
  kind: "unary";
  operator: string;
  operand: Macaulay2Expression;
  postfix: boolean;
}

export interface BinaryExpression extends NodeBase {
  kind: "binary";
  operator: string;
  left: Macaulay2Expression;
  right: Macaulay2Expression;
}

export type Macaulay2Expression =
  | NameExpression
  | LiteralExpression
  | CollectionExpression
  | UnaryExpression
  | BinaryExpression;

export interface Macaulay2Statement extends NodeBase {
  kind: "statement";
  expression: Macaulay2Expression;
  suppressOutput: boolean;
}

export interface Macaulay2Program extends NodeBase {
  kind: "program";
  body: Macaulay2Statement[];
}
