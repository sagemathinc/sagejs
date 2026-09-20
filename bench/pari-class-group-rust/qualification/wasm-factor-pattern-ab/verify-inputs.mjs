import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function bytes(relative) {
  return fs.readFileSync(path.resolve(here, relative));
}

function json(relative) {
  return JSON.parse(bytes(relative));
}

function sha256(relative) {
  return crypto.createHash("sha256").update(bytes(relative)).digest("hex");
}

const baseline = json("baseline.vector.json");
const bounded = json("bounded-i64.vector.json");
assert.equal(
  baseline.schema,
  "sagejs.rust-class-group-browser-vector/v1",
);
assert.equal(bounded.schema, baseline.schema);
assert.equal(baseline.request.mode, "baseline");
assert.equal(bounded.request.mode, "bounded-i64");
assert.equal(
  baseline.request.schema,
  "sagejs.rust-class-group/factor-pattern-ab-request-v1",
);
assert.deepEqual(
  { ...baseline.request, mode: bounded.request.mode },
  bounded.request,
  "the mode must be the only A/B input difference",
);
assert.deepEqual(
  { ...baseline.expected, mode: bounded.expected.mode },
  bounded.expected,
  "the mode must be the only A/B expected-output difference",
);
assert.equal(baseline.expected.rationalPrimeCount, 1139);
assert.equal(baseline.expected.factorCount, 2066);
assert.equal(
  baseline.expected.digestSha256,
  "e0b4936ea49e92649808af36cafb8d4820a54cca0d57260d293ce7d696271bbb",
);

const lock = bytes("Cargo.lock").toString("utf8");
assert.match(lock, /^version = 4$/m);
const build = bytes("build-wasm.sh").toString("utf8");
assert.match(build, /cargo build --locked --release --target wasm32-wasip1/);
assert.match(
  build,
  /toolchain_digest=37d8d819fd533570e0b707d3101ab2944f6488c4b4452b2b0a1a9ea04366452c/,
);

console.log(
  JSON.stringify(
    {
      status: "pass",
      vectorSha256: {
        baseline: sha256("baseline.vector.json"),
        boundedI64: sha256("bounded-i64.vector.json"),
      },
      cargoLockSha256: sha256("Cargo.lock"),
      buildScriptSha256: sha256("build-wasm.sh"),
    },
    null,
    2,
  ),
);
