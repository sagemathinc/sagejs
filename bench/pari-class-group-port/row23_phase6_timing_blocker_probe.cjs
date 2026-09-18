"use strict";

const shared = require("./row20_phase6_timing_blocker_probe.cjs");

module.exports = shared.createProbe({
  panelIndex: 23,
  fieldId: "5.5.1002836007889.1",
  polynomialAscending: ["341", "-970", "772", "-141", "-2", "1"],
  preparedAuthoritySha256:
    "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299",
  preparedFileSha256:
    "1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154",
  transactionModule: "row23_fresh_prepared_transaction.cjs",
  validatePrepared: (transaction, prepared) => transaction.validatePrepared(prepared),
  boundaryFiles: ["row23_fresh_prepared_pipeline.cjs",
    "row23_final_inputs_coordinator.cjs", "row23_fresh_prepared_transaction.cjs"],
  requiredBlockers: [
    { id: "final-source-cpython-child",
      filename: "row23_fresh_prepared_pipeline.cjs", pattern: /spawnSync\("python3"/,
      effect: "final result construction and cold replay cross CPython process boundaries" },
    { id: "prepared-and-stage-filesystem-publication",
      filename: "row23_fresh_prepared_pipeline.cjs", pattern: /fs\.writeFileSync\(/,
      effect: "prepared and intermediate state is serialized inside the connected path" },
    { id: "intermediate-owner-publication",
      filename: "row23_final_inputs_coordinator.cjs", pattern: /fs\.writeFileSync\(/,
      effect: "relation and acceptance state is published instead of remaining resident" },
  ],
  expected: {
    classGroup: { classNumber: "6", invariantFactors: ["6"], generatorCount: "1" },
    unitGroup: { rank: "4", regulatorPresent: true, torsionOrder: "2" },
  },
});
