import type { OptimizerPassPlugin } from "../catalog";
import { nearestOwningFunction } from "../contracts";
import { targetCandidate } from "../cost-model";
import {
  MODULAR_SEQUENCE_REASONS,
  MODULAR_SEQUENCE_RECONNAISSANCE_DOMAIN,
  MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
  MODULAR_SEQUENCE_RECONNAISSANCE_PRIORITY,
  MODULAR_SEQUENCE_RECONNAISSANCE_VERIFIER,
  ModularSequenceProgram,
} from "../domains/modular-sequence/model";
import { recognizeModularSequenceProgram } from
  "../domains/modular-sequence/recognize";
import { verifyModularSequenceReconnaissanceDecision } from
  "../domains/modular-sequence/verify";
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
  program: ModularSequenceProgram,
): Omit<OptimizationDecision, "selected" | "rejectionReasons" | "functionId"> {
  const source = sourceRegion(node);
  const identity = stableRegionIdentity(
    MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
    source,
    { kind: "modular-sequence-reconnaissance", program },
  );
  let semantic: OptimizationDecision["semantic"];
  let mathematical: OptimizationDecision["mathematical"];
  let facts: OptimizationDecision["facts"];
  let representation: OptimizationDecision["representation"];
  if (program.kind === "bounded-modular-fold") {
    semantic = {
      level: "sage-semantic",
      revision: 1,
      kind: "python.private-modular-sequence-fold-candidate",
      operations: [
        "iterate-reversed", "assign-private-state", "multiply", "add", "remainder",
      ],
      observableExits: [program.stateName, "loop-target"],
      exceptionPolicy:
        "explanation only; retain the original iterator, dispatch, and exception order",
    };
    mathematical = {
      level: "mathematical",
      revision: 1,
      kind: "math.bounded-modular-fold-candidate",
      domain: "unproved bounded modular residues",
      operations: program.operations.map((operation) => `residue.${operation}`),
      exactness:
        "modular recurrence recognized; machine bounds and dispatch are not established",
    };
    facts = [
      {
        kind: "canonical-private-modular-recurrence",
        authority: "static",
        evidence: "one lexical state is initialized immediately before and assigned once per iteration",
      },
      {
        kind: "ordered-reversed-sequence-consumption",
        authority: "static",
        evidence: "the source has one reversed-iterator call and one recurrence statement",
      },
      {
        kind: "missing-proof-summary",
        authority: "static",
        evidence: program.proofGaps.join(","),
      },
    ];
    representation = {
      level: "representation",
      revision: 1,
      kind: "unproved-sequence-representation",
      candidates: [
        "guarded-uint32-residue-sequence", "resident-wasm-residue-sequence",
        "source-transparent-native-residue-sequence", "generic-boxed-python-sequence",
      ],
      conversions: [
        "authenticate iterator and complete input before optimized effects",
        "authenticate every consumed element representation",
        "materialize one exact modular result after the complete fold",
      ],
      materializations: 1,
    };
  } else if (program.kind === "nested-bounded-modular-scan") {
    semantic = {
      level: "sage-semantic",
      revision: 1,
      kind: "python.nested-modular-scan-candidate",
      operations: [
        "iterate-range", "initialize-inner-state", "iterate-reversed",
        "assign-private-state", "zero-branch", program.zeroBranch,
      ],
      observableExits: [program.outerIndexName, program.stateName, "outer-loop-control"],
      exceptionPolicy:
        "explanation only; preserve both iterators, every inner fold, the zero branch, and outer exits",
    };
    mathematical = {
      level: "mathematical",
      revision: 1,
      kind: "math.nested-bounded-modular-scan-candidate",
      domain: "unproved bounded modular residues scanned over one modulus range",
      operations: program.operations.map((operation) => `residue-scan.${operation}`),
      exactness:
        "nested scan recognized; outer guard hoisting, machine bounds, and dispatch are not established",
    };
    facts = [
      {
        kind: "canonical-nested-modular-scan",
        authority: "static",
        evidence: "one range iteration contains one freshly initialized reversed modular fold",
      },
      {
        kind: "shared-outer-modulus-and-multiplier",
        authority: "static",
        evidence: "the range bound is the fold modulus and the range item is the fold multiplier",
      },
      {
        kind: "complete-inner-fold-before-zero-branch",
        authority: "static",
        evidence: `the exact post-fold branch is ${program.zeroBranch}`,
      },
      {
        kind: "missing-proof-summary",
        authority: "static",
        evidence: program.proofGaps.join(","),
      },
    ];
    representation = {
      level: "representation",
      revision: 1,
      kind: "unproved-hoisted-modular-scan-representation",
      candidates: [
        "guarded-uint32-residue-sequence", "resident-wasm-residue-sequence",
        "source-transparent-native-residue-sequence", "generic-boxed-python-sequence",
      ],
      conversions: [
        "authenticate range, modulus, and complete residue sequence once before the outer scan",
        "retain one private machine accumulator for each inner fold",
        "publish outer control state only at its original source point",
      ],
      materializations: 1,
    };
  } else {
    semantic = {
      level: "sage-semantic",
      revision: 1,
      kind: "python.private-append-sequence-transform-candidate",
      operations: ["iterate-enumerated", "branch-equal", "append-private-output", "call"],
      observableExits: [program.outputName, program.indexName, program.elementName],
      exceptionPolicy:
        "explanation only; retain the original iterator, dispatch, callback, and exception order",
    };
    mathematical = {
      level: "mathematical",
      revision: 1,
      kind: "math.transactional-sequence-transform-candidate",
      domain: "unproved coefficient sequence and result domain",
      operations: program.operations.map((operation) => `sequence.${operation}`),
      exactness:
        "source order recognized; callback and element semantics are not established",
    };
    facts = [
      {
        kind: "fresh-private-list-output",
        authority: "static",
        evidence: "the output is a fresh one-element list initialized immediately before the loop",
      },
      {
        kind: "exclusive-append-mutation",
        authority: "static",
        evidence: "both branches append exactly once to the same fresh lexical list",
      },
      {
        kind: "post-loop-publication",
        authority: "static",
        evidence: "the next statement returns an expression containing the private output binding",
      },
      {
        kind: "missing-proof-summary",
        authority: "static",
        evidence: program.proofGaps.join(","),
      },
    ];
    representation = {
      level: "representation",
      revision: 1,
      kind: "unproved-sequence-representation",
      candidates: [
        "private-packed-output", "private-host-list",
        "source-transparent-native-output", "generic-boxed-python-sequence",
      ],
      conversions: [
        "authenticate iterator and complete input before optimized effects",
        "authenticate every consumed element representation",
        "publish the private output only after the complete transform",
      ],
      materializations: 1,
    };
  }
  return {
    schema: OPTIMIZER_IR_SCHEMA,
    id: identity.id,
    passId: MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
    source,
    semantic,
    mathematical,
    facts,
    representation,
    target: {
      level: "target",
      revision: 1,
      kind: "generic",
      lowering: "none; reconnaissance only",
      boundaryCrossings: "runtime-dependent",
      copiedBytes: "runtime-dependent",
      selectedCandidate: "generic-sequence-fallback",
      policy:
        "record the source shape and every proof gap without claiming an executable lowering",
      candidates: [
        targetCandidate({
          id: "v8-modular-sequence-candidate",
          kind: "v8",
          representation: "guarded machine sequence",
          availability: "rejected",
          rejectionReason: MODULAR_SEQUENCE_REASONS.v8Lowering,
          evidence: "no verified V8 lowering is registered for this reconnaissance domain",
        }),
        targetCandidate({
          id: "wasm-modular-sequence-candidate",
          kind: "wasm",
          representation: "resident packed sequence",
          availability: "rejected",
          rejectionReason: MODULAR_SEQUENCE_REASONS.wasmResidency,
          evidence: "resident ownership, copy, and publication costs are not proved",
        }),
        targetCandidate({
          id: "native-modular-sequence-candidate",
          kind: "native",
          representation: "source-transparent isolated sequence",
          availability: "rejected",
          rejectionReason: MODULAR_SEQUENCE_REASONS.nativeBoundary,
          evidence: "the complete conversion and boundary cost has not been measured",
        }),
        targetCandidate({
          id: "generic-sequence-fallback",
          kind: "generic",
          representation: "ordinary Python semantic objects",
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
          evidence: "the untouched source loop remains the only executable route",
        }),
      ],
    },
    guards: ["no-executable-lowering"],
    fallbackId: `semantic:${source.filename}:${source.line}:${source.column}`,
    cacheIdentityInputs: [
      `schema:${OPTIMIZER_IR_SCHEMA}`,
      `pass:${MODULAR_SEQUENCE_RECONNAISSANCE_PASS}`,
      `source:${source.filename}:${source.line}:${source.column}:${source.endLine}:${source.endColumn}`,
      `semantic-fingerprint:${identity.fingerprint}`,
    ],
  };
}

export const modularSequenceReconnaissancePass: OptimizationPass = {
  id: MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
  inputSchema: OPTIMIZER_IR_SCHEMA,
  acceptedLevel: "sage-semantic",
  producedLevel: "target",
  factsConsumed: ["lexical-binding", "structured-effects"],
  factsProduced: [
    "canonical-private-modular-recurrence",
    "ordered-reversed-sequence-consumption",
    "fresh-private-list-output",
    "exclusive-append-mutation",
    "post-loop-publication",
    "canonical-nested-modular-scan",
    "shared-outer-modulus-and-multiplier",
    "complete-inner-fold-before-zero-branch",
    "missing-proof-summary",
  ],
  factsInvalidated: [],
  preserves: [
    "python-iteration", "source-evaluation-order", "callback-order",
    "exceptions", "final-loop-target", "zero-trip-behavior", "generic-fallback",
  ],
  // Diagnostic passes still carry an explicit fail-closed guard contract:
  // this pass may observe candidates but can never authorize execution.
  guardsIntroduced: ["no-executable-lowering"],
  supportedTargets: ["v8", "wasm", "native", "generic"],
  verifier: MODULAR_SEQUENCE_RECONNAISSANCE_VERIFIER,
  compilationCostBudget: 64,
  codeSizeBudget: 0,
  requiredEvidence: [
    "exact-source-range-fixtures",
    "unrelated-lookalike-negative-corpus",
    "no-executable-lowering",
    "inclusive-v8-wasm-native-target-comparison-before-promotion",
  ],
  run(root: any, context: OptimizationPassContext): void {
    context.walk(root, (node, ancestors) => {
      if (!(node instanceof context.compiler.AST_ForIn)) return;
      const ownerFunction = nearestOwningFunction(context.compiler, ancestors);
      if (!ownerFunction) return;
      const recognition = recognizeModularSequenceProgram(
        context.compiler,
        node,
        ownerFunction,
      );
      if (!recognition.recognized) return;
      const decision = observationDecision(node, recognition.program);
      verifyModularSequenceReconnaissanceDecision(
        recognition.program,
        decision,
      );
      context.observe({
        minimumLevel: "O2",
        node,
        ownerFunction,
        rejectionReasons: recognition.program.proofGaps,
        decision,
      });
    });
  },
};

export const modularSequenceReconnaissancePlugin: OptimizerPassPlugin =
  Object.freeze({
    id: MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
    domainId: MODULAR_SEQUENCE_RECONNAISSANCE_DOMAIN,
    priority: MODULAR_SEQUENCE_RECONNAISSANCE_PRIORITY,
    claimSemantics: "exclusive",
    loweringIds: Object.freeze([]),
    pass: modularSequenceReconnaissancePass,
  });
