import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
  packageRoot,
} from "./browser-wasm-support.mjs";

const PAGE_BYTES = 65_536;
const TREE_SITTER_MAXIMUM_MIB = 384;
const LARGE_SOURCE_BYTES = 1024 * 1024;
const PRESSURE_ITEMS = 250_000;
const INTERRUPT_LIMIT_MS = 5_000;

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function treeSitterContract() {
  const layout = JSON.parse(fs.readFileSync(
    path.join(packageRoot, "release", "production-layout.json"),
    "utf8",
  ));
  assert.equal(layout.schema, "sagejs.wasm-production-layout/v1");
  const domain = layout.importedMemoryDomains?.find(
    (candidate) => candidate.id === "tree-sitter",
  );
  assert.ok(domain, "the production layout has no Tree-sitter memory domain");
  assert.equal(domain.memory.pageBytes, PAGE_BYTES);
  assert.equal(
    domain.memory.maximumPages * PAGE_BYTES,
    TREE_SITTER_MAXIMUM_MIB * 1024 * 1024,
    "the production Tree-sitter ceiling must remain exactly 384 MiB",
  );
  return domain.memory;
}

function artifactIdentity() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(packageRoot, "dist", "production-manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.schema, "sagejs.wasm-production-artifact/v1");
  return manifest.identity;
}

async function waitForMemoryObservation(server, predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = server.memoryObservations.find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("timed out waiting for the WebKit compiler memory observation");
}

function latestTreeSitterMemory(observations, contract) {
  const matches = observations.flatMap((observation) =>
    (observation.memories ?? []).map((memory) => ({
      ...memory,
      phase: observation.phase,
    })),
  ).filter((memory) =>
    memory.initialPages === contract.initialPages &&
    memory.maximumPages === contract.maximumPages,
  );
  assert.ok(matches.length > 0, "WebKit did not instantiate the declared Tree-sitter memory");
  for (const memory of matches) {
    assert.equal(memory.shared, false);
    assert.ok(Number.isInteger(memory.currentPages));
    assert.ok(memory.currentPages >= contract.initialPages);
    assert.ok(
      memory.currentPages <= contract.maximumPages,
      `Tree-sitter grew to ${memory.currentPages} pages, beyond ${contract.maximumPages}`,
    );
  }
  return matches.at(-1);
}

async function evaluate(page, source, timeout = 120_000) {
  return page.evaluate(
    ({ source, timeout }) => window.__sagejsTest.evaluate(source, timeout),
    { source, timeout },
  );
}

async function replaceUnderPressure(page, method) {
  return page.evaluate(({ method, count }) => {
    const source = `pressure = [k^2 for k in range(${count})]\nwhile True:\n    pass`;
    return window.__sagejsTest.replaceDuring(method, source, 250);
  }, { method, count: PRESSURE_ITEMS });
}

const receiptPath = option(
  "--receipt",
  process.env.SAGEJS_WASM_WEBKIT_MEMORY_RECEIPT,
);
const contract = treeSitterContract();
const receipt = {
  schema: "sagejs.webkit-memory-pressure/v1",
  created_at: new Date().toISOString(),
  source_revision: process.env.GITHUB_SHA ?? null,
  artifact_identity: artifactIdentity(),
  engine: "playwright-webkit-linux",
  physical_ios_validation: false,
  tree_sitter_contract: {
    ...contract,
    maximumMiB: contract.maximumPages * contract.pageBytes / (1024 * 1024),
  },
  workload_limits: {
    large_source_bytes: LARGE_SOURCE_BYTES,
    pressure_items: PRESSURE_ITEMS,
    replacement_latency_limit_ms: INTERRUPT_LIMIT_MS,
  },
  status: "running",
};

const executablePath = executablePathFor("webkit", webkit);
assert.ok(executablePath, "Playwright WebKit is required for the memory-pressure gate");
const server = await createBrowserWasmServer({ release: "webkit-memory-pressure" });
const browser = await webkit.launch({ executablePath, headless: true });

try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__sagejsTestOptions = {
      compilerWorker: new URL(
        "/browser-wasm-observed-compiler-worker.mjs",
        window.location.href,
      ),
    };
  });
  await page.goto(`${server.origin}/browser-wasm-harness.html`);
  await page.evaluate(() => window.__sagejsReady);
  console.log("WebKit production kernel initialized");
  assert.ok(
    server.requests.some((request) =>
      request.pathname === "/browser-wasm-observed-compiler-worker.mjs"
    ),
    "the production kernel did not load the observed compiler worker",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  console.log(
    `WebKit compiler observer reports: ${server.memoryObservations.length}`,
  );

  const diagnostics = await page.evaluate(() => window.__sagejsTest.diagnostics());
  receipt.browser = diagnostics;
  receipt.browser_memory_api = {
    performance_memory: diagnostics.memory !== null,
    measure_user_agent_specific_memory: await page.evaluate(
      () => typeof performance.measureUserAgentSpecificMemory === "function",
    ),
    note: "WebKit exposes no standard per-worker heap measurement API; the gate directly observes the injected Tree-sitter WebAssembly.Memory and enforces authenticated Wasm maxima statically.",
  };

  await waitForMemoryObservation(
    server,
    (observation) => observation.memories?.some((memory) =>
      memory.initialPages === contract.initialPages &&
      memory.maximumPages === contract.maximumPages,
    ),
  );

  const paddingLength = LARGE_SOURCE_BYTES - 80;
  const largeSource = `payload = "${"x".repeat(paddingLength)}"\nprint(len(payload))`;
  assert.ok(Buffer.byteLength(largeSource) <= LARGE_SOURCE_BYTES);
  assert.ok(Buffer.byteLength(largeSource) >= LARGE_SOURCE_BYTES - 128);
  const largeStarted = performance.now();
  const large = await evaluate(page, largeSource);
  receipt.large_source = {
    bytes: Buffer.byteLength(largeSource),
    duration_ms: performance.now() - largeStarted,
  };
  assert.equal(large.stdout, `${paddingLength}\n`);
  console.log(`WebKit compiled and evaluated ${Buffer.byteLength(largeSource)} source bytes`);

  const mathematicalSource = `
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^2 - 5)
O = K.maximal_order()
coefficients = K.zeta_function().coefficients(64)
values = K.zeta_function(prec=80).values([2, 3])
real_values = [float(z.real()) for z in values]
print(K.signature(), len(coefficients), coefficients[0])
print(real_values[0] > real_values[1] and real_values[1] > 1.0)
`;
  const mathStarted = performance.now();
  const mathematical = await evaluate(page, mathematicalSource);
  receipt.mathematical_workload = {
    duration_ms: performance.now() - mathStarted,
    stdout: mathematical.stdout,
  };
  assert.equal(mathematical.stdout, "(2, 0) 64 1\nTrue\n");
  console.log("WebKit completed the number-field and analytic workload");

  const interrupted = await replaceUnderPressure(page, "interrupt");
  receipt.interrupt = interrupted;
  assert.equal(interrupted.rejected, true);
  assert.ok(
    interrupted.latency_ms < INTERRUPT_LIMIT_MS,
    `WebKit interrupt took ${interrupted.latency_ms} ms`,
  );
  const afterInterrupt = await evaluate(page, "print(factor(2026))", 30_000);
  assert.equal(afterInterrupt.stdout, "2 * 1013\n");
  console.log("WebKit interrupt recovery passed");

  const reset = await replaceUnderPressure(page, "reset");
  receipt.reset = reset;
  assert.equal(reset.rejected, true);
  assert.ok(
    reset.latency_ms < INTERRUPT_LIMIT_MS,
    `WebKit reset took ${reset.latency_ms} ms`,
  );
  const afterReset = await evaluate(page, `
R.<x> = PolynomialRing(QQ)
K.<a> = NumberField(x^2 - 5)
print(K.zeta_function().coefficients(8))
`, 60_000);
  assert.equal(afterReset.stdout, "[1, 0, 0, 1, 1, 0, 0, 0]\n");
  console.log("WebKit reset recovery passed");

  receipt.tree_sitter_observation = latestTreeSitterMemory(
    server.memoryObservations,
    contract,
  );
  receipt.observation_count = server.memoryObservations.length;
  receipt.status = "passed";
  await context.close();
  console.log(
    "Playwright WebKit production-kernel memory pressure, replacement, and recovery checks passed",
  );
} catch (error) {
  receipt.status = "failed";
  receipt.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await browser.close();
  await server.close();
  if (receiptPath) {
    fs.mkdirSync(path.dirname(path.resolve(receiptPath)), { recursive: true });
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
}
