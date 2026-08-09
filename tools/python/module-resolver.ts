import { dirname, join } from "path";

import type { Node as SyntaxNode } from "web-tree-sitter";

import { readResourceText } from "../resources";
import { sha1sum } from "../utils";
import type {
  PythonSyntaxFrontend,
  PythonSyntaxTree,
} from "./frontend";
import { PythonCstLowerer } from "./lowerer";

const INTRINSIC_MODULES = new Set(["sagejs", "sagejs.runtime"]);

interface ImportRequest {
  key: string;
  node: SyntaxNode;
}

function own(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function nullObject<T extends object = Record<string, any>>(): T {
  return Object.create(null) as T;
}

function safeRead(filename: string): string | undefined {
  try {
    return readResourceText(filename);
  } catch (_error) {
    return undefined;
  }
}

function cacheFileName(filename: string, cacheDirectory?: string): string {
  if (!cacheDirectory) return "";
  let key = filename.replaceAll("\\", "/");
  for (const character of '<>:"|?*') key = key.replaceAll(character, "-");
  key = `${key.replaceAll("/", "-")}.json`.replace(/^-+/, "");
  return join(cacheDirectory, key);
}

/**
 * Resolve Python modules and build the semantic top-level shells consumed by
 * the Tree-sitter CST lowerer.
 *
 * This is deliberately independent of the historical token parser.  It owns
 * the non-grammatical responsibilities that had accumulated there: import
 * discovery, package ordering, source/cache lookup, recursive compilation,
 * source signatures, and aggregation of runtime helpers.
 */
export class PythonModuleResolver {
  private readonly importedModules: Record<string, any>;
  private readonly importingModules: Record<string, boolean>;
  private readonly importDirectories: string[];
  private nextImportOrder: number;

  constructor(
    private readonly compiler: any,
    private readonly moduleSyntax: PythonSyntaxFrontend,
    private readonly options: Record<string, any>,
  ) {
    this.importedModules = options.imported_modules ?? nullObject();
    this.importingModules = options.importing_modules ?? nullObject();
    this.nextImportOrder = 0;
    for (const module of Object.values(this.importedModules)) {
      const order = Number((module as any)?.import_order);
      if (Number.isFinite(order)) this.nextImportOrder = Math.max(
        this.nextImportOrder, order + 1);
    }
    this.importDirectories = [];
    for (const location of [
      ...(options.import_dirs ?? []),
      options.basedir,
      options.libdir,
    ]) {
      if (location && !this.importDirectories.includes(location)) {
        this.importDirectories.push(location);
      }
    }
  }

  lowerMain(parsed: PythonSyntaxTree): any {
    const moduleId = this.options.module_id ?? "__main__";
    return this.lowerModule(parsed, {
      ...this.options,
      module_id: moduleId,
      filename: this.options.filename ?? "<input>",
    });
  }

  private lowerModule(
    parsed: PythonSyntaxTree,
    moduleOptions: Record<string, any>,
    sourceHash?: string,
  ): any {
    const moduleId = moduleOptions.module_id;
    if (this.importingModules[moduleId]) {
      return this.importedModules[moduleId];
    }
    this.importingModules[moduleId] = true;
    let completed = false;
    try {
      const scopedFlags = this.scopedFlags(parsed, moduleOptions);
      const importedModuleIds: string[] = [];
      const baselib = nullObject<Record<string, boolean>>();
      const resolvedImportKeys = new Map<number, string>();
      // Publish a package namespace before discovering its dependencies.
      // This mirrors Python's insertion into sys.modules before executing a
      // module and lets children refer to a partially initialized parent.
      // The static emitter still executes ordinary acyclic dependencies first;
      // the shell gives circular imports stable identity during lowering.
      const shell = this.createShell({
        moduleId,
        filename: moduleOptions.filename,
        scopedFlags,
        importedModuleIds,
        baselib,
      });
      this.importedModules[moduleId] = shell;
      for (const request of this.importRequests(
        parsed,
        moduleId,
        moduleOptions,
        resolvedImportKeys,
      )) {
        if (request.key === moduleId) {
          // A module may import itself (most visibly, ``import __main__``).
          // A temporary namespace gives lowering metadata without moving the
          // current module ahead of its dependencies in output order.
          this.importedModules[moduleId] ??= this.cachedStub(moduleId, {
            classes: {}, outputs: {}, exports: [], nonlocalvars: [], baselib: {},
            imported_module_ids: [],
          });
        } else {
          this.ensureImported(request.key, request.node, moduleOptions);
        }
        if (!importedModuleIds.includes(request.key)) {
          importedModuleIds.push(request.key);
        }
        for (const item of Object.keys(
          this.importedModules[request.key]?.baselib ?? {},
        )) baselib[item] = true;
      }

      let ast: any;
      try {
        ast = new PythonCstLowerer(this.compiler, parsed, {
          ...moduleOptions,
          scoped_flags: scopedFlags,
          resolved_import_keys: resolvedImportKeys,
        }).lowerModule(shell).ast;
      } catch (error) {
        if (error instanceof Error) {
          error.message = `${moduleOptions.filename}:${error.message}`;
        }
        throw error;
      }
      ast.filename = moduleOptions.filename;
      ast.module_id = moduleId;
      ast.imported_module_ids = importedModuleIds;
      // Completion order is a dependency-first topological order for ordinary
      // imports. Object-count ordering is insufficient once a parent shell is
      // published before its children, since several completions can otherwise
      // receive the same value.
      ast.import_order = this.nextImportOrder++;
      ast.imports = this.importedModules;
      ast.scoped_flags = scopedFlags;
      ast.srchash = sourceHash;
      ast.comments_after ??= [];
      this.importedModules[moduleId] = ast;
      completed = true;
      return ast;
    } finally {
      this.importingModules[moduleId] = false;
      if (!completed && this.importedModules[moduleId]?.body?.length === 0) {
        delete this.importedModules[moduleId];
      }
    }
  }

  private createShell({
    moduleId,
    filename,
    scopedFlags,
    importedModuleIds,
    baselib,
  }: {
    moduleId: string;
    filename: string;
    scopedFlags: Record<string, any>;
    importedModuleIds: string[];
    baselib: Record<string, boolean>;
  }): any {
    return new this.compiler.AST_Toplevel({
      globals: undefined,
      baselib,
      imports: this.importedModules,
      imported_module_ids: importedModuleIds,
      nonlocalvars: [],
      shebang: null,
      import_order: Number.MAX_SAFE_INTEGER,
      module_id: moduleId,
      exports: [],
      classes: nullObject(),
      filename,
      srchash: undefined,
      comments_after: [],
      localvars: [],
      annotated_locals: [],
      docstrings: [],
      body: [],
      start: null,
      end: null,
      scoped_flags: scopedFlags,
    });
  }

  private importRequests(
    parsed: PythonSyntaxTree,
    moduleId: string,
    moduleOptions: Record<string, any>,
    resolvedImportKeys: Map<number, string>,
  ): ImportRequest[] {
    const requests: ImportRequest[] = [];
    const visit = (node: SyntaxNode): void => {
      if (node.type === "import_statement") {
        for (const entry of node.childrenForFieldName("name")) {
          const nameNode = entry.type === "aliased_import"
            ? entry.childForFieldName("name")
            : entry;
          if (!nameNode) continue;
          const key = nameNode.text;
          this.validateIntrinsicImport(node, key, entry);
          resolvedImportKeys.set(nameNode.startIndex, key);
          if (!INTRINSIC_MODULES.has(key)) requests.push({ key, node });
        }
        return;
      }
      if (node.type === "import_from_statement") {
        const moduleNode = node.childForFieldName("module_name");
        if (!moduleNode) return;
        const spelling = moduleNode.text;
        const level = spelling.match(/^\.+/)?.[0].length ?? 0;
        const relativeName = spelling.slice(level);
        if (relativeName === "__python__" ||
            relativeName === "typing" && !moduleOptions.runtime_imports) return;
        if (INTRINSIC_MODULES.has(relativeName)) {
          throw this.importError(
            `Compiler intrinsic modules must be imported as modules: import ${relativeName} as runtime`,
            node,
            moduleOptions.filename,
          );
        }
        const key = this.absoluteModuleKey(
          moduleId,
          moduleOptions.filename,
          relativeName,
          level,
          node,
        );
        resolvedImportKeys.set(moduleNode.startIndex, key);
        requests.push({ key, node });
        // CPython's ``from package import name`` falls back to importing
        // ``package.name`` when name is a submodule.  Resolve that statically
        // when source is available, then the emitter binds the child on its
        // parent package exactly once.
        if (key) {
          for (const entry of node.childrenForFieldName("name")) {
            const nameNode = entry.type === "aliased_import"
              ? entry.childForFieldName("name")
              : entry;
            if (!nameNode || nameNode.text === "*") continue;
            const childKey = `${key}.${nameNode.text}`;
            if (this.findSource(childKey)) requests.push({ key: childKey, node });
          }
        }
        return;
      }
      if (
        node.type === "future_import_statement" ||
        node.type === "string" ||
        node.type === "concatenated_string" ||
        node.type === "comment"
      ) return;
      for (const child of node.namedChildren) visit(child);
    };
    visit(parsed.tree.rootNode);
    return requests;
  }

  private validateIntrinsicImport(
    statement: SyntaxNode,
    key: string,
    entry: SyntaxNode,
  ): void {
    if (!INTRINSIC_MODULES.has(key)) return;
    const alias = entry.type === "aliased_import"
      ? entry.childForFieldName("alias")
      : null;
    if (!alias) {
      throw this.importError(
        `Compiler intrinsic modules require an explicit alias: import ${key} as runtime`,
        statement,
        this.options.filename,
      );
    }
  }

  private absoluteModuleKey(
    moduleId: string,
    filename: string,
    relativeName: string,
    level: number,
    node: SyntaxNode,
  ): string {
    if (!level) return relativeName;
    const moduleParts = moduleId === "__main__" ? [] : moduleId.split(".");
    const packageParts = filename.replaceAll("\\", "/").endsWith("/__init__.py")
      ? moduleParts
      : moduleParts.slice(0, -1);
    const keep = packageParts.length - (level - 1);
    if (keep <= 0 || !packageParts.length) {
      // Keep enough spelling for the runtime __import__ hook.  The default
      // hook will still raise ImportError, while a user replacement (as in
      // CPython's builtins.__import__) receives the requested level.
      return relativeName;
    }
    return [...packageParts.slice(0, keep), ...relativeName.split(".").filter(Boolean)]
      .join(".");
  }

  private ensureImported(
    key: string,
    node: SyntaxNode,
    moduleOptions: Record<string, any>,
  ): void {
    if (own(this.importedModules, key)) return;
    if (moduleOptions.runtime_imports) {
      this.importedModules[key] = {
        is_cached: true,
        dynamic: true,
        classes: nullObject(),
        module_id: key,
        import_order: this.nextImportOrder++,
        exports: [],
        nonlocalvars: [],
        baselib: nullObject(),
        outputs: nullObject(),
        discard_asserts: !!moduleOptions.discard_asserts,
        imported_module_ids: [],
      };
      return;
    }
    if (this.importingModules[key]) {
      // A partially initialized namespace was installed by lowerModule.
      // Runtime code may observe it, matching Python's circular-import model.
      return;
    }

    const packageId = key.split(".").slice(0, -1).join(".");
    if (packageId) this.ensureImported(packageId, node, moduleOptions);

    if (moduleOptions.for_linting) {
      this.importedModules[key] = this.cachedStub(key, {
        classes: {}, outputs: {}, exports: [], nonlocalvars: [], baselib: {},
        imported_module_ids: [],
      });
      return;
    }

    const found = this.findSource(key);
    if (!found) {
      this.importedModules[key] = {
        is_cached: true,
        dynamic: true,
        classes: nullObject(),
        module_id: key,
        import_order: this.nextImportOrder++,
        exports: [],
        nonlocalvars: [],
        baselib: nullObject(),
        outputs: nullObject(),
        discard_asserts: !!moduleOptions.discard_asserts,
        imported_module_ids: [],
      };
      return;
    }

    const sourceHash = sha1sum(found.source);
    const cached = this.findCache(
      key,
      found.filename,
      sourceHash,
      moduleOptions,
    );
    if (cached) {
      // Publish cached metadata before walking its dependency list. Cached
      // modules can be mutually recursive just like source modules; delaying
      // publication until after dependencies makes A -> B -> A recurse
      // forever. Keep the temporary shell out of the final dependency order,
      // then replace it with the ordinary dependency-ordered cached stub.
      this.importedModules[key] = this.cachedStub(key, cached, false);
      let completed = false;
      try {
        for (const importedKey of cached.imported_module_ids ?? []) {
          this.ensureImported(importedKey, node, moduleOptions);
        }
        const stub = this.cachedStub(key, cached);
        stub.srchash = sourceHash;
        this.importedModules[key] = stub;
        completed = true;
      } finally {
        if (!completed) delete this.importedModules[key];
      }
      return;
    }

    const parsed = this.moduleSyntax.assertValid(found.source, found.filename);
    this.lowerModule(parsed, {
      ...moduleOptions,
      filename: found.filename,
      basedir: dirname(found.filename),
      module_id: key,
      jsage: false,
      exact_integer_literals: true,
      // Imported Python modules inherit the caller's semantic defaults.
      // Module-local ``from __python__ import ...`` directives are applied by
      // scopedFlags() on top of this copy, including explicit ``no_*`` flags.
      scoped_flags: Object.assign(
        nullObject(),
        moduleOptions.scoped_flags ?? {},
      ),
      classes: undefined,
    }, sourceHash);
  }

  private findSource(key: string): {
    source: string;
    filename: string;
  } | undefined {
    const modulePath = key.replaceAll(".", "/");
    for (const directory of this.importDirectories) {
      for (const filename of [
        join(directory, `${modulePath}.py`),
        join(directory, modulePath, "__init__.py"),
      ]) {
        const source = safeRead(filename);
        if (source !== undefined) return { source, filename };
      }
    }
    return undefined;
  }

  private findCache(
    key: string,
    filename: string,
    sourceHash: string,
    moduleOptions: Record<string, any>,
  ): any | undefined {
    const names = [cacheFileName(filename, moduleOptions.module_cache_dir)];
    if (moduleOptions.precompiled_module_cache_dir) {
      names.push(join(
        moduleOptions.precompiled_module_cache_dir,
        `${key.replaceAll(".", "-")}.json`,
      ));
    }
    for (const cacheName of names) {
      if (!cacheName) continue;
      try {
        const candidate = JSON.parse(readResourceText(cacheName));
        if (
          candidate.version === this.compiler.get_compiler_version() &&
          candidate.signature === sourceHash &&
          candidate.discard_asserts === !!moduleOptions.discard_asserts
        ) return candidate;
      } catch (_error) {}
    }
    return undefined;
  }

  private cachedStub(key: string, cached: any, assignOrder = true): any {
    return {
      is_cached: true,
      classes: cached.classes ?? nullObject(),
      outputs: cached.outputs ?? nullObject(),
      module_id: key,
      import_order: assignOrder ? this.nextImportOrder++ : -1,
      nonlocalvars: cached.nonlocalvars ?? [],
      baselib: cached.baselib ?? nullObject(),
      exports: cached.exports ?? [],
      discard_asserts: !!this.options.discard_asserts,
      imported_module_ids: cached.imported_module_ids ?? [],
    };
  }

  private scopedFlags(
    parsed: PythonSyntaxTree,
    moduleOptions: Record<string, any>,
  ): Record<string, any> {
    const flags = Object.assign(nullObject(), moduleOptions.scoped_flags ?? {});
    if (moduleOptions.jsage) {
      for (const name of ["exponent", "ellipses", "numbers", "overload_getitem"]) {
        flags[name] = true;
      }
    }
    const visit = (node: SyntaxNode): void => {
      if (node.type === "future_import_statement") {
        flags.annotations = "future";
        return;
      }
      if (
        node.type === "import_from_statement" &&
        node.childForFieldName("module_name")?.text === "__python__"
      ) {
        for (const entry of node.childrenForFieldName("name")) {
          const nameNode = entry.type === "aliased_import"
            ? entry.childForFieldName("name")
            : entry;
          if (!nameNode) continue;
          const enabled = !nameNode.text.startsWith("no_");
          const name = enabled ? nameNode.text : nameNode.text.slice(3);
          flags[name] = enabled;
        }
        return;
      }
      if (
        node.type === "string" || node.type === "concatenated_string" ||
        node.type === "comment"
      ) return;
      for (const child of node.namedChildren) visit(child);
    };
    visit(parsed.tree.rootNode);
    return flags;
  }

  private importError(
    message: string,
    node: SyntaxNode,
    filename?: string,
  ): any {
    return new this.compiler.ImportError(
      message,
      filename ?? this.options.filename,
      node.startPosition.row + 1,
      node.startPosition.column,
      node.startIndex,
      false,
    );
  }
}
