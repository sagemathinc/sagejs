"use strict";

// Reconstruct the reviewed pre-integration source from a readable delta, not
// an already-transformed input or a second 438 KB module. No Git history,
// network, patch executable, fuzzy matching, or silent skips are required.
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const path = require("node:path");
const sourcePath = "src/lib/sagejs/number_fields/cubic_class_number_native.py";

function restoreCubicBaseline(source, delta) {
  const input = source.replaceAll('\r\n', '\n').split('\n');
  const lines = delta.replaceAll('\r\n', '\n').trimEnd().split('\n');
  assert.equal(lines[2], `--- a/${sourcePath}`);
  assert.equal(lines[3], `+++ b/${sourcePath}`);
  const output = [];
  let cursor = 0;
  for (let i = 4; i < lines.length;) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i++]);
    assert(header, 'invalid cubic baseline delta header');
    const oldStart = Number(header[1]) - 1, oldCount = Number(header[2] ?? 1);
    const newStart = Number(header[3]) - 1, newCount = Number(header[4] ?? 1);
    assert(newStart >= cursor, 'overlapping cubic baseline delta');
    const before = [], after = [];
    while (i < lines.length && !lines[i].startsWith('@@')) {
      const line = lines[i++], prefix = line[0];
      assert([' ', '+', '-'].includes(prefix), 'invalid cubic baseline delta line');
      if (prefix !== '+') before.push(line.slice(1));
      if (prefix !== '-') after.push(line.slice(1));
    }
    assert.equal(before.length, oldCount);
    assert.equal(after.length, newCount);
    assert.deepEqual(input.slice(newStart, newStart + newCount), after,
      'production source differs from the reviewed cubic integration delta');
    output.push(...input.slice(cursor, newStart));
    assert.equal(output.length, oldStart);
    output.push(...before);
    cursor = newStart + newCount;
  }
  const baseline = output.concat(input.slice(cursor)).join('\n');
  assert.equal(createHash("sha256").update(baseline).digest("hex"),
    "905b57635a478db2252d9e4f139a6f66bb5cad767b0e2377759e870aa7ae868e");
  return baseline;
}

function cubicSourceBaseline() {
  return restoreCubicBaseline(
    readFileSync(path.resolve(__dirname, '../..', sourcePath), 'utf8'),
    readFileSync(path.join(__dirname, 'cubic-source-baseline.patch'), 'utf8'),
  );
}

module.exports = { cubicSourceBaseline, restoreCubicBaseline };
