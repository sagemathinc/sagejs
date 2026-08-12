#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, relative } = require("node:path");
const test = require("node:test");

const {
  compilerPrerequisites,
  executeBuildPlan,
  nativeBuildPlan,
  packageRoot,
  pnpmInvocation,
  repositoryRoot,
} = require("../packages/flint/scripts/build.cjs");
const {
  bootstrapBuildPlan,
  executeBuildPhase,
} = require("../scripts/bootstrap.cjs");

test("a fresh FLINT build establishes the compiler before addon and FFI stages", () => {
  assert.deepEqual(
    compilerPrerequisites.map((filename) => relative(repositoryRoot, filename)),
    [
      "dist/compiler/compiler.js",
      "dist/tools/compiler.js",
      "dist/tools/python/compiler-frontend.js",
    ],
  );
  const plan = nativeBuildPlan({ compilerReady: false });
  assert.deepEqual(
    plan.map(({ description, pnpmArguments }) => ({
      description,
      command: `pnpm ${pnpmArguments.join(" ")}`,
    })),
    [
      {
        description: "build Sage.js compiler prerequisites",
        command: "pnpm run build",
      },
      {
        description: "build FLINT dependencies",
        command: "pnpm run build:deps",
      },
      {
        description: "build the direct Node addon",
        command: "pnpm run build:addon",
      },
      {
        description: "build generated FFI adapters",
        command: "pnpm run build:ffi",
      },
    ],
  );
  assert.equal(plan[0].cwd, repositoryRoot);
  assert.ok(plan.slice(1).every(({ cwd }) => cwd === packageRoot));
});

test("an initialized checkout keeps addon before FFI without rebuilding the compiler", () => {
  const plan = nativeBuildPlan({ compilerReady: true });
  assert.deepEqual(
    plan.map(({ pnpmArguments }) => pnpmArguments.at(-1)),
    ["build:deps", "build:addon", "build:ffi"],
  );
});

test("the FLINT composite executes its inspectable plan unchanged", () => {
  const calls = [];
  executeBuildPlan(nativeBuildPlan({ compilerReady: false }), {
    platform: "linux",
    write() {},
    spawn(command, args, options) {
      calls.push({ command, args, cwd: options.cwd });
      return { status: 0 };
    },
  });
  assert.deepEqual(
    calls.map(({ command, args, cwd }) => [command, ...args, cwd]),
    [
      ["pnpm", "run", "build", repositoryRoot],
      ["pnpm", "run", "build:deps", packageRoot],
      ["pnpm", "run", "build:addon", packageRoot],
      ["pnpm", "run", "build:ffi", packageRoot],
    ],
  );
});

test("pnpm child processes use native commands on POSIX and cmd.exe on Windows", () => {
  assert.deepEqual(pnpmInvocation(["run", "build"], "darwin"), {
    command: "pnpm",
    arguments: ["run", "build"],
  });
  assert.deepEqual(
    pnpmInvocation(["run", "build:addon"], "win32", "C:\\Windows\\cmd.exe"),
    {
      command: "C:\\Windows\\cmd.exe",
      arguments: [
        "/d",
        "/s",
        "/c",
        "pnpm.cmd",
        "run",
        "build:addon",
      ],
    },
  );
});

test("bootstrap publishes production kernels only after all native packages", () => {
  const plan = bootstrapBuildPlan();
  const calls = [];
  for (const phase of ["compiler", "native", "production"]) {
    executeBuildPhase(plan, phase, {
      runPnpm(args) {
        calls.push(["pnpm", ...args]);
      },
      runNode(args) {
        calls.push(["node", ...args]);
      },
    });
  }
  assert.deepEqual(calls, [
    ["pnpm", "run", "build"],
    ["pnpm", "--dir", "packages/flint", "build"],
    ["pnpm", "--dir", "packages/fflas", "build"],
    ["pnpm", "--dir", "packages/graph", "build"],
    ["node", "scripts/build-production-native-kernels.cjs"],
  ]);
});

test("the public FLINT build script selects the composite orchestrator", () => {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(manifest.scripts.build, "node scripts/build.cjs");
});
