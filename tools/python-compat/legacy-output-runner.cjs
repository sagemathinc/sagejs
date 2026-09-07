"use strict";

// The original MicroPython execution profile. Do not silently substitute the
// isolated assertion executor: filenames, cwd, ambient environment, and raw
// combined stream ordering are part of the recorded output contract.
const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { sha256, normalizeOutput, caseEvidence } = require("./evidence.cjs");
const { firstDiagnosticLine, classifySagejs } = require("./output-baseline.cjs");

function legacyEnvironment(ambient = process.env) {
  return {
    ...ambient,
    LC_ALL: "C.UTF-8",
    LANG: "C.UTF-8",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONHASHSEED: "0",
    TZ: "UTC",
  };
}

function execute(command, args, { cwd, env, timeout }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        status: null,
        signal: null,
        output: "",
        stdout: "",
        stderr: "",
        raw: { output: "", stdout: "", stderr: "" },
        timedOut: false,
        error: { name: error.name, code: error.code ?? null, message: error.message },
      });
      return;
    }

    const chunks = [];
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const raw = {
        output: Buffer.concat(chunks), stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      };
      resolve({
        ...result,
        error: result.error ? {
          name: result.error.name, code: result.error.code ?? null,
          message: result.error.message,
        } : null,
        output: normalizeOutput(raw.output.toString("utf8")),
        stdout: normalizeOutput(raw.stdout.toString("utf8")),
        stderr: normalizeOutput(raw.stderr.toString("utf8")),
        raw: Object.fromEntries(Object.entries(raw).map(([stream, bytes]) => [stream, bytes.toString("base64")])),
        timedOut,
      });
    };
    child.stdout.on("data", (chunk) => { chunks.push(Buffer.from(chunk)); stdout.push(Buffer.from(chunk)); });
    child.stderr.on("data", (chunk) => { chunks.push(Buffer.from(chunk)); stderr.push(Buffer.from(chunk)); });
    child.on("error", (error) => {
      finish({ status: null, signal: null, error });
    });
    child.on("close", (status, signal) => {
      finish({ status, signal, error: null });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);
  });
}

async function inspectReference(options, environment, { root, execute: executeRuntime = execute }) {
  const result = await executeRuntime(
    options.python,
    [
      "-BS",
      "-c",
      "import platform; print(platform.python_implementation()); print(platform.python_version())",
    ],
    {
      cwd: root,
      env: environment,
      timeout: options.timeout,
    },
  );
  if (result.error) {
    throw new Error(
      `reference Python could not start (${options.python}): ${result.error.message}`,
    );
  }
  if (result.timedOut || result.status !== 0) {
    throw new Error(
      `reference Python identification failed: ${firstDiagnosticLine(result.output)}`,
    );
  }
  const [implementation, version] = result.output.trim().split("\n");
  if (implementation !== "CPython" || !version) {
    throw new Error(
      `the reference must be CPython; got ${JSON.stringify(result.output.trim())}`,
    );
  }
  return {
    implementation,
    version,
    majorMinor: version.split(".").slice(0, 2).join("."),
    command: options.python,
  };
}

async function runOne(test, options, environment, { corpusRoot, sagejs, execute: executeRuntime = execute }) {
  const sourceSha256 = sha256(readFileSync(test.file));
  const oracle = await executeRuntime(options.python, ["-BS", test.file], {
    cwd: corpusRoot,
    env: environment,
    timeout: options.timeout,
  });
  if (oracle.error) {
    return {
      name: test.name,
      status: "launch-error",
      detail: oracle.error.message,
      evidence: caseEvidence(sourceSha256, oracle, null),
      executions: { oracle, subject: null },
    };
  }
  if (oracle.timedOut) {
    return {
      name: test.name,
      status: "oracle-error",
      detail: "CPython exceeded the per-runtime timeout",
      evidence: caseEvidence(sourceSha256, oracle, null),
      executions: { oracle, subject: null },
    };
  }
  if (oracle.status !== 0) {
    return {
      name: test.name,
      status: "oracle-error",
      detail: firstDiagnosticLine(oracle.output),
      evidence: caseEvidence(sourceSha256, oracle, null),
      executions: { oracle, subject: null },
    };
  }

  const candidate = await executeRuntime(
    process.execPath,
    [sagejs, "--python", test.file],
    {
      cwd: corpusRoot,
      env: environment,
      timeout: options.timeout,
    },
  );
  return {
    name: test.name,
    ...classifySagejs(candidate, oracle),
    evidence: caseEvidence(sourceSha256, oracle, candidate),
    executions: { oracle, subject: candidate },
  };
}

async function mapConcurrent(items, concurrency, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, items.length)) },
      () => worker(),
    ),
  );
  return results;
}

function makeReport({ reference, provenance, excluded, artifacts, build, results, gate, workspaceSha256, sagejs }) {
  return {
    schema: "sagejs.python-conformance-report/v1",
    reference, provenance, excluded, workspaceSha256,
    subject: { route: "source", command: process.execPath, args: [sagejs, "--python"] },
    artifact: {
      files: artifacts, node: process.versions.node, v8: process.versions.v8,
      platform: process.platform, arch: process.arch, currentBuild: build.current,
      qualifiedGate: build.current === true && gate.status === "passed",
    },
    gate,
    results,
  };
}

module.exports = { makeReport, execute, inspectReference, runOne, mapConcurrent, legacyEnvironment };
