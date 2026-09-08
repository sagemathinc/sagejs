"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const root = process.argv[2];
const directory = process.argv[3];
const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
const source = fs.readFileSync(path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
assert.equal(source.split("_CUBIC_ANALYTIC_THRESHOLD = 997").length, 2);
fs.mkdirSync(directory, { recursive: true });
(async () => {
  const records = [];
  for (const cutoff of [997, 768]) {
    // Experimental source copy: only the initial work schedule changes.
    // The exact acceptance conditions and refinement to 1494 remain intact.
    const text = source.replace("_CUBIC_ANALYTIC_THRESHOLD = 997", `_CUBIC_ANALYTIC_THRESHOLD = ${cutoff}`);
    const sourcePath = path.join(directory, `cutoff-${cutoff}.py`);
    fs.writeFileSync(sourcePath, text);
    const compiled = await compileKernel({ sourcePath, cacheRoot: path.join(directory, `cache-${cutoff}`) });
    records.push({ cutoff, sourcePath, sourceSha256: crypto.createHash("sha256").update(text).digest("hex"), modulePath: compiled.modulePath, cacheKey: compiled.cacheKey });
    console.log(JSON.stringify(records.at(-1)));
  }
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify({ diagnostic: true, public_receipt_qualified: false, records }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
