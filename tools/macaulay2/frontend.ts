import { Node as SyntaxNode, Tree } from "web-tree-sitter";
import {
  createTreeSitterParser,
  firstSyntaxError,
  sourceSpan,
  SourceSpan,
} from "../foreign/tree-sitter";
import {
  ForeignFrontend,
  ForeignLowering,
  ForeignLowerOptions,
} from "../foreign/types";
import {
  BinaryExpression,
  Macaulay2Expression,
  Macaulay2Program,
  Macaulay2Statement,
} from "./ast";

const MACAULAY2_WASM = "tree-sitter-macaulay2.wasm";

export class Macaulay2SyntaxError extends SyntaxError {
  readonly line: number;
  readonly column: number;
  readonly incomplete: boolean;

  constructor(message: string, span: SourceSpan, incomplete = false) {
    super(message);
    this.name = "Macaulay2SyntaxError";
    this.line = span.start.line;
    this.column = span.start.column;
    this.incomplete = incomplete;
  }

  override toString(): string {
    return `${this.name}: ${this.line}:${this.column}: ${this.message}`;
  }
}

class AstBuilder {
  constructor(private readonly source: string) {}

  private text(node: SyntaxNode): string {
    return this.source.slice(node.startIndex, node.endIndex);
  }

  private unsupported(node: SyntaxNode): never {
    throw new Macaulay2SyntaxError(
      `Macaulay2 '${node.type}' syntax is recognized but is not supported yet`,
      sourceSpan(node),
    );
  }

  program(tree: Tree): Macaulay2Program {
    const body: Macaulay2Statement[] = [];
    for (const cell of tree.rootNode.namedChildren) {
      const node = cell.namedChildren[0];
      if (!node) continue;
      const muted = node.type === "muted";
      const expressionNode = muted ? node.namedChildren[0] : node;
      if (!expressionNode) continue;
      body.push({
        kind: "statement",
        expression: this.expression(expressionNode),
        suppressOutput: muted,
        span: sourceSpan(node),
      });
    }
    return { kind: "program", body, span: sourceSpan(tree.rootNode) };
  }

  expression(node: SyntaxNode): Macaulay2Expression {
    switch (node.type) {
      case "symbol":
        return { kind: "name", name: this.text(node), span: sourceSpan(node) };
      case "integer_literal":
      case "float_literal":
      case "string_literal":
        return {
          kind: "literal",
          value: this.text(node),
          literalKind: node.type === "integer_literal"
            ? "integer"
            : node.type === "float_literal" ? "float" : "string",
          span: sourceSpan(node),
        };
      case "array":
      case "list":
      case "sequence":
        return {
          kind: "collection",
          collectionKind: node.type,
          elements: node.namedChildren
            .filter((child) => child.type !== "null")
            .map((child) =>
              this.expression(
                child.type === "muted" ? child.namedChildren[0] : child,
              )
            ),
          span: sourceSpan(node),
        };
      case "parenthesized_expression": {
        const child = node.namedChildren[0];
        if (!child) return this.unsupported(node);
        return this.expression(child.type === "muted"
          ? child.namedChildren[0]
          : child);
      }
      case "prefix_expression":
      case "postfix_expression": {
        const operand = node.childForFieldName("operand");
        const operator = node.childForFieldName("operator");
        if (!operand || !operator) return this.unsupported(node);
        return {
          kind: "unary",
          operator: operator.type === "SPACE" ? "SPACE" : this.text(operator),
          operand: this.expression(operand),
          postfix: node.type === "postfix_expression",
          span: sourceSpan(node),
        };
      }
      case "binary_expression": {
        const left = node.childForFieldName("left");
        const right = node.childForFieldName("right");
        const operator = node.childForFieldName("operator");
        if (!left || !right || !operator) return this.unsupported(node);
        return {
          kind: "binary",
          operator: operator.type === "SPACE" ? "SPACE" : this.text(operator),
          left: this.expression(left),
          right: this.expression(right),
          span: sourceSpan(node),
        };
      }
      default:
        return this.unsupported(node);
    }
  }
}

class SageLowerer {
  program(program: Macaulay2Program, captureResult = false): string {
    const lines = ["import macaulay2 as _m2"];
    const lastIndex = program.body.length - 1;
    program.body.forEach((statement, index) => {
      lines.push(...this.statement(
        statement,
        captureResult && index === lastIndex,
      ));
    });
    lines.push("");
    return lines.join("\n");
  }

  private polynomialRingAssignment(
    expression: BinaryExpression,
  ): { target: string; base: string; names: string[] } | undefined {
    if (
      expression.operator !== "=" ||
      expression.left.kind !== "name" ||
      expression.right.kind !== "binary" ||
      expression.right.operator !== "SPACE" ||
      expression.right.left.kind !== "name" ||
      !["QQ", "ZZ"].includes(expression.right.left.name) ||
      expression.right.right.kind !== "collection" ||
      expression.right.right.collectionKind !== "array" ||
      expression.right.right.elements.some((item) => item.kind !== "name")
    ) return undefined;
    return {
      target: expression.left.name,
      base: expression.right.left.name,
      names: expression.right.right.elements.map((item) =>
        item.kind === "name" ? item.name : ""
      ),
    };
  }

  private statement(statement: Macaulay2Statement, asResult: boolean): string[] {
    const ring = statement.expression.kind === "binary"
      ? this.polynomialRingAssignment(statement.expression)
      : undefined;
    if (ring) {
      const names = `(${ring.names.map((name) => JSON.stringify(name)).join(", ")}${
        ring.names.length === 1 ? "," : ""
      })`;
      const lines = [
        `${ring.target} = _m2.polynomial_ring(${ring.base}, ${names})`,
        `${ring.names.join(", ")}${ring.names.length === 1 ? "," : ""} = ${ring.target}.gens()`,
      ];
      if (!statement.suppressOutput) lines.push(`print(${ring.target})`);
      return lines;
    }

    if (
      statement.expression.kind === "binary" &&
      ["=", ":="].includes(statement.expression.operator) &&
      statement.expression.left.kind === "name"
    ) {
      const target = statement.expression.left.name;
      const assignment = `${target} = ${this.expression(statement.expression.right)}`;
      return statement.suppressOutput
        ? [assignment]
        : [assignment, `print(${target})`];
    }

    const value = this.expression(statement.expression);
    if (statement.suppressOutput || asResult) return [value];
    return [`print(${value})`];
  }

  private callTarget(expression: Macaulay2Expression): string {
    if (expression.kind !== "name") return this.expression(expression);
    const helpers = new Set([
      "degree",
      "dim",
      "gb",
      "gens",
      "ideal",
      "mingens",
      "numgens",
    ]);
    return helpers.has(expression.name)
      ? `_m2.${expression.name}`
      : expression.name;
  }

  private binary(expression: BinaryExpression): string {
    if (expression.operator === "SPACE") {
      const target = this.callTarget(expression.left);
      if (
        expression.right.kind === "collection" &&
        expression.right.collectionKind === "sequence"
      ) {
        return `${target}(${expression.right.elements.map((item) =>
          this.expression(item)
        ).join(", ")})`;
      }
      return `${target}(${this.expression(expression.right)})`;
    }
    if (expression.operator === ".") {
      return `${this.expression(expression.left)}.${this.expression(expression.right)}`;
    }
    const operators: Record<string, string> = {
      "+": "+",
      "-": "-",
      "*": "*",
      "**": "*",
      "/": "/",
      "%": "%",
      "^": "^",
      "==": "==",
      "!=": "!=",
      "<": "<",
      "<=": "<=",
      ">": ">",
      ">=": ">=",
      "and": "and",
      "or": "or",
    };
    const operator = operators[expression.operator];
    if (!operator) {
      throw new Macaulay2SyntaxError(
        `Macaulay2 operator '${expression.operator}' is recognized but is not supported yet`,
        expression.span,
      );
    }
    return `(${this.expression(expression.left)} ${operator} ${
      this.expression(expression.right)
    })`;
  }

  private expression(expression: Macaulay2Expression): string {
    switch (expression.kind) {
      case "name": {
        const constants: Record<string, string> = {
          false: "False",
          null: "None",
          true: "True",
        };
        return constants[expression.name] ?? expression.name;
      }
      case "literal":
        if (expression.literalKind === "string" &&
          expression.value.startsWith("///")) {
          return JSON.stringify(expression.value.slice(3, -3));
        }
        return expression.value;
      case "collection": {
        const values = expression.elements.map((item) => this.expression(item));
        if (expression.collectionKind === "sequence") {
          return `(${values.join(", ")}${values.length === 1 ? "," : ""})`;
        }
        return `[${values.join(", ")}]`;
      }
      case "unary":
        if (expression.postfix && expression.operator === "!") {
          return `factorial(${this.expression(expression.operand)})`;
        }
        if (!expression.postfix && ["+", "-", "not"].includes(
          expression.operator,
        )) {
          return `(${expression.operator}${expression.operator === "not" ? " " : ""}${
            this.expression(expression.operand)
          })`;
        }
        throw new Macaulay2SyntaxError(
          `Macaulay2 operator '${expression.operator}' is recognized but is not supported yet`,
          expression.span,
        );
      case "binary":
        return this.binary(expression);
    }
  }
}

let frontendPromise: Promise<ForeignFrontend> | undefined;

export function createMacaulay2Frontend(): Promise<ForeignFrontend> {
  frontendPromise ??= (async () => {
    const parser = await createTreeSitterParser(MACAULAY2_WASM);

    function parse(source: string): Macaulay2Program {
      const tree = parser.parse(source);
      if (!tree) throw new Error("Tree-sitter did not return a Macaulay2 tree");
      try {
        if (tree.rootNode.hasError) {
          const error = firstSyntaxError(tree.rootNode) ?? tree.rootNode;
          const incomplete = error.isMissing ||
            error.endIndex >= source.trimEnd().length;
          throw new Macaulay2SyntaxError(
            error.isMissing
              ? `expected ${error.type.replace(/^"|"$/g, "")}`
              : "invalid or incomplete Macaulay2 syntax",
            sourceSpan(error),
            incomplete,
          );
        }
        return new AstBuilder(source).program(tree);
      } finally {
        tree.delete();
      }
    }

    return {
      language: "macaulay2",
      parse,
      lower(
        source: string,
        options: ForeignLowerOptions = {},
      ): ForeignLowering {
        const ast = parse(source);
        const last = ast.body.at(-1);
        const lastIsAssignment = last?.expression.kind === "binary" &&
          ["=", ":="].includes(last.expression.operator);
        return {
          ast,
          source: new SageLowerer().program(ast, options.captureResult),
          hasResult: options.captureResult && !!last &&
            !last.suppressOutput && !lastIsAssignment,
        };
      },
    };
  })();
  return frontendPromise;
}
