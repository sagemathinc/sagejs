import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
  parseEngineList,
} from "../../../../packages/flint-wasm/test/browser-wasm-support.mjs";

const routeDirectory = path.dirname(fileURLToPath(import.meta.url));
const CALL_SAMPLES = 15;
export const repositoryRoot = path.resolve(routeDirectory, "../../../..");
const browserTypes = { chromium, firefox, webkit };

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function failure(stage, message, engine) {
  return {
    stage,
    ...(engine === undefined ? {} : { engine }),
    message: String(message),
  };
}

function resolveInsideRepository(value, label) {
  const filename = path.resolve(repositoryRoot, value);
  if (
    filename !== repositoryRoot &&
    !filename.startsWith(`${repositoryRoot}${path.sep}`)
  ) {
    throw new Error(`${label} must be inside the repository root`);
  }
  return filename;
}

function repositoryUrl(filename) {
  const segments = path.relative(repositoryRoot, filename).split(path.sep);
  return `/${segments.map(encodeURIComponent).join("/")}`;
}

function readIdentity(filename) {
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) return null;
  const bytes = fs.readFileSync(filename);
  return { sha256: sha256(bytes), bytes: bytes.byteLength };
}

function revision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      !["--engines", "--artifact", "--vector", "--output"].includes(key) ||
      value === undefined ||
      options[key] !== undefined
    ) {
      throw new Error(
        "usage: run-browser.mjs --engines LIST --artifact FILE --vector FILE --output FILE",
      );
    }
    options[key] = value;
  }
  for (const key of ["--engines", "--artifact", "--vector", "--output"]) {
    if (options[key] === undefined) throw new Error(`missing required option ${key}`);
  }
  options.engines = parseEngineList(options["--engines"]);
  if (options.engines.length === 0) throw new Error("at least one browser engine is required");
  return options;
}

export function validateVector(value) {
  if (!value || value.schema !== "sagejs.rust-class-group-browser-vector/v1" ||
      typeof value.id !== "string" || value.id.length === 0 ||
      !value.request || typeof value.request !== "object" || Array.isArray(value.request) ||
      !value.expected || typeof value.expected !== "object" || Array.isArray(value.expected)) {
    throw new TypeError("invalid Rust class-group browser vector");
  }
  return value;
}

export function validateReceipt(value) {
  if (!value || value.schema !== "sagejs.rust-class-group-browser-route/v1" ||
      !["pass", "fail"].includes(value.status) ||
      !Array.isArray(value.requested_engines) || value.requested_engines.length === 0 ||
      !Array.isArray(value.engines) || !Array.isArray(value.failures)) {
    throw new TypeError("invalid Rust class-group browser receipt");
  }
  if (value.status === "pass") {
    const requested = [...value.requested_engines].sort();
    const observed = value.engines.map((item) => item.engine).sort();
    if (
      value.failures.length !== 0 ||
      value.artifact?.sha256 == null ||
      value.vector?.sha256 == null ||
      value.engines.length !== value.requested_engines.length ||
      JSON.stringify(observed) !== JSON.stringify(requested) ||
      value.engines.some(
        (item) =>
          item.status !== "pass" ||
          item.route !== "rust-class-group-wasm-artifact" ||
          item.artifact_request_count < 1 ||
          item.cross_origin_isolated !== false ||
          item.shared_array_buffer !== false,
      )
    ) {
      throw new TypeError("passing receipt lacks complete actual-route evidence");
    }
  }
  return value;
}

function writeReceipt(filename, receipt) {
  validateReceipt(receipt);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

async function runEngine({ engine, artifactUrl, vector, server }) {
  const observation = {
    engine,
    status: "fail",
    browser_version: null,
    user_agent: null,
    cross_origin_isolated: null,
    shared_array_buffer: null,
    route: null,
    artifact_request_count: 0,
    imports: [],
    exports: [],
    timings_ms: null,
    memory_pages: null,
    result: null,
    failure: null,
  };
  const browserType = browserTypes[engine];
  const executablePath = executablePathFor(engine, browserType);
  if (!executablePath) {
    observation.failure = failure(
      "browser-discovery",
      `${engine} executable is unavailable`,
      engine,
    );
    return observation;
  }
  let browser;
  try {
    browser = await browserType.launch({
      executablePath,
      headless: true,
      args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
    observation.browser_version = browser.version();
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    const requestStart = server.requests.length;
    const pageStarted = performance.now();
    const routeUrl = repositoryUrl(
      path.join(routeDirectory, "class-group-route.html"),
    );
    await page.goto(
      `${server.origin}${routeUrl}?artifact=${encodeURIComponent(artifactUrl)}`,
      { waitUntil: "load" },
    );
    await page.waitForFunction(() => window.__sagejsClassGroupReady !== undefined);
    await page.evaluate(() => window.__sagejsClassGroupReady);
    const pageLoad = performance.now() - pageStarted;
    const diagnostics = await page.evaluate(() =>
      window.__sagejsClassGroupQualification.diagnostics()
    );
    observation.user_agent = diagnostics.user_agent;
    observation.cross_origin_isolated = diagnostics.cross_origin_isolated;
    observation.shared_array_buffer = diagnostics.shared_array_buffer;
    const samples = [];
    for (let sample = 0; sample < CALL_SAMPLES; sample += 1) {
      samples.push(await page.evaluate(
        (request) => window.__sagejsClassGroupQualification.run(request),
        vector.request,
      ));
    }
    const result = samples.at(-1);
    const callSamples = samples.map((item) => item.timings_ms.call);
    const sortedCalls = [...callSamples].sort((left, right) => left - right);
    observation.route = result.route;
    observation.imports = result.imports;
    observation.exports = result.exports;
    observation.timings_ms = {
      page_load: pageLoad,
      fetch: result.timings_ms.fetch,
      compile: result.timings_ms.compile,
      instantiate: result.timings_ms.instantiate,
      call: sortedCalls[Math.floor(sortedCalls.length / 2)],
      call_samples: callSamples,
    };
    observation.memory_pages = {
      before_call: samples[0].memory_pages.before_call,
      after_call: result.memory_pages.after_call,
    };
    observation.result = result.result;
    observation.artifact_request_count = server.requests.slice(requestStart)
      .filter((request) => request.pathname === artifactUrl).length;
    assert.equal(result.route, "rust-class-group-wasm-artifact");
    assert.equal(
      diagnostics.cross_origin_isolated,
      false,
      "portable route unexpectedly requires isolation",
    );
    assert.equal(
      diagnostics.shared_array_buffer,
      false,
      "portable route unexpectedly exposes SharedArrayBuffer",
    );
    assert.ok(
      observation.artifact_request_count >= 1,
      "candidate was not fetched through the browser server",
    );
    assert.deepEqual(result.result, vector.expected, "candidate returned the wrong class-group result");
    for (const sample of samples) {
      assert.deepEqual(
        sample.result,
        vector.expected,
        "repeated candidate call returned a different result",
      );
    }
    assert.deepEqual(pageErrors, [], "browser page reported errors");
    await page.evaluate(() => window.__sagejsClassGroupQualification.close());
    observation.status = "pass";
    return observation;
  } catch (error) {
    observation.failure = failure("actual-route", error?.stack ?? error, engine);
    return observation;
  } finally {
    await browser?.close();
  }
}

export async function collectReceipt(options) {
  const artifactPath = resolveInsideRepository(options["--artifact"], "artifact");
  const vectorPath = resolveInsideRepository(options["--vector"], "vector");
  const artifactIdentity = readIdentity(artifactPath);
  const vectorIdentity = readIdentity(vectorPath);
  let vector = null;
  const failures = [];
  if (artifactIdentity === null) {
    failures.push(
      failure("preflight", `candidate artifact is missing: ${artifactPath}`),
    );
  }
  if (vectorIdentity === null) {
    failures.push(failure("preflight", `qualification vector is missing: ${vectorPath}`));
  } else {
    try {
      vector = validateVector(JSON.parse(fs.readFileSync(vectorPath, "utf8")));
    } catch (error) {
      failures.push(failure("preflight", error?.stack ?? error));
    }
  }
  const receipt = {
    schema: "sagejs.rust-class-group-browser-route/v1",
    status: "fail",
    observed_at: new Date().toISOString(),
    repository_revision: revision(),
    artifact: {
      path: path.relative(repositoryRoot, artifactPath),
      sha256: artifactIdentity?.sha256 ?? null,
      bytes: artifactIdentity?.bytes ?? null,
    },
    vector: {
      path: path.relative(repositoryRoot, vectorPath),
      sha256: vectorIdentity?.sha256 ?? null,
      id: vector?.id ?? null,
      request: vector?.request ?? null,
      expected: vector?.expected ?? null,
    },
    requested_engines: options.engines,
    engines: [],
    failures,
  };
  if (failures.length > 0) return receipt;
  const server = await createBrowserWasmServer({
    root: repositoryRoot,
    crossOriginIsolation: false,
  });
  try {
    const artifactUrl = repositoryUrl(artifactPath);
    for (const engine of options.engines) {
      const observation = await runEngine({ engine, artifactUrl, vector, server });
      receipt.engines.push(observation);
      if (observation.failure !== null) receipt.failures.push(observation.failure);
    }
  } finally {
    await server.close();
  }
  receipt.status =
    receipt.failures.length === 0 &&
    receipt.engines.length === options.engines.length
      ? "pass"
      : "fail";
  return receipt;
}

async function main(argv) {
  let output = null;
  try {
    const options = parseArguments(argv);
    output = path.resolve(repositoryRoot, options["--output"]);
    const receipt = await collectReceipt(options);
    writeReceipt(output, receipt);
    process.stdout.write(`${JSON.stringify({ status: receipt.status, output })}\n`);
    if (receipt.status !== "pass") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
