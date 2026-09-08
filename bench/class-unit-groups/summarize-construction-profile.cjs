"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {createHash} = require("node:crypto");
const raw = fs.readFileSync(process.argv[2]);
const profile = JSON.parse(raw);
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map();
for (const node of profile.nodes) {
  for (const child of node.children || []) parents.set(child, node.id);
}
const anchor = process.argv[3] || "$ρσ$py$construct";
let total = 0;
const inclusive = new Map();
const exclusive = new Map();
let firstSample = -1, lastSample = -1;
for (let i = 0; i < profile.samples.length; i++) {
  let node = nodes.get(profile.samples[i]);
  const stack = [];
  while (node) {
    stack.push(node.callFrame.functionName);
    node = nodes.get(parents.get(node.id));
  }
  if (!stack.includes(anchor)) continue;
  if (firstSample === -1) firstSample = i;
  lastSample = i;
  const microseconds = profile.timeDeltas[i];
  total += microseconds;
  exclusive.set(stack[0], (exclusive.get(stack[0]) || 0) + microseconds);
  for (const name of new Set(stack)) {
    inclusive.set(name, (inclusive.get(name) || 0) + microseconds);
  }
}
assert.ok(total > 0, "profile must contain the requested driver frame");
let windowMicroseconds = 0, windowGcMicroseconds = 0;
for (let i = firstSample; i <= lastSample; i++) {
  windowMicroseconds += profile.timeDeltas[i];
  if (nodes.get(profile.samples[i]).callFrame.functionName === '(garbage collector)') {
    windowGcMicroseconds += profile.timeDeltas[i];
  }
}
console.log(JSON.stringify({
  diagnostic: true,
  profileSha256: createHash("sha256").update(raw).digest("hex"),
  anchor,
  attributedMicroseconds: total,
  windowMicroseconds,
  windowGcMicroseconds,
  note: "Inclusive sampled fractions overlap; GC/native samples without the anchor are excluded from those fractions. Window spans first through last anchored sample, not exact function entry/exit. Not a timing comparison.",
  exclusive: [...exclusive].sort((a, b) => b[1] - a[1]).map(([name, microseconds]) => ({
    name, microseconds, fraction: microseconds / total,
  })),
  inclusive: [...inclusive].sort((a, b) => b[1] - a[1]).map(([name, microseconds]) => ({
    name, microseconds, fraction: microseconds / total,
  })),
}, null, 2));
