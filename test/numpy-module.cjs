// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const cli = join(root, "bin", "sagejs");
const fixture = join(__dirname, "fixtures", "numpy-vertical-slice.py");
const expected = [
  "ndarray",
  "int32",
  "(3, 4) 2 12",
  "[4, 5, 6, 7]",
  "11",
  "[[8, 9, 10, 11], [4, 5, 6, 7], [0, 1, 2, 3]]",
  "[[0, 99, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]]",
  "[[2, 101, 4, 5], [6, 7, 8, 9], [10, 11, 12, 13]]",
  "[[2, -97, 0, -1], [-2, -3, -4, -5], [-6, -7, -8, -9]]",
  "[12, 113, 18, 21]",
  "[[104], [22], [38]]",
  "[[False, True, False, False], [False, False, False, False], [False, True, True, True]]",
  "[[4], [10]]",
  "0.75",
  "array([1, 2], dtype=int32)",
  "True",
  "(1, 3, 2, 1) 4 True",
  "-7",
  "88",
  "(1, 3, 4, 1)",
  "(1, 4, 1)",
  "(1, 1, 2)",
  "(1,) [6]",
  "(1, 3, 4, 1) True",
  "123",
  "(3, 2) 2 True",
  "[8, -11, 88, 11]",
  "(3, 2)",
  "[4, 6]",
  "() 0 5",
  "IndexError",
  "IndexError",
  "ValueError",
].join("\n");

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
}

let sagejsPython;
for (const mode of ["--python", "--sage"]) {
  const sagejs = run(process.execPath, [
    cli,
    "compile",
    mode,
    "--execute",
    fixture,
  ]);
  assert.equal(sagejs.status, 0, sagejs.stderr);
  assert.equal(sagejs.stdout.trim(), expected);
  if (mode === "--python") sagejsPython = sagejs;
}
assert.ok(sagejsPython);

const python = pythonExecutable();
const numpyAvailable = run(python, ["-c", "import numpy"]);
if (numpyAvailable.status === 0) {
  const cpython = run(python, [fixture]);
  assert.equal(cpython.status, 0, cpython.stderr);
  assert.equal(
    sagejsPython.stdout,
    cpython.stdout,
    "the vertical slice must agree with CPython/NumPy",
  );
} else {
  process.stderr.write(
    "Skipping the optional CPython/NumPy differential check; " +
      `${python} cannot import numpy.\n`,
  );
}

const numpySource = readFileSync(join(root, "src", "lib", "numpy.py"), "utf8");
assert.doesNotMatch(numpySource, /(?:^|[^A-Za-z])v[rfb]?["']/m);
assert.doesNotMatch(numpySource, /^# globals:/m);

console.log("Sage.js NumPy vertical slice passed.");
