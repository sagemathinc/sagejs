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
const mpcOverlay = readFileSync(
  join(
    packageRoot,
    "scripts",
    "vcpkg-ports",
    "mpc",
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

test("the GMP overlay prefers Sage.js's immutable source archive", () => {
  assert.match(
    overlay,
    /releases\/download\/native-sources-1\/gmp-\$\{VERSION\}\.tar\.xz/
  );
  assert.match(
    overlay,
    /e85a0dab5195889948a3462189f0e0598d331d3457612e2d3350799dba2e244316d256f8161df5219538eb003e4b5343f989aaa00f96321559063ed8c8f29fd2/
  );
});

test("the MPC overlay uses Sage.js's immutable verified source archive", () => {
  assert.match(mpcOverlay, /MPC 1\.3\.1 port/);
  assert.match(
    mpcOverlay,
    /releases\/download\/native-sources-1\/mpc-\$\{VERSION\}\.tar\.gz/
  );
  assert.match(
    mpcOverlay,
    /4bab4ef6076f8c5dfdc99d810b51108ced61ea2942ba0c1c932d624360a5473df20d32b300fc76f2ba4aa2a97e1f275c9fd494a1ba9f07c4cb2ad7ceaeb1ae97/
  );
});
