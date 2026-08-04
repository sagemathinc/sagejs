"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createKernelSpec,
  installKernelSpec,
} = require("../dist/tools/jupyter-kernel.js");

test("npm and SEA launchers produce portable Jupyter kernelspecs", () => {
  assert.deepEqual(
    createKernelSpec("sage", ["/usr/bin/node", "/opt/sagejs/bin/sagejs-jupyter"]),
    {
      argv: [
        "/usr/bin/node",
        "/opt/sagejs/bin/sagejs-jupyter",
        "--connection-file",
        "{connection_file}",
        "--mode",
        "sage",
      ],
      display_name: "Sage.js Polyglot",
      language: "sage",
      interrupt_mode: "message",
      metadata: { debugger: false },
    },
  );
  assert.deepEqual(
    createKernelSpec("python", ["C:\\Sage.js\\sagejs.exe", "--jupyter-kernel"]),
    {
      argv: [
        "C:\\Sage.js\\sagejs.exe",
        "--jupyter-kernel",
        "--connection-file",
        "{connection_file}",
        "--mode",
        "python",
      ],
      display_name: "Sage.js (Python mode)",
      language: "python",
      interrupt_mode: "message",
      metadata: { debugger: false },
    },
  );
});

test("kernelspec installer rejects conflicting destinations", () => {
  assert.throws(
    () =>
      installKernelSpec(
        "sage",
        ["--user", "--sys-prefix"],
        ["/opt/sagejs/sagejs", "--jupyter-kernel"],
      ),
    /choose only one of --user, --sys-prefix, or --prefix/,
  );
});
