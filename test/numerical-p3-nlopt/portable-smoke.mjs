// sagejs-test-tier: specialized
// sagejs-test-portable: true

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repositoryPackage = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../../src/lib/sagejs/numerics/optimization/backends/nlopt",
);
const packageRoot = resolve(process.argv[2] ?? repositoryPackage);
const { createNloptBackend } = await import(
  pathToFileURL(resolve(packageRoot, "index.mjs"))
);
const artifact = await readFile(resolve(packageRoot, "nlopt-methods.wasm")).catch(
  () => readFile(resolve(packageRoot, "build/nlopt-methods.wasm")),
);
const solver = await createNloptBackend(artifact);
const nelderMead = solver.solve({
  method: "nlopt-nelder-mead",
  initial: [-1.2, 1],
  initialStep: [0.5, 0.5],
  objective: ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
  relativeParameterTolerance: 1e-9,
  maximumEvaluations: 2000,
});
const cobyla = solver.solve({
  method: "nlopt-cobyla",
  initial: [0.25, 0.25],
  initialStep: [0.4, 0.4],
  objective: ([x, y]) => (x - 1) ** 2 + (y - 1) ** 2,
  inequalityCount: 1,
  inequality: ([x, y]) => [x * x + y * y - 1],
  inequalityTolerance: [2e-7],
  relativeParameterTolerance: 1e-9,
  maximumEvaluations: 2000,
});
const nelderResidual = Math.hypot(nelderMead.value[0] - 1, nelderMead.value[1] - 1);
const cobylaViolation = Math.max(
  0,
  cobyla.value[0] ** 2 + cobyla.value[1] ** 2 - 1,
);
if (nelderResidual > 2e-5 || cobylaViolation > 2e-7 ||
    Math.abs(cobyla.value[0] - Math.SQRT1_2) > 3e-4 ||
    solver.inspect().liveAllocations !== 0) {
  throw new Error("portable NLopt smoke failed independent validation");
}
process.stdout.write(`${JSON.stringify({
  schema: "sagejs.numerical-nlopt-portable-smoke/v1",
  runtime: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  artifact_sha256: createHash("sha256").update(artifact).digest("hex"),
  nelder_mead: {
    residual: nelderResidual,
    evaluations: nelderMead.evaluations,
  },
  cobyla: {
    maximum_violation: cobylaViolation,
    evaluations: cobyla.evaluations,
  },
  lifecycle_after: solver.inspect(),
}, null, 2)}\n`);
