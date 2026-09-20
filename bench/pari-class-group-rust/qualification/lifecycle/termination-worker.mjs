import { parentPort, workerData } from "node:worker_threads";

import { instantiateLifecycleCandidate } from "./runtime.mjs";

const candidate = await instantiateLifecycleCandidate(workerData.artifact);
parentPort.postMessage({ type: "ready" });

parentPort.once("message", ({ type, request, repetitions }) => {
  if (type !== "start") throw new Error("unexpected worker command");
  parentPort.postMessage({ type: "begun" });
  let result = null;
  for (let index = 0; index < repetitions; index += 1) {
    result = candidate.run(request);
  }
  // Publication is deliberately a single message after the complete batch.
  parentPort.postMessage({ type: "result", result });
  candidate.close();
  parentPort.close();
});
