import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { productionArtifactIdentity, stageRelease } from "../scripts/stage.mjs";

const HOST_FILES = ["compiler-worker.mjs", "evaluator.mjs", "index.mjs", "kernel-worker.mjs", "kernel.mjs", "m4ri.mjs", "plotly-renderer.mjs", "portable-matrix.mjs", "portable-polynomial.mjs"];

test("staging consumes and verifies the production artifact manifest", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "sagejs-web-stage-"));
  const appRoot = path.join(temporary, "app");
  const packageRoot = path.join(temporary, "package");
  await mkdir(path.join(appRoot, "scripts"), { recursive: true });
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  await mkdir(path.join(temporary, "architecture"), { recursive: true });
  await writeFile(path.join(appRoot, "index.html"), "<!doctype html><title>test</title>");
  await writeFile(
    path.join(appRoot, "codemirror-editor.mjs"),
    "export const editorFixture = 'bundled-editor';\n",
  );
  await writeFile(
    path.join(appRoot, "sw.js"),
    'const TRUSTED_MANIFEST_SHA256 = "__SAGEJS_ASSET_MANIFEST_SHA256__";\n',
  );
  await mkdir(path.join(packageRoot, "dist/runtime"), { recursive: true });
  const bytes = Buffer.from("wasm bytes");
  await writeFile(path.join(packageRoot, "dist/kernel.wasm"), bytes);
  const assets = [{ path: "kernel.wasm", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }];
  for (const filename of HOST_FILES) {
    const contents = Buffer.from(`// ${filename}`);
    await writeFile(path.join(packageRoot, "dist/runtime", filename), contents);
    assets.push({ path: `runtime/${filename}`, bytes: contents.length, sha256: createHash("sha256").update(contents).digest("hex") });
  }
  const artifact = {
    schema: "sagejs.wasm-production-artifact/v1",
    identity: "",
    layout: {},
    assets,
    capabilities: [],
    topology: {
      schema: "sagejs.wasm-artifact-topology/v1",
      identity: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      eagerGroup: "eager-core",
      groups: [],
    },
  };
  artifact.identity = productionArtifactIdentity(artifact);
  assert.notEqual(
    productionArtifactIdentity({
      ...artifact,
      topology: { ...artifact.topology, eagerGroup: "mutated" },
    }),
    artifact.identity,
  );
  const manifestContents = JSON.stringify(artifact);
  await writeFile(path.join(packageRoot, "dist/production-manifest.json"), manifestContents);
  await writeFile(path.join(packageRoot, "dist/build-receipt.json"), JSON.stringify({ schema: "sagejs.wasm-build-receipt/v1", artifact, commit: "deadbeef", productionManifestSha256: createHash("sha256").update(manifestContents).digest("hex") }));
  const capabilitySource = "architecture/wasm-capabilities.json";
  const capabilitySourceContents = "{}\n";
  await writeFile(path.join(temporary, capabilitySource), capabilitySourceContents);
  await writeFile(path.join(temporary, "architecture/wasm-capabilities-report.json"), JSON.stringify({
    schema: "sagejs.wasm-capability-report/v1",
    source: capabilitySource,
    source_sha256: createHash("sha256").update(capabilitySourceContents).digest("hex"),
    capabilities: [],
  }));

  const capabilityReport = path.join(temporary, "architecture/wasm-capabilities-report.json");
  const result = await stageRelease({ appRoot, packageRoot, capabilityReport, target: path.join(appRoot, "dist") });
  assert.equal(result.artifactIdentity, artifact.identity);
  const identity = artifact.identity.slice("sha256:".length);
  assert.equal(await readFile(path.join(appRoot, `dist/assets/sha256-${identity}/dist/kernel.wasm`), "utf8"), "wasm bytes");
  assert.match(
    await readFile(path.join(appRoot, "dist/codemirror-editor.mjs"), "utf8"),
    /bundled-editor/,
  );
  const version = JSON.parse(await readFile(path.join(appRoot, "dist/runtime-version.json"), "utf8"));
  assert.equal(version.assetBase, `./assets/sha256-${identity}/`);
  const webManifest = JSON.parse(await readFile(path.join(appRoot, "dist/asset-manifest.json"), "utf8"));
  assert.equal(webManifest.schema, "org.sagejs.web/assets-v2");
  const indexRecord = webManifest.assets.find((entry) => entry.path === "./index.html");
  assert.equal(indexRecord.bytes, Buffer.byteLength("<!doctype html><title>test</title>"));
  assert.match(indexRecord.sha256, /^[a-f0-9]{64}$/);
  const webManifestContents = await readFile(
    path.join(appRoot, "dist/asset-manifest.json"),
  );
  const manifestDigest = createHash("sha256").update(webManifestContents).digest("hex");
  const stagedWorker = await readFile(path.join(appRoot, "dist/sw.js"), "utf8");
  assert.match(stagedWorker, new RegExp(manifestDigest));
  assert.doesNotMatch(stagedWorker, /__SAGEJS_ASSET_MANIFEST_SHA256__/);

  await writeFile(path.join(packageRoot, "dist/runtime/kernel.mjs"), "// unauthenticated mutation");
  await assert.rejects(() => stageRelease({ appRoot, packageRoot, capabilityReport, target: path.join(appRoot, "dist") }), /size mismatch|digest mismatch/);
  await writeFile(path.join(packageRoot, "dist/runtime/kernel.mjs"), "// kernel.mjs");

  await writeFile(path.join(packageRoot, "dist/kernel.wasm"), "tampered");
  await assert.rejects(() => stageRelease({ appRoot, packageRoot, capabilityReport, target: path.join(appRoot, "dist") }), /size mismatch|digest mismatch/);
});
