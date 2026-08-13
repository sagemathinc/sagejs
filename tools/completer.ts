/*
 * Copyright (C) 2021 William Stein <wstein@sagemath.com>
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license
 */

import { runInThisContext } from "vm";
import { Compiler } from "./compiler";
import { PYTHON_KEYWORDS } from "./python/contract";

export default function Completer(_compiler: Compiler) {
  const allKeywords = PYTHON_KEYWORDS;

  function globalNames(): string[] {
    try {
      const hostNames: string[] = runInThisContext(
        "typeof ρσ_dir === 'function' ? " +
          "ρσ_dir(globalThis) : Object.getOwnPropertyNames(globalThis)"
      );
      const moduleNamespace = global.ρσ_modules?.__main__;
      const moduleNames: string[] = moduleNamespace == null
        ? []
        : typeof global.ρσ_dir === "function"
          ? global.ρσ_dir(moduleNamespace)
          : Object.getOwnPropertyNames(moduleNamespace);
      const liveModuleNames = moduleNames.filter((name) =>
        Reflect.get(moduleNamespace, name) !== undefined
      );
      // A present-but-undefined module member is a deleted Python binding.
      // Do not make completion disagree with evaluation by exposing a
      // same-named JavaScript host (or proxy-provided builtin) through it.
      const visibleHostNames = hostNames.filter((name) =>
        moduleNamespace == null ||
        !Reflect.has(moduleNamespace, name) ||
        Reflect.get(moduleNamespace, name) !== undefined
      );
      return [
        ...new Set(
          visibleHostNames.concat(liveModuleNames, allKeywords),
        ),
      ].sort();
    } catch (e) {
      console.log(e.stack || e.toString());
    }
    return [];
  }

  function resolveExpression(expression: string): unknown {
    const [first, ...properties] = expression.split(".");
    const moduleNamespace = global.ρσ_modules?.__main__;
    let value: any;
    if (moduleNamespace != null && Reflect.has(moduleNamespace, first)) {
      value = Reflect.get(moduleNamespace, first);
      if (value === undefined) throw new ReferenceError(first);
    } else {
      value = runInThisContext(first);
    }
    for (const property of properties) value = Reflect.get(value, property);
    return value;
  }

  function objectNames(obj: any, prefix: string): string[] {
    if (obj == null) return [];

    if (typeof global.ρσ_dir === "function") {
      try {
        return global.ρσ_dir(obj).filter((name: string) =>
          name.startsWith(prefix)
        );
      } catch (_err) {}
    }

    const names: string[] = [];

    function add(o): void {
      const items = Object.getOwnPropertyNames(o).filter((name) =>
        name.startsWith(prefix)
      );
      names.push(...items);
    }

    let p;
    if (typeof obj === "object" || typeof obj === "function") {
      add(obj);
      p = Object.getPrototypeOf(obj);
    } else {
      p = obj.constructor?.prototype;
    }

    // Walk the prototype chain
    try {
      // Circular refs possible? Let's guard against that.
      for (let sentinel = 0; sentinel < 5 && p != null; sentinel++) {
        add(p);
        p = Object.getPrototypeOf(p);
      }
    } catch (_err) {}

    // unique and sorted:
    return [...new Set(names)].sort();
  }

  function prefixMatches(prefix: string, items: string[]): string[] {
    return items.filter((item) => item.startsWith(prefix)).sort();
  }

  function findCompletions(line: string) {
    if (!line || /\s$/.test(line)) {
      return [globalNames(), ""];
    }
    const match = line.match(
      /((?:[A-Za-z_$][A-Za-z0-9_$]*\.)*)([A-Za-z_$][A-Za-z0-9_$]*)?$/,
    );
    if (!match) return [];
    const expression = match[1].replace(/\.$/, "");
    const prefix = match[2] ?? "";
    if (!expression) return [prefixMatches(prefix, globalNames()), prefix];
    try {
      return [objectNames(resolveExpression(expression), prefix), prefix];
    } catch (_error) {
      // Keep the completion protocol stable even when the expression is an
      // unresolved/deleted Python name.  Callers still need the typed prefix
      // in order to leave the editor buffer untouched.
      return [[], prefix];
    }
  }

  return findCompletions;
}
