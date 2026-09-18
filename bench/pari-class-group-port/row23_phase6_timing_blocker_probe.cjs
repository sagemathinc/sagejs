"use strict";

const shared = require("./row20_phase6_timing_blocker_probe.cjs");

const probe = shared.createProbe({
  panelIndex: 23,
  fieldId: "5.5.1002836007889.1",
  polynomialAscending: ["341", "-970", "772", "-141", "-2", "1"],
  preparedAuthoritySha256:
    "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299",
  preparedFileSha256:
    "1d342f14fe9f2cac7a49e75727952a65401f8af01f7d754dd256372c2f7ee154",
  transactionModule: "row23_fresh_prepared_transaction.cjs",
  validatePrepared: (transaction, prepared) => transaction.validatePrepared(prepared),
  boundaryFiles: ["row23_phase6_resident_kernel_host.cjs",
    "row23_fresh_prepared_transaction.cjs"],
  requiredBlockers: [
    { id: "allocation-inside-resident-root",
      filename: "row23_phase6_resident_kernel_host.cjs",
      pattern: /allocationInsideRoot: true/,
      effect: "the connected root still reallocates exact and floating owners per sample" },
    { id: "compiler-cache-lookup-inside-resident-root",
      filename: "row23_phase6_resident_kernel_host.cjs",
      pattern: /compilerCacheLookupInsideRoot: true/,
      effect: "the connected root still enters compileKernel cache lookup paths per sample" },
    { id: "fourteen-native-call-resident-root",
      filename: "row23_phase6_resident_kernel_host.cjs",
      pattern: /nativeCallsInsideRoot: 14/,
      effect: "fourteen native entry/exit boundaries remain instead of one private generated graph" },
  ],
  expected: {
    classGroup: { classNumber: "6", invariantFactors: ["6"], generatorCount: "1" },
    unitGroup: { rank: "4", regulatorPresent: true, torsionOrder: "2" },
  },
});

module.exports = Object.freeze({ ...probe, async runProbe(options) {
  const result = await probe.runProbe(options);
  return { ...result, admission: { ...result.admission,
    reason: "the serialization-free resident root still allocates owners, performs compiler-cache lookups, and crosses fourteen native call boundaries inside its inclusive clock" } };
} });
