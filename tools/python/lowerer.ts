import type { Node as SyntaxNode } from "web-tree-sitter";

import {
  NATIVE_CLASSES,
  SAGEJS_PUBLIC_INTRINSICS,
  SAGEJS_RUNTIME_INTRINSICS,
} from "./contract";
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

function decodePythonEscapes(source: string): string {
  let value = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character !== "\\") {
      value += character;
      continue;
    }
    const escaped = source[++index];
    if (escaped === undefined) {
      value += "\\";
      break;
    }
    if (escaped === "\n") continue;
    const controls: Record<string, string> = {
      "\\": "\\", "'": "'", '"': '"',
      a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v",
    };
    if (Object.hasOwn(controls, escaped)) {
      value += controls[escaped];
      continue;
    }
    if (/[0-7]/.test(escaped)) {
      let digits = escaped;
      while (digits.length < 3 && /[0-7]/.test(source[index + 1] ?? "")) {
        digits += source[++index];
      }
      value += String.fromCharCode(Number.parseInt(digits, 8));
      continue;
    }
    const widths: Record<string, number> = { x: 2, u: 4, U: 8 };
    const width = widths[escaped];
    if (width !== undefined) {
      const digits = source.slice(index + 1, index + 1 + width);
      if (digits.length !== width || !/^[0-9a-f]+$/i.test(digits)) {
        throw new SyntaxError(`truncated \\${escaped}${"X".repeat(width)} escape sequence`);
      }
      const codepoint = Number.parseInt(digits, 16);
      if (codepoint > 0x10ffff) {
        throw new SyntaxError(`illegal Unicode character U+${digits.toUpperCase()}`);
      }
      value += String.fromCodePoint(codepoint);
      index += width;
      continue;
    }
    // Python deliberately preserves unrecognized escapes, including \N when
    // no Unicode-name database is available in the portable frontend.
    value += `\\${escaped}`;
  }
  return value;
}

function decodePythonStringLiteral(source: string): {
  kind: "string" | "bytes" | "js";
  value: string;
} {
  const opening = source.match(/^([A-Za-z]*)("""|'''|"|')/);
  if (!opening) throw new SyntaxError("invalid string literal");
  const prefix = opening[1].toLowerCase();
  const quote = opening[2];
  const closing = source.slice(-quote.length);
  if (closing !== quote) throw new SyntaxError("unterminated string literal");
  const rawBody = source.slice(opening[0].length, -quote.length);
  const raw = prefix.includes("r");
  const value = raw ? rawBody : decodePythonEscapes(rawBody);
  if (raw && value.startsWith("%js") && /\s/.test(value[3] ?? "")) {
    return { kind: "js", value: value.slice(4).trim() };
  }
  return { kind: prefix.includes("b") ? "bytes" : "string", value };
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
  private moduleBindings = new Set<string>();
  private readonly classBindings: Array<{
    names: Set<string>;
    globals: Set<string>;
    functionDepth: number;
  }> = [];
  private nativeBitwise = false;
  private readonly classStack: string[] = [];
  private catchDepth = 0;
  private matchCounter = 0;
  private readonly functionFrames: Array<{
    isCoroutine: boolean;
    superClass: string | null;
    superReceiver: string | null;
    receiverAlias: string | null;
    bindings: Set<string>;
    globals: Set<string>;
    nonlocals: Set<string>;
  }> = [];

  constructor(
    private readonly compiler: any,
    private readonly syntax: PythonSyntaxTree,
    private readonly options: Record<string, any>,
  ) {}

  /** Apply Python's lexical private-name transformation inside a class. */
  private manglePrivateName(name: string): string {
    return this.manglePrivateNameForClass(name, this.classStack.at(-1));
  }

  private manglePrivateNameForClass(
    name: string,
    enclosingClass: string | undefined,
  ): string {
    const className = enclosingClass?.replace(/^_+/, "") ?? "";
    if (
      !className ||
      !name.startsWith("__") ||
      name.endsWith("__") ||
      name.includes(".")
    ) return name;
    return `_${className}${name}`;
  }

  /** Collect module cells introduced by nested `global` declarations. */
  private nestedModuleGlobalBindings(root: SyntaxNode): Set<string> {
    const names = new Set<string>();
    const visit = (
      node: SyntaxNode,
      enclosingClass: string | undefined,
    ): void => {
      let activeClass = enclosingClass;
      if (node.type === "class_definition") {
        activeClass = node.childForFieldName("name")?.text ?? activeClass;
      }
      if (node.type === "global_statement") {
        for (const name of significantChildren(node)) {
          if (name.type === "identifier") {
            names.add(this.manglePrivateNameForClass(name.text, activeClass));
          }
        }
      }
      for (const child of node.namedChildren) visit(child, activeClass);
    };
    visit(root, undefined);
    return names;
  }

  lowerModule(finalizedToplevel: any): CstLoweringResult {
    const root = this.syntax.tree.rootNode;
    if (root.type !== "module") throw new UnsupportedPythonCstNode(root);
    this.lowered.add(root.type);
    this.currentToplevel = finalizedToplevel;
    this.nativeBitwise = root.descendantsOfType("comment").some((node) =>
      /^#\s*sagejs:\s*native-bitwise\s*$/.test(node.text.trim())
    );
    for (const [name, details] of Object.entries(NATIVE_CLASSES)) {
      this.knownClasses.set(name, details);
    }
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
    for (const [name, table] of Object.entries(
      this.options.intrinsic_modules ?? {},
    )) {
      if (table && typeof table === "object") {
        this.intrinsicModules.set(name, table as Record<string, string>);
      }
    }
    this.moduleBindings = this.functionBindingNames(
      root,
      this.emptyParameters(),
      new Set(),
      new Set(),
    );
    // A `global` declaration nested in a function can create or mutate a
    // module binding even when no assignment to that name appears at module
    // level.  Include those source names in the module's lexical hygiene map.
    for (const name of this.nestedModuleGlobalBindings(root)) {
      this.moduleBindings.add(name);
    }
    this.annotationsMode = root.namedChildren.some(
      (node) => node.type === "future_import_statement" &&
        /\bannotations\b/.test(node.text),
    ) ? "future" : (this.options.scoped_flags?.annotations ?? false);
    const body = significantChildren(root).flatMap((node) =>
      this.lowerStatement(node)
    );
    const ast = new this.compiler.AST_Toplevel(finalizedToplevel);
    ast.python_lexical_hygiene = !this.options.compiler_bootstrap;
    ast.python_scope_bindings = [...this.moduleBindings];
    const extracted = this.extractDocstrings(body);
    ast.body = extracted.body;
    ast.docstrings = extracted.docstrings;
    ast.start = this.token(root, false);
    ast.end = this.token(root, true);
    new PythonAstSemanticAnalyzer(
      this.compiler,
      !!(
        finalizedToplevel?.scoped_flags?.sequential_definitions ??
        this.options.scoped_flags?.sequential_definitions
      ),
    ).analyze(ast);
    ast.intrinsic_modules = Object.fromEntries(this.intrinsicModules);
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

  private pythonSymbol(
    constructor: string,
    node: SyntaxNode,
    properties: Record<string, any>,
  ): any {
    const symbol = this.make(constructor, node, properties);
    symbol.python_identifier = !this.options.compiler_bootstrap;
    if (constructor === "AST_SymbolRef") {
      symbol.python_resolution_provenance =
        this.sourceNameResolutionProvenance(properties.name);
      symbol.python_lexical_binding = !this.options.compiler_bootstrap &&
        this.sourceNameIsLexicallyBound(properties.name);
    } else {
      // Cached module variants are rendered through a secondary OutputStream
      // without the original AST scope on its stack.  Preserve declaration
      // authority on the symbol itself so declarations and later references
      // always choose the same collision-proof JavaScript spelling.
      symbol.python_lexical_binding = !this.options.compiler_bootstrap;
    }
    return symbol;
  }

  /** Record which Python namespace authoritatively resolves a source read. */
  private sourceNameResolutionProvenance(name: string): string {
    const classFrame = this.classBindings.at(-1);
    if (
      classFrame &&
      this.functionFrames.length === classFrame.functionDepth
    ) {
      if (classFrame.globals.has(name)) return "module";
      if (classFrame.names.has(name)) return "class";
      // A class body uses LOAD_NAME semantics: an as-yet-unbound class name
      // may still resolve through an enclosing function before falling back
      // to the defining module and its builtins.
      for (let index = this.functionFrames.length - 1; index >= 0; index -= 1) {
        const frame = this.functionFrames[index];
        if (frame.globals.has(name)) return "module";
        if (frame.bindings.has(name) || frame.nonlocals.has(name)) {
          return "closure";
        }
      }
      return "class-fallback";
    }
    for (let index = this.functionFrames.length - 1; index >= 0; index -= 1) {
      const frame = this.functionFrames[index];
      if (frame.globals.has(name)) return "module";
      if (frame.bindings.has(name)) {
        return index === this.functionFrames.length - 1 ? "local" : "closure";
      }
      if (frame.nonlocals.has(name)) return "closure";
    }
    return "module";
  }

  /** Resolve one import target independently of the other names it binds. */
  private importBindingDestination(sourceName: string): Record<string, any> {
    const name = this.manglePrivateName(sourceName);
    const classFrame = this.classBindings.at(-1);
    if (
      classFrame &&
      this.functionFrames.length === classFrame.functionDepth
    ) {
      if (classFrame.globals.has(name)) {
        return {
          kind: "module",
          name,
          module: this.options.module_id ?? this.currentToplevel?.module_id,
          declare: false,
        };
      }
      return { kind: "class", name, owner: this.classStack.at(-1) };
    }
    const functionFrame = this.functionFrames.at(-1);
    if (functionFrame) {
      if (functionFrame.globals.has(name)) {
        return {
          kind: "module",
          name,
          module: this.options.module_id ?? this.currentToplevel?.module_id,
          declare: false,
        };
      }
      if (functionFrame.nonlocals.has(name)) {
        return { kind: "nonlocal", name };
      }
      return { kind: "local", name, declare: true };
    }
    return {
      kind: "module",
      name,
      module: this.options.module_id ?? this.currentToplevel?.module_id,
      declare: true,
    };
  }

  /** Whether a source reference is backed by a Python lexical cell here. */
  private sourceNameIsLexicallyBound(name: string): boolean {
    for (let index = this.functionFrames.length - 1; index >= 0; index -= 1) {
      const frame = this.functionFrames[index];
      if (frame.globals.has(name)) return this.moduleBindings.has(name);
      if (frame.bindings.has(name) || frame.nonlocals.has(name)) return true;
    }
    const classFrame = this.classBindings.at(-1);
    if (
      classFrame &&
      this.functionFrames.length === classFrame.functionDepth
    ) {
      if (classFrame.globals.has(name)) return this.moduleBindings.has(name);
      if (classFrame.names.has(name)) return false;
    }
    return this.moduleBindings.has(name);
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
        let raised: any;
        if (value) {
          raised = this.lowerExpression(value);
        } else if (this.catchDepth > 0) {
          raised = this.make("AST_SymbolCatch", node, { name: "ρσ_Exception" });
        } else {
          const args: any[] = [this.make("AST_String", node, {
            value: "No active exception to reraise",
          })];
          (args as any).kwargs = [];
          (args as any).kwarg_items = [];
          (args as any).starargs = false;
          raised = this.make("AST_New", node, {
            expression: this.make("AST_SymbolRef", node, {
              name: "RuntimeError",
            }),
            args,
            python_class: false,
          });
        }
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
      case "match_statement":
        return this.lowerMatch(node);
      case "for_statement":
        return [this.lowerFor(
          node,
          node.children.some((part) => part.text === "async"),
        )];
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
        const validDeleteTarget = (target: SyntaxNode): boolean => {
          if (["identifier", "attribute", "subscript"].includes(target.type)) {
            return true;
          }
          if ([
            "parenthesized_expression", "expression_list", "pattern_list",
            "tuple_pattern", "list_pattern", "tuple", "list",
          ].includes(target.type)) {
            const children = significantChildren(target);
            return children.length > 0 && children.every(validDeleteTarget);
          }
          return false;
        };
        if (!targets.every(validDeleteTarget)) {
          throw new SyntaxError("cannot delete expression");
        }
        const deleted = targets.map((target) => {
          const expression = this.lowerExpression(target);
          this.invalidateIntrinsicBinding(target);
          return this.make("AST_UnaryPrefix", node, {
            operator: "delete",
            expression,
            parenthesized: false,
          });
        });
        return deleted.map((body) =>
          this.make("AST_SimpleStatement", node, { body })
        );
      }
      case "global_statement":
        return [this.lowerDeclaration(node, true)];
      case "nonlocal_statement":
        return [this.lowerDeclaration(node, false)];
      case "with_statement":
        return [this.lowerWith(
          node,
          node.children.some((part) => part.text === "async"),
        )];
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
      case "sage_time_statement": {
        const timed = this.lowerStatement(this.field(node, "statement"));
        if (timed.length !== 1) {
          throw new UnsupportedPythonCstNode(
            node,
            "%time must contain exactly one statement",
          );
        }
        return [this.make("AST_TimedStatement", node, { body: timed[0] })];
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

  /**
   * Lower structural pattern matching without baking Python's matching rules
   * into the JavaScript emitter.  The runtime helper returns either a mapping
   * of capture names to values or None.  Cases remain ordinary sequential
   * statements, so a failed guard naturally continues to the next case while
   * break/return/raise in a selected body retain their surrounding meaning.
   */
  private lowerMatch(node: SyntaxNode): any[] {
    const id = this.matchCounter++;
    const subjectName = `ρσ_match_subject_${id}`;
    const selectedName = `ρσ_match_selected_${id}`;
    const symbol = (name: string, owner: SyntaxNode = node) =>
      this.make("AST_SymbolRef", owner, { name });
    const assignment = (
      name: string,
      value: any,
      owner: SyntaxNode = node,
      pythonBinding = false,
    ) =>
      this.make("AST_SimpleStatement", owner, {
        body: this.make("AST_Assign", owner, {
          left: pythonBinding
            ? this.pythonSymbol("AST_SymbolRef", owner, { name })
            : symbol(name, owner),
          operator: "=",
          right: value,
        }),
      });

    const subjectNodes = node.childrenForFieldName("subject");
    const subject = subjectNodes.length === 1
      ? this.lowerExpression(subjectNodes[0])
      : this.sequenceFromExpressions(subjectNodes, node, false);
    const statements: any[] = [
      assignment(subjectName, subject),
      assignment(selectedName, this.make("AST_False", node)),
    ];
    const body = this.field(node, "body");
    const clauses = significantChildren(body).filter(
      (child) => child.type === "case_clause",
    );
    for (let index = 0; index < clauses.length; index += 1) {
      const clause = clauses[index];
      const pattern = significantChildren(clause).find(
        (child) => child.type === "case_pattern",
      );
      if (!pattern) throw new UnsupportedPythonCstNode(clause, "missing pattern");
      const resultName = `ρσ_match_result_${id}_${index}`;
      const captures = new Set<string>();
      const descriptor = this.lowerMatchPattern(pattern, captures);
      this.invalidateIntrinsicNames(captures);
      const args: any[] = [symbol(subjectName, clause), descriptor];
      (args as any).kwargs = [];
      (args as any).kwarg_items = [];
      (args as any).starargs = false;
      statements.push(assignment(resultName, this.make("AST_Call", clause, {
        expression: symbol("ρσ_match_pattern", clause),
        direct_call: true,
        args,
      }), clause));

      const structuralBody: any[] = [];
      for (const name of captures) {
        structuralBody.push(assignment(name, this.make("AST_ItemAccess", clause, {
          expression: symbol(resultName, clause),
          property: this.make("AST_String", clause, { value: name }),
          assignment: null,
        }), clause, true));
      }
      const selected = assignment(
        selectedName,
        this.make("AST_True", clause),
        clause,
      );
      const consequence = this.field(clause, "consequence");
      const caseBody = [selected, ...significantChildren(consequence).flatMap(
        (child) => this.lowerStatement(child),
      )];
      const guardClause = significantChildren(clause).find(
        (child) => child.type === "if_clause",
      );
      if (guardClause) {
        const guard = significantChildren(guardClause)[0];
        if (!guard) throw new UnsupportedPythonCstNode(guardClause, "missing guard");
        structuralBody.push(this.make("AST_If", guardClause, {
          condition: this.lowerExpression(guard),
          body: this.make("AST_BlockStatement", consequence, { body: caseBody }),
          alternative: null,
        }));
      } else {
        structuralBody.push(...caseBody);
      }
      const notSelected = this.make("AST_UnaryPrefix", clause, {
        operator: "!", expression: symbol(selectedName, clause),
      });
      const matched = this.make("AST_Binary", clause, {
        left: symbol(resultName, clause), operator: "!==",
        right: this.make("AST_Null", clause), native_operator: true,
      });
      statements.push(this.make("AST_If", clause, {
        condition: this.make("AST_Binary", clause, {
          left: notSelected, operator: "&&", right: matched,
        }),
        body: this.make("AST_BlockStatement", consequence, {
          body: structuralBody,
        }),
        alternative: null,
      }));
    }
    return statements;
  }

  private lowerMatchPattern(node: SyntaxNode, captures: Set<string>): any {
    const array = (owner: SyntaxNode, elements: any[]) =>
      this.make("AST_Array", owner, { elements, is_tuple: false });
    const string = (owner: SyntaxNode, value: string) =>
      this.make("AST_String", owner, { value });
    const descriptor = (owner: SyntaxNode, kind: string, ...values: any[]) =>
      array(owner, [string(owner, kind), ...values]);
    if (node.type === "case_pattern") {
      const child = significantChildren(node)[0];
      if (!child) {
        if (node.text.trim() === "_") return descriptor(node, "wildcard");
        throw new UnsupportedPythonCstNode(node, "empty pattern");
      }
      return this.lowerMatchPattern(child, captures);
    }
    if (node.type === "identifier") {
      if (node.text === "_") return descriptor(node, "wildcard");
      captures.add(node.text);
      return descriptor(node, "capture", string(node, node.text));
    }
    if (node.type === "as_pattern") {
      const children = significantChildren(node);
      const alias = children.at(-1);
      const value = children[0];
      if (!alias || alias.type !== "identifier" || !value) {
        throw new UnsupportedPythonCstNode(node, "invalid as-pattern");
      }
      captures.add(alias.text);
      return descriptor(
        node,
        "as",
        this.lowerMatchPattern(value, captures),
        string(alias, alias.text),
      );
    }
    if (node.type === "union_pattern") {
      const alternatives = significantChildren(node);
      const alternativeCaptures = alternatives.map(() => new Set<string>());
      const patterns = alternatives.map((child, index) =>
        this.lowerMatchPattern(child, alternativeCaptures[index])
      );
      const expected = [...(alternativeCaptures[0] ?? [])].sort().join("\0");
      if (alternativeCaptures.some(
        (names) => [...names].sort().join("\0") !== expected,
      )) throw new SyntaxError("alternative patterns bind different names");
      for (const name of alternativeCaptures[0] ?? []) captures.add(name);
      return descriptor(node, "or", array(node, patterns));
    }
    if (node.type === "tuple_pattern" || node.type === "list_pattern") {
      return descriptor(node, "sequence", array(
        node,
        significantChildren(node).map((child) =>
          this.lowerMatchPattern(child, captures)
        ),
      ));
    }
    if (node.type === "class_pattern") {
      const children = significantChildren(node);
      const className = children[0];
      if (!className || className.type !== "dotted_name") {
        throw new UnsupportedPythonCstNode(node, "missing class name");
      }
      const positional: any[] = [];
      const keywords: any[] = [];
      for (const child of children.slice(1)) {
        let part = child.type === "case_pattern"
          ? significantChildren(child)[0]
          : child;
        if (!part) continue;
        let alias: SyntaxNode | null = null;
        if (part.type === "as_pattern") {
          const asChildren = significantChildren(part);
          alias = asChildren.at(-1) ?? null;
          part = asChildren[0];
          if (part?.type === "case_pattern") {
            part = significantChildren(part)[0];
          }
        }
        if (part.type === "keyword_pattern") {
          const values = significantChildren(part);
          const name = values[0];
          const value = values[1];
          if (!name || name.type !== "identifier" || !value) {
            throw new UnsupportedPythonCstNode(part, "invalid keyword pattern");
          }
          let lowered = this.lowerMatchPattern(value, captures);
          if (alias) {
            if (alias.type !== "identifier") {
              throw new UnsupportedPythonCstNode(alias, "invalid as-pattern alias");
            }
            captures.add(alias.text);
            lowered = descriptor(
              part, "as", lowered, string(alias, alias.text),
            );
          }
          keywords.push(array(part, [string(name, name.text), lowered]));
        } else {
          if (alias) {
            if (alias.type !== "identifier") {
              throw new UnsupportedPythonCstNode(alias, "invalid as-pattern alias");
            }
            captures.add(alias.text);
            part = child;
          }
          positional.push(this.lowerMatchPattern(part, captures));
        }
      }
      return descriptor(
        node,
        "class",
        this.lowerDottedPatternName(className),
        array(node, positional),
        array(node, keywords),
      );
    }
    if (node.type === "dotted_name") {
      const names = significantChildren(node);
      if (names.length === 1) {
        const name = names[0].text;
        if (name === "_") return descriptor(node, "wildcard");
        captures.add(name);
        return descriptor(node, "capture", string(node, name));
      }
      return descriptor(node, "value", this.lowerDottedPatternName(node));
    }
    if ([
      "integer", "float", "string", "concatenated_string",
      "none", "true", "false",
    ].includes(node.type)) {
      return descriptor(node, "value", this.lowerExpression(node));
    }
    throw new UnsupportedPythonCstNode(node, "unsupported match pattern");
  }

  private lowerDottedPatternName(node: SyntaxNode): any {
    const names = significantChildren(node);
    if (!names.length) throw new UnsupportedPythonCstNode(node, "empty name");
    let value = this.pythonSymbol("AST_SymbolRef", names[0], {
      name: names[0].text,
    });
    for (const name of names.slice(1)) {
      value = this.make("AST_Dot", node, {
        expression: value, property: name.text,
      });
    }
    return value;
  }

  private lowerFor(node: SyntaxNode, isAsync: boolean): any {
    if (isAsync && !this.functionFrames.at(-1)?.isCoroutine) {
      throw new SyntaxError("'async for' outside async function");
    }
    const alternative = significantChildren(node).find(
      (child) => child.type === "else_clause",
    );
    const left = this.field(node, "left");
    const init = this.lowerBindingTarget(this.lowerExpression(left), left);
    const object = this.lowerExpression(this.field(node, "right"));
    const body = this.lowerBlock(this.field(node, "body"));
    this.invalidateIntrinsicBinding(left);
    const loop = this.make(isAsync ? "AST_AsyncFor" : "AST_ForIn", node, {
      init,
      name: null,
      object,
      body,
      alternative: alternative
        ? this.lowerBlock(this.field(alternative, "body"))
        : null,
    });
    if (!isAsync && !alternative) {
      loop.machine_residue_recurrence = this.machineResidueRecurrence(
        init,
        object,
        body,
      );
    }
    return loop;
  }

  /**
   * Recognize one deliberately tiny proof domain:
   *
   *     for index in range(count):
   *         value = value * multiplier + increment
   *
   * All six operands must be direct locals, the loop body must contain only
   * that assignment, and the loop target may not alias a recurrence operand.
   * The emitter still installs a dynamic representation guard and retains the
   * original loop as its exact fallback.  Keeping this recognizer structural
   * makes its proof obligations enumerable; it never guesses from names or
   * annotations.
   */
  private machineResidueRecurrence(init: any, object: any, body: any): any {
    if (!(init instanceof this.compiler.AST_SymbolRef)) return null;
    if (!(object instanceof this.compiler.AST_Call) ||
        !(object.expression instanceof this.compiler.AST_SymbolRef) ||
        object.expression.name !== "range" || object.args?.length !== 1 ||
        object.args.starargs || object.args.kwargs?.length ||
        object.args.kwarg_items?.length) return null;
    const count = object.args[0];
    if (!(count instanceof this.compiler.AST_SymbolRef) &&
        !(count instanceof this.compiler.AST_Number)) return null;
    if (!(body instanceof this.compiler.AST_BlockStatement) ||
        body.body?.length !== 1) return null;
    const statement = body.body[0];
    if (!(statement instanceof this.compiler.AST_SimpleStatement)) return null;
    const assignment = statement.body;
    if (!(assignment instanceof this.compiler.AST_Assign) ||
        assignment.operator !== "=" ||
        !(assignment.left instanceof this.compiler.AST_SymbolRef)) return null;
    const addition = assignment.right;
    if (!(addition instanceof this.compiler.AST_Binary) ||
        addition.operator !== "+" ||
        !(addition.right instanceof this.compiler.AST_SymbolRef)) return null;
    const multiplication = addition.left;
    if (!(multiplication instanceof this.compiler.AST_Binary) ||
        multiplication.operator !== "*" ||
        !(multiplication.left instanceof this.compiler.AST_SymbolRef) ||
        !(multiplication.right instanceof this.compiler.AST_SymbolRef)) return null;
    const accumulator = assignment.left;
    if (multiplication.left.name !== accumulator.name) return null;
    const names = [
      accumulator.name,
      multiplication.right.name,
      addition.right.name,
    ];
    if (new Set(names).size !== 3 || names.includes(init.name)) return null;
    return {
      accumulator,
      multiplier: multiplication.right,
      increment: addition.right,
    };
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

  private invalidateIntrinsicBinding(node: SyntaxNode): void {
    if (node.type === "identifier") {
      const name = this.manglePrivateName(node.text);
      const classFrame = this.classBindings.at(-1);
      if (
        classFrame &&
        classFrame.functionDepth === this.functionFrames.length
      ) {
        if (classFrame.globals.has(name)) {
          this.intrinsicModules.delete(name);
        } else {
          classFrame.names.add(name);
        }
      } else if (this.functionFrames.length > 0) {
        return;
      } else {
        this.intrinsicModules.delete(name);
      }
      return;
    }
    if ([
      "parenthesized_expression", "expression_list", "pattern_list",
      "tuple_pattern", "list_pattern", "tuple", "list",
    ].includes(node.type)) {
      for (const child of significantChildren(node)) {
        this.invalidateIntrinsicBinding(child);
      }
    }
  }

  private invalidateIntrinsicNames(names: Iterable<string>): void {
    for (const name of names) {
      const classFrame = this.classBindings.at(-1);
      if (
        classFrame &&
        classFrame.functionDepth === this.functionFrames.length
      ) {
        if (classFrame.globals.has(name)) {
          this.intrinsicModules.delete(name);
        } else {
          classFrame.names.add(name);
        }
      } else if (this.functionFrames.length > 0) {
        return;
      } else {
        this.intrinsicModules.delete(name);
      }
    }
  }

  private lowerDeclaration(node: SyntaxNode, isGlobal: boolean): any {
    if (!isGlobal && this.functionFrames.length === 0) {
      throw new SyntaxError("nonlocal declaration not allowed at module level");
    }
    if (
      isGlobal &&
      this.functionFrames.length === 0 &&
      this.classStack.length === 0
    ) {
      // In Python a module-level `global` declaration is a semantic no-op:
      // the surrounding namespace is already the module.  Retaining an
      // AST_SymbolNonlocal here incorrectly suppresses the module's lexical
      // cell and can make its live namespace descriptor read a host global.
      return this.make("AST_EmptyStatement", node, { stype: "global" });
    }
    if (isGlobal && this.classStack.length > 0) {
      const classFrame = this.classBindings.at(-1);
      if (classFrame?.functionDepth === this.functionFrames.length) {
        for (const name of significantChildren(node)) {
          classFrame.globals.add(this.manglePrivateName(name.text));
        }
      }
    }
    return this.make("AST_Var", node, {
      definitions: significantChildren(node).map((name) =>
        this.make("AST_VarDef", name, {
          name: this.pythonSymbol("AST_SymbolNonlocal", name, {
            name: this.manglePrivateName(name.text),
          }),
          value: null,
          is_global: isGlobal ? true : undefined,
        })
      ),
    });
  }

  private lowerWith(node: SyntaxNode, isAsync: boolean): any {
    if (isAsync && !this.functionFrames.at(-1)?.isCoroutine) {
      throw new SyntaxError("'async with' outside async function");
    }
    const clause = significantChildren(node).find(
      (child) => child.type === "with_clause",
    );
    if (!clause) throw new UnsupportedPythonCstNode(node, "missing with clause");
    const clauses: any[] = [];
    for (const item of significantChildren(clause)) {
      let value = this.field(item, "value");
      let alias: SyntaxNode | null = null;
      if (value.type === "as_pattern") {
        alias = value.childForFieldName("alias")?.namedChild(0) ?? null;
        value = value.childForFieldName("value") ?? significantChildren(value)[0];
      }
      const expression = this.lowerExpression(value);
      if (alias) this.invalidateIntrinsicBinding(alias);
      clauses.push(this.make("AST_WithClause", item, {
        expression,
        alias: alias
          ? this.pythonSymbol("AST_SymbolAlias", alias, { name: alias.text })
          : null,
      }));
    }
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
      if (alias) this.invalidateIntrinsicBinding(alias);
      const body = significantChildren(clause).find(
        (child) => child.type === "block",
      );
      if (!body) throw new UnsupportedPythonCstNode(clause, "missing body");
      this.catchDepth += 1;
      let loweredBody: any[];
      try {
        loweredBody = significantChildren(body).flatMap((child) =>
          this.lowerStatement(child)
        );
      } finally {
        this.catchDepth -= 1;
      }
      return this.make("AST_Except", clause, {
        argname: alias
          ? this.pythonSymbol("AST_SymbolCatch", alias, { name: alias.text })
          : null,
        errors,
        body: loweredBody,
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
        if (node.text === "__debug__") return this.make("AST_True", node);
        return this.pythonSymbol("AST_SymbolRef", node, {
          name: this.manglePrivateName(node.text),
        });
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
      case "tuple":
        // tree-sitter-python uses tuple_pattern for both `(target)` and
        // `(target,)`; only the latter is an unpacking target.
        if (
          significantChildren(node).length === 1 &&
          !node.text.includes(",")
        ) return this.lowerExpression(significantChildren(node)[0]);
        return this.make("AST_Array", node, {
          elements: significantChildren(node).map((child) =>
            this.lowerExpression(child)
          ),
          is_tuple: true,
        });
      case "expression_list":
      case "tuple_pattern":
        if (
          significantChildren(node).length === 1 &&
          !node.text.includes(",")
        ) return this.lowerExpression(significantChildren(node)[0]);
        return this.lowerTuple(node);
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
          const nativeUint64 = this.nativeBitwise &&
            ["&", "|", "^", "<<", ">>"].includes(operator);
          return this.make("AST_Binary", node, {
            left: this.lowerExpression(this.field(node, "left")),
            operator,
            right: this.lowerExpression(this.field(node, "right")),
            native_operator: nativeUint64,
            inferred_type: nativeUint64 ? "uint64" : undefined,
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
          native_operator: false,
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
        if (!this.functionFrames.length) {
          throw new SyntaxError("'yield' outside function");
        }
        const child = significantChildren(node)[0];
        const isFrom = node.children.some((part) => part.text === "from");
        return this.make("AST_Yield", node, {
          is_yield_from: isFrom,
          value: child ? this.lowerExpression(child) : null,
        });
      }
      case "await": {
        if (!this.functionFrames.at(-1)?.isCoroutine) {
          throw new SyntaxError("'await' outside async function");
        }
        const child = significantChildren(node)[0];
        return this.make("AST_Yield", node, {
          is_yield_from: true,
          value: this.lowerExpression(child),
        });
      }
      case "attribute":
        {
          const object = this.field(node, "object");
          const property = this.manglePrivateName(
            this.field(node, "attribute").text,
          );
          const intrinsicTable = object.type === "identifier"
            ? this.intrinsicModules.get(object.text)
            : undefined;
          const lexicalBinding = object.type === "identifier" &&
            this.intrinsicAliasIsLexicallyBound(
              this.manglePrivateName(object.text),
            );
          if (
            intrinsicTable &&
            !Object.hasOwn(intrinsicTable, property) &&
            !lexicalBinding &&
            !this.options.reuse_main_module &&
            !this.options.for_linting
          ) {
            throw new SyntaxError(
              `${intrinsicTable === SAGEJS_RUNTIME_INTRINSICS
                ? "sagejs.runtime"
                : "sagejs"} ` +
                `has no compiler intrinsic named ${property}`,
            );
          }
          const intrinsic = intrinsicTable?.[property];
          if (intrinsic && !this.options.for_linting) {
            const symbol = this.make("AST_SymbolRef", node, { name: intrinsic });
            symbol.intrinsic_call = true;
            if (lexicalBinding || this.options.reuse_main_module) {
              const moduleKey = intrinsicTable === SAGEJS_RUNTIME_INTRINSICS
                ? "sagejs.runtime"
                : "sagejs";
              return this.make("AST_Conditional", node, {
                condition: this.make("AST_Binary", node, {
                  left: this.lowerExpression(object),
                  operator: "===",
                  right: this.make("AST_Verbatim", node, {
                    value: `ρσ_modules[${JSON.stringify(moduleKey)}]`,
                  }),
                }),
                consequent: symbol,
                alternative: this.make("AST_Dot", node, {
                  expression: this.lowerExpression(object),
                  property,
                }),
              });
            }
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
        if (names.length === 0) {
          throw new SyntaxError("Unexpected token: ]");
        }
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
        if (this.field(node, "function").type === "list_splat") {
          return this.make("AST_UnaryPrefix", node, {
            operator: "*",
            expression: this.lowerCall(node, true),
          });
        }
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
      // Compiled systems kernels are ordinary CPython-parseable source.  The
      // existing module marker opts their fallback into JavaScript's native
      // fixed-width bitwise operators, so preserve Python's xor spelling too.
      // Without the marker Sage mode deliberately keeps `^` as exponentiation.
      if (operator === "^" && this.nativeBitwise) return "^";
      if (operator === "^=" && this.nativeBitwise) return "^=";
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
        .replace(/\\\r?\n/g, " ").trim().replace(/\s+/g, " ");
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
      : mode === "sage" ? "RealNumber" : "ρσ_float";
    return this.make("AST_Call", node, {
      expression: this.make("AST_SymbolRef", node, { name: constructor }),
      args: [this.make("AST_String", node, { value: raw })],
      direct_call: constructor === "ρσ_float",
    });
  }

  private lowerNumber(node: SyntaxNode): any {
    const suffix = node.text.match(/[rRlLjJ]+$/)?.[0] ?? "";
    const raw = suffix ? node.text.slice(0, -suffix.length) : node.text;
    const integer = node.type === "integer" || (
      node.type === "sage_number" &&
      (/^0[xob]/i.test(raw) || (!raw.includes(".") && !/[eE]/.test(raw)))
    );
    const decimalDigits = raw.replaceAll("_", "");
    if (
      integer && /^0[0-9_]+$/.test(raw) && /[1-9]/.test(decimalDigits)
    ) {
      throw new SyntaxError(
        "leading zeros in decimal integer literals are not permitted",
      );
    }
    if (/[jJ]/.test(suffix)) {
      const imaginary = this.numberFromText(node, raw, integer);
      return this.make("AST_Call", node, {
        expression: this.make("AST_SymbolRef", node, {
          name: this.syntax.mode === "sage" ? "CC" : "complex",
        }),
        args: [this.numberFromText(node, "0", true), imaginary],
      });
    }
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
      const isBytes = (string: any) =>
        string instanceof this.compiler.AST_Call &&
        string.expression?.name === "ρσ_bytes_literal" &&
        string.args?.[0] instanceof this.compiler.AST_String;
      if (strings.every(isBytes)) {
        return this.make("AST_Call", node, {
          expression: this.make("AST_SymbolRef", node, {
            name: "ρσ_bytes_literal",
          }),
          args: [this.make("AST_String", node, {
            value: strings.map((string) => string.args[0].value).join(""),
          })],
        });
      }
      if (strings.some(isBytes)) {
        throw new SyntaxError("cannot mix bytes and nonbytes literals");
      }
      // Adjacent f-strings and ordinary strings concatenate at compile time
      // semantically, though interpolation keeps the resulting AST dynamic.
      return this.concatenateExpressions(node, strings);
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
    const literal = decodePythonStringLiteral(node.text);
    if (literal.kind === "string") {
      return this.make("AST_String", node, { value: literal.value });
    }
    if (literal.kind === "bytes") {
      return this.make("AST_Call", node, {
        expression: this.make("AST_SymbolRef", node, {
          name: "ρσ_bytes_literal",
        }),
        args: [this.make("AST_String", node, { value: literal.value })],
      });
    }
    if (literal.kind === "js") {
      return this.make("AST_Verbatim", node, { value: literal.value });
    }
    throw new UnsupportedPythonCstNode(node, literal.kind);
  }

  private decodeStringFragment(node: SyntaxNode, raw: boolean): any {
    let value = raw || node.type !== "escape_sequence"
      ? node.text
      : decodePythonEscapes(node.text);
    // The f-string scanner deliberately preserves doubled literal braces.
    value = value.replaceAll("{{", "{").replaceAll("}}", "}");
    return this.make("AST_String", node, {
      value,
    });
  }

  private lowerFormattedString(node: SyntaxNode): any {
    const pieces: any[] = [];
    const start = significantChildren(node).find(
      (child) => child.type === "string_start",
    );
    const raw = /^(?=[A-Za-z]*["'])(?=[A-Za-z]*r)/i.test(start?.text ?? "");
    for (const child of significantChildren(node)) {
      if (child.type === "string_start" || child.type === "string_end") continue;
      if (child.type === "string_content" || child.type === "escape_sequence") {
        pieces.push(this.decodeStringFragment(child, raw));
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
      const conversionText = conversion?.text ??
        (debug && !format ? "!r" : "");
      const formatText = format
        ? this.concatenateExpressions(node, [
          this.make("AST_String", child, {
            value: `${debugPrefix}{${conversionText}`,
          }),
          this.lowerFormatSpecifier(format),
          this.make("AST_String", child, { value: "}" }),
        ])
        : this.make("AST_String", child, {
          value: `${debugPrefix}{${conversionText}}`,
        });
      const lowered = this.lowerExpression(expression);
      if (lowered instanceof this.compiler.AST_SymbolRef) lowered.parens = true;
      pieces.push(this.make("AST_Call", child, {
        expression: this.make("AST_Dot", child, {
          expression: this.make("AST_SymbolRef", child, { name: "ρσ_str" }),
          property: "format",
        }),
        direct_call: false,
        args: [
          formatText,
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

  private concatenateExpressions(node: SyntaxNode, pieces: any[]): any {
    if (!pieces.length) return this.make("AST_String", node, { value: "" });
    return pieces.slice(1).reduce(
      (left, right) => this.make("AST_Binary", node, {
        left,
        operator: "+",
        right,
      }),
      pieces[0],
    );
  }

  private lowerFormatSpecifier(node: SyntaxNode): any {
    const pieces: any[] = [];
    let cursor = node.startIndex;
    for (const expression of significantChildren(node)) {
      if (expression.type !== "format_expression") continue;
      if (expression.startIndex > cursor) {
        pieces.push(this.make("AST_String", node, {
          value: this.syntax.source.slice(cursor, expression.startIndex),
        }));
      }
      const value = this.field(expression, "expression");
      pieces.push(this.make("AST_Call", expression, {
        expression: this.make("AST_SymbolRef", expression, { name: "str" }),
        direct_call: false,
        args: [this.lowerExpression(value)],
      }));
      cursor = expression.endIndex;
    }
    if (cursor < node.endIndex) {
      pieces.push(this.make("AST_String", node, {
        value: this.syntax.source.slice(cursor, node.endIndex),
      }));
    }
    return this.concatenateExpressions(node, pieces);
  }

  private lowerAssignment(node: SyntaxNode): any {
    const left =
      this.optionalField(node, "left") ?? this.field(node, "name");
    const annotation = this.optionalField(node, "type");
    if (annotation) {
      const value = this.optionalField(node, "right");
      const loweredAnnotation = this.lowerType(annotation);
      const loweredValue = value ? this.lowerExpression(value) : null;
      const target = this.lowerExpression(left);
      if (value) this.invalidateIntrinsicBinding(left);
      return this.make("AST_AnnotatedAssignment", node, {
        target,
        annotation: loweredAnnotation,
        value: loweredValue,
      });
    }
    const right =
      this.optionalField(node, "right") ?? this.field(node, "value");
    const operator = this.normalizeOperator(
      this.optionalField(node, "operator")?.text ??
      "=",
    );
    if (
      operator !== "=" &&
      ["pattern_list", "tuple_pattern", "list_pattern"].includes(left.type)
    ) {
      throw new SyntaxError("illegal expression for augmented assignment");
    }
    const loweredRight = this.lowerExpression(right);
    const loweredLeft = this.lowerExpression(left);
    this.invalidateIntrinsicBinding(left);
    // A subscript or slice assignment is normally represented directly on
    // the target node for compatibility with the stage-zero AST.  In a
    // chained assignment, however, that representation would make the outer
    // target consume the inner ``__setitem__`` call's return value.  Preserve
    // an AST_Assign wrapper so the established chained-assignment emitter can
    // evaluate the RHS once and invoke every observable target left-to-right.
    const chainedTarget = operator === "=" && right.type === "assignment";
    if (
      operator === "=" &&
      loweredLeft instanceof this.compiler.AST_ItemAccess &&
      !chainedTarget
    ) {
      loweredLeft.assignment = loweredRight;
      return loweredLeft;
    }
    if (
      operator === "=" &&
      loweredLeft instanceof this.compiler.AST_Splice &&
      !chainedTarget
    ) {
      loweredLeft.assignment = loweredRight;
      return loweredLeft;
    }
    const nativeUint64 = this.nativeBitwise &&
      ["&=", "|=", "^=", "<<=", ">>="].includes(operator);
    const assignment = this.make("AST_Assign", node, {
      left: loweredLeft,
      operator,
      right: loweredRight,
      native_operator: nativeUint64,
      inferred_type: nativeUint64 ? "uint64" : undefined,
    });
    assignment.is_walrus = node.type === "named_expression";
    return assignment;
  }

  private lowerType(node: SyntaxNode): any {
    if (this.annotationsMode === "future") {
      return this.make("AST_String", node, { value: node.text });
    }
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
    let sawPositionalDefault = false;
    let sawVarargs = false;
    let sawKwargs = false;
    let positionalOnlyCount = 0;
    const parameterNames = new Set<string>();
    const register = (name: SyntaxNode): void => {
      const mangled = this.manglePrivateName(name.text);
      if (parameterNames.has(mangled)) {
        throw new SyntaxError(`duplicate argument '${name.text}'`);
      }
      parameterNames.add(mangled);
    };

    const makeArgument = (nameNode: SyntaxNode, typeNode: SyntaxNode | null) =>
      this.pythonSymbol("AST_SymbolFunarg", nameNode, {
        name: this.manglePrivateName(nameNode.text),
        annotation: typeNode ? this.lowerType(typeNode) : null,
        annotation_text: typeNode ? typeNode.text : null,
      });

    for (const parameter of significantChildren(node)) {
      if (parameter.type === "positional_separator") {
        positionalOnlyCount = positional.length;
        continue;
      }
      if (sawKwargs) {
        throw new SyntaxError("arguments cannot follow var-keyword argument");
      }
      if (parameter.type === "list_splat_pattern") {
        if (sawVarargs) throw new SyntaxError("* argument may appear only once");
        keywordOnly = true;
        const name = significantChildren(parameter)[0];
        if (name) {
          register(name);
          starargs = makeArgument(name, null);
        }
        sawVarargs = true;
        continue;
      }
      if (parameter.type === "dictionary_splat_pattern") {
        const name = significantChildren(parameter)[0];
        register(name);
        kwargs = makeArgument(name, null);
        sawKwargs = true;
        continue;
      }
      if (parameter.type === "keyword_separator") {
        if (sawVarargs || keywordOnly) {
          throw new SyntaxError("* argument may appear only once");
        }
        keywordOnly = true;
        sawVarargs = true;
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
        if (!keywordOnly) sawPositionalDefault = true;
      } else if (parameter.type === "typed_parameter") {
        name = significantChildren(parameter)[0];
        typeNode = parameter.childForFieldName("type");
        if (name.type === "list_splat_pattern") {
          keywordOnly = true;
          const identifier = significantChildren(name)[0];
          register(identifier);
          starargs = makeArgument(identifier, typeNode);
          sawVarargs = true;
          continue;
        }
        if (name.type === "dictionary_splat_pattern") {
          const identifier = significantChildren(name)[0];
          register(identifier);
          kwargs = makeArgument(identifier, typeNode);
          sawKwargs = true;
          continue;
        }
      }
      if (!value && !keywordOnly && sawPositionalDefault) {
        throw new SyntaxError("non-default argument follows default argument");
      }
      register(name);
      const argument = makeArgument(name, typeNode);
      (keywordOnly ? kwonly : positional).push(argument);
      if (value) {
        defaults[this.manglePrivateName(name.text)] =
          this.lowerExpression(value);
      }
    }
    const args = positional as any;
    args.kwonly = kwonly;
    args.has_defaults = Object.keys(defaults).length > 0;
    args.starargs = starargs ?? undefined;
    args.kwargs = kwargs ?? undefined;
    args.defaults = defaults;
    args.posonly = positionalOnlyCount;
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
    args.posonly = 0;
    args.is_simple_func = true;
    return args;
  }

  private addBindingTarget(node: SyntaxNode | null, names: Set<string>): void {
    if (!node) return;
    if (node.type === "identifier") {
      names.add(this.manglePrivateName(node.text));
      return;
    }
    if ([
      "parenthesized_expression", "expression_list", "pattern_list",
      "tuple_pattern", "list_pattern", "tuple", "list",
      "list_splat_pattern", "dictionary_splat_pattern",
    ].includes(node.type)) {
      for (const child of significantChildren(node)) {
        this.addBindingTarget(child, names);
      }
    }
  }

  private addPatternBindings(node: SyntaxNode, names: Set<string>): void {
    if (node.type === "identifier") {
      if (node.text !== "_") names.add(this.manglePrivateName(node.text));
      return;
    }
    if (node.type === "dotted_name") {
      const parts = significantChildren(node);
      if (parts.length === 1 && parts[0].text !== "_") {
        names.add(this.manglePrivateName(parts[0].text));
      }
      return;
    }
    if (node.type === "class_pattern") {
      for (const child of significantChildren(node).slice(1)) {
        this.addPatternBindings(child, names);
      }
      return;
    }
    if (node.type === "keyword_pattern") {
      const value = significantChildren(node)[1];
      if (value) this.addPatternBindings(value, names);
      return;
    }
    for (const child of significantChildren(node)) {
      this.addPatternBindings(child, names);
    }
  }

  private functionBindingNames(
    body: SyntaxNode,
    args: any[],
    globals: Set<string>,
    nonlocals: Set<string>,
  ): Set<string> {
    const names = new Set<string>(this.argumentNames(args));
    const scan = (node: SyntaxNode): void => {
      if (["function_definition", "class_definition"].includes(node.type)) {
        names.add(this.manglePrivateName(this.field(node, "name").text));
        return;
      }
      if (node.type === "decorated_definition") {
        const definition = this.field(node, "definition");
        names.add(this.manglePrivateName(this.field(definition, "name").text));
        return;
      }
      if (node.type === "lambda") return;
      if (node.type === "sage_generator_assignment") {
        this.addBindingTarget(this.field(node, "parent"), names);
        for (const target of node.childrenForFieldName("additional_target")) {
          this.addBindingTarget(target, names);
        }
        for (const target of node.childrenForFieldName("generator")) {
          this.addBindingTarget(target, names);
        }
        scan(this.field(node, "value"));
        return;
      }
      if ([
        "list_comprehension", "set_comprehension", "dictionary_comprehension",
        "generator_expression",
      ].includes(node.type)) {
        const firstFor = significantChildren(node).find(
          (child) => child.type === "for_in_clause",
        );
        if (firstFor) scan(this.field(firstFor, "right"));
        for (const walrus of node.descendantsOfType("named_expression")) {
          this.addBindingTarget(this.field(walrus, "left"), names);
        }
        return;
      }
      if (["assignment", "augmented_assignment", "named_expression"].includes(
        node.type,
      )) {
        const left = this.field(node, "left");
        this.addBindingTarget(left, names);
        for (const child of significantChildren(node)) {
          if (child !== left) scan(child);
        }
        return;
      }
      if (["for_statement", "async_for_statement"].includes(node.type)) {
        const left = this.field(node, "left");
        this.addBindingTarget(left, names);
        for (const child of significantChildren(node)) {
          if (child !== left) scan(child);
        }
        return;
      }
      if (node.type === "delete_statement") {
        for (const target of significantChildren(node)) {
          this.addBindingTarget(target, names);
        }
        return;
      }
      if (node.type === "with_clause") {
        for (const item of significantChildren(node)) {
          const itemValue = item.childForFieldName("value") ?? item;
          if (itemValue.type === "as_pattern") {
            const value = itemValue.childForFieldName("value") ??
              significantChildren(itemValue)[0];
            if (value) scan(value);
            this.addBindingTarget(
              itemValue.childForFieldName("alias")?.namedChild(0) ?? null,
              names,
            );
          } else {
            scan(itemValue);
          }
        }
        return;
      }
      if (node.type === "except_clause") {
        const value = node.childForFieldName("value");
        if (value?.type === "as_pattern") {
          const error = value.childForFieldName("value") ??
            significantChildren(value)[0];
          if (error) scan(error);
          this.addBindingTarget(
            value.childForFieldName("alias")?.namedChild(0) ?? null,
            names,
          );
        }
        for (const child of significantChildren(node)) {
          if (child !== value) scan(child);
        }
        return;
      }
      if (node.type === "case_pattern") {
        this.addPatternBindings(node, names);
        return;
      }
      if (node.type === "import_statement") {
        for (const entry of node.childrenForFieldName("name")) {
          const alias = entry.type === "aliased_import"
            ? entry.childForFieldName("alias")
            : null;
          const source = entry.type === "aliased_import"
            ? this.field(entry, "name")
            : entry;
          names.add(this.manglePrivateName(
            alias?.text ?? source.text.split(".")[0],
          ));
        }
        return;
      }
      if (node.type === "import_from_statement") {
        for (const entry of node.childrenForFieldName("name")) {
          const alias = entry.type === "aliased_import"
            ? entry.childForFieldName("alias")
            : null;
          const source = entry.type === "aliased_import"
            ? this.field(entry, "name")
            : entry;
          names.add(this.manglePrivateName(alias?.text ?? source.text));
        }
        return;
      }
      for (const child of significantChildren(node)) scan(child);
    };
    scan(body);
    for (const name of globals) names.delete(name);
    for (const name of nonlocals) names.delete(name);
    return names;
  }

  private intrinsicAliasIsLexicallyBound(name: string): boolean {
    const classFrame = this.classBindings.at(-1);
    if (
      classFrame &&
      this.functionFrames.length === classFrame.functionDepth
    ) {
      if (classFrame.globals.has(name)) return this.moduleBindings.has(name);
      if (classFrame.names.has(name)) return true;
    }
    for (let index = this.functionFrames.length - 1; index >= 0; index -= 1) {
      const frame = this.functionFrames[index];
      if (frame.globals.has(name)) return false;
      if (frame.bindings.has(name) || frame.nonlocals.has(name)) return true;
    }
    return false;
  }

  private namespaceBuiltinIsLexicallyShadowed(name: string): boolean {
    const classFrame = this.classBindings.at(-1);
    if (
      classFrame &&
      this.functionFrames.length === classFrame.functionDepth
    ) {
      if (classFrame.globals.has(name)) return this.moduleBindings.has(name);
      if (classFrame.names.has(name)) return true;
    }
    for (let index = this.functionFrames.length - 1; index >= 0; index -= 1) {
      const frame = this.functionFrames[index];
      if (frame.globals.has(name)) break;
      if (frame.bindings.has(name) || frame.nonlocals.has(name)) return true;
    }
    return this.moduleBindings.has(name);
  }

  private lowerLambda(node: SyntaxNode): any {
    const parameters = node.childForFieldName("parameters");
    const body = this.field(node, "body");
    const args = parameters ? this.lowerParameters(parameters) : this.emptyParameters();
    const inherited = this.functionFrames.at(-1);
    const globals = new Set<string>();
    const nonlocals = new Set<string>();
    const frame = {
      isCoroutine: false,
      superClass: inherited?.superClass ?? null,
      superReceiver: inherited?.superReceiver ?? null,
      receiverAlias: null,
      bindings: this.functionBindingNames(body, args, globals, nonlocals),
      globals,
      nonlocals,
    };
    this.functionFrames.push(frame);
    let loweredBody: any;
    try {
      loweredBody = this.lowerExpression(body);
    } finally {
      this.functionFrames.pop();
    }
    const definition = this.make("AST_Function", node, {
      name: null,
      argnames: args,
      decorators: [],
      annotations: this.annotationsMode,
      is_generator: this.containsNodeType(node, "yield"),
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
      body: loweredBody,
    });
    definition.python_lexical_hygiene = !this.options.compiler_bootstrap;
    definition.python_scope_bindings = [...frame.bindings];
    return definition;
  }

  private argumentNames(args: any): string[] {
    return [
      ...args,
      ...(args.kwonly ?? []),
      ...(args.starargs ? [args.starargs] : []),
      ...(args.kwargs ? [args.kwargs] : []),
    ].map((argument) => argument.name);
  }

  private withLexicalImportScope<T>(callback: () => T): T {
    const classes = new Map(this.knownClasses);
    const intrinsics = new Map(this.intrinsicModules);
    try {
      return callback();
    } finally {
      this.knownClasses.clear();
      for (const [name, details] of classes) this.knownClasses.set(name, details);
      this.intrinsicModules.clear();
      for (const [name, table] of intrinsics) {
        this.intrinsicModules.set(name, table);
      }
    }
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
    const loweredReturnType = returnType ? this.lowerType(returnType) : null;
    const returnAnnotationText = returnType ? returnType.text : null;
    const bodyNode = this.field(node, "body");
    const isCoroutine = node.children.some((part) => part.text === "async");
    const methodDecoratorNames = decorators.map((decorator) =>
      decorator.expression?.property ?? decorator.expression?.name
    );
    const receiverAlias = isMethod && !methodDecoratorNames.includes("staticmethod")
      ? args[0]?.name ?? null
      : null;
    const inherited = this.functionFrames.at(-1);
    const declaredGlobals = new Set(
      this.declaredNames(bodyNode, "global_statement"),
    );
    const declaredNonlocals = new Set(
      this.declaredNames(bodyNode, "nonlocal_statement"),
    );
    if (!isMethod && this.functionFrames.length === 0 && !this.classStack.length) {
      this.intrinsicModules.delete(nameNode.text);
    }
    const frame = {
      isCoroutine,
      superClass: isMethod
        ? this.classStack.at(-1) ?? null
        : inherited?.superClass ?? null,
      superReceiver: isMethod
        ? args[0]?.name ?? null
        : inherited?.superReceiver ?? null,
      receiverAlias,
      bindings: this.functionBindingNames(
        bodyNode,
        args,
        declaredGlobals,
        declaredNonlocals,
      ),
      globals: declaredGlobals,
      nonlocals: declaredNonlocals,
    };
    this.functionFrames.push(frame);
    let loweredBody: any[];
    try {
      loweredBody = this.withLexicalImportScope(() =>
        significantChildren(bodyNode).flatMap((child) =>
          this.lowerStatement(child)
        )
      );
    } finally {
      this.functionFrames.pop();
    }
    const extracted = this.extractDocstrings(loweredBody);
    const Constructor = isMethod ? "AST_Method" : "AST_Function";
    const properties: Record<string, any> = {
      name: this.pythonSymbol("AST_SymbolDefun", nameNode, {
        name: this.manglePrivateName(nameNode.text),
      }),
      argnames: args,
      decorators,
      annotations: this.annotationsMode,
      // Sage.js implements Python coroutines with the generator protocol, so
      // an async function must be emitted as `function*` even when its only
      // suspension points are `await`, `async for`, or `async with`.
      is_generator: isCoroutine || this.containsNodeType(node, "yield"),
      is_coroutine: isCoroutine,
      is_lambda: false,
      is_expression: false,
      is_anonymous: false,
      sequential_definition: !isMethod && !!(
        this.currentToplevel?.scoped_flags?.sequential_definitions ??
        this.options.scoped_flags?.sequential_definitions
      ),
      return_annotation: loweredReturnType,
      return_annotation_text: returnAnnotationText,
      declared_globals: [...declaredGlobals],
      declared_nonlocals: [...declaredNonlocals],
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
      const classFrame = this.classBindings.at(-1);
      const mangledName = this.manglePrivateName(nameNode.text);
      if (!classFrame?.globals.has(mangledName)) {
        classFrame?.names.add(mangledName);
      }
    }
    const definition = this.make(Constructor, node, properties);
    definition.python_lexical_hygiene = !this.options.compiler_bootstrap;
    definition.python_scope_bindings = [...frame.bindings];
    return definition;
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
        result.push(...significantChildren(current).map((child) =>
          this.manglePrivateName(child.text)
        ));
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
    const superclassEntries = superclasses
      ? significantChildren(superclasses)
      : [];
    const baseNodes = superclassEntries.filter(
      (child) => child.type !== "keyword_argument",
    );
    let metaclass: any = null;
    const typingDictionaryBase = baseNodes.some(
      (child) => child.text === "TypedDict" || child.text.endsWith(".TypedDict"),
    );
    for (const keyword of superclassEntries.filter(
      (child) => child.type === "keyword_argument",
    )) {
      const keywordName = keyword.childForFieldName("name")?.text ?? "";
      if (typingDictionaryBase && ["total", "closed"].includes(keywordName)) {
        continue;
      }
      if (keywordName === "metaclass") {
        metaclass = this.lowerExpression(this.field(keyword, "value"));
        continue;
      }
      throw new UnsupportedPythonCstNode(
        keyword,
        `class keyword ${JSON.stringify(keywordName)} requires metaclass semantics`,
      );
    }
    const genericBuiltinBases = new Set([
      "dict", "frozenset", "list", "set", "str", "tuple", "type",
    ]);
    const bases = baseNodes.map((child) => {
      if (child.type === "subscript") {
        const origin = this.field(child, "value");
        const originName = this.expressionKey(origin);
        if (originName && genericBuiltinBases.has(originName)) {
          return this.lowerExpression(origin);
        }
      }
      return this.lowerExpression(child);
    });
    if (this.functionFrames.length === 0 && this.classStack.length === 0) {
      this.intrinsicModules.delete(nameNode.text);
    }
    const isNamedTupleClass = baseNodes.some((child) =>
      child.text === "NamedTuple" || child.text.endsWith(".NamedTuple")
    );
    // The class name is already bound while its body is compiled.  Calls to
    // that name from methods are constructor calls even though the complete
    // method/class-variable table is not available until the body has been
    // lowered.  A provisional entry is enough to select AST_New; it is
    // replaced by the finished class definition below.
    this.knownClasses.set(nameNode.text, { provisional: true });
    this.classStack.push(nameNode.text);
    this.classBindings.push({
      names: new Set(),
      globals: new Set(),
      functionDepth: this.functionFrames.length,
    });
    let statements: any[];
    try {
      statements = this.withLexicalImportScope(() => {
        const result: any[] = [];
        for (const child of significantChildren(this.field(node, "body"))) {
          if (child.type === "function_definition") {
            result.push(this.lowerFunction(child, [], true));
          } else if (child.type === "decorated_definition") {
            const definition = this.field(child, "definition");
            if (definition.type !== "function_definition") {
              result.push(...this.lowerDecoratedDefinition(child));
            } else {
              result.push(this.lowerFunction(
                definition,
                this.lowerDecorators(child),
                true,
              ));
            }
          } else {
            result.push(...this.lowerStatement(child));
          }
        }
        return result;
      });
    } finally {
      this.classBindings.pop();
      this.classStack.pop();
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
    const nonlocalNames: string[] = [];
    const globalNames: string[] = [];
    for (const base of bases) {
      if (!(base instanceof this.compiler.AST_SymbolRef)) continue;
      const inherited = this.knownClasses.get(base.name);
      if (!inherited) continue;
      Object.assign(staticMethods, inherited.static ?? {});
      Object.assign(classMethods, inherited.classmethods ?? {});
      Object.assign(classvars, inherited.classvars ?? {});
      // Inherited properties are available through the prototype chain, but
      // they are not class variables.  Leaving their names in the inherited
      // class-variable table would make code generation read the descriptor
      // from the prototype and execute its getter during subclass creation.
      for (const name of Object.keys(inherited.dynamic_properties ?? {})) {
        delete classvars[name];
      }
    }
    let initializer: any = undefined;
    for (const statement of classStatements) {
      const body = statement?.body;
      if (statement instanceof this.compiler.AST_Var) {
        for (const declaration of statement.definitions ?? []) {
          if (declaration.name?.name) {
            if (declaration.is_global) {
              globalNames.push(declaration.name.name);
            } else {
              nonlocalNames.push(declaration.name.name);
            }
          }
        }
      }
      if (body instanceof this.compiler.AST_Assign && body.left?.name) {
        classvars[body.left.name] = true;
      }
      for (const destination of Object.values(
        statement?.python_import_bindings ?? {},
      ) as Array<Record<string, any>>) {
        if (destination.kind === "class") {
          classvars[destination.name] = true;
        }
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
      } else if (statement instanceof this.compiler.AST_Class) {
        classvars[statement.name.name] = true;
      }
    }
    for (const name of nonlocalNames) delete classvars[name];
    for (const name of globalNames) delete classvars[name];
    // A descriptor remains an ordinary namespace value until class creation.
    // Preserve aliases such as ``oldName = new_name`` when ``new_name`` is a
    // property; reading it from the partly built JavaScript prototype would
    // invoke the getter with the prototype itself as ``self``.
    for (let index = 0; index < classStatements.length; index += 1) {
      const statement = classStatements[index];
      const assignment = statement instanceof this.compiler.AST_Assign
        ? statement
        : statement?.body instanceof this.compiler.AST_Assign
        ? statement.body
        : null;
      if (
        assignment?.operator === "=" &&
        assignment.left instanceof this.compiler.AST_SymbolRef &&
        assignment.right instanceof this.compiler.AST_SymbolRef &&
        dynamicProperties[assignment.right.name]
      ) {
        dynamicProperties[assignment.left.name] =
          dynamicProperties[assignment.right.name];
        classvars[assignment.left.name] = true;
        classStatements[index] = new this.compiler.AST_EmptyStatement({
          stype: ";",
          start: statement.start,
          end: statement.end,
        });
      }
    }
    this.rewriteClassVariables(
      nameNode.text,
      classStatements,
      classvars,
      new Set([...nonlocalNames, ...globalNames]),
    );
    const useBoundMethods = this.currentToplevel?.scoped_flags
      ?.bound_methods ?? this.options.scoped_flags?.bound_methods ?? true;
    const bound = useBoundMethods
      ? classStatements
        .filter((statement) => statement instanceof this.compiler.AST_Method)
        .filter((method) => !globalNames.includes(method.name.name))
        .filter((method) =>
          method.name.name !== "__init__" && !method.static
        )
        .map((method) => method.name.name)
      : [];
    const inheritedBound = new Set<string>();
    if (useBoundMethods) {
      for (const base of bases) {
        if (!(base instanceof this.compiler.AST_SymbolRef)) continue;
        const inherited = this.knownClasses.get(base.name);
        for (const method of inherited?.all_bound ?? inherited?.bound ?? []) {
          inheritedBound.add(method);
        }
      }
    }
    const shadowedBound = [...inheritedBound].filter((method) =>
      !!classvars[method]
    );
    const allBound = [...inheritedBound];
    for (const method of bound) {
      if (!allBound.includes(method)) allBound.push(method);
    }
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
    const namedtupleFields = isNamedTupleClass
      ? classStatements
        .map((statement) =>
          statement instanceof this.compiler.AST_AnnotatedAssignment
            ? statement
            : statement.body instanceof this.compiler.AST_AnnotatedAssignment
            ? statement.body
            : null
        )
        .filter((statement) => typeof statement?.target?.name === "string")
        .map((statement) => statement.target.name)
      : [];
    const definition = this.make("AST_Class", node, {
      name: this.pythonSymbol("AST_SymbolDefun", nameNode, {
        name: nameNode.text,
      }),
      parent,
      bases: effectiveBases,
      metaclass,
      implicit_object_base: implicitObjectBase,
      static: staticMethods,
      classmethods: classMethods,
      external: decoratorNames.has("external"),
      python_class: !decoratorNames.has("external"),
      lightweight: decoratorNames.has("ρσ_lightweight_math_class"),
      sequence_class: decoratorNames.has("ρσ_sequence_class"),
      callable_instance_class: decoratorNames.has("ρσ_callable_instance_class"),
      bigint_fields: bigintFields,
      namedtuple_fields: namedtupleFields,
      bound,
      all_bound: allBound,
      shadowed_bound: shadowedBound,
      bind_inherited_methods: useBoundMethods,
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
      // Both declarations bypass the class namespace.  The output layer's
      // historical `nonlocal_names` routing is precisely that mechanical
      // distinction; `declared_globals` preserves the Python authority.
      nonlocal_names: [...nonlocalNames, ...globalNames],
      declared_globals: globalNames,
      localvars: [],
      annotated_locals: [],
      docstrings: extracted.docstrings,
      body: classStatements,
      init: initializer,
    });
    this.specializeBigintClass(definition);
    // Class constructor calls later in the same suite must lower as `new`.
    this.knownClasses.set(nameNode.text, definition);
    const outerClassFrame = this.classBindings.at(-1);
    const mangledName = this.manglePrivateName(nameNode.text);
    if (!outerClassFrame?.globals.has(mangledName)) {
      outerClassFrame?.names.add(mangledName);
    }
    return definition;
  }

  /** Preserve the typed integer fast path formerly coupled to token parsing. */
  private specializeBigintClass(definition: any): void {
    if (!Object.keys(definition.bigint_fields ?? {}).length) return;
    const className = definition.name.name;
    for (const method of definition.body ?? []) {
      if (!(method instanceof this.compiler.AST_Method)) continue;
      const objectTypes: Record<string, string> = Object.create(null);
      const bigintLocals = new Set<string>();
      if (!method.static && method.argnames?.length) {
        objectTypes[method.argnames[0].name] = className;
      }
      for (const argument of method.argnames ?? []) {
        const annotation = argument.annotation;
        if (annotation instanceof this.compiler.AST_SymbolRef) {
          objectTypes[argument.name] = annotation.name;
        } else if (annotation instanceof this.compiler.AST_String) {
          objectTypes[argument.name] = annotation.value;
        }
      }
      const isBigint = (value: any): boolean => {
        if (value?.inferred_type === "bigint") return true;
        if (value instanceof this.compiler.AST_SymbolRef) {
          return bigintLocals.has(value.name);
        }
        if (!(value instanceof this.compiler.AST_Dot)) return false;
        const owner = value.expression;
        return owner instanceof this.compiler.AST_SymbolRef &&
          objectTypes[owner.name] === className &&
          !!definition.bigint_fields[value.property];
      };
      const seen = new Set<any>();
      const visit = (value: any): void => {
        if (!value || typeof value !== "object" || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) {
          for (const child of value) visit(child);
          for (const key of ["kwonly", "starargs", "kwargs", "defaults"]) {
            visit(value[key]);
          }
          return;
        }
        if (!(value instanceof this.compiler.AST_Node)) return;
        for (const [key, child] of Object.entries(value)) {
          if (["start", "end", "scope", "thedef", "imports"].includes(key) ||
              typeof child === "function") continue;
          visit(child);
        }
        if (value instanceof this.compiler.AST_Binary) {
          if (value.operator === "instanceof" &&
              value.right instanceof this.compiler.AST_SymbolRef) {
            value.native_operator = true;
          } else if (["+", "-", "*"].includes(value.operator) &&
              isBigint(value.left) && isBigint(value.right)) {
            value.native_operator = true;
            value.inferred_type = "bigint";
          }
        } else if (value instanceof this.compiler.AST_UnaryPrefix &&
            value.operator === "-" && isBigint(value.expression)) {
          value.native_operator = true;
          value.inferred_type = "bigint";
        }
        if (value instanceof this.compiler.AST_Assign &&
            value.operator === "=" &&
            value.left instanceof this.compiler.AST_SymbolRef &&
            isBigint(value.right)) {
          bigintLocals.add(value.left.name);
        }
      };
      visit(method.body);
    }
  }

  private rewriteClassVariables(
    className: string,
    statements: any[],
    classvars: Record<string, boolean>,
    nonlocals = new Set<string>(),
  ): void {
    const known = new Set<string>();
    const definition = (name: string) => {
      const symbol = new this.compiler.AST_SymbolDefun({
        name: `${className}.prototype.${name}`,
      });
      symbol.python_identifier = !this.options.compiler_bootstrap;
      symbol.python_lexical_binding = symbol.python_identifier;
      return symbol;
    };
    const visit = (value: any, seen = new Set<any>()): void => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child, seen);
        return;
      }
      if (value instanceof this.compiler.AST_Scope) return;
      if (value instanceof this.compiler.AST_Imports) {
        for (const destination of Object.values(
          value.python_import_bindings ?? {},
        ) as Array<Record<string, any>>) {
          if (destination.kind !== "class") continue;
          known.add(destination.name);
          classvars[destination.name] = true;
        }
        return;
      }
      if (value instanceof this.compiler.AST_AnnotatedAssignment &&
          value.target instanceof this.compiler.AST_SymbolRef) {
        const name = value.target.name;
        if (nonlocals.has(name)) return;
        known.add(name);
        classvars[name] = true;
        value.target.thedef = definition(name);
      } else if (value instanceof this.compiler.AST_Assign &&
          value.left instanceof this.compiler.AST_SymbolRef) {
        const name = value.left.name;
        if (nonlocals.has(name)) return;
        // Python evaluates the right-hand side before binding a new class
        // namespace name. Thus ``Interrupted = Interrupted`` reads the
        // module global on its first occurrence, while a later ``x = x + 1``
        // reads the existing class value.
        visit(value.right, seen);
        known.add(name);
        classvars[name] = true;
        value.left.thedef = definition(name);
        return;
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
        // A function body has its own lexical scope, but decorators, default
        // arguments, and annotations are evaluated immediately in the
        // surrounding class namespace.  Rewrite those expressions without
        // descending into the method body itself.
        for (const decorator of statement.decorators ?? []) visit(decorator);
        for (const value of Object.values(
          statement.argnames?.defaults ?? {},
        )) visit(value);
        for (const argument of statement.argnames ?? []) {
          visit(argument?.annotation);
        }
        visit(statement.argnames?.starargs?.annotation);
        for (const argument of statement.argnames?.kwonly ?? []) {
          visit(argument?.annotation);
        }
        visit(statement.argnames?.kwargs?.annotation);
        visit(statement.return_annotation);
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
    const sourceKey = moduleText.slice(level);
    if (node.type === "import_from_statement" && sourceKey === "__python__") {
      return this.make("AST_EmptyStatement", node, { stype: "scoped_flags" });
    }
    if (node.type === "import_from_statement" && sourceKey === "typing" &&
        !this.options.runtime_imports) {
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
        const key = this.options.resolved_import_keys?.get(nameNode.startIndex) ??
          nameNode.text;
        imports.push(this.makeImport(
          node,
          nameNode,
          key,
          aliasNode,
          null,
          0,
          false,
        ));
      }
    } else {
      if (!moduleNode) throw new UnsupportedPythonCstNode(node, "missing module");
      const key = this.options.resolved_import_keys?.get(moduleNode.startIndex) ??
        sourceKey;
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
    for (const imported of imports) {
      if (imported.star &&
          (this.functionFrames.length > 0 || this.classStack.length > 0)) {
        throw new SyntaxError("import * only allowed at module level");
      }
      this.registerImportedClasses(imported);
      if (this.functionFrames.length > 0) continue;
      if (this.classStack.length > 0) {
        const frame = this.classBindings.at(-1);
        const registerClassImport = (name: string): void => {
          if (!frame?.globals.has(name)) frame?.names.add(name);
        };
        if (imported.argnames) {
          for (const argument of imported.argnames) {
            registerClassImport(argument.alias?.name ?? argument.name);
          }
        } else if (!imported.star) {
          registerClassImport(
            imported.alias?.name ?? imported.key.split(".")[0],
          );
        }
        continue;
      }
      if (imported.intrinsic && imported.alias?.name) {
        const table = imported.key === "sagejs.runtime"
          ? SAGEJS_RUNTIME_INTRINSICS
          : SAGEJS_PUBLIC_INTRINSICS;
        if (table) this.intrinsicModules.set(imported.alias.name, table);
        continue;
      }
      if (imported.star) {
        this.intrinsicModules.clear();
      } else if (imported.argnames) {
        for (const argument of imported.argnames) {
          this.intrinsicModules.delete(argument.alias?.name ?? argument.name);
        }
      } else {
        this.intrinsicModules.delete(
          imported.alias?.name ?? imported.key.split(".")[0],
        );
      }
    }
    const statement = this.make("AST_Imports", node, { imports });
    statement.python_lexical_hygiene = !this.options.compiler_bootstrap;
    statement.python_scope_bindings = this.functionFrames.length > 0
      ? [...this.functionFrames.at(-1)!.bindings]
      : this.classStack.length > 0
      ? [
        ...(this.classBindings.at(-1)?.names ?? []),
        ...(this.classBindings.at(-1)?.globals ?? []),
      ]
      : [...this.moduleBindings];
    statement.python_import_bindings = Object.create(null);
    for (const imported of imports) {
      if (imported.star) continue;
      if (imported.argnames) {
        for (const argument of imported.argnames) {
          const localName = argument.alias?.name ?? argument.name;
          statement.python_import_bindings[localName] =
            this.importBindingDestination(localName);
        }
      } else {
        const localName = imported.alias?.name ?? imported.key.split(".")[0];
        statement.python_import_bindings[localName] =
          this.importBindingDestination(localName);
      }
    }
    return statement;
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
    let expression: any = this.pythonSymbol("AST_SymbolRef", node, {
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
      // Runtime package execution must invoke __import__ even when the target
      // is the current package.  In particular ``from . import child`` asks
      // the import machinery to load and bind ``package.child``.
      dynamic: !!this.options.runtime_imports || !!imported?.dynamic,
      level,
      star,
      // Only a real module-body import publishes directly to the module
      // object. Function/method imports remain lexical locals; class-body
      // imports are copied into the class namespace by class lowering.
      target_module: this.functionFrames.length === 0 &&
          this.classStack.length === 0
        ? this.options.module_id ?? this.currentToplevel?.module_id
        : null,
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
      this.pythonSymbol("AST_SymbolRef", target, { name: target.text })
    );
    const parentTarget = targets.length === 1
      ? targets[0]
      : this.make("AST_Array", node, { elements: targets, is_tuple: false });
    const generatorTargets = generators.map((generator) =>
      this.pythonSymbol("AST_SymbolRef", generator, { name: generator.text })
    );
    const assignParent = this.make("AST_Assign", node, {
      left: parentTarget,
      operator: "=",
      right: value,
    });
    const firstNgens = this.make("AST_Call", node, {
      expression: this.make("AST_Dot", node, {
        expression: this.pythonSymbol("AST_SymbolRef", parent, {
          name: parent.text,
        }),
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
      left: this.pythonSymbol("AST_SymbolRef", functionNode, {
        name: functionNode.text,
      }),
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
    const children = significantChildren(node).slice(1);
    const forClauses = children.filter((child) => child.type === "for_in_clause");
    if (!forClauses.length) {
      throw new UnsupportedPythonCstNode(node, "no for clause");
    }
    const comprehensionBindings = new Set<string>();
    for (const clause of forClauses) {
      this.addBindingTarget(this.field(clause, "left"), comprehensionBindings);
    }
    for (const walrus of node.descendantsOfType("named_expression")) {
      const target = this.field(walrus, "left");
      this.addBindingTarget(target, comprehensionBindings);
      this.invalidateIntrinsicBinding(target);
    }
    // Python evaluates only the first iterable in the enclosing scope. Every
    // target, later iterable, condition, and result lives in the implicit
    // comprehension scope.
    const firstIterable = this.lowerExpression(this.field(forClauses[0], "right"));
    const inherited = this.functionFrames.at(-1);
    this.functionFrames.push({
      isCoroutine: inherited?.isCoroutine ?? false,
      superClass: inherited?.superClass ?? null,
      superReceiver: inherited?.superReceiver ?? null,
      receiverAlias: null,
      bindings: comprehensionBindings,
      globals: new Set(),
      nonlocals: new Set(),
    });
    const clauses: any[] = [];
    try {
      let forIndex = 0;
      for (const child of children) {
        if (child.type === "for_in_clause") {
          const isAsync = child.children.some((part) => part.text === "async");
          if (isAsync && !inherited?.isCoroutine) {
            throw new SyntaxError(
              "asynchronous comprehension outside async function",
            );
          }
          clauses.push({
            init: this.lowerBindingTarget(
              this.lowerExpression(this.field(child, "left")),
              this.field(child, "left"),
            ),
            name: null,
            object: forIndex === 0
              ? firstIterable
              : this.lowerExpression(this.field(child, "right")),
            conditions: [],
            is_async: isAsync,
          });
          forIndex += 1;
        } else if (child.type === "if_clause") {
          const expression = significantChildren(child)[0];
          if (!clauses.length) throw new UnsupportedPythonCstNode(child);
          clauses.at(-1).conditions.push(this.lowerExpression(expression));
        }
      }
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
        properties.value_statement = this.lowerExpression(
          this.field(body, "value"),
        );
        properties.is_pydict = literalFlags.is_pydict;
        properties.is_jshash = literalFlags.is_jshash;
      } else {
        properties.statement = this.lowerExpression(body);
      }
      const comprehension = this.make(constructor, node, properties);
      comprehension.python_lexical_hygiene = !this.options.compiler_bootstrap;
      comprehension.python_scope_bindings = [...comprehensionBindings];
      return comprehension;
    } finally {
      this.functionFrames.pop();
    }
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

  private lowerCall(node: SyntaxNode, unwrapSplatFunction = false): any {
    const args: any[] = [];
    (args as any).kwargs = [];
    (args as any).kwarg_items = [];
    (args as any).starargs = false;
    const argumentsNode = this.field(node, "arguments");
    const argumentNodes = argumentsNode.type === "argument_list"
      ? significantChildren(argumentsNode)
      : [argumentsNode];
    let sawKeyword = false;
    let sawDictionarySplat = false;
    for (const argument of argumentNodes) {
      if (argument.type === "keyword_argument") {
        sawKeyword = true;
        (args as any).kwargs.push([
          this.make("AST_SymbolRef", this.field(argument, "name"), {
            name: this.field(argument, "name").text,
          }),
          this.lowerExpression(this.field(argument, "value")),
        ]);
      } else if (argument.type === "dictionary_splat") {
        sawDictionarySplat = true;
        (args as any).kwarg_items.push(
          this.lowerExpression(significantChildren(argument)[0]),
        );
        (args as any).starargs = true;
      } else {
        const splatFunction = argument.type === "call" &&
          this.field(argument, "function").type === "list_splat";
        const isSplat = splatFunction ||
          argument.type === "list_splat" ||
          argument.type === "list_splat_pattern";
        if (sawDictionarySplat && isSplat) {
          throw new SyntaxError(
            "iterable argument unpacking follows keyword argument unpacking",
          );
        }
        if ((sawKeyword || sawDictionarySplat) && !isSplat) {
          throw new SyntaxError("positional argument follows keyword argument");
        }
        const lowered = splatFunction
          ? this.lowerCall(argument, true)
          : isSplat
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
    let functionNode = this.field(node, "function");
    if (unwrapSplatFunction) {
      functionNode = significantChildren(functionNode)[0];
    }
    const callable = this.lowerExpression(functionNode);
    const callableName = callable instanceof this.compiler.AST_SymbolRef
      ? callable.name
      : null;
    if (
      callable instanceof this.compiler.AST_Dot &&
      callable.expression instanceof this.compiler.AST_SymbolRef &&
      callable.expression.name === "Reflect"
    ) {
      const argumentVectorIndex = callable.property === "apply"
        ? 2
        : callable.property === "construct"
        ? 1
        : -1;
      const argumentVector = args[argumentVectorIndex];
      if (argumentVector instanceof this.compiler.AST_Array) {
        // Reflect consumes this literal only as an ECMAScript argument list.
        // Giving it Python's decorated list prototype is both unobservable
        // and extremely expensive on hot low-level runtime paths.
        argumentVector.is_native = true;
      }
    }
    const nativeVectorArgument = callableName === "_builtins_call_member" ||
        callableName === "_builtins_call_special" ||
        callableName === "_internal_call_member"
      ? 2
      : callableName === "ρσ_math_tuple" || callableName === "math_tuple"
      ? 0
      : -1;
    const nativeVector = args[nativeVectorArgument];
    if (nativeVector instanceof this.compiler.AST_Array) {
      // These private runtime APIs consume the literal as an implementation
      // vector.  None of them exposes a mutable Python list to user code.
      nativeVector.is_native = true;
    }
    if (callableName === "super" && args.length === 0) {
      const frame = this.functionFrames.at(-1);
      if (frame?.superClass && frame.superReceiver) {
        args.push(
          this.pythonSymbol("AST_SymbolRef", node, { name: frame.superClass }),
          this.pythonSymbol("AST_SymbolRef", node, {
            name: frame.superReceiver,
          }),
        );
      }
    }
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
      // Intrinsic module attributes are rewritten while the callable is
      // lowered (for example ``runtime.object`` becomes the native
      // ``Object`` symbol).  Prefer that authoritative lowered owner when it
      // names a known native class; the source spelling is still needed for
      // ordinary imported classes.
      const loweredOwnerKey = callable instanceof this.compiler.AST_Dot &&
          callable.expression instanceof this.compiler.AST_SymbolRef
        ? callable.expression.name
        : null;
      const sourceOwnerKey = this.expressionKey(ownerNode);
      const ownerKey = loweredOwnerKey && this.knownClasses.has(loweredOwnerKey)
        ? loweredOwnerKey
        : sourceOwnerKey;
      const method = this.field(functionNode, "attribute").text;
      if (ownerKey && this.knownClasses.has(ownerKey)) {
        const details = this.knownClasses.get(ownerKey);
        // While lowering a class body we know that its name denotes a class,
        // but have not yet collected the decorators on all of its methods.
        // Do not guess that ``C.f(...)`` is an unbound instance-method call:
        // a later ``@staticmethod``/``@classmethod`` declaration would make
        // that optimization semantically wrong.  The ordinary attribute-call
        // lowering is correct for all three cases.
        if (details?.provisional) {
          return this.make("AST_Call", node, {
            expression: callable,
            args,
          });
        }
        const classvar = !!details?.classvars?.[method];
        const staticMethod = method === "__new__" ||
          ["call", "apply", "bind", "toString"].includes(method) ||
          !!details?.static?.[method] || !!details?.classmethods?.[method];
        if (ownerKey === "Object") {
          if (method === "defineProperty" && args[2]) {
            this.markNativeObjectLiteral(args[2]);
          } else if (
            (method === "defineProperties" || method === "create") && args[1]
          ) {
            this.markNativeObjectLiteral(args[1], true);
          }
        }
        // Class metadata for forward references and imported bases can be
        // intentionally incomplete.  Treating an unknown keyword-bearing
        // call as an instance method changes ``C.f(...)`` into
        // ``C.prototype.f.call(...)`` and, for a classmethod, passes the
        // surrounding JavaScript receiver as ``cls``.  Ordinary Python
        // attribute lookup is the authoritative fallback and binds instance,
        // static, and class methods correctly at runtime.  Positional-only
        // unknown calls retain the legacy bootstrap optimization for now.
        const hasKeywordArguments = (args as any).kwargs.length > 0 ||
          (args as any).kwarg_items.length > 0;
        // An assignment in a class body can install an arbitrary descriptor,
        // including ``name = staticmethod(callable)``.  Calling such a value
        // through ``C.prototype.name`` bypasses Python descriptor lookup and
        // can even select an inherited instance method instead.  Only methods
        // whose binding mode is known from their definition are safe targets
        // for the direct class-call lowering.
        if (classvar) {
          return this.make("AST_Call", node, {
            expression: callable,
            args,
          });
        }
        if (details?.python_class) {
          // Any Python class can be mutated after construction, including
          // through aliased `setattr`, helpers, metaclasses, or imported code.
          // All class-level calls therefore require live descriptor lookup;
          // otherwise replacement of an instance, static, or class method by
          // an arbitrary descriptor could retain a stale binding mode.
          return this.make("AST_Call", node, {
            expression: this.make("AST_Call", functionNode, {
              expression: this.make("AST_SymbolRef", functionNode, {
                name: "ρσ_getattr_internal",
              }),
              args: [
                this.lowerExpression(ownerNode),
                this.make("AST_String", functionNode, { value: method }),
                this.make("AST_SymbolRef", functionNode, {
                  name: "ρσ_getattr_missing",
                }),
              ],
            }),
            args,
          });
        }
        if (!staticMethod && !classvar && hasKeywordArguments) {
          return this.make("AST_Call", node, {
            expression: callable,
            args,
          });
        }
        return this.make("AST_ClassCall", node, {
          class: this.lowerExpression(ownerNode),
          method,
          static: staticMethod,
          classvar: false,
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
    if (callableName === "ρσ_native_get" && args.length === 2) {
      return this.make("AST_Sub", node, {
        expression: args[0], property: args[1], native_access: true,
      });
    }
    const inferredType = new Set([
      "BigInt",
      "ρσ_bigint_divexact",
      "ρσ_bigint_gcd",
      "ρσ_integer_bigint",
    ]).has(callableName ?? "") ? "bigint" : undefined;
    const call = this.make("AST_Call", node, {
      expression: callable,
      direct_call: callable.intrinsic_call === true || inferredType !== undefined,
      inferred_type: inferredType,
      args,
    });
    if (
      functionNode.type === "identifier" &&
      ["dir", "globals", "locals", "vars"].includes(functionNode.text) &&
      !this.namespaceBuiltinIsLexicallyShadowed(functionNode.text)
    ) {
      call.namespace_builtin = true;
    }
    return call;
  }

  /** Mark the object-shaped metadata consumed directly by native Object APIs. */
  private markNativeObjectLiteral(value: any, descriptorMap = false): void {
    if (!(value instanceof this.compiler.AST_Object)) return;
    value.is_pydict = false;
    value.is_jshash = false;
    if (!descriptorMap) return;
    for (const property of value.properties ?? []) {
      if (property.value instanceof this.compiler.AST_Object) {
        property.value.is_pydict = false;
        property.value.is_jshash = false;
      }
    }
  }

  private lowerSubscript(node: SyntaxNode): any {
    const value = this.lowerExpression(this.field(node, "value"));
    const parts = significantChildren(node).slice(1);
    if (!parts.length) throw new UnsupportedPythonCstNode(node, "empty index");
    const sliceNodes = (part: SyntaxNode): Array<SyntaxNode | null> => {
      const colons = part.children.filter((child) => child.text === ":");
      const values = significantChildren(part);
      const boundaries = [
        part.startIndex,
        ...colons.map((colon) => colon.startIndex),
        part.endIndex,
      ];
      const slots: Array<SyntaxNode | null> = [];
      for (let index = 0; index < boundaries.length - 1; index += 1) {
        slots.push(values.find((candidate) =>
          candidate.startIndex >= boundaries[index] &&
          candidate.endIndex <= boundaries[index + 1]
        ) ?? null);
      }
      while (slots.length < 3) slots.push(null);
      return slots;
    };
    const lowerPythonPart = (part: SyntaxNode): any => {
      if (part.type !== "slice") return this.lowerExpression(part);
      const slots = sliceNodes(part).map((child) =>
        child
          ? this.lowerExpression(child)
          : this.make("AST_Null", part));
      return this.make("AST_New", part, {
        expression: this.make("AST_SymbolRef", part, { name: "slice" }),
        args: slots,
      });
    };
    const overloadGetitem = !!(
      this.currentToplevel?.scoped_flags?.overload_getitem ??
      this.options.scoped_flags?.overload_getitem
    );
    if (!overloadGetitem) {
      const slicePart = parts.find((part) => part.type === "slice");
      if (slicePart && parts.length === 1) {
        const [lowerNode, upperNode, stepNode] = sliceNodes(slicePart);
        const lower = lowerNode
          ? this.lowerExpression(lowerNode)
          : this.make("AST_Number", slicePart, { value: 0 });
        const upper = upperNode ? this.lowerExpression(upperNode) : null;
        if (stepNode) {
          const args = [
            value,
            this.lowerExpression(stepNode),
          ];
          if (lowerNode) args.push(lower);
          else if (upper) {
            args.push(this.make("AST_Undefined", slicePart));
          }
          if (upper) args.push(upper);
          return this.make("AST_Call", node, {
            expression: this.make("AST_SymbolRef", slicePart, {
              name: "ρσ_eslice",
            }),
            args,
          });
        }
        const parent = node.parent;
        const assignmentTarget = parent?.type === "assignment" &&
          parent.childForFieldName("left")?.id === node.id;
        if (assignmentTarget) {
          return this.make("AST_Splice", node, {
            expression: value,
            property: lower,
            property2: upper,
            assignment: null,
          });
        }
        const args = [lower];
        if (upper) args.push(upper);
        return this.make("AST_Call", node, {
          expression: this.make("AST_Dot", node, {
            expression: value,
            property: "slice",
          }),
          args,
        });
      }
      const loweredParts = parts.map((part) => this.lowerExpression(part));
      const property = loweredParts.length === 1
        ? loweredParts[0]
        : this.make("AST_Array", node, { elements: loweredParts });
      return this.make("AST_Sub", node, { expression: value, property });
    }
    const loweredParts = parts.map(lowerPythonPart);
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
    const parts: any[] = [];
    const flushProperties = (): void => {
      if (!properties.length) return;
      parts.push(this.make("AST_Object", node, {
        properties: properties.splice(0),
        is_pydict: true,
        is_jshash: false,
      }));
    };
    for (const child of significantChildren(node)) {
      if (child.type === "dictionary_splat") {
        flushProperties();
        parts.push(this.lowerExpression(significantChildren(child)[0]));
        continue;
      }
      if (child.type !== "pair") {
        throw new UnsupportedPythonCstNode(child);
      }
      properties.push(this.make("AST_ObjectKeyVal", child, {
        key: this.lowerExpression(this.field(child, "key")),
        value: this.lowerExpression(this.field(child, "value")),
        quoted: true,
      }));
    }
    if (parts.length) {
      flushProperties();
      const args = parts;
      (args as any).kwargs = [];
      (args as any).kwarg_items = [];
      (args as any).starargs = false;
      return this.make("AST_Call", node, {
        expression: this.make("AST_SymbolRef", node, {
          name: "ρσ_dict_unpack",
        }),
        direct_call: false,
        args,
      });
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
