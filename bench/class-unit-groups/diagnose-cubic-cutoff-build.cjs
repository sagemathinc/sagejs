"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const declaration = "_CUBIC_ANALYTIC_THRESHOLD = 997\n";
const usage = "Usage: node diagnose-cubic-cutoff-build.cjs BUILT_ROOT OUTPUT_DIRECTORY [--cutoff N]";

function parseArguments(args) {
  assert.ok(args.length === 2 || (args.length === 4 && args[2] === "--cutoff"), usage);
  const text = args.length === 4 ? args[3] : "768";
  assert.match(text, /^[1-9][0-9]*$/, "cutoff must be a decimal integer");
  const cutoff = Number(text);
  // Stay within the documented BF theorem range and the existing allocation
  // envelope. This selects work; it never relaxes the index-one certificate.
  assert.ok(Number.isSafeInteger(cutoff) && cutoff >= 69 && cutoff < 1494,
    "diagnostic cutoff must satisfy 69 <= N < 1494");
  assert.notEqual(cutoff, 997, "choose a cutoff different from the 997 baseline");
  return { root: path.resolve(args[0]), directory: path.resolve(args[1]), cutoff };
}

function sourceAtCutoff(source, cutoff) {
  parseArguments([".", ".", "--cutoff", String(cutoff)]);
  assert.equal(source.split(declaration).length, 2, "initial threshold declaration changed");
  assert.equal(source.split("_CUBIC_ANALYTIC_REFINED_THRESHOLD = 1494\n").length, 2,
    "refinement envelope changed; review this experiment before running it");
  return source.replace(declaration, `_CUBIC_ANALYTIC_THRESHOLD = ${cutoff}\n`);
}

async function main(args) {
  const { root, directory, cutoff } = parseArguments(args);
  const source = fs.readFileSync(path.join(root, "src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const candidate = sourceAtCutoff(source, cutoff);
  const { compileKernel } = require(path.join(root, "tools/native-kernel/compiler.cjs"));
  assert.ok(!fs.existsSync(path.join(directory, "builds.json")), "use a fresh output directory; preserve prior evidence");
  fs.mkdirSync(directory, { recursive: true });
  const records = [];
  for (const selected of [997, cutoff]) {
    // Experimental source copy: only the initial work schedule changes.
    // The exact acceptance conditions and refinement to 1494 remain intact.
    const text = selected === 997 ? source : candidate;
    const sourcePath = path.join(directory, `cutoff-${selected}.py`);
    if (fs.existsSync(sourcePath)) assert.equal(fs.readFileSync(sourcePath, "utf8"), text,
      "refusing to overwrite a different experimental source");
    fs.writeFileSync(sourcePath, text);
    const compiled = await compileKernel({ sourcePath, cacheRoot: path.join(directory, `cache-${selected}`) });
    records.push({ cutoff: selected, sourcePath, sourceSha256: crypto.createHash("sha256").update(text).digest("hex"), modulePath: compiled.modulePath, cacheKey: compiled.cacheKey });
    console.log(JSON.stringify(records.at(-1)));
  }
  fs.writeFileSync(path.join(directory, "builds.json"), JSON.stringify({ diagnostic: true,
    public_receipt_qualified: false, acceptance_rule_changed: false,
    independent_exact_replay: false, cutoff_policy: "explicit experimental initial analytic threshold",
    refined_cutoff: 1494, records }, null, 2));
}

module.exports = {parseArguments, sourceAtCutoff};
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
