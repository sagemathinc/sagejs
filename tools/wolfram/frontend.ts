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
} from "../foreign/types";
import {
  BinaryExpression,
  CallExpression,
  ListExpression,
  WolframExpression,
  WolframProgram,
} from "./ast";

const WOLFRAM_WASM = "tree-sitter-wolfram.wasm";

export class WolframSyntaxError extends SyntaxError {
  readonly line: number;
  readonly column: number;
  readonly incomplete: boolean;

  constructor(
    message: string,
    span: SourceSpan,
    incomplete = false,
  ) {
    super(message);
    this.name = "WolframSyntaxError";
    this.line = span.start.line;
    this.column = span.start.column;
    this.incomplete = incomplete;
  }

  override toString(): string {
    return `${this.name}: ${this.line}:${this.column}: ${this.message}`;
  }
}

function operator(node: SyntaxNode): string {
  const named = new Set(node.namedChildren.map((child) => child.id));
  const token = node.children.find((child) =>
    !named.has(child.id) && child.text.trim()
  );
  return token?.text.trim() ?? "";
}

class AstBuilder {
  constructor(private readonly source: string) {}

  private text(node: SyntaxNode): string {
    return this.source.slice(node.startIndex, node.endIndex);
  }

  private unsupported(node: SyntaxNode): never {
    throw new WolframSyntaxError(
      `Wolfram Language '${node.type}' syntax is recognized but is not supported yet`,
      sourceSpan(node),
    );
  }

  program(tree: Tree): WolframProgram {
    return {
      kind: "program",
      body: tree.rootNode.namedChildren.map((node) => this.expression(node)),
      span: sourceSpan(tree.rootNode),
    };
  }

  private commaElements(expression: WolframExpression): WolframExpression[] {
    if (expression.kind === "binary" && expression.operator === ",") {
      return [
        ...this.commaElements(expression.left),
        ...this.commaElements(expression.right),
      ];
    }
    return [expression];
  }

  private group(node: SyntaxNode): WolframExpression {
    const child = node.namedChildren[0];
    const text = this.text(node);
    if (text.startsWith("{")) {
      const expression: ListExpression = {
        kind: "list",
        elements: child
          ? this.commaElements(this.expression(child))
          : [],
        span: sourceSpan(node),
      };
      return expression;
    }
    if (!child) {
      return {
        kind: "list",
        elements: [],
        span: sourceSpan(node),
      };
    }
    return this.expression(child);
  }

  private call(node: SyntaxNode): CallExpression {
    const head = node.childForFieldName("head");
    if (!head) return this.unsupported(node);
    const argumentsNode = node.childForFieldName("arguments");
    const arguments_ = argumentsNode
      ? this.commaElements(this.expression(argumentsNode))
      : [];
    return {
      kind: "call",
      head: this.expression(head),
      arguments: arguments_,
      span: sourceSpan(node),
    };
  }

  private binary(node: SyntaxNode): BinaryExpression {
    const children = node.namedChildren;
    if (children.length !== 2) return this.unsupported(node);
    return {
      kind: "binary",
      operator: node.type === "implicit_times" ? "*" : operator(node),
      left: this.expression(children[0]),
      right: this.expression(children[1]),
      span: sourceSpan(node),
    };
  }

  expression(node: SyntaxNode): WolframExpression {
    switch (node.type) {
      case "symbol":
        return {
          kind: "symbol",
          name: this.text(node),
          span: sourceSpan(node),
        };
      case "integer":
      case "real":
      case "string":
        return {
          kind: "literal",
          value: this.text(node),
          literalKind: node.type,
          span: sourceSpan(node),
        };
      case "group":
        return this.group(node);
      case "call":
        return this.call(node);
      case "binary":
        return this.binary(node);
      case "infix": {
        if (
          operator(node) === ";" &&
          node.namedChildren.length === 1
        ) {
          return {
            kind: "suppressed",
            expression: this.expression(node.namedChildren[0]),
            span: sourceSpan(node),
          };
        }
        const expression = this.binary(node);
        return expression;
      }
      case "implicit_times":
        return this.binary(node);
      case "prefix": {
        const child = node.namedChildren[0];
        if (!child) return this.unsupported(node);
        return {
          kind: "unary",
          operator: operator(node),
          operand: this.expression(child),
          span: sourceSpan(node),
        };
      }
      case "pattern": {
        const name = node.childForFieldName("name");
        if (!name) return this.unsupported(node);
        return {
          kind: "pattern",
          name: this.text(name),
          span: sourceSpan(node),
        };
      }
      default:
        return this.unsupported(node);
    }
  }
}

const PYTHON_KEYWORDS = new Set([
  "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "False", "finally", "for",
  "from", "global", "if", "import", "in", "is", "lambda", "None",
  "nonlocal", "not", "or", "pass", "raise", "return", "True", "try",
  "while", "with", "yield",
]);

class SageLowerer {
  private readonly names = new Map<string, string>();
  private readonly directHeads: Record<string, string> = {
    Cos: "cos",
    Exp: "exp",
    Log: "log",
    Plot: "plot",
    PrimePi: "prime_pi",
    Sin: "sin",
    Sqrt: "sqrt",
    Tan: "tan",
  };

  program(program: WolframProgram): string {
    const lines = ["import wolfram as _wolfram"];
    for (const expression of program.body) {
      lines.push(this.statement(expression));
    }
    return `${lines.join("\n")}\n`;
  }

  private name(raw: string): string {
    const known = this.names.get(raw);
    if (known) return known;
    const unqualified = raw.split("`").filter(Boolean).at(-1) ?? raw;
    const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(unqualified) &&
      !PYTHON_KEYWORDS.has(unqualified);
    const result = valid
      ? unqualified
      : `_wolfram_symbol_${Array.from(raw).map((character) =>
        character.codePointAt(0)!.toString(16)
      ).join("_")}`;
    this.names.set(raw, result);
    return result;
  }

  private statement(expression: WolframExpression): string {
    if (expression.kind === "suppressed") {
      return this.statementValue(expression.expression);
    }
    if (
      expression.kind === "binary" &&
      (expression.operator === "=" || expression.operator === ":=")
    ) {
      return this.assignment(expression);
    }
    return `print(${this.expression(expression)})`;
  }

  private statementValue(expression: WolframExpression): string {
    if (
      expression.kind === "binary" &&
      (expression.operator === "=" || expression.operator === ":=")
    ) {
      return this.assignment(expression);
    }
    return this.expression(expression);
  }

  private assignment(expression: BinaryExpression): string {
    if (expression.left.kind === "symbol") {
      return `${this.name(expression.left.name)} = ${
        this.expression(expression.right)
      }`;
    }
    if (
      expression.operator === ":=" &&
      expression.left.kind === "call" &&
      expression.left.head.kind === "symbol" &&
      expression.left.arguments.every((argument) =>
        argument.kind === "pattern"
      )
    ) {
      const name = this.name(expression.left.head.name);
      const arguments_ = expression.left.arguments.map((argument) =>
        this.name(argument.kind === "pattern" ? argument.name : "")
      );
      return `def ${name}(${arguments_.join(", ")}):\n    return ${
        this.expression(expression.right)
      }`;
    }
    throw new WolframSyntaxError(
      "only symbol and simple patterned-function assignments are supported",
      expression.span,
    );
  }

  private call(expression: CallExpression): string {
    if (expression.head.kind !== "symbol") {
      return `${this.expression(expression.head)}(${
        expression.arguments.map((argument) => this.expression(argument))
          .join(", ")
      })`;
    }
    const head = expression.head.name;
    if (head === "Table") return this.table(expression);
    if (head === "Plot") return this.plot(expression);
    const direct = this.directHeads[head];
    const target = direct ?? (
      ["Dimensions", "FactorInteger", "Head", "Length", "Prime", "Range"]
        .includes(head)
        ? `_wolfram.${head}`
        : this.name(head)
    );
    return `${target}(${
      expression.arguments.map((argument) => this.expression(argument))
        .join(", ")
    })`;
  }

  private iterator(
    expression: CallExpression,
    operation: string,
  ): {
    variable: string;
    start: string;
    stop: string;
    step: string;
  } {
    const iterator = expression.arguments[1];
    if (
      !iterator ||
      iterator.kind !== "list" ||
      iterator.elements.length < 3 ||
      iterator.elements.length > 4 ||
      iterator.elements[0].kind !== "symbol"
    ) {
      throw new WolframSyntaxError(
        `${operation} currently requires {variable, start, stop[, step]}`,
        expression.span,
      );
    }
    return {
      variable: this.name(iterator.elements[0].name),
      start: this.expression(iterator.elements[1]),
      stop: this.expression(iterator.elements[2]),
      step: iterator.elements[3]
        ? this.expression(iterator.elements[3])
        : "1",
    };
  }

  private table(expression: CallExpression): string {
    if (expression.arguments.length !== 2) {
      throw new WolframSyntaxError(
        "Table currently requires an expression and one iterator",
        expression.span,
      );
    }
    const iterator = this.iterator(expression, "Table");
    return `_wolfram.Table(lambda ${iterator.variable}: ${
      this.expression(expression.arguments[0])
    }, ${iterator.start}, ${iterator.stop}, ${iterator.step})`;
  }

  private plot(expression: CallExpression): string {
    if (expression.arguments.length < 2) {
      throw new WolframSyntaxError(
        "Plot currently requires an expression and a range",
        expression.span,
      );
    }
    const iterator = this.iterator(expression, "Plot");
    return `plot(${this.expression(expression.arguments[0])}, (${
      iterator.variable
    }, ${iterator.start}, ${iterator.stop}))`;
  }

  private expression(expression: WolframExpression): string {
    switch (expression.kind) {
      case "symbol": {
        const constants: Record<string, string> = {
          E: "e",
          False: "False",
          Null: "None",
          Pi: "pi",
          True: "True",
        };
        return constants[expression.name] ?? this.name(expression.name);
      }
      case "literal":
        return expression.value
          .replace(/\*\^/g, "e")
          .replace(/`+[^e]*/g, "");
      case "list":
        return `[${expression.elements.map((element) =>
          this.expression(element)
        ).join(", ")}]`;
      case "call":
        return this.call(expression);
      case "unary": {
        const operators: Record<string, string> = {
          "!": "not ",
          "-": "-",
          "+": "+",
        };
        const operator_ = operators[expression.operator];
        if (operator_ === undefined) {
          throw new WolframSyntaxError(
            `Wolfram prefix operator '${expression.operator}' is not supported yet`,
            expression.span,
          );
        }
        return `(${operator_}${this.expression(expression.operand)})`;
      }
      case "binary": {
        const operators: Record<string, string> = {
          ",": ",",
          "+": "+",
          "-": "-",
          "*": "*",
          "/": "/",
          "^": "^",
          "==": "==",
          "!=": "!=",
          "<": "<",
          "<=": "<=",
          ">": ">",
          ">=": ">=",
          "&&": "and",
          "||": "or",
        };
        const operator_ = operators[expression.operator];
        if (!operator_) {
          throw new WolframSyntaxError(
            `Wolfram binary operator '${expression.operator}' is not supported yet`,
            expression.span,
          );
        }
        return `(${this.expression(expression.left)} ${operator_} ${
          this.expression(expression.right)
        })`;
      }
      case "pattern":
        return this.name(expression.name);
      case "suppressed":
        return this.expression(expression.expression);
    }
  }
}

let frontendPromise: Promise<ForeignFrontend> | undefined;

export function createWolframFrontend(): Promise<ForeignFrontend> {
  frontendPromise ??= (async () => {
    const parser = await createTreeSitterParser(WOLFRAM_WASM);

    function parse(source: string): WolframProgram {
      const tree = parser.parse(source);
      if (!tree) throw new Error("Tree-sitter did not return a Wolfram tree");
      try {
        if (tree.rootNode.hasError) {
          const error = firstSyntaxError(tree.rootNode) ?? tree.rootNode;
          const incomplete = error.isMissing ||
            error.endIndex >= source.trimEnd().length;
          throw new WolframSyntaxError(
            error.isMissing
              ? `expected ${error.type.replace(/^"|"$/g, "")}`
              : "invalid or incomplete Wolfram Language syntax",
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
      language: "wolfram",
      parse,
      lower(source: string): ForeignLowering {
        const ast = parse(source);
        return {
          ast,
          source: new SageLowerer().program(ast),
        };
      },
    };
  })();
  return frontendPromise;
}
