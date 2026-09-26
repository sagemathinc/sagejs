"use strict";

// Stable authority for freshly recomputed row-6 owners.  Execution duration
// and peak RSS are observations, not mathematical identity.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const SCHEMA = "sagejs.pari-class-group/row6-semantic-authority-v1";

function semanticProjection(owner) {
  assert(owner && typeof owner === "object" && !Array.isArray(owner));
  const projected = structuredClone(owner);
  delete projected.ownerSha256; // in-memory transport annotation
  if (projected.execution) {
    delete projected.execution.elapsedNs;
    delete projected.execution.maxRssKiB;
  }
  // Fresh initial-relation owners retain the exact compressed factor-owner
  // digest for transport replay and also carry its stable semantic digest.
  // Once the latter is present, the former is deliberately not part of the
  // mathematical identity: it changes when only the factor owner's telemetry
  // changes.
  if (projected.authority?.factorOwnerSemanticSha256 !== undefined) {
    delete projected.authority.factorOwnerSha256;
  }
  return projected;
}

function semanticSha256(owner) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(semanticProjection(owner)))
    .digest("hex");
}

function legacyPublishedSha256(owner) {
  const projected = structuredClone(owner);
  delete projected.ownerSha256;
  return crypto.createHash("sha256")
    .update(`${JSON.stringify(projected)}\n`)
    .digest("hex");
}

function assertFactorAuthority(gate, factor) {
  if (gate.authority.factorOwnerSemanticSha256 !== undefined) {
    assert.equal(gate.authority.factorOwnerSemanticSha256, semanticSha256(factor));
  } else {
    assert.equal(gate.authority.factorOwnerSha256, legacyPublishedSha256(factor));
  }
}

function authority(owner) {
  return { schema: SCHEMA, sha256: semanticSha256(owner) };
}

module.exports = { SCHEMA, assertFactorAuthority, authority, legacyPublishedSha256,
  semanticProjection, semanticSha256 };
