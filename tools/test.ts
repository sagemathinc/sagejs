/*
 * Copyright (C) 2021 William Stein <wstein@sagemath.com>
 * Copyright (C) 2015 Kovid Goyal <kovid at kovidgoyal.net>
 *
 * Distributed under terms of the BSD license
 */

import { basename, join } from "path";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import createCompiler from "./compiler";
import { colored } from "./utils";
import { deepEqual as origDeepEqual, AssertionError } from "assert";
import { tmpdir } from "os";
import { runInNewContext } from "vm";

const PyLang = createCompiler();

export interface CompilerTestResult {
  durationMs: number;
  skipped: boolean;
}

export interface CompilerTestHarness {
  files(requested?: string[]): string[];
  run(filename: string): CompilerTestResult;
}

export function createCompilerTestHarness(
  basePath,
  srcPath,
  libPath
): CompilerTestHarness {
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
    if (file.toString().includes("# DISABLED")) {
      return {
        durationMs: new Date().valueOf() - t0,
        skipped: true,
      };
    }
    const toplevel = PyLang.parse(file, {
      filename,
      toplevel: undefined,
      basedir: testPath,
      libdir: join(srcPath, "lib"),
    });

    const output = new PyLang.OutputStream({
      baselib_plain: baselib,
      beautify: true,
      keep_docstrings: true,
      python_tuples: true,
      python_truthiness: true,
    });
    toplevel.print(output);

    // test that output performs correct JS operations
    const jsfile = join(tmpdir(), basename(filename) + ".js");
    const code = output.toString();
    const assrt = { ...require("assert"), deepEqual };

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
    try {
      runInNewContext(
        code,
        {
          assrt, // patched version
          __name__: jsfile,
          require: require,
          fs: require("fs"),
          PyLang,
          console,
          compiler_dir: libPath,
          test_path: testPath,
          Buffer,
          outerRealmError: new RangeError("outside the test VM"),
        },
        { filename: jsfile }
      );
    } catch (err) {
      failure = err;
      writeFileSync(jsfile, code);
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

export default function (
  argv: { files: string[] },
  basePath,
  srcPath,
  libPath
) {
  // Preserve the historical `sagejs test` command while exposing the same
  // isolated file runner to node:test.
  const failures: string[] = [];
  const harness = createCompilerTestHarness(
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

// Modified version of deepEqual test assertion that is more suitable
// for testing python code.
function deepEqual(a: any, b: any, message: any): void {
  if (Array.isArray(a) && Array.isArray(b)) {
    // Compare array objects that have extra properties as simple arrays
    if (a === b) return;
    if (a.length !== b.length)
      throw new AssertionError({
        actual: a,
        expected: b,
        operator: "deepEqual",
        stackStartFn: deepEqual,
      });
    for (let i = 0; i < a.length; i++) {
      deepEqual(a[i], b[i], message);
    }
  } else if (typeof a?.__eq__ === "function") {
    // Python operator overloading
    if (!a.__eq__(b))
      throw new AssertionError({
        actual: a,
        expected: b,
        operator: "deepEqual",
        stackStartFn: deepEqual,
      });
  } else {
    // Fallback to standard version in nodejs library.
    return origDeepEqual(a, b, message);
  }
}
