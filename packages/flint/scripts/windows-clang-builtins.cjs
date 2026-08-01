"use strict";

const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform !== "win32") {
  process.stdout.write("");
  process.exit(0);
}

if (process.env.SAGEJS_CLANG_BUILTINS) {
  process.stdout.write(process.env.SAGEJS_CLANG_BUILTINS);
  process.exit(0);
}

const installerRoot = join(
  process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
  "Microsoft Visual Studio",
  "Installer",
);
const vswhere = join(installerRoot, "vswhere.exe");
const result = spawnSync(
  vswhere,
  [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Llvm.ClangToolset",
    "-property",
    "installationPath",
  ],
  { encoding: "utf8" },
);
const installation = result.stdout?.trim();
if (!installation) {
  throw new Error(
    "Visual Studio clang-cl and its MSBuild toolset are required on Windows"
  );
}

const clangLib = join(
  installation,
  "VC",
  "Tools",
  "Llvm",
  "x64",
  "lib",
  "clang",
);
const versions = readdirSync(clangLib, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) =>
    right.localeCompare(left, undefined, { numeric: true })
  );
for (const version of versions) {
  const library = join(
    clangLib,
    version,
    "lib",
    "windows",
    "clang_rt.builtins-x86_64.lib",
  );
  if (existsSync(library)) {
    process.stdout.write(library);
    process.exit(0);
  }
}

throw new Error(`unable to find clang-cl compiler builtins below ${clangLib}`);
