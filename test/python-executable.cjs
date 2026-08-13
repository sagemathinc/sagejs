"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { pythonExecutable } = require("../tools/python-executable.cjs");

test("Python executable selection follows explicit overrides and host naming", () => {
  assert.equal(
    pythonExecutable({ environment: {}, platform: "linux" }),
    "python3",
  );
  assert.equal(
    pythonExecutable({ environment: {}, platform: "win32" }),
    "python",
  );
  assert.equal(
    pythonExecutable({
      environment: { PYTHON: "custom-python" },
      platform: "win32",
    }),
    "custom-python",
  );
  assert.equal(
    pythonExecutable({
      environment: {
        PYTHON: "ordinary-python",
        SAGEJS_REFERENCE_PYTHON: "reference-python",
      },
      platform: "linux",
    }),
    "reference-python",
  );
});
