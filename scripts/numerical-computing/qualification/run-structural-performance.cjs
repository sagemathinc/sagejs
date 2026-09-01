#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  contentId,
  contentDigestPath,
  digestPath,
  platformIdentity,
  repositoryIdentity,
  sha256,
} = require("../common.cjs");
const { writeImmutableJson } = require("../receipt.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const SCHEMA = "sagejs.numerical-structural-performance-evidence/v1";
const COLLECTOR = "scripts/numerical-computing/qualification/run-structural-performance.cjs";
const LOG_LIMIT = 16 * 1024 * 1024;

const GATES = Object.freeze([
  {
    id: "package-graph-lazy-ownership",
    arguments: ["scripts/check-package-graph.cjs"],
    bindings: ["scripts/check-package-graph.cjs", "architecture/package-graph.json"],
  },
  {
    id: "sea-startup-budgets",
    arguments: ["scripts/check-startup-budget.cjs", "--sea"],
    bindings: ["scripts/check-startup-budget.cjs", "architecture/package-graph.json"],
    artifacts: ["build/sea/sagejs"],
  },
  {
    id: "browser-artifact-payload-and-pack-topology",
    arguments: [
      "packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs",
      "--dist", "packages/flint-wasm/dist",
      "--budget", "bench/browser-wasm-budget.json",
      "--require-baseline",
    ],
    report: true,
    bindings: [
      "packages/flint-wasm/scripts/browser-wasm-release-artifact.cjs",
      "bench/browser-wasm-budget.json",
    ],
    artifacts: ["packages/flint-wasm/dist"],
  },
  {
    id: "numerical-trace-presentation-payload",
    arguments: [
      "--test",
      "test/numerics/gallery/root-gallery.test.cjs",
      "test/numerics/gallery/cross-domain-gallery.test.cjs",
    ],
    bindings: [
      "test/numerics/gallery/root-gallery.test.cjs",
      "test/numerics/gallery/cross-domain-gallery.test.cjs",
      "website/numerical-computing/gallery-manifest.json",
      "docs/numerical-computing/gallery/evidence.json",
    ],
  },
  {
    id: "wasm-production-resource-closure",
    arguments: ["--test", "test/wasm-production-resource-closure.cjs"],
    bindings: [
      "test/wasm-production-resource-closure.cjs",
      "architecture/native-kernels.json",
      "packages/wasm-toolchain/lock.json",
      "tools/sea-entry.ts",
      "bench/numerical-computing/qualification/package-adapter.cjs",
      "test/numerics/evidence/qualification-campaign.cjs",
      "test/numerics/evidence/qualification-supplemental.cjs",
    ],
  },
]);

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/run-structural-performance.cjs \\
  --output PATH [--allow-dirty]

Runs the repository's authoritative package-graph/lazy-loading, SEA startup,
browser payload/topology, numerical presentation-payload, and production Wasm
closure gates. Immutable evidence binds every command, policy/source input,
and candidate artifact. Release evidence requires a clean Linux x64 checkout.
`;
}

function parseArguments(argv) {
  const options = { output: null, requireClean: true, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) options.help = true;
    else if (argument === "--allow-dirty") options.requireClean = false;
    else if (argument === "--output") {
      if (options.output !== null) throw new Error("--output may appear only once");
      options.output = argv[++index];
      if (!options.output || options.output.startsWith("--")) {
        throw new Error("--output requires a value");
      }
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!options.help && options.output === null) throw new Error("--output is required");
  return options;
}

function rawFileBinding(relative, label) {
  const binding = digestPath(root, relative, label);
  const absolute = path.join(root, binding.path);
  return {
    ...binding,
    content_sha256: contentDigestPath(root, relative, label),
  };
}

function runGate(gate, temporary) {
  const arguments_ = [...gate.arguments];
  let reportPath = null;
  if (gate.report) {
    reportPath = path.join(temporary, `${gate.id}.json`);
    arguments_.push("--output", reportPath);
  }
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, arguments_, {
    cwd: root,
    encoding: "utf8",
    timeout: 20 * 60_000,
    maxBuffer: LOG_LIMIT,
    env: { ...process.env, SAGEJS_STARTUP_SAMPLES: "11" },
  });
  const elapsed_ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(
      `${gate.id} failed (${result.status ?? result.signal})\n${result.stdout}\n${result.stderr}`,
    );
  }
  const report = reportPath === null ? null : {
    sha256: sha256(fs.readFileSync(reportPath)),
    bytes: fs.statSync(reportPath).size,
    identity: JSON.parse(fs.readFileSync(reportPath, "utf8")).identity,
  };
  return {
    id: gate.id,
    status: "passed",
    command: "<node>",
    arguments: arguments_.map((item) => item === reportPath ? "<temporary-report>" : item),
    elapsed_ms,
    status_code: result.status,
    signal: result.signal,
    stdout_sha256: sha256(result.stdout),
    stderr_sha256: sha256(result.stderr),
    stdout_bytes: Buffer.byteLength(result.stdout),
    stderr_bytes: Buffer.byteLength(result.stderr),
    bindings: gate.bindings.map((relative) => rawFileBinding(relative, `${gate.id} input`)),
    artifacts: (gate.artifacts ?? []).map((relative) =>
      rawFileBinding(relative, `${gate.id} candidate artifact`)),
    report,
  };
}

function buildEvidence(options) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`structural performance evidence requires linux-x64, got ${process.platform}-${process.arch}`);
  }
  const before = repositoryIdentity(root);
  if (options.requireClean && !before.clean) {
    throw new Error("repository must be clean; --allow-dirty is development-only");
  }
  const node = {
    path: fs.realpathSync(process.execPath),
    version: process.version,
    sha256: sha256(fs.readFileSync(fs.realpathSync(process.execPath))),
    bytes: fs.statSync(fs.realpathSync(process.execPath)).size,
  };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-p8-structural-"));
  let gates;
  try {
    gates = GATES.map((gate) => runGate(gate, temporary));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const after = repositoryIdentity(root);
  if (before.commit !== after.commit || before.tree !== after.tree ||
      before.status_sha256 !== after.status_sha256 || before.clean !== after.clean) {
    throw new Error("repository identity changed while structural performance gates executed");
  }
  const core = {
    schema: SCHEMA,
    generated_at: new Date().toISOString(),
    status: "passed",
    repository: after,
    platform: platformIdentity(),
    collector: digestPath(root, COLLECTOR, "structural performance collector"),
    tool: node,
    gates,
    scope: {
      claim: "source-current-authoritative-structural-and-performance-gates",
      package_graph_and_lazy_loading: true,
      fresh_process_sea_startup: true,
      browser_payload_and_pack_topology: true,
      numerical_trace_and_presentation_payload: true,
      production_wasm_resource_closure: true,
    },
  };
  return { ...core, id: contentId(core) };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const evidence = buildEvidence(options);
  writeImmutableJson(options.output, evidence);
  process.stdout.write(`passed: ${evidence.id} -> ${path.resolve(options.output)}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { GATES, SCHEMA, buildEvidence, main, parseArguments, usage };
