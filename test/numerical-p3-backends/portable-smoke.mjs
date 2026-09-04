// sagejs-test-tier: specialized

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

import { createCminpackBackend } from "./index.mjs";

const bytes = await readFile(new URL("./cminpack.wasm", import.meta.url));
const solver = await createCminpackBackend(bytes);
const result = solver.leastSquares({
  initial: [-1.2, 1],
  residualCount: 2,
  residual: ([x, y]) => [10 * (y - x * x), 1 - x],
  jacobian: ([x]) => [[-20 * x, 10], [-1, 0]],
  maximumEvaluations: 300,
});
const residualNorm = Math.hypot(
  10 * (result.value[1] - result.value[0] ** 2),
  1 - result.value[0],
);
if (!result.backendConverged || residualNorm > 1e-10 ||
    solver.inspect().liveAllocations !== 0 || solver.inspect().liveBytes !== 0) {
  throw new Error(`portable P3 smoke failed: ${JSON.stringify({ result, residualNorm })}`);
}
process.stdout.write(`${JSON.stringify({
  schema: "sagejs.numerical-p3-portable-smoke/v1",
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  artifact_sha256: createHash("sha256").update(bytes).digest("hex"),
  result,
  residual_norm: residualNorm,
  lifecycle: solver.inspect(),
}, null, 2)}\n`);
