// sagejs-test-tier: specialized
"use strict";

// Default is a strict differential regression. --report records unresolved
// differences without claiming compatibility or changing their disposition.
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join, resolve} = require("node:path");
const {createHash} = require("node:crypto");
const {spawnSync} = require("node:child_process");
const {pythonExecutable} = require("../tools/python-executable.cjs");

async function main() {
  const artifactRoot = resolve(process.env.SAGEJS_LOOKUP_ORACLE_ROOT || join(__dirname, ".."));
  const fixture = readFileSync(join(__dirname, "fixtures/python-getattribute-protocol.py"), "utf8");
  const suffix = '\nimport json\nprint(json.dumps(observations))\n';
  const oracle = spawnSync(pythonExecutable(), ["-c",
    'import sys\nassert sys.version_info[:3] == (3, 14, 4)\n' + fixture + suffix],
    {encoding: "utf8", timeout: 30000});
  assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
  const expected = JSON.parse(oracle.stdout);
  assert.equal(expected.length, 14);
  const identities = Object.fromEntries([
    "dist/compiler/compiler.js", "dist/compiler/baselib-plain-pretty.js",
  ].map(path => [path, createHash("sha256").update(readFileSync(join(artifactRoot, path))).digest("hex")]));
  const {createSage} = require(join(artifactRoot, "dist/tools/kernel.js"));
  const modes = [];
  for (const mode of ["python", "sage"]) {
    const session = await createSage({mode});
    try {
      const result = await session.evaluate(fixture + suffix);
      const actual = JSON.parse(result.stdout.trim());
      assert.equal(actual.length, expected.length);
      const cases = expected.map((reference, index) => {
        assert.equal(actual[index][0], reference[0]);
        return {name: reference[0], expected: reference.slice(1), actual: actual[index].slice(1),
          equal: JSON.stringify(reference) === JSON.stringify(actual[index])};
      });
      modes.push({mode, cases});
    } finally {await session.close();}
  }
  const mismatches = modes.flatMap(item => item.cases.filter(row => !row.equal)).length;
  console.log(JSON.stringify({artifactRoot, identities, sourceQualified: false,
    oracle: "CPython 3.14.4", mismatches, modes}, null, 2));
  if (!process.argv.includes("--report")) assert.equal(mismatches, 0, "Required lookup differences remain");
}
main().catch(error => {console.error(error); process.exitCode = 1;});
