#!/usr/bin/env node
"use strict";

const {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { join, resolve } = require("node:path");

const { runPnpm } = require("./pnpm-invocation.cjs");

const root = resolve(__dirname, "..");
const platforms = {
  "linux-x64": {
    package: "@sagemath/sagejs-linux-x64",
    os: "linux",
    cpu: "x64",
    libc: "glibc",
    extension: "",
  },
  "linux-arm64": {
    package: "@sagemath/sagejs-linux-arm64",
    os: "linux",
    cpu: "arm64",
    libc: "glibc",
    extension: "",
  },
  "macos-arm64": {
    package: "@sagemath/sagejs-darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    extension: "",
  },
  "windows-x64": {
    package: "@sagemath/sagejs-win32-x64",
    os: "win32",
    cpu: "x64",
    extension: ".exe",
  },
};

function usage() {
  console.error(
    "Usage: node scripts/build-npm-platform-package.cjs " +
      "PLATFORM SAGEJS SAGEPYTHON",
  );
  process.exit(2);
}

const [platformName, sagejsInput, sagepythonInput] = process.argv.slice(2);
if (!platformName || !sagejsInput || !sagepythonInput) usage();
const platform = platforms[platformName];
if (!platform) {
  throw new Error(`unsupported npm platform ${JSON.stringify(platformName)}`);
}
for (const filename of [sagejsInput, sagepythonInput]) {
  if (!existsSync(filename)) throw new Error(`missing executable ${filename}`);
}

const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const packageDirectory = join(root, "build", "npm", `sagejs-${platformName}`);
const archive = join(
  root,
  "build",
  "release",
  "npm",
  `sagejs-${platformName}.tgz`,
);
rmSync(packageDirectory, { recursive: true, force: true });
mkdirSync(join(packageDirectory, "bin"), { recursive: true });
mkdirSync(join(root, "build", "release", "npm"), { recursive: true });

const manifest = {
  name: platform.package,
  version: rootPackage.version,
  description: `Sage.js native executables for ${platformName}`,
  repository: rootPackage.repository,
  homepage: rootPackage.homepage,
  license: rootPackage.license,
  os: [platform.os],
  cpu: [platform.cpu],
  bin: {
    [`sagejs-${platformName}`]: `bin/sagejs${platform.extension}`,
    [`sagepython-${platformName}`]: `bin/sagepython${platform.extension}`,
  },
  files: ["bin", "licenses", "LICENSE", "README.md"],
};
if (platform.libc) manifest.libc = [platform.libc];
writeFileSync(
  join(packageDirectory, "package.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
writeFileSync(
  join(packageDirectory, "README.md"),
  `# Sage.js for ${platformName}\n\n` +
    "This platform package is installed automatically by `@sagemath/sagejs`. " +
    "Use the public package rather than installing this package directly.\n",
);
copyFileSync(join(root, "LICENSE"), join(packageDirectory, "LICENSE"));
cpSync(join(root, "licenses"), join(packageDirectory, "licenses"), {
  recursive: true,
});
for (const [name, input] of [
  ["sagejs", sagejsInput],
  ["sagepython", sagepythonInput],
]) {
  const output = join(packageDirectory, "bin", `${name}${platform.extension}`);
  copyFileSync(input, output);
  chmodSync(output, 0o755);
}

runPnpm(["pack", "--out", archive], {
  cwd: packageDirectory,
  stdio: "inherit",
});
console.log(`Built ${archive}`);
