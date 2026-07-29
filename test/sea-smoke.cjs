"use strict";

const assert = require("node:assert/strict");
const {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const pythonExecutable = join(root, "build", "sea", "sagepython");
const mathExecutable = join(root, "build", "sea", "sagejs");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-test-"));

function run(executable, filename) {
  const result = spawnSync(executable, [filename], {
    cwd: temporaryDirectory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

try {
  // Some filesystems do not preserve an executable bit when an artifact is
  // copied into a test workspace.
  chmodSync(pythonExecutable, 0o755);
  chmodSync(mathExecutable, 0o755);

  const pythonProgram = join(temporaryDirectory, "portable.py");
  writeFileSync(
    pythonProgram,
    [
      "import time",
      "values = {n: n * n for n in range(6)}",
      "started = time.time()",
      "time.sleep(0.005)",
      "print(sum(values.values()))",
      "print(type(started))",
      "print(time.time() >= started)",
      "",
    ].join("\n"),
  );
  assert.equal(
    run(pythonExecutable, pythonProgram),
    "55\n<class 'float'>\nTrue",
  );

  const missingBackendProgram = join(
    temporaryDirectory,
    "missing_backend.py",
  );
  writeFileSync(missingBackendProgram, "print(factor(2026))\n");
  const missingBackend = spawnSync(
    pythonExecutable,
    [missingBackendProgram],
    {
      cwd: temporaryDirectory,
      encoding: "utf8",
    },
  );
  assert.notEqual(missingBackend.status, 0);
  assert.match(
    missingBackend.stderr,
    /built without the optional FLINT mathematics backend/,
  );

  const mathProgram = join(temporaryDirectory, "portable.sage");
  writeFileSync(
    mathProgram,
    [
      "print(factor(2026))",
      "R = RealField(100)",
      "print(R('1.25') * R('2.5'))",
      "print(x)",
      "print(sin(x^2).derivative(x))",
      "print(fast_callable(sin(x^2), vars=[x])(2))",
      "",
    ].join("\n"),
  );
  assert.equal(
    run(mathExecutable, mathProgram),
    "2 * 1013\n" +
      "3.1250000000000000000000000000\n" +
      "x\n" +
      "2*x*cos(x^2)\n" +
      "-0.7568024953079282",
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("Sage.js single-executable distributions passed.");
