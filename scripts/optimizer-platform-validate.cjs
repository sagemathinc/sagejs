#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");

const {
  canonicalJson,
  validateBrowserReceipt,
} = require("../tools/optimizer-development/promotion.cjs");
const { currentCheckout } = require("./optimizer-promotion.cjs");

function platformId() {
  const key = `${process.platform}-${process.arch}`;
  return ({
    "linux-x64": "linux-x64",
    "linux-arm64": "linux-arm64",
    "darwin-arm64": "macos-arm64",
    "win32-x64": "windows-x64",
  })[key] ?? null;
}

function hostEvidence() {
  const id = platformId();
  if (id === null) throw new Error(`unsupported promotion host ${process.platform}-${process.arch}`);
  const payload = {
    id,
    node: process.version,
    v8: process.versions.v8,
    release: os.release(),
    cpu: os.cpus()[0]?.model ?? "unknown",
    logical_cpus: os.cpus().length,
  };
  return {
    ...payload,
    host_id: `sha256:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}`,
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] === "host" && argv[1] === "--json") {
    process.stdout.write(`${JSON.stringify(JSON.parse(canonicalJson(hostEvidence())), null, 2)}\n`);
    return 0;
  }
  if (argv[0] !== "browser" || !argv[1]) {
    throw new Error("usage: optimizer-platform-validate.cjs host --json | browser RECEIPT [--historical]");
  }
  const receipt = JSON.parse(fs.readFileSync(path.resolve(argv[1]), "utf8"));
  const checkout = currentCheckout();
  const context = argv.includes("--historical") ? {} : {
    current_checkout: {
      commit: checkout.commit,
      tree: checkout.tree,
      workspace_id: `sha256:${checkout.workspaceId}`,
      clean: checkout.clean,
    },
  };
  const result = validateBrowserReceipt(receipt, context);
  process.stdout.write(`accepted browser receipt ${result.receipt.id} on ${hostEvidence().id}\n`);
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

module.exports = { hostEvidence, main, platformId };
