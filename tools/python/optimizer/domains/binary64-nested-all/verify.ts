import { stableRegionIdentity } from "../../identity";
import {
  OPTIMIZER_IR_SCHEMA,
  OptimizationDecision,
} from "../../types";
import { verifyOptimizationDecision } from "../../verifier";
import {
  binary64NestedAllProofGaps,
  BINARY64_NESTED_ALL_REASONS,
  BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
  Binary64NestedAllProgram,
} from "./model";

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Independently authenticate the deliberately non-executable decision. */
export function verifyBinary64NestedAllReconnaissanceDecision(
  program: Binary64NestedAllProgram,
  decision: Omit<
    OptimizationDecision,
    "selected" | "rejectionReasons" | "functionId"
  >,
): void {
  const fail = (): never => {
    throw new TypeError("invalid binary64 nested all reconnaissance decision");
  };
  if (program.version !== 1 || program.kind !== "nested-binary64-all" ||
      program.traversalKind !== "two-clause-generator-under-builtin-all" ||
      !equal(
        program.proofGaps,
        binary64NestedAllProofGaps(program.predicateKind),
      ) ||
      !equal(
        program.pairIndices,
        program.predicateKind === "fixed-pair-isfinite" ? [0, 1] : [],
      ) ||
      decision.schema !== OPTIMIZER_IR_SCHEMA ||
      decision.passId !== BINARY64_NESTED_ALL_RECONNAISSANCE_PASS ||
      decision.target.kind !== "generic" ||
      decision.target.lowering !== "none; reconnaissance only" ||
      decision.target.selectedCandidate !== "generic-nested-all-fallback" ||
      decision.target.candidates.length !== 4 ||
      !equal(decision.guards, ["no-executable-lowering"])) fail();
  const identity = stableRegionIdentity(
    BINARY64_NESTED_ALL_RECONNAISSANCE_PASS,
    decision.source,
    { kind: "binary64-nested-all-reconnaissance", program },
  );
  if (decision.id !== identity.id ||
      !decision.cacheIdentityInputs.includes(
        `semantic-fingerprint:${identity.fingerprint}`,
      )) fail();
  const candidates = decision.target.candidates;
  if (!equal(candidates.map(({ kind, availability }) => [kind, availability]), [
    ["v8", "rejected"],
    ["wasm", "rejected"],
    ["native", "rejected"],
    ["generic", "selected"],
  ]) ||
      candidates[0].rejectionReason !==
        BINARY64_NESTED_ALL_REASONS.v8Lowering ||
      candidates[1].rejectionReason !==
        BINARY64_NESTED_ALL_REASONS.wasmBoundary ||
      candidates[2].rejectionReason !==
        BINARY64_NESTED_ALL_REASONS.nativeBoundary ||
      candidates[3].rejectionReason !== null) fail();
  verifyOptimizationDecision({
    ...decision,
    functionId: null,
    selected: false,
    rejectionReasons: [...program.proofGaps],
  });
}
