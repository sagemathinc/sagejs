"use strict";
// Actual timing experiments, not tests of benchmark-policy correctness. New
// entries require review; default correctness classification never drops work.
const performance = new Set([
  "test/python-round-performance.cjs",
  "test/python-performance-runner.cjs",
]);
function selectGate(files, gate) {
  if (gate === undefined) return files;
  if (!["correctness", "performance"].includes(gate)) throw new Error(`unknown test gate ${gate}`);
  return files.filter((filename) => performance.has(filename) === (gate === "performance"));
}
module.exports = { selectGate, performance };
