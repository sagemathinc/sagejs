import type { OptimizerPassPlugin } from "../catalog";
import { nearestOwningFunction } from "../contracts";
import { targetCandidate } from "../cost-model";
import {
  ARROW_SEGMENT_GEOMETRY_REASONS,
  ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_DOMAIN,
  ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
  ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PRIORITY,
  ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_VERIFIER,
  ArrowSegmentGeometryProgram,
} from "../domains/arrow-segment-geometry/model";
import { recognizeArrowSegmentGeometryProgram } from
  "../domains/arrow-segment-geometry/recognize";
import { verifyArrowSegmentGeometryReconnaissanceDecision } from
  "../domains/arrow-segment-geometry/verify";
import { stableRegionIdentity } from "../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
  OptimizationPass,
  OptimizationPassContext,
  SourceRegion,
} from "../types";

function sourceRegion(node: any): SourceRegion {
  return {
    filename: node.start?.file ?? "<input>",
    line: Number(node.start?.line ?? 0),
    column: Number(node.start?.col ?? 0),
    endLine: Number(node.end?.line ?? node.start?.line ?? 0),
    endColumn: Number(node.end?.col ?? node.start?.col ?? 0),
  };
}

function observationDecision(
  node: any,
  program: ArrowSegmentGeometryProgram,
): Omit<OptimizationDecision, "selected" | "rejectionReasons" | "functionId"> {
  const source = sourceRegion(node);
  const identity = stableRegionIdentity(
    ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
    source,
    { kind: "closed-transactional-rectangular-binary64-dataflow", program },
  );
  return {
    schema: OPTIMIZER_IR_SCHEMA,
    id: identity.id,
    passId: ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
    source,
    semantic: {
      level: "sage-semantic",
      revision: 1,
      kind: "python.closed-transactional-rectangular-binary64-dataflow-candidate",
      operations: [...program.operations],
      observableExits: [
        "normal-paired-output-extension",
        "continue-on-missing-component",
        "continue-on-zero-magnitude-or-maximum",
        "row-shape-type-error",
        "indexed-access-error",
        "numeric-conversion-or-hypot-error",
        "outer-loop-backedge-interrupt",
        "inner-loop-backedge-interrupt",
      ],
      exceptionPolicy:
        "explanation only; preserve ordered outer and inner iteration, row and index failures, float and hypot effects, both loop-backedge interrupts, paired extension order, private outputs, and untouched fallback",
    },
    mathematical: {
      level: "mathematical",
      revision: 1,
      kind: "math.closed-transactional-rectangular-binary64-dataflow-candidate",
      domain:
        "unproved rectangular parallel grids with strict binary64 coordinates, components, and geometry live-ins",
      operations: program.operations.map((operation) =>
        `rectangular-binary64-dataflow.${operation}`
      ),
      exactness:
        "the inner opportunity is recognized only with its enclosing outer row loop; target selection requires lowering that two-level program as one transaction, while callable identities, representations, dimensions, binary64 edge behavior, effects, interrupts, and publication remain unproved",
    },
    facts: [
      {
        kind: "structural-two-loop-parallel-grid-geometry",
        authority: "static",
        evidence:
          "two ordered enumerate-shaped loops read two row grids at the outer index and both components at the inner index",
      },
      {
        kind: "structural-ordered-skip-pivot-and-head-geometry",
        authority: "static",
        evidence:
          "the loop has ordered missing/zero skips, hypot normalization, middle/tip/tail pivot branches, and conditional head construction",
      },
      {
        kind: "structural-paired-segment-output-streams",
        authority: "static",
        evidence:
          "two distinct lexical receivers get corresponding shaft and head tuple-shaped extend calls in source order",
      },
      {
        kind: "profiled-hot-child-contained-by-primary-region",
        authority: "static",
        evidence:
          `${program.hotChildSource.filename}:${program.hotChildSource.line}:` +
          `${program.hotChildSource.column}-${program.hotChildSource.endLine}:` +
          `${program.hotChildSource.endColumn}`,
      },
      {
        kind: "missing-proof-summary",
        authority: "static",
        evidence: program.proofGaps.join(","),
      },
    ],
    representation: {
      level: "representation",
      revision: 1,
      kind: "unproved-detached-binary64-parallel-grid-and-private-output-lists",
      candidates: [
        "guarded exact nested binary64 lists with private boxed outputs",
        "resident-wasm-binary64-grid-storage",
        "source-transparent-native-binary64-grid-storage",
        "mature-external-geometry-library",
        "generic-python-semantic-containers",
      ],
      conversions: [
        "authenticate all grids, rows, complete parallel bounds, strict binary64 values, aliases, exact Python callables, captured runtime intrinsics, live-ins, safe iteration counts, output capacities, and final loop targets before optimized allocation, arithmetic, writes, or interrupt polling",
        "preserve left-associated arithmetic and construct a strict Python binary64 box at every source result-boxing point, including signed zero, infinities, NaN, underflow, and overflow",
        "construct both boxed output lists privately and publish only after the complete loop nest succeeds",
        "choose the untouched same-source loop over the already-computed live-ins before fast entry whenever authentication fails; never restart the containing function or repeat preheader effects",
      ],
      materializations: 0,
    },
    target: {
      level: "target",
      revision: 1,
      kind: "generic",
      lowering: "none; reconnaissance only",
      boundaryCrossings: "runtime-dependent",
      copiedBytes: "runtime-dependent",
      selectedCandidate: "generic-rectangular-binary64-dataflow-fallback",
      policy:
        "retain the untouched source loop nest until every callable and captured-intrinsic identity, complete preflight, shape, bound, strict-binary64 boxing, effect, two-loop interrupt, private-publication, exact-restart, and target proof is independently verified",
      candidates: [
        targetCandidate({
          id: "v8-rectangular-binary64-dataflow-candidate",
          kind: "v8",
          representation:
            "guarded resident JavaScript grids with transactionally private outputs",
          availability: "rejected",
          rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.v8Lowering,
          evidence:
            "feasibility evidence exists, but no verified two-backedge transactional V8 lowering is registered",
        }),
        targetCandidate({
          id: "wasm-rectangular-binary64-dataflow-candidate",
          kind: "wasm",
          representation: "copied packed binary64 grids and rematerialized boxed outputs",
          availability: "rejected",
          rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.wasmBoundary,
          evidence:
            "nested boxed inputs, much larger variable outputs, copy costs, and browser residency have not been justified",
        }),
        targetCandidate({
          id: "native-rectangular-binary64-dataflow-candidate",
          kind: "native",
          representation:
            "source-transparent packed binary64 grids with rematerialized boxed outputs",
          availability: "rejected",
          rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.nativeBoundary,
          evidence:
            "host conversion, variable output transfer, interrupt, and browser fallback costs have not been justified",
        }),
        targetCandidate({
          id: "library-rectangular-binary64-dataflow-candidate",
          kind: "library",
          representation: "external geometry result requiring Plotly list materialization",
          availability: "rejected",
          rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.libraryUnavailable,
          evidence:
            "no mature library implements this ordered Sage-to-Plotly segment translation",
        }),
        targetCandidate({
          id: "generic-rectangular-binary64-dataflow-fallback",
          kind: "generic",
          representation: "ordinary Python iteration, floats, and semantic lists",
          availability: "selected",
          cost: {
            representationConversions: 0,
            boundaryCrossings: 0,
            copiedBytes: 0,
            compileMilliseconds: 0,
            instantiateMilliseconds: 0,
            loadMilliseconds: 0,
            emittedBytes: 0,
          },
          evidence: "the untouched source loop nest remains the only executable route",
        }),
      ],
    },
    guards: ["no-executable-lowering"],
    fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
    cacheIdentityInputs: [
      `schema:${OPTIMIZER_IR_SCHEMA}`,
      `pass:${ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS}`,
      `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
      `semantic-fingerprint:${identity.fingerprint}`,
    ],
  };
}

export const arrowSegmentGeometryReconnaissancePass: OptimizationPass = {
  id: ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "lexical-binding", "loop-nest-structure", "module-resolution-provenance",
  ],
  factsProduced: [
    "structural-two-loop-parallel-grid-geometry",
    "structural-ordered-skip-pivot-and-head-geometry",
    "structural-paired-segment-output-streams",
    "profiled-hot-child-contained-by-primary-region",
    "missing-proof-summary",
  ],
  factsInvalidated: [],
  preserves: [
    "python-outer-and-inner-iteration", "source-evaluation-order",
    "row-shape-validation", "indexed-access-order", "float-coercion-order",
    "hypot-call-order", "none-and-zero-skip-order", "pivot-branch-order",
    "paired-list-extension-order", "exceptions", "two-backedge-interrupts",
    "zero-trip-behavior", "private-publication", "untouched-restart",
    "generic-fallback",
  ],
  guardsIntroduced: ["no-executable-lowering"],
  supportedTargets: ["v8", "wasm", "native", "library", "generic"],
  verifier: ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_VERIFIER,
  compilationCostBudget: 96,
  codeSizeBudget: 0,
  requiredEvidence: [
    "production-parallel-grid-arrow-geometry-source-fixture",
    "application-and-lexical-name-independent-structural-fixture",
    "adversarial-alias-callback-mutation-ragged-and-publication-corpus",
    "independent-proof-gap-target-and-identity-verifier",
    "no-executable-lowering",
    "inclusive-v8-wasm-native-library-comparison-before-promotion",
    "two-source-loop-backedge-interrupt-conformance-before-promotion",
    "complete-preflight-before-fast-allocation-arithmetic-write-or-interrupt",
    "exact-binary64-boxing-grouping-and-captured-intrinsic-conformance",
    "complete-grid-iteration-and-output-capacity-bounds-before-promotion",
    "private-two-stream-atomic-publication-and-exact-same-locals-restart",
    "independent-comprehension-projection-reduction-variant-remains-held-out-until-normalized-proof",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      if (!(node instanceof context.compiler.AST_ForIn)) return;
      const ownerFunction = nearestOwningFunction(context.compiler, ancestors);
      if (!ownerFunction) return;
      const recognition = recognizeArrowSegmentGeometryProgram(
        context.compiler,
        node,
        ancestors,
      );
      if (!recognition.recognized) return;
      // Claim the complete fused selection unit.  The measured inner loop is
      // retained as an exact hot child in the semantic program and facts; it
      // must not masquerade as the primary region for an outer-loop lowering.
      const decision = observationDecision(
        recognition.outerLoop,
        recognition.program,
      );
      verifyArrowSegmentGeometryReconnaissanceDecision(
        recognition.program,
        decision,
      );
      context.observe({
        minimumLevel: "O2",
        node: recognition.outerLoop,
        ownerFunction,
        rejectionReasons: recognition.program.proofGaps,
        decision,
      });
    });
  },
};

export const arrowSegmentGeometryReconnaissancePlugin: OptimizerPassPlugin =
  Object.freeze({
    id: ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
    domainId: ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_DOMAIN,
    priority: ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PRIORITY,
    claimSemantics: "exclusive",
    loweringIds: Object.freeze([]),
    pass: arrowSegmentGeometryReconnaissancePass,
  });
