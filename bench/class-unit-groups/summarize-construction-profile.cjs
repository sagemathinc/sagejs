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
const anchor = "$ρσ$py$construct";
let total = 0;
const inclusive = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  let node = nodes.get(profile.samples[i]);
  const stack = [];
  while (node) {
    stack.push(node.callFrame.functionName);
    node = nodes.get(parents.get(node.id));
  }
  if (!stack.includes(anchor)) continue;
  const microseconds = profile.timeDeltas[i];
  total += microseconds;
  for (const name of new Set(stack)) {
    inclusive.set(name, (inclusive.get(name) || 0) + microseconds);
  }
}
assert.ok(total > 0, "profile must contain the construction driver frame");
console.log(JSON.stringify({
  diagnostic: true,
  profileSha256: createHash("sha256").update(raw).digest("hex"),
  anchor,
  attributedMicroseconds: total,
  note: "Inclusive sampled fractions overlap; unattributed GC/native samples are excluded. Not a timing comparison.",
  inclusive: [...inclusive].sort((a, b) => b[1] - a[1]).map(([name, microseconds]) => ({
    name, microseconds, fraction: microseconds / total,
  })),
}, null, 2));
