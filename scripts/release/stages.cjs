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
    stage("numerical-product", "integrity", [
      ["node", "packages/wasm-toolchain/scripts/toolchain.cjs", "prepare"],
      ["node", "packages/wasm-toolchain/scripts/probe.cjs"],
      ["node", "packages/flint-wasm/numerical/scripts/build-all.cjs"],
      ["node", "scripts/numerical-product.cjs", "publish", "--output", "build/authenticated-numerical-product"],
      ["node", "src/lib/sagejs/numerics/optimization/backends/nlopt/scripts/verify-release.cjs", "--require-qualified"],
    ], { inputs: [], outputs: ["build/authenticated-numerical-product"] }),
    stage("public-build", "build", [["pnpm", "build"], ["pnpm", "--dir", "packages/flint-wasm", "build"],
      ["node", "scripts/numerical-product.cjs", "validate-installed"],
      ["node", "packages/flint-wasm/scripts/production-receipt.cjs", "validate"],
      ["node", "packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs", "--dist", "packages/flint-wasm/dist",
        "--budget", "bench/browser-wasm-budget.json", "--require-baseline"]],
    { inputs: ["build/authenticated-numerical-product"], outputs: ["packages/flint-wasm/dist", "dist"] }),
    stage("public-pack", "packaging", [["node", "scripts/release/pack-root.cjs"]],
      { inputs: ["dist", "packages/flint-wasm/dist"], outputs: ["build/release/npm/sagejs.tgz"] }),
    stage("metadata", "integrity", [["pnpm", "test:release"],
      ...(target.startsWith("linux-") ? [["pnpm", "test:installer"]] : [])], { inputs: [], timeoutSeconds: 300 }),
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
    stage("eclib", "correctness", [["pnpm", "--dir", "packages/flint", "test:eclib:corpus"]]),
    stage("reference", "correctness", [["pnpm", "docs:verify"], ["pnpm", "test:upstream:run"]]),
    stage("jupyter", "installation", [["pnpm", "test:jupyter:sea"]], { inputs: [...runtime, "build/sea"] }),
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
    stage("wasm-node", "correctness", [
      ["node", "packages/flint-wasm/test/browser-wasm-node-parity.cjs", "--tier", "release", "--receipt", "build/wasm-node-oracle.json"],
      ["node", "packages/flint-wasm/scripts/node-cli-parity.cjs", "--tier", "release", "--receipt", "build/wasm-node-cli-parity.json"],
      ["pnpm", "wasm:workload-enforce"],
    ], { inputs: [...runtime, "packages/flint-wasm/dist"], outputs: ["build/wasm-node-oracle.json", "build/wasm-node-cli-parity.json"] }),
    ...["chromium", "firefox", "webkit"].map((engine) => stage(`wasm-${engine}`, "correctness",
      [["node", "packages/flint-wasm/test/browser-wasm-parity.mjs", "--tier", "release", "--engines", engine,
        "--require-engines", engine, "--receipt", `build/wasm-parity-${engine}.json`]],
      { inputs: ["packages/flint-wasm/dist"], outputs: [`build/wasm-parity-${engine}.json`] })),
    stage("wasm-security", "correctness", [
      ["node", "--test", "packages/flint-wasm/test/browser-wasm-wasi-quota.test.mjs"],
      ...["browser-wasm-serialization", "browser-wasm-security", "browser-wasm-offline-cache",
        "browser-wasm-webkit-file-origin", "browser-wasm-webkit-memory"].map((name) => ["node", `packages/flint-wasm/test/${name}.mjs`]),
      ["node", "website/live/test/browser-cache-integrity.mjs"],
    ], { inputs: ["packages/flint-wasm/dist"] }),
    stage("wasm-native-timings", "performance-report", [["node", "bench/browser-wasm-performance.mjs",
      "--runtime", "node-native", "--samples", "7", "--budget", "bench/browser-wasm-budget.json",
      "--require-baseline", "--report-regressions", "--output", "build/wasm-performance-node-native.json"]],
    { inputs: runtime, outputs: ["build/wasm-performance-node-native.json"] }),
    ...["chromium", "firefox", "webkit"].map((engine) => stage(`wasm-${engine}-timings`, "performance-report",
      [["node", "bench/browser-wasm-performance.mjs", "--engine", engine, "--samples", "3",
        "--native-reference", "build/wasm-performance-node-native.json", "--budget", "bench/browser-wasm-budget.json",
        "--require-baseline", "--report-regressions", "--output", `build/wasm-performance-${engine}.json`]],
      { inputs: ["packages/flint-wasm/dist", "build/wasm-performance-node-native.json"], outputs: [`build/wasm-performance-${engine}.json`] })),
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
  if (profile === "canonical") return ["numerical-product", "public-build", "public-pack"].map((id) => all.find((item) => item.id === id));
  if (profile === "browser") return all.filter((item) => item.id.startsWith("wasm-"));
  if (profile !== "native") throw new Error(`unknown profile ${profile}`);
  // Package/install first: a broken consumer install must not wait for soaks.
  const order = ["metadata", "bootstrap", "sea", "npm", "package-install", "startup", "strict",
    target === "linux-x64" ? "unit" : "portable",
    ...(target === "linux-arm64" ? [] : ["integration", "integration-performance"]), "native",
    ...(target === "linux-x64" ? ["eclib", "reference", "jupyter"] : []),
    "native-performance", "oracle", "numerical-npm", "numerical-sea", "numerical-node"];
  return order.map((id) => all.find((item) => item.id === id));
}
module.exports = { plan };
