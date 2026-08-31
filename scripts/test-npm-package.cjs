#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const {
  SUPPORTED_TARGETS,
  assertSuccessful,
  prepareFreshInstall,
  prepareRelocatedSeaFromInstall,
  runInstalledKernelPython,
  runInstalledSourcePython,
  runRelocatedSeaPython,
  targetForHost,
} = require("./package-qualification/runtime.cjs");
const {
  numericalSmokeSource,
  parseNumericalSmoke,
} = require("./package-qualification/numerical-smoke.cjs");

const root = resolve(__dirname, "..");

function usage(error) {
  const output = error ? console.error : console.log;
  if (error) output(error);
  output(
    "Usage: node scripts/test-npm-package.cjs [ROOT_TGZ PLATFORM_TGZ] " +
      "[--target linux-x64|linux-arm64|macos-arm64|windows-x64] " +
      "[--root ROOT_TGZ] [--platform-package PLATFORM_TGZ] [--keep]",
  );
  process.exit(error ? 2 : 0);
}

function parseArguments(argv) {
  const values = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") usage();
    if (argument === "--keep") {
      values.keep = true;
      continue;
    }
    if (["--target", "--root", "--platform-package"].includes(argument)) {
      const value = argv[++index];
      if (!value) usage(`${argument} requires a value`);
      const key = argument === "--platform-package"
        ? "platformArchive"
        : argument.slice(2);
      values[key] = value;
      continue;
    }
    if (argument.startsWith("--")) usage(`unknown option ${argument}`);
    values.positional.push(argument);
  }
  if (values.positional.length > 2) usage("too many positional arguments");
  const target = values.target || targetForHost();
  if (!target) usage(`unsupported host ${process.platform}-${process.arch}`);
  return {
    target,
    rootArchive: resolve(
      values.root || values.positional[0] || "build/release/npm/sagejs.tgz",
    ),
    platformArchive: resolve(
      values.platformArchive ||
        values.positional[1] ||
        `build/release/npm/sagejs-${target}.tgz`,
    ),
    keep: Boolean(values.keep),
  };
}

function verifyPublicJavaScriptApi(context) {
  const expectedVersion = require(join(root, "package.json")).version;
  assert.equal(context.version, expectedVersion);
  const target = SUPPORTED_TARGETS[context.target];
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      [
        'const api = require("@sagemath/sagejs");',
        'const kernel = require("@sagemath/sagejs/kernel");',
        'if (typeof api.createCompiler !== "function") throw new Error("missing createCompiler");',
        'if (api.createSage !== kernel.createSage) throw new Error("kernel export disagrees with package root");',
        'try { require.resolve("@sagemath/sagejs-flint"); throw new Error("private FLINT workspace leaked"); }',
        'catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }',
        "(async () => {",
        "  const sage = await api.createSage();",
        '  console.log((await sage.evaluate("factor(370309)")).repr);',
        '  console.log((await sage.evaluate("version()")).repr);',
        '  console.log((await sage.evaluate("version(True)[\\"schema\\"]")).repr);',
        "  await sage.close();",
        "})().catch((error) => { console.error(error); process.exitCode = 1; });",
      ].join("\n"),
    ],
    { cwd: context.directory, encoding: "utf8", timeout: 180_000 },
  );
  assert.equal(
    output.trim(),
    [
      "67 * 5527",
      `'Sage.js v${expectedVersion} [${target.runtimeId}], Release Date: ` +
        `${require(join(root, "sagejs-version.json")).release_date}'`,
      "'sagejs.version/v1'",
    ].join("\n"),
  );

  const esmOutput = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      [
        'import { createSage } from "@sagemath/sagejs";',
        "const sage = await createSage();",
        'console.log((await sage.evaluate("number_of_partitions(10)")).repr);',
        "await sage.close();",
      ].join("\n"),
    ],
    { cwd: context.directory, encoding: "utf8", timeout: 180_000 },
  );
  assert.equal(esmOutput.trim(), "42");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  let install;
  let relocated;
  try {
    install = prepareFreshInstall(options);
    verifyPublicJavaScriptApi(install);

    const source = numericalSmokeSource();
    parseNumericalSmoke(runInstalledSourcePython(install, source));
    parseNumericalSmoke(runInstalledKernelPython(install, source));

    relocated = prepareRelocatedSeaFromInstall(install);
    parseNumericalSmoke(runRelocatedSeaPython(relocated, source));

    const selfTest = runRelocatedSeaPython(
      relocated,
      "print('relocated SEA Python runtime passed')\n",
    );
    assertSuccessful(selfTest, "relocated SEA Python self-test");
    assert.equal(selfTest.stdout.trim(), "relocated SEA Python runtime passed");
    console.log(
      `Fresh ${options.target} npm install, public APIs, lazy numerical ` +
        "resources, and relocated SEA passed",
    );
  } finally {
    if (options.keep && install) {
      console.log(`Kept package qualification directory: ${install.directory}`);
    } else {
      relocated?.cleanup();
      install?.cleanup();
    }
  }
}

if (require.main === module) main();

module.exports = { parseArguments, verifyPublicJavaScriptApi };
