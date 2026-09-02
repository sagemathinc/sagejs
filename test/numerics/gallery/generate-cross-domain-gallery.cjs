#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = resolve(__dirname, "../../..");
const gallery = join(root, "docs/numerical-computing/gallery");
const evidencePath = join(gallery, "evidence.json");
const htmlPath = join(gallery, "index.html");
const sourcePath = join(__dirname, "generate-cross-domain-evidence.py");
const modulePath = join(gallery, "gallery.mjs");

function pythonEvidence() {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(executable, ["-I", sourcePath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONHASHSEED: "0",
      SAGEJS_NATIVE_DISABLE: "1",
    },
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { bundle: JSON.parse(result.stdout), evidence: result.stdout };
}

async function artifacts() {
  const renderer = await import(pathToFileURL(modulePath));
  const { bundle, evidence } = pythonEvidence();
  renderer.assertGalleryBudgets(bundle, evidence);
  return {
    bundle,
    evidence,
    html: renderer.buildGalleryDocument(bundle),
  };
}

async function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write");
  const generated = await artifacts();
  if (write) {
    writeFileSync(evidencePath, generated.evidence);
    writeFileSync(htmlPath, generated.html);
    process.stdout.write(
      `wrote ${evidencePath} (${Buffer.byteLength(generated.evidence)} bytes)\n` +
      `wrote ${htmlPath} (${Buffer.byteLength(generated.html)} bytes)\n`,
    );
    return generated;
  }
  assert.ok(existsSync(evidencePath), `${evidencePath} is missing; run with --write`);
  assert.ok(existsSync(htmlPath), `${htmlPath} is missing; run with --write`);
  assert.equal(
    readFileSync(evidencePath, "utf8"),
    generated.evidence,
    "cross-domain gallery evidence is stale; regenerate with --write",
  );
  assert.equal(
    readFileSync(htmlPath, "utf8"),
    generated.html,
    "cross-domain gallery HTML is stale; regenerate with --write",
  );
  return generated;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { artifacts, main };
