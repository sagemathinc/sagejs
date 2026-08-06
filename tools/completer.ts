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
      const names: string[] = runInThisContext(
        "typeof ρσ_dir === 'function' ? " +
          "ρσ_dir(globalThis) : Object.getOwnPropertyNames(globalThis)"
      );
      return [...new Set(names.concat(allKeywords))].sort();
    } catch (e) {
      console.log(e.stack || e.toString());
    }
    return [];
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
      return [objectNames(runInThisContext(expression), prefix), prefix];
    } catch (_error) {
      return [];
    }
  }

  return findCompletions;
}
