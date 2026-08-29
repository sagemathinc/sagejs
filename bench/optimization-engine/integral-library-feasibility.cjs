#!/usr/bin/env node
"use strict";

// Receipt runner for integral-library-feasibility.py.  Platform authority is
// earned only by executing that source in the named runtime; this program does
// not turn a portability specification or an unavailable browser into a pass.

const { createHash } = require("node:crypto");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../..");
const pythonRelative = "bench/optimization-engine/integral-library-feasibility.py";
const runnerRelative = "bench/optimization-engine/integral-library-feasibility.cjs";
const testRelative = "test/optimization-integral-library-feasibility.cjs";
const pythonPath = join(root, pythonRelative);
const prefix = "SAGEJS_INTEGRAL_FEASIBILITY|";
const frozenEpochId =
  "sha256:a8f9f317c7945ddcd931ae8eabe6482fd5feef2c95199cdcd7bd1b00a5390bb3";

const frozenEvidence = Object.freeze([
  {
    filename: "campaign2-integral-isolated-measurement.json",
    sha256: "b9078e53edde483f6e4dfeb039a2037e13ffa47df71dd154c0155138b0ac1f4b",
    authority: "isolated-linux-paired-measurement",
  },
  {
    filename: "campaign2-integral-isolated-provenance.json",
    sha256: "43853a10cf96d2c149b697fb723f7c3de5666d38be89c126a97b83537c71f902",
    authority: "isolated-linux-provenance",
  },
  {
    filename: "campaign2-integral-isolated-validation.json",
    sha256: "14861d16e2b0253cfff1072e125a71c4c8c0e0813dfd53d5cbd74f22c4c2f74e",
    authority: "isolated-linux-validation",
  },
  {
    filename: "campaign2-integral-guard-failure-interrupt.json",
    sha256: "9f6f616f0d7a5d91d6693a75ef8bf02c362e29da5a81ccdc544c220b6469385f",
    authority: "ancillary-guard-failure-interrupt-audit",
  },
  {
    filename: "campaign2-integral-browser-fallback.json",
    sha256: "26102b0e45dab4aa331a918fd082e984a34787dd1e83a156645ba4df725c9309",
    authority: "frozen-chromium-generic-fallback-execution",
  },
  {
    filename: "campaign2-integral-windows-portability.json",
    sha256: "65d1f39dbe839dfd4abb7a75848de4ec90f345a6dd440faf1eb9f411b6098503",
    authority: "portability-contract-not-windows-execution",
  },
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function git(args, allowFailure = false) {
  const result = command("git", args);
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result;
}

function option(argv, name, fallback = undefined) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  if (index + 1 >= argv.length) throw new Error(`${name} requires a value`);
  return argv[index + 1];
}

function flag(argv, name) {
  return argv.includes(name);
}

function platformId() {
  const operatingSystem = {
    win32: "windows",
    darwin: "macos",
  }[process.platform] ?? process.platform;
  return `${operatingSystem}-${process.arch}`;
}

function trackedFileIdentity(relative) {
  const bytes = readFileSync(join(root, relative));
  const head = git(["show", `HEAD:${relative}`], true);
  return {
    path: relative,
    bytes: bytes.length,
    sha256: sha256(bytes),
    trackedAtHead: head.status === 0,
    exactHeadBytes: head.status === 0 && sha256(Buffer.from(head.stdout)) === sha256(bytes),
  };
}

function sourceIdentity() {
  const files = [pythonRelative, runnerRelative]
    .filter((relative) => existsSync(join(root, relative)))
    .map(trackedFileIdentity);
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const tree = git(["rev-parse", "HEAD^{tree}"]).stdout.trim();
  const scoped = git([
    "status", "--porcelain", "--untracked-files=all", "--",
    pythonRelative, runnerRelative, testRelative,
  ]).stdout.trim();
  return {
    commit: head,
    tree,
    files,
    scopedClean: scoped.length === 0,
    scopedStatus: scoped.length === 0 ? [] : scoped.split("\n"),
    exactCurrent:
      files.length === 2 && files.every((file) => file.exactHeadBytes) && scoped.length === 0,
  };
}

function bindFrozenEvidence(directory) {
  const records = frozenEvidence.map((expected) => {
    const path = resolve(directory, expected.filename);
    if (!existsSync(path)) {
      return { ...expected, path, present: false, digestMatches: false, epochMatches: false };
    }
    const bytes = readFileSync(path);
    let epochMatches = false;
    let schema = null;
    try {
      const parsed = JSON.parse(bytes);
      schema = parsed.schema ?? null;
      epochMatches = (parsed.epochId ?? parsed.frozenEpochId) === frozenEpochId;
    } catch {
      // A digest match is still impossible for malformed canonical evidence.
    }
    return {
      ...expected,
      path,
      present: true,
      observedSha256: sha256(bytes),
      digestMatches: sha256(bytes) === expected.sha256,
      schema,
      epochMatches,
    };
  });
  return {
    directory: resolve(directory),
    records,
    complete: records.every((record) => record.digestMatches && record.epochMatches),
  };
}

function parseExecution(stdout) {
  const line = stdout.split(/\r?\n/).find((item) => item.startsWith(prefix));
  if (!line) throw new Error(`missing ${prefix} output`);
  const execution = JSON.parse(line.slice(prefix.length));
  if (execution.schema !== "sagejs.optimization-integral-library-feasibility-execution/v1") {
    throw new Error(`unexpected execution schema ${execution.schema}`);
  }
  if (execution.frozenEpochId !== frozenEpochId) {
    throw new Error("execution did not bind the frozen discovery epoch");
  }
  if (execution.roles.length !== 2) throw new Error("both reviewed roles must execute");
  if (!execution.staticGuardContract?.allExact) throw new Error("static guard audit failed");
  return execution;
}

function baseReceipt(kind, argv) {
  const source = sourceIdentity();
  const evidenceDirectory = option(argv, "--frozen-evidence-dir", "/scratch");
  return {
    schema: "sagejs.optimization-integral-library-feasibility-receipt/v1",
    frozenEpochId,
    kind,
    source,
    frozenEvidence: bindFrozenEvidence(evidenceDirectory),
    host: {
      platform: platformId(),
      node: process["ver" + "sion"],
      v8: process["ver" + "sions"].v8,
    },
    claims: {
      productionSourceModifiedByTarget: false,
      candidateImplementedInProduction: false,
      directSynchronousHardLatencyBound: false,
    },
  };
}

function validateNodeExecution(execution) {
  if (execution.hostPolicy !== "node-dynamic-ffi") {
    throw new Error(`Node unexpectedly used ${execution.hostPolicy}`);
  }
  if (execution.executedRoute !== "bounded-flint-block-candidate") {
    throw new Error(`Node unexpectedly executed ${execution.executedRoute}`);
  }
  for (const role of execution.roles) {
    const calls = Math.ceil(role.sourceLength / role.prime);
    if (role.successState.nativeCalls !== calls || role.successState.publications !== 1) {
      throw new Error(`${role.role} success accounting is incomplete`);
    }
    if (role.nativeFalseSchedules.length !== calls ||
        role.nativeExceptionSchedules.length !== calls ||
        role.nativeKeyboardInterruptSchedules.length !== calls) {
      throw new Error(`${role.role} did not exhaust native injection schedules`);
    }
    if (role.pollInterruptionSchedules.length !== 3 * calls + 2) {
      throw new Error(`${role.role} did not exhaust interrupt checkpoints`);
    }
    if (!role.noPartialPublication || !role.successfulRetry.exact) {
      throw new Error(`${role.role} failed transactionality or retry`);
    }
  }
}

function finalize(receipt, argv) {
  const runtimeArtifactExact = receipt.kind !== "browser" ||
    receipt.browserRelease?.exactCurrent === true;
  receipt.authority = {
    executionPassed: receipt.status === "passed",
    sourceExactCurrent: receipt.source.exactCurrent,
    runtimeArtifactExactCurrent: runtimeArtifactExact,
    frozenEvidenceBound: receipt.frozenEvidence.complete,
    executedPlatform: receipt.status === "passed" ? receipt.executedPlatform : null,
    exactCurrentExecution:
      receipt.status === "passed" && receipt.source.exactCurrent && runtimeArtifactExact,
    promotionAuthority: false,
    reason:
      "This bench-only receipt establishes feasibility; promotion requires the production candidate epoch and its required platform matrix.",
  };
  if (flag(argv, "--require-exact-current") && !receipt.authority.exactCurrentExecution) {
    throw new Error("execution was not produced from exact HEAD bytes in a clean claimed scope");
  }
  if (flag(argv, "--require-frozen-evidence") && !receipt.frozenEvidence.complete) {
    throw new Error("one or more frozen evidence artifacts were absent or did not match");
  }
  const requiredPlatform = option(argv, "--require-platform");
  if (requiredPlatform && receipt.executedPlatform !== requiredPlatform) {
    throw new Error(
      `receipt executed ${receipt.executedPlatform ?? "no platform"}, not ${requiredPlatform}`,
    );
  }
  if (flag(argv, "--require-execution") && receipt.status !== "passed") {
    throw new Error(`runtime execution status is ${receipt.status}`);
  }
  const output = `${JSON.stringify(receipt, null, 2)}\n`;
  const outputPath = option(argv, "--output");
  if (outputPath) writeFileSync(resolve(outputPath), output);
  process.stdout.write(output);
}

function runNode(argv) {
  const receipt = baseReceipt("node", argv);
  const result = command(process.execPath, [join(root, "bin/sagejs-source.cjs"), "--python", pythonPath], {
    env: {
      ...process.env,
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
    },
    timeout: 300_000,
  });
  receipt.executedPlatform = platformId();
  receipt.command = {
    executable: process.execPath,
    arguments: ["bin/sagejs-source.cjs", "--python", pythonRelative],
  };
  receipt.process = {
    status: result.status,
    signal: result.signal,
    stderr: result.stderr,
  };
  try {
    if (result.status !== 0) throw new Error(`Sage.js exited ${result.status}`);
    receipt.execution = parseExecution(result.stdout);
    validateNodeExecution(receipt.execution);
    receipt.status = "passed";
  } catch (error) {
    receipt.status = "failed";
    receipt.error = String(error.stack ?? error);
  }
  finalize(receipt, argv);
  if (receipt.status !== "passed") process.exitCode = 1;
}

function browserReleaseIdentity(releaseRoot) {
  const receiptPath = join(releaseRoot, "dist/build-receipt.json");
  if (!existsSync(receiptPath)) {
    return { root: releaseRoot, present: false, exactCurrent: false };
  }
  const bytes = readFileSync(receiptPath);
  const receipt = JSON.parse(bytes);
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  return {
    present: true,
    root: releaseRoot,
    path: receiptPath,
    sha256: sha256(bytes),
    sourceCommit: receipt.source?.gitCommit ?? null,
    exactCurrent: receipt.source?.gitCommit === head,
  };
}

async function runBrowser(argv) {
  const engine = option(argv, "--engine", "chromium");
  if (!new Set(["chromium", "firefox", "webkit"]).has(engine)) {
    throw new Error(`unsupported browser engine ${engine}`);
  }
  const receipt = baseReceipt("browser", argv);
  receipt.browserEngine = engine;
  const releaseRoot = resolve(
    option(argv, "--browser-release-root", join(root, "packages/flint-wasm")),
  );
  receipt.browserRelease = browserReleaseIdentity(releaseRoot);
  receipt.executedPlatform = null;
  if (!receipt.browserRelease.present) {
    receipt.status = "not-executed";
    receipt.reason = "the current worktree has no built production browser-Wasm release";
    finalize(receipt, argv);
    return;
  }
  const playwright = await import("playwright-core");
  const support = await import(pathToFileURL(
    join(releaseRoot, "test/browser-wasm-support.mjs"),
  ).href);
  const browserType = playwright[engine];
  const executablePath = support.executablePathFor(engine, browserType);
  if (!executablePath) {
    receipt.status = "not-executed";
    receipt.reason = `no ${engine} executable is installed`;
    finalize(receipt, argv);
    return;
  }
  const server = await support.createBrowserWasmServer();
  let browser;
  try {
    browser = await browserType.launch({
      executablePath,
      headless: true,
      args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
    const context = await browser.newContext({ serviceWorkers: "allow" });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.stack ?? error)));
    await page.goto(`${server.origin}/browser-wasm-harness.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__sagejsReady !== undefined);
    await page.evaluate(() => window.__sagejsReady);
    const pythonSource = readFileSync(pythonPath, "utf8") +
      '\nif __name__ != "__main__":\n    emit_feasibility_receipt()\n';
    const result = await page.evaluate(
      ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
      [pythonSource, 240_000],
    );
    receipt.browserEvaluation = {
      stdout: result.stdout,
      stderr: result.stderr,
      repr: result.repr,
      durationMilliseconds: result.duration_ms,
    };
    receipt.diagnostics = await page.evaluate(() => window.__sagejsTest.diagnostics());
    receipt.execution = parseExecution(result.stdout);
    if (receipt.execution.hostPolicy !== "portable-generic" ||
        receipt.execution.executedRoute !== "untouched-generic-fallback") {
      throw new Error("browser did not execute the explicit generic policy");
    }
    if (pageErrors.length > 0) throw new Error(`browser page errors: ${pageErrors.join("\n")}`);
    for (const role of receipt.execution.roles) {
      if (role.route !== "untouched-generic-fallback" ||
          role.state.capabilityQueries !== 0 || role.state.nativeCalls !== 0 ||
          role.state.publications !== 0 || !role.derivativeReplay || !role.inputUntouched) {
        throw new Error(`${role.role} browser fallback evidence is incomplete`);
      }
    }
    receipt.browser = { executablePath, durationMilliseconds: result.duration_ms, pageErrors };
    receipt.executedPlatform = `browser-${engine}-${platformId()}`;
    receipt.status = "passed";
    await context.close();
  } catch (error) {
    receipt.status = "failed";
    receipt.error = String(error.stack ?? error);
  } finally {
    await browser?.close();
    await server.close();
  }
  // A stale Wasm release is still a real browser execution, but not an
  // exact-current browser artifact receipt.  Keep that distinction explicit.
  receipt.authorityLimit = receipt.browserRelease.exactCurrent
    ? null
    : "browser Wasm build receipt is not sourced from current HEAD";
  finalize(receipt, argv);
  if (receipt.status !== "passed") process.exitCode = 1;
}

function windowsContract(argv) {
  const contract = {
    schema: "sagejs.optimization-integral-library-windows-command/v1",
    frozenEpochId,
    status: "not-executed",
    executedWindowsAuthority: false,
    command: [
      "node",
      runnerRelative,
      "node",
      "--require-platform",
      "windows-x64",
      "--require-exact-current",
      "--require-frozen-evidence",
      "--frozen-evidence-dir",
      ".campaign2-evidence",
      "--output",
      "campaign2-integral-windows-x64-receipt.json",
    ],
    requiredEnvironment: {
      node: ">=22.22.2",
      nativePackage: "@sagemath/sagejs-flint with ffiNmodPolyIntegral",
      evidenceDirectory:
        "download the six named, digest-pinned frozen artifacts into .campaign2-evidence",
    },
    expectedEvidence: frozenEvidence,
    claimBoundary:
      "This portable command is a CI contract, not evidence that Windows executed it.",
  };
  const output = `${JSON.stringify(contract, null, 2)}\n`;
  const outputPath = option(argv, "--output");
  if (outputPath) writeFileSync(resolve(outputPath), output);
  process.stdout.write(output);
}

function usage() {
  process.stderr.write(`usage:
  node ${runnerRelative} node [receipt options]
  node ${runnerRelative} browser --engine chromium|firefox|webkit [receipt options]
  node ${runnerRelative} windows-contract [--output FILE]

receipt options:
  --output FILE
  --frozen-evidence-dir DIRECTORY
  --browser-release-root PACKAGES_FLINT_WASM_DIRECTORY
  --require-execution
  --require-exact-current
  --require-frozen-evidence
  --require-platform PLATFORM
`);
}

async function main() {
  const [mode, ...argv] = process.argv.slice(2);
  if (mode === "node") return runNode(argv);
  if (mode === "browser") return runBrowser(argv);
  if (mode === "windows-contract") return windowsContract(argv);
  usage();
  process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
