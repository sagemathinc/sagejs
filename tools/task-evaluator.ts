import { join } from "node:path";
import { runInThisContext } from "node:vm";

import { installNodeHost } from "./host";
import type { SageLanguageMode } from "./kernel-evaluator";
import {
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
}

export interface TaskEvaluator {
  invoke(callable: CallableSpec, args: unknown[]): unknown;
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
  global.__sagejs_graph_database_bytes__ = () =>
    readResourceBytes(join(importPath, "sage", "graphs", "data", "graphs.db"));
  const uninstallNodeHost = installNodeHost(globalThis, mode);
  global.__sagejs_output_write__ = (text: unknown) => onOutput(String(text));
  global.__sagejs_sage_mode__ = mode === "sage";
  runInThisContext(
    readTaskRuntimeSource(join(libraryPath, "task-runtime.js")),
    { filename: "<multiprocessing-baselib>" },
  );
  delete global.__sagejs_sage_mode__;
  runInThisContext('var __name__ = "__multiprocessing__"; show_js = false;');

  const callableCache = new Map<string, (...args: unknown[]) => unknown>();

  return {
    invoke(callable, args): unknown {
      const cacheKey =
        `${callable.module ?? ""}\0${callable.name ?? ""}\0${callable.source}`;
      let value: unknown = callableCache.get(cacheKey);
      if (value === undefined && callable.name) {
        const globalValue = Reflect.get(globalThis, callable.name);
        if (typeof globalValue === "function") value = globalValue;
      }
      if (value === undefined) {
        const bindings = callable.bindings ?? {};
        const names = Object.keys(bindings);
        const factory = runInThisContext(
          `(function(${names.join(",")}) { return (${callable.source}); })`,
          { filename: "<multiprocessing-callable>" },
        ) as (...values: unknown[]) => unknown;
        value = Reflect.apply(
          factory,
          undefined,
          names.map((name) => bindings[name]),
        );
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
    },
  };
}
