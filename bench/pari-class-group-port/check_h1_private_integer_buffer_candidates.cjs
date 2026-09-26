#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { generateHostCore } = require("../../tools/native-kernel/c-backend.cjs");
const {
  resolvePrivateIntegerBufferLayout,
} = require("../../tools/native-kernel/private-integer-buffer-layout.cjs");

const HERE = __dirname;
const CACHE = process.env.SAGEJS_FUSED_CACHE_ARTIFACT ||
  "/home/user/sagejs-worktrees/pari-class-group-e2e-integration-worktrees/" +
  "h1-matched-flag-zero-fused/bench/pari-class-group-port/.sagejs-native-kernels/" +
  "2a65d69bf9c475e1378673d9829ffed16ba84dea4e503a7668b4ba59b970e6f1";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function reachable(ir, root) {
  const byName = new Map(ir.functions.map((fn) => [fn.name, fn]));
  const ordered = [];
  const seen = new Set();
  function include(name) {
    if (seen.has(name) || !byName.has(name)) return;
    seen.add(name);
    ordered.push(byName.get(name));
    for (const callee of ir.callGraph?.[name] || []) include(callee);
  }
  include(root.name);
  return ordered;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(CACHE, "manifest.json"), "utf8",
  ));
  const specification = JSON.parse(fs.readFileSync(
    path.join(HERE, "h1_private_integer_buffer_layout.json"), "utf8",
  ));
  const root = manifest.ir.functions.find((fn) => fn.name === specification.root);
  assert(root);
  const functions = reachable(manifest.ir, root);
  const layout = resolvePrivateIntegerBufferLayout(functions, root, specification);
  assert(layout, "pinned H1 layout no longer authorizes");
  const answer = {
    schema: "sagejs.pari-class-group/h1-private-buffer-candidates-v1",
    manifest: specification,
    reachableFunctions: functions.length,
    candidates: layout.candidates,
    publicBuffers: layout.publicBuffers,
    rejected: layout.rejected,
    priorClearedWordEvidence: {
      hnf_cup_arena: "0",
      relation_records: "0",
      prep_kummer_catalog_tau: "4866048",
      hnf_work_c: "0",
      hnf_work_b: "0",
      unmeasuredCandidates: layout.candidates.length - 5,
    },
  };
  if (process.argv.includes("--target")) {
    const core = generateHostCore(manifest.ir, {
      moduleIdentity: manifest.moduleIdentity,
      privateIntegerBufferLayout: specification,
    });
    assert.equal(core.audit.privateIntegerBuffers.layout, specification.name);
    assert.equal(core.audit.privateIntegerBuffers.buffers.length,
      specification.expected.candidates);
    assert.deepEqual(core.audit.privateIntegerBuffers.aliasProtection, {
      policy: "all-root-storage-ranges-disjoint-v1",
      rootIntegerBuffers: specification.expected.integerBuffers,
      checkedRangeKinds: ["sizes", "limbs"],
    });
    assert.match(core.source, /sagejs_private_integer_buffer_hash/);
    assert.match(core.source, /sagejs_private_integer_buffer_context_end/);
    assert.match(core.source, /sagejs_private_integer_buffers_disjoint/);
    answer.target = {
      sourceSha256: sha256(core.source),
      sourceBytes: Buffer.byteLength(core.source),
      tableCapacity: 1024,
      audit: core.audit.privateIntegerBuffers,
    };
  }
  process.stdout.write(`${JSON.stringify(answer)}\n`);
}

main();
