"use strict";

// Workspace bundles are lexical aliases, not another resident representation.
// Flatten their parameters/projections before ordinary typed lowering, leaving
// each original owner's type and lifetime checks in force. Construction emits
// a validation-only AST node so even an unused bundle must borrow live owners.
const kind = node => node?.constructor?.name;
const list = value => Array.from(value || []);
const name = node => node?.name ?? node?.value;
const isBundleClass = node => kind(node) === "AST_Class" &&
  list(node.bases).length === 1 && name(node.bases[0]) === "NativeWorkspace";
const fail = (file, message) => { throw Error(`native workspace: ${file}: ${message}`); };
const requireThat = (condition, file, message) => { if (!condition) fail(file, message); };
const clone = (node, changes) => Object.assign(Object.create(Object.getPrototypeOf(node)), node, changes);
const positionalOnly = node => list(node.kwargs).length === 0 &&
  list(node.args?.kwargs).length === 0 && list(node.args?.kwarg_items).length === 0 &&
  !node.args?.starargs;

function prepareWorkspaceBundles(topLevel, compiler, resources, filename) {
  const schemas = new Map();
  for (const node of topLevel.filter(isBundleClass)) {
    const fields = [];
    requireThat(list(node.decorators).length === 0, filename, "workspace classes cannot have decorators");
    for (const statement of list(node.body)) {
      const field = statement.body;
      if (kind(field) === "AST_String") continue;
      requireThat(kind(field) === "AST_AnnotatedAssignment" &&
        kind(field.target) === "AST_SymbolRef" && field.value == null,
      filename, "workspace classes contain only required annotated fields");
      const type = name(field.annotation);
      requireThat(!name(field.target).startsWith("_"), filename,
        "workspace field names cannot start with underscore");
      requireThat(type === "NativeIntegerVector" ||
        (resources.has(type) && resources.get(type).ownership === "owned"),
      filename, `unsupported workspace field ${name(node.name)}.${name(field.target)}: ${type}`);
      requireThat(!fields.some(item => item.name === name(field.target)), filename, "duplicate workspace field");
      fields.push({ name: name(field.target), type, annotation: field.annotation });
    }
    requireThat(fields.length > 0, filename, "workspace must have fields");
    const schemaName = name(node.name);
    requireThat(!schemas.has(schemaName), filename, "duplicate workspace schema");
    schemas.set(schemaName, { name: schemaName, fields });
  }
  const functions = topLevel.filter(node => kind(node) === "AST_Function");
  const checkShadow = target => {
    if (!target || typeof target !== "object") return;
    if (["AST_SymbolRef", "AST_SymbolAlias"].includes(kind(target))) {
      requireThat(!schemas.has(target.name) && target.name !== "NativeWorkspace", filename,
        "workspace schema names cannot be shadowed by value bindings");
    }
    for (const key of ["elements", "car", "cdr"]) {
      if (Array.isArray(target[key])) target[key].forEach(checkShadow);
      else if (target[key]) checkShadow(target[key]);
    }
  };
  const checkBindings = node => {
    if (kind(node) === "AST_Assign") checkShadow(node.left);
    if (kind(node) === "AST_AnnotatedAssignment") checkShadow(node.target);
    if (kind(node) === "AST_ForIn") checkShadow(node.init);
    if (kind(node) === "AST_With") list(node.clauses).forEach(clause => checkShadow(clause.alias));
    if (kind(node) === "AST_Import") {
      checkShadow(node.alias);
      for (const arg of list(node.argnames)) {
        const binding = name(arg.alias) || name(arg);
        const nativeBaseImport = node.key === "sagejs.native" && !node.level &&
          name(arg) === "NativeWorkspace" && binding === "NativeWorkspace";
        requireThat(nativeBaseImport || (!schemas.has(binding) && binding !== "NativeWorkspace"),
          filename, "workspace schema names cannot be shadowed by imports");
      }
    }
  };
  const visitChildren = (node, visit) => {
    for (const [key, value] of Object.entries(node)) {
      if (!["start", "end", "scope", "parent_scope", "thedef"].includes(key) && value && typeof value === "object") {
        if (Array.isArray(value)) value.forEach(visit);
        else if (kind(value)?.startsWith("AST_")) visit(value);
      }
    }
  };
  if (schemas.size) {
    const visitModule = node => {
      if (!node || typeof node !== "object") return;
      if (["AST_Function", "AST_Class"].includes(kind(node))) {
        requireThat(isBundleClass(node) || (!schemas.has(name(node.name)) && name(node.name) !== "NativeWorkspace"),
          filename, "workspace schema names cannot be shadowed by definitions");
        return; // Class/function bodies are separate Python binding scopes.
      }
      checkBindings(node);
      visitChildren(node, visitModule);
    };
    topLevel.forEach(visitModule);
  }
  const contracts = new Map(functions.map(fn => [name(fn.name), list(fn.argnames).map(arg =>
    ({ arg, schema: schemas.get(name(arg.annotation)) }))]));
  const symbol = (text, source) => new compiler.AST_SymbolRef({ name: text, start: source.start, end: source.end });
  const semanticKeys = ["expression", "property", "property2", "left", "right", "value",
    "condition", "target", "assignment", "car", "cdr", "args", "elements"];

  function lower(fn) {
    if (schemas.size === 0) return { fn, metadata: [] };
    const environment = new Map();
    const usedNames = new Set();
    const boundNames = new Set(list(fn.argnames).map(arg => arg.name));
    const metadata = [];
    const params = [];
    // Generated flattened names must not capture a user local or parameter.
    const visitNames = node => {
      if (!node || typeof node !== "object") return;
      // Python loop indices and context-manager aliases are local bindings,
      // just like assignment targets. They must not turn a runtime value into
      // a compile-time schema merely because the spelling matches its name.
      checkBindings(node);
      if (typeof node.name === "string") requireThat(!node.name.startsWith("sagejs_workspace_"),
        filename, "sagejs_workspace_ is reserved for flattened workspace bindings");
      visitChildren(node, visitNames);
    };
    visitNames(fn);
    for (const { arg, schema } of contracts.get(name(fn.name))) {
      requireThat(!schemas.has(arg.name) && arg.name !== "NativeWorkspace", filename,
        "workspace schema names cannot be shadowed by parameters");
      if (!schema) { params.push(arg); continue; }
      requireThat(arg.default_value == null, filename, "workspace parameters cannot have defaults");
      const members = schema.fields.map(field => {
        const memberName = `sagejs_workspace_${arg.name}__${field.name}`;
        params.push(clone(arg, { name: memberName, annotation: field.annotation }));
        return symbol(memberName, arg);
      });
      environment.set(arg.name, { schema, members });
      usedNames.add(arg.name);
      metadata.push({ kind: "parameter", name: arg.name, schema: schema.name,
        members: schema.fields.map((field, i) => ({ name: field.name, type: field.type, binding: members[i].name })) });
    }
    requireThat(!schemas.has(name(fn.return_annotation)), filename, "workspace bundles cannot escape through returns");

    function expression(node, env) {
      if (!node || typeof node !== "object") return node;
      if (Array.isArray(node)) {
        const result = node.map(item => expression(item, env));
        // Call argument lists carry named/starred arguments on the array.
        // Do not erase those effects or validation inputs during projection.
        for (const key of ["kwargs", "kwarg_items", "starargs"]) {
          if (Object.hasOwn(node, key)) result[key] = expression(node[key], env);
        }
        return result;
      }
      if (kind(node) === "AST_Dot" && env.has(name(node.expression))) {
        const entry = env.get(name(node.expression));
        const index = entry.schema.fields.findIndex(field => field.name === node.property);
        requireThat(index >= 0, filename, `unknown workspace field ${node.property}`);
        return clone(entry.members[index], { start: node.start, end: node.end });
      }
      if (kind(node) === "AST_SymbolRef" && (env.has(node.name) || usedNames.has(node.name))) {
        fail(filename, `workspace ${node.name} cannot escape or be used outside its lexical binding`);
      }
      if (["AST_Call", "AST_New"].includes(kind(node))) {
        requireThat(!schemas.has(name(node.expression)), filename, "workspace construction requires a local binding");
        const contract = contracts.get(name(node.expression));
        if (contract?.some(param => param.schema)) {
          requireThat(list(node.args).length === contract.length && positionalOnly(node),
            filename, "workspace calls require all positional arguments");
          const args = [];
          contract.forEach((param, index) => {
            if (!param.schema) { args.push(expression(node.args[index], env)); return; }
            const value = env.get(name(node.args[index]));
            requireThat(kind(node.args[index]) === "AST_SymbolRef" && value?.schema === param.schema,
              filename, "workspace call requires a live bundle of the declared schema");
            args.push(...value.members.map(member => clone(member, {})));
          });
          return clone(node, { args });
        }
      }
      const changes = {};
      for (const key of semanticKeys) if (node[key] && typeof node[key] === "object") {
        changes[key] = expression(node[key], env);
      }
      return Object.keys(changes).length ? clone(node, changes) : node;
    }

    function statements(nodes, env) {
      return list(nodes).map(statement => {
        const assignment = statement.body;
        const target = kind(assignment) === "AST_Assign" ? assignment.left : assignment?.target;
        const rhs = kind(assignment) === "AST_Assign" ? assignment.right : assignment?.value;
        if (kind(statement) === "AST_SimpleStatement" &&
            ["AST_Call", "AST_New"].includes(kind(rhs)) && schemas.has(name(rhs.expression))) {
          const schema = schemas.get(name(rhs.expression));
          requireThat(kind(target) === "AST_SymbolRef" && !usedNames.has(target.name) && !boundNames.has(target.name),
            filename, "workspace binding must be a new immutable local");
          requireThat(list(rhs.args).length === schema.fields.length && positionalOnly(rhs),
            filename, "workspace construction requires all positional fields");
          const members = list(rhs.args).map(arg => expression(arg, env));
          requireThat(members.every(member => kind(member) === "AST_SymbolRef"),
            filename, "workspace members must be existing borrowed owners");
          usedNames.add(target.name);
          boundNames.add(target.name);
          env.set(target.name, { schema, members });
          metadata.push({ kind: "binding", name: target.name, schema: schema.name,
            members: schema.fields.map((field, i) => ({ name: field.name, type: field.type, binding: members[i].name })) });
          return { constructor: { name: "AST_WorkspaceBind" }, start: statement.start, end: statement.end,
            members: members.map((member, i) => ({ expression: member, type: schema.fields[i].type })) };
        }
        if (kind(target) === "AST_Dot" && env.has(name(target.expression))) {
          fail(filename, "workspace fields are immutable bindings");
        }
        if (kind(target) === "AST_SymbolRef" && usedNames.has(target.name)) {
          fail(filename, "workspace binding cannot be reassigned");
        }
        if (kind(target) === "AST_SymbolRef" && [...env.values()].some(entry =>
          entry.members.some(member => member.name === target.name))) {
          fail(filename, "workspace owner binding cannot be reassigned while borrowed");
        }
        if (kind(target) === "AST_SymbolRef") boundNames.add(target.name);
        if (["AST_With", "AST_If", "AST_While", "AST_ForIn", "AST_For"].includes(kind(statement))) {
          const changes = {};
          for (const key of ["condition", "expression", "object", "init", "step"]) {
            if (statement[key]) changes[key] = expression(statement[key], env);
          }
          for (const key of ["body", "alternative"]) if (statement[key]) {
            const block = statement[key];
            changes[key] = Array.isArray(block) ? statements(block, new Map(env)) :
              kind(block) === "AST_BlockStatement" ? clone(block, { body: statements(block.body, new Map(env)) }) :
              statements([block], new Map(env))[0];
          }
          return clone(statement, changes);
        }
        if (kind(statement) === "AST_BlockStatement") return clone(statement, { body: statements(statement.body, new Map(env)) });
        // Expressions in simple statements/returns use `body`/`value`; keep
        // syntax nodes outside this supported numerical subset for lowering
        // to reject, rather than guessing how a bundle could escape through it.
        if (kind(statement) === "AST_SimpleStatement") return clone(statement, { body: expression(statement.body, env) });
        return expression(statement, env);
      });
    }
    const body = statements(fn.body, environment);
    return { fn: clone(fn, { argnames: params, body }), metadata };
  }
  return { schemas, lower, contracts };
}

module.exports = { isBundleClass, prepareWorkspaceBundles };
