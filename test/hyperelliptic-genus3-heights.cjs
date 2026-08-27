// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

test("bounded genus-3 Faltings--Hriljac reference checks pass", () => {
  const output = execFileSync(
    process.execPath,
    [
      join(root, "bin", "sagejs"),
      "--python",
      join(
        root,
        "src",
        "lib",
        "sagejs",
        "hyperelliptic_curves",
        "_test_genus3_heights.py",
      ),
    ],
    { cwd: root, encoding: "utf8", env: process.env },
  );
  assert.match(output, /genus-3 Faltings-Hriljac reference checks passed/);
});
