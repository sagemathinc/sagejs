/** Stable identities owned by the non-executable modular-sequence census. */
export const MODULAR_SEQUENCE_RECONNAISSANCE_PASS =
  "math.modular-sequence-reconnaissance.v1";
export const MODULAR_SEQUENCE_RECONNAISSANCE_DOMAIN =
  "modular-sequence-reconnaissance";
export const MODULAR_SEQUENCE_RECONNAISSANCE_VERIFIER =
  "verify.modular-sequence-reconnaissance.v1";
export const MODULAR_SEQUENCE_RECONNAISSANCE_PRIORITY = 140;

export const MODULAR_SEQUENCE_REASONS = Object.freeze({
  callbackEffects: "modular-sequence.callback-effects-unproved",
  elementRepresentation: "modular-sequence.element-representation-unproved",
  inlineSequencePreparation:
    "modular-sequence.inline-sequence-preparation-unproved",
  iteratorSemantics: "modular-sequence.iterator-semantics-unproved",
  lexicalSequenceBinding:
    "modular-sequence.lexical-sequence-binding-unproved",
  machineRange: "modular-sequence.machine-range-unproved",
  nativeBoundary: "modular-sequence.native-boundary-unmeasured",
  operationDispatch: "modular-sequence.operation-dispatch-unproved",
  outerRangeSemantics:
    "modular-sequence.outer-range-semantics-unproved",
  guardHoisting: "modular-sequence.guard-hoisting-unproved",
  earlyExitPublication:
    "modular-sequence.early-exit-publication-unproved",
  powSemantics: "modular-sequence.pow-semantics-unproved",
  stagedSequenceBinding:
    "modular-sequence.staged-sequence-binding-unproved",
  v8Lowering: "modular-sequence.v8-lowering-unimplemented",
  wasmResidency: "modular-sequence.resident-wasm-unproved",
} as const);

export type ModularSequenceCandidateKind =
  | "bounded-modular-fold"
  | "nested-bounded-modular-scan"
  | "transactional-sequence-transform";

export interface BoundedModularFoldProgram {
  version: 1;
  kind: "bounded-modular-fold";
  iteratorKind: "reversed-one-argument";
  initializerStatementIndex: number;
  elementName: string;
  stateName: string;
  multiplierName: string;
  modulusName: string;
  sequencePreparation:
    | "inline-call-must-execute-before-iterator"
    | "staged-call-result-already-evaluated-before-loop"
    | "lexical-sequence-already-evaluated-before-loop";
  operations: readonly ["multiply", "add", "remainder"];
  proofGaps: readonly string[];
}

export interface TransactionalSequenceTransformProgram {
  version: 1;
  kind: "transactional-sequence-transform";
  iteratorKind: "enumerate-one-argument";
  initializerStatementIndex: number;
  indexName: string;
  elementName: string;
  sequenceName: string;
  outputName: string;
  sentinelName: string;
  callbackName: string;
  branchShape: "sentinel-or-callback-append";
  callbackArguments: readonly ["element", "index-plus-one"];
  publication: "return-after-loop";
  operations: readonly ["equal", "append", "callback", "add"];
  proofGaps: readonly string[];
}

export interface NestedBoundedModularScanProgram {
  version: 1;
  kind: "nested-bounded-modular-scan";
  iteratorKind: "range-containing-reversed-fold";
  outerIndexName: string;
  elementName: string;
  sequenceName: string;
  stateName: string;
  modulusName: string;
  zeroBranch:
    | "continue-then-pow-accumulate"
    | "publish-index-and-break";
  operations: readonly string[];
  proofGaps: readonly string[];
}

export type ModularSequenceProgram =
  | BoundedModularFoldProgram
  | NestedBoundedModularScanProgram
  | TransactionalSequenceTransformProgram;

export type ModularSequenceRecognition =
  | { recognized: true; program: ModularSequenceProgram }
  | { recognized: false; reason: string };

export const BOUNDED_MODULAR_FOLD_PROOF_GAPS = Object.freeze([
  MODULAR_SEQUENCE_REASONS.elementRepresentation,
  MODULAR_SEQUENCE_REASONS.iteratorSemantics,
  MODULAR_SEQUENCE_REASONS.machineRange,
  MODULAR_SEQUENCE_REASONS.operationDispatch,
].sort());

export function boundedModularFoldProofGaps(
  preparation: BoundedModularFoldProgram["sequencePreparation"],
): readonly string[] {
  return Object.freeze([
    ...BOUNDED_MODULAR_FOLD_PROOF_GAPS,
    preparation === "inline-call-must-execute-before-iterator"
      ? MODULAR_SEQUENCE_REASONS.inlineSequencePreparation
      : preparation === "staged-call-result-already-evaluated-before-loop"
        ? MODULAR_SEQUENCE_REASONS.stagedSequenceBinding
        : MODULAR_SEQUENCE_REASONS.lexicalSequenceBinding,
  ].sort());
}

export const TRANSACTIONAL_SEQUENCE_TRANSFORM_PROOF_GAPS = Object.freeze([
  MODULAR_SEQUENCE_REASONS.callbackEffects,
  MODULAR_SEQUENCE_REASONS.elementRepresentation,
  MODULAR_SEQUENCE_REASONS.iteratorSemantics,
  MODULAR_SEQUENCE_REASONS.machineRange,
  MODULAR_SEQUENCE_REASONS.operationDispatch,
].sort());

export function nestedBoundedModularScanProofGaps(
  zeroBranch: NestedBoundedModularScanProgram["zeroBranch"],
): readonly string[] {
  return Object.freeze([
    ...boundedModularFoldProofGaps(
      "lexical-sequence-already-evaluated-before-loop",
    ),
    MODULAR_SEQUENCE_REASONS.guardHoisting,
    MODULAR_SEQUENCE_REASONS.outerRangeSemantics,
    zeroBranch === "continue-then-pow-accumulate"
      ? MODULAR_SEQUENCE_REASONS.powSemantics
      : MODULAR_SEQUENCE_REASONS.earlyExitPublication,
  ].sort());
}
