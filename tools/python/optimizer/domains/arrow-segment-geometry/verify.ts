import { stableRegionIdentity } from "../../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
} from "../../types";
import { verifyOptimizationDecision } from "../../verifier";
import {
  arrowSegmentGeometryOperations,
  arrowSegmentGeometryProofGaps,
  ARROW_SEGMENT_GEOMETRY_REASONS,
  ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
  ArrowSegmentGeometryProgram,
} from "./model";

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function unknownCost(): Record<string, "runtime-dependent"> {
  return {
    arithmeticOperations: "runtime-dependent",
    representationConversions: "runtime-dependent",
    boundaryCrossings: "runtime-dependent",
    copiedBytes: "runtime-dependent",
    allocations: "runtime-dependent",
    cleanupOperations: "runtime-dependent",
    compileMilliseconds: "runtime-dependent",
    instantiateMilliseconds: "runtime-dependent",
    loadMilliseconds: "runtime-dependent",
    materializations: "runtime-dependent",
    emittedBytes: "runtime-dependent",
    totalUnits: "runtime-dependent",
  };
}

function genericCost(): Record<string, number | "runtime-dependent"> {
  return {
    arithmeticOperations: "runtime-dependent",
    representationConversions: 0,
    boundaryCrossings: 0,
    copiedBytes: 0,
    allocations: "runtime-dependent",
    cleanupOperations: "runtime-dependent",
    compileMilliseconds: 0,
    instantiateMilliseconds: 0,
    loadMilliseconds: 0,
    materializations: "runtime-dependent",
    emittedBytes: 0,
    totalUnits: "runtime-dependent",
  };
}

function sourceContains(outer: any, inner: any): boolean {
  if (!inner || inner.filename !== outer.filename) return false;
  const coordinates = [
    inner.line, inner.column, inner.endLine, inner.endColumn,
  ];
  if (coordinates.some((value) =>
    !Number.isSafeInteger(value) || Number(value) < 0
  )) return false;
  const startsInside = inner.line > outer.line ||
    (inner.line === outer.line && inner.column >= outer.column);
  const endsInside = inner.endLine < outer.endLine ||
    (inner.endLine === outer.endLine && inner.endColumn <= outer.endColumn);
  const ordered = inner.endLine > inner.line ||
    (inner.endLine === inner.line && inner.endColumn >= inner.column);
  return startsInside && endsInside && ordered && !equal(inner, outer);
}

/** Independently authenticate the deliberately non-executable decision. */
export function verifyArrowSegmentGeometryReconnaissanceDecision(
  program: ArrowSegmentGeometryProgram,
  decision: Omit<
    OptimizationDecision,
    "selected" | "rejectionReasons" | "functionId"
  >,
): void {
  const fail = (): never => {
    throw new TypeError("invalid arrow segment geometry reconnaissance decision");
  };
  const roleNames = [
    program.xSequenceName,
    program.ySequenceName,
    program.uGridName,
    program.vGridName,
    program.xOutputName,
    program.yOutputName,
    program.pivotName,
  ];
  const expectedExits = [
    "normal-paired-output-extension",
    "continue-on-missing-component",
    "continue-on-zero-magnitude-or-maximum",
    "row-shape-type-error",
    "indexed-access-error",
    "numeric-conversion-or-hypot-error",
    "outer-loop-backedge-interrupt",
    "inner-loop-backedge-interrupt",
  ];
  const expectedFacts = [
    "structural-two-loop-parallel-grid-geometry",
    "structural-ordered-skip-pivot-and-head-geometry",
    "structural-paired-segment-output-streams",
    "profiled-hot-child-contained-by-primary-region",
    "missing-proof-summary",
  ];
  const expectedProgramKeys = [
    "hotChildRegionKind", "hotChildSource", "kind", "operations",
    "pivotName", "primaryRegionKind", "proofGaps", "publicationKind",
    "requiredContext", "selectionUnit", "traversalKind", "uGridName",
    "vGridName", "variant", "version", "xOutputName", "xSequenceName",
    "yOutputName", "ySequenceName",
  ];
  const expectedSemantic = {
    level: "sage-semantic",
    revision: 1,
    kind: "python.closed-transactional-rectangular-binary64-dataflow-candidate",
    operations: [...program.operations],
    observableExits: expectedExits,
    exceptionPolicy:
      "explanation only; preserve ordered outer and inner iteration, row and index failures, float and hypot effects, both loop-backedge interrupts, paired extension order, private outputs, and untouched fallback",
  };
  const expectedMathematical = {
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
  };
  const expectedFactRecords = [
    {
      kind: expectedFacts[0],
      authority: "static",
      evidence:
        "two ordered enumerate-shaped loops read two row grids at the outer index and both components at the inner index",
    },
    {
      kind: expectedFacts[1],
      authority: "static",
      evidence:
        "the loop has ordered missing/zero skips, hypot normalization, middle/tip/tail pivot branches, and conditional head construction",
    },
    {
      kind: expectedFacts[2],
      authority: "static",
      evidence:
        "two distinct lexical receivers get corresponding shaft and head tuple-shaped extend calls in source order",
    },
    {
      kind: expectedFacts[3],
      authority: "static",
      evidence:
        `${program.hotChildSource.filename}:${program.hotChildSource.line}:` +
        `${program.hotChildSource.column}-${program.hotChildSource.endLine}:` +
        `${program.hotChildSource.endColumn}`,
    },
    {
      kind: expectedFacts[4],
      authority: "static",
      evidence: program.proofGaps.join(","),
    },
  ];
  const expectedRepresentation = {
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
  };
  if (!equal(Object.keys(program).sort(), expectedProgramKeys) ||
      program.version !== 1 ||
      program.kind !== "closed-transactional-rectangular-binary64-dataflow" ||
      program.variant !== "arrow-segment-stream" ||
      program.traversalKind !== "nested-enumerated-parallel-grid-rows" ||
      program.requiredContext !== "enclosing-outer-row-loop" ||
      program.selectionUnit !== "two-level-transactional-loop-program" ||
      program.primaryRegionKind !== "fused-outer-loop" ||
      program.hotChildRegionKind !== "profiled-inner-loop" ||
      !sourceContains(decision.source, program.hotChildSource) ||
      program.publicationKind !== "paired-segment-stream-candidate" ||
      roleNames.some((name) => typeof name !== "string" || name.length === 0) ||
      new Set(roleNames).size !== roleNames.length ||
      !equal(program.operations, arrowSegmentGeometryOperations()) ||
      !equal(program.proofGaps, arrowSegmentGeometryProofGaps()) ||
      decision.schema !== OPTIMIZER_IR_SCHEMA ||
      decision.passId !== ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS ||
      !equal(decision.semantic, expectedSemantic) ||
      !equal(decision.mathematical, expectedMathematical) ||
      !equal(decision.facts, expectedFactRecords) ||
      !equal(decision.representation, expectedRepresentation) ||
      decision.target.kind !== "generic" ||
      decision.target.lowering !== "none; reconnaissance only" ||
      decision.target.selectedCandidate !==
        "generic-rectangular-binary64-dataflow-fallback" ||
      decision.target.candidates.length !== 5 ||
      decision.target.boundaryCrossings !== "runtime-dependent" ||
      decision.target.copiedBytes !== "runtime-dependent" ||
      decision.target.policy !==
        "retain the untouched source loop nest until every callable and captured-intrinsic identity, complete preflight, shape, bound, strict-binary64 boxing, effect, two-loop interrupt, private-publication, exact-restart, and target proof is independently verified" ||
      !equal(decision.guards, ["no-executable-lowering"])) fail();
  const identity = stableRegionIdentity(
    ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS,
    decision.source,
    { kind: "closed-transactional-rectangular-binary64-dataflow", program },
  );
  if (decision.id !== identity.id || decision.fallbackId !==
        `semantic:${decision.source.filename}:${decision.source.line}:${decision.source.column}` ||
      !equal(decision.cacheIdentityInputs, [
        `schema:${OPTIMIZER_IR_SCHEMA}`,
        `pass:${ARROW_SEGMENT_GEOMETRY_RECONNAISSANCE_PASS}`,
        `source:${decision.source.filename}:${decision.source.line}:${decision.source.column}:${decision.source.endLine}:${decision.source.endColumn}`,
        `semantic-fingerprint:${identity.fingerprint}`,
      ])) fail();
  const candidates = decision.target.candidates;
  if (!equal(candidates, [
    {
      id: "v8-rectangular-binary64-dataflow-candidate",
      kind: "v8",
      representation:
        "guarded resident JavaScript grids with transactionally private outputs",
      availability: "rejected",
      rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.v8Lowering,
      cost: unknownCost(),
      evidence:
        "feasibility evidence exists, but no verified two-backedge transactional V8 lowering is registered",
    },
    {
      id: "wasm-rectangular-binary64-dataflow-candidate",
      kind: "wasm",
      representation: "copied packed binary64 grids and rematerialized boxed outputs",
      availability: "rejected",
      rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.wasmBoundary,
      cost: unknownCost(),
      evidence:
        "nested boxed inputs, much larger variable outputs, copy costs, and browser residency have not been justified",
    },
    {
      id: "native-rectangular-binary64-dataflow-candidate",
      kind: "native",
      representation:
        "source-transparent packed binary64 grids with rematerialized boxed outputs",
      availability: "rejected",
      rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.nativeBoundary,
      cost: unknownCost(),
      evidence:
        "host conversion, variable output transfer, interrupt, and browser fallback costs have not been justified",
    },
    {
      id: "library-rectangular-binary64-dataflow-candidate",
      kind: "library",
      representation:
        "external geometry result requiring Plotly list materialization",
      availability: "rejected",
      rejectionReason: ARROW_SEGMENT_GEOMETRY_REASONS.libraryUnavailable,
      cost: unknownCost(),
      evidence:
        "no mature library implements this ordered Sage-to-Plotly segment translation",
    },
    {
      id: "generic-rectangular-binary64-dataflow-fallback",
      kind: "generic",
      representation: "ordinary Python iteration, floats, and semantic lists",
      availability: "selected",
      rejectionReason: null,
      cost: genericCost(),
      evidence: "the untouched source loop nest remains the only executable route",
    },
  ])) fail();
  verifyOptimizationDecision({
    ...decision,
    functionId: null,
    selected: false,
    rejectionReasons: [...program.proofGaps],
  });
}
