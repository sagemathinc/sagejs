"use strict";

process.env.SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY = "off";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../../..");
const {
  createKernelEvaluatorAsync,
} = require(path.join(ROOT, "dist/tools/kernel-evaluator.js"));

function errorRecord(error) {
  return {
    name: error?.name ?? typeof error,
    message: error?.message ?? String(error),
    reasonCode: error?.reasonCode ?? null,
    executionName: error?.observation?.execution?.error?.name ?? null,
    artifactCount: error?.observation?.artifacts?.length ?? null,
    observation: error?.observation ?? null,
  };
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const output = [];
  const evaluator = await createKernelEvaluatorAsync({
    mode: payload.language ?? "sage",
    onOutput(text) { output.push(text); },
  });
  try {
    if (payload.action === "evaluate") {
      const evaluation = evaluator.evaluate(payload.source, payload.options);
      return { evaluation, stdout: output.join("") };
    }
    if (payload.action === "profile") {
      const result = await evaluator.profile(payload.source, payload.options);
      let afterError = null;
      if (payload.evaluateAfter) {
        try {
          evaluator.evaluate(payload.evaluateAfter);
        } catch (error) {
          afterError = errorRecord(error);
        }
      }
      return {
        evaluation: result.evaluation,
        sourceMaps: result.sourceMaps,
        observation: result.observation,
        stdout: output.join(""),
        afterError,
      };
    }
    if (payload.action === "preload-profile") {
      const preload = evaluator.evaluate(payload.preload, payload.preloadOptions);
      let profileError;
      try {
        await evaluator.profile(payload.source, payload.options);
      } catch (error) {
        profileError = errorRecord(error);
      }
      return { preload, profileError, after: evaluator.evaluate("2 + 3") };
    }
    if (payload.action === "missing-then-profile") {
      let firstError;
      try {
        await evaluator.profile(payload.source, payload.options);
      } catch (error) {
        firstError = errorRecord(error);
      }
      const second = await evaluator.profile("2 + 3", payload.secondOptions);
      return { firstError, second: second.evaluation };
    }
    if (payload.action === "overlap") {
      const first = evaluator.profile(payload.source, payload.options);
      const second = evaluator.profile("2 + 3", payload.secondOptions);
      const [firstResult, secondResult] = await Promise.allSettled([first, second]);
      return {
        first: firstResult.status === "fulfilled"
          ? { status: "fulfilled", repr: firstResult.value.evaluation.repr }
          : { status: "rejected", error: errorRecord(firstResult.reason) },
        second: secondResult.status === "fulfilled"
          ? { status: "fulfilled", repr: secondResult.value.evaluation.repr }
          : { status: "rejected", error: errorRecord(secondResult.reason) },
      };
    }
    throw new Error(`unknown action ${payload.action}`);
  } finally {
    evaluator.close();
  }
}

main().then(
  (value) => process.stdout.write(`${JSON.stringify({ ok: true, value })}\n`),
  (error) => {
    process.stdout.write(`${JSON.stringify({ ok: false, error: errorRecord(error) })}\n`);
    process.exitCode = 1;
  },
);
