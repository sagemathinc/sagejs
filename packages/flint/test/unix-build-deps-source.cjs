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

test("Unix GMP builds prefer the immutable Sage.js source mirror", () => {
  assert.match(
    source,
    /url: "https:\/\/github\.com\/sagemathinc\/sagejs\/releases\/download\/native-sources-1\/gmp-6\.3\.0\.tar\.xz"/
  );
  assert.match(
    source,
    /sha256: "a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898"/
  );
  assert.match(source, /"https:\/\/ftp\.gnu\.org\/gnu\/gmp\/gmp-6\.3\.0\.tar\.xz"/);
  assert.match(source, /"https:\/\/gmplib\.org\/download\/gmp\/gmp-6\.3\.0\.tar\.xz"/);
});

test("Unix MPFR builds prefer the immutable Sage.js source mirror", () => {
  assert.match(
    source,
    /url: "https:\/\/github\.com\/sagemathinc\/sagejs\/releases\/download\/native-sources-1\/mpfr-4\.2\.2\.tar\.xz"/
  );
  assert.match(
    source,
    /sha256: "b67ba0383ef7e8a8563734e2e889ef5ec3c3b898a01d00fa0a6869ad81c6ce01"/
  );
  assert.match(source, /"https:\/\/ftp\.gnu\.org\/gnu\/mpfr\/mpfr-4\.2\.2\.tar\.xz"/);
});
