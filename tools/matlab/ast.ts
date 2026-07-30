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
  literalKind: "number" | "string";
}

export interface MatrixExpression extends NodeBase {
  kind: "matrix";
  rows: MatlabExpression[][];
}

export interface CallExpression extends NodeBase {
  kind: "call";
  callee: MatlabExpression;
  arguments: MatlabExpression[];
}

export interface RangeExpression extends NodeBase {
  kind: "range";
  start: MatlabExpression;
  stop: MatlabExpression;
  step?: MatlabExpression;
}

export interface UnaryExpression extends NodeBase {
  kind: "unary";
  operator: string;
  operand: MatlabExpression;
}

export interface BinaryExpression extends NodeBase {
  kind: "binary";
  operator: string;
  left: MatlabExpression;
  right: MatlabExpression;
}

export type MatlabExpression =
  | NameExpression
  | LiteralExpression
  | MatrixExpression
  | CallExpression
  | RangeExpression
  | UnaryExpression
  | BinaryExpression;

export interface AssignmentStatement extends NodeBase {
  kind: "assignment";
  target: MatlabExpression;
  value: MatlabExpression;
  suppressOutput: boolean;
}

export interface ExpressionStatement extends NodeBase {
  kind: "expression";
  expression: MatlabExpression;
  suppressOutput: boolean;
}

export type MatlabStatement =
  | AssignmentStatement
  | ExpressionStatement;

export interface MatlabProgram extends NodeBase {
  kind: "program";
  body: MatlabStatement[];
}
