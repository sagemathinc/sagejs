"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, readdirSync } = require("node:fs");
const { join, relative, resolve, sep } = require("node:path");

const WINDOWS_VCPKG_TRIPLET = "x64-windows-static-release";
const WINDOWS_VCPKG_POLICY = Object.freeze({
  buildType: "release",
  crtLinkage: "static",
  libraryLinkage: "static",
});

function digestFile(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function treeEntries(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const filename = join(directory, entry.name);
      if (entry.isDirectory()) return treeEntries(root, filename);
      if (!entry.isFile()) {
        throw new Error(`unsupported vcpkg authority entry: ${filename}`);
      }
      return [{
        path: relative(root, filename).split(sep).join("/"),
        sha256: digestFile(filename),
      }];
    });
}

function windowsVcpkgAuthority(
  packageRoot = resolve(__dirname, ".."),
) {
  const manifestSha256 = digestFile(join(packageRoot, "vcpkg.json"));
  const overlayPortsSha256 = createHash("sha256")
    .update(JSON.stringify(treeEntries(join(packageRoot, "scripts", "vcpkg-ports"))))
    .digest("hex");
  const tripletSha256 = digestFile(join(
    packageRoot,
    "scripts",
    "triplets",
    `${WINDOWS_VCPKG_TRIPLET}.cmake`,
  ));
  const authority = {
    manifestSha256,
    overlayPortsSha256,
    triplet: WINDOWS_VCPKG_TRIPLET,
    tripletSha256,
    ...WINDOWS_VCPKG_POLICY,
  };
  return {
    ...authority,
    dependency: {
      name: "vcpkg-flint-stack",
      sha256: createHash("sha256")
        .update(JSON.stringify(authority)).digest("hex"),
      version: "vcpkg-manifest",
    },
  };
}

module.exports = {
  WINDOWS_VCPKG_POLICY,
  WINDOWS_VCPKG_TRIPLET,
  digestFile,
  windowsVcpkgAuthority,
};
