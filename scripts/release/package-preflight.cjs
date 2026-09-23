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
  // Archive validation above verifies that source-only development backends
  // have not leaked into either installed npm package.
  const source = "print(2 + 3)\n";
  const installed = runtime.runInstalledSourceLanguage(context, source, "sage");
  if (installed.status !== 0 || installed.stdout.trim() !== "5") {
    throw new Error(`fresh npm Sage source smoke failed: ${installed.stderr}${installed.stdout}`);
  }
  const executable = runtime.runProcess(
    join(context.platformRoot, "bin", `sagejs${context.targetConfig.executableSuffix}`),
    ["-"],
    { input: source, cwd: context.directory, timeout: 180_000 },
  );
  if (executable.status !== 0 || executable.stdout.trim() !== "5") {
    throw new Error(`fresh npm executable smoke failed: ${executable.stderr}${executable.stdout}`);
  }
  console.log(`Fresh ${target} npm installation and archive closure verified`);
} finally {
  context.cleanup();
}
