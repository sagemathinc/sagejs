/*
 * Copyright (C) 2021 William Stein <wstein@sagemath.com>
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { runInThisContext } from "vm";
import {
  getImportDirs,
  colored,
  importPath,
  pathExists,
} from "./utils";
import Completer from "./completer";
import { clearLine, createInterface } from "readline";
import createCompiler from "./compiler";
import { arch } from "os";
import { expandSageLoads, parseLoadDirective } from "./sage-source";
import {
  readResourceBytes,
  runtimeRequire,
  standardLibraryCacheDirectory,
} from "./resources";
import { runRuntimeBootstrap } from "./runtime-bootstrap";
import { installNodeGraphicsSaveHook } from "./graphics-export";
import { installNodeHost } from "./host";
import {
  createForeignFrontend,
  ForeignFrontend,
  ForeignLanguage,
  foreignPrompt,
  isForeignSyntaxError,
  selectedForeignLanguage,
} from "./foreign";
import { rewriteQuestionMarkHelp } from "./polyglot";
import type { PythonCompilerFrontend } from "./python/compiler-frontend";

const DEFAULT_HISTORY_SIZE = 1000;
const HOME =
  process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"] ?? "/tmp";

function expandUser(x: string): string {
  return x.replace(/^~/, HOME);
}

const CACHEDIR = process.env.XDG_CACHE_HOME
  ? expandUser(process.env.XDG_CACHE_HOME)
  : join(HOME, ".cache");

export interface Options {
  input;
  output;
  show_js: boolean;
  ps1: string;
  ps2: string;
  console: Console;
  terminal: boolean;
  histfile: string;
  historySize: number;
  mockReadline?: Function; // for mocking readline (for testing only)
  sage?: boolean; // Sage-style mathematical syntax
  magma?: boolean;
  macaulay2?: boolean;
  m2?: boolean;
  maple?: boolean;
  matlab?: boolean;
  wolfram?: boolean;
  mathematica?: boolean;
  emitSage?: boolean;
  tokens?: boolean; // show very verbose tokens as parsed
  moduleCacheDir?: string | false;
  importDirs?: string[];
}

export function defaultHistoryFile(
  options: Partial<Options>,
  cacheDirectory = CACHEDIR,
): string {
  const foreignLanguage = selectedForeignLanguage(options);
  const mode = foreignLanguage ?? (options.sage ? "sage" : "python");
  const filename = mode === "sage" ? "history" : `history-${mode}`;
  return join(cacheDirectory, "sagejs", filename);
}

function replDefaults(options: Partial<Options>): Options {
  const foreignLanguage = selectedForeignLanguage(options);
  if (!options.input) {
    options.input = process.stdin;
  }
  if (!options.output) {
    options.output = process.stdout;
  }
  if (options.show_js == null) {
    options.show_js = true;
  }
  if (!options.ps1) {
    if (foreignLanguage) {
      options.ps1 = process.stdin.isTTY
        ? foreignPrompt(foreignLanguage)
        : "";
    } else if (options.sage) {
      options.ps1 = process.stdin.isTTY ? "sage: " : "";
    } else {
      options.ps1 = process.stdin.isTTY ? ">>> " : "";
    }
  }
  if (!options.ps2) {
    options.ps2 = process.stdin.isTTY ? "... " : "";
  }
  if (!options.console) {
    options.console = console;
  }
  if (options.terminal == null) {
    options.terminal = !!options.output?.isTTY;
  }
  if (options.histfile == null) {
    options.histfile = defaultHistoryFile(options);
    const historyDirectory = dirname(options.histfile);
    if (!pathExists(historyDirectory)) {
      mkdirSync(historyDirectory, { recursive: true });
    }
  }
  options.historySize = options.historySize ?? DEFAULT_HISTORY_SIZE;
  return options as Options;
}

function readHistory(options: Options): string[] {
  if (options.histfile) {
    if (!pathExists(options.histfile)) {
      return [];
    }
    try {
      return readFileSync(options.histfile, "utf-8").split("\n");
    } catch (err) {
      options.console.warn(`Error reading history file - ${err}`);
      return [];
    }
  }
  return [];
}

function writeHistory(options: Options, history: string[]): void {
  if (options.histfile) {
    try {
      return writeFileSync(options.histfile, history.join("\n"), "utf-8");
    } catch (err) {
      options.console.warn(`Error writing history file - ${err}`);
    }
  }
}

function createReadlineInterface(options: Options, PyLang) {
  // See https://nodejs.org/api/readline.html#readline_readline_createinterface_options
  const completer = Completer(PyLang);
  const history = options.terminal ? readHistory(options) : [];
  const readline = (options.mockReadline ?? createInterface)({
    input: options.input,
    output: options.output,
    completer,
    terminal: options.terminal,
    history,
    historySize: options.historySize,
    tabSize: 4,
  });
  // @ts-ignore -- needed for older node.js
  readline.history = history;
  return readline;
}

export interface ReplController {
  /** Resolve after every line submitted so far has been compiled and run. */
  drain(): Promise<void>;
  /** Resolve after EOF has flushed the final buffered compound statement. */
  finished(): Promise<void>;
}

export default async function Repl(
  options0: Partial<Options>,
): Promise<ReplController> {
  const options = replDefaults(options0);
  const foreignLanguage = selectedForeignLanguage(options);
  const sourceLanguage =
    foreignLanguage ?? (options.sage ? "sage" : "python");
  const PyLang = createCompiler({ console: options.console });
  let pythonFrontend: PythonCompilerFrontend | undefined;
  let dynamicPythonFrontend: PythonCompilerFrontend | undefined;
  let pythonFrontendPromise: Promise<PythonCompilerFrontend> | undefined;
  function ensurePythonFrontend(): Promise<PythonCompilerFrontend> {
    pythonFrontendPromise ??= import("./python/compiler-frontend.js").then(
      async ({ createPythonCompilerFrontend }) => {
        const frontend = await createPythonCompilerFrontend(
          PyLang,
          options.sage ? "sage" : "python",
        );
        dynamicPythonFrontend = options.sage
          ? await createPythonCompilerFrontend(PyLang, "python")
          : frontend;
        return frontend;
      },
    );
    return pythonFrontendPromise.then((frontend) => {
      pythonFrontend = frontend;
      return frontend;
    });
  }
  const foreignFrontendPromise = foreignLanguage
    ? createForeignFrontend(foreignLanguage)
    : undefined;
  const moduleCacheDir =
    options.moduleCacheDir === false
      ? ""
      : (options.moduleCacheDir ??
        join(
          CACHEDIR,
          "sagejs",
          "modules",
          PyLang.get_compiler_version(),
        ));
  if (moduleCacheDir && !pathExists(moduleCacheDir)) {
    mkdirSync(moduleCacheDir, { recursive: true });
  }
  const precompiledModuleCacheDir = standardLibraryCacheDirectory(
    join(__dirname, "..", "module-cache"),
  );
  const readline = createReadlineInterface(options, PyLang);
  const colorize = options.mockReadline
    ? (string, _color?, _bold?) => string
    : colored;
  const ps1 = colorize(options.ps1, "blue");
  const ps2 = colorize(options.ps2, "green");
  let numericLiteralPoolCounter = 0;

  // We capture input *during* initialization, so it
  // doesn't get lost, since initContext is async.
  let initLines: string[] = [];
  function duringInit(line: string) {
    initLines.push(line);
  }
  readline.on("line", duringInit);
  const foreignFrontend: ForeignFrontend | undefined =
    await foreignFrontendPromise;
  readline.off("line", duringInit);

  const buffer: string[] = [];
  const attachedFiles = new Map<string, number>();
  let more: boolean = false;
  const LINE_CONTINUATION_CHARS = ":\\";
  let toplevel;
  var importDirs = options.importDirs ?? getImportDirs();

  /*
  Python 3.11.0 (main, Nov 29 2022, 20:26:05) [Clang 15.0.3 (git@github.com:ziglang/zig-bootstrap.git 0ce789d0f7a4d89fdc4d9571 on wasi
  */
  if (process.stdin.isTTY) {
    options.console.log(
      colorize(
        `Welcome to Sage.js${
          foreignLanguage
            ? ` (${foreignDisplayName(foreignLanguage)} mode)`
            : options.sage ? "" : " (Python mode)"
        } [Node.js ${
          process.version
        } on ${arch()}].`,
        "green",
        true
      )
    );
  }

  function printAST(ast) {
    const output = new PyLang.OutputStream({
      omit_baselib: true,
      write_name: false,
      private_scope: false,
      beautify: true,
      keep_docstrings: true,
      exact_integers: true,
      rational_division: !!options.sage,
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
      pool_numeric_literals: true,
      numeric_literal_pool_prefix:
        `ρσ_repl_${numericLiteralPoolCounter++}_`,
      module_cache_dir: moduleCacheDir,
      module_registry: "ρσ_modules",
    });
    ast.print(output);
    return output.get();
  }

  let contextInitialized = false;
  function initContext(): void {
    if (contextInitialized) return;
    contextInitialized = true;
    // @ts-ignore
    global.require = runtimeRequire;
    global.__sagejs_graph_database_bytes__ = () =>
      readResourceBytes(join(importPath, "sage", "graphs", "data", "graphs.db"));
    installNodeGraphicsSaveHook();
    installNodeHost(globalThis, options.sage ? "sage" : "python");
    runRuntimeBootstrap(
      PyLang,
      options.sage ? "sage" : "python",
      pythonFrontend!,
      dynamicPythonFrontend!,
      importDirs,
    );
    runInThisContext('var __name__ = "__repl__"; show_js=false;');
  }

  function resetBuffer() {
    buffer.splice(0, buffer.length);
  }

  function prompt(): void {
    if (readline.closed) return;
    let leadingWhitespace = "";
    if (more && buffer.length) {
      let prev_line = buffer[buffer.length - 1];
      if (prev_line.trimRight().slice(-1) == ":") {
        leadingWhitespace = "    ";
      }
      // Add to leadingWhitespace all the blank space at the beginning of prev_line, if any.
      const match = prev_line.match(/^\s+/);
      if (match) {
        leadingWhitespace += match[0];
      }
    }
    readline.setPrompt(more ? ps2 : ps1);
    readline.prompt();
    if (leadingWhitespace) {
      readline.write(leadingWhitespace);
    }
  }

  function runJS(js: string, noPrint: boolean): void {
    if (runInThisContext("show_js")) {
      options.console.log(
        colorize("---------- Compiled JavaScript ---------", "green", true)
      );
      options.console.log(js);
      options.console.log(
        colorize("---------- Running JavaScript ---------", "green", true)
      );
    }
    let result;
    try {
      global.console = options.console;
      result = runInThisContext(js);
    } catch (err) {
      if (err?.name === "SystemExit") {
        const code = err.code;
        if (code === undefined || code === null) process.exit(0);
        if (typeof code === "number" || typeof code === "bigint") {
          process.exit(Number(code));
        }
        options.console.error(String(code));
        process.exit(1);
      }
      if (err?.stack) {
        options.console.error(err?.stack);
      } else {
        options.console.error(err);
      }
    }

    if (!noPrint && result != null && global.ρσ_print != null) {
      // We just print out the last result using normal Python printing.
      try {
        global.ρσ_print(result);
      } catch (err) {
        if (err?.stack) {
          options.console.error(err?.stack);
        } else {
          options.console.error(err);
        }
      }
    }
  }

  function stripCopiedPrompt(line: string): string {
    if (foreignLanguage) {
      const copiedPrompt = foreignPrompt(foreignLanguage).trim();
      if (line.startsWith(copiedPrompt)) {
        return line.slice(copiedPrompt.length).replace(/^\s?/, "");
      }
    }
    if (options.sage) {
      const sagePrompt = line.match(/^sage:\s?/);
      if (sagePrompt) return line.slice(sagePrompt[0].length);
      const sageContinuation = line.match(/^\.\.\.\.:\s?/);
      if (sageContinuation) {
        return line.slice(sageContinuation[0].length);
      }
    }
    const pythonPrompt = line.match(/^>>>\s?/);
    if (pythonPrompt) return line.slice(pythonPrompt[0].length);
    const pythonContinuation = line.match(/^\.\.\.\s/);
    if (pythonContinuation) {
      return line.slice(pythonContinuation[0].length);
    }
    return line;
  }

  function loadFile(filename: string, attach: boolean): void {
    try {
      const rawContents = readFileSync(filename, "utf-8");
      const contents = foreignFrontend
        ? rawContents
        : expandSageLoads(rawContents, filename);
      if (attach) {
        attachedFiles.set(filename, statSync(filename).mtimeMs);
      }
      compileAndRun(contents, {
        filename,
        noPrint: true,
        allowLoadDirective: false,
      });
    } catch (err) {
      options.console.error(err?.stack ?? err);
    }
  }

  function refreshAttachedFiles(): void {
    for (const [filename, previousMtime] of attachedFiles) {
      try {
        const mtime = statSync(filename).mtimeMs;
        if (mtime > previousMtime) {
          attachedFiles.set(filename, mtime);
          loadFile(filename, true);
        }
      } catch (err) {
        options.console.error(err?.stack ?? err);
      }
    }
  }

  // returns true if incomplete
  function compileAndRun(
    source: string,
    runOptions: {
      filename?: string;
      noPrint?: boolean;
      allowLoadDirective?: boolean;
    } = {},
  ): boolean {
    if (!foreignFrontend && runOptions.allowLoadDirective !== false) {
      const directive = parseLoadDirective(source);
      if (directive) {
        loadFile(directive.filename, directive.attach);
        return false;
      }
    }
    let time: number | undefined = undefined;
    if (source.startsWith("%time ") || source.startsWith("time ")) {
      time = 0;
      source = source.slice(5).trimLeft();
    }
    if (foreignFrontend) {
      try {
        const lowering = foreignFrontend.lower(source, {
          filename: runOptions.filename,
        });
        source = lowering.source;
        for (const filename of lowering.attachedFiles ?? []) {
          attachedFiles.set(filename, statSync(filename).mtimeMs);
        }
      } catch (err) {
        if (
          isForeignSyntaxError(err) &&
          err.incomplete &&
          !runOptions.filename
        ) {
          return true;
        }
        options.console.log(err?.toString?.() ?? err);
        return false;
      }
      if (options.emitSage) options.console.log(source.trimEnd());
    }
    const classes = toplevel?.classes;
    const scoped_flags = toplevel?.scoped_flags ?? {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    };
    try {
      toplevel = pythonFrontend!.parse(source, {
        filename: runOptions.filename ?? "<repl>",
        basedir: runOptions.filename
          ? dirname(runOptions.filename)
          : process.cwd(),
        libdir: importPath,
        import_dirs: importDirs,
        classes,
        scoped_flags,
        jsage: options.sage,
        exact_integer_literals: true,
        strict_python_scopes: true,
        runtime_imports: true,
        module_cache_dir: moduleCacheDir,
        precompiled_module_cache_dir: precompiledModuleCacheDir,
        tokens: options.tokens,
      });
    } catch (err) {
      if (
        !runOptions.filename &&
        err.is_eof &&
        err.line == buffer.length &&
        err.col > 0
      ) {
        return true;
      }
      if (err.message && err.line !== undefined) {
        options.console.log(err.line + ":" + err.col + ":" + err.message);
      } else {
        options.console.log(err.stack || err);
      }
      return false;
    }
    const output = printAST(toplevel);
    if (classes) {
      const exports: { [name: string]: boolean } = {};
      for (const name in toplevel.exports) {
        exports[name] = true;
      }
      for (const name in classes) {
        if (!exports[name] && !toplevel.classes[name]) {
          toplevel.classes[name] = classes[name];
        }
      }
    }
    const finalStatement = toplevel.body[toplevel.body.length - 1];
    const finalStatementIsAssignment =
      finalStatement instanceof PyLang.AST_SimpleStatement &&
      finalStatement.body instanceof PyLang.AST_Assign;
    const noPrint =
      !!runOptions.noPrint ||
      !!foreignFrontend ||
      source.trimRight().endsWith(";") ||
      finalStatementIsAssignment;
    if (time != null) {
      time = new Date().valueOf();
    }
    runJS(output, noPrint);
    if (time) {
      console.log(`Wall time: ${new Date().valueOf() - time}ms`);
    }
    return false;
  }

  // returns true if incomplete
  function push(line: string): boolean {
    buffer.push(line);
    const trimmedLine = line.trimRight();
    if (
      trimmedLine &&
      LINE_CONTINUATION_CHARS.includes(trimmedLine.slice(-1))
    ) {
      // ends in continuation character after trimming whitespace
      return true;
    }
    const source = buffer.join("\n");
    if (!source.trim()) {
      // all whitespace
      resetBuffer();
      return false;
    }
    const isIncomplete = compileAndRun(source);
    if (!isIncomplete) {
      resetBuffer();
    }
    return isIncomplete;
  }

  function readLine(line: string) {
    if (!more) {
      refreshAttachedFiles();
    }
    line = stripCopiedPrompt(line);
    if (!more) {
      line = rewriteQuestionMarkHelp(line, sourceLanguage);
    }
    if (more) {
      // We are in a block
      if (foreignFrontend) {
        // Foreign languages use explicit terminators. Ask their real parser
        // after every line instead of requiring Python's blank-line gesture.
        more = push(line);
        prompt();
        return;
      }
      const lineIsEmpty = !line.trimLeft();
      if (lineIsEmpty && buffer.length > 0) {
        // We have an empty lines, so evaluate the block:
        more = push(line.trimLeft());
      } else {
        buffer.push(line);
      }
    } else {
      // Not in a block, evaluate line
      more = push(line);
    }
    prompt();
  }
  // Tree-sitter's WebAssembly runtime is deliberately initialized only when
  // the user submits code.  In particular, starting the CLI with empty stdin
  // should not pay the parser's fixed startup cost.  Serializing line events
  // also preserves piped-input ordering while the first parser is loading.
  let lineQueue: Promise<void> = Promise.resolve();
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  function queueLine(line: string): void {
    lineQueue = lineQueue.then(async () => {
      await ensurePythonFrontend();
      initContext();
      readLine(line);
    }).catch((error) => {
      options.console.error(error?.stack ?? error);
      process.exitCode = 1;
    });
  }

  // Run code we received during initialization.
  for (const line of initLines) {
    queueLine(line);
  }

  readline.on("line", queueLine);

  readline.on("history", (history) => {
    // Note -- this only exists in node >15.x.
    if (options.terminal) {
      writeHistory(options, history);
    }
  });

  readline.on("close", async () => {
    await lineQueue;
    // A pipe commonly ends immediately after the final indented line rather
    // than delivering the blank line used by an interactive REPL.  At EOF the
    // input is unambiguous, so compile that final suite as a complete stdin
    // unit instead of silently abandoning it in the continuation buffer.
    if (buffer.length) {
      const source = buffer.join("\n");
      resetBuffer();
      more = false;
      compileAndRun(source, { filename: "<stdin>" });
    }
    const { history } = readline as any; //  deprecated in node 15...
    if (history) {
      writeHistory(options, history);
    }
    options.console.log();
    resolveFinished();
  });

  readline.on("SIGINT", () => {
    clearLine(options.output, 0);
    options.console.log("Keyboard Interrupt");
    resetBuffer();
    more = false;
    prompt();
  });

  readline.on("SIGCONT", prompt);

  prompt();
  return {
    drain(): Promise<void> {
      return lineQueue;
    },
    finished(): Promise<void> {
      return finished;
    },
  };
}

function foreignDisplayName(language: ForeignLanguage): string {
  switch (language) {
    case "wolfram":
      return "Wolfram";
    case "matlab":
      return "MATLAB";
    case "maple":
      return "Maple";
    case "magma":
      return "Magma";
    case "macaulay2":
      return "Macaulay2";
  }
}
