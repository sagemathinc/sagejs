import { stableRegionIdentity } from "../../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
} from "../../types";
import { verifyOptimizationDecision } from "../../verifier";
import {
  boundedModularFoldProofGaps,
  MODULAR_SEQUENCE_REASONS,
  MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
  ModularSequenceProgram,
  nestedBoundedModularScanProofGaps,
  TRANSACTIONAL_SEQUENCE_TRANSFORM_PROOF_GAPS,
} from "./model";

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Independently authenticate the deliberately non-executable decision. */
export function verifyModularSequenceReconnaissanceDecision(
  program: ModularSequenceProgram,
  decision: Omit<
    OptimizationDecision,
    "selected" | "rejectionReasons" | "functionId"
  >,
): void {
  const fail = (): never => {
    throw new TypeError("invalid modular sequence reconnaissance decision");
  };
  const expectedProofGaps = program.kind === "bounded-modular-fold"
    ? boundedModularFoldProofGaps(program.sequencePreparation)
    : program.kind === "nested-bounded-modular-scan"
      ? nestedBoundedModularScanProofGaps(program.zeroBranch)
      : TRANSACTIONAL_SEQUENCE_TRANSFORM_PROOF_GAPS;
  if (program.version !== 1 || !equal(program.proofGaps, expectedProofGaps) ||
      decision.schema !== OPTIMIZER_IR_SCHEMA ||
      decision.passId !== MODULAR_SEQUENCE_RECONNAISSANCE_PASS ||
      decision.target.kind !== "generic" ||
      decision.target.lowering !== "none; reconnaissance only" ||
      decision.target.selectedCandidate !== "generic-sequence-fallback" ||
      decision.target.candidates.length !== 4) fail();
  const expectedIdentity = stableRegionIdentity(
    MODULAR_SEQUENCE_RECONNAISSANCE_PASS,
    decision.source,
    { kind: "modular-sequence-reconnaissance", program },
  );
  if (decision.id !== expectedIdentity.id ||
      !decision.cacheIdentityInputs.includes(
        `semantic-fingerprint:${expectedIdentity.fingerprint}`,
      )) fail();
  const candidates = decision.target.candidates;
  if (!equal(candidates.map(({ kind, availability }) => [kind, availability]), [
    ["v8", "rejected"],
    ["wasm", "rejected"],
    ["native", "rejected"],
    ["generic", "selected"],
  ]) ||
      candidates[0].rejectionReason !== MODULAR_SEQUENCE_REASONS.v8Lowering ||
      candidates[1].rejectionReason !== MODULAR_SEQUENCE_REASONS.wasmResidency ||
      candidates[2].rejectionReason !== MODULAR_SEQUENCE_REASONS.nativeBoundary ||
      candidates[3].rejectionReason !== null) fail();
  verifyOptimizationDecision({
    ...decision,
    functionId: null,
    selected: false,
    rejectionReasons: [...program.proofGaps],
  });
}
