import type { SourceRegion } from "../../types";

/** Stable identities owned by rectangular binary64 dataflow reconnaissance. */
export const ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS =
  "math.closed-transactional-rectangular-binary64-dataflow-reconnaissance.v1";
export const ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_DOMAIN =
  "closed-transactional-rectangular-binary64-dataflow-reconnaissance";
export const ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_VERIFIER =
  "verify.closed-transactional-rectangular-binary64-dataflow-reconnaissance.v1";
export const ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PRIORITY = 147;

export const ARROW_SEGMENT_GEOMETRY_REASONS = Object.freeze({
  binary64ResultBoxing:
    "rectangular-binary64-dataflow.strict-binary64-result-boxing-and-arithmetic-grouping-unproved",
  builtinEnumerateIdentity:
    "rectangular-binary64-dataflow.builtin-enumerate-identity-unproved",
  binary64Semantics:
    "rectangular-binary64-dataflow.binary64-signed-zero-nonfinite-overflow-unproved",
  capturedIntrinsicIdentities:
    "rectangular-binary64-dataflow.captured-runtime-intrinsic-identities-unproved",
  completePreflight:
    "rectangular-binary64-dataflow.complete-preflight-before-effects-interrupts-allocations-unproved",
  exceptionSemantics:
    "rectangular-binary64-dataflow.exception-and-index-error-semantics-unproved",
  finalLoopTargets:
    "rectangular-binary64-dataflow.final-loop-targets-unproved",
  fixedPairOrParallelGridRepresentation:
    "rectangular-binary64-dataflow.exact-list-fixed-pair-or-parallel-grid-representation-unproved",
  floatIdentity:
    "rectangular-binary64-dataflow.float-identity-unproved",
  freshOutputs:
    "rectangular-binary64-dataflow.fresh-ordered-output-streams-unproved",
  indexedBounds:
    "rectangular-binary64-dataflow.complete-parallel-grid-index-bounds-unproved",
  innerExactListIteration:
    "rectangular-binary64-dataflow.inner-exact-list-iteration-unproved",
  inputStability:
    "rectangular-binary64-dataflow.input-alias-and-mutation-stability-unproved",
  interruptSemantics:
    "rectangular-binary64-dataflow.outer-and-inner-loop-backedge-interrupt-semantics-unproved",
  iterationAndCapacityBounds:
    "rectangular-binary64-dataflow.safe-iteration-and-output-capacity-bounds-unproved",
  libraryUnavailable:
    "rectangular-binary64-dataflow.mature-library-route-unavailable",
  listExtendIdentity:
    "rectangular-binary64-dataflow.list-construction-and-extension-identity-unproved",
  mathHypotIdentity:
    "rectangular-binary64-dataflow.known-math-hypot-identity-unproved",
  nativeBoundary:
    "rectangular-binary64-dataflow.native-boundary-unevaluated",
  optionalOrderedMax:
    "rectangular-binary64-dataflow.optional-ordered-first-element-max-unproved",
  outerExactListIteration:
    "rectangular-binary64-dataflow.outer-exact-list-iteration-unproved",
  outputMaterialization:
    "rectangular-binary64-dataflow.float-boxing-and-output-materialization-unproved",
  parallelGridShape:
    "rectangular-binary64-dataflow.parallel-rectangular-grid-shape-unproved",
  pivotAuthentication:
    "rectangular-binary64-dataflow.arrow-pivot-domain-unproved",
  privateIntermediateFusion:
    "rectangular-binary64-dataflow.private-intermediate-fusion-unproved",
  privatePublication:
    "rectangular-binary64-dataflow.transactional-private-publication-unproved",
  restartFallback:
    "rectangular-binary64-dataflow.untouched-same-source-restart-fallback-unproved",
  sourceOrder:
    "rectangular-binary64-dataflow.source-operation-order-unproved",
  strictBinary64:
    "rectangular-binary64-dataflow.strict-binary64-inputs-and-live-ins-unproved",
  v8Lowering:
    "rectangular-binary64-dataflow.v8-lowering-unimplemented",
  wasmBoundary:
    "rectangular-binary64-dataflow.wasm-boundary-unevaluated",
} as const);

export interface ArrowSegmentGeometryProgram {
  version: 1;
  kind: "closed-transactional-rectangular-binary64-dataflow";
  variant: "arrow-segment-stream";
  traversalKind: "nested-enumerated-parallel-grid-rows";
  requiredContext: "enclosing-outer-row-loop";
  selectionUnit: "two-level-transactional-loop-program";
  primaryRegionKind: "fused-outer-loop";
  hotChildRegionKind: "profiled-inner-loop";
  hotChildSource: SourceRegion;
  publicationKind: "paired-segment-stream-candidate";
  xSequenceName: string;
  ySequenceName: string;
  uGridName: string;
  vGridName: string;
  xOutputName: string;
  yOutputName: string;
  pivotName: string;
  operations: readonly string[];
  proofGaps: readonly string[];
}

export type ArrowSegmentGeometryRecognition =
  | { recognized: true; program: ArrowSegmentGeometryProgram; outerLoop: any }
  | { recognized: false; reason: string };

export function arrowSegmentGeometryOperations(): readonly string[] {
  return Object.freeze([
    "enumerate-outer", "indexed-u-row", "indexed-v-row",
    "validate-row-lists", "enumerate-inner", "indexed-u", "indexed-v",
    "skip-none-components", "coerce-components-binary64", "hypot-magnitude",
    "skip-zero-magnitude-or-maximum", "normalize-dx-left-associated",
    "normalize-dy-left-associated", "pivot-middle-tip-tail",
    "construct-endpoint", "extend-shaft-x", "extend-shaft-y",
    "conditional-head", "normalize-head-direction", "hypot-arrow-length",
    "construct-head-sides", "extend-head-x", "extend-head-y",
  ]);
}

export function arrowSegmentGeometryProofGaps(): readonly string[] {
  return Object.freeze([
    ARROW_SEGMENT_GEOMETRY_REASONS.binary64ResultBoxing,
    ARROW_SEGMENT_GEOMETRY_REASONS.builtinEnumerateIdentity,
    ARROW_SEGMENT_GEOMETRY_REASONS.binary64Semantics,
    ARROW_SEGMENT_GEOMETRY_REASONS.capturedIntrinsicIdentities,
    ARROW_SEGMENT_GEOMETRY_REASONS.completePreflight,
    ARROW_SEGMENT_GEOMETRY_REASONS.exceptionSemantics,
    ARROW_SEGMENT_GEOMETRY_REASONS.finalLoopTargets,
    ARROW_SEGMENT_GEOMETRY_REASONS.fixedPairOrParallelGridRepresentation,
    ARROW_SEGMENT_GEOMETRY_REASONS.floatIdentity,
    ARROW_SEGMENT_GEOMETRY_REASONS.freshOutputs,
    ARROW_SEGMENT_GEOMETRY_REASONS.indexedBounds,
    ARROW_SEGMENT_GEOMETRY_REASONS.innerExactListIteration,
    ARROW_SEGMENT_GEOMETRY_REASONS.inputStability,
    ARROW_SEGMENT_GEOMETRY_REASONS.interruptSemantics,
    ARROW_SEGMENT_GEOMETRY_REASONS.iterationAndCapacityBounds,
    ARROW_SEGMENT_GEOMETRY_REASONS.listExtendIdentity,
    ARROW_SEGMENT_GEOMETRY_REASONS.mathHypotIdentity,
    ARROW_SEGMENT_GEOMETRY_REASONS.optionalOrderedMax,
    ARROW_SEGMENT_GEOMETRY_REASONS.outerExactListIteration,
    ARROW_SEGMENT_GEOMETRY_REASONS.outputMaterialization,
    ARROW_SEGMENT_GEOMETRY_REASONS.parallelGridShape,
    ARROW_SEGMENT_GEOMETRY_REASONS.pivotAuthentication,
    ARROW_SEGMENT_GEOMETRY_REASONS.privateIntermediateFusion,
    ARROW_SEGMENT_GEOMETRY_REASONS.privatePublication,
    ARROW_SEGMENT_GEOMETRY_REASONS.restartFallback,
    ARROW_SEGMENT_GEOMETRY_REASONS.sourceOrder,
    ARROW_SEGMENT_GEOMETRY_REASONS.strictBinary64,
  ].sort());
}
