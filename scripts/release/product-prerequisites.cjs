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
// Deliberately list the full producer closure, not just the final numerical
// assembler. Publication/recovery and the non-release smoke lane are excluded.
const nativePrerequisites = Object.freeze([
  "routine", "numerical-product", "public-npm-root", "linux-x64", "linux-arm64",
  "windows-x64", "macos-arm64", "macos-sign", "numerical-browser-qualification",
  "numerical-release-gate",
]);

function requireProductPrerequisites(kind, needs) {
  const prerequisites = { browser: browserPrerequisites, native: nativePrerequisites }[kind];
  if (!["browser", "native"].includes(kind)) throw new Error("unknown product kind");
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    throw new Error(`missing ${kind} product prerequisite results`);
  }
  const actual = Object.keys(needs).sort();
  const expected = [...prerequisites].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${kind} product prerequisite set differs from the reviewed contract`);
  }
  const unsuccessful = expected.filter((id) => needs[id]?.result !== "success");
  if (unsuccessful.length) {
    // Print only checked identifiers, not arbitrary JSON from the environment.
    throw new Error(`${kind} product prerequisites did not succeed: ${unsuccessful.join(", ")}`);
  }
  return { product: kind, status: "passed", prerequisites: expected };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error("specify exactly one product kind: browser or native");
    let needs;
    try { needs = JSON.parse(process.env.SAGEJS_PRODUCT_NEEDS ?? ""); }
    catch { throw new Error("invalid product prerequisite JSON"); }
    console.log(JSON.stringify(requireProductPrerequisites(process.argv[2], needs)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { browserPrerequisites, nativePrerequisites, requireProductPrerequisites };
