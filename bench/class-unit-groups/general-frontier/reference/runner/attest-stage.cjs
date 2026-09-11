"use strict";

// Offline transfer identity, separate from mathematical result certification.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function inventory(directory) {
  const root = fs.realpathSync(directory), entries = [];
  function visit(relative) {
    const full = path.join(root, relative), s = fs.lstatSync(full);
    if (s.isSymbolicLink()) {
      const target = fs.realpathSync(full);
      if (!target.startsWith(root + path.sep)) throw new Error(`external symlink: ${relative}`);
      entries.push({ path: relative, kind: "symlink", target: fs.readlinkSync(full) });
    } else if (s.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) visit(path.join(relative, name));
    } else if (s.isFile()) {
      entries.push({ path: relative, kind: "file", bytes: s.size, sha256: hash(fs.readFileSync(full)) });
    } else throw new Error(`unsupported staged object: ${relative}`);
  }
  visit("");
  return entries;
}

function attest(root, node) {
  root = fs.realpathSync(root);
  // Provenance inspection must not refresh the very Git indexes being sealed.
  const previous = process.env.GIT_OPTIONAL_LOCKS;
  process.env.GIT_OPTIONAL_LOCKS = "0";
  let receipt;
  try {
    receipt = require(path.join(root, "scripts/build-receipt.cjs")).inspectBuildReceipt(root);
  } finally {
    if (previous === undefined) delete process.env.GIT_OPTIONAL_LOCKS;
    else process.env.GIT_OPTIONAL_LOCKS = previous;
  }
  if (!receipt.current) throw new Error(`staged receipt not current: ${receipt.reason}`);
  return { schema: "sagejs.general-frontier-runtime-stage.v1", mathematical_certificate: false,
    node_sha256: hash(fs.readFileSync(node)),
    build_receipt_sha256: hash(fs.readFileSync(path.join(root, "dist/build-receipt.json"))),
    entries: inventory(root) };
}

if (require.main === module) {
  const [mode, root, node, manifest] = process.argv.slice(2);
  if (!["create", "verify"].includes(mode) || !root || !node || !manifest)
    throw new Error("usage: attest-stage.cjs create|verify ROOT NODE MANIFEST_OUTSIDE_ROOT");
  const absolute = fs.realpathSync(root);
  if (path.resolve(manifest).startsWith(absolute + path.sep))
    throw new Error("manifest must be outside the staged tree");
  const value = attest(root, node);
  if (mode === "create") fs.writeFileSync(manifest, JSON.stringify(value) + "\n", { flag: "wx" });
  else assert.deepEqual(value, JSON.parse(fs.readFileSync(manifest, "utf8")));
  console.log(JSON.stringify({ status: "ok", mode, entries: value.entries.length,
    bytes: value.entries.reduce((n, x) => n + (x.bytes || 0), 0),
    build_receipt_sha256: value.build_receipt_sha256 }));
}
module.exports = { inventory, attest };
