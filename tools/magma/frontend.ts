import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { Node as SyntaxNode, Tree } from "web-tree-sitter";
import {
  createTreeSitterParser,
  firstSyntaxError,
  sourceSpan,
} from "../foreign/tree-sitter";
import { ForeignFrontend } from "../foreign/types";
import {
  AggregateExpression,
  BinaryExpression,
  CallExpression,
  ForStatement,
  GeneratorAssignmentStatement,
  IfBranch,
  IfStatement,
  IndexExpression,
  LiteralExpression,
  MagmaExpression,
  MagmaProgram,
  MagmaStatement,
  NameExpression,
  RangeExpression,
  SourceSpan,
  UnaryExpression,
  WhileStatement,
} from "./ast";

const MAGMA_WASM = "tree-sitter-magma.wasm";

export class MagmaSyntaxError extends SyntaxError {
  readonly line: number;
  readonly column: number;
  readonly incomplete: boolean;

  constructor(
    message: string,
    span: SourceSpan,
    incomplete = false,
  ) {
    super(message);
    this.name = "MagmaSyntaxError";
    this.line = span.start.line;
    this.column = span.start.column;
    this.incomplete = incomplete;
  }

  override toString(): string {
    return `${this.name}: ${this.line}:${this.column}: ${this.message}`;
  }
}

export interface MagmaLowering {
  ast: MagmaProgram;
  source: string;
  hasResult?: boolean;
  loadedFiles: string[];
  attachedFiles: string[];
}

export interface MagmaLowerOptions {
  filename?: string;
  captureResult?: boolean;
}

export interface MagmaFrontend extends ForeignFrontend {
  readonly language: "magma";
  parse(source: string): MagmaProgram;
  lower(source: string, options?: MagmaLowerOptions): MagmaLowering;
}

const span = sourceSpan;

function requiredField(node: SyntaxNode, name: string): SyntaxNode {
  const child = node.childForFieldName(name);
  if (!child) {
    throw new MagmaSyntaxError(
      `the Magma parser did not provide the required '${name}' field for ${node.type}`,
      span(node),
    );
  }
  return child;
}

class AstBuilder {
  constructor(private readonly source: string) {}

  private text(node: SyntaxNode): string {
    return this.source.slice(node.startIndex, node.endIndex);
  }

  private unsupported(node: SyntaxNode, description = node.type): never {
    throw new MagmaSyntaxError(
      `Magma ${description} syntax is recognized but is not supported yet`,
      span(node),
    );
  }

  program(tree: Tree): MagmaProgram {
    const root = tree.rootNode;
    if (root.type !== "program") {
      throw new MagmaSyntaxError("expected a Magma program", span(root));
    }
    return {
      kind: "program",
      body: root.namedChildren.map((node) => this.statement(node)),
      span: span(root),
    };
  }

  private block(node: SyntaxNode | null): MagmaStatement[] {
    if (!node) return [];
    return node.namedChildren.map((child) => this.statement(child));
  }

  private statement(node: SyntaxNode): MagmaStatement {
    switch (node.type) {
      case "assignment":
        return this.assignment(node);
      case "expression_statement":
        if (node.namedChildren.length === 1) {
          const expression = this.expression(node.namedChildren[0]);
          if (
            expression.kind === "call" &&
            expression.callee.kind === "name" &&
            (expression.callee.name === "Load" ||
              expression.callee.name === "Attach") &&
            expression.arguments.length === 1 &&
            expression.arguments[0].kind === "literal" &&
            expression.arguments[0].literalKind === "string"
          ) {
            return {
              kind: expression.callee.name === "Attach" ? "attach" : "load",
              filename: this.stringValue(expression.arguments[0]),
              span: span(node),
            };
          }
        }
        return {
          kind: "expression-statement",
          expressions: node.namedChildren.map((child) =>
            this.expression(child)
          ),
          span: span(node),
        };
      case "load_directive": {
        const filename = node.namedChildren.find(
          (child) => child.type === "string",
        );
        if (!filename) {
          return this.unsupported(node, "dynamic load filename");
        }
        return {
          kind: "load",
          filename: this.stringValue(this.expression(filename)),
          span: span(node),
        };
      }
      case "print_statement":
        return {
          kind: "print",
          expressions: node.namedChildren.map((child) =>
            this.expression(child)
          ),
          span: span(node),
        };
      case "if_statement":
        return this.ifStatement(node);
      case "for_statement":
        return this.forStatement(node);
      case "while_statement":
        return this.whileStatement(node);
      case "return_statement":
        return {
          kind: "return",
          values: node.namedChildren.map((child) => this.expression(child)),
          span: span(node),
        };
      case "break_statement":
        return { kind: "break", span: span(node) };
      case "continue_statement":
        return { kind: "continue", span: span(node) };
      default:
        return this.unsupported(node, `statement '${node.type}'`);
    }
  }

  private assignment(
    node: SyntaxNode,
  ): MagmaStatement {
    const targets = node.childrenForFieldName("left");
    const values = node.childrenForFieldName("right");
    if (targets.length === 1 && targets[0].type === "constructor") {
      const constructor = targets[0];
      const name = requiredField(constructor, "name");
      const generators = constructor.namedChildren.filter(
        (child) => child.id !== name.id,
      );
      if (
        name.type !== "identifier" ||
        !generators.length ||
        generators.some((child) => child.type !== "identifier") ||
        values.length !== 1
      ) {
        return this.unsupported(node, "generator assignment");
      }
      const statement: GeneratorAssignmentStatement = {
        kind: "generator-assignment",
        target: this.name(name),
        generators: generators.map((child) => this.name(child)),
        value: this.expression(values[0]),
        span: span(node),
      };
      return statement;
    }
    if (!targets.length || !values.length) {
      throw new MagmaSyntaxError("invalid Magma assignment", span(node));
    }
    return {
      kind: "assignment",
      targets: targets.map((child) => this.expression(child)),
      values: values.map((child) => this.expression(child)),
      span: span(node),
    };
  }

  private ifStatement(node: SyntaxNode): IfStatement {
    const branches: IfBranch[] = [{
      condition: this.expression(requiredField(node, "condition")),
      body: this.block(node.childForFieldName("consequence")),
      span: span(node),
    }];
    for (const clause of node.childrenForFieldName("elif")) {
      branches.push({
        condition: this.expression(requiredField(clause, "condition")),
        body: this.block(clause.childForFieldName("consequence")),
        span: span(clause),
      });
    }
    const otherwise = node.childForFieldName("default");
    return {
      kind: "if",
      branches,
      otherwise: otherwise
        ? this.block(otherwise.childForFieldName("consequence"))
        : [],
      span: span(node),
    };
  }

  private forStatement(node: SyntaxNode): ForStatement {
    const quantifier = requiredField(node, "quantifier");
    const from = quantifier.childForFieldName("from");
    const to = quantifier.childForFieldName("to");
    let target: NameExpression;
    let iterable: MagmaExpression;
    if (from && to) {
      const names = quantifier.namedChildren.filter(
        (child) => child.type === "identifier",
      );
      if (names.length !== 1) {
        return this.unsupported(node, "multi-variable numeric for-loop");
      }
      target = this.name(names[0]);
      const range: RangeExpression = {
        kind: "range",
        start: this.expression(from),
        end: this.expression(to),
        step: quantifier.childForFieldName("by")
          ? this.expression(requiredField(quantifier, "by"))
          : undefined,
        span: span(quantifier),
      };
      iterable = range;
    } else {
      if (quantifier.namedChildren.length !== 1) {
        return this.unsupported(node, "multi-quantifier for-loop");
      }
      const membership = this.expression(quantifier.namedChildren[0]);
      if (
        membership.kind !== "binary" ||
        membership.operator !== "in" ||
        membership.left.kind !== "name"
      ) {
        return this.unsupported(node, "for-loop quantifier");
      }
      target = membership.left;
      iterable = membership.right;
    }
    return {
      kind: "for",
      target,
      iterable,
      body: this.block(requiredField(node, "body")),
      span: span(node),
    };
  }

  private whileStatement(node: SyntaxNode): WhileStatement {
    return {
      kind: "while",
      condition: this.expression(requiredField(node, "condition")),
      body: this.block(requiredField(node, "body")),
      span: span(node),
    };
  }

  private name(node: SyntaxNode): NameExpression {
    return { kind: "name", name: this.text(node), span: span(node) };
  }

  private stringValue(expression: MagmaExpression): string {
    if (
      expression.kind !== "literal" ||
      expression.literalKind !== "string"
    ) {
      throw new MagmaSyntaxError(
        "Magma load and attach currently require a literal filename",
        expression.span,
      );
    }
    try {
      return JSON.parse(expression.value);
    } catch {
      throw new MagmaSyntaxError(
        "invalid Magma filename string",
        expression.span,
      );
    }
  }

  private expression(node: SyntaxNode): MagmaExpression {
    switch (node.type) {
      case "identifier":
        return this.name(node);
      case "integer":
      case "real": {
        const literal: LiteralExpression = {
          kind: "literal",
          literalKind: node.type,
          value: this.text(node).replace(/\\\s+/g, ""),
          span: span(node),
        };
        return literal;
      }
      case "string":
        return {
          kind: "literal",
          literalKind: "string",
          value: this.text(node),
          span: span(node),
        };
      case "true":
      case "false":
        return {
          kind: "literal",
          literalKind: "boolean",
          value: node.type,
          span: span(node),
        };
      case "binary_operator":
      case "boolean_operator":
        return this.binary(node);
      case "unary_operator":
        return this.unary(node);
      case "call":
        return this.call(node);
      case "parenthesized_expression":
        return this.expression(node.namedChildren[0]);
      case "seqenum":
        return this.aggregate(node, "sequence");
      case "set":
        return this.aggregate(node, "set");
      case "tuple":
        return this.aggregate(node, "tuple");
      case "range":
        return this.range(node);
      case "seq_slice":
        return this.index(node);
      default:
        return this.unsupported(node, `expression '${node.type}'`);
    }
  }

  private binary(node: SyntaxNode): BinaryExpression {
    const leftNode = requiredField(node, "left");
    const rightNode = requiredField(node, "right");
    const operatorNode = node.childForFieldName("operator");
    const operator = operatorNode
      ? this.text(operatorNode)
      : this.source.slice(leftNode.endIndex, rightNode.startIndex).trim();
    return {
      kind: "binary",
      operator,
      left: this.expression(leftNode),
      right: this.expression(rightNode),
      span: span(node),
    };
  }

  private unary(node: SyntaxNode): UnaryExpression {
    const operand = requiredField(node, "right");
    const operatorNode = node.childForFieldName("operator");
    const operator = operatorNode
      ? this.text(operatorNode)
      : this.source.slice(node.startIndex, operand.startIndex).trim();
    return {
      kind: "unary",
      operator,
      operand: this.expression(operand),
      span: span(node),
    };
  }

  private call(node: SyntaxNode): CallExpression {
    const argumentsNode = requiredField(node, "arguments");
    const optionalArguments = argumentsNode.namedChildren.filter(
      (child) => child.type === "optional_argument",
    );
    if (optionalArguments.length) {
      return this.unsupported(node, "optional intrinsic arguments");
    }
    return {
      kind: "call",
      callee: this.expression(requiredField(node, "function")),
      arguments: argumentsNode.childrenForFieldName("argument").map(
        (child) => this.expression(child),
      ),
      span: span(node),
    };
  }

  private aggregate(
    node: SyntaxNode,
    aggregateKind: AggregateExpression["aggregateKind"],
  ): AggregateExpression {
    return {
      kind: "aggregate",
      aggregateKind,
      elements: node.namedChildren.map((child) => this.expression(child)),
      span: span(node),
    };
  }

  private range(node: SyntaxNode): RangeExpression {
    const stepNode = node.childForFieldName("by");
    return {
      kind: "range",
      start: this.expression(requiredField(node, "start")),
      end: this.expression(requiredField(node, "end")),
      step: stepNode ? this.expression(stepNode) : undefined,
      span: span(node),
    };
  }

  private index(node: SyntaxNode): IndexExpression {
    const value = this.expression(requiredField(node, "parent"));
    const indexNodes = node.namedChildren.filter(
      (child) => child.type === "seqenum",
    );
    if (indexNodes.length !== 1) {
      return this.unsupported(node, "multi-dimensional indexing");
    }
    return {
      kind: "index",
      value,
      indices: indexNodes[0].namedChildren.map((child) =>
        this.expression(child)
      ),
      span: span(node),
    };
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
  private readonly intrinsicNames = new Set([
    "Divisors",
    "Factorization",
    "Integers",
    "IsPrime",
    "Parent",
    "PolynomialRing",
    "PrimeDivisors",
    "Rationals",
    "Type",
  ]);

  program(program: MagmaProgram, captureResult = false): string {
    const lastIndex = program.body.length - 1;
    const body = program.body.map((statement, index) => {
      const asResult = captureResult &&
        index === lastIndex &&
        statement.kind === "expression-statement";
      return this.statement(statement, 0, asResult);
    }).join("");
    return `import magma as _magma\n${body}`;
  }

  private name(raw: string): string {
    let result = this.names.get(raw);
    if (result) return result;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) && !PYTHON_KEYWORDS.has(raw)) {
      result = raw;
    } else {
      const encoded = Array.from(raw)
        .map((character) => character.codePointAt(0)!.toString(16))
        .join("_");
      result = `_magma_${encoded}`;
    }
    this.names.set(raw, result);
    return result;
  }

  private referenceName(raw: string): string {
    return this.intrinsicNames.has(raw)
      ? `_magma.${raw}`
      : this.name(raw);
  }

  private statements(statements: MagmaStatement[], depth: number): string {
    if (!statements.length) return `${"    ".repeat(depth)}pass\n`;
    return statements.map((statement) => this.statement(statement, depth)).join("");
  }

  private statement(
    statement: MagmaStatement,
    depth: number,
    asResult = false,
  ): string {
    const indentation = "    ".repeat(depth);
    switch (statement.kind) {
      case "assignment":
        return `${indentation}${statement.targets.map((target) =>
          this.expression(target)
        ).join(", ")} = ${statement.values.map((value) =>
          this.expression(value)
        ).join(", ")}\n`;
      case "generator-assignment":
        return this.generatorAssignment(statement, depth);
      case "expression-statement":
        if (asResult) {
          const expressions = statement.expressions.map((expression) =>
            this.expression(expression)
          );
          return `${indentation}${
            expressions.length === 1
              ? expressions[0]
              : `(${expressions.join(", ")})`
          }\n`;
        }
        return `${indentation}print(${statement.expressions.map((expression) =>
          this.expression(expression)
        ).join(", ")})\n`;
      case "print":
        return `${indentation}print(${statement.expressions.map((expression) =>
          this.expression(expression)
        ).join(", ")})\n`;
      case "if":
        return this.ifStatement(statement, depth);
      case "for":
        return `${indentation}for ${this.name(statement.target.name)} in ${
          this.expression(statement.iterable)
        }:\n${this.statements(statement.body, depth + 1)}`;
      case "while":
        return `${indentation}while ${this.expression(statement.condition)}:\n${
          this.statements(statement.body, depth + 1)
        }`;
      case "return":
        return `${indentation}return${statement.values.length
          ? ` ${statement.values.map((value) => this.expression(value)).join(", ")}`
          : ""}\n`;
      case "break":
      case "continue":
        return `${indentation}${statement.kind}\n`;
      case "load":
      case "attach":
        throw new MagmaSyntaxError(
          "internal error: unexpanded Magma file statement",
          statement.span,
        );
    }
  }

  private generatorAssignment(
    statement: GeneratorAssignmentStatement,
    depth: number,
  ): string {
    if (statement.generators.length !== 1) {
      throw new MagmaSyntaxError(
        "multigenerator assignments are recognized but not supported yet",
        statement.span,
      );
    }
    const indentation = "    ".repeat(depth);
    const target = this.name(statement.target.name);
    const generator = this.name(statement.generators[0].name);
    let value: string;
    if (
      statement.value.kind === "call" &&
      statement.value.callee.kind === "name" &&
      statement.value.callee.name === "PolynomialRing"
    ) {
      const arguments_ = statement.value.arguments.map((argument) =>
        this.expression(argument)
      );
      arguments_.push(JSON.stringify(statement.generators[0].name));
      value = `${this.referenceName("PolynomialRing")}(${arguments_.join(", ")})`;
    } else {
      value = this.expression(statement.value);
    }
    return `${indentation}${target} = ${value}\n` +
      `${indentation}${generator} = ${target}.gen()\n`;
  }

  private ifStatement(statement: IfStatement, depth: number): string {
    const indentation = "    ".repeat(depth);
    let output = "";
    statement.branches.forEach((branch, index) => {
      output += `${indentation}${index === 0 ? "if" : "elif"} ${
        this.expression(branch.condition)
      }:\n`;
      output += this.statements(branch.body, depth + 1);
    });
    if (statement.otherwise.length) {
      output += `${indentation}else:\n`;
      output += this.statements(statement.otherwise, depth + 1);
    }
    return output;
  }

  private expression(expression: MagmaExpression): string {
    switch (expression.kind) {
      case "name":
        return this.referenceName(expression.name);
      case "literal":
        if (expression.literalKind === "boolean") {
          return expression.value === "true" ? "True" : "False";
        }
        return expression.value;
      case "unary": {
        if (expression.operator === "#") {
          return `len(${this.expression(expression.operand)})`;
        }
        if (["+", "-", "not", "~"].includes(expression.operator)) {
          return `(${expression.operator} ${this.expression(expression.operand)})`;
        }
        throw new MagmaSyntaxError(
          `Magma unary operator '${expression.operator}' is not supported yet`,
          expression.span,
        );
      }
      case "binary":
        return this.binary(expression);
      case "call":
        return `${this.expression(expression.callee)}(${
          expression.arguments.map((argument) => this.expression(argument)).join(", ")
        })`;
      case "aggregate": {
        if (
          expression.aggregateKind === "sequence" &&
          expression.elements.length === 1 &&
          expression.elements[0].kind === "range"
        ) {
          return this.expression(expression.elements[0]);
        }
        const elements = expression.elements.map((element) =>
          this.expression(element)
        ).join(", ");
        if (expression.aggregateKind === "sequence") return `[${elements}]`;
        if (expression.aggregateKind === "set") return `{${elements}}`;
        return `(${elements}${expression.elements.length === 1 ? "," : ""})`;
      }
      case "range":
        return `_magma.magma_range(${this.expression(expression.start)}, ${
          this.expression(expression.end)
        }${expression.step ? `, ${this.expression(expression.step)}` : ""})`;
      case "index":
        if (expression.indices.length !== 1) {
          throw new MagmaSyntaxError(
            "multi-index Magma access is not supported yet",
            expression.span,
          );
        }
        return `_magma.magma_getitem(${this.expression(expression.value)}, ${
          this.expression(expression.indices[0])
        })`;
    }
  }

  private binary(expression: BinaryExpression): string {
    if (expression.operator === "!") {
      return `${this.expression(expression.left)}(${
        this.expression(expression.right)
      })`;
    }
    const operators: Record<string, string> = {
      "^": "^",
      "+": "+",
      "-": "-",
      "*": "*",
      "/": "/",
      "div": "//",
      "mod": "%",
      "eq": "==",
      "ne": "!=",
      "cmpeq": "==",
      "cmpne": "!=",
      "gt": ">",
      "ge": ">=",
      "lt": "<",
      "le": "<=",
      "and": "and",
      "or": "or",
      "xor": "!=",
      "in": "in",
      "notin": "not in",
      "cat": "+",
    };
    const operator = operators[expression.operator];
    if (!operator) {
      throw new MagmaSyntaxError(
        `Magma binary operator '${expression.operator}' is not supported yet`,
        expression.span,
      );
    }
    return `(${this.expression(expression.left)} ${operator} ${
      this.expression(expression.right)
    })`;
  }
}

let frontendPromise: Promise<MagmaFrontend> | undefined;

export function createMagmaFrontend(): Promise<MagmaFrontend> {
  if (frontendPromise) return frontendPromise;
  frontendPromise = (async () => {
    const parser = await createTreeSitterParser(MAGMA_WASM);

    function parse(source: string): MagmaProgram {
      const tree = parser.parse(source);
      if (!tree) {
        throw new Error("Tree-sitter did not return a Magma syntax tree");
      }
      try {
        if (tree.rootNode.hasError) {
          const error = firstSyntaxError(tree.rootNode) ?? tree.rootNode;
          const errorSpan = span(error);
          const incomplete =
            error.isMissing ||
            error.endIndex >= source.trimEnd().length;
          throw new MagmaSyntaxError(
            error.isMissing
              ? `expected ${error.type.replace(/^"|"$/g, "")}`
              : "invalid or incomplete Magma syntax",
            errorSpan,
            incomplete,
          );
        }
        return new AstBuilder(source).program(tree);
      } finally {
        tree.delete();
      }
    }

    function expandFiles(
      statements: MagmaStatement[],
      baseDirectory: string,
      activeFiles: Set<string>,
      loadedFiles: string[],
      attachedFiles: string[],
    ): MagmaStatement[] {
      const expanded: MagmaStatement[] = [];
      for (const statement of statements) {
        if (statement.kind === "load" || statement.kind === "attach") {
          const requestedFilename = statement.filename.startsWith("~/")
            ? resolve(homedir(), statement.filename.slice(2))
            : statement.filename;
          const filename = resolve(baseDirectory, requestedFilename);
          if (activeFiles.has(filename)) {
            throw new MagmaSyntaxError(
              `recursive Magma load detected: ${filename}`,
              statement.span,
            );
          }
          let fileSource: string;
          try {
            fileSource = readFileSync(filename, "utf8");
          } catch (error) {
            const detail = error instanceof Error
              ? error.message
              : String(error);
            throw new MagmaSyntaxError(
              `cannot ${statement.kind} '${statement.filename}': ${detail}`,
              statement.span,
            );
          }
          activeFiles.add(filename);
          try {
            const fileAst = parse(fileSource);
            loadedFiles.push(filename);
            if (
              statement.kind === "attach" &&
              !attachedFiles.includes(filename)
            ) {
              attachedFiles.push(filename);
            }
            expanded.push(...expandFiles(
              fileAst.body,
              dirname(filename),
              activeFiles,
              loadedFiles,
              attachedFiles,
            ));
          } finally {
            activeFiles.delete(filename);
          }
          continue;
        }
        if (statement.kind === "if") {
          expanded.push({
            ...statement,
            branches: statement.branches.map((branch) => ({
              ...branch,
              body: expandFiles(
                branch.body,
                baseDirectory,
                activeFiles,
                loadedFiles,
                attachedFiles,
              ),
            })),
            otherwise: expandFiles(
              statement.otherwise,
              baseDirectory,
              activeFiles,
              loadedFiles,
              attachedFiles,
            ),
          });
          continue;
        }
        if (
          statement.kind === "for" ||
          statement.kind === "while"
        ) {
          expanded.push({
            ...statement,
            body: expandFiles(
              statement.body,
              baseDirectory,
              activeFiles,
              loadedFiles,
              attachedFiles,
            ),
          });
          continue;
        }
        expanded.push(statement);
      }
      return expanded;
    }

    return {
      language: "magma",
      parse,
      lower(
        source: string,
        options: MagmaLowerOptions = {},
      ): MagmaLowering {
        const ast = parse(source);
        const baseDirectory = options.filename &&
            !options.filename.startsWith("<")
          ? dirname(resolve(options.filename))
          : process.cwd();
        const loadedFiles: string[] = [];
        const attachedFiles: string[] = [];
        const expandedAst: MagmaProgram = {
          ...ast,
          body: expandFiles(
            ast.body,
            baseDirectory,
            new Set<string>(),
            loadedFiles,
            attachedFiles,
          ),
        };
        return {
          ast,
          source: new SageLowerer().program(
            expandedAst,
            options.captureResult,
          ),
          hasResult: options.captureResult &&
            expandedAst.body.at(-1)?.kind === "expression-statement",
          loadedFiles,
          attachedFiles,
        };
      },
    };
  })();
  return frontendPromise;
}
