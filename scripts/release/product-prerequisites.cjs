#!/usr/bin/env node
"use strict";

// This list is the complete direct browser product boundary, not only the five
// jobs historically covered by browser-release-gates. Keep it in sync with the
// checked workflow, and keep unrelated reporting outside `needs`.
const browserPrerequisites = Object.freeze([
  "node-oracle", "clean-build", "cross-platform-toolchain",
  "windows-prebuilt-artifact", "reproducibility", "browser-parity",
  "browser-security-chromium", "browser-webkit-recovery", "node-wasm-cli",
  "workload-enforcement",
]);

function requireBrowserPrerequisites(needs) {
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    throw new Error("missing browser product prerequisite results");
  }
  const actual = Object.keys(needs).sort();
  const expected = [...browserPrerequisites].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("browser product prerequisite set differs from the reviewed contract");
  }
  const unsuccessful = expected.filter((id) => needs[id]?.result !== "success");
  if (unsuccessful.length) {
    // Print only checked identifiers, not arbitrary JSON from the environment.
    throw new Error(`browser product prerequisites did not succeed: ${unsuccessful.join(", ")}`);
  }
  return { product: "browser", status: "passed", prerequisites: expected };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 2) throw new Error("this assertion takes no command-line overrides");
    let needs;
    try { needs = JSON.parse(process.env.SAGEJS_PRODUCT_NEEDS ?? ""); }
    catch { throw new Error("invalid browser product prerequisite JSON"); }
    console.log(JSON.stringify(requireBrowserPrerequisites(needs)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { browserPrerequisites, requireBrowserPrerequisites };
