import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const scriptPath = join(here, "sagejs-genus3-height-radius6.py");
const expectedPath = join(here, "sagejs-genus3-height-radius6.json");
const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
const scriptHash = createHash("sha256")
  .update(readFileSync(scriptPath))
  .digest("hex");

assert.equal(scriptHash, expected.script_sha256);
assert.equal(expected.classification, "slow numerical comparison; not rigorous");
assert.equal(expected.theta_refinement_stable, true);
assert.equal(expected.finite_plan_complete, true);
assert.equal(expected.finite_exact, true);
assert.equal(expected.rigorous, false);
assert.ok(Number(expected.absolute_error) < 2e-20);
assert.ok(Number(expected.absolute_error) > 0);

function parse(output) {
  return Object.fromEntries(
    output
      .trimEnd()
      .split("\n")
      .map((line) => {
        const split = line.indexOf("=");
        assert.notEqual(split, -1, `comparison line has no key: ${line}`);
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
}

if (process.env.SAGEJS_RADIUS6 === "1") {
  const output = execFileSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python", scriptPath],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const actual = parse(output);
  for (const [key, value] of Object.entries(expected.output)) {
    assert.equal(actual[key], String(value), key);
  }
}

console.log(
  `Sage.js/Magma genus-3 radius-6 comparison verified (${scriptHash.slice(0, 12)})`,
);
