"use strict";
// Actual timing experiments, not tests of benchmark-policy correctness. New
// entries require review; default correctness classification never drops work.
const performance = new Set([
  // Includes exact host-boundary checks, but also compares independent RREF
  // and pivot wall-clock samples. Keep the entire file in the required serial
  // gate: parallel correctness workers can distort that comparison.
  "test/dense-prime-host-boundary.cjs",
  "test/python-round-performance.cjs",
  "test/python-performance-runner.cjs",
]);
function selectGate(files, gate) {
  if (gate === undefined) return files;
  if (!["correctness", "performance"].includes(gate)) throw new Error(`unknown test gate ${gate}`);
  return files.filter((filename) => performance.has(filename) === (gate === "performance"));
}
module.exports = { selectGate, performance };
