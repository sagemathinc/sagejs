#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, relative, resolve } = require("node:path");
const test = require("node:test");

const {
  compilerPrerequisites,
  compilerReady,
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
const {
  functionsWithoutUnavailableLibraries,
  unavailableOptionalLibrary,
} = require("../scripts/build-production-native-kernels.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");

test("production kernels omit only functions needing an unavailable optional library", () => {
  const functions = ["flint_part", "m4ri_part", "portable_part"];
  const libraries = new Map([
    ["flint_part", ["flint"]],
    ["m4ri_part", ["flint", "m4ri"]],
    ["portable_part", []],
  ]);
  assert.deepEqual(
    functionsWithoutUnavailableLibraries(
      functions,
      libraries,
      new Set(["m4ri"]),
    ),
    ["flint_part", "portable_part"],
  );
  assert.equal(
    unavailableOptionalLibrary(
      new Error("m4ri declared native library libm4ri.a: ENOENT"),
    ),
    true,
  );
  assert.equal(unavailableOptionalLibrary(new Error("compiler crashed")), false);
});

test("selected native functions retain only foreign libraries they use", async () => {
  const sourcePath = resolve(
    repositoryRoot,
    "src/lib/sagejs/linear_algebra/sparse_random_public.py",
  );
  const source = readFileSync(sourcePath, "utf8");
  const flint = await lowerSource(source, sourcePath, {
    functions: ["sparse_random_fmpz"],
  });
  const m4ri = await lowerSource(source, sourcePath, {
    functions: ["sparse_random_m4ri"],
  });
  assert.deepEqual(
    flint.foreignLibraries.map((library) => library.id),
    ["flint"],
  );
  assert.deepEqual(m4ri.foreignLibraries.map((library) => library.id), ["m4ri"]);
});

test("a fresh FLINT build establishes the compiler before addon and FFI stages", () => {
  assert.deepEqual(
    compilerPrerequisites.map((filename) => relative(repositoryRoot, filename)),
    [
      join("dist", "compiler", "compiler.js"),
      join("dist", "tools", "compiler.js"),
      join("dist", "tools", "python", "compiler-frontend.js"),
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

function temporaryCompilerPrerequisites(compilerSource) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-build-compiler-test-"));
  const prerequisites = [
    join(directory, "compiler", "compiler.js"),
    join(directory, "tools", "compiler.js"),
    join(directory, "tools", "python", "compiler-frontend.js"),
  ];
  for (const filename of prerequisites) {
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, filename === prerequisites[1] ? compilerSource : "");
  }
  return { directory, prerequisites };
}

test("present stage-zero compiler artifacts are not considered ready", (t) => {
  const fixture = temporaryCompilerPrerequisites(`
    module.exports.default = function createCompiler() { return {}; };
  `);
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  assert.equal(compilerReady({ prerequisites: fixture.prerequisites }), false);
});

test("a present self-hosted compiler is considered ready", (t) => {
  const fixture = temporaryCompilerPrerequisites(`
    module.exports.default = function createCompiler() {
      return { get_compiler_version() { return "test-version"; } };
    };
  `);
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  assert.equal(compilerReady({ prerequisites: fixture.prerequisites }), true);
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
