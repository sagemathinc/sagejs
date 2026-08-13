"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const packageRoot = join(__dirname, "..");
const manifest = JSON.parse(
  readFileSync(join(packageRoot, "vcpkg.json"), "utf8")
);
const overlay = readFileSync(
  join(
    packageRoot,
    "scripts",
    "vcpkg-ports",
    "gmp",
    "portfile.cmake"
  ),
  "utf8"
);

test("the GMP overlay records its exact vcpkg authority", () => {
  assert.match(overlay, new RegExp(manifest["builtin-baseline"]));
  assert.match(overlay, /GMP 6\.3\.0 port/);
});

test("the GMP overlay uses an immutable verified autoconf source", () => {
  assert.match(
    overlay,
    /releases\/download\/native-sources-1\/autoconf2\.71-2\.71-4-any\.pkg\.tar\.zst/
  );
  assert.match(
    overlay,
    /c93b791eb55893cbe7c425e764074837355fd165deb7b1775f652c8e25d9d1f0cdd4120ab710d56fb859b7df55c4f971eccda7c112448f60615bff8a2dc81166/
  );
  assert.doesNotMatch(overlay, /autoconf2\.71-2\.71-3/);
});
