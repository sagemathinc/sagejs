/*
 * Copyright (C) 2021 William Stein <wstein@sagemath.com>
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license
 */

// Thin wrapper around (release|dev)/compiler.js to setup some global facilities and
// export the compiler's symbols safely.

import { join, relative } from "path";
import { writeFileSync as writefile } from "fs";
import { createContext, runInContext } from "vm";
import { sha1sum } from "./utils";
import { readCompilerSource, readResourceText, runtimeRequire } from "./resources";

export type Compiler = any; // for now

interface Options {
  console?;
}

export default function createCompiler(options: Options = {}): Compiler {
  const compiler_exports: Compiler = {};
  const compiler_context = createContext({
    console: options.console ?? console,
    readfile: readResourceText,
    writefile,
    sha1sum,
    require: runtimeRequire,
    exports: compiler_exports,
  });

  const base = join(__dirname, "..", "..");
  let compiler_dir = join(base, "dist/compiler");
  const compiler_file = join(compiler_dir, "compiler.js");
  const compilerjs = readCompilerSource(compiler_file);
  runInContext(compilerjs, compiler_context, relative(base, compiler_file));
  return compiler_exports;
}
