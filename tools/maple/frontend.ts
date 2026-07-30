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
  CallExpression,
  MapleExpression,
  MapleProgram,
  MapleStatement,
  NameExpression,
} from "./ast";

const MAPLE_WASM = "tree-sitter-maple.wasm";

export class MapleSyntaxError extends SyntaxError {
  readonly line: number;
  readonly column: number;
  readonly incomplete: boolean;

  constructor(
    message: string,
    span: SourceSpan,
    incomplete = false,
  ) {
    super(message);
    this.name = "MapleSyntaxError";
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
    throw new MapleSyntaxError(
      `Maple '${node.type}' syntax is recognized but is not supported yet`,
      sourceSpan(node),
    );
  }

  program(tree: Tree): MapleProgram {
    return {
      kind: "program",
      body: tree.rootNode.namedChildren.map((node) => this.statement(node)),
      span: sourceSpan(tree.rootNode),
    };
  }

  private block(node: SyntaxNode): MapleStatement[] {
    return node.childrenForFieldName("body")
      .filter((child) => child.isNamed)
      .map((child) => this.statement(child));
  }

  private name(node: SyntaxNode): NameExpression {
    return {
      kind: "name",
      name: this.text(node),
      span: sourceSpan(node),
    };
  }

  private terminator(node: SyntaxNode): boolean {
    return node.childForFieldName("terminator")?.text === ":";
  }

  statement(node: SyntaxNode): MapleStatement {
    switch (node.type) {
      case "assignment_statement": {
        const target = node.childForFieldName("target");
        const value = node.childForFieldName("value");
        if (!target || !value) return this.unsupported(node);
        return {
          kind: "assignment",
          target: this.name(target),
          value: this.expression(value),
          suppressOutput: this.terminator(node),
          span: sourceSpan(node),
        };
      }
      case "expression_statement": {
        const expression = node.childForFieldName("expression");
        if (!expression) return this.unsupported(node);
        return {
          kind: "expression",
          expression: this.expression(expression),
          suppressOutput: this.terminator(node),
          span: sourceSpan(node),
        };
      }
      case "if_statement": {
        const condition = node.childForFieldName("condition");
        if (!condition) return this.unsupported(node);
        const branches = [{
          condition: this.expression(condition),
          body: this.block(node),
        }];
        for (
          const clause of node.namedChildren.filter((child) =>
            child.type === "elif_clause"
          )
        ) {
          const clauseCondition = clause.childForFieldName("condition");
          if (!clauseCondition) return this.unsupported(clause);
          branches.push({
            condition: this.expression(clauseCondition),
            body: this.block(clause),
          });
        }
        const otherwise = node.namedChildren.find((child) =>
          child.type === "else_clause"
        );
        return {
          kind: "if",
          branches,
          otherwise: otherwise ? this.block(otherwise) : [],
          span: sourceSpan(node),
        };
      }
      case "for_statement": {
        const variable = node.childForFieldName("variable");
        const start = node.childForFieldName("start");
        const stop = node.childForFieldName("stop");
        if (!variable || !stop) return this.unsupported(node);
        return {
          kind: "for",
          variable: this.name(variable),
          start: start
            ? this.expression(start)
            : {
              kind: "literal",
              value: "1",
              literalKind: "number",
              span: sourceSpan(variable),
            },
          stop: this.expression(stop),
          step: node.childForFieldName("step")
            ? this.expression(node.childForFieldName("step")!)
            : undefined,
          body: this.block(node),
          span: sourceSpan(node),
        };
      }
      default:
        return this.unsupported(node);
    }
  }

  expression(node: SyntaxNode): MapleExpression {
    switch (node.type) {
      case "identifier":
        return this.name(node);
      case "number":
      case "string":
      case "boolean":
        return {
          kind: "literal",
          value: this.text(node),
          literalKind: node.type,
          span: sourceSpan(node),
        };
      case "list":
      case "set":
        return {
          kind: "collection",
          collectionKind: node.type,
          elements: node.namedChildren.map((child) =>
            this.expression(child)
          ),
          span: sourceSpan(node),
        };
      case "call": {
        const callee = node.childForFieldName("function");
        if (!callee) return this.unsupported(node);
        return {
          kind: "call",
          callee: this.expression(callee),
          arguments: node.childrenForFieldName("arguments")
            .filter((child) => child.isNamed)
            .map((child) => this.expression(child)),
          span: sourceSpan(node),
        };
      }
      case "arrow_expression": {
        const parameters = node.childForFieldName("parameters");
        const body = node.childForFieldName("body");
        if (!parameters || !body) return this.unsupported(node);
        return {
          kind: "lambda",
          parameters: parameters.type === "identifier"
            ? [this.name(parameters)]
            : parameters.namedChildren.map((child) => this.name(child)),
          body: this.expression(body),
          span: sourceSpan(node),
        };
      }
      case "unary_expression": {
        const operand = node.childForFieldName("operand");
        const operator = node.childForFieldName("operator");
        if (!operand || !operator) return this.unsupported(node);
        return {
          kind: "unary",
          operator: this.text(operator),
          operand: this.expression(operand),
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
          operator: this.text(operator),
          left: this.expression(left),
          right: this.expression(right),
          span: sourceSpan(node),
        };
      }
      case "parenthesized_expression": {
        const child = node.namedChildren[0];
        if (!child) return this.unsupported(node);
        return this.expression(child);
      }
      default:
        return this.unsupported(node);
    }
  }
}

class SageLowerer {
  program(program: MapleProgram, captureResult = false): string {
    const lastIndex = program.body.length - 1;
    const lines = [
      "import maple as _maple",
      ...program.body.map((statement, index) =>
        this.statement(
          statement,
          0,
          captureResult && index === lastIndex,
        )
      ),
    ];
    lines.push("");
    return lines.join("\n");
  }

  private statements(statements: MapleStatement[], depth: number): string {
    if (!statements.length) return `${"    ".repeat(depth)}pass`;
    return statements.map((statement) => this.statement(statement, depth))
      .join("\n");
  }

  private statement(
    statement: MapleStatement,
    depth: number,
    asResult = false,
  ): string {
    const indentation = "    ".repeat(depth);
    switch (statement.kind) {
      case "assignment": {
        const assignment = `${indentation}${statement.target.name} = ${
          this.expression(statement.value)
        }`;
        return statement.suppressOutput
          ? assignment
          : `${assignment}\n${indentation}print(${statement.target.name})`;
      }
      case "expression": {
        const expression = `${indentation}${
          this.expression(statement.expression)
        }`;
        return statement.suppressOutput
          ? expression
          : asResult
          ? expression
          : `${indentation}print(${this.expression(statement.expression)})`;
      }
      case "if": {
        let output = "";
        statement.branches.forEach((branch, index) => {
          output += `${indentation}${index ? "elif" : "if"} ${
            this.expression(branch.condition)
          }:\n${this.statements(branch.body, depth + 1)}\n`;
        });
        if (statement.otherwise.length) {
          output += `${indentation}else:\n${
            this.statements(statement.otherwise, depth + 1)
          }`;
        }
        return output.trimEnd();
      }
      case "for":
        return `${indentation}for ${statement.variable.name} in _maple.maple_range(${
          this.expression(statement.start)
        }, ${this.expression(statement.stop)}${
          statement.step ? `, ${this.expression(statement.step)}` : ""
        }):\n${this.statements(statement.body, depth + 1)}`;
    }
  }

  private call(expression: CallExpression): string {
    if (expression.callee.kind !== "name") {
      return `${this.expression(expression.callee)}(${
        expression.arguments.map((argument) => this.expression(argument))
          .join(", ")
      })`;
    }
    const name = expression.callee.name;
    if (name === "seq") return this.sequence(expression);
    if (name === "plot") return this.plot(expression);
    const direct: Record<string, string> = {
      cos: "cos",
      exp: "exp",
      factor: "factor",
      isprime: "is_prime",
      ithprime: "_maple.ithprime",
      ln: "log",
      nops: "_maple.nops",
      sin: "sin",
      sqrt: "sqrt",
      tan: "tan",
      whattype: "_maple.whattype",
    };
    const target = direct[name] ?? name;
    return `${target}(${
      expression.arguments.map((argument) => this.expression(argument))
        .join(", ")
    })`;
  }

  private iterator(expression: CallExpression, operation: string) {
    const equation = expression.arguments[1];
    if (
      !equation ||
      equation.kind !== "binary" ||
      equation.operator !== "=" ||
      equation.left.kind !== "name" ||
      equation.right.kind !== "binary" ||
      equation.right.operator !== ".."
    ) {
      throw new MapleSyntaxError(
        `${operation} currently requires variable = start .. stop`,
        expression.span,
      );
    }
    return {
      variable: equation.left.name,
      start: this.expression(equation.right.left),
      stop: this.expression(equation.right.right),
    };
  }

  private sequence(expression: CallExpression): string {
    if (expression.arguments.length !== 2) {
      throw new MapleSyntaxError(
        "seq currently requires an expression and one iterator",
        expression.span,
      );
    }
    const iterator = this.iterator(expression, "seq");
    return `_maple.seq(lambda ${iterator.variable}: ${
      this.expression(expression.arguments[0])
    }, ${iterator.start}, ${iterator.stop})`;
  }

  private plot(expression: CallExpression): string {
    if (expression.arguments.length < 2) {
      throw new MapleSyntaxError(
        "plot currently requires an expression and a range",
        expression.span,
      );
    }
    const iterator = this.iterator(expression, "plot");
    return `plot(${this.expression(expression.arguments[0])}, (${
      iterator.variable
    }, ${iterator.start}, ${iterator.stop}))`;
  }

  private binary(expression: BinaryExpression): string {
    const operators: Record<string, string> = {
      "+": "+",
      "-": "-",
      "*": "*",
      "/": "/",
      "^": "^",
      "=": "==",
      "<>": "!=",
      "<": "<",
      "<=": "<=",
      ">": ">",
      ">=": ">=",
      "and": "and",
      "or": "or",
      "xor": "!=",
      "in": "in",
      "mod": "%",
      "..": "..",
    };
    const operator = operators[expression.operator];
    if (!operator || operator === "..") {
      throw new MapleSyntaxError(
        `Maple operator '${expression.operator}' is only supported in an iterator`,
        expression.span,
      );
    }
    return `(${this.expression(expression.left)} ${operator} ${
      this.expression(expression.right)
    })`;
  }

  private expression(expression: MapleExpression): string {
    switch (expression.kind) {
      case "name": {
        const constants: Record<string, string> = {
          Catalan: "_maple.CATALAN",
          I: "sqrt(-1)",
          Pi: "pi",
          infinity: "_maple.infinity",
        };
        return constants[expression.name] ?? expression.name;
      }
      case "literal":
        if (expression.literalKind === "boolean") {
          return expression.value === "true"
            ? "True"
            : expression.value === "false" ? "False" : "None";
        }
        return expression.value;
      case "collection":
        return expression.collectionKind === "list"
          ? `[${expression.elements.map((element) =>
            this.expression(element)
          ).join(", ")}]`
          : `{${expression.elements.map((element) =>
            this.expression(element)
          ).join(", ")}}`;
      case "call":
        return this.call(expression);
      case "lambda":
        return `lambda ${
          expression.parameters.map((parameter) => parameter.name).join(", ")
        }: ${this.expression(expression.body)}`;
      case "unary":
        if (expression.operator === "!") {
          return `_maple.factorial(${this.expression(expression.operand)})`;
        }
        return `(${expression.operator === "not" ? "not " : expression.operator}${
          this.expression(expression.operand)
        })`;
      case "binary":
        return this.binary(expression);
    }
  }
}

let frontendPromise: Promise<ForeignFrontend> | undefined;

export function createMapleFrontend(): Promise<ForeignFrontend> {
  frontendPromise ??= (async () => {
    const parser = await createTreeSitterParser(MAPLE_WASM);

    function parse(source: string): MapleProgram {
      const tree = parser.parse(source);
      if (!tree) throw new Error("Tree-sitter did not return a Maple tree");
      try {
        if (tree.rootNode.hasError) {
          const error = firstSyntaxError(tree.rootNode) ?? tree.rootNode;
          const incomplete = error.isMissing ||
            error.endIndex >= source.trimEnd().length;
          throw new MapleSyntaxError(
            error.isMissing
              ? `expected ${error.type.replace(/^"|"$/g, "")}`
              : "invalid or incomplete Maple syntax",
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
      language: "maple",
      parse,
      lower(
        source: string,
        options: ForeignLowerOptions = {},
      ): ForeignLowering {
        const ast = parse(source);
        const last = ast.body.at(-1);
        return {
          ast,
          source: new SageLowerer().program(ast, options.captureResult),
          hasResult: options.captureResult &&
            last?.kind === "expression" &&
            !last.suppressOutput,
        };
      },
    };
  })();
  return frontendPromise;
}
