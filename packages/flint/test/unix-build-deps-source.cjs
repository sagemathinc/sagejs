"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const packageRoot = join(__dirname, "..");
const source = readFileSync(
  join(packageRoot, "scripts", "build-deps.cjs"),
  "utf8"
);

test("fresh Unix smalljac builds expose managed GMP headers to implicit rules", () => {
  const start = source.indexOf("function buildSmalljac(source)");
  const end = source.indexOf("\n}\n", start) + 2;
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const implementation = source.slice(start, end);

  assert.match(implementation, /const includes = `-I\$\{join\(prefix, "include"\)\}`/);
  assert.match(implementation, /`CPPFLAGS=\$\{includes\}`/);
  assert.match(implementation, /`INCLUDES=\$\{includes\}`/);
  assert.match(implementation, /`CFLAGS=\$\{cflags\}`/);
});
