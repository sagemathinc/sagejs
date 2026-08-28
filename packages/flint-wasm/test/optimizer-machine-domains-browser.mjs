import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";

import {
  createBrowserWasmServer,
  executablePathFor,
  packageRoot,
  parseEngineList,
  repositoryRoot,
} from "./browser-wasm-support.mjs";

const require = createRequire(import.meta.url);
const { workspaceFingerprint } = require("../../../scripts/build-receipt.cjs");
const {
  canonicalJson,
  createBrowserReceipt,
  validateBrowserReceipt,
} = require("../../../tools/optimizer-development/promotion.cjs");
const {
  validateProductionReceipt,
} = require("../scripts/production-receipt.cjs");

const browserTypes = { chromium, firefox, webkit };
const sizes = new Map([
  ["bounded-integer", 10_000],
  ["strict-binary64-array", 2_000],
  ["prime-residue-batch", 500],
  ["fixed-extension", 100],
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function currentSourceIdentity() {
  return {
    commit: git(["rev-parse", "HEAD"]),
    tree: git(["rev-parse", "HEAD^{tree}"]),
    workspace_id: `sha256:${workspaceFingerprint(repositoryRoot)}`,
    clean: git(["status", "--porcelain=v1", "--untracked-files=all"]) === "",
  };
}

export function productionArtifactIdentity() {
  const outputDirectory = path.join(packageRoot, "dist");
  const result = validateProductionReceipt({ packageRoot, outputDirectory });
  if (!result.valid) throw new Error(`invalid production Wasm artifact: ${result.reason}`);
  const receiptFilename = path.join(outputDirectory, "build-receipt.json");
  return {
    status: "verified",
    kind: "wasm-production",
    id: result.identity,
    source_commit: result.receipt.source.gitCommit,
    source_closure_id: `sha256:${result.receipt.source.closure.sha256}`,
    manifest_sha256: result.receipt.productionManifestSha256,
    receipt_sha256: sha256(fs.readFileSync(receiptFilename)),
  };
}

export function parseArguments(argv = process.argv.slice(2), environment = process.env) {
  function argument(name) {
    const index = argv.indexOf(name);
    if (index === -1) return null;
    if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
    return argv[index + 1];
  }
  const engines = parseEngineList(
    argument("--engines") ?? environment.SAGEJS_BROWSER_ENGINES ??
      "chromium,firefox,webkit",
  );
  const required = parseEngineList(
    argument("--required-engines") ?? environment.SAGEJS_REQUIRED_BROWSER_ENGINES ??
      engines.join(","),
  );
  for (const engine of required) {
    if (!engines.includes(engine)) throw new Error(`required engine ${engine} is not selected`);
  }
  return {
    engines,
    required: new Set(required),
    receipt: argument("--receipt"),
  };
}

export function evaluationSource(specification, withContract) {
  const size = sizes.get(specification.domain);
  return `${specification.sageDefinition(size, withContract)}
_machine_resource_before = _machine_resource_count()
${specification.invocation}
_machine_resource_after_first = _machine_resource_count()
${specification.invocation}
_machine_resource_after_second = _machine_resource_count()
print('RESULT|' + _machine_encode(_machine_answer))
print('RESOURCE|' + str(_machine_resource_before) + '|' + str(_machine_resource_after_first) + '|' + str(_machine_resource_after_second))
`;
}

export function parseEvaluation(result, label) {
  const lines = result.stdout.replaceAll("\r\n", "\n").trimEnd().split("\n");
  const resultLine = lines.find((line) => line.startsWith("RESULT|"));
  const resourceLine = lines.find((line) => line.startsWith("RESOURCE|"));
  assert.ok(resultLine, `${label} result line`);
  assert.ok(resourceLine, `${label} resource line`);
  const counts = resourceLine.split("|").slice(1).map(Number);
  assert.equal(counts.length, 3, `${label} resource count arity`);
  assert.ok(counts.every((value) => Number.isSafeInteger(value) && value >= 0),
    `${label} resource counts`);
  return { output: resultLine.slice("RESULT|".length), resources: counts };
}

export function detachedRoutes(result) {
  assert.equal(result.optimization?.authority, "compiler-verified-static");
  return (result.optimization.program.regions ?? []).map((region) => ({
    pass_id: region.passId,
    selected: region.selected,
    lowering: region.target.lowering,
    representation: region.representation.kind,
    target: region.target.kind,
    fallback_id: region.fallbackId,
    candidates: (region.target.candidates ?? []).map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      availability: candidate.availability,
      rejection_reason: candidate.rejectionReason ?? null,
    })),
  }));
}

export function domainEvidence(specification, source, optimized, generic) {
  assert.equal(optimized.stderr, "", `${specification.domain} optimized stderr`);
  assert.equal(generic.stderr, "", `${specification.domain} O0 stderr`);
  const fast = parseEvaluation(optimized, `${specification.domain} O2`);
  const slow = parseEvaluation(generic, `${specification.domain} O0`);
  assert.equal(fast.output, slow.output, `${specification.domain} O2/O0 differential`);
  const o2Routes = detachedRoutes(optimized);
  const o0Routes = detachedRoutes(generic);
  assert.deepEqual(
    o2Routes.filter((route) => route.selected).map((route) => route.pass_id).sort(),
    [specification.expectedPassId],
    `${specification.domain} selected route`,
  );
  assert.deepEqual(o0Routes.filter((route) => route.selected), [],
    `${specification.domain} O0 route`);
  const [before, afterFirst, afterSecond] = fast.resources;
  const ceiling = before + 128;
  const highWater = Math.max(before, afterFirst, afterSecond);
  assert.ok(highWater <= ceiling,
    `${specification.domain} resource high-water ${highWater} exceeds ${ceiling}`);
  return {
    domain: specification.domain,
    source_sha256: sha256(source),
    expected_pass_id: specification.expectedPassId,
    status: "pass",
    o0: {
      output_sha256: sha256(slow.output),
      stderr_sha256: sha256(generic.stderr),
      routes: o0Routes,
    },
    o2: {
      output_sha256: sha256(fast.output),
      stderr_sha256: sha256(optimized.stderr),
      routes: o2Routes,
    },
    resources: {
      status: "pass",
      before,
      after_first: afterFirst,
      after_second: afterSecond,
      high_water: highWater,
      ceiling,
    },
  };
}

const guardFallbackSource = `
from sagejs.compiler import optimize
@optimize(require="math.strict-float-region.v1", target="v8", guard_failure="fallback")
def _machine_guard_workload(count: int, value: float, multiplier: float):
    for index in range(count):
        value = value*multiplier
    return value
print(_machine_guard_workload(3, 2, 3))
`;
const guardFallbackGenericSource = guardFallbackSource
  .replace("from sagejs.compiler import optimize\n", "")
  .replace(
    '@optimize(require="math.strict-float-region.v1", target="v8", guard_failure="fallback")\n',
    "",
  );

async function evaluate(page, source, level, timeout = 60_000) {
  return page.evaluate(
    ([program, optimizationLevel, limit]) =>
      window.__sagejsTest.evaluate(program, limit, optimizationLevel),
    [source, level, timeout],
  );
}

async function guardFallbackEvidence(page) {
  const optimized = await evaluate(page, guardFallbackSource, "O2");
  const generic = await evaluate(page, guardFallbackGenericSource, "O0");
  assert.equal(optimized.stderr, "");
  assert.equal(generic.stderr, "");
  assert.equal(optimized.stdout, generic.stdout, "guard fallback O2/O0 differential");
  assert.deepEqual(
    detachedRoutes(optimized).filter((route) => route.selected).map((route) => route.pass_id),
    ["math.strict-float-region.v1"],
  );
  return {
    status: "pass",
    pass_id: "math.strict-float-region.v1",
    optimized_output_sha256: sha256(optimized.stdout),
    generic_output_sha256: sha256(generic.stdout),
  };
}

async function recoveryEvidence(page) {
  const interrupted = await page.evaluate(
    (source) => window.__sagejsTest.replaceDuring("interrupt", source, 100),
    "while True:\n    pass\n",
  );
  assert.equal(interrupted.rejected, true, "interruption rejected evaluation");
  assert.ok(interrupted.latency_ms < 10_000, "interruption latency ceiling");
  const recovered = await evaluate(page, "print(42)", "O2");
  assert.equal(recovered.stderr, "");
  assert.equal(recovered.stdout, "42\n");
  return {
    status: "pass",
    interrupted: true,
    recovered_output_sha256: sha256(recovered.stdout),
  };
}

function normalizedDiagnostics(value) {
  return {
    cross_origin_isolated: value.cross_origin_isolated,
    shared_array_buffer: value.shared_array_buffer,
    hardware_concurrency: value.hardware_concurrency,
    user_agent: value.user_agent,
    js_heap_size_limit: value.memory?.js_heap_size_limit ?? null,
  };
}

export async function runBrowserEvidence(options = parseArguments()) {
  const { workloadSpecifications } = require(
    "../../../bench/optimizer-machine-corpus/harness.cjs",
  );
  const specifications = workloadSpecifications().filter(
    (specification) => sizes.has(specification.domain),
  );
  assert.equal(specifications.length, 4, "all four executable machine domains");
  const sourceIdentity = currentSourceIdentity();
  const artifactIdentity = productionArtifactIdentity();
  if (options.receipt) {
    assert.equal(sourceIdentity.clean, true, "receipt source must be clean");
    assert.equal(artifactIdentity.source_commit, sourceIdentity.commit,
      "receipt artifact must be built from current commit");
  }
  const engineEvidence = [];
  const server = await createBrowserWasmServer();
  try {
    for (const engine of options.engines) {
      const browserType = browserTypes[engine];
      const executablePath = executablePathFor(engine, browserType);
      if (!executablePath) {
        if (options.required.has(engine)) throw new Error(`${engine} is required but unavailable`);
        continue;
      }
      const browser = await browserType.launch({
        executablePath,
        headless: true,
        args: engine === "chromium"
          ? ["--no-sandbox", "--disable-dev-shm-usage"]
          : [],
      });
      try {
        const page = await browser.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(String(error)));
        await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
        await page.waitForFunction(() => window.__sagejsReady !== undefined);
        await page.evaluate(() => window.__sagejsReady);
        const diagnostics = normalizedDiagnostics(
          await page.evaluate(() => window.__sagejsTest.diagnostics()),
        );
        const domains = [];
        for (const specification of specifications) {
          const optimizedSource = evaluationSource(specification, true);
          const genericSource = evaluationSource(specification, false);
          const optimized = await evaluate(page, optimizedSource, "O2");
          const generic = await evaluate(page, genericSource, "O0");
          domains.push(domainEvidence(specification, optimizedSource, optimized, generic));
          console.log(
            `${engine}: ${specification.domain} selected ${specification.expectedPassId}; ` +
              "exact O2/O0 and resource evidence passed",
          );
        }
        const guardFallback = await guardFallbackEvidence(page);
        const recovery = await recoveryEvidence(page);
        assert.deepEqual(pageErrors, [], `${engine} page errors`);
        engineEvidence.push({
          engine,
          version: await browser.version(),
          status: "pass",
          diagnostics,
          domains,
          guard_fallback: guardFallback,
          recovery,
          source_sampling: {
            status: "unavailable",
            reason_code: "browser.uniform-source-sampling-unavailable",
          },
          page_errors: pageErrors,
        });
        await page.evaluate(() => window.__sagejsTest.close());
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }
  for (const required of options.required) {
    assert.ok(engineEvidence.some((entry) => entry.engine === required),
      `${required} evidence is required`);
  }
  const receipt = createBrowserReceipt({
    source: sourceIdentity,
    artifact: artifactIdentity,
    engines: engineEvidence,
  });
  validateBrowserReceipt(receipt, { current_checkout: sourceIdentity });
  if (options.receipt) {
    fs.writeFileSync(path.resolve(options.receipt),
      `${JSON.stringify(JSON.parse(canonicalJson(receipt)), null, 2)}\n`);
    console.log(`browser receipt: ${receipt.id} -> ${path.resolve(options.receipt)}`);
  }
  return receipt;
}

const invokedAsScript = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await runBrowserEvidence();
