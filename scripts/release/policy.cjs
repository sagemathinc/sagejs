"use strict";

// Shadow policy: classifications are proposals for graph refactoring, NOT
// execution switches. All current runner stages remain required. In particular
// a report label must never silently waive mathematical assertions in a mixed
// collector or an upstream dependency of workload enforcement.
const schema = "sagejs.release-policy/v1";
const groups = [
  ["numerical-product public-runtime public-build bootstrap", "C", "build", "Prepare source-bound components and runtime artifacts"],
  ["public-pack sea npm package-install metadata", "P", "distribution", "Assemble and validate exact public packages and installation"],
  ["startup", "P", "runtime", "Enforce user-facing startup latency"],
  ["strict unit portable integration native eclib reference", "C", "qualification", "Validate source semantics and applicable mathematical domains"],
  ["jupyter", "P", "kernel", "Validate the distributed kernel boundary"],
  ["oracle", "C", "numerical-qualification", "Provision the authenticated numerical reference environment"],
  ["numerical-npm numerical-sea numerical-node", "P", "numerical-qualification", "Retain the existing exact product evidence matrix"],
  ["wasm-node wasm-chromium wasm-firefox wasm-webkit wasm-security wasm-workload", "P", "browser", "Validate target behavior, safety and workload coverage"],
  ["integration-performance native-performance", "C", "qualification", "Mixed assertions: retain required coverage until correctness and minor timing ratios are separated"],
  ["wasm-native-timings wasm-chromium-timings wasm-firefox-timings wasm-webkit-timings", "R", "browser-performance", "Proposed reporting lane; extract required correctness/resource assertions and sever publication dependencies before adoption"],
];
const entries = new Map();
for (const [ids, proposedClass, owner, purpose] of groups) {
  for (const id of ids.split(" ")) {
    if (entries.has(id)) throw new Error(`duplicate release policy stage: ${id}`);
    entries.set(id, Object.freeze({ proposedClass, owner, purpose }));
  }
}
function classification(id) {
  const entry = entries.get(id);
  return { schema, mode: "shadow", requiredNow: true, reviewed: !!entry,
    ...(entry || { proposedClass: "P", owner: "unassigned", purpose: "Unknown gate: required pending explicit policy review" }) };
}
module.exports = { schema, classification, stageIds: Object.freeze([...entries.keys()].sort()) };
