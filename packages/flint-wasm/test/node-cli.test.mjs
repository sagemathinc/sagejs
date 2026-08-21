import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import {
  argumentsFrom,
  runCli,
  verifyProductionArtifact,
} from "../node-cli.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sink() {
  let value = "";
  return {
    write(chunk) { value += chunk; },
    text() { return value; },
  };
}

const artifactEvidence = Object.freeze({
  artifactIdentity: `sha256:${"a".repeat(64)}`,
  manifestSha256: "b".repeat(64),
  sourceRevision: "c".repeat(40),
});

test("CLI arguments keep source selection, timeout, and diagnostics explicit", () => {
  assert.deepEqual(
    argumentsFrom(["--timeout=1250", "--diagnostics", "-c", "2 + 3"]),
    {
      timeout: 1250,
      diagnostics: true,
      source: "2 + 3",
      filename: "<command>",
    },
  );
  assert.throws(() => argumentsFrom(["--timeout", "0"]), /positive number/);
  assert.throws(() => argumentsFrom(["-c", "2", "source.sage"]), /cannot be used/);
  assert.throws(() => argumentsFrom(["--verify-only", "source.sage"]), /does not accept/);
  assert.throws(() => argumentsFrom(["--shell"]), /unknown option/);
});

test("piped source preserves ordinary output and emits a separate route receipt", async () => {
  const output = sink();
  const errorOutput = sink();
  let closed = false;
  const session = {
    async evaluate(source, options) {
      assert.equal(source, "print(21 * 2)\n");
      assert.equal(options.filename, "<stdin>");
      assert.equal(options.timeout, 2500);
      options.onOutput("42\n");
      return {
        repr: "None",
        instrumentation: {
          routes: [{ capability_id: "integer-factor", execution_target: "wasm-artifact" }],
        },
      };
    },
    async close() { closed = true; },
  };
  const input = Readable.from(["print(21 * 2)\n"]);
  const result = await runCli({
    argv: ["--timeout", "2500", "--diagnostics"],
    input,
    output,
    errorOutput,
    createSession: async () => session,
    verifyArtifact: async () => artifactEvidence,
  });
  assert.equal(result.status, "evaluated");
  assert.equal(output.text(), "42\n");
  assert.equal(closed, true);
  const receipt = JSON.parse(errorOutput.text());
  assert.equal(receipt.schema, "sagejs.node-wasm-evaluation-receipt/v1");
  assert.equal(receipt.artifact_identity, artifactEvidence.artifactIdentity);
  assert.equal(receipt.source.filename, "<stdin>");
  assert.equal(receipt.source.sha256, sha256("print(21 * 2)\n"));
  assert.equal(receipt.outcome, "ok");
  assert.equal(receipt.instrumentation.routes[0].execution_target, "wasm-artifact");
});

test("a timeout remains observable and the replaced session is closed", async () => {
  const output = sink();
  const errorOutput = sink();
  let closed = false;
  let ready = false;
  const timeout = new Error("Sage.js evaluation timed out after 5 ms");
  timeout.name = "SageSessionTimeoutError";
  await assert.rejects(
    runCli({
      argv: ["--timeout", "5", "--diagnostics", "-c", "while True: pass"],
      input: Readable.from([]),
      output,
      errorOutput,
      createSession: async () => ({
        async evaluate() { throw timeout; },
        async ready() { ready = true; },
        async close() { closed = true; },
      }),
      verifyArtifact: async () => artifactEvidence,
    }),
    (error) => error === timeout,
  );
  assert.equal(closed, true);
  assert.equal(ready, true);
  const receipt = JSON.parse(errorOutput.text());
  assert.equal(receipt.outcome, "timeout");
  assert.equal(receipt.timeout_ms, 5);
  assert.equal(receipt.session_recovered, true);
  assert.equal(receipt.instrumentation, null);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "sagejs-node-wasm-cli-"));
  const packageRoot = join(root, "package");
  const distDirectory = join(packageRoot, "dist");
  const runtimeDirectory = join(distDirectory, "runtime");
  await mkdir(runtimeDirectory, { recursive: true });
  const runtime = Buffer.from("export const exact = 42;\n");
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  await writeFile(join(packageRoot, "node-cli.mjs"), runtime);
  await writeFile(join(runtimeDirectory, "node-cli.mjs"), runtime);
  await writeFile(join(distDirectory, "kernel.wasm"), wasm);
  const assets = [
    {
      path: "kernel.wasm",
      servePath: "dist/kernel.wasm",
      bytes: wasm.byteLength,
      sha256: sha256(wasm),
    },
    {
      path: "runtime/node-cli.mjs",
      servePath: "node-cli.mjs",
      bytes: runtime.byteLength,
      sha256: sha256(runtime),
    },
  ];
  const layout = { schema: "sagejs.wasm-production-layout/v1", modules: [] };
  const capabilities = [];
  const topology = {
    schema: "sagejs.wasm-artifact-topology/v1",
    eagerGroup: "eager-core",
    groups: [
      {
        id: "eager-core",
        kind: "eager",
        dependencies: [],
        assets: assets.map(({ path }) => path),
        identity: `sha256:${"e".repeat(64)}`,
      },
    ],
  };
  const manifest = {
    schema: "sagejs.wasm-production-artifact/v1",
    identity: `sha256:${sha256(canonicalJson({
      layout,
      assets,
      capabilities,
      topology,
    }))}`,
    layout,
    assets,
    capabilities,
    topology,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(distDirectory, "production-manifest.json"), manifestBytes);
  await writeFile(
    join(distDirectory, "build-receipt.json"),
    `${JSON.stringify({
      schema: "sagejs.wasm-build-receipt/v1",
      source: { gitCommit: "d".repeat(40) },
      artifact: manifest,
      productionManifestSha256: sha256(manifestBytes),
    }, null, 2)}\n`,
  );
  return { root, packageRoot, distDirectory, runtime, wasm, manifest };
}

test("production verification accepts only exact artifact and Node source bytes", async () => {
  const value = await fixture();
  try {
    const evidence = await verifyProductionArtifact(value);
    assert.equal(evidence.artifactIdentity, value.manifest.identity);
    assert.equal(evidence.sourceRevision, "d".repeat(40));

    await writeFile(join(value.packageRoot, "node-cli.mjs"), "// stale source\n");
    await assert.rejects(
      verifyProductionArtifact(value),
      /Node runtime source does not match the production artifact: node-cli\.mjs/,
    );

    await writeFile(join(value.packageRoot, "node-cli.mjs"), value.runtime);
    await writeFile(join(value.distDirectory, "kernel.wasm"), Buffer.concat([
      value.wasm,
      Buffer.from([0]),
    ]));
    await assert.rejects(
      verifyProductionArtifact(value),
      /WebAssembly asset digest differs: kernel\.wasm/,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
