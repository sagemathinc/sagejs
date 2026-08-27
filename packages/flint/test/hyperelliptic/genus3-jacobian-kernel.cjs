"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..", "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const prefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    (process.platform === "win32"
      ? join(
          packageRoot,
          ".native",
          "vcpkg-installed",
          "x64-windows-static-md-release",
        )
      : join(packageRoot, ".native", "prefix")),
);
const compiler = process.env.CC || "cc";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

function windowsCompilerRun(args) {
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const vswhere = programFilesX86
    ? join(
        programFilesX86,
        "Microsoft Visual Studio",
        "Installer",
        "vswhere.exe",
      )
    : undefined;
  const candidates = [];
  if (process.env.VSINSTALLDIR) {
    candidates.push(
      join(process.env.VSINSTALLDIR, "VC", "Auxiliary", "Build", "vcvars64.bat"),
    );
  }
  candidates.push("C:\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat");
  if (vswhere && existsSync(vswhere)) {
    const result = spawnSync(vswhere, [
      "-latest", "-products", "*", "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property", "installationPath",
    ], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) {
      candidates.push(
        join(result.stdout.trim(), "VC", "Auxiliary", "Build", "vcvars64.bat"),
      );
    }
  }
  const vcvars = candidates.find((candidate) => existsSync(candidate));
  if (!vcvars) throw new Error("Visual Studio vcvars64.bat is required");
  const quote = (value) => `"${value.replaceAll('"', '""')}"`;
  const command =
    `call "${vcvars}" >nul && ${quote(process.env.CC || "clang-cl.exe")} ` +
    args.map(quote).join(" ");
  return run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    windowsVerbatimArguments: true,
  });
}

if (!existsSync(join(prefix, "include", "flint", "flint.h"))) {
  throw new Error(`FLINT dependency prefix is missing: ${prefix}`);
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-g3j-test-"));
try {
  const executable = join(
    temporary,
    process.platform === "win32"
      ? "genus3-jacobian-kernel.exe"
      : "genus3-jacobian-kernel",
  );
  const libraries = process.platform === "win32"
    ? ["flint.lib", "mpfr.lib", "gmp.lib", "openblas.lib", "pthreadVC3.lib"]
    : process.platform === "darwin"
      ? ["-lflint", "-lmpfr", "-lgmp", "-lopenblas", "-lm", "-lpthread"]
      : [
        "-Wl,--start-group", "-lflint", "-lmpfr", "-lgmp", "-lopenblas",
        "-Wl,--end-group", "-lm", "-lpthread",
      ];
  const sources = [
    join(packageRoot, "src", "hyperelliptic", "genus3_jacobian.c"),
    join(__dirname, "genus3-jacobian-kernel.c"),
  ];
  const compile = process.platform === "win32"
    ? [
        "/nologo", "/std:c11", "/O2", "/MD", "/W4", "/WX",
        `/I${join(packageRoot, "include")}`,
        `/I${join(prefix, "include")}`,
        ...sources,
        ...libraries.map((library) => join(prefix, "lib", library)),
        "/link", `/OUT:${executable}`,
      ]
    : [
        "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror",
        `-I${join(packageRoot, "include")}`,
        `-I${join(prefix, "include")}`,
        ...sources,
        `-L${join(prefix, "lib")}`,
        ...libraries,
        "-o", executable,
      ];
  const output = process.platform === "win32"
    ? windowsCompilerRun(compile)
    : run(compiler, compile);
  if (output) process.stdout.write(output);
  process.stdout.write(run(executable, []));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
