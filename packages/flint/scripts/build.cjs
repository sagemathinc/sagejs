#!/usr/bin/env node
"use strict";

const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const compilerPrerequisites = [
  resolve(repositoryRoot, "dist", "compiler", "compiler.js"),
  resolve(repositoryRoot, "dist", "tools", "compiler.js"),
  resolve(
    repositoryRoot,
    "dist",
    "tools",
    "python",
    "compiler-frontend.js",
  ),
];

function compilerReady(options = {}) {
  const prerequisites = options.prerequisites || compilerPrerequisites;
  const loadCompiler = options.loadCompiler || require;
  if (!prerequisites.every((filename) => existsSync(filename))) return false;
  try {
    const createCompiler = loadCompiler(prerequisites[1]).default;
    const compiler = createCompiler();
    if (typeof compiler.get_compiler_version !== "function") return false;
    const version = compiler.get_compiler_version();
    return typeof version === "string" && version.length > 0;
  } catch {
    return false;
  }
}

function nativeBuildPlan(options = {}) {
  const ready = options.compilerReady ?? compilerReady();
  return [
    ...(ready
      ? []
      : [{
        cwd: repositoryRoot,
        description: "build Sage.js compiler prerequisites",
        pnpmArguments: ["run", "build"],
      }]),
    {
      cwd: packageRoot,
      description: "build FLINT dependencies",
      pnpmArguments: ["run", "build:deps"],
    },
    {
      cwd: packageRoot,
      description: "build the direct Node addon",
      pnpmArguments: ["run", "build:addon"],
    },
    {
      cwd: packageRoot,
      description: "build generated FFI adapters",
      pnpmArguments: ["run", "build:ffi"],
    },
  ];
}

function pnpmInvocation(
  pnpmArguments,
  platform = process.platform,
  comspec = process.env.ComSpec,
) {
  return platform === "win32"
    ? {
      command: comspec || "cmd.exe",
      arguments: ["/d", "/s", "/c", "pnpm.cmd", ...pnpmArguments],
    }
    : { command: "pnpm", arguments: pnpmArguments };
}

function executeBuildPlan(plan, options = {}) {
  const spawn = options.spawn || spawnSync;
  const platform = options.platform || process.platform;
  const comspec = options.comspec ?? process.env.ComSpec;
  const write = options.write || ((message) => process.stdout.write(message));
  for (const step of plan) {
    const invocation = pnpmInvocation(step.pnpmArguments, platform, comspec);
    write(
      `\n+ pnpm ${step.pnpmArguments.join(" ")} (${step.description})\n`,
    );
    const result = spawn(invocation.command, invocation.arguments, {
      cwd: step.cwd,
      env: process.env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `${step.description} failed with status ${result.status ?? "none"}`,
      );
    }
  }
}

function main() {
  const arguments_ = new Set(process.argv.slice(2));
  arguments_.delete("--");
  const planOnly = arguments_.delete("--plan");
  if (arguments_.size !== 0) {
    throw new Error(`unknown FLINT build option: ${[...arguments_].join(", ")}`);
  }
  const plan = nativeBuildPlan();
  if (planOnly) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  executeBuildPlan(plan);
}

module.exports = {
  compilerPrerequisites,
  compilerReady,
  executeBuildPlan,
  nativeBuildPlan,
  packageRoot,
  pnpmInvocation,
  repositoryRoot,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}
