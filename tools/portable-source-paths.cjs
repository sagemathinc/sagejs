"use strict";

const { realpathSync } = require("node:fs");
const {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
} = require("node:path");

const PORTABLE_SOURCE_FILENAME_POLICY =
  "sagejs.portable-source-filenames/v1";

function portablePrefix(prefix) {
  if (typeof prefix !== "string" || prefix === "") {
    throw new Error("portable source filename prefix must be nonempty");
  }
  const normalized = prefix.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    isAbsolute(prefix) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(
      `portable source filename prefix must be a relative canonical path: ${prefix}`,
    );
  }
  return normalized;
}

function canonicalCandidate(filename) {
  if (typeof filename !== "string" || !isAbsolute(filename)) {
    throw new Error(
      `portable source filename requires an absolute physical path: ${filename}`,
    );
  }
  try {
    return realpathSync(filename);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    // Build-only virtual inputs, such as the empty task-runtime entry point,
    // need no source file.  Resolve their existing parent so a symlinked
    // directory still cannot escape the declared source root.
    return join(realpathSync(dirname(filename)), basename(filename));
  }
}

function createPortableSourcePaths(sourceRoot, prefix = "src") {
  if (typeof sourceRoot !== "string" || !isAbsolute(sourceRoot)) {
    throw new Error("portable source root must be an absolute path");
  }
  const physicalRoot = realpathSync(sourceRoot);
  const logicalPrefix = portablePrefix(prefix);
  const policy = `${PORTABLE_SOURCE_FILENAME_POLICY}:${logicalPrefix}`;

  function logicalize(filename) {
    const physical = canonicalCandidate(filename);
    const within = relative(physicalRoot, physical).replaceAll("\\", "/");
    if (
      within === "" ||
      within === ".." ||
      within.startsWith("../") ||
      isAbsolute(within)
    ) {
      throw new Error(
        `compiler source is outside the portable source root: ${filename}`,
      );
    }
    return `${logicalPrefix}/${within}`;
  }

  return Object.freeze({
    logicalize,
    physicalRoot,
    policy,
    prefix: logicalPrefix,
  });
}

module.exports = {
  PORTABLE_SOURCE_FILENAME_POLICY,
  createPortableSourcePaths,
};
