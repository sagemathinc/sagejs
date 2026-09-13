#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createBrowserDriver, runPerformance, selectPerformanceWorkloads, validatePerformanceWorkloads } from "./browser-wasm-performance.mjs";
import { repositoryRoot, packageRoot } from "../packages/flint-wasm/test/browser-wasm-support.mjs";

const require = createRequire(import.meta.url);
const { ACCEPTANCE_SCHEMA, validateAcceptanceReceipt } = require("../scripts/wasm-workload-dashboard.cjs");
const { validateProductionReceipt } = require("../packages/flint-wasm/scripts/production-receipt.cjs");
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export async function collectAcceptance(driver, { workloads, workloadIdentity, selection, sourceRevision, budgetIdentity, maximumInterruptLatencyMs, artifactIdentity, buildReceiptIdentity, onProgress }) {
  if (!/^[a-f0-9]{40}$/.test(sourceRevision ?? "")) throw new Error("acceptance needs an exact source revision");
  // Execute the same sources cold and warm, but no repeated measurement or
  // measureUserAgentSpecificMemory calls. Driver and sessions close on failure.
  const selectedIds = new Set(selection.case_ids);
  const measured = await runPerformance(driver, { ...workloads, cases: workloads.cases.filter((item) => selectedIds.has(item.id)) }, 1, workloadIdentity, { collectMemory: false, onProgress });
  const receipt = {
    schema: ACCEPTANCE_SCHEMA, status: "passed", runtime: measured.runtime,
    source_revision: sourceRevision, workload_identity: workloadIdentity,
    artifact_identity: artifactIdentity, build_receipt_identity: buildReceiptIdentity,
    workload_selection: selection, safety_budget_identity: budgetIdentity,
    interrupt: { rejected: true, latency_ms: measured.interrupt_latency_ms.maximum },
    operations: Object.fromEntries(Object.entries(measured.operations).map(([id, operation]) => [id, {
      status: "passed", family: operation.family,
      required_capability_routes: operation.required_capability_routes,
      instrumentation: operation.instrumentation,
    }])),
    diagnostics: measured.diagnostics,
    scope: "Execution, private cold/warm routes and interrupt safety only; mathematical parity and memory/security qualification remain separate required gates",
  };
  validateAcceptanceReceipt(receipt, { workloads: workloads.cases, workloadIdentity, budgetIdentity, maximumInterruptLatencyMs });
  return receipt;
}

export function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!["--engine", "--shard", "--output"].includes(key) || !args[index + 1] || args[index + 1].startsWith("--") || Object.hasOwn(options, key)) {
      throw new Error("usage: browser-wasm-workload-acceptance.mjs --engine chromium|firefox|webkit --output FILE [--shard INDEX/COUNT]");
    }
    options[key] = args[index + 1];
  }
  if (!["chromium", "firefox", "webkit"].includes(options["--engine"]) || !options["--output"]) throw new Error("acceptance requires an engine and output path");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const git = (args) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
  const sourceRevision = git(["rev-parse", "HEAD"]);
  if (git(["status", "--porcelain", "--untracked-files=normal"])) throw new Error("acceptance requires a clean source checkout");
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sourceRevision) throw new Error("acceptance source differs from GITHUB_SHA");
  const workloadBytes = fs.readFileSync(path.join(repositoryRoot, "bench/browser-wasm-performance-cases.json"));
  const budgetBytes = fs.readFileSync(path.join(repositoryRoot, "bench/browser-wasm-budget.json"));
  const workloads = validatePerformanceWorkloads(JSON.parse(workloadBytes));
  const budget = JSON.parse(budgetBytes);
  if (budget.schema !== "sagejs.browser-wasm-budget/v1" || !Number.isFinite(budget.thresholds?.maximum_interrupt_latency_ms) || budget.thresholds.maximum_interrupt_latency_ms <= 0) throw new Error("invalid acceptance safety budget");
  const selected = selectPerformanceWorkloads(workloads, options["--shard"]);
  const verifyArtifact = () => {
    const checked = validateProductionReceipt({ packageRoot, outputDirectory: path.join(packageRoot, "dist") });
    if (!checked.valid || checked.receipt.source?.gitCommit !== sourceRevision) throw new Error(`acceptance requires the exact source's valid production artifact: ${checked.reason ?? "source mismatch"}`);
    return { artifactIdentity: checked.identity,
      buildReceiptIdentity: digest(fs.readFileSync(path.join(packageRoot, "dist/build-receipt.json"))) };
  };
  const artifact = verifyArtifact();
  const receipt = await collectAcceptance(await createBrowserDriver(options["--engine"]), {
    workloads, workloadIdentity: digest(workloadBytes), selection: selected.selection,
    sourceRevision, budgetIdentity: digest(budgetBytes), maximumInterruptLatencyMs: budget.thresholds.maximum_interrupt_latency_ms,
    ...artifact,
    onProgress: ({ index, count, id, state }) => console.log(`[workload-acceptance] ${state} ${index + 1}/${count} ${id}`),
  });
  if (git(["rev-parse", "HEAD"]) !== sourceRevision || git(["status", "--porcelain", "--untracked-files=normal"])) throw new Error("acceptance source changed during collection");
  if (JSON.stringify(verifyArtifact()) !== JSON.stringify(artifact)) throw new Error("acceptance artifact changed during collection");
  const output = path.resolve(options["--output"]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(temporary, output);
  console.log(`Workload acceptance passed: ${options["--engine"]}, ${selected.workloads.cases.length} workloads; no timing ratios or memory sampling`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
