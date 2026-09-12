// sagejs-test-tier: specialized
// Explicit optional-reference test; requires a provisioned Julia/Hecke environment.
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const julia = process.env.JULIA || "julia";
const common = ["--startup-file=no", "--compiled-modules=strict", "--pkgimages=existing"];
if (process.env.JULIA_PROJECT) common.push(`--project=${process.env.JULIA_PROJECT}`);

function run(args, input = "") {
  const child = spawnSync(julia, [...common, ...args], {
    encoding: "utf8", input, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  return child.stdout.trim().split("\n").map((line) => JSON.parse(line));
}

const sample = run([
  "-e",
  'include(ARGS[1]); println(frontier_json((text=string(Char.([0x3b1,0x20,0x1f600,0x5c,0x22,0xa,0xd,0x9,0])...), exact="123456789012345678901234567890", yes=true, no=false, absent=nothing, nested=([1,-2],()))))',
  path.join(__dirname, "transport.jl"),
])[0];
assert.deepEqual(sample, {
  text: 'α 😀\\"\n\r\t\0', exact: "123456789012345678901234567890",
  yes: true, no: false, absent: null, nested: [[1, -2], []],
});

const responses = run([path.join(__dirname, "screen.jl")], [
  "not-a-request",
  "FRONTIER2\tbad-number\t100\t1\t17\tconditional-grh\t-2,run(`false`),1",
  "FRONTIER2\tquadratic-100\t100\t1\t17\tconditional-grh\t-2,0,1",
  "FRONTIER2\tquadratic-200\t200\t1\t17\tconditional-grh\t-2,0,1",
  "",
].join("\n"));
assert.equal(responses.length, 4);
assert.equal(responses[0].status, "error");
assert.equal(responses[1].status, "error");
for (const [offset, bits] of [[2, 100], [3, 200]]) {
  const { status, result } = responses[offset];
  assert.equal(status, "ok");
  assert.equal(result.bits, bits);
  assert.equal(result.independent_replay, false);
  assert.equal(result.schema, "sagejs-hecke-frontier-screen-v3");
  assert.equal(result.proof_policy, "conditional-grh");
  assert.equal(result.proof_execution, null);
  assert.equal(result.compact.regulator.fundamental_units_policy, "conditional-grh");
  assert.match(result.elapsed_ns, /^[0-9]+$/);
  assert.equal(result.compact.class_number, "1");
  assert.equal(result.compact.torsion_order, "2");
  assert.equal(result.compact.decompositions.length, 3);
  assert.equal(result.compact.units.length, 2);
  assert.equal(result.compact.regulator.guarantee, "absolute-radius-less-than-2^-bits");
  const rational = (s) => {
    const parts = s.split("//").map((v) => BigInt(v.trim()));
    return [parts[0], parts[1] || 1n];
  };
  const [ln, ld] = rational(result.compact.regulator.lower);
  const [hn, hd] = rational(result.compact.regulator.upper);
  const widthNumerator = hn * ld - ln * hd;
  assert(widthNumerator >= 0n);
  assert(widthNumerator * (1n << BigInt(bits - 1)) < ld * hd);
  for (const unit of result.compact.units) {
    for (const factor of unit) {
      assert.match(factor.exponent, /^-?[0-9]+$/);
      assert.equal(factor.factor.length, 2);
      assert(factor.factor.every((coefficient) => typeof coefficient === "string"));
    }
  }
}
console.log("Dependency-free JSON serializer and persistent Hecke protocol passed.");
