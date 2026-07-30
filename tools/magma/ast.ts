import { SourceSpan } from "../foreign/tree-sitter";

export type { SourceSpan } from "../foreign/tree-sitter";

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
  literalKind: "integer" | "real" | "string" | "boolean";
}

export interface UnaryExpression extends NodeBase {
  kind: "unary";
  operator: string;
  operand: MagmaExpression;
}

export interface BinaryExpression extends NodeBase {
  kind: "binary";
  operator: string;
  left: MagmaExpression;
  right: MagmaExpression;
}

export interface CallExpression extends NodeBase {
  kind: "call";
  callee: MagmaExpression;
  arguments: MagmaExpression[];
}

export interface AggregateExpression extends NodeBase {
  kind: "aggregate";
  aggregateKind: "sequence" | "set" | "tuple";
  elements: MagmaExpression[];
}

export interface RangeExpression extends NodeBase {
  kind: "range";
  start: MagmaExpression;
  end: MagmaExpression;
  step?: MagmaExpression;
}

export interface IndexExpression extends NodeBase {
  kind: "index";
  value: MagmaExpression;
  indices: MagmaExpression[];
}

export type MagmaExpression =
  | NameExpression
  | LiteralExpression
  | UnaryExpression
  | BinaryExpression
  | CallExpression
  | AggregateExpression
  | RangeExpression
  | IndexExpression;

export interface AssignmentStatement extends NodeBase {
  kind: "assignment";
  targets: MagmaExpression[];
  values: MagmaExpression[];
}

export interface GeneratorAssignmentStatement extends NodeBase {
  kind: "generator-assignment";
  target: NameExpression;
  generators: NameExpression[];
  value: MagmaExpression;
}

export interface ExpressionStatement extends NodeBase {
  kind: "expression-statement";
  expressions: MagmaExpression[];
}

export interface PrintStatement extends NodeBase {
  kind: "print";
  expressions: MagmaExpression[];
}

export interface IfBranch {
  condition: MagmaExpression;
  body: MagmaStatement[];
  span: SourceSpan;
}

export interface IfStatement extends NodeBase {
  kind: "if";
  branches: IfBranch[];
  otherwise: MagmaStatement[];
}

export interface ForStatement extends NodeBase {
  kind: "for";
  target: NameExpression;
  iterable: MagmaExpression;
  body: MagmaStatement[];
}

export interface WhileStatement extends NodeBase {
  kind: "while";
  condition: MagmaExpression;
  body: MagmaStatement[];
}

export interface ReturnStatement extends NodeBase {
  kind: "return";
  values: MagmaExpression[];
}

export interface FlowStatement extends NodeBase {
  kind: "break" | "continue";
}

export interface FileStatement extends NodeBase {
  kind: "load" | "attach";
  filename: string;
}

export type MagmaStatement =
  | AssignmentStatement
  | GeneratorAssignmentStatement
  | ExpressionStatement
  | PrintStatement
  | IfStatement
  | ForStatement
  | WhileStatement
  | ReturnStatement
  | FlowStatement
  | FileStatement;

export interface MagmaProgram extends NodeBase {
  kind: "program";
  body: MagmaStatement[];
}
