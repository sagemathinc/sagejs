const DIRECT_BUILTIN_CALLS = new Set([
  "divmod",
  "float",
  "int",
  "len",
  "list",
  "ord",
  "range",
  "sum",
]);

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Syntax-independent semantic finalization for directly lowered Python ASTs.
 *
 * The historical parser discovered bindings and marked optimized calls while
 * consuming tokens.  Keeping those operations here makes them independently
 * testable and lets the Tree-sitter lowerer remain a mechanical CST mapping.
 */
export class PythonAstSemanticAnalyzer {
  constructor(private readonly compiler: any) {}

  private is(value: any, constructorName: string): boolean {
    const Constructor = this.compiler[constructorName];
    return typeof Constructor === "function" && value instanceof Constructor;
  }

  analyze(toplevel: any): any {
    const shellExports = (toplevel.exports ?? []).map((symbol) => symbol.name);
    this.analyzeNestedScopes(toplevel.body, []);
    const topAssignments = this.scanLocalNames(toplevel.body, false);
    const nestedGlobals = this.scanNestedGlobals(toplevel.body);
    const deletedGlobals = this.scanNestedDeletedGlobals(toplevel.body);
    this.markDirectBuiltins(toplevel.body, topAssignments);
    if (topAssignments.includes("range")) {
      this.disableBuiltinRange(toplevel.body);
    }
    const nonlocals = new Set(this.scanDeclaredNames(toplevel.body));
    const callables = this.topLevelCallableBindings(toplevel.body);
    toplevel.nonlocalvars = [...nonlocals];
    toplevel.annotated_locals = unique([
      ...this.scanAnnotatedNames(toplevel.body),
      ...deletedGlobals,
    ]);
    this.walk(toplevel.body, (node) => {
      if (node instanceof this.compiler.AST_Lambda) {
        const guarded = (node.declared_globals ?? []).filter(
          (name) => deletedGlobals.includes(name),
        );
        node.annotated_locals = unique([
          ...(node.annotated_locals ?? []),
          ...guarded,
        ]);
      }
      return false;
    });
    toplevel.localvars = unique([...topAssignments, ...nestedGlobals])
      .filter((name) => !nonlocals.has(name))
      .map((name) => new this.compiler.AST_SymbolVar({ name }));
    const exported = unique([
      ...shellExports,
      ...topAssignments,
      ...nestedGlobals,
      ...callables,
    ])
      .filter((name) => !nonlocals.has(name));
    toplevel.exports = exported.map(
      (name) => new this.compiler.AST_SymbolVar({ name }),
    );
    toplevel.classes = Object.create(null);
    for (const statement of toplevel.body ?? []) {
      if (statement instanceof this.compiler.AST_Class) {
        toplevel.classes[statement.name.name] = statement;
      }
    }
    toplevel.baselib ??= Object.create(null);
    this.walk(toplevel.body, (node) => {
      if (node instanceof this.compiler.AST_Yield) toplevel.baselib.yield = true;
      return false;
    });
    return toplevel;
  }

  private walk(value: any, visitor: (node: any) => boolean | void): void {
    const seen = new Set<any>();
    const ignored = new Set([
      "start", "end", "scope", "thedef", "imports", "globals", "baselib",
      "body", // handled explicitly below so classes' `statements` do not duplicate it
    ]);
    const descend = (current: any): void => {
      if (!current || typeof current !== "object" || seen.has(current)) return;
      seen.add(current);
      if (Array.isArray(current)) {
        for (const item of current) descend(item);
        for (const key of ["kwonly", "starargs", "kwargs", "defaults"]) {
          descend(current[key]);
        }
        return;
      }
      if (!(current instanceof this.compiler.AST_Node)) return;
      if (visitor(current)) return;
      if (current.body) descend(current.body);
      for (const [key, child] of Object.entries(current)) {
        if (ignored.has(key) || typeof child === "function") continue;
        descend(child);
      }
    };
    descend(value);
  }

  private analyzeNestedScopes(
    body: any[],
    enclosingFunctionBindings: ReadonlySet<string>[],
  ): void {
    for (const statement of body ?? []) {
      if (statement instanceof this.compiler.AST_Class) {
        this.analyzeClass(statement, enclosingFunctionBindings);
      } else if (statement instanceof this.compiler.AST_Lambda) {
        this.analyzeFunction(statement, enclosingFunctionBindings);
      } else {
        this.walk(statement, (node) => {
          if (node instanceof this.compiler.AST_Class) {
            this.analyzeClass(node, enclosingFunctionBindings);
            return true;
          }
          if (node instanceof this.compiler.AST_Lambda) {
            this.analyzeFunction(node, enclosingFunctionBindings);
            return true;
          }
          return false;
        });
      }
    }
  }

  private analyzeFunction(
    definition: any,
    enclosingFunctionBindings: ReadonlySet<string>[],
  ): void {
    const body = Array.isArray(definition.body) ? definition.body : [];
    const assignments = this.scanLocalNames(body);
    const parameters = this.parameterNames(definition.argnames);
    const globals = new Set<string>(definition.declared_globals ?? []);
    const nonlocals = new Set<string>(definition.declared_nonlocals ?? []);
    for (const name of parameters) {
      if (globals.has(name)) {
        throw new SyntaxError(`name '${name}' is parameter and global`);
      }
      if (nonlocals.has(name)) {
        throw new SyntaxError(`name '${name}' is parameter and nonlocal`);
      }
    }
    for (const name of nonlocals) {
      if (globals.has(name)) {
        throw new SyntaxError(`name '${name}' is nonlocal and global`);
      }
      if (!enclosingFunctionBindings.some((bindings) => bindings.has(name))) {
        throw new SyntaxError(`no binding for nonlocal '${name}' found`);
      }
    }
    const ownBindings = new Set(unique([
      ...assignments,
      ...this.scanCallableBindings(body),
      ...parameters,
    ]).filter((name) => !globals.has(name) && !nonlocals.has(name)));
    this.analyzeNestedScopes(
      body,
      [...enclosingFunctionBindings, ownBindings],
    );
    definition.localvars = assignments
      .filter((name) => !parameters.includes(name))
      .filter((name) => !globals.has(name) && !nonlocals.has(name))
      .map((name) => new this.compiler.AST_SymbolVar({ name }));
    definition.annotated_locals = unique([
      ...(definition.annotated_locals ?? []),
      ...this.scanAnnotatedNames(body),
      // A global/nonlocal cell may be deleted or unbound by the defining
      // scope, so reads through either declaration require the same runtime
      // NameError guard as local annotated/deleted variables.
      ...nonlocals,
    ]);
    for (const name of this.scanPotentiallyUnbound(
      body,
      definition.localvars.map((symbol) => symbol.name),
    )) {
      if (!definition.annotated_locals.includes(name)) {
        definition.annotated_locals.push(name);
      }
    }
    definition.scope_bindings = unique([
      ...assignments,
      ...this.scanCallableBindings(body),
      ...parameters,
    ]).filter((name) => !globals.has(name) && !nonlocals.has(name));
    const shadowed = new Set([
      ...assignments,
      ...parameters,
    ].filter((name) => DIRECT_BUILTIN_CALLS.has(name)));
    this.markDirectBuiltins(body, shadowed);
    if (shadowed.has("range")) this.disableBuiltinRange(body);
  }

  private analyzeClass(
    definition: any,
    enclosingFunctionBindings: ReadonlySet<string>[],
  ): void {
    const body = definition.body ?? definition.statements ?? [];
    for (const statement of body) {
      if (statement instanceof this.compiler.AST_Method) {
        this.analyzeFunction(statement, enclosingFunctionBindings);
      } else if (statement instanceof this.compiler.AST_Class) {
        this.analyzeClass(statement, enclosingFunctionBindings);
      }
    }
    definition.localvars ??= [];
    definition.annotated_locals = unique([
      ...(definition.annotated_locals ?? []),
      ...this.scanAnnotatedNames(body),
    ]);
  }

  private parameterNames(args: any): string[] {
    if (!args) return [];
    return [
      ...args,
      ...(args.kwonly ?? []),
      ...(args.starargs ? [args.starargs] : []),
      ...(args.kwargs ? [args.kwargs] : []),
    ].map((argument) => argument.name);
  }

  private addTarget(target: any, names: string[]): void {
    if (!target) return;
    if (target instanceof this.compiler.AST_SymbolRef) {
      names.push(target.name);
      return;
    }
    if (target instanceof this.compiler.AST_Seq) {
      names.push("ρσ_unpack");
      for (const value of target.to_array()) this.addTarget(value, names);
      return;
    }
    if (target instanceof this.compiler.AST_Array) {
      names.push("ρσ_unpack");
      for (const value of target.elements) this.addTarget(value, names);
    }
  }

  private scanLocalNames(
    body: any[],
    includePureAnnotations = true,
  ): string[] {
    const names: string[] = [];
    const scan = (value: any): void => {
      if (!value) return;
      if (Array.isArray(value)) {
        for (const statement of value) {
          if (statement instanceof this.compiler.AST_Scope) continue;
          for (const key of ["body", "alternative", "bcatch", "bfinally", "condition"]) {
            const nested = statement[key];
            if (nested) scan(nested);
          }
          if (statement instanceof this.compiler.AST_ForIn) {
            this.addTarget(statement.init, names);
          } else if (statement instanceof this.compiler.AST_With) {
            names.push("ρσ_with_exception", "ρσ_with_suppress");
            for (const clause of statement.clauses ?? []) {
              if (clause.alias) names.push(clause.alias.name);
            }
          }
        }
        return;
      }
      if (value instanceof this.compiler.AST_Scope) return;
      if (this.is(value, "AST_AnnotatedAssignment")) {
        if (includePureAnnotations || value.value) {
          this.addTarget(value.target, names);
        }
        if (value.value) scan(value.value);
        return;
      }
      if (value instanceof this.compiler.AST_Assign) {
        this.addTarget(value.left, names);
        if (!(value.right instanceof this.compiler.AST_Scope)) scan(value.right);
        return;
      }
      if (value instanceof this.compiler.AST_ForIn) {
        this.addTarget(value.init, names);
        return;
      }
      if (value.body) {
        scan(value.body);
        if (value.alternative) scan(value.alternative);
      }
    };
    scan(body);
    // Walrus assignments can appear inside arbitrary expressions.
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Scope) return true;
      if (node instanceof this.compiler.AST_Assign && node.is_walrus) {
        this.addTarget(node.left, names);
      }
      return false;
    });
    return unique(names);
  }

  private scanNestedGlobals(body: any[]): string[] {
    const names: string[] = [];
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Lambda) {
        names.push(...(node.declared_globals ?? []));
      }
      return false;
    });
    return unique(names);
  }

  private scanNestedDeletedGlobals(body: any[]): string[] {
    const names: string[] = [];
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Lambda) {
        const deleted = new Set(this.scanAnnotatedNames(node.body ?? []));
        for (const name of node.declared_globals ?? []) {
          if (deleted.has(name)) names.push(name);
        }
      }
      return false;
    });
    return unique(names);
  }

  private topLevelCallableBindings(body: any[]): string[] {
    const names: string[] = [];
    for (const statement of body ?? []) {
      if (statement instanceof this.compiler.AST_Scope && statement.name?.name) {
        names.push(statement.name.name);
      }
    }
    return unique(names);
  }

  private scanDeclaredNames(body: any[]): string[] {
    const names: string[] = [];
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Scope) return true;
      if (node instanceof this.compiler.AST_Var) {
        for (const definition of node.definitions ?? []) {
          if (definition.name?.name) names.push(definition.name.name);
        }
      }
      return false;
    });
    return unique(names);
  }

  private scanPotentiallyUnbound(body: any[], localNames: string[]): string[] {
    const locals = new Set(localNames);
    const bound = new Set<string>();
    const uncertain: string[] = [];
    const seenObjects = new Set<any>();
    const add = (name: string) => {
      if (!uncertain.includes(name)) uncertain.push(name);
    };
    const bind = (target: any): void => {
      const names: string[] = [];
      this.addTarget(target, names);
      for (const name of names) if (name !== "ρσ_unpack") bound.add(name);
    };
    const snapshot = () => new Set(bound);
    const restore = (state: Set<string>) => {
      bound.clear();
      for (const name of state) bound.add(name);
    };
    const intersect = (left: Set<string>, right: Set<string>) => {
      bound.clear();
      for (const name of left) if (right.has(name)) bound.add(name);
    };
    const visit = (node: any): void => {
      if (!node || typeof node !== "object") return;
      if (node instanceof this.compiler.AST_Scope) return;
      if (seenObjects.has(node)) return;
      seenObjects.add(node);
      if (Array.isArray(node)) {
        for (const child of node) visit(child);
        return;
      }
      if (node instanceof this.compiler.AST_Assign) {
        if (node.operator !== "=") visit(node.left);
        visit(node.right);
        bind(node.left);
        return;
      }
      if (this.is(node, "AST_AnnotatedAssignment")) {
        visit(node.annotation);
        if (node.value) {
          visit(node.value);
          bind(node.target);
        }
        return;
      }
      if (node instanceof this.compiler.AST_If) {
        visit(node.condition);
        const before = snapshot();
        visit(node.body);
        const consequent = snapshot();
        restore(before);
        if (node.alternative) visit(node.alternative);
        const alternative = node.alternative ? snapshot() : before;
        intersect(consequent, alternative);
        return;
      }
      if (node instanceof this.compiler.AST_ForIn) {
        visit(node.object);
        const before = snapshot();
        bind(node.init);
        visit(node.body);
        restore(before);
        if (node.alternative) visit(node.alternative);
        restore(before);
        return;
      }
      if (node instanceof this.compiler.AST_While) {
        visit(node.condition);
        const before = snapshot();
        visit(node.body);
        restore(before);
        if (node.alternative) visit(node.alternative);
        restore(before);
        return;
      }
      if (
        node instanceof this.compiler.AST_SymbolRef &&
        locals.has(node.name) &&
        !bound.has(node.name)
      ) add(node.name);
      const ignored = new Set(["start", "end", "scope", "thedef"]);
      for (const [key, value] of Object.entries(node)) {
        if (ignored.has(key) || typeof value === "function") continue;
        visit(value);
      }
    };
    visit(body);
    return uncertain;
  }

  private scanCallableBindings(body: any[]): string[] {
    const names: string[] = [];
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Scope) {
        if (node.name?.name) names.push(node.name.name);
        return true;
      }
      return false;
    });
    return unique(names);
  }

  private scanAnnotatedNames(body: any[]): string[] {
    const names: string[] = [];
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Scope) return true;
      if (
        this.is(node, "AST_AnnotatedAssignment") &&
        node.target instanceof this.compiler.AST_SymbolRef
      ) names.push(node.target.name);
      if (
        node instanceof this.compiler.AST_UnaryPrefix &&
        node.operator === "delete"
      ) this.addTarget(node.expression, names);
      if (node instanceof this.compiler.AST_Except && node.argname) {
        names.push(node.argname.name);
      }
      return false;
    });
    return unique(names.filter((name) => name !== "ρσ_unpack"));
  }

  private markDirectBuiltins(body: any[], shadowedNames: Iterable<string>): void {
    const shadowed = new Set(shadowedNames);
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Scope) return true;
      if (
        node instanceof this.compiler.AST_Call &&
        node.expression instanceof this.compiler.AST_SymbolRef &&
        DIRECT_BUILTIN_CALLS.has(node.expression.name)
      ) node.direct_call = !shadowed.has(node.expression.name);
      return false;
    });
  }

  private disableBuiltinRange(body: any[]): void {
    this.walk(body, (node) => {
      if (node instanceof this.compiler.AST_Scope) return true;
      if (node instanceof this.compiler.AST_ForIn) node.builtin_range = false;
      return false;
    });
  }
}
