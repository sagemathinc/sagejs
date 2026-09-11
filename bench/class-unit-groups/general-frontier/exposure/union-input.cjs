"use strict";
// Source membership is reconstructed, never granted by a self-consistent hash.
const fs = require("node:fs");
const path = require("node:path");
const api = require("./export.cjs");
const builder = require("../corpus/source-union.cjs");
const SCHEMA = "sagejs.general-class-unit-source-union.v1";
const authenticated = new WeakMap();
function authenticateUnion(union, acquisitions, base) {
  if (!acquisitions || typeof acquisitions !== "object" || Array.isArray(acquisitions) ||
      Object.keys(acquisitions).sort().join(",") !== "hard_directory,v2_directory" ||
      !Object.values(acquisitions).every(x => typeof x === "string" && x.length > 0)) throw new Error("invalid union acquisition directories");
  const rebuilt = builder.buildUnion(path.resolve(base, acquisitions.v2_directory), path.resolve(base, acquisitions.hard_directory));
  if (union?.schema !== SCHEMA || api.canonical(rebuilt) !== api.canonical(union)) throw new Error("union differs from independently reconstructed acquisition membership");
  authenticated.set(union, api.digest(union));
  return union;
}
function requireAuthenticated(union) {
  if (!union || union.schema !== SCHEMA || authenticated.get(union) !== api.digest(union)) throw new Error("union requires unchanged independently reconstructed acquisition membership");
  return union;
}
function identity(union) {
  requireAuthenticated(union);
  return { schema: union.schema, union_sha256: union.union_sha256, records_sha256: union.records_sha256,
    producer_sha256: union.producer_sha256, acquisitions: union.acquisitions,
    adapter_sha256: api.sha256(fs.readFileSync(__filename)),
    reconstruction_producer_sha256: api.sha256(fs.readFileSync(path.join(__dirname, "../corpus/source-union.cjs"))) };
}
module.exports = { SCHEMA, authenticateUnion, requireAuthenticated, identity };
