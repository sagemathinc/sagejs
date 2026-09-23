"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

async function buildRegulatorAuthority() {
  const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root);
  const { createSage } = require(path.join(runtimeRoot, "dist/tools/kernel.js"));
  const source = readFileSync(
    path.join(__dirname, "regulator_acceptance_replay.py"),
    "utf8",
  );
  const fixture = JSON.parse(
    readFileSync(
      path.join(__dirname, "regulator-acceptance-replay-fixture.json"),
      "utf8",
    ),
  );
  const session = await createSage({ mode: "python" });
  try {
    const program = source + String.raw`
import json
fixture = json.loads(${JSON.stringify(JSON.stringify(fixture))})
R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 - 20018*x + 20034, "a")
payload = build_regulator_acceptance_replay(K, fixture)
raw, authority = seal_regulator_acceptance_replay(payload)
assert cold_replay_regulator_acceptance(K, raw, authority) == payload
print(json.dumps({"envelope": json.loads(raw), "sha256": authority.envelope_sha256}, sort_keys=True))
`;
    const replay = await session.evaluate(program, {
      filename: "regulator-authority.py",
    });
    assert.equal(replay.stderr || "", "");
    return JSON.parse(replay.stdout);
  } finally {
    session.close();
  }
}

module.exports = { buildRegulatorAuthority };
