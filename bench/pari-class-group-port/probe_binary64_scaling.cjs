"use strict";

// Diagnostic, not a passing qualification of the operations it probes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {createHash} = require("node:crypto");
const {lowerSource} = require("../../tools/native-kernel/ir.cjs");
const root = path.resolve(__dirname, "../..");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim().split("\n").map(line => line.trim().split(/\s+/));
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-scaling-probe-"));
  const filename = path.join(directory, "probe.py");
  // Extremal values, normalization carries, signed zero, and gradual underflow.
  // Exponent 1074 is legitimate: scaling the smallest subnormal gives one.
  const source = `import math
values = [0.0, -0.0, 5e-324, -5e-324, 2.2250738585072014e-308,
          0.5, 0.9999999999999999, 1.0, 1.9999999999999998,
          1.7976931348623157e308, -1.7976931348623157e308]
exponents = [-2098, -1075, -1074, -1023, -1, 0, 1, 1023, 1074, 2098]
for index, value in enumerate(values):
    mantissa, exponent = math.frexp(value)
    print("frexp", index, mantissa, exponent)
for index, value in enumerate(values):
    for exponent in exponents:
        try:
            result = math.ldexp(value, exponent)
            print("ldexp", index, exponent, "ok", result)
        except OverflowError:
            print("ldexp", index, exponent, "overflow")
`;
  fs.writeFileSync(filename, source);
  const expected = run("python3", [filename]);
  const actual = run(process.execPath, [path.join(root, "bin/sagejs"), "--python", filename]);
  assert.equal(expected.length, 121);
  assert.equal(actual.length, expected.length);
  const number = token => token === "inf" ? Infinity : token === "-inf" ? -Infinity : Number(token);
  const mismatches = [];
  for (let index = 0; index < expected.length; index++) {
    const want = expected[index], got = actual[index];
    assert.deepEqual(got.slice(0, 2), want.slice(0, 2));
    const equal = want.length === got.length && want.every((token, column) =>
      token === got[column] || Object.is(number(token), number(got[column])) && !Number.isNaN(number(token)));
    if (!equal) mismatches.push({expected: want.join(" "), actual: got.join(" ")});
  }
  const native = {};
  for (const [name, signature, expression] of [
    ["ldexp", "float", "ldexp(x, exponent)"],
    ["frexp", "tuple[float, int]", "frexp(x)"],
  ]) {
    try {
      await lowerSource(`from sagejs.native import native\nfrom math import ${name}\n@native\ndef probe(x: float, exponent: int) -> ${signature}:\n    return ${expression}\n`, "scaling-probe.py");
      native[name] = "lowering accepted (execution not tested)";
    } catch (error) {
      // A changed/unrelated compiler failure must not masquerade as this gap.
      assert.match(error.message, new RegExp(`unsupported call to ${name}`));
      native[name] = error.message;
    }
  }
  console.log(JSON.stringify({
    schema: "pari-language-binary64-scaling-probe-v1",
    interpretation: "diagnostic only; any mismatch is a correctness gap, not a passed differential test",
    cases: expected.length,
    mathSourceSha256: createHash("sha256").update(fs.readFileSync(path.join(root, "src/lib/math.py"))).digest("hex"),
    native, mismatchCount: mismatches.length, mismatches,
  }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
