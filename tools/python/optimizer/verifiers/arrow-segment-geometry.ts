import { InternalRegionPlan, OPTIMIZER_IR_SCHEMA } from "../types";

// Intentionally local: this verifier must not inherit transformation claims.
const PASS = "math.closed-transactional-rectangular-binary64-dataflow.v1";
const LOWERING = "v8.closed-transactional-rectangular-binary64-dataflow.v1";
const KIND = "closed-transactional-rectangular-binary64-dataflow";
const VERIFIER = "verify.closed-transactional-rectangular-binary64-dataflow-plan.v1";

function node(value: any, label: string): void {
  if (!value || typeof value.print !== "function") {
    throw new TypeError(`rectangular binary64 dataflow ${label} is not printable AST`);
  }
}

/** Authenticate every safety-critical field consumed by the Python emitter. */
export function verifyArrowSegmentGeometryPlan(plan: InternalRegionPlan): void {
  if (plan?.schema !== OPTIMIZER_IR_SCHEMA || plan.passId !== PASS ||
      plan.loweringId !== LOWERING || plan.kind !== KIND ||
      (plan.guardFailure !== "fallback" && plan.guardFailure !== "error")) {
    throw new TypeError("rectangular binary64 dataflow plan has mismatched stable IDs");
  }
  if (typeof plan.id !== "string" || plan.id.length === 0 ||
      (plan.functionId !== null &&
       (typeof plan.functionId !== "string" || plan.functionId.length === 0))) {
    throw new TypeError("rectangular binary64 dataflow plan has invalid identities");
  }
  const operands = plan.operands;
  if (!operands || operands.targetPlanId !==
        "target.v8-rectangular-binary64-dataflow.v1" ||
      operands.iteratorKind !== "sequence" ||
      operands.iterationOrder !== "forward" ||
      operands.maximumOutputEntries !== 7_000_000 ||
      operands.completePreflight !== true ||
      operands.privatePublication !== true ||
      operands.copiedBytes !== 0 || operands.boundaryCrossings !== 0 ||
      operands.materializations !== 2) {
    throw new TypeError("rectangular binary64 dataflow target facts are stale");
  }
  for (const name of [
    "iterable", "xSequence", "ySequence", "uGrid", "vGrid", "maximum",
    "extent", "pivot", "headLength", "headWidth", "hypot", "xOutput",
    "yOutput",
  ]) node(operands[name], name);
  const program = operands.program;
  const roles = program && [
    program.xSequenceName, program.ySequenceName,
    program.uGridName, program.vGridName,
    program.xOutputName, program.yOutputName, program.pivotName,
  ];
  if (!program || program.version !== 1 ||
      program.kind !== KIND || program.variant !== "arrow-segment-stream" ||
      !Array.isArray(program.operations) || program.operations.length !== 23 ||
      !Array.isArray(program.proofGaps) || program.proofGaps.length !== 27 ||
      roles.some((name: any) => typeof name !== "string" || name.length === 0) ||
      new Set(roles).size !== roles.length) {
    throw new TypeError("rectangular binary64 dataflow semantic program is stale");
  }
}

export const arrowSegmentGeometryVerifierPlugin = Object.freeze({
  id: VERIFIER,
  internalKinds: Object.freeze([KIND]),
  verify: verifyArrowSegmentGeometryPlan,
});
