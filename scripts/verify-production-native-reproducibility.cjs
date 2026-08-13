#!/usr/bin/env node

"use strict";

const { createHash } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
} = require("node:fs");
const { isAbsolute, join, relative, resolve } = require("node:path");

function fail(message) {
  throw new Error(`production native reproducibility: ${message}`);
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function files(directory) {
  const answer = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const filename = join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) answer.push(filename);
      else fail(`non-file artifact ${filename}`);
    }
  }
  visit(directory);
  return answer;
}

function inventory(root) {
  const directory = resolve(root, "dist", "native-kernels");
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    fail(`missing production tree ${directory}`);
  }
  return files(directory).map((filename) => ({
    path: relative(directory, filename).replaceAll("\\", "/"),
    bytes: statSync(filename).size,
    sha256: sha256(readFileSync(filename)),
  }));
}

function main(arguments_) {
  if (
    arguments_.length !== 2 ||
    arguments_.some((root) => !isAbsolute(root))
  ) {
    fail("usage: verify-production-native-reproducibility.cjs ROOT_A ROOT_B");
  }
  const roots = arguments_.map((root) => realpathSync(resolve(root)));
  const comparableRoots = process.platform === "win32"
    ? roots.map((root) => root.toLowerCase())
    : roots;
  if (comparableRoots[0] === comparableRoots[1]) {
    fail("independent roots must differ after canonicalization");
  }
  const inventories = roots.map(inventory);
  if (JSON.stringify(inventories[0]) !== JSON.stringify(inventories[1])) {
    const left = new Map(inventories[0].map((item) => [item.path, item]));
    const right = new Map(inventories[1].map((item) => [item.path, item]));
    const mismatch = [...new Set([...left.keys(), ...right.keys()])]
      .sort()
      .find((path) => JSON.stringify(left.get(path)) !== JSON.stringify(right.get(path)));
    fail(`artifact inventories differ at ${mismatch || "unknown path"}`);
  }
  for (const artifactRoot of roots) {
    for (const privateRoot of roots) {
      const spellings = new Set([
        privateRoot,
        privateRoot.replaceAll("\\", "/"),
        privateRoot.replaceAll("/", "\\"),
      ]);
      for (const item of inventories[0]) {
        const contents = readFileSync(
          join(artifactRoot, "dist", "native-kernels", item.path),
        );
        for (const spelling of spellings) {
          if (contents.includes(Buffer.from(spelling))) {
            fail(`${item.path} under ${artifactRoot} embeds ${spelling}`);
          }
        }
      }
    }
  }
  const canonical = `${JSON.stringify(inventories[0])}\n`;
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.production-native-reproducibility/v1",
    roots,
    files: inventories[0].length,
    inventorySha256: sha256(canonical),
    indexSha256: inventories[0].find((item) => item.path === "index.json")?.sha256,
  }, null, 2)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error?.message || error}\n`);
  process.exitCode = 1;
}
