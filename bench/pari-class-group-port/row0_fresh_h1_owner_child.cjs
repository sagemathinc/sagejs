#!/usr/bin/env node
"use strict";

// Resource-bounded owner-production child for the genuine row-0 transaction.
// It admits only a normalized prepared-NF object, executes one native root,
// and durably exports the small logical replay prefixes.  Process exit then
// releases the giant native work graph before exact replay/regulator work.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const producer = require("./row0_fresh_h1_result_producer.cjs");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", chunk => chunks.push(chunk));
    process.stdin.on("end", () => resolve(JSON.parse(Buffer.concat(chunks))));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const request = await readStdin();
  assert(request && typeof request === "object" && !Array.isArray(request));
  assert.equal(typeof request.outputPath, "string");
  const outputPath = path.resolve(request.outputPath);
  assert.equal(fs.existsSync(outputPath), false);
  const capture = await producer.captureFreshOwners(request.prepared);
  const bytes = Buffer.from(`${JSON.stringify(capture)}\n`);
  fs.writeFileSync(outputPath, bytes, { flag: "wx", mode: 0o400 });
  fs.chmodSync(outputPath, 0o444);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row0-fresh-h1-owner-child-v1",
    path: outputPath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    nativeRootExecutions: 1,
    qualifiedTiming: false,
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
