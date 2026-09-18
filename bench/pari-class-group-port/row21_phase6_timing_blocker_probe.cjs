"use strict";

const shared = require("./row20_phase6_timing_blocker_probe.cjs");

module.exports = shared.createProbe({
  panelIndex: 21,
  fieldId: "5.3.1009349859375.3",
  polynomialAscending: ["36", "930", "-305", "-90", "0", "1"],
  preparedAuthoritySha256:
    "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f",
  preparedFileSha256:
    "f33a1c37bb9f7bcafbe20a0e22b0c0434a29070843fa98e90ea3368db2302397",
  transactionModule: "row21_fresh_prepared_transaction.cjs",
  validatePrepared: (transaction, prepared) =>
    transaction.validatePreparedData(prepared),
  boundaryFiles: ["row21_fresh_prepared_transaction.cjs",
    "row21_factor_base_coordinator.cjs", "row21_live_unit_coordinator.cjs"],
  requiredBlockers: [
    { id: "final-source-cpython-child",
      filename: "row21_fresh_prepared_transaction.cjs",
      pattern: /spawnSync\("python3"/,
      effect: "final result construction and cold replay cross a CPython process boundary" },
    { id: "stage-owner-filesystem-publication",
      filename: "row21_factor_base_coordinator.cjs",
      pattern: /fs\.writeFileSync\(/,
      effect: "factor-base state is published instead of retaining a kernel handle" },
    { id: "unit-owner-filesystem-publication",
      filename: "row21_live_unit_coordinator.cjs",
      pattern: /fs\.writeFileSync\(/,
      effect: "unit reconstruction publishes a compressed owner before final assembly" },
  ],
  expected: {
    classGroup: { classNumber: "1", invariantFactors: [], generatorCount: "0" },
    unitGroup: { rank: "3", regulatorPresent: true, torsionOrder: "2" },
  },
});
