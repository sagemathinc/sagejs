#!/usr/bin/env node
"use strict";

const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const arguments_ = new Set(process.argv.slice(2));
arguments_.delete("--");
const withoutSea = arguments_.delete("--without-sea");
const help = arguments_.delete("--help") || arguments_.delete("-h");
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const pnpmCommand =
  process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "pnpm";
const pnpmPrefixArguments =
  process.platform === "win32" ? ["/d", "/s", "/c", "pnpm.cmd"] : [];

if (help) {
  process.stdout.write(`Usage: pnpm bootstrap [--without-sea]

Prepare a source checkout, install JavaScript dependencies, build the Sage.js
runtime and native mathematics stack, and build build/sea/sagejs.

Options:
  --without-sea  Support Node 22.22.2+ by omitting the single executable.
                 The ordinary native runtime is still built completely.
`);
  process.exit(0);
}

if (arguments_.size !== 0) {
  throw new Error(`unknown bootstrap option: ${[...arguments_].join(", ")}`);
}

function versionAtLeast(actual, required) {
  const a = actual.split(".").map(Number);
  const b = required.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

function run(command, args) {
  process.stdout.write(`\n+ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function smoke(command, args, label) {
  process.stdout.write(
    `\n+ ${command} ${args.join(" ")} [factorization smoke test]\n`,
  );
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    input: "print(factor(2026))\n",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "");
    throw new Error(`${label} smoke test exited with status ${result.status}`);
  }
  const answer = result.stdout.trim();
  if (answer !== "2 * 1013") {
    throw new Error(
      `${label} smoke test returned ${JSON.stringify(answer)}, ` +
        'expected "2 * 1013"',
    );
  }
  process.stdout.write(`${label}: ${answer}\n`);
}

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function runPnpm(args) {
  run(pnpmCommand, [...pnpmPrefixArguments, ...args]);
}

function step(number, description) {
  process.stdout.write(`\n==> ${number}. ${description}\n`);
}

function checkPrerequisites() {
  const minimumNode = withoutSea ? "22.22.2" : "25.5.0";
  if (!versionAtLeast(process.versions.node, minimumNode)) {
    const reason = withoutSea
      ? "Sage.js requires Node.js 22.22.2 or newer"
      : "the full bootstrap builds a Node SEA, which requires Node.js 25.5 or newer";
    throw new Error(
      `${reason}; found ${process.versions.node}. ` +
        "Use `pnpm bootstrap --without-sea` for a complete native build " +
        "without the standalone executable.",
    );
  }
  const supportedHost =
    (process.platform === "linux" &&
      (process.arch === "x64" || process.arch === "arm64")) ||
    (process.platform === "darwin" &&
      (process.arch === "arm64" || process.arch === "x64")) ||
    (process.platform === "win32" && process.arch === "x64");
  if (!supportedHost) {
    throw new Error(
      `the native build does not yet support ${process.platform}/${process.arch}`,
    );
  }

  const requiredCommands = process.platform === "win32"
    ? ["git", "python", "cmake"]
    : [
        "git",
        "cc",
        "c++",
        "make",
        "python3",
        "m4",
        "tar",
        "xz",
      ];
  const missing = requiredCommands.filter(
    (command) => !commandAvailable(command),
  );
  if (!commandAvailable(pnpmCommand, [...pnpmPrefixArguments, "--version"])) {
    missing.push("pnpm");
  }
  if (missing.length !== 0) {
    throw new Error(
      `missing build tools: ${missing.join(", ")}\n` +
        (process.platform === "linux"
          ? "On Debian or Ubuntu, install: build-essential git python3 m4 xz-utils\n"
          : process.platform === "darwin"
            ? "On macOS, install the Xcode Command Line Tools and Homebrew packages node, pnpm, m4, and xz.\n"
            : "On Windows, install Git, Python, CMake, and Visual Studio 2022 Build Tools with C++, clang-cl, and the ClangCL MSBuild toolset.\n") +
        "Install pnpm 11.9.0 using the instructions at https://pnpm.io/installation",
    );
  }
  const pnpmVersion = spawnSync(
    pnpmCommand,
    [...pnpmPrefixArguments, "--version"],
    {
      encoding: "utf8",
    },
  ).stdout.trim();
  if (!versionAtLeast(pnpmVersion, "11.9.0")) {
    throw new Error(
      `pnpm 11.9.0 or newer is required; found ${pnpmVersion}. ` +
        "See https://pnpm.io/installation",
    );
  }
}

function main() {
  step(1, "Checking the host toolchain");
  checkPrerequisites();

  step(2, "Initializing Git submodules");
  run("git", ["submodule", "update", "--init", "--recursive"]);

  step(3, "Installing the pinned pnpm dependency graph");
  runPnpm(["install", "--frozen-lockfile"]);

  step(
    4,
    process.platform === "linux" && process.arch === "x64"
      ? "Building GMP, MPFR, MPC, FLINT, ffpoly, smalljac, and the Node addon"
      : "Building GMP, MPFR, MPC, FLINT, and the Node addon",
  );
  runPnpm(["--dir", "packages/flint", "build"]);

  step(5, "Building the Sage.js compiler, runtime, and standard library");
  runPnpm(["run", "build"]);

  if (!withoutSea) {
    step(6, "Building the self-contained mathematics executable");
    run(process.execPath, ["scripts/build-sea.cjs", "--with-flint"]);
  }

  step(withoutSea ? 6 : 7, "Running native smoke checks");
  run(process.execPath, ["bin/sagejs", "--version"]);
  smoke(process.execPath, ["bin/sagejs"], "development runtime");
  if (!withoutSea) {
    const sea = join(root, "build", "sea", `sagejs${executableSuffix}`);
    if (!existsSync(sea)) {
      throw new Error(`build/sea/sagejs${executableSuffix} was not created`);
    }
    run(sea, ["--version"]);
    smoke(sea, [], "self-contained executable");
  }

  process.stdout.write(`
Sage.js is ready.

  Interactive development runtime:  pnpm start
  Run a source file:                 node bin/sagejs program.sage
${withoutSea ? "" : `  Self-contained executable:          build/sea/sagejs${executableSuffix}\n`}  Fast test tiers:                   pnpm test:unit && pnpm test:native
  Full test suite:                   pnpm test

The native libraries are cached under packages/flint/.native, so subsequent
bootstrap runs reuse them unless the pinned versions change.
`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`\nBootstrap failed:\n${error.stack || error}\n`);
  process.exitCode = 1;
}
