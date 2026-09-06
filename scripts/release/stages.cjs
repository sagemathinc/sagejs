"use strict";

// Required gate inventory shared by persistent hosts and GitHub jobs. A
// single-stage invocation is deliberately not a complete release receipt.
const { targetForHost } = require("../package-qualification/runtime.cjs");
const runtime = ["dist", "packages/flint/build/Release", "packages/graph/build/Release"];
function stage(id, gate, commands, options = {}) {
  return { id, gate, commands, timeoutSeconds: 7200, inputs: runtime, ...options };
}
function plan(profile = "native", selected) {
  const target = targetForHost();
  if (!target) throw new Error("unsupported release host");
  const all = [
    stage("metadata", "integrity", [["pnpm", "test:release"], ["pnpm", "test:installer"]], { inputs: [], timeoutSeconds: 300 }),
    stage("bootstrap", "build", [["pnpm", "bootstrap", "--without-sea"]],
      { inputs: ["build/authenticated-numerical-product"], outputs: runtime }),
    stage("startup", "performance", [["pnpm", "test:startup:run"]], { timeoutSeconds: 300 }),
    stage("strict", "correctness", [["pnpm", "test:baselib:strict"]], { timeoutSeconds: 600 }),
    stage("unit", "correctness", [["pnpm", "test:unit"]]),
    stage("portable", "correctness", [["pnpm", "test:portable"]]),
    stage("integration", "correctness", [["node", "scripts/run-test-tier.cjs", "integration", "--gate", "correctness"]]),
    stage("integration-performance", "performance", [["node", "scripts/run-test-tier.cjs", "integration", "--gate", "performance", "--concurrency", "1"]]),
    stage("native", "correctness", [["pnpm", "test:native:correctness:run"]]),
    stage("native-performance", "performance", [["pnpm", "test:native:performance:run"]]),
    stage("sea", "packaging", [["pnpm", "test:sea:reuse"]], { outputs: ["build/sea"] }),
    stage("npm", "packaging", [["node", "scripts/build-npm-platform-package.cjs", target,
      `build/sea/sagejs${target === "windows-x64" ? ".exe" : ""}`,
      `build/sea/sagepython${target === "windows-x64" ? ".exe" : ""}`]],
    { inputs: ["build/sea", "build/release/npm/sagejs.tgz"], outputs: [`build/release/npm/sagejs-${target}.tgz`] }),
    stage("package-install", "installation", [["node", "scripts/release/package-preflight.cjs"]],
      { inputs: ["build/release/npm/sagejs.tgz", `build/release/npm/sagejs-${target}.tgz`], timeoutSeconds: 600 }),
    stage("oracle", "integrity", [["pnpm", "release:qualify:numerics:oracle", "--",
      "--artifact-directory", "build/numerical-scipy-downloads", "--prefix", "build/numerical-scipy/prefix",
      "--provenance", "build/numerical-scipy/provenance.json", "--download"]],
    { inputs: [], outputs: ["build/numerical-scipy"], timeoutSeconds: 1200 }),
    ...["npm", "sea", "node"].map((subject) => stage(`numerical-${subject}`, "numerical-evidence",
      [["node", "scripts/release/collect-subject.cjs", "{candidate}", subject]], {
        inputs: [...runtime, "build/sea", "build/numerical-scipy", "build/release/npm/sagejs.tgz",
          `build/release/npm/sagejs-${target}.tgz`],
        outputs: [`build/numerical-qualification/platform/${target}/${target}-${subject}`,
          ...(subject === "node" ? [`build/numerical-qualification/platform/${target}/${target}-soak.evidence.json`] : [])],
      })),
  ];
  if (selected) {
    const ids = selected.split(",");
    if (new Set(ids).size !== ids.length) throw new Error("duplicate stage");
    return ids.map((id) => {
      const entry = all.find((item) => item.id === id);
      if (!entry) throw new Error(`unknown release stage ${id}`);
      return entry;
    });
  }
  if (profile !== "native") throw new Error(`unknown profile ${profile}`);
  // Package/install first: a broken consumer install must not wait for soaks.
  const order = ["metadata", "bootstrap", "sea", "npm", "package-install", "startup", "strict",
    target === "linux-x64" ? "unit" : "portable", "integration", "native",
    "integration-performance", "native-performance", "oracle", "numerical-npm", "numerical-sea", "numerical-node"];
  return order.map((id) => all.find((item) => item.id === id));
}
module.exports = { plan };
