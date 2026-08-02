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
  const filename = relative(base, compiler_file);
  const cachedData = readCompilerCachedData(
    join(base, "dist", "runtime-cache", "compiler.bin"),
  );
  const script = new Script(compilerjs, {
    filename,
    cachedData,
  });
  script.runInContext(compiler_context);
  return compiler_exports;
}
