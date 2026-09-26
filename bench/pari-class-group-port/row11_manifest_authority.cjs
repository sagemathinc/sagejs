#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const ACTIVE_DRIVER_MANIFEST_SHA256 =
  "79e77fbb7b3c8920437ce701a837a05720355cf008dd44705efee6c1e04cd261";
const HISTORICAL_SOURCE_MANIFEST_SHA256 =
  "abe10f55aa44fbb47560cd23cf8b708268d838720d38b0fc98debbc1b763ef46";
const W0_SHA256 =
  "6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165";
const PREPARED_JSON_SHA256 =
  "58e74a3f31994020273c5e54b0f8c6c830419be24be7fbb077f1479ef1d00dbc";
// The admission-only manifest rebind must not rewrite the mathematical source
// authority embedded in the already published terminal owner.
const HISTORICAL_TERMINAL_COORDINATOR_SHA256 =
  "5c98136e526904ed382fe8fdf4233a7a122f88a716f67cd77404a7ea3e524a46";

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function authenticateActiveRow11Manifest({ manifestBytes, w0Bytes, w0, selected }) {
  if (sha256(manifestBytes) !== ACTIVE_DRIVER_MANIFEST_SHA256)
    throw new Error("active development driver manifest changed");
  const manifest = JSON.parse(manifestBytes);
  const record = manifest.records?.find(entry => entry.panelIndex === 11);
  if (!record || record.sha256 !== W0_SHA256 || record.bytes !== w0Bytes.length ||
      path.basename(selected) !== record.filename ||
      sha256(Buffer.from(JSON.stringify(w0.prepared))) !== record.preparedSha256 ||
      sha256(Buffer.from(JSON.stringify(w0.events))) !== record.eventsSha256 ||
      sha256(Buffer.from(JSON.stringify(w0.events.at(-1)))) !== record.terminalResultSha256)
    throw new Error("row-11 W0 is detached from the active manifest");
  return record;
}

function authenticateHistoricalFreshCorpusManifest(manifestBytes) {
  const manifest = JSON.parse(manifestBytes);
  const row = manifest.rows?.find(entry => entry.panelIndex === 11);
  if (manifest.schema !== "sagejs.pari-class-group/fresh-prepared-corpus-manifest-v1" ||
      manifest.sourceManifestSha256 !== HISTORICAL_SOURCE_MANIFEST_SHA256 ||
      !row || row.sourceSha256 !== W0_SHA256 ||
      row.preparedJsonSha256 !== PREPARED_JSON_SHA256)
    throw new Error("historical row-11 fresh-corpus authority changed");
  return row;
}

module.exports = {
  ACTIVE_DRIVER_MANIFEST_SHA256,
  HISTORICAL_SOURCE_MANIFEST_SHA256,
  HISTORICAL_TERMINAL_COORDINATOR_SHA256,
  authenticateActiveRow11Manifest,
  authenticateHistoricalFreshCorpusManifest,
};
