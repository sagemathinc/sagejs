"use strict";

const { isAbsolute, resolve, win32 } = require("node:path");

const canonicalSourceRoot = "/sagejs/source";

function pathSpellings(root) {
  const absolute =
    isAbsolute(root) || win32.isAbsolute(root) ? root : resolve(root);
  const forward = absolute.replaceAll("\\", "/");
  return [...new Set([
    absolute,
    forward,
    JSON.stringify(absolute).slice(1, -1),
    JSON.stringify(forward).slice(1, -1),
  ])].sort((left, right) => right.length - left.length);
}

function canonicalizeGeneratedPaths(source, root) {
  let answer = source;
  for (const spelling of pathSpellings(root)) {
    answer = answer.replaceAll(spelling, canonicalSourceRoot);
  }
  return answer;
}

function embeddedBuildPath(source, roots) {
  for (const root of roots) {
    for (const spelling of pathSpellings(root)) {
      if (source.includes(spelling)) return { root, spelling };
    }
  }
  return null;
}

module.exports = {
  canonicalSourceRoot,
  canonicalizeGeneratedPaths,
  embeddedBuildPath,
  pathSpellings,
};
