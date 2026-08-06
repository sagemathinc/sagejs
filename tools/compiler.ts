/*
 * Copyright (C) 2021 William Stein <wstein@sagemath.com>
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license
 */

// Thin wrapper around (release|dev)/compiler.js to setup some global facilities and
// export the compiler's symbols safely.

import { join, relative } from "path";
import { readFileSync, writeFileSync as writefile } from "fs";
import { createContext, Script } from "vm";
import { sha1sum } from "./utils";
import {
  readCompilerCachedData,
  readCompilerSource,
  readResourceText,
  runtimeRequire,
} from "./resources";

export type Compiler = any; // for now

interface Options {
  console?;
}

export default function createCompiler(options: Options = {}): Compiler {
  const base = join(__dirname, "..", "..");
  const compilerFile = join(base, "dist", "compiler", "compiler.js");
  return evaluateCompiler(
    readCompilerSource(compilerFile),
    relative(base, compilerFile),
    options,
    readCompilerCachedData(
      join(base, "dist", "runtime-cache", "compiler.bin"),
    ),
  );
}

function evaluateCompiler(
  compilerjs: string,
  filename: string,
  options: Options,
  cachedData?: Uint8Array,
): Compiler {
  const compiler_exports: Compiler = {};
  const compiler_context = createContext({
    console: options.console ?? console,
    readfile: readResourceText,
    writefile,
    sha1sum,
    require: runtimeRequire,
    exports: compiler_exports,
  });

  const script = new Script(compilerjs, {
    filename,
    cachedData,
  });
  script.runInContext(compiler_context);
  return compiler_exports;
}

/** Load the immutable, parser-containing compiler used only for bootstrap and
 * differential conformance tests. It is never part of the user-code path. */
export function createBootstrapCompiler(options: Options = {}): Compiler {
  const base = join(__dirname, "..", "..");
  const filename = join(base, "bootstrap", "compiler.js");
  return evaluateCompiler(
    readFileSync(filename, "utf8"),
    relative(base, filename),
    options,
  );
}
