import type { OptimizerPassPlugin } from "../catalog";
import { nearestOwningFunction } from "../contracts";
import { targetCandidate } from "../cost-model";
import {
  ARROW_SEGMENT_GEOMETRY_DOMAIN,
  ARROW_SEGMENT_GEOMETRY_INTERNAL_KIND,
  ARROW_SEGMENT_GEOMETRY_LOWERING,
  ARROW_SEGMENT_GEOMETRY_PASS,
  ARROW_SEGMENT_GEOMETRY_PRIORITY,
  ARROW_SEGMENT_GEOMETRY_VERIFIER,
} from "../domains/arrow-segment-geometry/model";
import { recognizeArrowSegmentGeometryProgram } from
  "../domains/arrow-segment-geometry/recognize";
import { verifyArrowSegmentGeometryDecision } from
  "../domains/arrow-segment-geometry/verify-executable";
import { stableRegionIdentity } from "../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationPass,
  OptimizationPassContext,
  OptimizationDecision,
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

export const arrowSegmentGeometryPass: OptimizationPass = {
  id: ARROW_SEGMENT_GEOMETRY_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: [
    "lexical-binding", "loop-nest-structure", "module-resolution-provenance",
    "fresh-private-output-bindings", "dead-final-loop-targets",
  ],
  factsProduced: [
    "fresh-private-output-bindings", "dead-final-loop-targets",
    "complete-runtime-preflight", "canonical-runtime-intrinsics",
    "canonical-math-hypot", "strict-binary64", "parallel-rectangular-grid",
    "safe-output-capacity", "transactional-private-publication",
    "untouched-same-source-restart",
  ],
  factsInvalidated: [],
  preserves: [
    "python-outer-and-inner-iteration", "source-operation-order",
    "row-shape-validation", "indexed-access-order", "float-coercion-order",
    "hypot-semantics", "none-and-zero-skip-order", "pivot-branch-order",
    "paired-list-extension-order", "binary64-rounding-points", "signed-zero",
    "nan-and-infinity", "exceptions", "two-backedge-interrupts",
    "zero-trip-behavior", "private-publication", "untouched-restart",
    "generic-fallback",
  ],
  guardsIntroduced: [
    "canonical-runtime-intrinsics", "canonical-math-hypot",
    "complete-exact-list-data-descriptor-preflight",
    "strict-binary64-live-ins-and-elements", "parallel-rectangular-grid-bounds",
    "safe-output-capacity", "transactional-private-publication",
  ],
  supportedTargets: ["v8", "generic"],
  verifier: ARROW_SEGMENT_GEOMETRY_VERIFIER,
  compilationCostBudget: 256,
  codeSizeBudget: 8_192,
  requiredEvidence: [
    "eligible-fused-outer-region-opportunity",
    "independent-structural-heldout-consumer",
    "complete-public-call-abba",
    "bit-exact-cpython-o0-o2-and-independent-oracles",
    "complete-preflight-before-allocation-or-interrupt",
    "same-source-untouched-fallback",
    "transactional-publication-and-interrupt-recovery",
    "node-and-browser-runtime-receipts",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      if (!(node instanceof context.compiler.AST_ForIn)) return;
      const recognition = recognizeArrowSegmentGeometryProgram(
        context.compiler,
        node,
        ancestors,
      );
      if (!recognition.recognized) return;
      const ownerFunction = nearestOwningFunction(context.compiler, ancestors);
      if (!ownerFunction) return;
      const source = sourceRegion(recognition.outerLoop);
      const identity = stableRegionIdentity(ARROW_SEGMENT_GEOMETRY_PASS, source, {
        kind: "closed-transactional-rectangular-binary64-dataflow",
        program: recognition.program,
        lowering: ARROW_SEGMENT_GEOMETRY_LOWERING,
        maximumOutputEntries: 7_000_000,
      });
      const decision: Omit<
        OptimizationDecision,
        "selected" | "rejectionReasons" | "functionId"
      > = {
        schema: OPTIMIZER_IR_SCHEMA,
        id: identity.id,
        passId: ARROW_SEGMENT_GEOMETRY_PASS,
        source,
        semantic: {
          level: "sage-semantic" as const,
          revision: 1,
          kind: "python.closed-transactional-rectangular-binary64-dataflow",
          operations: [...recognition.program.operations],
          observableExits: [
            "normal-atomic-paired-output-publication",
            "continue-on-missing-component",
            "continue-on-zero-magnitude-or-maximum",
            "untouched-fallback-before-source-effects",
            "outer-loop-backedge-interrupt",
            "inner-loop-backedge-interrupt",
          ],
          exceptionPolicy:
            "complete side-effect-free preflight precedes the private fast transaction; every rejection executes the untouched source loop once over its original live-ins",
        },
        mathematical: {
          level: "mathematical" as const,
          revision: 1,
          kind: "math.closed-transactional-rectangular-binary64-dataflow",
          domain:
            "runtime-authenticated exact Python lists containing strict binary64 rectangular coordinate and parallel component grids",
          operations: recognition.program.operations.map((operation) =>
            `rectangular-binary64-dataflow.${operation}`),
          exactness:
            "one IEEE-754 binary64 operation per source node in left-to-right grouping; canonical math.hypot is reproduced as sqrt(x*x+y*y) without reassociation",
        },
        facts: [
          {
            kind: "complete-runtime-preflight",
            authority: "runtime-guard" as const,
            evidence: recognition.program.proofGaps.join(","),
          },
          {
            kind: "fresh-private-output-bindings",
            authority: "static" as const,
            evidence: "both output names are fresh empty list literals with no intervening reads before the fused loop",
          },
          {
            kind: "dead-final-loop-targets",
            authority: "static" as const,
            evidence: "all four enumerate targets are unread after the fused outer region",
          },
          {
            kind: "transactional-private-publication",
            authority: "contract" as const,
            evidence: "two private arrays are decorated and assigned only after the complete fast traversal succeeds",
          },
        ],
        representation: {
          level: "representation" as const,
          revision: 1,
          kind: "guarded-exact-list-binary64-parallel-grids",
          candidates: [
            "resident-javascript-number-grids-with-private-output-streams",
            "ordinary-python-lists-and-dynamic-values",
          ],
          conversions: [
            "authenticate every reachable own data descriptor before fast entry",
            "unbox each strict Python float without invoking user code",
            "materialize exact Python float outputs only at private write sites",
            "decorate and atomically publish two completed Python lists",
          ],
          materializations: 2,
        },
        target: {
          level: "target" as const,
          revision: 1,
          kind: "v8" as const,
          lowering: ARROW_SEGMENT_GEOMETRY_LOWERING,
          boundaryCrossings: 0,
          copiedBytes: 0,
          selectedCandidate: "v8-rectangular-binary64-dataflow",
          policy:
            "select only after complete intrinsic, representation, binary64, shape, and capacity authentication; otherwise execute the untouched source loop",
          candidates: [
            targetCandidate({
              id: "v8-rectangular-binary64-dataflow",
              kind: "v8",
              representation:
                "resident JavaScript Numbers and transactionally private paired arrays",
              availability: "selected",
              cost: {
                arithmeticOperations: "runtime-dependent",
                representationConversions: "runtime-dependent",
                boundaryCrossings: 0,
                copiedBytes: 0,
                allocations: 2,
                cleanupOperations: 0,
                compileMilliseconds: 0,
                instantiateMilliseconds: 0,
                loadMilliseconds: 0,
                materializations: 2,
                emittedBytes: 4_096,
              },
              evidence:
                "eligible complete-public ABBA feasibility with representative and independent heldout separation",
            }),
            targetCandidate({
              id: "generic-rectangular-binary64-dataflow-fallback",
              kind: "generic",
              representation: "ordinary Python iteration, values, and lists",
              availability: "available",
              evidence: "untouched source loop selected on every failed guard",
            }),
          ],
        },
        guards: [
          "canonical-runtime-intrinsics",
          "canonical-math-hypot",
          "complete-exact-list-data-descriptor-preflight",
          "strict-binary64-live-ins-and-elements",
          "parallel-rectangular-grid-bounds",
          "safe-output-capacity",
          "transactional-private-publication",
        ],
        fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
        cacheIdentityInputs: [
          `schema:${OPTIMIZER_IR_SCHEMA}`,
          `pass:${ARROW_SEGMENT_GEOMETRY_PASS}`,
          `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
          `lowering:${ARROW_SEGMENT_GEOMETRY_LOWERING}`,
          `roles:${[
            recognition.program.xSequenceName,
            recognition.program.ySequenceName,
            recognition.program.uGridName,
            recognition.program.vGridName,
            recognition.program.xOutputName,
            recognition.program.yOutputName,
            recognition.program.pivotName,
          ].join(",")}`,
          `semantic-fingerprint:${identity.fingerprint}`,
          `level:${context.controls.level}`,
        ],
      };
      verifyArrowSegmentGeometryDecision(recognition.program, decision);
      context.consider({
        minimumLevel: "O2",
        node: recognition.outerLoop,
        ownerFunction,
        internal: {
          schema: OPTIMIZER_IR_SCHEMA,
          id: identity.id,
          passId: ARROW_SEGMENT_GEOMETRY_PASS,
          loweringId: ARROW_SEGMENT_GEOMETRY_LOWERING,
          functionId: null,
          guardFailure: "fallback",
          kind: ARROW_SEGMENT_GEOMETRY_INTERNAL_KIND,
          operands: {
            ...recognition.operands,
            program: recognition.program,
            iteratorKind: "sequence",
            iterationOrder: "forward",
            targetPlanId: "target.v8-rectangular-binary64-dataflow.v1",
            maximumOutputEntries: 7_000_000,
            completePreflight: true,
            privatePublication: true,
            copiedBytes: 0,
            boundaryCrossings: 0,
            materializations: 2,
          },
        },
        decision,
      });
    });
  },
};

export const arrowSegmentGeometryPlugin: OptimizerPassPlugin = Object.freeze({
  id: ARROW_SEGMENT_GEOMETRY_PASS,
  domainId: ARROW_SEGMENT_GEOMETRY_DOMAIN,
  priority: ARROW_SEGMENT_GEOMETRY_PRIORITY,
  claimSemantics: "exclusive",
  loweringIds: Object.freeze([ARROW_SEGMENT_GEOMETRY_LOWERING]),
  pass: arrowSegmentGeometryPass,
});
