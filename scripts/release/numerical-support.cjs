"use strict";

// Raw numerical observations bind these generated files as well as the public
// browser product. Preserve them through aggregation and publication; a report
// alone is not a reconstructible evidence set. This never builds missing bytes.
const fs = require("node:fs"), path = require("node:path");
const supportPaths = Object.freeze([
  "build/sea/sagejs",
  "dist/numerical",
  "packages/flint-wasm/numerical/build",
  "src/lib/sagejs/numerics/optimization/backends/nlopt/build",
]);
function supportTarget(name) {
  if (typeof name !== "string" || name.includes("\\") ||
      name.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("noncanonical numerical support path");
  }
  if (!supportPaths.some((prefix) => name === prefix ||
      (prefix !== "build/sea/sagejs" && name.startsWith(`${prefix}/`)))) {
    throw new Error("unexpected numerical support path");
  }
  return name;
}
function stageSupport(root, destination = path.join(root, "build/numerical-qualification/support")) {
  root = path.resolve(root); destination = path.resolve(destination);
  const relativeDestination = path.relative(root, destination);
  if (!relativeDestination || relativeDestination.startsWith(`..${path.sep}`) ||
      relativeDestination === ".." || path.isAbsolute(relativeDestination)) {
    throw new Error("numerical support destination must be inside the checkout");
  }
  // Inspect every existing destination ancestor before recursive mkdir can
  // follow a link. A dangling link must not be mistaken for an absent path.
  for (let current = destination; ; current = path.dirname(current)) {
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new Error("linked or non-directory numerical support destination");
    }
    if (current === root) break;
  }
  if (fs.existsSync(destination)) throw new Error("numerical support destination already exists");
  const files = [];
  function visit(relative) {
    const filename = path.join(root, relative), stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) throw new Error("linked numerical support input");
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(filename).sort()) visit(`${relative}/${child}`);
    } else {
      if (!stat.isFile() || stat.nlink !== 1) throw new Error("nonordinary numerical support input");
      files.push(supportTarget(relative));
    }
  }
  for (const relative of supportPaths) {
    // Reject symlinked ancestry too; lstat of a descendant alone follows it.
    const parts = relative.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (!fs.lstatSync(path.join(root, ...parts.slice(0, i))).isDirectory() ||
          fs.lstatSync(path.join(root, ...parts.slice(0, i))).isSymbolicLink()) {
        throw new Error("linked numerical support ancestry");
      }
    }
    const before = files.length; visit(relative);
    if (files.length === before) throw new Error("empty numerical support subtree");
  }
  for (const relative of files) {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target, fs.constants.COPYFILE_EXCL);
  }
  return { files: files.length };
}
if (require.main === module) {
  if (process.argv.length !== 2) throw new Error("numerical-support.cjs accepts no arguments");
  console.log(JSON.stringify(stageSupport(path.resolve(__dirname, "../.."))));
}
module.exports = { supportPaths, supportTarget, stageSupport };
