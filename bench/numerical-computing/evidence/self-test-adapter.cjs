"use strict";

const fs = require("node:fs");

let artifactVerified = false;

module.exports = {
  protocol: "sagejs.numerical-qualification-adapter/v1",

  async initialize(context) {
    const artifact = context.artifacts.find((item) => item.name === "self-test");
    artifactVerified = artifact !== undefined &&
      fs.readFileSync(artifact.path, "utf8") === "portable self-test artifact\n";
    return {
      subject: {
        kind: "node",
        name: "node",
        version: process.version,
        engine: null,
      },
      capability_ids: artifactVerified ? ["self-test.scalar"] : [],
    };
  },

  async runCase(sample) {
    if (!artifactVerified) throw new Error("self-test artifact was not verified");
    const input = sample.input;
    if (input.operation === "sum") {
      const value = input.values.reduce((left, right) => left + right, 0);
      return {
        outcome: { kind: "success", code: null },
        values: { result: value, independent_oracle: input.expected },
        metrics: { phases_ms: { kernel: 0.01 }, counters: { evaluations: input.values.length } },
      };
    }
    if (input.operation === "fixed-point") {
      return {
        outcome: { kind: "success", code: null },
        values: {
          result: input.approximation,
          independent_oracle: input.reference,
          residual: Math.abs(Math.cos(input.approximation) - input.approximation),
        },
        metrics: { phases_ms: { kernel: 0.02, validation: 0.01 }, counters: { evaluations: 2 } },
      };
    }
    if (input.operation === "sqrt" && input.value < 0) {
      return {
        outcome: { kind: "failure", code: "domain.negative-radicand" },
        values: {
          diagnostic_code: "domain.negative-radicand",
          input_preserved: input.value,
          independently_validated: true,
        },
        metrics: { phases_ms: { validation: 0.01 }, counters: { evaluations: 0 } },
      };
    }
    if (input.operation === "addition-fuzz") {
      let state = input.seed >>> 0;
      let violations = 0;
      for (let trial = 0; trial < input.trials; trial += 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const left = (state & 0xffff) - 0x8000;
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const right = (state & 0xffff) - 0x8000;
        if (left + right !== right + left) violations += 1;
      }
      return {
        outcome: { kind: "success", code: null },
        values: { violations, trials: input.trials, final_state: state },
        metrics: {
          phases_ms: { campaign: 0.03 },
          counters: { trials: input.trials },
        },
      };
    }
    if (input.operation === "sum-scaling") {
      const base = input.values.reduce((left, right) => left + right, 0);
      let violations = 0;
      for (const factor of input.factors) {
        const transformed = input.values
          .map((value) => factor * value)
          .reduce((left, right) => left + right, 0);
        if (transformed !== factor * base) violations += 1;
      }
      return {
        outcome: { kind: "success", code: null },
        values: { violations, trials: input.factors.length, base },
        metrics: {
          phases_ms: { campaign: 0.02 },
          counters: { trials: input.factors.length },
        },
      };
    }
    throw new Error(`unknown self-test operation ${input.operation}`);
  },
};
