// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { pnpmInvocation } = require("../scripts/pnpm-invocation.cjs");

describe("pnpm invocation", () => {
  it("uses pnpm from PATH outside package-manager scripts", () => {
    assert.deepEqual(pnpmInvocation(["test"], { npmExecPath: "" }), {
      command: "pnpm",
      arguments: ["test"],
      shell: false,
    });
  });

  it("runs JavaScript entrypoints through Node", () => {
    assert.deepEqual(
      pnpmInvocation(["pack"], {
        npmExecPath: "/tools/pnpm.cjs",
        nodeExecutable: "/tools/node",
      }),
      {
        command: "/tools/node",
        arguments: ["/tools/pnpm.cjs", "pack"],
        shell: false,
      },
    );
  });

  it("executes native pnpm binaries directly", () => {
    assert.deepEqual(
      pnpmInvocation(["pack", "--out", "sagejs.tgz"], {
        npmExecPath: "/tools/@pnpm/exe/pnpm",
      }),
      {
        command: "/tools/@pnpm/exe/pnpm",
        arguments: ["pack", "--out", "sagejs.tgz"],
        shell: false,
      },
    );
  });

  it("uses the command shell only for Windows command shims", () => {
    assert.deepEqual(
      pnpmInvocation(["install"], {
        npmExecPath: "C:\\tools\\pnpm.cmd",
        platform: "win32",
      }),
      {
        command: "C:\\tools\\pnpm.cmd",
        arguments: ["install"],
        shell: true,
      },
    );
  });
});
