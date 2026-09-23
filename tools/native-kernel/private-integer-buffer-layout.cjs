"use strict";

const { createHash } = require("node:crypto");
const {
  privateIntegerBufferClassification,
} = require("./private-integer-buffer-authority.cjs");

const SCHEMA = "sagejs.private-integer-buffer-layout/v1";

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resolvePrivateIntegerBufferLayout(functions, root, manifest) {
  if (manifest === null || typeof manifest !== "object" ||
      manifest.schema !== SCHEMA ||
      typeof manifest.name !== "string" || manifest.name.length === 0 ||
      manifest.root !== root?.name ||
      manifest.selection !== "written-proven-private" ||
      manifest.expected === null || typeof manifest.expected !== "object") {
    return undefined;
  }
  const classification = privateIntegerBufferClassification(functions, root);
  if (classification === undefined) return undefined;
  const parameters = root.params
    .filter((param) => param.type === "IntegerBuffer")
    .map((param) => [param.name, param.type]);
  const candidates = classification
    .filter((entry) => entry.classification === "private")
    .map((entry) => entry.name);
  const rejected = classification
    .filter((entry) => entry.classification === "rejected");
  const publicBuffers = classification
    .filter((entry) => entry.classification === "public")
    .map((entry) => entry.name);
  const actual = {
    parameterSha256: digest(parameters),
    candidateSha256: digest(candidates),
    integerBuffers: classification.length,
    candidates: candidates.length,
    rejected: rejected.length,
    public: publicBuffers.length,
  };
  for (const [key, value] of Object.entries(actual)) {
    if (manifest.expected[key] !== value) return undefined;
  }
  return Object.freeze({
    schema: SCHEMA,
    name: manifest.name,
    root: root.name,
    candidates: Object.freeze(candidates),
    publicBuffers: Object.freeze(publicBuffers),
    rejected: Object.freeze(rejected),
    classification,
    expected: Object.freeze(actual),
  });
}

module.exports = {
  PRIVATE_INTEGER_BUFFER_LAYOUT_SCHEMA: SCHEMA,
  privateIntegerBufferLayoutDigest: digest,
  resolvePrivateIntegerBufferLayout,
};
