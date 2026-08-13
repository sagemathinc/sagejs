/*
 * Copyright (C) 2021 William Stein <wstein@sagemath.com>
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license
 */

import { basename, join } from "path";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import createCompiler from "./compiler";
import { createPythonCompilerFrontend } from "./python/compiler-frontend";
import { colored } from "./utils";
import { tmpdir } from "os";
import { standardLibraryCacheDirectory } from "./resources";
import {
  BASELIB_STANDALONE_MODULES,
  BUILTINS_STANDALONE_MODULES,
  POLYNOMIAL_STANDALONE_MODULES,
  baselibStandaloneImportPrelude,
} from "./standalone-library.cjs";

export interface CompilerTestResult {
  durationMs: number;
  skipped: boolean;
  skipReason?: "disabled" | "stage-zero-only";
}

export interface CompilerTestHarness {
  files(requested?: string[]): string[];
  run(filename: string): CompilerTestResult;
}

export async function createCompilerTestHarness(
  basePath,
  srcPath,
  libPath
): Promise<CompilerTestHarness> {
  const PyLang = createCompiler();
  const frontend = await createPythonCompilerFrontend(PyLang, "python");
  const testPath = join(basePath, "test");
  const baselib = readFileSync(
    join(libPath, "baselib-plain-pretty.js"),
    "utf-8"
  );

  function files(requested: string[] = []): string[] {
    return requested.length > 0
      ? requested.map((fname: string) =>
          fname.endsWith(".py") ? fname : fname + ".py"
        )
      : readdirSync(testPath)
          .filter((name) => /^[^_].*\.py$/.test(name))
          .map((name) => join(testPath, name));
  }

  function run(filename: string): CompilerTestResult {
    const t0 = new Date().valueOf();
    const file = readFileSync(filename, "utf-8");
    const disabled = file.toString().includes("# DISABLED");
    const stageZeroOnly = file.toString().includes("# STAGE_ZERO_ONLY");
    if (disabled || stageZeroOnly) {
      return {
        durationMs: new Date().valueOf() - t0,
        skipped: true,
        skipReason: disabled ? "disabled" : "stage-zero-only",
      };
    }
    // These historical whole-baselib fixtures exercise operations whose
    // implementation now lives in public, host-independent kernel modules.
    // Keep those dependencies explicit for the affected vertical slices; do
    // not make every unrelated compiler fixture initialize them eagerly.
    const fixture = basename(filename);
    const standaloneModules = fixture === "matrix.py"
      ? BASELIB_STANDALONE_MODULES
      : new Set(["algebra.py", "polynomial.py", "series.py"]).has(fixture)
        ? [...new Set([
          ...BUILTINS_STANDALONE_MODULES,
          ...POLYNOMIAL_STANDALONE_MODULES,
        ])]
        : undefined;
    const standalonePrelude = standaloneModules === undefined
      ? ""
      : baselibStandaloneImportPrelude(standaloneModules);
    const parseOptions: Record<string, unknown> = {
      filename,
      toplevel: undefined,
      basedir: testPath,
      libdir: join(srcPath, "lib"),
    };
    if (standalonePrelude) {
      parseOptions.precompiled_module_cache_dir = standardLibraryCacheDirectory(
        join(__dirname, "..", "module-cache"),
      );
    }
    const toplevel = frontend.parse(
      standalonePrelude + file,
      parseOptions,
    );

    const output = new PyLang.OutputStream({
      baselib_plain: baselib,
      beautify: true,
      keep_docstrings: true,
      python_attributes: true,
      python_tuples: true,
      python_truthiness: true,
      private_scope: false,
      module_registry: "",
    });
    toplevel.print(output);

    // test that output performs correct JS operations
    const jsfile = join(tmpdir(), basename(filename) + ".js");
    const code = output.toString();
    // We save and restore the console attributes since some tests,
    // e.g., repl, have a side effect of stealing them, which means
    // we suddenly can't report results.
    const saveConsole = { ...console };
    const restoreConsole = () => {
      for (let name in saveConsole) {
        console[name] = saveConsole[name];
      }
    };
    let failure: any = undefined;
    writeFileSync(jsfile, code);
    try {
      // Native addons construct values in the current V8 realm. Running these
      // historical whole-runtime fixtures in a VM context invalidates Array
      // prototypes and Python parent identity. A fresh process gives each
      // fixture the real CLI's realm without leaking its global bootstrap into
      // the next fixture.
      const timeout = fixture === "algebra.py" ? 60_000 : 30_000;
      const child = spawnSync(
        process.execPath,
        [
          join(basePath, "scripts", "run-compiler-fixture.cjs"),
          jsfile,
          libPath,
          testPath,
        ],
        { cwd: basePath, encoding: "utf8", timeout },
      );
      if (child.error) throw child.error;
      if (child.status !== 0) {
        throw new Error(
          child.stderr ||
            child.stdout ||
            `compiler fixture exited ${child.status}`,
        );
      }
    } catch (err) {
      failure = err;
    } finally {
      restoreConsole();
    }
    if (failure !== undefined) {
      if (
        failure !== null
        && (
          typeof failure === "object"
          || typeof failure === "function"
        )
      ) {
        failure.generatedJavaScript = jsfile;
        throw failure;
      }
      const wrapped = new Error(String(failure));
      (wrapped as any).generatedJavaScript = jsfile;
      throw wrapped;
    }
    return {
      durationMs: new Date().valueOf() - t0,
      skipped: false,
    };
  }

  return { files, run };
}

export default async function (
  argv: { files: string[] },
  basePath,
  srcPath,
  libPath
) {
  // Preserve the historical `sagejs test` command while exposing the same
  // isolated file runner to node:test.
  const failures: string[] = [];
  const harness = await createCompilerTestHarness(
    basePath, srcPath, libPath);
  const files = harness.files(argv.files);
  const t_start = new Date().valueOf();

  for (const filename of files) {
    const t0 = new Date().valueOf();
    let failed = false;
    try {
      const result = harness.run(filename);
      if (result.skipped) {
        console.log(`Skipping ${filename}`);
        continue;
      }
    } catch (err) {
      failures.push(filename);
      failed = true;
      const jsfile = err.generatedJavaScript;
      if (jsfile !== undefined) {
        console.error("Failed running: " + colored(jsfile, "red"));
      }
      if (err.stack) {
        console.error(colored(filename, "red") + ":\n" + err.stack + "\n\n");
      } else {
        console.error(colored(filename, "red") + ": " + err + "\n\n");
      }
    }
    console.log(
      `${colored(filename, "green")}: test ${
        failed ? "FAILED" : "completed successfully"
      } (${new Date().valueOf() - t0}ms)`
    );
  }

  if (failures.length > 0) {
    console.log(
      colored("There were " + failures.length + " test failure(s):", "red")
    );
    console.log.apply(console, failures);
  } else {
    console.log(
      colored(
        `All tests passed! (${new Date().valueOf() - t_start}ms)`,
        "green"
      )
    );
  }
  process.exit(failures.length ? 1 : 0);
}
