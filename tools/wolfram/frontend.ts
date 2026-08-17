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
  private readonly plotVariables = new Set<string>();
  private readonly directHeads: Record<string, string> = {
    Abs: "abs",
    Cos: "cos",
    Exp: "exp",
    Log: "log",
    Plot: "plot",
    PrimePi: "prime_pi",
    Sin: "sin",
    Sqrt: "sqrt",
    Tan: "tan",
  };

  constructor(
    private readonly source: string,
    private readonly filename?: string,
  ) {}

  program(program: WolframProgram, captureResult = false): string {
    const statements: string[] = [];
    const lastIndex = program.body.length - 1;
    program.body.forEach((expression, index) => {
      const asResult = captureResult &&
        index === lastIndex &&
        expression.kind !== "suppressed" &&
        !(
          expression.kind === "binary" &&
          (expression.operator === "=" || expression.operator === ":=")
        );
      statements.push(this.statement(expression, asResult));
    });
    const lines = ["import wolfram as _wolfram"];
    if (this.plotVariables.size) {
      lines.push(`var('${[...this.plotVariables].join(",")}')`);
    }
    lines.push(...statements);
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

  private statement(
    expression: WolframExpression,
    asResult = false,
  ): string {
    if (expression.kind === "suppressed") {
      return this.statementValue(expression.expression);
    }
    if (
      expression.kind === "binary" &&
      (expression.operator === "=" || expression.operator === ":=")
    ) {
      return this.assignment(expression);
    }
    const value = this.expression(expression);
    return asResult ? value : `print(${value})`;
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
    if (head === "ParametricPlot") {
      return this.singleRangePlot(expression, "parametric_plot", head);
    }
    if (head === "PolarPlot") {
      return this.singleRangePlot(expression, "polar_plot", head);
    }
    if (head === "ListPlot") {
      return this.listPlot(expression, "list_plot", false);
    }
    if (head === "ListLinePlot") {
      return this.listPlot(expression, "list_plot", true);
    }
    if (head === "DensityPlot") {
      return this.doubleRangePlot(expression, "density_plot", head);
    }
    if (head === "ContourPlot") {
      return this.doubleRangePlot(expression, "contour_plot", head);
    }
    if (head === "RegionPlot") {
      return this.doubleRangePlot(expression, "region_plot", head);
    }
    if (head === "StreamPlot") {
      return this.doubleRangePlot(expression, "streamline_plot", head);
    }
    if (head === "VectorPlot") {
      return this.doubleRangePlot(expression, "plot_vector_field", head);
    }
    if (head === "Plot3D") {
      return this.doubleRangePlot(expression, "plot3d", head);
    }
    if (head === "SphericalPlot3D") {
      return this.doubleRangePlot(expression, "spherical_plot3d", head);
    }
    if (head === "VectorPlot3D") {
      return this.tripleRangePlot(expression, "plot_vector_field3d", head);
    }
    if (head === "RevolutionPlot3D") {
      return this.singleRangePlot(expression, "revolution_plot3d", head);
    }
    if (head === "ParametricPlot3D") {
      return this.parametricPlot3d(expression);
    }
    if (head === "ContourPlot3D") {
      return this.tripleRangePlot(expression, "implicit_plot3d", head);
    }
    if (head === "ListPlot3D") {
      return this.listPlot(expression, "list_plot3d", false);
    }
    if (head === "Graphics" || head === "Graphics3D") {
      return this.graphicsCall(expression, head);
    }
    if (head === "Show") return this.showCall(expression);
    const graphicsHeads: Record<string, string> = {
      Arrow: "Arrow",
      Circle: "Circle",
      Cone: "Cone",
      Cuboid: "Cuboid",
      Cylinder: "Cylinder",
      Disk: "Disk",
      Directive: "Directive",
      GrayLevel: "GrayLevel",
      Hue: "Hue",
      Line: "Line",
      Point: "Point",
      PointSize: "PointSize",
      Polygon: "Polygon",
      Rectangle: "Rectangle",
      RGBColor: "RGBColor",
      Opacity: "Opacity",
      Sphere: "Sphere",
      Text: "Text",
      Thickness: "Thickness",
      Torus: "Torus",
      Style: "Style",
    };
    if (graphicsHeads[head]) {
      return `_wolfram.${graphicsHeads[head]}(${
        expression.arguments.map((argument) => this.expression(argument))
          .join(", ")
      })`;
    }
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
    index = 1,
  ): {
    variable: string;
    start: string;
    stop: string;
    step: string;
    source: string;
  } {
    const iterator = expression.arguments[index];
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
    const variable = this.name(iterator.elements[0].name);
    this.plotVariables.add(variable);
    return {
      variable,
      start: this.expression(iterator.elements[1]),
      stop: this.expression(iterator.elements[2]),
      step: iterator.elements[3]
        ? this.expression(iterator.elements[3])
        : "1",
      source: this.sourceText(iterator),
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
    return this.plotCall(
      expression,
      "plot",
      "Plot",
      this.expression(expression.arguments[0]),
      [iterator],
      expression.arguments.slice(2),
    );
  }

  private singleRangePlot(
    expression: CallExpression,
    target: string,
    operation: string,
  ): string {
    if (expression.arguments.length < 2) {
      throw new WolframSyntaxError(
        `${operation} currently requires an expression and a range`,
        expression.span,
      );
    }
    const iterator = this.iterator(expression, operation);
    return this.plotCall(
      expression,
      target,
      operation,
      this.expression(expression.arguments[0]),
      [iterator],
      expression.arguments.slice(2),
    );
  }

  private doubleRangePlot(
    expression: CallExpression,
    target: string,
    operation: string,
  ): string {
    if (expression.arguments.length < 3) {
      throw new WolframSyntaxError(
        `${operation} currently requires an expression and two ranges`,
        expression.span,
      );
    }
    const first = this.iterator(expression, operation, 1);
    const second = this.iterator(expression, operation, 2);
    return this.plotCall(
      expression,
      target,
      operation,
      this.expression(expression.arguments[0]),
      [first, second],
      expression.arguments.slice(3),
    );
  }

  private tripleRangePlot(
    expression: CallExpression,
    target: string,
    operation: string,
  ): string {
    if (expression.arguments.length < 4) {
      throw new WolframSyntaxError(
        `${operation} currently requires an expression and three ranges`,
        expression.span,
      );
    }
    const first = this.iterator(expression, operation, 1);
    const second = this.iterator(expression, operation, 2);
    const third = this.iterator(expression, operation, 3);
    return this.plotCall(
      expression,
      target,
      operation,
      this.expression(expression.arguments[0]),
      [first, second, third],
      expression.arguments.slice(4),
    );
  }

  private parametricPlot3d(expression: CallExpression): string {
    if (expression.arguments.length < 2) {
      throw new WolframSyntaxError(
        "ParametricPlot3D currently requires coordinates and a range",
        expression.span,
      );
    }
    const first = this.iterator(expression, "ParametricPlot3D", 1);
    const ranges = [first];
    let optionStart = 2;
    const secondCandidate = expression.arguments[2];
    if (
      secondCandidate?.kind === "list" &&
      secondCandidate.elements[0]?.kind === "symbol"
    ) {
      const second = this.iterator(expression, "ParametricPlot3D", 2);
      ranges.push(second);
      optionStart = 3;
    }
    return this.plotCall(
      expression,
      "parametric_plot3d",
      "ParametricPlot3D",
      this.expression(expression.arguments[0]),
      ranges,
      expression.arguments.slice(optionStart),
    );
  }

  private listPlot(
    expression: CallExpression,
    target: string,
    joined: boolean,
  ): string {
    if (expression.arguments.length < 1) {
      throw new WolframSyntaxError(
        "list plotting requires data",
        expression.span,
      );
    }
    const operation = joined
      ? "ListLinePlot"
      : expression.head.kind === "symbol"
      ? expression.head.name
      : "ListPlot";
    return this.plotCall(
      expression,
      target,
      operation,
      this.expression(expression.arguments[0]),
      [],
      expression.arguments.slice(1),
    );
  }

  private optionRecords(options: WolframExpression[]): string {
    const lowered: string[] = [];
    for (const option of options) {
      if (
        option.kind !== "binary" ||
        !["->", ":>"].includes(option.operator) ||
        option.left.kind !== "symbol"
      ) {
        throw new WolframSyntaxError(
          "plot and graphics options must be Rule or RuleDelayed expressions",
          option.span,
        );
      }
      const name = option.left.name;
      let value = this.expression(option.right);
      if (name === "ImageSize") value = `_wolfram.ImageSize(${value})`;
      lowered.push(`{"name": ${this.stringLiteral(name)}, "rule": ${
        this.stringLiteral(option.operator === ":>" ? "RuleDelayed" : "Rule")
      }, "value": ${value}, "source": ${
        this.stringLiteral(this.sourceText(option))
      }, "source_span": ${this.spanLiteral(option.span)}}`);
    }
    return `[${lowered.join(", ")}]`;
  }

  private plotCall(
    expression: CallExpression,
    target: string,
    operation: string,
    value: string,
    ranges: Array<{
      variable: string;
      start: string;
      stop: string;
      step: string;
      source: string;
    }>,
    options: WolframExpression[],
  ): string {
    const loweredRanges = ranges.map((range) =>
      `(${range.variable}, ${range.start}, ${range.stop})`
    );
    return `_wolfram.PlotCall(${this.stringLiteral(target)}, ${
      this.stringLiteral(operation)
    }, ${value}, [${loweredRanges.join(", ")}], ${
      this.optionRecords(options)
    }, ${this.intentLiteral(expression, operation, ranges)})`;
  }

  private graphicsCall(expression: CallExpression, operation: string): string {
    if (!expression.arguments.length) {
      throw new WolframSyntaxError(
        `${operation} currently requires primitives`,
        expression.span,
      );
    }
    const items = this.expression(expression.arguments[0]);
    return `_wolfram.${operation}(${items}, ${
      this.optionRecords(expression.arguments.slice(1))
    }, ${this.intentLiteral(expression, operation)})`;
  }

  private showCall(expression: CallExpression): string {
    const graphics: WolframExpression[] = [];
    const options: WolframExpression[] = [];
    for (const argument of expression.arguments) {
      if (
        argument.kind === "binary" &&
        ["->", ":>"].includes(argument.operator) &&
        argument.left.kind === "symbol"
      ) {
        options.push(argument);
      } else {
        graphics.push(argument);
      }
    }
    if (!graphics.length) {
      throw new WolframSyntaxError(
        "Show requires at least one graphic",
        expression.span,
      );
    }
    return `_wolfram.Show([${
      graphics.map((graphic) => this.expression(graphic)).join(", ")
    }], ${this.optionRecords(options)}, ${
      this.intentLiteral(expression, "Show")
    })`;
  }

  private sourceText(expression: WolframExpression): string {
    return this.source.slice(
      expression.span.start.offset,
      expression.span.end.offset,
    );
  }

  private stringLiteral(value: string): string {
    return JSON.stringify(value);
  }

  private spanLiteral(span: SourceSpan): string {
    return `{"start": {"line": ${span.start.line}, "column": ${
      span.start.column
    }, "offset": ${span.start.offset}}, "end": {"line": ${
      span.end.line
    }, "column": ${span.end.column}, "offset": ${span.end.offset}}}`;
  }

  private intentLiteral(
    expression: WolframExpression,
    head: string,
    ranges: Array<{ source: string }> = [],
  ): string {
    const filename = this.filename === undefined
      ? "None"
      : this.stringLiteral(this.filename);
    return `{"frontend": "wolfram", "head": ${
      this.stringLiteral(head)
    }, "expression": ${this.stringLiteral(this.sourceText(expression))}, "ranges": [${
      ranges.map((range) => this.stringLiteral(range.source)).join(", ")
    }], "filename": ${
      filename
    }, "source_span": ${this.spanLiteral(expression.span)}}`;
  }

  private expression(expression: WolframExpression): string {
    switch (expression.kind) {
      case "symbol": {
        const constants: Record<string, string> = {
          All: "'all'",
          Automatic: "'automatic'",
          Black: "'black'",
          Blue: "'blue'",
          Brown: "'brown'",
          Cyan: "'cyan'",
          E: "e",
          False: "0",
          Gray: "'gray'",
          Green: "'green'",
          Magenta: "'magenta'",
          None: "0",
          Null: "None",
          Orange: "'orange'",
          Pi: "pi",
          Pink: "'pink'",
          Purple: "'purple'",
          Red: "'red'",
          True: "1",
          White: "'white'",
          Yellow: "'yellow'",
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
      lower(
        source: string,
        options: ForeignLowerOptions = {},
      ): ForeignLowering {
        const ast = parse(source);
        const last = ast.body.at(-1);
        return {
          ast,
          source: new SageLowerer(source, options.filename).program(
            ast,
            options.captureResult,
          ),
          hasResult: options.captureResult &&
            last !== undefined &&
            last.kind !== "suppressed" &&
            !(
              last.kind === "binary" &&
              (
                last.operator === "=" ||
                last.operator === ":="
              )
            ),
        };
      },
    };
  })();
  return frontendPromise;
}
