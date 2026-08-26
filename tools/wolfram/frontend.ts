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

  /**
   * The named children of `node`, with comments removed.
   *
   * `(* ... *)` is not an `extras` rule in tree-sitter-wolfram, so a
   * comment is a named child of whatever encloses it rather than being
   * skipped by the parser outright. Every structural read below counts
   * named children -- `binary` requires exactly two, `prefix` and `group`
   * take the first -- so a comment sitting inside an expression changed
   * its arity and the node stopped matching the shape it actually had:
   * `1 + (* mid *) 2` was refused as unsupported `infix` syntax rather
   * than read as an addition, and a comment on its own line was refused as
   * unsupported `comment` syntax. Filtering in one place is what makes a
   * comment mean nothing everywhere, which is what it means in Wolfram.
   */
  private namedChildren(node: SyntaxNode): SyntaxNode[] {
    return node.namedChildren.filter((child) => child.type !== "comment");
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
      body: this.namedChildren(tree.rootNode).map((node) =>
        this.expression(node)
      ),
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
    const child = this.namedChildren(node)[0];
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
    const children = this.namedChildren(node);
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
          this.namedChildren(node).length === 1
        ) {
          return {
            kind: "suppressed",
            expression: this.expression(this.namedChildren(node)[0]),
            span: sourceSpan(node),
          };
        }
        const expression = this.binary(node);
        return expression;
      }
      case "implicit_times":
        return this.binary(node);
      case "prefix": {
        const child = this.namedChildren(node)[0];
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

/**
 * Wolfram optimization heads that lower straight to their `wolfram` module
 * counterparts -- the global `N*` family and the local `Find*` family. Their
 * second argument names the optimization variables, which are declared as
 * Sage symbols the way plot ranges are. The two families read that argument
 * differently (`{x, a, b}` is a region to `NMinimize` and `{x, x0}` a
 * starting point to `FindMinimum`), but only the Python side has to care:
 * the symbols to declare are in the same places either way.
 *
 * `FindFit` is deliberately not in this set. Every other head here is
 * `head[objective, variables]`, two arguments in the same two places;
 * `FindFit` is `FindFit[data, expr, pars, vars]`, four arguments with two
 * different symbol-bearing positions (`pars` and `vars`) and no objective
 * at all. Folding it into `optimizationCall`'s two-argument shape would
 * mean special-casing one head inside a helper built for a shape it does
 * not have, so it gets its own `findFitCall` below instead.
 */
/**
 * Wolfram's comparison operators, which chain: `a <= x <= b` is one
 * relation about three operands, exactly as in Python, and NOT the
 * `(a <= x) <= b` that a plain left-associative lowering produces. That
 * difference is not cosmetic -- `(3 <= 2) <= 1` compares the *boolean*
 * `False` against `1` and evaluates to True, so a lowering that
 * parenthesizes a chain quietly answers the opposite of what was asked.
 */
const COMPARISON_OPERATORS = new Set(["==", "!=", "<", "<=", ">", ">="]);

/**
 * Flatten a left-nested tree of comparison operators into its operands and
 * the operators between them: `a <= x <= b` gives `[a, x, b]` and
 * `["<=", "<="]`. A single comparison flattens to two operands and one
 * operator, which is the uninteresting case every caller checks for.
 */
function comparisonChain(
  expression: WolframExpression,
): { operands: WolframExpression[]; operators: string[] } {
  if (
    expression.kind === "binary" &&
    COMPARISON_OPERATORS.has(expression.operator) &&
    expression.left.kind === "binary" &&
    COMPARISON_OPERATORS.has(expression.left.operator)
  ) {
    const left = comparisonChain(expression.left);
    return {
      operands: [...left.operands, expression.right],
      operators: [...left.operators, expression.operator],
    };
  }
  if (
    expression.kind === "binary" &&
    COMPARISON_OPERATORS.has(expression.operator)
  ) {
    return {
      operands: [expression.left, expression.right],
      operators: [expression.operator],
    };
  }
  return { operands: [expression], operators: [] };
}

const OPTIMIZATION_HEADS = new Set([
  "FindArgMax",
  "FindArgMin",
  "FindMaxValue",
  "FindMaximum",
  "FindMinValue",
  "FindMinimum",
  "NArgMax",
  "NArgMin",
  "NMaxValue",
  "NMaximize",
  "NMinValue",
  "NMinimize",
]);

/**
 * The subset of `OPTIMIZATION_HEADS` that reaches `_optimize` in
 * `wolfram.py` -- the global `N*` family. Their Python entry points
 * (`n_minimize` and its five siblings) all take the same keyword surface:
 * `method`, `method_options`, `max_iterations`, `tolerance`, `seed`,
 * `penalty_scale`. The other half, `Find*`, reaches `_find_optimize`
 * instead, whose entry points take only `method`, `max_iterations`,
 * `tolerance` -- no `method_options`, so `GLOBAL_OPTIMIZATION_OPTIONS` and
 * `LOCAL_OPTIMIZATION_OPTIONS` below disagree on exactly one thing: whether
 * `Method -> {"Name", "Sub" -> value, ...}` sub-options have anywhere to go.
 */
const GLOBAL_OPTIMIZATION_HEADS = new Set([
  "NArgMax",
  "NArgMin",
  "NMaxValue",
  "NMaximize",
  "NMinValue",
  "NMinimize",
]);

/**
 * How one Wolfram option name lowers for a given optimization head.
 * `"keyword"` passes the Rule's value straight through to that Python
 * keyword. `"method"` routes through `lowerMethodOption`, which also
 * decides whether `Method -> {"Name", ...}` sub-options are legal for this
 * head. `"decline"` means the option is real Wolfram syntax with no
 * faithful implementation here -- refused by name with `reason`, never
 * silently accepted or dropped.
 */
type OptimizationOptionAction =
  | { kind: "keyword"; keyword: string }
  | { kind: "method"; subOptions: boolean }
  | { kind: "decline"; reason: string };

function declinedOptions(
  reasons: Record<string, string>,
): Record<string, OptimizationOptionAction> {
  const result: Record<string, OptimizationOptionAction> = {};
  for (const [name, reason] of Object.entries(reasons)) {
    result[name] = { kind: "decline", reason };
  }
  return result;
}

/**
 * Options every one of the thirteen optimization heads declines, all for
 * the same reason each time -- real, documented Wolfram options with no
 * faithful counterpart anywhere in this package, not merely in the head
 * being asked about.
 */
const UNIVERSALLY_DECLINED_OPTIONS: Record<string, string> = {
  // Every engine reached from `wolfram.py` coerces its numbers through
  // Python `float()` -- this package is IEEE double throughout, with no
  // higher- or lower-precision code path -- so honoring a different
  // `WorkingPrecision` would be a lie about what actually ran.
  WorkingPrecision: "this package is IEEE double throughout (every engine " +
    "coerces through float()), so honoring a different working " +
    "precision would be a lie",
  // Wolfram's `AccuracyGoal`/`PrecisionGoal` are digits of absolute/relative
  // precision sought in the answer. This package's own `tolerance=` is a
  // different thing: it is simultaneously the largest constraint violation
  // still accepted as feasible (`nminimize`'s penalty weight) and each
  // solver's own step/gradient convergence tolerance -- not a digit count,
  // and not cleanly separable into "accuracy" versus "precision" once
  // constraints are involved. Presenting a guessed digit-to-tolerance
  // formula as this option would be worse than declining it.
  AccuracyGoal: "no faithful mapping onto this package's tolerance= " +
    "exists -- tolerance already conflates constraint-feasibility slack " +
    "and solver convergence, not digits of accuracy",
  PrecisionGoal: "no faithful mapping onto this package's tolerance= " +
    "exists -- tolerance already conflates constraint-feasibility slack " +
    "and solver convergence, not digits of precision",
  // The objective always runs as a plain Python/Sage callable here; there
  // is no interpreted-versus-compiled code path for `Compiled` to select.
  Compiled: "the objective always runs as a plain Python/Sage callable " +
    "here; there is no interpreted/compiled distinction to switch",
  // Neither monitor has a callback hook anywhere in these engines: no
  // solver here calls back into user code between steps or evaluations.
  StepMonitor: "no per-step callback hook exists in these engines",
  EvaluationMonitor: "no per-evaluation callback hook exists in these engines",
};

/** Options accepted by the global `N*` family (`GLOBAL_OPTIMIZATION_HEADS`). */
const GLOBAL_OPTIMIZATION_OPTIONS: Record<string, OptimizationOptionAction> = {
  Method: { kind: "method", subOptions: true },
  MaxIterations: { kind: "keyword", keyword: "max_iterations" },
  ...declinedOptions(UNIVERSALLY_DECLINED_OPTIONS),
};

/** Options accepted by the local `Find*` family (the rest of `OPTIMIZATION_HEADS`). */
const LOCAL_OPTIMIZATION_OPTIONS: Record<string, OptimizationOptionAction> = {
  Method: { kind: "method", subOptions: false },
  MaxIterations: { kind: "keyword", keyword: "max_iterations" },
  // `wolfram.find_minimum` computes the gradient itself -- one compiled
  // partial derivative per variable -- only when the objective is
  // symbolic, and takes no keyword through which a caller could supply a
  // different one, so there is nowhere for Wolfram's `Gradient` to go.
  Gradient: {
    kind: "decline",
    reason: "wolfram.find_minimum computes the gradient itself from a " +
      "symbolic objective and takes no keyword for a caller-supplied one",
  },
  ...declinedOptions(UNIVERSALLY_DECLINED_OPTIONS),
};

/**
 * Options accepted by `FindFit` -- none. `sage_api.find_fit` (reached
 * through `wolfram.find_fit`) has exactly one fixed signature: `data`,
 * `model`, `initial_guess`, `parameters`, `variables`, `solution_dict`.
 * There is no `method`, no iteration limit, no gradient override, no norm
 * or weighting choice and no regularization anywhere in that call chain, so
 * every option Wolfram documents for `FindFit` is declined by name here
 * rather than accepted and quietly ignored.
 */
const FIND_FIT_OPTIONS: Record<string, OptimizationOptionAction> = {
  Method: {
    kind: "decline",
    reason: "FindFit has exactly one engine, Levenberg-Marquardt " +
      "(sage_api.find_fit, backed by levenberg_marquardt.leastsq), so " +
      "there is no method to select",
  },
  MaxIterations: {
    kind: "decline",
    reason: "sage_api.find_fit takes no iteration-limit keyword; leastsq " +
      "runs to its own convergence criteria",
  },
  Gradient: {
    kind: "decline",
    reason: "sage_api.find_fit computes its own Jacobian by forward " +
      "differences inside leastsq and takes no keyword to override it",
  },
  NormFunction: {
    kind: "decline",
    reason: "sage_api.find_fit always minimizes the plain sum of squared " +
      "residuals and has no norm parameter to expose",
  },
  Weights: {
    kind: "decline",
    reason: "sage_api.find_fit has no weighting parameter to expose",
  },
  FitRegularization: {
    kind: "decline",
    reason: "sage_api.find_fit has no regularization parameter to expose",
  },
  ...declinedOptions(UNIVERSALLY_DECLINED_OPTIONS),
};

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
    if (OPTIMIZATION_HEADS.has(head)) {
      return this.optimizationCall(expression, head);
    }
    if (head === "FindFit") {
      return this.findFitCall(expression);
    }
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

  /**
   * Collect the variable symbols named by an `NMinimize`-style second
   * argument: a bare symbol, `{x, y}`, or `{{x, a, b}, ...}`. The numbers in
   * a `{x, a, b}` specification are skipped, so only real variables are
   * declared.
   */
  private optimizationVariables(node: WolframExpression): string[] {
    if (node.kind === "symbol") return [node.name];
    if (node.kind !== "list") return [];
    const names: string[] = [];
    for (const element of node.elements) {
      if (element.kind === "symbol") {
        names.push(element.name);
      } else if (
        element.kind === "list" && element.elements[0]?.kind === "symbol"
      ) {
        names.push(element.elements[0].name);
      }
    }
    return names;
  }

  /**
   * Lower one option's Wolfram value. Identical to `this.expression` except
   * for the bare symbol `Automatic`: the optimization engines compare
   * `Method` (and its sub-options such as `"PostProcess"`) against the
   * exact capitalized string `"Automatic"` (`nminimize.py`'s and
   * `findminimum.py`'s own `_AUTOMATIC`), not the lowercase `'automatic'`
   * the plot-option constants table below produces for the same symbol --
   * plot code and these engines read the same Wolfram symbol differently,
   * so this cannot reuse that table.
   */
  private optimizationOptionValue(expression: WolframExpression): string {
    if (expression.kind === "symbol" && expression.name === "Automatic") {
      return this.stringLiteral("Automatic");
    }
    return this.expression(expression);
  }

  /**
   * Lower a `Method -> ...` Rule into one or two Python keyword fragments.
   * A bare value (almost always a string, `Method -> "NelderMead"`) becomes
   * `method=...`. Wolfram's method-with-suboptions form, `Method ->
   * {"Name", "Sub" -> value, ...}`, becomes `method="Name"` plus
   * `method_options={"Sub": value, ...}` -- `nminimize`'s own
   * `method_options` reads those sub-option names by their documented
   * Wolfram spelling directly, so no further translation happens here.
   * `allowSubOptions` is false for the `Find*` family, whose Python entry
   * points take no `method_options` keyword at all; sub-options given there
   * are refused by name rather than silently dropped.
   */
  private lowerMethodOption(
    option: BinaryExpression,
    head: string,
    allowSubOptions: boolean,
  ): string[] {
    const value = option.right;
    if (value.kind !== "list") {
      return [`method=${this.optimizationOptionValue(value)}`];
    }
    if (!value.elements.length) {
      throw new WolframSyntaxError(
        `${head}'s Method -> {} names no method`,
        option.span,
      );
    }
    const [methodName, ...subOptions] = value.elements;
    const fragments = [`method=${this.optimizationOptionValue(methodName)}`];
    if (!subOptions.length) return fragments;
    if (!allowSubOptions) {
      throw new WolframSyntaxError(
        `${head} does not support Method sub-options: its Python entry ` +
          `point takes no method_options keyword, so ` +
          `Method -> {"Name", ...} has nowhere for the sub-options to go; ` +
          `write Method -> "Name" without sub-options instead`,
        option.span,
      );
    }
    const entries = subOptions.map((sub) => {
      // Unlike a head's own top-level options (`MaxIterations -> 10`,
      // always a bare symbol), Wolfram writes a Method sub-option's name as
      // a quoted string -- `Method -> {"NelderMead", "RandomSeed" -> i}` is
      // the form the NMinimize documentation itself uses, and
      // `nminimize.py`'s `method_options` keys are read as strings too.
      if (
        sub.kind !== "binary" ||
        !["->", ":>"].includes(sub.operator) ||
        sub.left.kind !== "literal" ||
        sub.left.literalKind !== "string"
      ) {
        throw new WolframSyntaxError(
          'Method sub-options must be "Name" -> value or "Name" :> value, ' +
            "with the sub-option name a quoted string",
          sub.span,
        );
      }
      const name = sub.left.value.slice(1, -1);
      return `${this.stringLiteral(name)}: ${
        this.optimizationOptionValue(sub.right)
      }`;
    });
    fragments.push(`method_options={${entries.join(", ")}}`);
    return fragments;
  }

  /**
   * Lower an optimization head's trailing Rule arguments into Python
   * keyword-argument fragments, against `spec`, one of
   * `GLOBAL_OPTIMIZATION_OPTIONS`, `LOCAL_OPTIMIZATION_OPTIONS` or
   * `FIND_FIT_OPTIONS`. An option not in `spec` is refused by name -- never
   * silently dropped -- and so is one `spec` marks `"decline"`, with the
   * reason recorded there. A name given more than once keeps only its last
   * Rule, the same way a Python call could not carry the keyword twice.
   */
  private lowerOptimizationOptions(
    options: WolframExpression[],
    head: string,
    spec: Record<string, OptimizationOptionAction>,
  ): string[] {
    const keywords = new Map<string, string>();
    for (const option of options) {
      if (
        option.kind !== "binary" ||
        !["->", ":>"].includes(option.operator) ||
        option.left.kind !== "symbol"
      ) {
        throw new WolframSyntaxError(
          `${head} options must be Rule or RuleDelayed expressions`,
          option.span,
        );
      }
      const name = option.left.name;
      const action = spec[name];
      if (!action) {
        throw new WolframSyntaxError(
          `${head} does not support the option ${name}`,
          option.span,
        );
      }
      if (action.kind === "decline") {
        throw new WolframSyntaxError(
          `${head}'s ${name} option is not supported: ${action.reason}`,
          option.span,
        );
      }
      if (action.kind === "keyword") {
        keywords.set(
          action.keyword,
          `${action.keyword}=${this.optimizationOptionValue(option.right)}`,
        );
        continue;
      }
      for (
        const fragment of this.lowerMethodOption(
          option,
          head,
          action.subOptions,
        )
      ) {
        keywords.set(fragment.slice(0, fragment.indexOf("=")), fragment);
      }
    }
    return [...keywords.values()];
  }

  private optimizationCall(
    expression: CallExpression,
    head: string,
  ): string {
    if (expression.arguments.length < 2) {
      throw new WolframSyntaxError(
        `${head} requires an objective and a variable specification`,
        expression.span,
      );
    }
    for (const symbol of this.optimizationVariables(expression.arguments[1])) {
      this.plotVariables.add(this.name(symbol));
    }
    const spec = GLOBAL_OPTIMIZATION_HEADS.has(head)
      ? GLOBAL_OPTIMIZATION_OPTIONS
      : LOCAL_OPTIMIZATION_OPTIONS;
    const options = this.lowerOptimizationOptions(
      expression.arguments.slice(2),
      head,
      spec,
    );
    const positional = [
      this.optimizationProblem(expression.arguments[0], head),
      this.expression(expression.arguments[1]),
    ];
    return `_wolfram.${head}(${[...positional, ...options].join(", ")})`;
  }

  /**
   * Lower an optimization head's first argument -- either a bare objective
   * or the `{f, cons}` pair -- so that the `cons` half is read as
   * constraints rather than as an ordinary boolean expression.
   *
   * Only the two-element list shape is the documented pair, so only it is
   * treated specially; anything else is a bare objective and lowers
   * generically. `FindFit` never reaches here: it takes no constraints and
   * has its own `findFitCall`.
   */
  private optimizationProblem(
    expression: WolframExpression,
    head: string,
  ): string {
    if (expression.kind !== "list" || expression.elements.length !== 2) {
      return this.expression(expression);
    }
    return `[${this.expression(expression.elements[0])}, ${
      this.optimizationConstraints(expression.elements[1], head)
    }]`;
  }

  /**
   * Lower the `cons` half of an optimization head's `{f, cons}` pair.
   *
   * Wolfram spells a conjunction of constraints `c1 && c2`, and its own
   * optimization documentation uses that spelling throughout. The generic
   * binary lowering maps `&&` to Python `and`, which is correct for
   * ordinary boolean code and silently wrong here: `and` short-circuits on
   * truthiness, so `(x + y >= 3) and (x <= 1)` evaluates to just one of
   * the two relations and the rest are discarded before `wolfram.py` ever
   * sees them. The result is a dropped constraint and a wrong answer with
   * no diagnostic at all. (`_constraint` in `src/lib/wolfram.py` refuses
   * `&&` by name, but that guard cannot fire for this: what reaches it is
   * a perfectly valid single relation.)
   *
   * So a `&&` chain here flattens to the Python list `[c1, c2, ...]` --
   * exactly what the `{f, {c1, c2}}` List spelling already produces, and
   * what `_optimize` and `_find_optimize` read as several constraints. The
   * two spellings then agree, as they do in Wolfram. `&&` outside this
   * slot still lowers to `and`.
   *
   * `And` is flat and associative in Wolfram, so nested `&&` and nested
   * Lists flatten together: `{c1 && c2, c3}` is three constraints, not two.
   */
  private optimizationConstraints(
    expression: WolframExpression,
    head: string,
  ): string {
    const constraints = this.flattenConstraints(expression, head);
    if (constraints.length === 1 && expression.kind !== "list") {
      return constraints[0];
    }
    return `[${constraints.join(", ")}]`;
  }

  /**
   * Flatten one constraint expression into its individual lowered
   * constraints, descending through `&&` and through Lists alike.
   *
   * `||` is refused here rather than flattened. A disjunction is not a
   * conjunction of anything: `_optimize` and `_find_optimize` take a list
   * of constraints that must hold *together*, and the engines behind them
   * have no disjunctive-region support to lower onto. Left to the generic
   * binary lowering it would become Python `or`, which short-circuits the
   * same way `and` does and silently keeps exactly one branch -- for
   * `NMinimize[{(x-2)^2, x <= 1 || x >= 9}, {x}]` that is the wrong
   * branch, returning 49 where Wolfram returns 1. Refusing by name is the
   * honest answer until the engines can express a disjunctive region.
   */
  private flattenConstraints(
    expression: WolframExpression,
    head: string,
  ): string[] {
    if (expression.kind === "binary" && expression.operator === "||") {
      throw new WolframSyntaxError(
        `${head} does not support the disjunctive constraint '||': its ` +
          `engines take constraints that hold together, with no ` +
          `disjunctive region to lower onto`,
        expression.span,
      );
    }
    if (expression.kind === "binary" && expression.operator === "&&") {
      return [
        ...this.flattenConstraints(expression.left, head),
        ...this.flattenConstraints(expression.right, head),
      ];
    }
    if (expression.kind === "list") {
      return expression.elements.flatMap((element) =>
        this.flattenConstraints(element, head)
      );
    }
    // `a <= x <= b` is the spelling Wolfram's own Constrained Optimization
    // tutorial uses to bound a variable, and it is two constraints, not
    // one. Python's chained comparison would be the faithful lowering
    // anywhere else, but not here: chaining is defined as `a <= x and
    // x <= b`, and that `and` short-circuits away a relation exactly as a
    // written-out `&&` does. Splitting the chain into its individual
    // relations is what actually reaches the engine as two constraints.
    const chain = comparisonChain(expression);
    if (chain.operators.length > 1) {
      return chain.operators.map((operator_, index) => {
        const left = this.expression(chain.operands[index]);
        const right = this.expression(chain.operands[index + 1]);
        return `(${left} ${operator_} ${right})`;
      });
    }
    return [this.expression(expression)];
  }

  /**
   * Lower `FindFit[data, expr, pars, vars]`, Wolfram's four-argument curve
   * fitting head. Not handled by `optimizationCall`: see the comment above
   * `OPTIMIZATION_HEADS`. `pars` and `vars` each carry symbols that need
   * declaring, in the same two shapes `optimizationVariables` already
   * reads for `NMinimize`'s and `FindMinimum`'s variable arguments -- a
   * bare symbol, a `List` of symbols, or a `List` of `{symbol, ...}` pairs
   * -- so that one helper collects both instead of a second copy of it.
   * Trailing Rule arguments all decline, through `FIND_FIT_OPTIONS` -- see
   * its own comment for why not one of them has anywhere to go.
   */
  private findFitCall(expression: CallExpression): string {
    const head = "FindFit";
    if (expression.arguments.length < 4) {
      throw new WolframSyntaxError(
        `${head} requires data, a model, the fit parameters, and the ` +
          `independent variables`,
        expression.span,
      );
    }
    const [data, model, pars, vars_] = expression.arguments;
    for (const symbol of this.optimizationVariables(pars)) {
      this.plotVariables.add(this.name(symbol));
    }
    for (const symbol of this.optimizationVariables(vars_)) {
      this.plotVariables.add(this.name(symbol));
    }
    const options = this.lowerOptimizationOptions(
      expression.arguments.slice(4),
      head,
      FIND_FIT_OPTIONS,
    );
    const positional = [data, model, pars, vars_].map((argument) =>
      this.expression(argument)
    );
    return `_wolfram.${head}(${[...positional, ...options].join(", ")})`;
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
        // A chain of comparisons lowers to Python's own chained form,
        // which means the same thing Wolfram's does. Parenthesizing it
        // left-associatively instead would compare a boolean against the
        // next operand: `3 <= 2 <= 1` became `(3 <= 2) <= 1`, i.e.
        // `False <= 1`, i.e. `0 <= 1`, i.e. True -- the opposite answer.
        if (COMPARISON_OPERATORS.has(expression.operator)) {
          const chain = comparisonChain(expression);
          if (chain.operators.length > 1) {
            const parts = [this.expression(chain.operands[0])];
            for (const [index, operator_] of chain.operators.entries()) {
              parts.push(operator_, this.expression(chain.operands[index + 1]));
            }
            return `(${parts.join(" ")})`;
          }
        }
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
