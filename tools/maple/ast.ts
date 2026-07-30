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
  literalKind: "number" | "string" | "boolean";
}

export interface CollectionExpression extends NodeBase {
  kind: "collection";
  collectionKind: "list" | "set";
  elements: MapleExpression[];
}

export interface CallExpression extends NodeBase {
  kind: "call";
  callee: MapleExpression;
  arguments: MapleExpression[];
}

export interface LambdaExpression extends NodeBase {
  kind: "lambda";
  parameters: NameExpression[];
  body: MapleExpression;
}

export interface UnaryExpression extends NodeBase {
  kind: "unary";
  operator: string;
  operand: MapleExpression;
}

export interface BinaryExpression extends NodeBase {
  kind: "binary";
  operator: string;
  left: MapleExpression;
  right: MapleExpression;
}

export type MapleExpression =
  | NameExpression
  | LiteralExpression
  | CollectionExpression
  | CallExpression
  | LambdaExpression
  | UnaryExpression
  | BinaryExpression;

export interface AssignmentStatement extends NodeBase {
  kind: "assignment";
  target: NameExpression;
  value: MapleExpression;
  suppressOutput: boolean;
}

export interface ExpressionStatement extends NodeBase {
  kind: "expression";
  expression: MapleExpression;
  suppressOutput: boolean;
}

export interface IfStatement extends NodeBase {
  kind: "if";
  branches: {
    condition: MapleExpression;
    body: MapleStatement[];
  }[];
  otherwise: MapleStatement[];
}

export interface ForStatement extends NodeBase {
  kind: "for";
  variable: NameExpression;
  start: MapleExpression;
  stop: MapleExpression;
  step?: MapleExpression;
  body: MapleStatement[];
}

export type MapleStatement =
  | AssignmentStatement
  | ExpressionStatement
  | IfStatement
  | ForStatement;

export interface MapleProgram extends NodeBase {
  kind: "program";
  body: MapleStatement[];
}
