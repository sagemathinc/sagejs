#!/usr/bin/env node
"use strict";
const { join } = require("node:path");
const runtime = require("../package-qualification/runtime.cjs");
const target = runtime.targetForHost();
const context = runtime.prepareFreshInstall({
  target,
  rootArchive: "build/release/npm/sagejs.tgz",
  platformArchive: `build/release/npm/sagejs-${target}.tgz`,
});
try {
  if (context.targetConfig.os !== "win32") {
    const classGroupProgram = [
      "K.<a> = NumberField(x^3 - x - 1)",
      "G = K.class_group(proof=False, algorithm='auto')",
      "assert G.algorithm == 'rust-authenticated-service-cubic'",
      "assert G.invariants() == ()",
      "print('installed automatic native class group verified')",
      "",
    ].join("\n");
    const expected = "installed automatic native class group verified";
    const automaticClassGroup = runtime.runInstalledSourceLanguage(
      context,
      classGroupProgram,
      "sage",
      { timeout: 180_000 },
    );
    if (automaticClassGroup.status !== 0) {
      throw new Error(
        "installed automatic native class-group dispatch failed\n" +
          `stdout:\n${automaticClassGroup.stdout}` +
          `stderr:\n${automaticClassGroup.stderr}`,
      );
    }
    if (automaticClassGroup.stdout.trim() !== expected) {
      throw new Error(
        "installed automatic native class-group dispatch returned unexpected output: " +
          JSON.stringify(automaticClassGroup.stdout),
      );
    }
    const installedExecutableClassGroup = runtime.runProcess(
      join(context.platformRoot, "bin", "sagejs"),
      ["-"],
      { input: classGroupProgram, cwd: context.directory, timeout: 180_000 },
    );
    if (
      installedExecutableClassGroup.status !== 0 ||
      installedExecutableClassGroup.stdout.trim() !== expected
    ) {
      throw new Error(
        "installed Sage.js executable automatic native class-group dispatch failed\n" +
          `stdout:\n${installedExecutableClassGroup.stdout}` +
          `stderr:\n${installedExecutableClassGroup.stderr}`,
      );
    }
  }
  console.log(`Fresh ${target} npm installation and archive closure verified`);
} finally {
  context.cleanup();
}
