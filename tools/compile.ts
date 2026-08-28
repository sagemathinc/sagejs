/*
 * Copyright (C) 2021 William Stein <wstein@sagemath.com>
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license
 */

import { dirname, join, normalize, resolve } from "path";
import { mkdirSync, realpathSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { runInThisContext } from "vm";
import { getImportDirs, once } from "./utils";
import createCompiler from "./compiler";
import { expandSageLoads } from "./sage-source";
import {
  readBaselibSource,
  runtimeRequire,
  standardLibraryCacheDirectory,
} from "./resources";
import {
  createForeignFrontend,
  ForeignFrontend,
  isForeignSyntaxError,
  selectedForeignLanguage,
} from "./foreign";
import { installNodeHost } from "./host";
import { installNodeGraphicsSaveHook } from "./graphics-export";
import { runRuntimeBootstrap } from "./runtime-bootstrap";
import { createPythonCompilerFrontend } from "./python/compiler-frontend";
import {
  baselibStandaloneImportPrelude,
  standaloneRuntimeRequirePrelude,
} from "./standalone-library.cjs";

// TODO
type Parsed = any;

// Async because also capable of reading to EOF from stdin.
async function readWholeFile(filename?: string): Promise<string> {
  if (filename) {
    return (await readFile(filename)).toString();
  }

  const chunks: string[] = [];
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (data) => {
    chunks.push(data.toString());
  });
  process.stdin.resume();
  await once(process.stdin, "end");
  return chunks.join("");
}

function process_cache_dir(dir: string): string {
  dir = resolve(normalize(dir));
  mkdirSync(dir, { recursive: true });
  return dir;
}

interface OutputOptions {
  beautify?: boolean;
  private_scope?: boolean;
  omit_baselib?: boolean;
  keep_docstrings?: boolean;
  discard_asserts?: boolean;
  module_cache_dir?: string;
  comments?: Function | boolean;
  baselib_plain?: string;
  sage?: boolean; // sage-style preparsing
  exact_integers?: boolean;
  python_tuples?: boolean;
  python_truthiness?: boolean;
  python_attributes?: boolean;
  pool_numeric_literals?: boolean;
  numeric_literal_pool_prefix?: string;
  module_registry?: string;
}

export default async function Compile({
  argv,
  src_path,
  lib_path,
}: {
  argv: {
    cache_dir?: string;
    bare?: boolean;
    omit_baselib?: boolean;
    keep_docstrings?: boolean;
    discard_asserts?: boolean;
    files: string[];
    import_path: string;
    output?: string;
    execute?: boolean;
    stats?: boolean;
    filename_for_stdin?: string;
    comments?: string;
    sage?: boolean;
    magma?: boolean;
    macaulay2?: boolean;
    m2?: boolean;
    maple?: boolean;
    matlab?: boolean;
    wolfram?: boolean;
    mathematica?: boolean;
    emit_sage?: boolean;
  };
  src_path: string;
  lib_path: string;
}): Promise<void> {
  const PyLang = createCompiler();
  const pythonFrontend = await createPythonCompilerFrontend(
    PyLang,
    argv.sage ? "sage" : "python",
  );
  const dynamicPythonFrontend = argv.sage
    ? await createPythonCompilerFrontend(PyLang, "python")
    : pythonFrontend;
  const foreignLanguage = selectedForeignLanguage(argv);
  const foreignFrontend: ForeignFrontend | undefined = foreignLanguage
    ? await createForeignFrontend(foreignLanguage)
    : undefined;
  // configure settings for the output
  const module_cache_dir = argv.cache_dir
    ? process_cache_dir(argv.cache_dir)
    : "";
  const outputOptions = {
    beautify: true,
    private_scope: !argv.bare,
    omit_baselib: argv.omit_baselib,
    // Cached module variants are keyed by booleans.  Normalize the CLI's
    // optional flag so portable builds select an existing precompiled variant
    // instead of trying to render the cache's intentionally lightweight AST.
    keep_docstrings: !!argv.keep_docstrings,
    discard_asserts: argv.discard_asserts,
    module_cache_dir,
    exact_integers: true,
    rational_division: !!argv.sage,
    python_tuples: true,
    python_truthiness: true,
    python_attributes: true,
    pool_numeric_literals: true,
    module_registry: argv.execute ? "ρσ_modules" : undefined,
  } as OutputOptions;

  const files: string[] = argv.files.slice();
  const stats: { [name: string]: number } = {};
  const count = files.length || 1;

  function parseFile(code: string, filename: string): Parsed {
    return pythonFrontend.parse(code, {
      filename,
      basedir: filename !== "<stdin>" ? dirname(filename) : undefined,
      libdir: join(src_path, "lib"),
      import_dirs: getImportDirs(argv.import_path),
      discard_asserts: argv.discard_asserts,
      module_cache_dir,
      precompiled_module_cache_dir: standardLibraryCacheDirectory(
        join(__dirname, "..", "module-cache"),
      ),
      jsage: argv.sage,
      exact_integer_literals: true,
      strict_python_scopes: true,
      runtime_imports: !!argv.execute,
      scoped_flags: {
        dict_literals: true,
        overload_getitem: true,
        bound_methods: true,
        sequential_definitions: true,
      },
    });
  }

  function writeOutput(output) {
    if (argv.output) {
      if (argv.output == "/dev/stdout") {
        // Node's filesystem module doesn't write directly to /dev/stdout
        console.log(output);
      } else if (argv.output == "/dev/stderr") {
        console.error(output);
      } else {
        writeFileSync(argv.output, output, "utf8");
      }
    } else if (!argv.execute) {
      console.log(output);
    }
    if (argv.execute) {
      try {
        runInThisContext(output);
      } catch (error) {
        const pythonError = error as {
          name?: string;
          code?: unknown;
        };
        if (pythonError?.name !== "SystemExit") throw error;
        const code = pythonError.code;
        if (code === undefined || code === null) process.exit(0);
        if (typeof code === "number" || typeof code === "bigint") {
          process.exit(Number(code));
        }
        console.error(String(code));
        process.exit(1);
      }
    }
  }

  function timeIt(name: string, f: () => void): void {
    var t1 = new Date().getTime();
    f();
    if (argv.stats) {
      var spent = new Date().getTime() - t1;
      if (stats[name]) {
        stats[name] += spent;
      } else {
        stats[name] = spent;
      }
    }
  }

  async function compileSingleFile(
    code: string,
    sourceFilename?: string,
  ): Promise<void> {
    let topLevel;
    timeIt("parse", () => {
      const filename =
        sourceFilename || argv.filename_for_stdin || "<stdin>";
      if (foreignFrontend) {
        try {
          code = foreignFrontend.lower(code, { filename }).source;
        } catch (err) {
          if (isForeignSyntaxError(err)) {
            console.error(err.toString());
            process.exitCode = 1;
            return;
          }
          throw err;
        }
        if (argv.emit_sage) {
          console.log(code.trimEnd());
          if (!argv.execute) return;
        }
      }
      if (argv.sage && !foreignFrontend && filename !== "<stdin>") {
        code = expandSageLoads(code, filename);
      }
      if (includeAdvancedInStandalone) {
        code =
          `import sagejs_elliptic_advanced\n` +
          baselibStandaloneImportPrelude() +
          `_elliptic_advanced_state["module"] = sagejs_elliptic_advanced\n` +
          `sagejs_elliptic_advanced._ec_bigint_power = _ec_bigint_power\n` +
          `sagejs_elliptic_advanced._ec_change_rst = _ec_change_rst\n` +
          `sagejs_elliptic_advanced._ec_invariants = _ec_invariants\n` +
          `sagejs_elliptic_advanced._ec_legendre = _ec_legendre\n` +
          `sagejs_elliptic_advanced._ec_valuation = _ec_valuation\n` +
          `sagejs_elliptic_advanced._curve_constructor = EllipticCurve\n` +
          `sagejs_elliptic_advanced._parent_class = EllipticCurveParent\n` +
          `sagejs_elliptic_advanced._point_class = EllipticCurvePoint\n` +
          code;
      }
      try {
        topLevel = parseFile(code, filename);
      } catch (err) {
        if (!(err instanceof PyLang.SyntaxError)) {
          throw err;
        }
        console.error(err.toString());
        process.exit(1);
      }
    });
    if (process.exitCode || !topLevel) return;

    let output;
    try {
      output = new PyLang.OutputStream(outputOptions);
    } catch (err) {
      if (err instanceof PyLang.DefaultsError) {
        console.error(err.message);
        process.exit(1);
      }
      throw err;
    }

    timeIt("generate", () => {
      topLevel.print(output);
    });

    output = output.get();
    writeOutput(output);
  }

  if (argv.comments) {
    if (/^\//.test(argv.comments)) {
      outputOptions.comments = new Function("return(" + argv.comments + ")")();
    } else if (argv.comments == "all") {
      outputOptions.comments = true;
    } else {
      outputOptions.comments = (_, comment) => {
        const { value } = comment;
        const { type } = comment;
        if (type == "comment2") {
          // multiline comment
          return /@preserve|@license|@cc_on/i.test(value);
        }
      };
    }
  }

  if (!argv.omit_baselib) {
    const baselib = readBaselibSource(
      join(lib_path, "baselib-plain-pretty.js"),
    );
    const standaloneRuntimeRequire = standaloneRuntimeRequirePrelude();
    outputOptions.baselib_plain = argv.sage
      ? standaloneRuntimeRequire +
        "globalThis.__sagejs_sage_mode__ = true;\n" +
        baselib
      : standaloneRuntimeRequire + baselib;
  }

  // One-shot execution can initialize the base runtime from build-time V8
  // cached data, then compile only the user's program.  Explicit JavaScript
  // output remains standalone and therefore retains its embedded baselib.
  const useCachedRuntime =
    !!argv.execute && !argv.omit_baselib && !argv.output;
  const includeAdvancedInStandalone =
    !argv.omit_baselib && !useCachedRuntime;
  if (useCachedRuntime) {
    outputOptions.omit_baselib = true;
    delete outputOptions.baselib_plain;
  }

  if (files.filter((el) => el == "-").length > 1) {
    console.error(
      "ERROR: Can only read a single file from STDIN (two or more dashes specified)"
    );
    process.exit(1);
  }

  let uninstallNodeHost: (() => void) | undefined;
  if (argv.execute) {
    // @ts-ignore
    global.require = runtimeRequire;
    installNodeGraphicsSaveHook();
    uninstallNodeHost = installNodeHost(
      globalThis,
      argv.sage ? "sage" : "python",
    );
    if (useCachedRuntime) {
      const executionImportDirs = getImportDirs(argv.import_path);
      for (const filename of files) {
        if (filename === "-") continue;
        // Imported modules must see the same physical source identity as the
        // native compiler.  macOS exposes /tmp and /var through /private, and
        // user entry points may also be reached through a symlinked project
        // root.  Seeding sys.path with a lexical alias makes a valid compiled
        // artifact undiscoverable even though both paths name one file.
        const directory = dirname(realpathSync(resolve(filename)));
        if (!executionImportDirs.includes(directory)) {
          executionImportDirs.unshift(directory);
        }
      }
      runRuntimeBootstrap(
        PyLang,
        argv.sage ? "sage" : "python",
        pythonFrontend,
        dynamicPythonFrontend,
        executionImportDirs,
      );
    }
  }

  try {
    if (files.length > 0) {
      for (const filename of files) {
        await compileSingleFile(await readWholeFile(filename), filename);
      }
    } else {
      await compileSingleFile(await readWholeFile());
    }
  } finally {
    uninstallNodeHost?.();
    pythonFrontend.close();
    if (dynamicPythonFrontend !== pythonFrontend) dynamicPythonFrontend.close();
  }

  if (argv.stats) {
    console.error(`Timing information (compressed ${count} files):`);
    for (const name in stats)
      console.error(`- ${name}: ${(stats[name] / 1000).toFixed(3)}s`);
  }
}
