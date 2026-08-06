import type { Node as SyntaxNode } from "web-tree-sitter";

import type { PythonSyntaxTree } from "./frontend";
import { PythonAstSemanticAnalyzer } from "./semantic";

export class UnsupportedPythonCstNode extends Error {
  readonly nodeType: string;
  readonly line: number;
  readonly column: number;

  constructor(node: SyntaxNode, detail = "") {
    super(
      `CST lowering is not implemented for ${node.type} at ` +
      `${node.startPosition.row + 1}:${node.startPosition.column + 1}` +
      (detail ? ` (${detail})` : ""),
    );
    this.name = "UnsupportedPythonCstNode";
    this.nodeType = node.type;
    this.line = node.startPosition.row + 1;
    this.column = node.startPosition.column + 1;
  }
}

export interface CstLoweringResult {
  ast: any;
  directlyLoweredNodeTypes: ReadonlySet<string>;
}

function significantChildren(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter(
    (child) => child.type !== "comment" && child.type !== "line_continuation",
  );
}

/**
 * Lower Tree-sitter Python/Sage nodes into the established Sage.js semantic
 * AST classes.  This module has no parser: every branch consumes an explicit
 * named grammar node, making lowering coverage enumerable and auditable.
 *
 * Scope/import/class finalization still comes from the existing semantic
 * pipeline.  `lowerModule` therefore receives its finalized top-level shell
 * and replaces only the syntax-owned statement body.
 */
export class PythonCstLowerer {
  private readonly lowered = new Set<string>();
  private currentToplevel: any = null;
  private annotationsMode: any = false;
  private readonly knownClasses = new Map<string, any>();
  private readonly intrinsicModules = new Map<string, Record<string, string>>();
  private nativeBitwise = false;

  constructor(
    private readonly compiler: any,
    private readonly syntax: PythonSyntaxTree,
    private readonly options: Record<string, any>,
  ) {}

  lowerModule(finalizedToplevel: any): CstLoweringResult {
    const root = this.syntax.tree.rootNode;
    if (root.type !== "module") throw new UnsupportedPythonCstNode(root);
    this.lowered.add(root.type);
    this.currentToplevel = finalizedToplevel;
    this.nativeBitwise = this.syntax.source.includes("# sagejs: native-bitwise");
    for (const [name, details] of Object.entries(
      this.compiler.NATIVE_CLASSES ?? {},
    )) this.knownClasses.set(name, details);
    for (const name of [
      "BaseException", "Exception", "SystemExit", "KeyboardInterrupt",
      "AttributeError", "ArithmeticError", "LookupError", "IndexError",
      "KeyError", "ValueError", "EOFError", "ImportError", "MemoryError",
      "OSError", "IndentationError", "SyntaxError", "TypeError", "NameError",
      "NotImplementedError", "UnicodeDecodeError", "AssertionError",
      "ZeroDivisionError", "OverflowError", "StopIteration",
      "StopAsyncIteration", "RuntimeError", "GeneratorExit",
    ]) this.knownClasses.set(name, Object.create(null));
    for (const [name, details] of Object.entries(
      finalizedToplevel?.classes ?? {},
    )) this.knownClasses.set(name, details);
    for (const [name, details] of Object.entries(
      this.options.classes ?? {},
    )) this.knownClasses.set(name, details);
    this.annotationsMode = root.namedChildren.some(
      (node) => node.type === "future_import_statement",
    ) ? "future" : (this.options.scoped_flags?.annotations ?? false);
    const body = significantChildren(root).flatMap((node) =>
      this.lowerStatement(node)
    );
    const ast = new this.compiler.AST_Toplevel(finalizedToplevel);
    const extracted = this.extractDocstrings(body);
    ast.body = extracted.body;
    ast.docstrings = extracted.docstrings;
    ast.start = this.token(root, false);
    ast.end = this.token(root, true);
    new PythonAstSemanticAnalyzer(this.compiler).analyze(ast);
    return {
      ast,
      directlyLoweredNodeTypes: new Set(this.lowered),
    };
  }

  private token(node: SyntaxNode, end: boolean): any {
    const point = end ? node.endPosition : node.startPosition;
    const position = end ? node.endIndex : node.startIndex;
    return new this.compiler.AST_Token({
      type: node.type,
      value: node.text,
      raw: node.text,
      is_integer: node.type === "integer",
      numeric_suffix: "",
      line: point.row + 1,
      col: point.column,
      pos: position,
      endpos: position,
      nlb: false,
      delimiter_depth: 0,
      comments_before: [],
      file: this.options.filename ?? null,
      leading_whitespace: "",
    });
  }

  private make(name: string, node: SyntaxNode, properties = {}): any {
    const Constructor = this.compiler[name];
    if (typeof Constructor !== "function") {
      throw new TypeError(`unknown Sage.js AST constructor ${name}`);
    }
    this.lowered.add(node.type);
    return new Constructor({
      start: this.token(node, false),
      end: this.token(node, true),
      ...properties,
    });
  }

  private field(node: SyntaxNode, name: string): SyntaxNode {
    const child = node.childForFieldName(name);
    if (!child) throw new UnsupportedPythonCstNode(node, `missing ${name}`);
    return child;
  }

  private optionalField(node: SyntaxNode, name: string): SyntaxNode | null {
    return node.childForFieldName(name);
  }

  private lowerStatement(node: SyntaxNode): any[] {
    this.lowered.add(node.type);
    switch (node.type) {
      case "expression_statement": {
        const expressions = significantChildren(node);
        if (!expressions.length) throw new UnsupportedPythonCstNode(node);
        const expression = expressions.length === 1
          ? this.lowerExpression(expressions[0])
          : this.sequenceFromExpressions(expressions, node, false);
        return [this.make("AST_SimpleStatement", node, {
          body: expression,
        })];
      }
      case "pass_statement":
        return [this.make("AST_EmptyStatement", node, { stype: "pass" })];
      case "break_statement":
        return [this.make("AST_Break", node)];
      case "continue_statement":
        return [this.make("AST_Continue", node)];
      case "return_statement": {
        const value = significantChildren(node)[0];
        return [this.make("AST_Return", node, {
          value: value ? this.lowerExpression(value) : null,
        })];
      }
      case "raise_statement": {
        const value = significantChildren(node)[0];
        const raised = value
          ? this.lowerExpression(value)
          : this.make("AST_SymbolCatch", node, { name: "ρσ_Exception" });
        return [this.make("AST_Throw", node, {
          value: raised,
        })];
      }
      case "assert_statement": {
        const values = significantChildren(node);
        return [this.make("AST_Assert", node, {
          condition: this.lowerExpression(values[0]),
          message: values[1] ? this.lowerExpression(values[1]) : null,
        })];
      }
      case "if_statement":
        return [this.lowerIf(node)];
      case "for_statement":
        return [this.lowerFor(node, false)];
      case "async_for_statement":
        return [this.lowerFor(node, true)];
      case "while_statement": {
        const alternative = significantChildren(node).find(
          (child) => child.type === "else_clause",
        );
        return [this.make("AST_While", node, {
          condition: this.lowerExpression(this.field(node, "condition")),
          body: this.lowerBlock(this.field(node, "body")),
          alternative: alternative
            ? this.lowerBlock(this.field(alternative, "body"))
            : null,
        })];
      }
      case "block":
        return significantChildren(node).flatMap((child) =>
          this.lowerStatement(child)
        );
      case "delete_statement": {
        const targets = significantChildren(node);
        const deleted = targets.map((target) =>
          this.make("AST_UnaryPrefix", node, {
            operator: "delete",
            expression: this.lowerExpression(target),
            parenthesized: false,
          })
        );
        return deleted.map((body) =>
          this.make("AST_SimpleStatement", node, { body })
        );
      }
      case "global_statement":
        return [this.lowerDeclaration(node, true)];
      case "nonlocal_statement":
        return [this.lowerDeclaration(node, false)];
      case "with_statement":
        return [this.lowerWith(node, false)];
      case "async_with_statement":
        return [this.lowerWith(node, true)];
      case "try_statement":
        return [this.lowerTry(node)];
      case "function_definition":
        return [this.lowerFunction(node, [], false)];
      case "class_definition":
        return [this.lowerClass(node, [])];
      case "decorated_definition":
        return this.lowerDecoratedDefinition(node);
      case "sage_generator_assignment":
        return [this.lowerSageGeneratorAssignment(node)];
      case "sage_help_statement": {
        const expression = this.field(node, "expression");
        return [this.make("AST_SimpleStatement", node, {
          body: this.make("AST_Existential", node, {
            expression: this.lowerExpression(expression),
            after: null,
          }),
        })];
      }
      case "import_statement":
      case "import_from_statement":
      case "future_import_statement":
        return [this.lowerImport(node)];
      default:
        throw new UnsupportedPythonCstNode(node);
    }
  }

  private lowerBlock(node: SyntaxNode): any {
    return this.make("AST_BlockStatement", node, {
      body: significantChildren(node).flatMap((child) =>
        this.lowerStatement(child)
      ),
    });
  }

  private lowerIf(node: SyntaxNode): any {
    const alternatives = significantChildren(node).filter(
      (child) => child.type === "elif_clause" || child.type === "else_clause",
    );
    let alternative: any = null;
    for (let index = alternatives.length - 1; index >= 0; index -= 1) {
      const clause = alternatives[index];
      if (clause.type === "else_clause") {
        alternative = this.lowerBlock(this.field(clause, "body"));
      } else {
        alternative = this.make("AST_If", clause, {
          condition: this.lowerExpression(this.field(clause, "condition")),
          body: this.lowerBlock(this.field(clause, "consequence")),
          alternative,
        });
      }
    }
    return this.make("AST_If", node, {
      condition: this.lowerExpression(this.field(node, "condition")),
      body: this.lowerBlock(this.field(node, "consequence")),
      alternative,
    });
  }

  private lowerFor(node: SyntaxNode, isAsync: boolean): any {
    const alternative = significantChildren(node).find(
      (child) => child.type === "else_clause",
    );
    const init = this.lowerBindingTarget(
      this.lowerExpression(this.field(node, "left")),
      this.field(node, "left"),
    );
    return this.make(isAsync ? "AST_AsyncFor" : "AST_ForIn", node, {
      init,
      name: null,
      object: this.lowerExpression(this.field(node, "right")),
      body: this.lowerBlock(this.field(node, "body")),
      alternative: alternative
        ? this.lowerBlock(this.field(alternative, "body"))
        : null,
    });
  }

  private lowerBindingTarget(target: any, node: SyntaxNode): any {
    if (target instanceof this.compiler.AST_Seq) {
      return this.make("AST_Array", node, {
        elements: target.to_array().map((item) =>
          this.lowerBindingTarget(item, node)
        ),
        is_tuple: false,
      });
    }
    return target;
  }

  private lowerDeclaration(node: SyntaxNode, isGlobal: boolean): any {
    return this.make("AST_Var", node, {
      definitions: significantChildren(node).map((name) =>
        this.make("AST_VarDef", name, {
          name: this.make("AST_SymbolNonlocal", name, { name: name.text }),
          value: null,
          is_global: isGlobal ? true : undefined,
        })
      ),
    });
  }

  private lowerWith(node: SyntaxNode, isAsync: boolean): any {
    const clause = significantChildren(node).find(
      (child) => child.type === "with_clause",
    );
    if (!clause) throw new UnsupportedPythonCstNode(node, "missing with clause");
    const clauses = significantChildren(clause).map((item) => {
      let value = this.field(item, "value");
      let alias: SyntaxNode | null = null;
      if (value.type === "as_pattern") {
        alias = value.childForFieldName("alias")?.namedChild(0) ?? null;
        value = value.childForFieldName("value") ?? significantChildren(value)[0];
      }
      return this.make("AST_WithClause", item, {
        expression: this.lowerExpression(value),
        alias: alias
          ? this.make("AST_SymbolAlias", alias, { name: alias.text })
          : null,
      });
    });
    return this.make("AST_With", node, {
      clauses,
      is_async: isAsync,
      body: this.lowerBlock(this.field(node, "body")),
    });
  }

  private lowerTry(node: SyntaxNode): any {
    const excepts = significantChildren(node).filter(
      (child) => child.type === "except_clause",
    );
    const exceptions = excepts.map((clause) => {
      let value = clause.childForFieldName("value");
      let alias: SyntaxNode | null = null;
      if (value?.type === "as_pattern") {
        alias = value.childForFieldName("alias")?.namedChild(0) ?? null;
        value = value.childForFieldName("value") ??
          significantChildren(value)[0] ?? null;
      }
      const errors = value
        ? (value.type === "tuple"
          ? significantChildren(value)
          : [value]).map((item) => this.lowerExpression(item))
        : [];
      const body = significantChildren(clause).find(
        (child) => child.type === "block",
      );
      if (!body) throw new UnsupportedPythonCstNode(clause, "missing body");
      return this.make("AST_Except", clause, {
        argname: alias
          ? this.make("AST_SymbolCatch", alias, { name: alias.text })
          : null,
        errors,
        body: significantChildren(body).flatMap((child) =>
          this.lowerStatement(child)
        ),
      });
    });
    const elseClause = significantChildren(node).find(
      (child) => child.type === "else_clause",
    );
    const finallyClause = significantChildren(node).find(
      (child) => child.type === "finally_clause",
    );
    const finallyBody = finallyClause
      ? significantChildren(finallyClause).find((child) => child.type === "block")
      : null;
    return this.make("AST_Try", node, {
      body: significantChildren(this.field(node, "body")).flatMap((child) =>
        this.lowerStatement(child)
      ),
      bcatch: exceptions.length
        ? this.make("AST_Catch", node, { body: exceptions })
        : null,
      belse: elseClause
        ? this.make("AST_Else", elseClause, {
          body: significantChildren(this.field(elseClause, "body")).flatMap(
            (child) => this.lowerStatement(child),
          ),
        })
        : null,
      bfinally: finallyBody
        ? this.make("AST_Finally", finallyClause!, {
          body: significantChildren(finallyBody).flatMap((child) =>
            this.lowerStatement(child)
          ),
        })
        : null,
    });
  }

  private lowerExpression(node: SyntaxNode): any {
    this.lowered.add(node.type);
    switch (node.type) {
      case "identifier":
      case "keyword_identifier":
        return this.make("AST_SymbolRef", node, { name: node.text });
      case "integer":
      case "float":
      case "sage_number":
        return this.lowerNumber(node);
      case "true":
        return this.make("AST_True", node);
      case "false":
        return this.make("AST_False", node);
      case "none":
        return this.make("AST_Null", node);
      case "ellipsis":
      case "sage_ellipsis":
        return this.make("AST_SymbolRef", node, { name: "Ellipsis" });
      case "string":
      case "concatenated_string":
        return this.lowerString(node);
      case "parenthesized_expression": {
        const child = significantChildren(node)[0];
        if (!child) return this.make("AST_Array", node, {
          elements: [],
          is_tuple: true,
        });
        const expression = this.lowerExpression(child);
        if (child.type === "binary_operator" &&
            this.optionalField(child, "operator")?.text === "..") {
          return this.lowerEllipsesRange([child], node, true);
        }
        if (expression instanceof this.compiler.AST_SymbolRef) {
          expression.parens = true;
        } else if (expression && typeof expression === "object") {
          expression.parenthesized = true;
        }
        return expression;
      }
      case "type":
      case "type_parameter": {
        const child = significantChildren(node)[0];
        if (!child) throw new UnsupportedPythonCstNode(node);
        return this.lowerExpression(child);
      }
      case "generic_type": {
        const [base, ...parameters] = significantChildren(node);
        const values = parameters.flatMap((parameter) =>
          parameter.type === "type_parameter"
            ? significantChildren(parameter)
            : [parameter]
        ).map((parameter) => this.lowerType(parameter));
        const property = values.length === 1
          ? values[0]
          : this.make("AST_Seq", node, {
            car: values[0],
            cdr: values.slice(1).reduceRight((right, left) =>
              this.make("AST_Seq", node, {
                car: left,
                cdr: right,
                parenthesized: false,
              }),
            ),
            parenthesized: true,
          });
        return this.make("AST_ItemAccess", node, {
          expression: this.lowerExpression(base),
          property,
          assignment: null,
        });
      }
      case "union_type": {
        const [left, right] = significantChildren(node);
        return this.make("AST_Binary", node, {
          left: this.lowerType(left),
          operator: "|",
          right: this.lowerType(right),
        });
      }
      case "expression_list":
      case "tuple":
      case "tuple_pattern":
      case "pattern_list":
        return this.lowerTuple(node);
      case "list":
      case "list_pattern":
        {
          const elements = significantChildren(node);
          if (this.syntax.mode === "sage" && elements.some((child) =>
            child.type === "sage_ellipsis" ||
            (child.type === "binary_operator" &&
              this.optionalField(child, "operator")?.text === "..")
          )) return this.lowerEllipsesRange(elements, node, false);
          return this.make("AST_Array", node, {
            elements: elements.map((child) =>
            this.lowerExpression(child)
            ),
            is_tuple: false,
          });
        }
      case "set":
        return this.make("AST_Set", node, {
          items: significantChildren(node).map((child) =>
            this.make("AST_SetItem", child, {
              value: this.lowerExpression(child),
            })
          ),
        });
      case "dictionary":
        return this.lowerDictionary(node);
      case "binary_operator":
      case "boolean_operator":
        {
          const operator = this.normalizeOperator(
            this.field(node, "operator").text,
          );
          return this.make("AST_Binary", node, {
            left: this.lowerExpression(this.field(node, "left")),
            operator,
            right: this.lowerExpression(this.field(node, "right")),
            native_operator: this.nativeBitwise &&
              ["&", "|", "^", "<<", ">>"].includes(operator),
          });
        }
      case "comparison_operator":
        return this.lowerComparison(node);
      case "unary_operator":
      case "not_operator": {
        const argument =
          this.optionalField(node, "argument") ??
          significantChildren(node).at(-1);
        if (!argument) throw new UnsupportedPythonCstNode(node);
        const operator =
          this.optionalField(node, "operator")?.text ?? "not";
        return this.make("AST_UnaryPrefix", node, {
          operator: operator === "not" ? "!" : operator,
          expression: this.lowerExpression(argument),
          native_operator: this.nativeBitwise && operator === "~",
        });
      }
      case "conditional_expression":
        {
          const [consequent, condition, alternative] = significantChildren(node);
          return this.make("AST_Conditional", node, {
            condition: this.lowerExpression(condition),
            consequent: this.lowerExpression(consequent),
            alternative: this.lowerExpression(alternative),
          });
        }
      case "assignment":
      case "augmented_assignment":
      case "named_expression":
        return this.lowerAssignment(node);
      case "lambda":
        return this.lowerLambda(node);
      case "list_comprehension":
        return this.lowerComprehension(node, "AST_ListComprehension");
      case "set_comprehension":
        return this.lowerComprehension(node, "AST_SetComprehension");
      case "dictionary_comprehension":
        return this.lowerComprehension(node, "AST_DictComprehension");
      case "generator_expression":
        return this.lowerComprehension(node, "AST_GeneratorComprehension");
      case "yield": {
        const child = significantChildren(node)[0];
        const isFrom = node.children.some((part) => part.text === "from");
        return this.make("AST_Yield", node, {
          is_yield_from: isFrom,
          value: child ? this.lowerExpression(child) : null,
        });
      }
      case "await": {
        const child = significantChildren(node)[0];
        return this.make("AST_Yield", node, {
          is_yield_from: true,
          value: this.lowerExpression(child),
        });
      }
      case "attribute":
        {
          const object = this.field(node, "object");
          const property = this.field(node, "attribute").text;
          const intrinsic = object.type === "identifier"
            ? this.intrinsicModules.get(object.text)?.[property]
            : undefined;
          if (intrinsic && !this.options.for_linting) {
            const symbol = this.make("AST_SymbolRef", node, { name: intrinsic });
            symbol.intrinsic_call = true;
            return symbol;
          }
          return this.make("AST_Dot", node, {
            expression: this.lowerExpression(object),
            property,
          });
        }
      case "sage_integer_attribute": {
        const separator = node.text.indexOf(".");
        const integer = node.text.slice(0, separator);
        const property = node.text.slice(separator + 1);
        return this.make("AST_Dot", node, {
          expression: this.numberFromText(node, integer, true),
          property,
        });
      }
      case "sage_generator_access":
        return this.make("AST_Call", node, {
          expression: this.make("AST_Dot", node, {
            expression: this.lowerExpression(this.field(node, "value")),
            property: "gen",
          }),
          args: [this.make("AST_Number", this.field(node, "index"), {
            value: Number(this.field(node, "index").text.replaceAll("_", "")),
          })],
        });
      case "sage_empty_subscript": {
        const names = this.options.sageGeneratorNames ?? [];
        const value = this.lowerExpression(this.field(node, "value"));
        const variableNames = names.length === 1
          ? this.make("AST_String", node, { value: names[0] })
          : this.make("AST_Array", node, {
            elements: names.map((name: string) =>
              this.make("AST_String", node, { value: name })
            ),
            is_tuple: false,
          });
        const call = this.make("AST_Call", node, {
          expression: this.make("AST_SymbolRef", node, {
            name: "PolynomialRing",
          }),
          args: [
            value,
            variableNames,
          ],
        });
        call.sage_empty_bracket_constructor = true;
        return call;
      }
      case "sage_symbolic_function_assignment":
        return this.lowerSageSymbolicFunction(node);
      case "call":
        return this.lowerCall(node);
      case "subscript":
        return this.lowerSubscript(node);
      case "list_splat":
      case "list_splat_pattern":
        return this.make("AST_UnaryPrefix", node, {
          operator: "*",
          expression: this.lowerExpression(significantChildren(node)[0]),
        });
      default:
        throw new UnsupportedPythonCstNode(node);
    }
  }

  private expressionKey(node: SyntaxNode): string | null {
    if (node.type === "identifier" || node.type === "keyword_identifier") {
      return node.text;
    }
    if (node.type === "attribute") {
      const base = this.expressionKey(this.field(node, "object"));
      return base ? `${base}.${this.field(node, "attribute").text}` : null;
    }
    return null;
  }

  private normalizeOperator(operator: string): string {
    if (this.syntax.mode === "sage") {
      if (operator === "^") return "**";
      if (operator === "^^") return "^";
      if (operator === "^=") return "**=";
      if (operator === "^^=") return "^=";
    }
    return ({
      and: "&&",
      or: "||",
      is: "===",
      "is not": "!==",
      "not in": "nin",
      not: "!",
    } as Record<string, string>)[operator] ?? operator;
  }

  private lowerComparison(node: SyntaxNode): any {
    const operands = significantChildren(node);
    if (operands.length < 2) throw new UnsupportedPythonCstNode(node);
    let result = this.lowerExpression(operands[0]);
    for (let index = 1; index < operands.length; index += 1) {
      const left = operands[index - 1];
      const right = operands[index];
      const spelling = this.syntax.source.slice(left.endIndex, right.startIndex)
        .trim().replace(/\s+/g, " ");
      result = this.make("AST_Binary", node, {
        left: result,
        operator: this.normalizeOperator(spelling),
        right: this.lowerExpression(right),
      });
    }
    return result;
  }

  private numberFromText(
    node: SyntaxNode,
    raw: string,
    integer: boolean,
  ): any {
    const mode = this.syntax.mode;
    const exact = mode === "sage" || !!this.options.exact_integer_literals ||
      !!this.currentToplevel?.scoped_flags?.numbers;
    if (!exact) {
      return this.make("AST_Number", node, {
        value: Number(raw.replaceAll("_", "")),
      });
    }
    const constructor = integer
      ? "Integer"
      : mode === "sage" ? "RealNumber" : "Number";
    return this.make("AST_Call", node, {
      expression: this.make("AST_SymbolRef", node, { name: constructor }),
      args: [this.make("AST_String", node, { value: raw })],
    });
  }

  private lowerNumber(node: SyntaxNode): any {
    const suffix = node.text.match(/[rRlLjJ]+$/)?.[0] ?? "";
    const raw = suffix ? node.text.slice(0, -suffix.length) : node.text;
    if (/[jJ]/.test(suffix)) throw new UnsupportedPythonCstNode(node, "complex");
    const integer = node.type === "integer" || (
      node.type === "sage_number" &&
      (/^0[xob]/i.test(raw) || (!raw.includes(".") && !/[eE]/.test(raw)))
    );
    return this.numberFromText(node, raw, integer);
  }

  private lowerString(node: SyntaxNode): any {
    if (node.type === "concatenated_string") {
      const strings = significantChildren(node).map((child) =>
        this.lowerString(child)
      );
      if (strings.every((string) => string instanceof this.compiler.AST_String)) {
        return this.make("AST_String", node, {
          value: strings.map((string) => string.value).join(""),
        });
      }
      if (strings.every((string) =>
        string instanceof this.compiler.AST_Call &&
        string.expression?.name === "ρσ_bytes_literal" &&
        string.args?.[0] instanceof this.compiler.AST_String
      )) {
        return this.make("AST_Call", node, {
          expression: this.make("AST_SymbolRef", node, {
            name: "ρσ_bytes_literal",
          }),
          args: [this.make("AST_String", node, {
            value: strings.map((string) => string.args[0].value).join(""),
          })],
        });
      }
      throw new SyntaxError("cannot mix bytes and nonbytes literals");
    }
    const stringStart = significantChildren(node).find(
      (child) => child.type === "string_start",
    );
    if (
      node.descendantsOfType("interpolation").length ||
      /^[fF]/.test(stringStart?.text ?? "")
    ) {
      return this.lowerFormattedString(node);
    }
    const input = this.compiler.tokenizer(
      node.text,
      this.options.filename ?? "<string>",
      true,
      this.syntax.mode === "sage",
    );
    const token = input();
    if (token.type === "string") {
      return this.make("AST_String", node, { value: token.value });
    }
    if (token.type === "bytes") {
      return this.make("AST_Call", node, {
        expression: this.make("AST_SymbolRef", node, {
          name: "ρσ_bytes_literal",
        }),
        args: [this.make("AST_String", node, { value: token.value })],
      });
    }
    if (token.type === "js") {
      return this.make("AST_Verbatim", node, { value: token.value });
    }
    throw new UnsupportedPythonCstNode(node, token.type);
  }

  private decodeStringFragment(node: SyntaxNode): any {
    const quoted = `"${node.text.replaceAll('"', '\\"')}"`;
    const token = this.compiler.tokenizer(
      quoted,
      this.options.filename ?? "<string>",
      true,
      this.syntax.mode === "sage",
    )();
    return this.make("AST_String", node, { value: token.value });
  }

  private lowerFormattedString(node: SyntaxNode): any {
    const pieces: any[] = [];
    for (const child of significantChildren(node)) {
      if (child.type === "string_start" || child.type === "string_end") continue;
      if (child.type === "string_content" || child.type === "escape_sequence") {
        pieces.push(this.decodeStringFragment(child));
        continue;
      }
      if (child.type !== "interpolation") {
        throw new UnsupportedPythonCstNode(child, "formatted string");
      }
      const expression = this.field(child, "expression");
      const conversion = significantChildren(child).find(
        (item) => item.type === "type_conversion",
      );
      const format = significantChildren(child).find(
        (item) => item.type === "format_specifier",
      );
      const debug = child.children.some((item) => item.text === "=");
      const inner = child.text.slice(1, -1);
      const debugPrefix = debug
        ? inner.match(/^(.+?=\s*)/)?.[1] ?? `${expression.text}=`
        : "";
      const formatText = `${debugPrefix}{${
        conversion?.text ?? (debug ? "!r" : "")
      }${format?.text ?? ""}}`;
      const lowered = this.lowerExpression(expression);
      if (lowered instanceof this.compiler.AST_SymbolRef) lowered.parens = true;
      pieces.push(this.make("AST_Call", child, {
        expression: this.make("AST_Dot", child, {
          expression: this.make("AST_SymbolRef", child, { name: "ρσ_str" }),
          property: "format",
        }),
        direct_call: false,
        args: [
          this.make("AST_String", child, { value: formatText }),
          lowered,
        ],
      }));
    }
    if (!pieces.length) return this.make("AST_String", node, { value: "" });
    if (pieces[0] instanceof this.compiler.AST_Call) {
      pieces.unshift(this.make("AST_String", node, { value: "" }));
    }
    if (pieces.at(-1) instanceof this.compiler.AST_Call) {
      pieces.push(this.make("AST_String", node, { value: "" }));
    }
    return pieces.slice(1).reduce(
      (left, right) => this.make("AST_Binary", node, {
        left,
        operator: "+",
        right,
      }),
      pieces[0],
    );
  }

  private lowerAssignment(node: SyntaxNode): any {
    const left =
      this.optionalField(node, "left") ?? this.field(node, "name");
    const annotation = this.optionalField(node, "type");
    if (annotation) {
      const value = this.optionalField(node, "right");
      return this.make("AST_AnnotatedAssignment", node, {
        target: this.lowerExpression(left),
        annotation: this.lowerType(annotation),
        value: value ? this.lowerExpression(value) : null,
      });
    }
    const right =
      this.optionalField(node, "right") ?? this.field(node, "value");
    const operator = this.normalizeOperator(
      this.optionalField(node, "operator")?.text ??
      "=",
    );
    const loweredLeft = this.lowerExpression(left);
    const loweredRight = this.lowerExpression(right);
    if (
      operator === "=" &&
      loweredLeft instanceof this.compiler.AST_ItemAccess
    ) {
      loweredLeft.assignment = loweredRight;
      return loweredLeft;
    }
    const assignment = this.make("AST_Assign", node, {
      left: loweredLeft,
      operator,
      right: loweredRight,
      native_operator: this.nativeBitwise &&
        ["&=", "|=", "^=", "<<=", ">>="].includes(operator),
    });
    assignment.is_walrus = node.type === "named_expression";
    return assignment;
  }

  private lowerType(node: SyntaxNode): any {
    const children = significantChildren(node);
    return children.length === 1
      ? this.lowerExpression(children[0])
      : this.lowerExpression(node);
  }

  private lowerParameters(node: SyntaxNode): any[] {
    const positional: any[] = [];
    const kwonly: any[] = [];
    const defaults: Record<string, any> = Object.create(null);
    let starargs: any = null;
    let kwargs: any = null;
    let keywordOnly = false;

    const makeArgument = (nameNode: SyntaxNode, typeNode: SyntaxNode | null) =>
      this.make("AST_SymbolFunarg", nameNode, {
        name: nameNode.text,
        annotation: typeNode ? this.lowerType(typeNode) : null,
        annotation_text: typeNode ? typeNode.text : null,
      });

    for (const parameter of significantChildren(node)) {
      if (parameter.type === "list_splat_pattern") {
        keywordOnly = true;
        const name = significantChildren(parameter)[0];
        starargs = name ? makeArgument(name, null) : null;
        continue;
      }
      if (parameter.type === "dictionary_splat_pattern") {
        const name = significantChildren(parameter)[0];
        kwargs = makeArgument(name, null);
        continue;
      }
      if (parameter.type === "keyword_separator") {
        keywordOnly = true;
        continue;
      }
      let name = parameter;
      let typeNode: SyntaxNode | null = null;
      let value: SyntaxNode | null = null;
      if (
        parameter.type === "default_parameter" ||
        parameter.type === "typed_default_parameter"
      ) {
        name = this.field(parameter, "name");
        typeNode = parameter.childForFieldName("type");
        value = this.field(parameter, "value");
      } else if (parameter.type === "typed_parameter") {
        name = significantChildren(parameter)[0];
        typeNode = parameter.childForFieldName("type");
        if (name.type === "list_splat_pattern") {
          keywordOnly = true;
          const identifier = significantChildren(name)[0];
          starargs = makeArgument(identifier, typeNode);
          continue;
        }
        if (name.type === "dictionary_splat_pattern") {
          const identifier = significantChildren(name)[0];
          kwargs = makeArgument(identifier, typeNode);
          continue;
        }
      }
      const argument = makeArgument(name, typeNode);
      (keywordOnly ? kwonly : positional).push(argument);
      if (value) defaults[name.text] = this.lowerExpression(value);
    }
    const args = positional as any;
    args.kwonly = kwonly;
    args.has_defaults = Object.keys(defaults).length > 0;
    args.starargs = starargs ?? undefined;
    args.kwargs = kwargs ?? undefined;
    args.defaults = defaults;
    args.is_simple_func = !kwonly.length && !starargs && !kwargs && !args.has_defaults;
    return args;
  }

  private emptyParameters(): any[] {
    const args: any = [];
    args.kwonly = [];
    args.has_defaults = false;
    args.starargs = undefined;
    args.kwargs = undefined;
    args.defaults = Object.create(null);
    args.is_simple_func = true;
    return args;
  }

  private lowerLambda(node: SyntaxNode): any {
    const parameters = node.childForFieldName("parameters");
    const body = this.field(node, "body");
    const args = parameters ? this.lowerParameters(parameters) : this.emptyParameters();
    return this.make("AST_Function", node, {
      name: null,
      argnames: args,
      decorators: [],
      annotations: this.annotationsMode,
      is_generator: false,
      is_coroutine: false,
      is_lambda: true,
      is_expression: true,
      is_anonymous: true,
      sequential_definition: true,
      return_annotation: null,
      return_annotation_text: null,
      declared_globals: [],
      declared_nonlocals: [],
      scope_bindings: this.argumentNames(args),
      localvars: [],
      annotated_locals: [],
      docstrings: [],
      body: this.lowerExpression(body),
    });
  }

  private argumentNames(args: any): string[] {
    return [
      ...args,
      ...(args.kwonly ?? []),
      ...(args.starargs ? [args.starargs] : []),
      ...(args.kwargs ? [args.kwargs] : []),
    ].map((argument) => argument.name);
  }

  private lowerFunction(
    node: SyntaxNode,
    decorators: any[],
    isMethod: boolean,
  ): any {
    const nameNode = this.field(node, "name");
    const parameters = this.field(node, "parameters");
    const args = this.lowerParameters(parameters);
    const returnType = node.childForFieldName("return_type");
    const bodyNode = this.field(node, "body");
    const loweredBody = significantChildren(bodyNode).flatMap((child) =>
      this.lowerStatement(child)
    );
    const extracted = this.extractDocstrings(loweredBody);
    const isCoroutine = node.children.some((part) => part.text === "async");
    const Constructor = isMethod ? "AST_Method" : "AST_Function";
    const properties: Record<string, any> = {
      name: this.make("AST_SymbolDefun", nameNode, { name: nameNode.text }),
      argnames: args,
      decorators,
      annotations: this.annotationsMode,
      is_generator: this.containsNodeType(node, "yield"),
      is_coroutine: isCoroutine,
      is_lambda: false,
      is_expression: false,
      is_anonymous: false,
      sequential_definition: !isMethod && !!(
        this.currentToplevel?.scoped_flags?.sequential_definitions ??
        this.options.scoped_flags?.sequential_definitions
      ),
      return_annotation: returnType ? this.lowerType(returnType) : null,
      return_annotation_text: returnType ? returnType.text : null,
      declared_globals: this.declaredNames(bodyNode, "global_statement"),
      declared_nonlocals: this.declaredNames(bodyNode, "nonlocal_statement"),
      scope_bindings: this.argumentNames(args),
      localvars: [],
      annotated_locals: [],
      docstrings: extracted.docstrings,
      body: extracted.body,
    };
    if (isMethod) {
      const names = decorators.map((decorator) =>
        decorator.expression?.property ?? decorator.expression?.name
      );
      properties.static = names.includes("staticmethod");
      properties.classmethod = names.includes("classmethod");
      properties.is_getter = names.includes("property");
      properties.is_setter = names.includes("setter");
      properties.is_deleter = names.includes("deleter");
      properties.decorators = decorators.filter((decorator) => {
        const name = decorator.expression?.property ??
          decorator.expression?.name;
        return ![
          "staticmethod", "classmethod", "property", "setter", "deleter",
        ].includes(name);
      });
      properties.sequential_definition = false;
    }
    return this.make(Constructor, node, properties);
  }

  private extractDocstrings(body: any[]): { body: any[]; docstrings: any[] } {
    const kept: any[] = [];
    const docstrings: any[] = [];
    for (const statement of body) {
      if (
        statement instanceof this.compiler.AST_SimpleStatement &&
        statement.body instanceof this.compiler.AST_String
      ) docstrings.push(statement.body);
      else kept.push(statement);
    }
    return { body: kept, docstrings };
  }

  private containsNodeType(node: SyntaxNode, type: string): boolean {
    const visit = (current: SyntaxNode): boolean => {
      if (current !== node && (
        current.type === "function_definition" ||
        current.type === "lambda" ||
        current.type === "class_definition"
      )) return false;
      if (current.type === type) return true;
      return current.namedChildren.some(visit);
    };
    return visit(node);
  }

  private declaredNames(node: SyntaxNode, type: string): string[] {
    const result: string[] = [];
    const visit = (current: SyntaxNode): void => {
      if (current !== node && (
        current.type === "function_definition" ||
        current.type === "lambda" ||
        current.type === "class_definition"
      )) return;
      if (current.type === type) {
        result.push(...significantChildren(current).map((child) => child.text));
        return;
      }
      for (const child of current.namedChildren) visit(child);
    };
    visit(node);
    return result;
  }

  private lowerDecorators(node: SyntaxNode): any[] {
    return significantChildren(node)
      .filter((child) => child.type === "decorator")
      .map((decorator) => {
        const expression = significantChildren(decorator)[0];
        return this.make("AST_Decorator", decorator, {
          expression: this.lowerExpression(expression),
        });
      });
  }

  private lowerDecoratedDefinition(node: SyntaxNode): any[] {
    const decorators = this.lowerDecorators(node);
    const definition = this.field(node, "definition");
    const marker = this.make("AST_SimpleStatement", node, {
      body: this.make("AST_EmptyStatement", node, { stype: "@" }),
    });
    if (definition.type === "function_definition") {
      return [marker, this.lowerFunction(definition, decorators, false)];
    }
    if (definition.type === "class_definition") {
      return [marker, this.lowerClass(definition, decorators)];
    }
    throw new UnsupportedPythonCstNode(definition);
  }

  private lowerClass(node: SyntaxNode, decorators: any[]): any {
    const nameNode = this.field(node, "name");
    const superclasses = node.childForFieldName("superclasses");
    const bases = superclasses
      ? significantChildren(superclasses).map((child) => this.lowerExpression(child))
      : [];
    const statements: any[] = [];
    for (const child of significantChildren(this.field(node, "body"))) {
      if (child.type === "function_definition") {
        statements.push(this.lowerFunction(child, [], true));
      } else if (child.type === "decorated_definition") {
        const definition = this.field(child, "definition");
        if (definition.type !== "function_definition") {
          statements.push(...this.lowerDecoratedDefinition(child));
        } else {
          statements.push(this.lowerFunction(
            definition,
            this.lowerDecorators(child),
            true,
          ));
        }
      } else {
        statements.push(...this.lowerStatement(child));
      }
    }
    const extracted = this.extractDocstrings(statements);
    const classStatements = extracted.body;
    const decoratorName = (decorator: any): string | null => {
      const expression = decorator.expression;
      const target = expression?.expression ?? expression;
      return target?.name ?? target?.property ?? null;
    };
    const decoratorNames = new Set(decorators.map(decoratorName));
    const compileTimeDecorators = new Set([
      "external",
      "ρσ_bigint_fields",
      "ρσ_callable_instance_class",
      "ρσ_lightweight_math_class",
      "ρσ_sequence_class",
    ]);
    const classvars: Record<string, boolean> = Object.create(null);
    const staticMethods: Record<string, boolean> = Object.create(null);
    const classMethods: Record<string, boolean> = Object.create(null);
    const dynamicProperties: Record<string, any> = Object.create(null);
    let initializer: any = undefined;
    for (const statement of classStatements) {
      const body = statement?.body;
      if (body instanceof this.compiler.AST_Assign && body.left?.name) {
        classvars[body.left.name] = true;
      }
      if (statement instanceof this.compiler.AST_Method) {
        const methodName = statement.name.name;
        if (methodName === "__new__") statement.static = true;
        if (statement.static) staticMethods[methodName] = true;
        if (statement.classmethod) classMethods[methodName] = true;
        if (methodName === "__init__") initializer = statement;
        if (statement.is_getter || statement.is_setter || statement.is_deleter) {
          const descriptor = dynamicProperties[methodName] ??=
            Object.create(null);
          if (statement.is_getter) descriptor.getter = statement;
          if (statement.is_setter) descriptor.setter = statement;
          if (statement.is_deleter) descriptor.deleter = statement;
        }
      }
    }
    this.rewriteClassVariables(nameNode.text, classStatements, classvars);
    const bound = classStatements
      .filter((statement) => statement instanceof this.compiler.AST_Method)
      .filter((method) =>
        method.name.name !== "__init__" && !method.static && !method.classmethod
      )
      .map((method) => method.name.name);
    const sequential = this.currentToplevel?.scoped_flags
      ?.sequential_definitions ??
      this.options.scoped_flags?.sequential_definitions ?? false;
    const implicitObjectBase = bases.length === 0 && sequential;
    const parent = bases[0] ?? (implicitObjectBase
      ? this.make("AST_SymbolRef", node, { name: "object" })
      : null);
    const effectiveBases = bases.length ? bases : (parent ? [parent] : []);
    const bigintFields: Record<string, boolean> = Object.create(null);
    for (const decorator of decorators) {
      if (decorator.expression?.expression?.name !== "ρσ_bigint_fields") continue;
      for (const argument of decorator.expression.args ?? []) {
        if (argument instanceof this.compiler.AST_String) {
          bigintFields[argument.value] = true;
        }
      }
    }
    const definition = this.make("AST_Class", node, {
      name: this.make("AST_SymbolDefun", nameNode, { name: nameNode.text }),
      parent,
      bases: effectiveBases,
      implicit_object_base: implicitObjectBase,
      static: staticMethods,
      classmethods: classMethods,
      external: decoratorNames.has("external"),
      python_class: !decoratorNames.has("external"),
      lightweight: decoratorNames.has("ρσ_lightweight_math_class"),
      sequence_class: decoratorNames.has("ρσ_sequence_class"),
      callable_instance_class: decoratorNames.has("ρσ_callable_instance_class"),
      bigint_fields: bigintFields,
      bound,
      decorators: decorators.filter(
        (decorator) => !compileTimeDecorators.has(decoratorName(decorator) ?? ""),
      ),
      module_id: this.options.module_id ?? "__main__",
      sequential_definition: sequential,
      statements: classStatements.filter(
        (statement) => !(statement instanceof this.compiler.AST_Class),
      ),
      dynamic_properties: dynamicProperties,
      classvars,
      nonlocal_names: [],
      localvars: [],
      annotated_locals: [],
      docstrings: extracted.docstrings,
      body: classStatements,
      init: initializer,
    });
    // Class constructor calls later in the same suite must lower as `new`.
    this.knownClasses.set(nameNode.text, definition);
    return definition;
  }

  private rewriteClassVariables(
    className: string,
    statements: any[],
    classvars: Record<string, boolean>,
  ): void {
    const known = new Set<string>();
    const definition = (name: string) => new this.compiler.AST_SymbolDefun({
      name: `${className}.prototype.${name}`,
    });
    const visit = (value: any, seen = new Set<any>()): void => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child, seen);
        return;
      }
      if (value instanceof this.compiler.AST_Scope) return;
      if (value instanceof this.compiler.AST_Assign &&
          value.left instanceof this.compiler.AST_SymbolRef) {
        const name = value.left.name;
        known.add(name);
        classvars[name] = true;
        value.left.thedef = definition(name);
      } else if (value instanceof this.compiler.AST_SymbolRef &&
                 known.has(value.name)) {
        value.thedef = definition(value.name);
      }
      for (const [key, child] of Object.entries(value)) {
        if (["start", "end", "scope", "thedef"].includes(key) ||
            typeof child === "function") continue;
        visit(child, seen);
      }
    };
    for (const statement of statements) {
      if (statement instanceof this.compiler.AST_Method) {
        known.add(statement.name.name);
        continue;
      }
      if (statement instanceof this.compiler.AST_Class) continue;
      visit(statement);
    }
  }

  private lowerImport(node: SyntaxNode): any {
    if (node.type === "future_import_statement") {
      return this.make("AST_EmptyStatement", node, {
        stype: "future_annotations",
      });
    }
    const moduleNode = node.childForFieldName("module_name");
    const moduleText = moduleNode?.text ?? "";
    const level = moduleText.match(/^\.+/)?.[0].length ?? 0;
    const key = moduleText.slice(level);
    if (node.type === "import_from_statement" && key === "__python__") {
      return this.make("AST_EmptyStatement", node, { stype: "scoped_flags" });
    }
    if (node.type === "import_from_statement" && key === "typing") {
      return this.make("AST_EmptyStatement", node);
    }
    const imports: any[] = [];
    if (node.type === "import_statement") {
      for (const entry of node.childrenForFieldName("name")) {
        const nameNode = entry.type === "aliased_import"
          ? this.field(entry, "name")
          : entry;
        const aliasNode = entry.type === "aliased_import"
          ? entry.childForFieldName("alias")
          : null;
        imports.push(this.makeImport(
          node,
          nameNode,
          nameNode.text,
          aliasNode,
          null,
          0,
          false,
        ));
      }
    } else {
      if (!moduleNode) throw new UnsupportedPythonCstNode(node, "missing module");
      const wildcard = significantChildren(node).some(
        (child) => child.type === "wildcard_import",
      );
      const argnames = wildcard
        ? null
        : node.childrenForFieldName("name").map((entry) => {
          const nameNode = entry.type === "aliased_import"
            ? this.field(entry, "name")
            : entry;
          const aliasNode = entry.type === "aliased_import"
            ? entry.childForFieldName("alias")
            : null;
          const imported = this.make("AST_ImportedVar", nameNode, {
            name: nameNode.text,
            alias: aliasNode
              ? this.make("AST_SymbolAlias", aliasNode, { name: aliasNode.text })
              : undefined,
          });
          return imported;
        });
      imports.push(this.makeImport(
        node,
        moduleNode,
        key,
        null,
        argnames,
        level,
        wildcard,
      ));
    }
    for (const imported of imports) this.registerImportedClasses(imported);
    for (const imported of imports) {
      if (!imported.intrinsic || !imported.alias?.name) continue;
      const table = imported.key === "sagejs.runtime"
        ? this.compiler.SAGEJS_RUNTIME_INTRINSICS
        : this.compiler.SAGEJS_PUBLIC_INTRINSICS;
      if (table) this.intrinsicModules.set(imported.alias.name, table);
    }
    return this.make("AST_Imports", node, { imports });
  }

  private registerImportedClasses(imported: any): void {
    if (imported.intrinsic) return;
    const module = this.currentToplevel?.imports?.[imported.key];
    const classes = module?.classes ?? {};
    if (imported.argnames) {
      for (const argument of imported.argnames) {
        const details = classes[argument.name];
        if (details) {
          this.knownClasses.set(argument.alias?.name ?? argument.name, details);
        }
      }
      return;
    }
    const prefix = imported.alias?.name ?? imported.key;
    for (const [name, details] of Object.entries(classes)) {
      this.knownClasses.set(`${prefix}.${name}`, details);
    }
  }

  private dottedName(node: SyntaxNode): any {
    const names = node.text.replace(/^\.+/, "").split(".").filter(Boolean);
    let expression: any = this.make("AST_SymbolRef", node, {
      name: names.shift() ?? "",
    });
    for (const property of names) {
      expression = this.make("AST_Dot", node, { expression, property });
    }
    return expression;
  }

  private makeImport(
    statement: SyntaxNode,
    moduleNode: SyntaxNode,
    key: string,
    aliasNode: SyntaxNode | null,
    argnames: any[] | null,
    level: number,
    star: boolean,
  ): any {
    const modules = this.currentToplevel?.imports ?? Object.create(null);
    const imported = modules[key];
    const intrinsic = key === "sagejs" || key === "sagejs.runtime";
    return this.make("AST_Import", moduleNode, {
      module: this.dottedName(moduleNode),
      key,
      alias: aliasNode
        ? this.make("AST_SymbolAlias", aliasNode, { name: aliasNode.text })
        : null,
      argnames,
      body: () => modules[key],
      intrinsic,
      dynamic: !!imported?.dynamic,
      level,
      star,
      target_module: this.options.module_id ?? this.currentToplevel?.module_id,
    });
  }

  private lowerSageGeneratorAssignment(node: SyntaxNode): any {
    const parent = this.field(node, "parent");
    const generators = node.childrenForFieldName("generator");
    const additional = node.childrenForFieldName("additional_target");
    const names = generators.map((generator) => generator.text);
    const oldNames = this.options.sageGeneratorNames;
    this.options.sageGeneratorNames = names;
    let value: any;
    try {
      value = this.lowerExpression(this.field(node, "value"));
    } finally {
      this.options.sageGeneratorNames = oldNames;
    }
    if (
      value instanceof this.compiler.AST_Call &&
      !value.sage_empty_bracket_constructor
    ) {
      value.args.kwargs ??= [];
      value.args.kwargs.push([
        this.make("AST_SymbolRef", node, { name: "names" }),
        this.make("AST_Array", node, {
          elements: names.map((name) =>
            this.make("AST_String", node, { value: name })
          ),
          is_tuple: false,
        }),
      ]);
    }
    const targets = [parent, ...additional].map((target) =>
      this.make("AST_SymbolRef", target, { name: target.text })
    );
    const parentTarget = targets.length === 1
      ? targets[0]
      : this.make("AST_Array", node, { elements: targets, is_tuple: false });
    const generatorTargets = generators.map((generator) =>
      this.make("AST_SymbolRef", generator, { name: generator.text })
    );
    const assignParent = this.make("AST_Assign", node, {
      left: parentTarget,
      operator: "=",
      right: value,
    });
    const firstNgens = this.make("AST_Call", node, {
      expression: this.make("AST_Dot", node, {
        expression: this.make("AST_SymbolRef", parent, { name: parent.text }),
        property: "_first_ngens",
      }),
      args: [this.make("AST_Number", node, { value: generators.length })],
    });
    const assignGenerators = this.make("AST_Assign", node, {
      left: this.make("AST_Array", node, {
        elements: generatorTargets,
        is_tuple: false,
      }),
      operator: "=",
      right: firstNgens,
    });
    return this.make("AST_BlockStatement", node, {
      body: [
        this.make("AST_SimpleStatement", node, { body: assignParent }),
        this.make("AST_SimpleStatement", node, { body: assignGenerators }),
        this.make("AST_SimpleStatement", node, {
          body: this.make("AST_Undefined", node),
        }),
      ],
    });
  }

  private lowerSageSymbolicFunction(node: SyntaxNode): any {
    const functionNode = this.field(node, "function");
    const parameters = node.childrenForFieldName("parameter");
    const symbolicVariables = parameters.map((parameter) =>
      this.make("AST_Call", parameter, {
        expression: this.make("AST_SymbolRef", parameter, { name: "var" }),
        args: [this.make("AST_String", parameter, { value: parameter.text })],
      })
    );
    return this.make("AST_Assign", node, {
      left: this.make("AST_SymbolRef", functionNode, { name: functionNode.text }),
      operator: "=",
      right: this.make("AST_Call", node, {
        expression: this.make("AST_SymbolRef", node, {
          name: "symbolic_function",
        }),
        args: [
          this.make("AST_Array", node, {
            elements: symbolicVariables,
            is_tuple: false,
          }),
          this.lowerExpression(this.field(node, "value")),
        ],
      }),
    });
  }

  private lowerComprehension(node: SyntaxNode, constructor: string): any {
    const body = this.field(node, "body");
    const clauses: any[] = [];
    for (const child of significantChildren(node).slice(1)) {
      if (child.type === "for_in_clause") {
        clauses.push({
          init: this.lowerBindingTarget(
            this.lowerExpression(this.field(child, "left")),
            this.field(child, "left"),
          ),
          name: null,
          object: this.lowerExpression(this.field(child, "right")),
          conditions: [],
          is_async: child.children.some((part) => part.text === "async"),
        });
      } else if (child.type === "if_clause") {
        const expression = significantChildren(child)[0];
        if (!clauses.length) throw new UnsupportedPythonCstNode(child);
        clauses.at(-1).conditions.push(this.lowerExpression(expression));
      }
    }
    if (!clauses.length) throw new UnsupportedPythonCstNode(node, "no for clause");
    const first = clauses[0];
    const properties: Record<string, any> = {
      clauses,
      init: first.init,
      name: first.name,
      object: first.object,
      condition: first.conditions[0] ?? null,
    };
    if (constructor === "AST_DictComprehension") {
      const literalFlags = this.dictionaryLiteralFlags();
      if (body.type !== "pair") throw new UnsupportedPythonCstNode(body);
      properties.statement = this.lowerExpression(this.field(body, "key"));
      properties.value_statement = this.lowerExpression(this.field(body, "value"));
      properties.is_pydict = literalFlags.is_pydict;
      properties.is_jshash = literalFlags.is_jshash;
    } else {
      properties.statement = this.lowerExpression(body);
    }
    return this.make(constructor, node, properties);
  }

  private lowerTuple(node: SyntaxNode): any {
    return this.sequenceFromExpressions(significantChildren(node), node, true);
  }

  private lowerEllipsesRange(
    nodes: SyntaxNode[],
    owner: SyntaxNode,
    isIterator: boolean,
  ): any {
    const elements: any[] = [];
    for (const child of nodes) {
      if (
        child.type === "binary_operator" &&
        this.optionalField(child, "operator")?.text === ".."
      ) {
        elements.push(this.lowerExpression(this.field(child, "left")));
        elements.push(this.make("AST_SymbolRef", child, { name: "Ellipsis" }));
        elements.push(this.lowerExpression(this.field(child, "right")));
      } else {
        elements.push(this.lowerExpression(child));
      }
    }
    return this.make("AST_EllipsesRange", owner, {
      elements,
      is_iterator: isIterator,
    });
  }

  private sequenceFromExpressions(
    nodes: SyntaxNode[],
    owner: SyntaxNode,
    parenthesized: boolean,
  ): any {
    const elements = nodes.map((child) => this.lowerExpression(child));
    if (elements.length <= 1) {
      return this.make("AST_Array", owner, {
        elements,
        is_tuple: true,
      });
    }
    const build = (index: number): any => {
      if (index === elements.length - 1) return elements[index];
      return this.make("AST_Seq", owner, {
        car: elements[index],
        cdr: build(index + 1),
        parenthesized: index === 0 && parenthesized,
      });
    };
    return build(0);
  }

  private lowerCall(node: SyntaxNode): any {
    const args: any[] = [];
    (args as any).kwargs = [];
    (args as any).kwarg_items = [];
    (args as any).starargs = false;
    const argumentsNode = this.field(node, "arguments");
    const argumentNodes = argumentsNode.type === "argument_list"
      ? significantChildren(argumentsNode)
      : [argumentsNode];
    for (const argument of argumentNodes) {
      if (argument.type === "keyword_argument") {
        (args as any).kwargs.push([
          this.make("AST_SymbolRef", this.field(argument, "name"), {
            name: this.field(argument, "name").text,
          }),
          this.lowerExpression(this.field(argument, "value")),
        ]);
      } else if (argument.type === "dictionary_splat") {
        (args as any).kwarg_items.push(
          this.lowerExpression(significantChildren(argument)[0]),
        );
        (args as any).starargs = true;
      } else {
        const isSplat =
          argument.type === "list_splat" ||
          argument.type === "list_splat_pattern";
        const lowered = isSplat
          ? this.lowerExpression(significantChildren(argument)[0])
          : this.lowerExpression(argument);
        if (
          isSplat
        ) {
          lowered.is_array = true;
          (args as any).starargs = true;
        }
        args.push(lowered);
      }
    }
    const functionNode = this.field(node, "function");
    const callable = this.lowerExpression(functionNode);
    const callableName = callable instanceof this.compiler.AST_SymbolRef
      ? callable.name
      : null;
    if (
      functionNode.type === "identifier" &&
      functionNode.text === "isinstance"
    ) {
      if (args.length !== 2 || (args as any).kwargs.length ||
          (args as any).kwarg_items.length) {
        throw new SyntaxError(
          "isinstance() must be called with exactly two arguments",
        );
      }
      return this.make("AST_Binary", node, {
        left: args[0],
        operator: "instanceof",
        right: args[1],
      });
    }
    const functionKey = this.expressionKey(functionNode);
    if (functionKey && this.knownClasses.has(functionKey)) {
      const details = this.knownClasses.get(functionKey);
      return this.make("AST_New", node, {
        expression: callable,
        args,
        python_class: !!details?.static?.__new__,
      });
    }
    if (functionNode.type === "attribute") {
      const ownerNode = this.field(functionNode, "object");
      const ownerKey = this.expressionKey(ownerNode);
      const method = this.field(functionNode, "attribute").text;
      if (ownerKey && this.knownClasses.has(ownerKey)) {
        const details = this.knownClasses.get(ownerKey);
        return this.make("AST_ClassCall", node, {
          class: this.lowerExpression(ownerNode),
          method,
          static: method === "__new__" ||
            ["call", "apply", "bind", "toString"].includes(method) ||
            !!details?.static?.[method] || !!details?.classmethods?.[method],
          args,
        });
      }
    }
    if (callableName === "jstype" && args.length === 1) {
      return this.make("AST_UnaryPrefix", node, {
        operator: "typeof",
        expression: args[0],
      });
    }
    if (callableName === "ρσ_strict_equal" && args.length === 2) {
      return this.make("AST_Binary", node, {
        left: args[0],
        operator: "===",
        right: args[1],
        native_operator: true,
      });
    }
    const nativeBinary = ({
      ρσ_native_add: "+", ρσ_native_bitand: "&", ρσ_native_bitor: "|",
      ρσ_native_bitxor: "^", ρσ_native_div: "/", ρσ_native_mod: "%",
      ρσ_native_mul: "*", ρσ_native_pow: "**", ρσ_native_sub: "-",
      ρσ_native_lshift: "<<", ρσ_native_rshift: ">>", ρσ_native_lt: "<",
      ρσ_native_le: "<=", ρσ_native_gt: ">", ρσ_native_ge: ">=",
    } as Record<string, string>)[callableName ?? ""];
    if (nativeBinary && args.length === 2) {
      return this.make("AST_Binary", node, {
        left: args[0], operator: nativeBinary, right: args[1],
        native_operator: true,
      });
    }
    if (callableName === "ρσ_native_neg" && args.length === 1) {
      return this.make("AST_UnaryPrefix", node, {
        operator: "-", expression: args[0], native_operator: true,
      });
    }
    if (callableName === "ρσ_native_instanceof" && args.length === 2) {
      return this.make("AST_Binary", node, {
        left: args[0], operator: "instanceof", right: args[1],
        native_operator: true,
      });
    }
    return this.make("AST_Call", node, {
      expression: callable,
      direct_call: callable.intrinsic_call === true,
      args,
    });
  }

  private lowerSubscript(node: SyntaxNode): any {
    const value = this.lowerExpression(this.field(node, "value"));
    const parts = significantChildren(node).slice(1);
    if (!parts.length) throw new UnsupportedPythonCstNode(node, "empty index");
    const lowerPart = (part: SyntaxNode): any => {
      if (part.type !== "slice") return this.lowerExpression(part);
      const colons = part.children.filter((child) => child.text === ":");
      const values = significantChildren(part);
      const slots: any[] = [];
      const boundaries = [part.startIndex, ...colons.map((colon) => colon.startIndex), part.endIndex];
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        const child = values.find((value) =>
          value.startIndex >= boundaries[index] &&
          value.endIndex <= boundaries[index + 1]
        );
        slots.push(child
          ? this.lowerExpression(child)
          : this.make("AST_Null", part));
      }
      while (slots.length < 3) slots.push(this.make("AST_Null", part));
      return this.make("AST_New", part, {
        expression: this.make("AST_SymbolRef", part, { name: "slice" }),
        args: slots,
      });
    };
    const loweredParts = parts.map(lowerPart);
    let property = loweredParts[0];
    if (loweredParts.length > 1) {
      property = this.make("AST_Array", node, {
        elements: loweredParts,
        is_tuple: true,
      });
    }
    return this.make("AST_ItemAccess", node, {
      expression: value,
      property,
      assignment: null,
    });
  }

  private lowerDictionary(node: SyntaxNode): any {
    const literalFlags = this.dictionaryLiteralFlags();
    const properties = [];
    for (const child of significantChildren(node)) {
      if (child.type !== "pair") {
        throw new UnsupportedPythonCstNode(child, "dictionary splat");
      }
      properties.push(this.make("AST_ObjectKeyVal", child, {
        key: this.lowerExpression(this.field(child, "key")),
        value: this.lowerExpression(this.field(child, "value")),
        quoted: true,
      }));
    }
    return this.make("AST_Object", node, {
      properties,
      is_pydict: literalFlags.is_pydict,
      is_jshash: literalFlags.is_jshash,
    });
  }

  private dictionaryLiteralFlags(): {
    is_pydict: boolean;
    is_jshash: boolean;
  } {
    const flags = this.currentToplevel?.scoped_flags ??
      this.options.scoped_flags ?? Object.create(null);
    return {
      is_pydict: !!flags.dict_literals,
      is_jshash: !!flags.hash_literals,
    };
  }
}
