import { join } from "node:path";
import { runInThisContext } from "node:vm";

import { installNodeHost } from "./host";
import type { SageLanguageMode } from "./kernel-evaluator";
import {
  installPrecompiledTaskModuleLoader,
  readResourceBytes,
  readTaskRuntimeSource,
  runtimeRequire,
} from "./resources";
import { importPath, libraryPath } from "./utils";

interface CallableSpec {
  module?: string;
  name?: string;
  source: string;
  bindings?: Record<string, unknown>;
  moduleGlobals?: Record<string, string>;
  publishInModule?: boolean;
}

export interface TaskEvaluator {
  invoke(callable: CallableSpec, args: unknown[]): unknown;
  reconstruct(callable: CallableSpec): (...args: unknown[]) => unknown;
  close(): void;
}

/**
 * Create the small execution realm used by multiprocessing workers.
 *
 * Task workers receive JavaScript which the parent compiler has already
 * produced. They need the Sage.js baselib and native-library bridge, but not a
 * second Python parser/compiler. Avoiding that compiler boot is important for
 * short parallel scripts and keeps this boundary usable by standalone SEAs.
 */
export function createTaskEvaluator({
  mode,
  onOutput,
}: {
  mode: SageLanguageMode;
  onOutput(text: string): void;
}): TaskEvaluator {
  global.require = runtimeRequire as NodeJS.Require;
  // The lightweight task runtime does not pass through runRuntimeBootstrap,
  // so install the same collision-proof intrinsic that full Sage.js sessions
  // expose.  Strict baselib modules use this name instead of the public
  // ``require`` binding, which user code is allowed to shadow.
  global.__sagejs_runtime_require__ = runtimeRequire;
  global.__sagejs_graph_database_bytes__ = () =>
    readResourceBytes(join(importPath, "sage", "graphs", "data", "graphs.db"));
  const uninstallNodeHost = installNodeHost(globalThis, mode);
  global.__sagejs_output_write__ = (text: unknown) => onOutput(String(text));
  global.__sagejs_sage_mode__ = mode === "sage";
  runInThisContext(
    readTaskRuntimeSource(join(libraryPath, "task-runtime.js")),
    { filename: "<multiprocessing-baselib>" },
  );
  installPrecompiledTaskModuleLoader();
  delete global.__sagejs_sage_mode__;
  runInThisContext('var __name__ = "__multiprocessing__"; show_js = false;');

  const runtimeModules = Reflect.get(globalThis, "ρσ_modules") as
    | Record<string, Record<string, unknown>>
    | undefined;
  const workerMain = runtimeModules?.__main__;
  if (workerMain !== null && typeof workerMain === "object") {
    Reflect.set(workerMain, "__name__", "__multiprocessing__");
  }

  const callableCache = new Map<string, (...args: unknown[]) => unknown>();

  function ensureCallableModule(callable: CallableSpec): void {
    const moduleName = callable.module;
    const authorized = Reflect.get(
      globalThis,
      "__sagejs_precompiled_task_modules__",
    );
    if (
      !Array.isArray(authorized) ||
      typeof moduleName !== "string" ||
      moduleName === "__main__" ||
      moduleName === "__multiprocessing__"
    ) return;
    const registry = Reflect.get(globalThis, "ρσ_modules") as
      | Record<string, unknown>
      | undefined;
    const baselib = Reflect.get(
      globalThis,
      "__sagejs_baselib_modules__",
    ) as Record<string, unknown> | undefined;
    if (
      (registry && Object.hasOwn(registry, moduleName)) ||
      (baselib && Object.hasOwn(baselib, moduleName))
    ) return;
    const loader = Reflect.get(globalThis, "__sagejs_load_module__");
    if (typeof loader !== "function") {
      throw new Error("precompiled multiprocessing module loader is unavailable");
    }
    // The loader owns the exact allowlist and returns Python ImportError for
    // unknown module identities. Do this before creating a namespace from
    // serialized source so an uncompiled module cannot bypass the boundary.
    Reflect.apply(loader, undefined, [moduleName]);
  }

  function reconstruct(callable: CallableSpec): (...args: unknown[]) => unknown {
    ensureCallableModule(callable);
    const bindings = callable.bindings ?? {};
    const names = Object.keys(bindings);
    const moduleGlobals = callable.moduleGlobals ?? {};
    for (const [emittedName, pythonName] of Object.entries(moduleGlobals)) {
      if (
        !/^[$_\p{ID_Start}][$\u200c\u200d_\p{ID_Continue}]*$/u.test(emittedName) ||
        typeof pythonName !== "string"
      ) throw new TypeError("invalid compiled module-global metadata");
    }
    const moduleName = callable.module ?? "__main__";
    const registry = Reflect.get(globalThis, "ρσ_modules") as
      | Record<string, Record<string, unknown>>
      | undefined;
    const moduleNamespace = registry?.[moduleName] ??
      (registry
        ? registry[moduleName] = Object.create(null)
        : Object.create(null));
    for (const [emittedName, pythonName] of Object.entries(moduleGlobals)) {
      if (
        !Object.hasOwn(moduleNamespace, pythonName) &&
        Object.hasOwn(bindings, emittedName)
      ) Reflect.set(moduleNamespace, pythonName, bindings[emittedName]);
    }
    const globalScope = new Proxy(Object.create(null), {
      has(_target, name) {
        return typeof name === "string" && Object.hasOwn(moduleGlobals, name);
      },
      get(_target, name) {
        if (name === Symbol.unscopables) return undefined;
        if (typeof name !== "string" || !Object.hasOwn(moduleGlobals, name)) {
          return undefined;
        }
        const pythonName = moduleGlobals[name];
        const value = Reflect.get(moduleNamespace, pythonName);
        if (value === undefined) {
          const builtin = Reflect.get(globalThis, "ρσ_resolve_module_name");
          if (typeof builtin === "function") {
            return Reflect.apply(builtin, undefined, [
              undefined,
              pythonName,
              moduleNamespace,
              registry?.builtins ?? globalThis,
            ]);
          }
        }
        return value;
      },
      set(_target, name, value) {
        if (typeof name !== "string" || !Object.hasOwn(moduleGlobals, name)) {
          return false;
        }
        return Reflect.set(moduleNamespace, moduleGlobals[name], value);
      },
    });
    const factory = runInThisContext(
      `(function(${[...names, "__sagejs_module_scope__"].join(",")}) { ` +
        `with (__sagejs_module_scope__) return (${callable.source}); })`,
      { filename: "<multiprocessing-callable>" },
    ) as (...values: unknown[]) => (...args: unknown[]) => unknown;
    const value = Reflect.apply(
      factory,
      undefined,
      [...names.map((name) => bindings[name]), globalScope],
    );
    if (callable.publishInModule === true) {
      if (
        typeof callable.name !== "string" ||
        !/^[_\p{ID_Start}][\u200c\u200d_\p{ID_Continue}]*$/u.test(callable.name) ||
        typeof callable.module !== "string" ||
        callable.module.length === 0
      ) throw new TypeError("invalid compiled module publication metadata");
      if (!Object.hasOwn(moduleNamespace, callable.name)) {
        Reflect.set(moduleNamespace, callable.name, value);
      }
    }
    return value;
  }

  return {
    reconstruct,
    invoke(callable, args): unknown {
      const cacheKey =
        `${callable.module ?? ""}\0${callable.name ?? ""}\0${callable.source}`;
      let value: unknown = callableCache.get(cacheKey);
      if (value === undefined && callable.name && callable.module) {
        const registry = Reflect.get(globalThis, "ρσ_modules") as
          | Record<string, Record<string, unknown>>
          | undefined;
        const moduleValue = registry?.[callable.module]?.[callable.name];
        if (
          typeof moduleValue === "function" &&
          Function.prototype.toString.call(moduleValue) === callable.source
        ) value = moduleValue;
      }
      if (value === undefined) {
        value = reconstruct(callable);
      }
      if (typeof value !== "function") {
        throw new TypeError("multiprocessing task target is not callable");
      }
      callableCache.set(cacheKey, value as (...args: unknown[]) => unknown);
      return Reflect.apply(value, undefined, args);
    },

    close(): void {
      uninstallNodeHost();
      delete global.__sagejs_output_write__;
      delete global.__sagejs_graph_database_bytes__;
      delete global.__sagejs_runtime_require__;
    },
  };
}
