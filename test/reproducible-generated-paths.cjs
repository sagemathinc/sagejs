// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

const {
  canonicalSourceRoot,
  canonicalizeGeneratedPaths,
  embeddedBuildPath,
} = require("../tools/reproducible-generated-paths.cjs");

const root = resolve(__dirname, "..");

test("generated compiler paths use a checkout-independent virtual root", () => {
  const windowsRoot = "C:\\work\\sagejs";
  const source = [
    `${root}/src/compiler.py`,
    `${windowsRoot}\\src\\compiler.py`,
    JSON.stringify(`${windowsRoot}\\src\\compiler.py`),
  ].join("\n");
  const canonical = canonicalizeGeneratedPaths(
    canonicalizeGeneratedPaths(source, root),
    windowsRoot,
  );
  assert.equal(embeddedBuildPath(canonical, [root, windowsRoot]), null);
  assert.match(canonical, new RegExp(`${canonicalSourceRoot}/src/compiler\\.py`));
});

test("published compiler and baselib do not retain the checkout root", () => {
  for (const name of ["compiler.js", "baselib-plain-pretty.js"]) {
    const filename = join(root, "dist", "compiler", name);
    assert.equal(existsSync(filename), true, `run pnpm build to create ${filename}`);
    assert.equal(
      embeddedBuildPath(readFileSync(filename, "utf8"), [root]),
      null,
      `${filename} embeds the checkout root`,
    );
  }
});
