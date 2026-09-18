"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const host = require("./row8_row10_phase6_resident_kernel_host.cjs");

const DEFAULT_INPUT = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-08-993fd7dbd953844a1570baf326404cf3bf07223c721e3e7667d566764529fbd6.json";

async function createRow8ResidentPreparedAdapter(configuration = {}) {
  assert.deepEqual(Object.keys(configuration).sort(),
    configuration.inputPath === undefined ? [] : ["inputPath"]);
  const resident = await host.prepareResident(8,
    JSON.parse(fs.readFileSync(configuration.inputPath || DEFAULT_INPUT, "utf8")));
  return Object.freeze({ implementation: "sagejs",
    projectionSchema: "sagejs.pari-class-group/row8-phase6-common-projection-v1",
    async runFresh(request) {
      assert.equal(request.boundary, "prepared-kernel");
      assert.equal(request.fieldId, host.ROWS[8].fieldId);
      assert.equal(request.seed, "1");
      const sample = await host.runResident(resident);
      const { executionBoundary: _boundary, ...qualified } = sample;
      return qualified;
    } });
}

module.exports = { DEFAULT_INPUT, createRow8ResidentPreparedAdapter };
