"use strict";

// Synthetic protocol fixture only. Reported clocks are deliberately virtual;
// this module must never be used as mathematical or performance evidence.

function sample(implementation, configuration) {
  const kernel = configuration.kernelNanoseconds || "600000000";
  const leaves = {
    relationRetry: "100000000",
    sparseHnfSnfTransform: "100000000",
    unitRegulator: "100000000",
    honestyGeneratorsFinal: "100000000",
  };
  const used = Object.values(leaves).reduce((sum, value) => sum + BigInt(value), 0n);
  if (configuration.mode === "bad-stage") leaves.relationRetry = "1";
  return {
    kernelNanoseconds: kernel,
    threadCpuNanoseconds: String(BigInt(kernel) - 1n),
    peakRssKiB: implementation === "sagejs" ? "2048" : "1024",
    output: { schema: configuration.projectionSchema,
      value: configuration.semanticValue || "same" },
    replay: { exact: true, witnessCount: "2" },
    rng: { algorithm: "synthetic", terminalState: ["1", "2"] },
    counters: { relations: "73", retries: "0" },
    resourceCounters: { allocations: implementation === "sagejs" ? "2" : "1" },
    stageTiming: { inclusiveNanoseconds: kernel, leaves,
      unattributedNanoseconds: String(BigInt(kernel) - used) },
  };
}

async function createSyntheticAdapter(configuration) {
  const implementation = configuration.implementation;
  return {
    implementation,
    projectionSchema: configuration.projectionSchema,
    async warmup() {
      if (configuration.mode === "hang") await new Promise(() => {});
      if (configuration.mode === "fail") throw new Error("intentional synthetic failure");
    },
    async runFresh() { return sample(implementation, configuration); },
  };
}

module.exports = { createSyntheticAdapter };
