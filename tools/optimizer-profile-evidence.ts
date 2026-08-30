import { resolve } from "node:path";

import type { OptimizerProfileObservation } from "./optimizer-profiler";

const evidenceSchemas = require(resolve(
  __dirname,
  "../..",
  "tools",
  "optimizer-development",
  "schemas.cjs",
)) as {
  SCHEMAS: { profile: string };
  validateProfileReceipt(value: unknown, context?: Record<string, unknown>): unknown;
};
const evidenceCommon = require(resolve(
  __dirname,
  "../..",
  "tools",
  "optimizer-development",
  "common.cjs",
)) as {
  documentIdentity(value: unknown): string;
};

/**
 * Attach one authenticated Node observation to a complete workload envelope,
 * then run the campaign's exact fail-closed profile validator.
 *
 * This adapter is deliberately separate from the runtime profiler.  Evidence
 * schemas are development-time authorities and must not become a filesystem
 * dependency of the relocatable compiler, evaluator, or SEA executable.
 */
export function assembleValidatedOptimizerProfileReceipt(
  envelope: Record<string, unknown>,
  observation: OptimizerProfileObservation,
  context: Record<string, unknown> = {},
): unknown {
  const candidate = {
    schema: evidenceSchemas.SCHEMAS.profile,
    id: `sha256:${"0".repeat(64)}`,
    ...envelope,
    sampling: observation.evidence.sampling,
    runtime: observation.evidence.runtime,
  };
  candidate.id = evidenceCommon.documentIdentity(candidate);
  return evidenceSchemas.validateProfileReceipt(candidate, context);
}
