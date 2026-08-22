import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, "magma-genus3-height.m");
const transcriptPath = join(here, "expected-magma-2.18-5-genus3-height.txt");
const manifestPath = join(here, "magma-genus3-height.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

assert.equal(sha256(scriptPath), manifest.script_sha256);
assert.equal(sha256(transcriptPath), manifest.transcript_sha256);

const expected = readFileSync(transcriptPath, "utf8");
const fields = new Map(
  expected
    .trimEnd()
    .split("\n")
    .map((line) => {
      const split = line.indexOf("=");
      assert.notEqual(split, -1, `transcript line has no key: ${line}`);
      return [line.slice(0, split), line.slice(split + 1)];
    }),
);

assert.equal(fields.get("magma_version"), "2.18-5");
assert.equal(fields.get("genus"), "3");
assert.equal(fields.get("completion_map"), "Y=2*y+1");
assert.equal(fields.get("completed_discriminant"), "80914630610944");

const h50 = fields.get("canonical_height_50");
const h100 = fields.get("canonical_height_100");
const h160 = fields.get("canonical_height_160");
assert.ok(h100.startsWith(h50.slice(0, -1)));
assert.ok(h160.startsWith(h100.slice(0, -1)));
assert.equal(fields.get("height_pairing_160"), h160);
assert.equal(fields.get("height_matrix_11_160"), h160);
assert.equal(fields.get("regulator_rank1_160"), h160);

const magma = process.env.MAGMA;
if (magma) {
  assert.ok(existsSync(magma), `MAGMA does not exist: ${magma}`);
  const actual = execFileSync(magma, ["-b", scriptPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  assert.equal(actual, expected);
}

console.log(
  `Magma genus-3 height oracle verified (${manifest.script_sha256.slice(0, 12)}, ${manifest.transcript_sha256.slice(0, 12)})`,
);
