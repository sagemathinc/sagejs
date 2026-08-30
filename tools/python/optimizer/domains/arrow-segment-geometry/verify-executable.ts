import { stableRegionIdentity } from "../../identity";
import { OPTIMIZER_IR_SCHEMA, OptimizationDecision } from "../../types";
import { verifyOptimizationDecision } from "../../verifier";
import {
  arrowSegmentGeometryOperations,
  arrowSegmentGeometryProofGaps,
  ARROW_SEGMENT_GEOMETRY_LOWERING,
  ARROW_SEGMENT_GEOMETRY_PASS,
  ArrowSegmentGeometryProgram,
} from "./model";

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Recompute the public executable claim independently of the pass builder. */
export function verifyArrowSegmentGeometryDecision(
  program: ArrowSegmentGeometryProgram,
  decision: Omit<
    OptimizationDecision,
    "selected" | "rejectionReasons" | "functionId"
  >,
): void {
  const fail = (): never => {
    throw new TypeError("invalid executable rectangular binary64 dataflow decision");
  };
  const roles = [
    program.xSequenceName, program.ySequenceName,
    program.uGridName, program.vGridName,
    program.xOutputName, program.yOutputName, program.pivotName,
  ];
  if (program.version !== 1 ||
      program.kind !== "closed-transactional-rectangular-binary64-dataflow" ||
      program.variant !== "arrow-segment-stream" ||
      program.selectionUnit !== "two-level-transactional-loop-program" ||
      program.primaryRegionKind !== "fused-outer-loop" ||
      program.hotChildRegionKind !== "profiled-inner-loop" ||
      roles.some((name) => typeof name !== "string" || name.length === 0) ||
      new Set(roles).size !== roles.length ||
      !equal(program.operations, arrowSegmentGeometryOperations()) ||
      !equal(program.proofGaps, arrowSegmentGeometryProofGaps()) ||
      decision.schema !== OPTIMIZER_IR_SCHEMA ||
      decision.passId !== ARROW_SEGMENT_GEOMETRY_PASS ||
      decision.semantic.kind !==
        "python.closed-transactional-rectangular-binary64-dataflow" ||
      decision.mathematical.kind !==
        "math.closed-transactional-rectangular-binary64-dataflow" ||
      decision.representation.kind !==
        "guarded-exact-list-binary64-parallel-grids" ||
      decision.target.kind !== "v8" ||
      decision.target.selectedCandidate !== "v8-rectangular-binary64-dataflow" ||
      decision.target.lowering !== ARROW_SEGMENT_GEOMETRY_LOWERING ||
      !decision.facts.some((fact) =>
        fact.kind === "complete-runtime-preflight" &&
        fact.authority === "runtime-guard" &&
        fact.evidence === program.proofGaps.join(",")) ||
      !equal(decision.guards, [
        "canonical-runtime-intrinsics",
        "canonical-math-hypot",
        "complete-exact-list-data-descriptor-preflight",
        "strict-binary64-live-ins-and-elements",
        "parallel-rectangular-grid-bounds",
        "safe-output-capacity",
        "transactional-private-publication",
      ])) fail();
  const identity = stableRegionIdentity(
    ARROW_SEGMENT_GEOMETRY_PASS,
    decision.source,
    {
      kind: "closed-transactional-rectangular-binary64-dataflow",
      program,
      lowering: ARROW_SEGMENT_GEOMETRY_LOWERING,
      maximumOutputEntries: 7_000_000,
    },
  );
  if (decision.id !== identity.id ||
      decision.fallbackId !==
        `semantic:${decision.source.filename}:${decision.source.line}:${decision.source.column}` ||
      !decision.cacheIdentityInputs.includes(`semantic-fingerprint:${identity.fingerprint}`)) {
    fail();
  }
  verifyOptimizationDecision({
    ...decision,
    functionId: null,
    selected: true,
    rejectionReasons: [],
  });
}
