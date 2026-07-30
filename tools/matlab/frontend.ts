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
  MatlabExpression,
  MatlabProgram,
  MatlabStatement,
  MatrixExpression,
} from "./ast";

const MATLAB_WASM = "tree-sitter-matlab.wasm";

export class MatlabSyntaxError extends SyntaxError {
  readonly line: number;
  readonly column: number;
  readonly incomplete: boolean;

  constructor(
    message: string,
    span: SourceSpan,
    incomplete = false,
  ) {
    super(message);
    this.name = "MatlabSyntaxError";
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
  return node.children.find((child) =>
    !named.has(child.id) && child.text.trim()
  )?.text.trim() ?? "";
}

class AstBuilder {
  constructor(private readonly source: string) {}

  private text(node: SyntaxNode): string {
    return this.source.slice(node.startIndex, node.endIndex);
  }

  private unsupported(node: SyntaxNode): never {
    throw new MatlabSyntaxError(
      `MATLAB '${node.type}' syntax is recognized but is not supported yet`,
      sourceSpan(node),
    );
  }

  private suppressesOutput(
    node: SyntaxNode,
    next: SyntaxNode | undefined,
  ): boolean {
    const end = next?.startIndex ?? this.source.length;
    return this.source.slice(node.endIndex, end).trimStart().startsWith(";");
  }

  program(tree: Tree): MatlabProgram {
    const children = tree.rootNode.namedChildren;
    const body: MatlabStatement[] = children.map((node, index) => {
      const suppressOutput = this.suppressesOutput(
        node,
        children[index + 1],
      );
      if (node.type === "assignment") {
        const target = node.childForFieldName("left");
        const value = node.childForFieldName("right");
        if (!target || !value) return this.unsupported(node);
        return {
          kind: "assignment",
          target: this.expression(target),
          value: this.expression(value),
          suppressOutput,
          span: sourceSpan(node),
        };
      }
      if (node.type === "command") {
        const commandName = node.namedChildren.find((child) =>
          child.type === "command_name"
        );
        const commandArguments = node.namedChildren.filter((child) =>
          child.type === "command_argument"
        );
        if (!commandName || commandArguments.length) {
          return this.unsupported(node);
        }
        return {
          kind: "expression",
          expression: {
            kind: "name",
            name: this.text(commandName),
            span: sourceSpan(commandName),
          },
          suppressOutput,
          span: sourceSpan(node),
        };
      }
      return {
        kind: "expression",
        expression: this.expression(node),
        suppressOutput,
        span: sourceSpan(node),
      };
    });
    return {
      kind: "program",
      body,
      span: sourceSpan(tree.rootNode),
    };
  }

  private matrix(node: SyntaxNode): MatrixExpression {
    return {
      kind: "matrix",
      rows: node.namedChildren
        .filter((child) => child.type === "row")
        .map((row) =>
          row.namedChildren.map((child) => this.expression(child))
        ),
      span: sourceSpan(node),
    };
  }

  private call(node: SyntaxNode): CallExpression {
    const callee = node.childForFieldName("name");
    if (!callee) return this.unsupported(node);
    const argumentsNode = node.namedChildren.find(
      (child) => child.type === "arguments",
    );
    return {
      kind: "call",
      callee: this.expression(callee),
      arguments: argumentsNode
        ? argumentsNode.childrenForFieldName("argument").map((argument) =>
          this.expression(argument)
        )
        : [],
      span: sourceSpan(node),
    };
  }

  private binary(node: SyntaxNode): BinaryExpression {
    const left = node.childForFieldName("left");
    const right = node.childForFieldName("right");
    if (!left || !right) return this.unsupported(node);
    return {
      kind: "binary",
      operator: operator(node),
      left: this.expression(left),
      right: this.expression(right),
      span: sourceSpan(node),
    };
  }

  expression(node: SyntaxNode): MatlabExpression {
    switch (node.type) {
      case "identifier":
        return {
          kind: "name",
          name: this.text(node),
          span: sourceSpan(node),
        };
      case "number":
      case "string":
        return {
          kind: "literal",
          value: this.text(node),
          literalKind: node.type,
          span: sourceSpan(node),
        };
      case "matrix":
      case "cell":
        return this.matrix(node);
      case "function_call":
        return this.call(node);
      case "range": {
        const elements = node.namedChildren.map((child) =>
          this.expression(child)
        );
        if (elements.length < 2 || elements.length > 3) {
          return this.unsupported(node);
        }
        return {
          kind: "range",
          start: elements[0],
          stop: elements.length === 2 ? elements[1] : elements[2],
          step: elements.length === 3 ? elements[1] : undefined,
          span: sourceSpan(node),
        };
      }
      case "spread_operator":
        return {
          kind: "all",
          span: sourceSpan(node),
        };
      case "binary_operator":
      case "boolean_operator":
      case "comparison_operator":
        return this.binary(node);
      case "unary_operator":
      case "not_operator": {
        const operand = node.childForFieldName("operand") ??
          node.namedChildren[0];
        if (!operand) return this.unsupported(node);
        return {
          kind: "unary",
          operator: operator(node),
          operand: this.expression(operand),
          span: sourceSpan(node),
        };
      }
      case "parenthesis": {
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
  private readonly directFunctions: Record<string, string> = {
    cos: "_np.cos",
    disp: "print",
    exp: "_np.exp",
    linspace: "_np.linspace",
    log: "_np.log",
    ones: "_np.ones",
    sin: "_np.sin",
    sqrt: "_np.sqrt",
    sum: "_np.sum",
    tan: "_np.tan",
    zeros: "_np.zeros",
  };

  program(program: MatlabProgram): string {
    return [
      "import matlab as _matlab",
      "import numpy as _np",
      ...program.body.map((statement) => this.statement(statement)),
      "",
    ].join("\n");
  }

  private statement(statement: MatlabStatement): string {
    if (statement.kind === "assignment") {
      if (statement.target.kind === "call") {
        if (statement.target.callee.kind !== "name") {
          throw new MatlabSyntaxError(
            "indexed assignment currently requires a named array",
            statement.span,
          );
        }
        const name = statement.target.callee.name;
        const assignment = `_matlab.set_index(${name}, ${
          this.expression(statement.value)
        }${
          statement.target.arguments.length ? ", " : ""
        }${
          statement.target.arguments.map((argument) =>
            this.expression(argument)
          ).join(", ")
        })`;
        return statement.suppressOutput
          ? assignment
          : `${assignment}\nprint(${name})`;
      }
      if (statement.target.kind !== "name") {
        throw new MatlabSyntaxError(
          "assignment currently requires a name or indexed array",
          statement.span,
        );
      }
      const assignment = `${statement.target.name} = ${
        this.expression(statement.value)
      }`;
      return statement.suppressOutput
        ? assignment
        : `${assignment}\nprint(${statement.target.name})`;
    }
    const value = this.expression(statement.expression);
    return statement.suppressOutput ? value : `print(${value})`;
  }

  private call(expression: CallExpression): string {
    if (expression.callee.kind !== "name") {
      return `_matlab.call_or_index(${this.expression(expression.callee)}, ${
        expression.arguments.map((argument) => this.expression(argument))
          .join(", ")
      })`;
    }
    const name = expression.callee.name;
    if (name === "plot" && expression.arguments.length === 2) {
      return `line(list(zip(${
        this.expression(expression.arguments[0])
      }, ${this.expression(expression.arguments[1])})))`;
    }
    const direct = this.directFunctions[name];
    if (direct) {
      return `${direct}(${
        expression.arguments.map((argument) => this.expression(argument))
          .join(", ")
      })`;
    }
    return `_matlab.call_or_index(${name}${
      expression.arguments.length ? ", " : ""
    }${
      expression.arguments.map((argument) => this.expression(argument))
        .join(", ")
    })`;
  }

  private binary(expression: BinaryExpression): string {
    const special: Record<string, string> = {
      "*": "mtimes",
      ".*": "times",
      "/": "mrdivide",
      "./": "rdivide",
      "\\": "mldivide",
      ".\\": "ldivide",
      "^": "mpower",
      ".^": "power",
    };
    const operation = special[expression.operator];
    if (operation) {
      return `_matlab.${operation}(${this.expression(expression.left)}, ${
        this.expression(expression.right)
      })`;
    }
    const operators: Record<string, string> = {
      "+": "+",
      ".+": "+",
      "-": "-",
      ".-": "-",
      "==": "==",
      "~=": "!=",
      "<": "<",
      "<=": "<=",
      ">": ">",
      ">=": ">=",
      "&&": "and",
      "||": "or",
      "&": "&",
      "|": "|",
    };
    const operator_ = operators[expression.operator];
    if (!operator_) {
      throw new MatlabSyntaxError(
        `MATLAB operator '${expression.operator}' is not supported yet`,
        expression.span,
      );
    }
    return `(${this.expression(expression.left)} ${operator_} ${
      this.expression(expression.right)
    })`;
  }

  private expression(expression: MatlabExpression): string {
    switch (expression.kind) {
      case "name": {
        const constants: Record<string, string> = {
          false: "False",
          inf: "float('inf')",
          pi: "pi",
          true: "True",
        };
        return constants[expression.name] ?? expression.name;
      }
      case "literal":
        return expression.value;
      case "matrix":
        return `_np.array([${
          expression.rows.map((row) =>
            `[${row.map((element) => this.expression(element)).join(", ")}]`
          ).join(", ")
        }])`;
      case "call":
        return this.call(expression);
      case "range":
        return `_np.array(_matlab.colon(${this.expression(expression.start)}, ${
          this.expression(expression.stop)
        }${expression.step ? `, ${this.expression(expression.step)}` : ""}))`;
      case "all":
        return "_matlab.ALL";
      case "unary": {
        const operators: Record<string, string> = {
          "+": "+",
          "-": "-",
          "~": "not ",
        };
        const operator_ = operators[expression.operator];
        if (operator_ === undefined) {
          throw new MatlabSyntaxError(
            `MATLAB unary operator '${expression.operator}' is not supported yet`,
            expression.span,
          );
        }
        return `(${operator_}${this.expression(expression.operand)})`;
      }
      case "binary":
        return this.binary(expression);
    }
  }
}

let frontendPromise: Promise<ForeignFrontend> | undefined;

export function createMatlabFrontend(): Promise<ForeignFrontend> {
  frontendPromise ??= (async () => {
    const parser = await createTreeSitterParser(MATLAB_WASM);

    function parse(source: string): MatlabProgram {
      const tree = parser.parse(source.endsWith("\n") ? source : `${source}\n`);
      if (!tree) throw new Error("Tree-sitter did not return a MATLAB tree");
      try {
        if (tree.rootNode.hasError) {
          const error = firstSyntaxError(tree.rootNode) ?? tree.rootNode;
          const incomplete = error.isMissing ||
            error.endIndex >= source.trimEnd().length;
          throw new MatlabSyntaxError(
            error.isMissing
              ? `expected ${error.type.replace(/^"|"$/g, "")}`
              : "invalid or incomplete MATLAB syntax",
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
      language: "matlab",
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
