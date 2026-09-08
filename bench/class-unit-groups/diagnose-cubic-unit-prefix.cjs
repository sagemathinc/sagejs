"use strict";
// Exact forensic check of every raw prefix, not a class-group certificate.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { program } = require("./diagnose-cubic-raw-relations-gp.cjs");
function prefixProgram(record) {
  const n = Number(record.output[50]), m = Number(record.output[51]);
  const source = program(record); // Includes exact validation of every principal row.
  assert.equal(source.split("quit;\n").length, 2);
  return source.replace("quit;\n", `print("exact-prefix-unit-flags");
for(t=${n},${m},N=matrix(t,${n},i,j,M[i,j]);Kt=matkerint(N~);found=0;for(j=1,matsize(Kt)[2],u=prod(i=1,t,a[i]^Kt[i,j]);if(u!=1&&u!= -1,found=1;break));print([t,found]));
quit;
`);
}
function main() {
  const [capturePath, gp, ...extra] = process.argv.slice(2);
  assert(capturePath && gp && !extra.length);
  const capture = JSON.parse(fs.readFileSync(capturePath));
  assert.equal(capture.can_certify, false);
  const records = capture.records.map(record => {
    const source = prefixProgram(record);
    const p = spawnSync(gp, ["-fq"], { input: source, encoding: "utf8", timeout: 30_000 });
    assert.equal(p.status, 0, p.stderr); assert.equal(p.stderr.trim(), "");
    assert(p.stdout.includes("principal-rows-checked"));
    const flags = p.stdout.split("exact-prefix-unit-flags\n")[1].trim().split("\n").map(JSON.parse);
    assert.equal(flags.length, Number(record.output[51]) - Number(record.output[50]) + 1);
    for (let i=0; i<flags.length; i++) {
      assert.equal(flags[i][0], Number(record.output[50])+i);
      assert([0,1].includes(flags[i][1]));
      if (i) assert(flags[i][1] >= flags[i-1][1], "unit existence must persist under extension");
    }
    return { name: record.name, sourceSha256: record.sourceSha256,
      gpProgram: source, stdout: p.stdout, flags,
      firstNontrivialUnitPrefix: flags.find(row => row[1] === 1)?.[0] ?? null };
  });
  console.log(JSON.stringify({ diagnostic_only: true, independent_exact_replay: false, records }, null, 2));
}
module.exports = { prefixProgram };
if (require.main === module) main();
