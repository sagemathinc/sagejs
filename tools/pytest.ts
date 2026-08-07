import { createKernelEvaluatorAsync } from "./kernel-evaluator";

export interface PytestCliArguments {
  files: string[];
}

type KernelEvaluator = Awaited<ReturnType<typeof createKernelEvaluatorAsync>>;

function hasAssertionMode(arguments_: string[]): boolean {
  return arguments_.some((argument, index) =>
    argument.startsWith("--assert=") ||
    (argument === "--assert" && index + 1 < arguments_.length)
  );
}

/** Run an installed, unmodified pytest distribution inside Sage.js. */
export async function runPytestCli(argv: PytestCliArguments): Promise<number> {
  // Entry-point plugin discovery imports arbitrary distributions from the host
  // environment.  It is deliberately outside the core compatibility target.
  process.env.PYTEST_DISABLE_PLUGIN_AUTOLOAD = "1";

  const pytestArguments = [...argv.files];
  if (!hasAssertionMode(pytestArguments)) {
    pytestArguments.unshift("--assert=plain");
  }
  // These bundled plugins currently cross host boundaries that are not part
  // of the first compatibility tier: descriptor-level stream capture,
  // logging interception, unittest subtests, persistent cache bookkeeping,
  // and native signal/faulthandler support.  Pytest itself, its fixture and
  // parametrization machinery, marks, outcomes, terminal reporting, approx,
  // and raises all remain the unmodified upstream implementation.
  for (const plugin of [
    "capture",
    "logging",
    "subtests",
    "cacheprovider",
    "faulthandler",
  ]) {
    pytestArguments.unshift("-p", `no:${plugin}`);
  }

  let evaluator: KernelEvaluator | undefined;
  let importError: unknown;
  // A cold third-party tree is translated module-by-module.  If an optional
  // import fails while that cache is being populated, retry once in a fresh
  // Python module registry; the source-hashed compiled modules from the first
  // pass remain reusable.  Tests themselves are never retried.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidate = await createKernelEvaluatorAsync({
      mode: "python",
      onOutput(text) {
        process.stdout.write(text);
      },
    });
    try {
      candidate.evaluate(
        "import pytest\n__sagejs_pytest_ready__ = hasattr(pytest, 'main')\n",
        {
          filename: "<sagejs-pytest-import>",
          language: "python",
          suppressResult: true,
        },
      );
      const ready = candidate.evaluate("__sagejs_pytest_ready__", {
        filename: "<sagejs-pytest-ready>",
        language: "python",
      });
      if (ready.repr === "True") {
        evaluator = candidate;
        break;
      }
      importError = new Error("pytest import did not publish pytest.main");
    } catch (error) {
      importError = error;
    }
    candidate.close();
  }
  if (!evaluator) {
    const message = importError instanceof Error
      ? importError.message
      : String(importError);
    if (/No module named ['\"]pytest['\"]/.test(message)) {
      throw new Error(
        "pytest is not installed for Sage.js; run `sagejs pip install pytest`",
      );
    }
    throw importError;
  }
  try {
    evaluator.evaluate(
      `__sagejs_pytest_exit_code__ = int(pytest.main(${JSON.stringify(pytestArguments)}))\n`,
      {
        filename: "<sagejs-pytest>",
        language: "python",
        suppressResult: true,
      },
    );
    const result = evaluator.evaluate("__sagejs_pytest_exit_code__", {
      filename: "<sagejs-pytest-exit-code>",
      language: "python",
    });
    const status = Number(result.repr);
    if (!Number.isInteger(status)) {
      throw new TypeError(`pytest returned invalid exit code ${result.repr}`);
    }
    return status;
  } finally {
    evaluator.close();
  }
}
