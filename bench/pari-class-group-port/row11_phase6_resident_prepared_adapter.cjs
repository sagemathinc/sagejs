"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const host = require("./row11_phase6_resident_kernel_host.cjs");

const DEFAULT_INPUT = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
  "prepared-row-11-58e74a3f31994020273c5e54b0f8c6c830419be24be7fbb077f1479ef1d00dbc.json";

async function createRow11ResidentPreparedAdapter(configuration = {}) {
  assert.deepEqual(Object.keys(configuration).sort(),
    configuration.inputPath === undefined ? [] : ["inputPath"]);
  const inputPath = configuration.inputPath || DEFAULT_INPUT;
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const resident = await host.prepareResident(prepared);
  return Object.freeze({ implementation: "sagejs",
    projectionSchema: "sagejs.pari-class-group/row11-phase6-common-projection-v1",
    async runFresh(request) {
      assert.equal(request.boundary, "prepared-kernel");
      assert.equal(request.fieldId, host.CONFIG.fieldId);
      assert.equal(request.seed, "1");
      const sample = await host.runResident(resident);
      const { executionBoundary: _boundary, ...qualified } = sample;
      return qualified;
    } });
}

module.exports = { DEFAULT_INPUT, createRow11ResidentPreparedAdapter };
